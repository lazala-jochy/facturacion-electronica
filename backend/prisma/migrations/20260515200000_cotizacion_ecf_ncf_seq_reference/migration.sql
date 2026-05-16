-- Secuencia e-NCF por empresa y tipo; documento de referencia para ND/NC.
ALTER TABLE "cotizaciones" ADD COLUMN "ecf_ncf_seq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "cotizaciones" ADD COLUMN "ecf_reference_ncf" TEXT;

UPDATE "cotizaciones" SET "ecf_ncf_seq" = "number" WHERE "ecf_ncf_seq" = 0 OR "ecf_ncf_seq" IS NULL;

CREATE UNIQUE INDEX "cotizaciones_company_id_ecf_tipo_ecf_ncf_seq_key" ON "cotizaciones"("company_id", "ecf_tipo", "ecf_ncf_seq");
