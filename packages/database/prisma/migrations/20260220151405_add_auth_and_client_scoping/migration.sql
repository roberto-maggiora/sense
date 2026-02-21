/*
  Warnings:

  - Added the required column `password_hash` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_client_id_fkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_hash" TEXT;

-- Update existing rows with a stub hash
UPDATE "users" SET "password_hash" = '$2a$10$StubHashNeededForExistingRowsReplaceMeImmediately12345' WHERE "password_hash" IS NULL;

-- Make it NOT NULL
ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL;

ALTER TABLE "users" ALTER COLUMN "client_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "users_disabled_at_idx" ON "users"("disabled_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
