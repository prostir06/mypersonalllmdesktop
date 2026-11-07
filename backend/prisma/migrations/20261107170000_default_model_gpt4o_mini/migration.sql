ALTER TABLE "user_settings" ALTER COLUMN "default_model" SET DEFAULT 'gpt-4o-mini';

UPDATE "llm_models"
SET "is_default" = false
WHERE "user_id" IS NULL
  AND "model_id" IN (
    'gpt-3.5-turbo',
    'gpt-4',
    'gpt-4-turbo-preview',
    'llama2',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022'
  );

INSERT INTO "llm_models" ("name", "model_id", "description", "provider", "is_default", "max_tokens")
SELECT v.name, v.model_id, v.description, v.provider, true, v.max_tokens
FROM (
  VALUES
    ('GPT-4o mini', 'gpt-4o-mini', 'Fast and inexpensive model', 'openai', 4096),
    ('GPT-4o', 'gpt-4o', 'Capable general model', 'openai', 4096),
    ('GPT-4.1', 'gpt-4.1', 'Newer general model', 'openai', 4096),
    ('Llama 3.2', 'llama3.2', 'Local Ollama model', 'ollama', 4096),
    ('Claude Sonnet 4.5', 'claude-sonnet-4-5', NULL::text, 'anthropic', 4096),
    ('Claude Haiku 4.5', 'claude-haiku-4-5', NULL::text, 'anthropic', 4096),
    ('Gemini 2.0 Flash', 'gemini-2.0-flash', NULL::text, 'gemini', 4000)
) AS v(name, model_id, description, provider, max_tokens)
WHERE NOT EXISTS (
  SELECT 1 FROM "llm_models" existing
  WHERE existing."user_id" IS NULL AND existing."model_id" = v.model_id
);
