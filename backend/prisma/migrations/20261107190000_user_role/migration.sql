CREATE TYPE "UserRole" AS ENUM ('admin', 'member');

ALTER TABLE "users" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'member';

UPDATE "users"
SET "role" = 'admin'
WHERE "id" = (SELECT MIN("id") FROM "users");
