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
    telegram_relay_log, telegram_notification_outbox FROM anon, authenticated;
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
-- The most recent direct conversation that has relay activity is the target.
CREATE OR REPLACE FUNCTION ingest_telegram_inbound(
    p_telegram_user_id BIGINT,
    p_telegram_chat_id BIGINT,
    p_telegram_message_id BIGINT,
    p_content TEXT
)
RETURNS messages AS $$
DECLARE
    identity_profile UUID;
    target_conversation UUID;
    existing_message_id UUID;
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

    SELECT centras_message_id INTO existing_message_id
    FROM telegram_relay_log
    WHERE telegram_chat_id = p_telegram_chat_id
      AND telegram_message_id = p_telegram_message_id
      AND direction = 'inbound';

    IF existing_message_id IS NOT NULL THEN
        SELECT * INTO inserted_message FROM messages WHERE id = existing_message_id;
        RETURN inserted_message;
    END IF;

    SELECT c.id INTO target_conversation
    FROM conversations c
    JOIN conversation_members cm
      ON cm.conversation_id = c.id
     AND cm.user_id = identity_profile
    WHERE c.type = 'DIRECT'
      AND EXISTS (
          SELECT 1
          FROM telegram_relay_log rl
          WHERE rl.profile_id = identity_profile
            AND rl.conversation_id = c.id
      )
    ORDER BY c.updated_at DESC
    LIMIT 1;

    IF target_conversation IS NULL THEN
        RAISE EXCEPTION 'No relayed direct conversation found';
    END IF;

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
BEGIN
    PERFORM telegram_service_role_only();

    RETURN QUERY
    WITH candidates AS (
        SELECT id
        FROM telegram_notification_outbox
        WHERE attempts < max_attempts
          AND next_attempt_at <= NOW()
          AND (
              status = 'pending'
              OR (status = 'leased' AND leased_until < NOW())
          )
        ORDER BY created_at
        LIMIT LEAST(GREATEST(p_limit, 1), 100)
        FOR UPDATE SKIP LOCKED
    )
    UPDATE telegram_notification_outbox o
    SET status = 'leased',
        attempts = o.attempts + 1,
        lease_token = uuid_generate_v4(),
        leased_until = NOW() + make_interval(secs => LEAST(GREATEST(p_lease_seconds, 1), 3600)),
        updated_at = NOW()
    FROM candidates
    WHERE o.id = candidates.id
    RETURNING o.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION complete_telegram_outbox(
    p_id UUID,
    p_lease_token UUID,
    p_telegram_message_id BIGINT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    completed_id UUID;
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
    RETURNING id INTO completed_id;

    RETURN completed_id IS NOT NULL;
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
REVOKE ALL ON FUNCTION ingest_telegram_inbound(BIGINT, BIGINT, BIGINT, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION lease_telegram_outbox(INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_telegram_outbox(UUID, UUID, BIGINT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fail_telegram_outbox(UUID, UUID, TEXT, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION claim_telegram_link_token(TEXT, BIGINT, BIGINT, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION ingest_telegram_inbound(BIGINT, BIGINT, BIGINT, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION lease_telegram_outbox(INTEGER, INTEGER)
    TO service_role;
GRANT EXECUTE ON FUNCTION complete_telegram_outbox(UUID, UUID, BIGINT)
    TO service_role;
GRANT EXECUTE ON FUNCTION fail_telegram_outbox(UUID, UUID, TEXT, TIMESTAMPTZ)
    TO service_role;
