-- Corporate Chat — Auth linkage & RLS
-- Migration: 002_auth_and_rls.sql
-- Depends on: 001_initial_schema.sql

-- 1. Link profiles to Supabase Auth users, and auto-create a profile on signup.
ALTER TABLE profiles
    ADD CONSTRAINT fk_profiles_auth_user FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email, first_name, last_name, role, status)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'first_name', 'Сотрудник'),
        COALESCE(NEW.raw_user_meta_data->>'last_name', 'Новый'),
        COALESCE(NEW.raw_user_meta_data->>'role', 'EMPLOYEE'),
        'OFFLINE'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- 2. Enable RLS on every table that holds tenant data.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE branding_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_accounts ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user an ADMIN or SUPER_ADMIN?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN')
    );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp STABLE;

-- Helper: is the current user a member of the given conversation?
CREATE OR REPLACE FUNCTION is_conversation_member(conv_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM conversation_members WHERE conversation_id = conv_id AND user_id = auth.uid()
    );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp STABLE;

-- Prevent non-admins from escalating their own role or changing their own status inappropriately,
-- and prevent non-admins from changing another user's status.
CREATE OR REPLACE FUNCTION prevent_profile_privilege_escalation()
RETURNS TRIGGER AS $$
BEGIN
    -- Non-admins cannot change role fields (escalation protection)
    IF NEW.role IS DISTINCT FROM OLD.role AND NOT is_admin() THEN
        RAISE EXCEPTION 'Only admins can change role';
    END IF;
    -- Non-admins cannot change another user's status
    IF NEW.status IS DISTINCT FROM OLD.status AND auth.uid() != NEW.id AND NOT is_admin() THEN
        RAISE EXCEPTION 'Cannot change another user''s status';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER on_profiles_update
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION prevent_profile_privilege_escalation();

-- Helper: does the conversation have zero members (used for bootstrap check)?
-- SECURITY DEFINER to bypass RLS so bootstrap count check sees true state.
CREATE OR REPLACE FUNCTION conversation_has_no_members(conv_id UUID)
RETURNS BOOLEAN AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM conversation_members WHERE conversation_id = conv_id
    );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp STABLE;

-- Prevent non-admins from changing conversation ownership (created_by).
CREATE OR REPLACE FUNCTION prevent_conversation_created_by_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Non-admins cannot change created_by
    IF NEW.created_by IS DISTINCT FROM OLD.created_by AND NOT is_admin() THEN
        RAISE EXCEPTION 'Only admins can change conversation ownership';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER on_conversations_update
    BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION prevent_conversation_created_by_change();

-- Insert audit log via SECURITY DEFINER to bypass RLS.
CREATE OR REPLACE FUNCTION insert_audit_log(
    p_user_id UUID,
    p_user_email VARCHAR,
    p_action VARCHAR,
    p_target_type VARCHAR,
    p_target_id VARCHAR,
    p_metadata JSONB,
    p_ip VARCHAR
)
RETURNS audit_logs AS $$
DECLARE
    result audit_logs;
BEGIN
    INSERT INTO audit_logs (user_id, user_email, action, target_type, target_id, metadata, ip)
    VALUES (p_user_id, p_user_email, p_action, p_target_type, p_target_id, p_metadata, p_ip)
    RETURNING * INTO result;
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Policies.

-- profiles: company directory is readable by any authenticated user; only the
-- owner or an admin can update; only an admin can delete or insert directly
-- (normal signup goes through the trigger above, which runs as SECURITY DEFINER).
CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update ON profiles FOR UPDATE TO authenticated
    USING (id = auth.uid() OR is_admin());
CREATE POLICY profiles_admin_insert ON profiles FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY profiles_admin_delete ON profiles FOR DELETE TO authenticated USING (is_admin());

-- departments: readable by all, writable only by admins.
CREATE POLICY departments_select ON departments FOR SELECT TO authenticated USING (true);
CREATE POLICY departments_admin_write ON departments FOR ALL TO authenticated
    USING (is_admin()) WITH CHECK (is_admin());

-- conversations: visible/editable only to members (or an admin).
-- Also allow the creator to see their own conversation (bootstrap).
CREATE POLICY conversations_member_select ON conversations FOR SELECT TO authenticated
    USING (is_conversation_member(id) OR is_admin() OR created_by = auth.uid());
CREATE POLICY conversations_authenticated_insert ON conversations FOR INSERT TO authenticated
    WITH CHECK (created_by = auth.uid());
CREATE POLICY conversations_member_update ON conversations FOR UPDATE TO authenticated
    USING (is_conversation_member(id) OR is_admin())
    WITH CHECK (is_conversation_member(id) OR is_admin());

-- conversation_members: visible to other members of the same conversation.
-- Also allow the conversation creator to add themselves as the first member (bootstrap).
CREATE POLICY members_select ON conversation_members FOR SELECT TO authenticated
    USING (is_conversation_member(conversation_id) OR is_admin());
CREATE POLICY members_insert ON conversation_members FOR INSERT TO authenticated
    WITH CHECK (
        is_conversation_member(conversation_id) OR is_admin() OR
        (
            user_id = auth.uid() AND
            EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid()) AND
            conversation_has_no_members(conversation_id)
        )
    );
CREATE POLICY members_delete ON conversation_members FOR DELETE TO authenticated
    USING (user_id = auth.uid() OR is_admin());

-- messages: only conversation members can read/write.
CREATE POLICY messages_select ON messages FOR SELECT TO authenticated
    USING (is_conversation_member(conversation_id));
CREATE POLICY messages_insert ON messages FOR INSERT TO authenticated
    WITH CHECK (is_conversation_member(conversation_id) AND sender_id = auth.uid());
CREATE POLICY messages_update_own ON messages FOR UPDATE TO authenticated
    USING (sender_id = auth.uid())
    WITH CHECK (sender_id = auth.uid() AND is_conversation_member(conversation_id));

-- message_reactions: only conversation members, scoped via the parent message.
CREATE POLICY reactions_select ON message_reactions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND is_conversation_member(m.conversation_id)));
CREATE POLICY reactions_insert ON message_reactions FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND EXISTS (
        SELECT 1 FROM messages m WHERE m.id = message_id AND is_conversation_member(m.conversation_id)
    ));
CREATE POLICY reactions_delete_own ON message_reactions FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- attachments: scoped via the parent message's conversation.
CREATE POLICY attachments_select ON attachments FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND is_conversation_member(m.conversation_id)));
CREATE POLICY attachments_insert ON attachments FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND is_conversation_member(m.conversation_id)));

-- user_settings: owner only.
CREATE POLICY settings_owner ON user_settings FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- branding_config: readable by all authenticated users, writable only by admins.
CREATE POLICY branding_select ON branding_config FOR SELECT TO authenticated USING (true);
CREATE POLICY branding_admin_write ON branding_config FOR UPDATE TO authenticated
    USING (is_admin()) WITH CHECK (is_admin());

-- audit_logs: admin-only read; inserts happen via SECURITY DEFINER from app code
-- using the service role, so no INSERT policy is granted to `authenticated`.
CREATE POLICY audit_admin_select ON audit_logs FOR SELECT TO authenticated USING (is_admin());

-- telegram_accounts: owner only.
CREATE POLICY telegram_owner ON telegram_accounts FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 4. Storage bucket for attachments (used starting with the File Storage plan,
-- created now so the setup guide only needs one migration for auth+storage).
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY attachments_bucket_read ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'attachments'
        AND is_conversation_member((storage.foldername(name))[1]::uuid)
    );
CREATE POLICY attachments_bucket_write ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'attachments'
        AND is_conversation_member((storage.foldername(name))[1]::uuid)
    );
