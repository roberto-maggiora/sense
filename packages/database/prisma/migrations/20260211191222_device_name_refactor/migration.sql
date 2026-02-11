-- AlterTable
ALTER TABLE "devices" ADD COLUMN "name" TEXT;

-- UpdateData
UPDATE "devices" SET "name" = COALESCE("display_name", "asset_name", "external_id", 'Unnamed Device');

-- AlterTable
ALTER TABLE "devices" ALTER COLUMN "name" SET NOT NULL;

-- AlterTable
ALTER TABLE "devices" DROP COLUMN "asset_name";
ALTER TABLE "devices" DROP COLUMN "display_name";
