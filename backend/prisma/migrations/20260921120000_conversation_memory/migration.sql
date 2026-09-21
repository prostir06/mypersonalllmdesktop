ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "summary" TEXT;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "summary_updated_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "conversation_memory_notes" (
  "id" SERIAL PRIMARY KEY,
  "conversation_id" INTEGER NOT NULL,
  "content" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_memory_notes_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_memory_notes_conversation_id"
  ON "conversation_memory_notes"("conversation_id");
