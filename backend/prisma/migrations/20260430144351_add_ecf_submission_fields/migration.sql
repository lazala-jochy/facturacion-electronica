-- AlterTable
ALTER TABLE "cotizaciones" ADD COLUMN "dgii_response" TEXT;
ALTER TABLE "cotizaciones" ADD COLUMN "dgii_status" TEXT;
ALTER TABLE "cotizaciones" ADD COLUMN "dgii_submitted_at" DATETIME;
ALTER TABLE "cotizaciones" ADD COLUMN "dgii_track_id" TEXT;
ALTER TABLE "cotizaciones" ADD COLUMN "signed_xml" TEXT;
