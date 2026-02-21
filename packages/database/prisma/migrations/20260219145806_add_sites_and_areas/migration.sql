/*
  Warnings:

  - A unique constraint covering the columns `[site_id,name]` on the table `areas` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[client_id,name]` on the table `sites` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "devices" ALTER COLUMN "source" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "areas_site_id_name_key" ON "areas"("site_id", "name");

-- CreateIndex
CREATE INDEX "devices_site_id_idx" ON "devices"("site_id");

-- CreateIndex
CREATE INDEX "devices_area_id_idx" ON "devices"("area_id");

-- CreateIndex
CREATE UNIQUE INDEX "sites_client_id_name_key" ON "sites"("client_id", "name");
