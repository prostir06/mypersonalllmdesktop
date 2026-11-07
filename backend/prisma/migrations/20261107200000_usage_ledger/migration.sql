ALTER TABLE "users" ADD COLUMN "shared_key_daily_limit_usd" DECIMAL(12,6);

CREATE TABLE "usage_ledger" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "model" VARCHAR(255) NOT NULL,
    "prompt_tokens" INTEGER NOT NULL,
    "completion_tokens" INTEGER NOT NULL,
    "cost_usd" DECIMAL(12,6) NOT NULL,
    "shared_key" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_usage_ledger_user_day_shared" ON "usage_ledger"("user_id", "date", "shared_key");

ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
