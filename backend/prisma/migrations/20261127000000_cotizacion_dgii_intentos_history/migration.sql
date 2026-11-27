-- Historial inmutable de intentos de envío a DGII por cotización: un e-NCF rechazado ya no se
-- reutiliza, así que hay que conservar cada secuencia usada (aceptada o rechazada), no solo el
-- resultado vigente en "cotizaciones".
CREATE TABLE "cotizacion_dgii_intentos" (
    "id" SERIAL NOT NULL,
    "cotizacion_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "ecf_tipo" TEXT NOT NULL,
    "ecf_ncf_seq" INTEGER,
    "dgii_environment" TEXT,
    "dgii_status" TEXT NOT NULL,
    "dgii_response" TEXT,
    "dgii_track_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizacion_dgii_intentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cotizacion_dgii_intentos_cotizacion_id_created_at_idx" ON "cotizacion_dgii_intentos"("cotizacion_id", "created_at");

-- CreateIndex
CREATE INDEX "cotizacion_dgii_intentos_company_id_idx" ON "cotizacion_dgii_intentos"("company_id");

-- AddForeignKey
ALTER TABLE "cotizacion_dgii_intentos" ADD CONSTRAINT "cotizacion_dgii_intentos_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
