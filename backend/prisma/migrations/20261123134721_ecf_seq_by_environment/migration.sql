-- Separa el correlativo e-NCF por ambiente (CERTIFICACION/PRODUCCION), ademas de por
-- empresa y tipo: antes compartian la misma cola y las pruebas de certificacion podian
-- dejar el contador "adelantado" para cuando la empresa pasaba a producir en serio.
--
-- No se toca ningun dato fiscal de "cotizaciones" (numero, monto, cliente, XML firmado):
-- solo se agrega una columna informativa nueva (dgii_environment, nullable) para que de
-- aqui en adelante cada documento quede marcado con el ambiente real en que se transmitio.
--
-- El contador (company_ecf_seq_counters) si se reinicia a 0 para todas las empresas y tipos
-- ya existentes: el proximo e-NCF de cada combinacion empresa+tipo+ambiente arranca en 1.
-- Esto es seguro porque la asignacion de secuencia (ver ecfSeq.service.ts,
-- allocateNextAfterUsedSeq) ya verifica, antes de confirmar un numero, que no exista
-- fisicamente en "cotizaciones" ninguna fila con ese mismo numero (sin importar el ambiente
-- original) -- por lo que automaticamente salta cualquier e-NCF que ya se haya usado y
-- aceptado en produccion.

ALTER TABLE "cotizaciones" ADD COLUMN "dgii_environment" TEXT;

DROP INDEX "company_ecf_seq_counters_company_id_ecf_tipo_key";

ALTER TABLE "company_ecf_seq_counters" ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'PRODUCCION';

UPDATE "company_ecf_seq_counters" SET "last_seq" = 0;

CREATE UNIQUE INDEX "company_ecf_seq_counters_company_id_ecf_tipo_environment_key" ON "company_ecf_seq_counters"("company_id", "ecf_tipo", "environment");

-- Correccion puntual (datos ya verificados al momento de esta migracion): las unicas
-- cotizaciones existentes en estado "prepared" (nunca transmitidas a DGII, dgii_track_id
-- nulo) eran company_id=19, ecf_tipo=31, ids 180 (seq 57) y 187 (seq 58) -- arrastraban
-- numeracion heredada del contador inflado por pruebas de certificacion borradas. Como
-- nunca se enviaron a DGII, se renumeran para arrancar en 1 junto con el contador. Ninguna
-- cotizacion ya facturada/aceptada por DGII se modifica aqui.
UPDATE "cotizaciones" SET "ecf_ncf_seq" = 1, "dgii_environment" = 'PRODUCCION'
  WHERE "id" = 180 AND "company_id" = 19 AND "ecf_tipo" = '31' AND "dgii_status" = 'prepared';
UPDATE "cotizaciones" SET "ecf_ncf_seq" = 2, "dgii_environment" = 'PRODUCCION'
  WHERE "id" = 187 AND "company_id" = 19 AND "ecf_tipo" = '31' AND "dgii_status" = 'prepared';
