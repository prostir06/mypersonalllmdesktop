-- RAG metadata: failure reason, staging file for retry, embedding count
ALTER TABLE "documents" ADD COLUMN "failure_reason" VARCHAR(500);
ALTER TABLE "documents" ADD COLUMN "staging_path" VARCHAR(512);
ALTER TABLE "documents" ADD COLUMN "embeddings_count" INTEGER NOT NULL DEFAULT 0;
