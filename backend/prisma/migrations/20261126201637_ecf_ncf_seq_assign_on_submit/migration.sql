-- El e-NCF (ecf_ncf_seq) ya no se reserva al crear/editar una cotizacion: se asigna recien
-- al generar/firmar/enviar el e-CF (ver backend/src/services/ecf.service.ts generateForCotizacion).
-- Esto evita quemar correlativos fiscales en cotizaciones que nunca llegan a transmitirse a DGII.

-- AlterTable
ALTER TABLE "cotizaciones" ALTER COLUMN "ecf_ncf_seq" DROP NOT NULL;

-- Libera ecf_ncf_seq (y dgii_environment) de cotizaciones existentes que nunca se
-- transmitieron a DGII (dgii_status NULL o 'prepared', sin dgii_track_id ni dgii_submitted_at),
-- devolviendo esos correlativos al contador. No toca nada aceptado, rechazado, en cola de
-- reintento o que ya haya sido transmitido realmente a DGII.
UPDATE "cotizaciones"
SET "ecf_ncf_seq" = NULL, "dgii_environment" = NULL
WHERE ("dgii_status" IS NULL OR "dgii_status" = 'prepared')
  AND "dgii_track_id" IS NULL
  AND "dgii_submitted_at" IS NULL;
