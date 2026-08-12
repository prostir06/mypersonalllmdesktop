-- CreateTable
CREATE TABLE "user_prompts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "prompt" TEXT NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_user_prompts_user_id" ON "user_prompts"("user_id");

-- AddForeignKey
ALTER TABLE "user_prompts" ADD CONSTRAINT "user_prompts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
