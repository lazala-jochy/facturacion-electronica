-- AlterTable
ALTER TABLE "companies" ADD COLUMN "certificate_salt" TEXT;
ALTER TABLE "companies" ADD COLUMN "certificate_enc_path" TEXT;
ALTER TABLE "companies" ADD COLUMN "certificate_password_enc" TEXT;
