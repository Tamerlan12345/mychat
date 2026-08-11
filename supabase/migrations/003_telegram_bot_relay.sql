-- Telegram Bot relay tables and service-role-only database operations.
-- Depends on: 001_initial_schema.sql and 002_auth_and_rls.sql

-- The raw link token is never stored. Only its 64-character SHA-256 digest is.
CREATE TABLE telegram_link_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_telegram_link_tokens_owner
    ON telegram_link_tokens(owner_profile_id, created_at DESC);
CREATE INDEX idx_telegram_link_tokens_claimable
    ON telegram_link_tokens(token_hash, expires_at)
    WHERE used_at IS NULL;

CREATE TABLE telegram_identities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
    telegram_user_id BIGINT NOT NULL UNIQUE CHECK (telegram_user_id > 0),
    telegram_chat_id BIGINT NOT NULL UNIQUE CHECK (telegram_chat_id > 0),
    username VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disconnected')),
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_telegram_identities_user
    ON telegram_identities(telegram_user_id, status);

CREATE TABLE telegram_relay_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    centras_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    telegram_user_id BIGINT NOT NULL CHECK (telegram_user_id > 0),
    telegram_chat_id BIGINT NOT NULL CHECK (telegram_chat_id > 0),
    telegram_message_id BIGINT NOT NULL CHECK (telegram_message_id > 0),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (telegram_chat_id, telegram_message_id, direction)
);

CREATE INDEX idx_telegram_relay_log_owner
    ON telegram_relay_log(profile_id, created_at DESC);
CREATE INDEX idx_telegram_relay_log_conversation
    ON telegram_relay_log(conversation_id, created_at DESC);

CREATE TABLE telegram_notification_outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    telegram_user_id BIGINT NOT NULL CHECK (telegram_user_id > 0),
    idempotency_key TEXT NOT NULL UNIQUE,
    telegram_chat_id BIGINT NOT NULL CHECK (telegram_chat_id > 0),
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    status VARCHAR(10) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'leased', 'sent', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
    max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 5),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lease_token UUID,
    leased_until TIMESTAMPTZ,
    telegram_message_id BIGINT CHECK (telegram_message_id > 0),
    last_error_code VARCHAR(64),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_telegram_outbox_pending
    ON telegram_notification_outbox(status, next_attempt_at, created_at)
    WHERE status IN ('pending', 'leased');
CREATE INDEX idx_telegram_outbox_owner
    ON telegram_notification_outbox(profile_id, created_at DESC);

-- Enqueue outbound notifications in the same transaction as the message. The
-- trigger derives the recipient and all eligibility fields from database state,
-- so a browser cannot choose a Telegram destination or forge an outbox row.
CREATE OR REPLACE FUNCTION enqueue_telegram_notification()
RETURNS TRIGGER AS $$
DECLARE
    recipient RECORD;
    sender_display_name TEXT;
    notification_text TEXT;
BEGIN
    IF NEW.message_type NOT IN ('TEXT', 'FILE', 'IMAGE') THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Centras Chat')
    INTO sender_display_name
    FROM profiles p
    WHERE p.id = NEW.sender_id;

    notification_text := left(format('%s: %s', sender_display_name, NEW.content), 4096);

    FOR recipient IN
        SELECT cm.user_id AS profile_id, ti.telegram_user_id, ti.telegram_chat_id
        FROM conversations c
        JOIN conversation_members cm ON cm.conversation_id = c.id
        JOIN profiles p ON p.id = cm.user_id
        JOIN telegram_identities ti
          ON ti.profile_id = cm.user_id
         AND ti.status = 'active'
        JOIN user_settings us ON us.user_id = cm.user_id
        WHERE c.id = NEW.conversation_id
          AND c.type = 'DIRECT'
          AND cm.user_id IS DISTINCT FROM NEW.sender_id
          AND p.status IN ('OFFLINE', 'AWAY')
          AND us.telegram_enabled = TRUE
    LOOP
        INSERT INTO telegram_notification_outbox (
            profile_id, telegram_user_id, idempotency_key, telegram_chat_id, payload
        )
        VALUES (
            recipient.profile_id,
            recipient.telegram_user_id,
            NEW.id::TEXT || ':' || recipient.profile_id::TEXT,
            recipient.telegram_chat_id,
            jsonb_build_object(
                'message_id', NEW.id,
                'conversation_id', NEW.conversation_id,
                'reference', NEW.conversation_id::TEXT,
                'text', notification_text
            )
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS enqueue_telegram_notification_after_insert ON messages;
CREATE TRIGGER enqueue_telegram_notification_after_insert
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION enqueue_telegram_notification();

-- Disable queued deliveries in the same transaction as identity/settings changes.
-- The worker also revalidates immediately before the external send for rows that
-- were already leased when the change occurred.
CREATE OR REPLACE FUNCTION cancel_telegram_outbox_on_identity_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'disconnected' AND OLD.status IS DISTINCT FROM NEW.status THEN
        UPDATE telegram_notification_outbox
        SET status = 'failed',
            last_error_code = 'DELIVERY_DISABLED',
            lease_token = NULL,
            leased_until = NULL,
            updated_at = NOW()
        WHERE profile_id = NEW.profile_id
          AND status IN ('pending', 'leased');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS cancel_telegram_outbox_after_identity_update ON telegram_identities;
CREATE TRIGGER cancel_telegram_outbox_after_identity_update
    AFTER UPDATE OF status ON telegram_identities
    FOR EACH ROW EXECUTE FUNCTION cancel_telegram_outbox_on_identity_change();

CREATE OR REPLACE FUNCTION cancel_telegram_outbox_on_settings_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.telegram_enabled = FALSE AND OLD.telegram_enabled IS DISTINCT FROM NEW.telegram_enabled THEN
        UPDATE telegram_notification_outbox
        SET status = 'failed',
            last_error_code = 'DELIVERY_DISABLED',
            lease_token = NULL,
            leased_until = NULL,
            updated_at = NOW()
        WHERE profile_id = NEW.user_id
          AND status IN ('pending', 'leased');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS cancel_telegram_outbox_after_settings_update ON user_settings;
CREATE TRIGGER cancel_telegram_outbox_after_settings_update
    AFTER UPDATE OF telegram_enabled ON user_settings
    FOR EACH ROW EXECUTE FUNCTION cancel_telegram_outbox_on_settings_change();

ALTER TABLE telegram_link_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_relay_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_notification_outbox ENABLE ROW LEVEL SECURITY;

-- Users can inspect their linked identity and relay activity, but not raw queue
-- payloads or token digests. No client role receives mutation privileges.
CREATE POLICY telegram_identities_owner_read ON telegram_identities
    FOR SELECT TO authenticated
    USING (profile_id = auth.uid());

CREATE POLICY telegram_relay_log_owner_read ON telegram_relay_log
    FOR SELECT TO authenticated
    USING (profile_id = auth.uid());

REVOKE ALL ON telegram_link_tokens, telegram_identities,
    telegram_relay_log, telegram_notification_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT ON telegram_identities, telegram_relay_log TO authenticated;
GRANT ALL ON telegram_link_tokens, telegram_identities,
    telegram_relay_log, telegram_notification_outbox TO service_role;

CREATE OR REPLACE FUNCTION telegram_service_role_only()
RETURNS VOID AS $$
BEGIN
    IF COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Telegram relay operation requires service role';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION telegram_service_role_only() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION telegram_service_role_only() TO service_role;

REVOKE ALL ON FUNCTION enqueue_telegram_notification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cancel_telegram_outbox_on_identity_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cancel_telegram_outbox_on_settings_change() FROM PUBLIC, anon, authenticated;

-- Atomically consume a token and assign its Telegram identity to its owner.
CREATE OR REPLACE FUNCTION claim_telegram_link_token(
    p_token_hash TEXT,
    p_telegram_user_id BIGINT,
    p_telegram_chat_id BIGINT,
    p_username TEXT DEFAULT NULL
)
RETURNS TABLE (
    identity_id UUID,
    profile_id UUID,
    telegram_user_id BIGINT,
    telegram_chat_id BIGINT,
    username TEXT,
    status TEXT
) AS $$
DECLARE
    token_owner UUID;
    existing_identity_id UUID;
    existing_identity_profile UUID;
BEGIN
    PERFORM telegram_service_role_only();
    PERFORM pg_advisory_xact_lock(p_telegram_user_id);

    SELECT owner_profile_id INTO token_owner
    FROM telegram_link_tokens
    WHERE token_hash = p_token_hash
      AND used_at IS NULL
      AND expires_at > NOW()
    FOR UPDATE;

    IF token_owner IS NULL THEN
        RETURN;
    END IF;

    SELECT id, telegram_identities.profile_id
    INTO existing_identity_id, existing_identity_profile
    FROM telegram_identities
    WHERE telegram_identities.telegram_user_id = p_telegram_user_id
    FOR UPDATE;

    IF existing_identity_id IS NOT NULL AND existing_identity_profile <> token_owner THEN
        RAISE EXCEPTION 'Telegram identity is already linked';
    END IF;

    SELECT id INTO existing_identity_id
    FROM telegram_identities
    WHERE telegram_identities.profile_id = token_owner
    FOR UPDATE;

    IF existing_identity_id IS NOT NULL THEN
        UPDATE telegram_identities
        SET telegram_user_id = p_telegram_user_id,
            telegram_chat_id = p_telegram_chat_id,
            username = p_username,
            status = 'active',
            linked_at = NOW(),
            disconnected_at = NULL,
            updated_at = NOW()
        WHERE id = existing_identity_id;
    ELSE
        INSERT INTO telegram_identities (
            profile_id, telegram_user_id, telegram_chat_id, username
        )
        VALUES (token_owner, p_telegram_user_id, p_telegram_chat_id, p_username)
        RETURNING id INTO existing_identity_id;
    END IF;

    UPDATE telegram_link_tokens
    SET used_at = NOW()
    WHERE token_hash = p_token_hash;

    RETURN QUERY
    SELECT ti.id, ti.profile_id, ti.telegram_user_id, ti.telegram_chat_id,
           ti.username::TEXT, ti.status::TEXT
    FROM telegram_identities ti
    WHERE ti.id = existing_identity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Insert one normal Centras message and its inbound relay log atomically.
-- Inbound routing is only allowed through a reply-to outbound message or a
-- single unambiguous outbound conversation correlation for this Telegram chat.
CREATE OR REPLACE FUNCTION ingest_telegram_inbound(
    p_telegram_user_id BIGINT,
    p_telegram_chat_id BIGINT,
    p_telegram_message_id BIGINT,
    p_content TEXT,
    p_reply_to_telegram_message_id BIGINT DEFAULT NULL
)
RETURNS messages AS $$
DECLARE
    identity_profile UUID;
    target_conversation UUID;
    matching_conversations INTEGER;
    inserted_message messages;
BEGIN
    PERFORM telegram_service_role_only();
    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_telegram_chat_id::TEXT || ':' || p_telegram_message_id::TEXT, 0)
    );

    SELECT profile_id INTO identity_profile
    FROM telegram_identities
    WHERE telegram_user_id = p_telegram_user_id
      AND telegram_chat_id = p_telegram_chat_id
      AND status = 'active';

    IF identity_profile IS NULL THEN
        RAISE EXCEPTION 'Telegram identity is not linked';
    END IF;

    -- The relay-log uniqueness key is the idempotency source. The message FK is
    -- nullable because deleting a message intentionally sets it to NULL.
    IF EXISTS (
        SELECT 1
        FROM telegram_relay_log
        WHERE telegram_chat_id = p_telegram_chat_id
          AND telegram_message_id = p_telegram_message_id
          AND direction = 'inbound'
    ) THEN
        SELECT m.* INTO inserted_message
        FROM messages m
        JOIN telegram_relay_log rl ON rl.centras_message_id = m.id
        WHERE rl.telegram_chat_id = p_telegram_chat_id
          AND rl.telegram_message_id = p_telegram_message_id
          AND rl.direction = 'inbound'
        LIMIT 1;
        RETURN inserted_message;
    END IF;

    SELECT COUNT(*)::INTEGER INTO matching_conversations
    FROM (
        SELECT rl.conversation_id
        FROM telegram_relay_log rl
        JOIN conversations c ON c.id = rl.conversation_id
        JOIN conversation_members cm
          ON cm.conversation_id = c.id
         AND cm.user_id = identity_profile
        WHERE rl.profile_id = identity_profile
          AND rl.telegram_user_id = p_telegram_user_id
          AND rl.telegram_chat_id = p_telegram_chat_id
          AND rl.direction = 'outbound'
          AND (
              p_reply_to_telegram_message_id IS NULL
              OR rl.telegram_message_id = p_reply_to_telegram_message_id
          )
          AND c.type = 'DIRECT'
        GROUP BY rl.conversation_id
    ) correlated;

    IF matching_conversations <> 1 THEN
        RAISE EXCEPTION 'No safe correlated direct conversation found';
    END IF;

    SELECT rl.conversation_id INTO target_conversation
    FROM telegram_relay_log rl
    JOIN conversations c ON c.id = rl.conversation_id
    JOIN conversation_members cm
      ON cm.conversation_id = c.id
     AND cm.user_id = identity_profile
    WHERE rl.profile_id = identity_profile
      AND rl.telegram_user_id = p_telegram_user_id
      AND rl.telegram_chat_id = p_telegram_chat_id
      AND rl.direction = 'outbound'
      AND (
          p_reply_to_telegram_message_id IS NULL
          OR rl.telegram_message_id = p_reply_to_telegram_message_id
      )
      AND c.type = 'DIRECT'
    ORDER BY rl.created_at DESC
    LIMIT 1;

    INSERT INTO messages (conversation_id, sender_id, content, message_type)
    VALUES (target_conversation, identity_profile, p_content, 'TEXT')
    RETURNING * INTO inserted_message;

    INSERT INTO telegram_relay_log (
        profile_id, conversation_id, centras_message_id,
        telegram_user_id, telegram_chat_id, telegram_message_id, direction
    )
    VALUES (
        identity_profile, target_conversation, inserted_message.id,
        p_telegram_user_id, p_telegram_chat_id, p_telegram_message_id, 'inbound'
    );

    UPDATE conversations SET updated_at = NOW() WHERE id = target_conversation;
    RETURN inserted_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Lease a bounded batch. SKIP LOCKED prevents two workers from taking a row.
CREATE OR REPLACE FUNCTION lease_telegram_outbox(
    p_limit INTEGER DEFAULT 10,
    p_lease_seconds INTEGER DEFAULT 60
)
RETURNS SETOF telegram_notification_outbox AS $$
DECLARE
    lease_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
    lease_seconds INTEGER := LEAST(GREATEST(COALESCE(p_lease_seconds, 60), 1), 3600);
BEGIN
    PERFORM telegram_service_role_only();

    -- A worker may have accepted a Telegram send and then lost the completion
    -- response. Once the expired lease has consumed the final attempt, leave a
    -- terminal record instead of an indefinitely stranded leased row.
    UPDATE telegram_notification_outbox
    SET status = 'failed',
        last_error_code = 'MAX_ATTEMPTS_EXCEEDED',
        lease_token = NULL,
        leased_until = NULL,
        updated_at = NOW()
    WHERE attempts >= max_attempts
      AND (
          status = 'pending'
          OR (status = 'leased' AND (leased_until IS NULL OR leased_until < NOW()))
      );

    RETURN QUERY
    WITH candidates AS (
        SELECT o.id
        FROM telegram_notification_outbox o
        JOIN telegram_identities ti
          ON ti.profile_id = o.profile_id
         AND ti.telegram_user_id = o.telegram_user_id
         AND ti.telegram_chat_id = o.telegram_chat_id
         AND ti.status = 'active'
        JOIN profiles p ON p.id = o.profile_id
        JOIN user_settings us ON us.user_id = o.profile_id
        WHERE o.attempts < o.max_attempts
          AND o.next_attempt_at <= NOW()
          AND p.status IN ('OFFLINE', 'AWAY')
          AND us.telegram_enabled = TRUE
          AND (
              o.status = 'pending'
              OR (o.status = 'leased' AND (o.leased_until IS NULL OR o.leased_until < NOW()))
          )
        ORDER BY o.created_at
        LIMIT lease_limit
        FOR UPDATE SKIP LOCKED
    )
    UPDATE telegram_notification_outbox o
    SET status = 'leased',
        attempts = o.attempts + 1,
        lease_token = uuid_generate_v4(),
        leased_until = NOW() + make_interval(secs => lease_seconds),
        updated_at = NOW()
    FROM candidates
    WHERE o.id = candidates.id
    RETURNING o.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Recheck all delivery gates after a row is leased and immediately before the
-- worker calls Telegram. This closes the pending/leased settings race.
CREATE OR REPLACE FUNCTION can_send_telegram_outbox(
    p_id UUID,
    p_lease_token UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    PERFORM telegram_service_role_only();

    RETURN EXISTS (
        SELECT 1
        FROM telegram_notification_outbox o
        JOIN telegram_identities ti
          ON ti.profile_id = o.profile_id
         AND ti.telegram_user_id = o.telegram_user_id
         AND ti.telegram_chat_id = o.telegram_chat_id
         AND ti.status = 'active'
        JOIN profiles p ON p.id = o.profile_id
        JOIN user_settings us ON us.user_id = o.profile_id
        WHERE o.id = p_id
          AND o.lease_token = p_lease_token
          AND o.status = 'leased'
          AND o.leased_until > NOW()
          AND p.status IN ('OFFLINE', 'AWAY')
          AND us.telegram_enabled = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION complete_telegram_outbox(
    p_id UUID,
    p_lease_token UUID,
    p_telegram_message_id BIGINT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    completed_outbox telegram_notification_outbox;
    centras_message UUID;
    target_conversation UUID;
BEGIN
    PERFORM telegram_service_role_only();

    UPDATE telegram_notification_outbox
    SET status = 'sent',
        telegram_message_id = p_telegram_message_id,
        sent_at = NOW(),
        lease_token = NULL,
        leased_until = NULL,
        updated_at = NOW()
    WHERE id = p_id
      AND status = 'leased'
      AND lease_token = p_lease_token
      AND p_telegram_message_id IS NOT NULL
    RETURNING * INTO completed_outbox;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    BEGIN
        centras_message := (completed_outbox.payload ->> 'message_id')::UUID;
        target_conversation := (completed_outbox.payload ->> 'conversation_id')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Outbox payload correlation is invalid';
    END;

    IF centras_message IS NULL OR target_conversation IS NULL THEN
        RAISE EXCEPTION 'Outbox payload correlation is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM conversations c
        JOIN conversation_members cm ON cm.conversation_id = c.id
        WHERE c.id = target_conversation
          AND c.type = 'DIRECT'
          AND cm.user_id = completed_outbox.profile_id
    ) THEN
        RAISE EXCEPTION 'Outbox payload conversation is invalid';
    END IF;

    INSERT INTO telegram_relay_log (
        profile_id, conversation_id, centras_message_id,
        telegram_user_id, telegram_chat_id, telegram_message_id, direction
    )
    VALUES (
        completed_outbox.profile_id, target_conversation, centras_message,
        completed_outbox.telegram_user_id, completed_outbox.telegram_chat_id,
        p_telegram_message_id, 'outbound'
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION fail_telegram_outbox(
    p_id UUID,
    p_lease_token UUID,
    p_error_code TEXT,
    p_retry_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    failed_id UUID;
BEGIN
    PERFORM telegram_service_role_only();

    IF p_error_code IS NULL OR length(p_error_code) = 0 THEN
        RAISE EXCEPTION 'A safe Telegram error code is required';
    END IF;

    UPDATE telegram_notification_outbox
    SET status = CASE
            WHEN attempts < max_attempts AND p_retry_at IS NOT NULL THEN 'pending'
            ELSE 'failed'
        END,
        next_attempt_at = COALESCE(p_retry_at, next_attempt_at),
        last_error_code = left(p_error_code, 64),
        lease_token = NULL,
        leased_until = NULL,
        updated_at = NOW()
    WHERE id = p_id
      AND status = 'leased'
      AND lease_token = p_lease_token
    RETURNING id INTO failed_id;

    RETURN failed_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- SECURITY DEFINER does not make these RPCs publicly callable: only the
-- service-role database role receives EXECUTE, and each function also checks
-- the Supabase JWT role at runtime.
REVOKE ALL ON FUNCTION claim_telegram_link_token(TEXT, BIGINT, BIGINT, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ingest_telegram_inbound(BIGINT, BIGINT, BIGINT, TEXT, BIGINT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION lease_telegram_outbox(INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION can_send_telegram_outbox(UUID, UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_telegram_outbox(UUID, UUID, BIGINT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fail_telegram_outbox(UUID, UUID, TEXT, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION claim_telegram_link_token(TEXT, BIGINT, BIGINT, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION ingest_telegram_inbound(BIGINT, BIGINT, BIGINT, TEXT, BIGINT)
    TO service_role;
GRANT EXECUTE ON FUNCTION lease_telegram_outbox(INTEGER, INTEGER)
    TO service_role;
GRANT EXECUTE ON FUNCTION can_send_telegram_outbox(UUID, UUID)
    TO service_role;
GRANT EXECUTE ON FUNCTION complete_telegram_outbox(UUID, UUID, BIGINT)
    TO service_role;
GRANT EXECUTE ON FUNCTION fail_telegram_outbox(UUID, UUID, TEXT, TIMESTAMPTZ)
    TO service_role;
