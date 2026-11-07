-- Leftmost prefixes of the composite indexes already cover these lookups.
DROP INDEX IF EXISTS "idx_conversations_user_id";
DROP INDEX IF EXISTS "idx_messages_conversation_id";
