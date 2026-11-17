-- Clave de idempotencia para ventas creadas en modo offline (ver modo offline, Fase 2).
ALTER TABLE "cotizaciones" ADD COLUMN "idempotency_key" TEXT;
CREATE UNIQUE INDEX "cotizaciones_idempotency_key_key" ON "cotizaciones"("idempotency_key");
