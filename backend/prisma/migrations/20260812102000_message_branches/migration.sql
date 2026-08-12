-- AlterTable
ALTER TABLE "messages" ADD COLUMN "parent_id" INTEGER;

-- CreateIndex
CREATE INDEX "idx_messages_parent_id" ON "messages"("parent_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
