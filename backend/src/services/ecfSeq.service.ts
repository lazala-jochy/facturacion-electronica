import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import {
  ECF_NCF_SEQ_EXCEEDED_MESSAGE,
  ECF_NCF_SEQ_MAX,
} from "../config/dgiiEcf.constants";
import { ECF_NCF_SEQ_EXCEEDED_ERROR_NAME } from "./cotizacion.service";
import { normalizeEcfTipo } from "../utils/ecfTipo";
import type { DgiiEnvironment } from "../utils/dgiiEnvironment";

const counterWhere = (
  companyId: number,
  ecfTipo: string,
  environment: DgiiEnvironment,
) => ({
  company_ecf_tipo_env_seq: {
    companyId,
    ecfTipo: normalizeEcfTipo(ecfTipo),
    environment,
  },
});

const throwSeqExceeded = () => {
  const err = new Error(ECF_NCF_SEQ_EXCEEDED_MESSAGE);
  err.name = ECF_NCF_SEQ_EXCEEDED_ERROR_NAME;
  throw err;
};

/**
 * Bloquea la fila del contador antes de leer/asignar el siguiente e-NCF.
 * En SQLite esto no hacia falta (un solo escritor a la vez); en Postgres,
 * sin este lock dos requests concurrentes podrian leer el mismo lastSeq y
 * asignar el mismo correlativo dos veces.
 */
const lockCounterRow = async (
  tx: Prisma.TransactionClient,
  companyId: number,
  ecfTipo: string,
  environment: DgiiEnvironment,
): Promise<void> => {
  const tipo = normalizeEcfTipo(ecfTipo);
  await tx.$executeRaw`
    INSERT INTO company_ecf_seq_counters (company_id, ecf_tipo, environment, last_seq)
    VALUES (${companyId}, ${tipo}, ${environment}, 0)
    ON CONFLICT (company_id, ecf_tipo, environment) DO NOTHING
  `;
  await tx.$queryRaw`
    SELECT last_seq FROM company_ecf_seq_counters
    WHERE company_id = ${companyId} AND ecf_tipo = ${tipo} AND environment = ${environment}
    FOR UPDATE
  `;
};

/**
 * Último correlativo registrado para este ambiente: máximo entre el contador de
 * empresa+tipo+ambiente y las cotizaciones guardadas ya etiquetadas con ese mismo ambiente.
 * Las cotizaciones históricas sin ambiente guardado (previas a este campo) se excluyen a
 * propósito -- no deben inflar el arranque de un contador recién separado por ambiente.
 */
export const getLastEcfNcfSeq = async (
  tx: Prisma.TransactionClient | typeof prisma,
  companyId: number,
  ecfTipo: string,
  environment: DgiiEnvironment,
): Promise<number> => {
  const tipo = normalizeEcfTipo(ecfTipo);
  const [agg, counter] = await Promise.all([
    tx.cotizacion.aggregate({
      where: { companyId, ecfTipo: tipo, dgiiEnvironment: environment },
      _max: { ecfNcfSeq: true },
    }),
    tx.companyEcfSeqCounter.findUnique({
      where: counterWhere(companyId, tipo, environment),
      select: { lastSeq: true },
    }),
  ]);
  return Math.max(agg._max.ecfNcfSeq ?? 0, counter?.lastSeq ?? 0);
};

/** Marca una secuencia como ya usada (p. ej. DGII rechazó «secuencia ya utilizada» o aceptó el envío). */
export const markEcfNcfSeqUsed = async (
  tx: Prisma.TransactionClient,
  companyId: number,
  ecfTipo: string,
  environment: DgiiEnvironment,
  seq: number,
): Promise<void> => {
  const n = Math.floor(seq);
  if (!Number.isFinite(n) || n < 1) return;

  const tipo = normalizeEcfTipo(ecfTipo);
  await lockCounterRow(tx, companyId, tipo, environment);
  const last = await getLastEcfNcfSeq(tx, companyId, tipo, environment);
  const nextLast = Math.max(last, n);

  await tx.companyEcfSeqCounter.upsert({
    where: counterWhere(companyId, tipo, environment),
    create: { companyId, ecfTipo: tipo, environment, lastSeq: nextLast },
    update: { lastSeq: nextLast },
  });
};

/**
 * Libera una secuencia reservada (ej. al generar/previsualizar el XML) que nunca llegó a
 * transmitirse a DGII y cuya cotización se está borrando. Solo retrocede el contador si `seq`
 * sigue siendo la cima (nada más alto la usó mientras tanto) -- si no, otra cotización ya
 * avanzó el contador por encima y no hay nada que liberar sin arriesgar una colisión futura.
 */
export const releaseEcfNcfSeqIfUnused = async (
  tx: Prisma.TransactionClient,
  companyId: number,
  ecfTipo: string,
  environment: DgiiEnvironment,
  seq: number,
): Promise<void> => {
  const n = Math.floor(seq);
  if (!Number.isFinite(n) || n < 1) return;

  const tipo = normalizeEcfTipo(ecfTipo);
  await lockCounterRow(tx, companyId, tipo, environment);
  const counter = await tx.companyEcfSeqCounter.findUnique({
    where: counterWhere(companyId, tipo, environment),
    select: { lastSeq: true },
  });
  if (counter?.lastSeq !== n) return;

  await tx.companyEcfSeqCounter.update({
    where: counterWhere(companyId, tipo, environment),
    data: { lastSeq: n - 1 },
  });
};

const persistCounterLastSeq = async (
  tx: Prisma.TransactionClient,
  companyId: number,
  ecfTipo: string,
  environment: DgiiEnvironment,
  lastSeq: number,
): Promise<void> => {
  const tipo = normalizeEcfTipo(ecfTipo);
  await tx.companyEcfSeqCounter.upsert({
    where: counterWhere(companyId, tipo, environment),
    create: { companyId, ecfTipo: tipo, environment, lastSeq },
    update: { lastSeq },
  });
};

/** Siguiente correlativo libre: max(último en BD, secuencia consumida) + 1. */
export const nextEcfNcfSeqAfterUsed = (lastInDb: number, usedSeq: number): number => {
  const last = Math.max(0, Math.floor(lastInDb));
  const used = Math.max(0, Math.floor(usedSeq));
  return Math.max(last, used) + 1;
};

/**
 * Primer correlativo libre ≥ max(último en BD, secuencia que DGII marcó usada) + 1.
 * Evita reutilizar el mismo e-NCF tras rechazo 1209.
 *
 * El chequeo de colisión contra `cotizacion` NO se filtra por ambiente a propósito: si ese
 * número ya existe físicamente (de cualquier ambiente, incluyendo registros históricos sin
 * ambiente guardado), nunca debe reasignarse. Esto es lo que permite que un contador recién
 * separado arranque en 1 y vaya saltando automáticamente los números que ya estén en uso.
 */
export const allocateNextAfterUsedSeq = async (
  tx: Prisma.TransactionClient,
  companyId: number,
  ecfTipo: string,
  environment: DgiiEnvironment,
  usedSeq: number,
  opts?: { excludeCotizacionId?: number },
): Promise<number> => {
  const tipo = normalizeEcfTipo(ecfTipo);
  const used = Math.floor(usedSeq);
  await lockCounterRow(tx, companyId, tipo, environment);
  const last = await getLastEcfNcfSeq(tx, companyId, tipo, environment);
  const start = nextEcfNcfSeqAfterUsed(last, used);

  let candidate = start;
  while (candidate <= ECF_NCF_SEQ_MAX) {
    const conflict = await tx.cotizacion.findFirst({
      where: {
        companyId,
        ecfTipo: tipo,
        ecfNcfSeq: candidate,
        ...(opts?.excludeCotizacionId != null
          ? { id: { not: opts.excludeCotizacionId } }
          : {}),
      },
      select: { id: true },
    });
    if (!conflict) {
      await persistCounterLastSeq(tx, companyId, tipo, environment, candidate);
      return candidate;
    }
    candidate += 1;
  }
  throwSeqExceeded();
  return 0;
};

/** Reserva el siguiente correlativo (último guardado + 1) y actualiza el contador. */
export const allocateNextEcfNcfSeq = async (
  tx: Prisma.TransactionClient,
  companyId: number,
  ecfTipo: string,
  environment: DgiiEnvironment,
): Promise<number> => {
  const last = await getLastEcfNcfSeq(tx, companyId, ecfTipo, environment);
  return allocateNextAfterUsedSeq(tx, companyId, ecfTipo, environment, last);
};
