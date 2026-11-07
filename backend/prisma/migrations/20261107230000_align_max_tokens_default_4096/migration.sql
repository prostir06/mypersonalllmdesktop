-- Align max_tokens column defaults with application default (4096)
ALTER TABLE "user_settings" ALTER COLUMN "max_tokens" SET DEFAULT 4096;
ALTER TABLE "llm_models" ALTER COLUMN "max_tokens" SET DEFAULT 4096;
