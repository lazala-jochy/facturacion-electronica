-- Representación impresa e-CF (PDF + URL QR timbre DGII)
ALTER TABLE "cotizaciones" ADD COLUMN "ecf_ri_pdf_path" TEXT;
ALTER TABLE "cotizaciones" ADD COLUMN "ecf_ri_qr_url" TEXT;
ALTER TABLE "cotizaciones" ADD COLUMN "ecf_ri_generated_at" DATETIME;
