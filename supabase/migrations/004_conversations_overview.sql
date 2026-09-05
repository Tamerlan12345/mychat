-- 004: one-shot conversation list for the sidebar.
-- Replaces the client-side 4-queries-per-conversation pattern with a single RPC that
-- returns, for every conversation the caller belongs to: the conversation row, its last
-- message (with sender name/avatar), the caller's unread count and the member count.
-- SECURITY INVOKER keeps RLS in force; the caller is always auth.uid().

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages (conversation_id, created_at DESC);

CREATE OR REPLACE FUNCTION conversations_overview()
RETURNS TABLE (
    conversation  jsonb,
    last_message  jsonb,
    unread_count  integer,
    member_count  integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        to_jsonb(c.*) AS conversation,
        (
            SELECT to_jsonb(m.*)
                   || jsonb_build_object(
                        'sender_name', NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
                        'sender_avatar', p.avatar_url
                      )
            FROM messages m
            LEFT JOIN profiles p ON p.id = m.sender_id
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
        ) AS last_message,
        (
            SELECT COUNT(*)::integer
            FROM messages m
            WHERE m.conversation_id = c.id
              AND m.sender_id <> auth.uid()
              AND m.deleted_at IS NULL
              AND m.created_at > COALESCE(
                    (SELECT lr.created_at FROM messages lr WHERE lr.id = cm.last_read_message_id),
                    'epoch'::timestamptz
                  )
        ) AS unread_count,
        (
            SELECT COUNT(*)::integer FROM conversation_members x WHERE x.conversation_id = c.id
        ) AS member_count
    FROM conversation_members cm
    JOIN conversations c ON c.id = cm.conversation_id
    WHERE cm.user_id = auth.uid()
    ORDER BY COALESCE(
        (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id),
        c.updated_at
    ) DESC;
$$;

GRANT EXECUTE ON FUNCTION conversations_overview() TO authenticated;
