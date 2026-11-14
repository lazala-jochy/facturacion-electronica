-- Paso 4 — Simulación e-CF (URLs por vista; independientes del Paso 2 Excel)
ALTER TABLE "companies" ADD COLUMN "dgii_paso4_auth_url" TEXT;
ALTER TABLE "companies" ADD COLUMN "dgii_paso4_reception_url" TEXT;
ALTER TABLE "companies" ADD COLUMN "dgii_paso4_consult_url" TEXT;
ALTER TABLE "companies" ADD COLUMN "dgii_paso4_rfce_url" TEXT;
ALTER TABLE "companies" ADD COLUMN "dgii_paso4_environment" TEXT DEFAULT 'CERTIFICACION';
ALTER TABLE "companies" ADD COLUMN "dgii_paso4_seed_url" TEXT;
ALTER TABLE "companies" ADD COLUMN "dgii_paso4_validate_seed_url" TEXT;
ALTER TABLE "companies" ADD COLUMN "dgii_paso4_ecf_receive_url" TEXT;
