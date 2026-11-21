-- Revierte la retención a terceros: el e-CF 31/32 no tiene ese campo en DGII, se quita por ahora.
ALTER TABLE "cotizaciones" DROP COLUMN "retencion_isr_pct";
ALTER TABLE "cotizaciones" DROP COLUMN "retencion_isr_monto";
ALTER TABLE "cotizaciones" DROP COLUMN "retencion_itbis_pct";
ALTER TABLE "cotizaciones" DROP COLUMN "retencion_itbis_monto";
