ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "tools_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "tool_trace" JSONB;

CREATE TABLE IF NOT EXISTS "pending_tool_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" INTEGER NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "message_id" INTEGER NOT NULL,
    "tool_name" VARCHAR(100) NOT NULL,
    "tool_args" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "result_summary" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    CONSTRAINT "pending_tool_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pending_tool_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pending_tool_actions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pending_tool_actions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "pending_tool_actions_user_id_status_idx" ON "pending_tool_actions"("user_id", "status");
CREATE INDEX IF NOT EXISTS "pending_tool_actions_conversation_id_idx" ON "pending_tool_actions"("conversation_id");
