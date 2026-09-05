-- 005: integration_outbox — the event bus between the chat and any external consumer
-- (gateway connectors today; an automation platform tomorrow, by subscribing to the same table).
-- Rows are written by triggers inside the database, leased and completed by the gateway through
-- SECURITY DEFINER functions that only the service role may execute.

CREATE TABLE IF NOT EXISTS integration_outbox (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type      TEXT NOT NULL,
    payload         JSONB NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'leased', 'delivered', 'dead')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    max_attempts    INTEGER NOT NULL DEFAULT 8,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    leased_until    TIMESTAMPTZ,
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_due ON integration_outbox (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_outbox_created ON integration_outbox (created_at DESC);

ALTER TABLE integration_outbox ENABLE ROW LEVEL SECURITY;

-- Administrators may inspect the queue from the admin panel; nobody writes to it through the API.
DROP POLICY IF EXISTS outbox_select_admin ON integration_outbox;
CREATE POLICY outbox_select_admin ON integration_outbox FOR SELECT TO authenticated
    USING (is_admin());

-- ---------------------------------------------------------------------------------------------
-- Producers: database triggers, so every write path (client, gateway, bot) emits the same events.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enqueue_message_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conversation JSONB;
    v_actor        JSONB;
    v_mentions     TEXT[];
BEGIN
    SELECT jsonb_build_object('id', c.id, 'name', c.name, 'type', c.type, 'is_private', c.is_private)
      INTO v_conversation
      FROM conversations c WHERE c.id = NEW.conversation_id;

    SELECT jsonb_build_object('id', p.id, 'name', TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), 'email', p.email)
      INTO v_actor
      FROM profiles p WHERE p.id = NEW.sender_id;

    -- @mentions by first or last name are resolved to member ids for downstream routing.
    SELECT COALESCE(ARRAY_AGG(DISTINCT p.id::text), ARRAY[]::text[])
      INTO v_mentions
      FROM conversation_members cm
      JOIN profiles p ON p.id = cm.user_id
     WHERE cm.conversation_id = NEW.conversation_id
       AND cm.user_id <> NEW.sender_id
       AND (NEW.content ILIKE '%@' || p.first_name || '%' OR NEW.content ILIKE '%@' || p.last_name || '%');

    INSERT INTO integration_outbox (event_type, payload)
    VALUES (
        'message.created',
        jsonb_build_object(
            'v', 1,
            'conversation', v_conversation,
            'actor', v_actor,
            'message', jsonb_build_object(
                'id', NEW.id,
                'text', NEW.content,
                'type', NEW.message_type,
                'reply_to', NEW.reply_to,
                'created_at', NEW.created_at
            ),
            'mentions', to_jsonb(v_mentions)
        )
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_enqueue_event ON messages;
CREATE TRIGGER trg_messages_enqueue_event
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION enqueue_message_event();

CREATE OR REPLACE FUNCTION enqueue_member_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO integration_outbox (event_type, payload)
    VALUES (
        CASE WHEN TG_OP = 'INSERT' THEN 'member.added' ELSE 'member.removed' END,
        jsonb_build_object(
            'v', 1,
            'conversation_id', COALESCE(NEW.conversation_id, OLD.conversation_id),
            'user_id', COALESCE(NEW.user_id, OLD.user_id),
            'role', COALESCE(NEW.role, OLD.role)
        )
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_members_enqueue_event ON conversation_members;
CREATE TRIGGER trg_members_enqueue_event
    AFTER INSERT OR DELETE ON conversation_members
    FOR EACH ROW EXECUTE FUNCTION enqueue_member_event();

-- ---------------------------------------------------------------------------------------------
-- Consumer API (service role only): lease a batch, complete, fail with exponential backoff, retry.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_outbox_batch(p_limit INTEGER DEFAULT 20, p_lease_seconds INTEGER DEFAULT 60)
RETURNS SETOF integration_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    UPDATE integration_outbox o
       SET status = 'leased',
           leased_until = NOW() + make_interval(secs => GREATEST(p_lease_seconds, 5))
     WHERE o.id IN (
            SELECT id FROM integration_outbox
             WHERE (status = 'pending' AND next_attempt_at <= NOW())
                OR (status = 'leased' AND leased_until < NOW())
             ORDER BY created_at
             LIMIT GREATEST(LEAST(p_limit, 200), 1)
             FOR UPDATE SKIP LOCKED
     )
    RETURNING o.*;
END;
$$;

CREATE OR REPLACE FUNCTION complete_outbox(p_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE integration_outbox
       SET status = 'delivered', delivered_at = NOW(), leased_until = NULL, last_error = NULL
     WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION fail_outbox(p_id UUID, p_error TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempts INTEGER;
    v_max      INTEGER;
BEGIN
    UPDATE integration_outbox
       SET attempts = attempts + 1, last_error = LEFT(p_error, 500), leased_until = NULL
     WHERE id = p_id
    RETURNING attempts, max_attempts INTO v_attempts, v_max;

    IF v_attempts IS NULL THEN RETURN; END IF;

    IF v_attempts >= v_max THEN
        UPDATE integration_outbox SET status = 'dead' WHERE id = p_id;
    ELSE
        -- 5s, 10s, 20s, … capped at 10 minutes.
        UPDATE integration_outbox
           SET status = 'pending',
               next_attempt_at = NOW() + make_interval(secs => LEAST(5 * POWER(2, v_attempts - 1), 600))
         WHERE id = p_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION retry_outbox(p_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE integration_outbox
       SET status = 'pending', next_attempt_at = NOW(), leased_until = NULL, attempts = 0
     WHERE id = p_id AND status IN ('dead', 'pending', 'leased');
$$;

CREATE OR REPLACE FUNCTION cleanup_outbox(p_keep_days INTEGER DEFAULT 14)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM integration_outbox
     WHERE (status = 'delivered' AND delivered_at < NOW() - make_interval(days => p_keep_days))
        OR (status = 'dead' AND created_at < NOW() - make_interval(days => p_keep_days * 2));
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_outbox_batch(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION complete_outbox(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fail_outbox(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION retry_outbox(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION cleanup_outbox(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_outbox_batch(INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION complete_outbox(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION fail_outbox(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION retry_outbox(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_outbox(INTEGER) TO service_role;
