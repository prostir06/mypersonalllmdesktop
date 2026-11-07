CREATE INDEX "idx_refresh_tokens_expires_at" ON "refresh_tokens"("expires_at");

CREATE INDEX "idx_pending_tool_actions_expires_at" ON "pending_tool_actions"("expires_at");
