-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "is_pinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "idx_conversations_user_pin_updated" ON "conversations"("user_id", "is_pinned", "updated_at" DESC);
