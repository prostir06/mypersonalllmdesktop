ALTER TABLE "conversations" ADD COLUMN "messages_since_summary" INTEGER NOT NULL DEFAULT 0;

UPDATE "conversations" AS c
SET "messages_since_summary" = (
  SELECT COUNT(*)::int
  FROM "messages" AS m
  WHERE m."conversation_id" = c."id"
    AND (
      c."summary_updated_at" IS NULL
      OR m."created_at" > c."summary_updated_at"
    )
);
