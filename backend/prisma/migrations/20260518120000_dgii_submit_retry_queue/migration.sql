-- Cola de reenvío cuando DGII no está disponible tras firmar el e-CF
ALTER TABLE "cotizaciones" ADD COLUMN "dgii_submit_retry_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "cotizaciones" ADD COLUMN "dgii_submit_next_retry_at" DATETIME;
ALTER TABLE "cotizaciones" ADD COLUMN "dgii_submit_last_error" TEXT;
ALTER TABLE "cotizaciones" ADD COLUMN "dgii_submit_cert_profile" TEXT;

CREATE INDEX "cotizaciones_dgii_submit_queue_idx" ON "cotizaciones"("company_id", "dgii_status", "dgii_submit_next_retry_at");
