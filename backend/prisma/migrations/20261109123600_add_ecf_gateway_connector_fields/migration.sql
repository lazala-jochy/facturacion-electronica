-- DGII Communication Gateway (ecf-gateway) — conector local
ALTER TABLE "companies" ADD COLUMN "ecf_gateway_base_url" TEXT;
ALTER TABLE "companies" ADD COLUMN "ecf_gateway_api_key" TEXT;
