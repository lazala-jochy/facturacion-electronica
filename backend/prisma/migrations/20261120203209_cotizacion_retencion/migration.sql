-- Retención a terceros (informativa): no afecta subtotal/itbis/total existentes.
ALTER TABLE "cotizaciones" ADD COLUMN "retencion_isr_pct" DOUBLE PRECISION;
ALTER TABLE "cotizaciones" ADD COLUMN "retencion_isr_monto" DOUBLE PRECISION;
ALTER TABLE "cotizaciones" ADD COLUMN "retencion_itbis_pct" DOUBLE PRECISION;
ALTER TABLE "cotizaciones" ADD COLUMN "retencion_itbis_monto" DOUBLE PRECISION;
