-- AlterTable
ALTER TABLE "areas" ADD COLUMN     "disabled_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "disabled_at" TIMESTAMP(3);
