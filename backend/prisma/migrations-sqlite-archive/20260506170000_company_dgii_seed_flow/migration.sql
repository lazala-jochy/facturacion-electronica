-- AlterTable
ALTER TABLE "companies" ADD COLUMN "dgii_seed_url" TEXT;
ALTER TABLE "companies" ADD COLUMN "dgii_validate_seed_url" TEXT;
ALTER TABLE "companies" ADD COLUMN "dgii_ecf_receive_url" TEXT;
ALTER TABLE "companies" ADD COLUMN "dgii_track_url" TEXT;
ALTER TABLE "companies" ADD COLUMN "dgii_status_url" TEXT;
ALTER TABLE "companies" ADD COLUMN "dgii_environment" TEXT DEFAULT 'CERTIFICACION';
ALTER TABLE "companies" ADD COLUMN "certificate_path" TEXT;
ALTER TABLE "companies" ADD COLUMN "certificate_password" TEXT;
ALTER TABLE "companies" ADD COLUMN "token_cache" TEXT;
ALTER TABLE "companies" ADD COLUMN "token_expiration" DATETIME;
