import { offlineDb, type OfflineCotizacion } from "./db";
import type { CreateClientWithCotizacionPayload } from "../services/cotizaciones";

const genLocalId = (): string =>
  crypto.randomUUID?.() ?? `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** Guarda una venta creada sin conexión; se sincroniza sola cuando vuelve internet. */
export async function queueOfflineCotizacion(
  companyId: number,
  payload: CreateClientWithCotizacionPayload,
): Promise<OfflineCotizacion> {
  const now = Date.now();
  const entry: OfflineCotizacion = {
    localId: genLocalId(),
    companyId,
    // La clave de cifrado del certificado no se persiste offline: viaja fresca desde la UI
    // recién al sincronizar (ver syncEngine), para no dejarla dando vueltas en IndexedDB.
    payload: { ...payload, certificate_encryption_secret: undefined },
    status: "pendiente",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };
  await offlineDb.offlineCotizaciones.put(entry);
  return entry;
}

export const listOfflineCotizaciones = (companyId: number): Promise<OfflineCotizacion[]> =>
  offlineDb.offlineCotizaciones.where({ companyId }).sortBy("createdAt");

export const getOfflineCotizacion = (localId: string): Promise<OfflineCotizacion | undefined> =>
  offlineDb.offlineCotizaciones.get(localId);

export const countPendingOfflineCotizaciones = (companyId: number): Promise<number> =>
  offlineDb.offlineCotizaciones.where({ companyId, status: "pendiente" }).count();

export const removeOfflineCotizacion = (localId: string): Promise<void> =>
  offlineDb.offlineCotizaciones.delete(localId);

export async function markOfflineCotizacionStatus(
  localId: string,
  status: OfflineCotizacion["status"],
  lastError?: string,
): Promise<void> {
  await offlineDb.offlineCotizaciones.update(localId, {
    status,
    lastError: lastError ?? undefined,
    updatedAt: Date.now(),
  });
}

export const incrementOfflineCotizacionAttempts = async (localId: string): Promise<number> => {
  const entry = await offlineDb.offlineCotizaciones.get(localId);
  const attempts = (entry?.attempts ?? 0) + 1;
  await offlineDb.offlineCotizaciones.update(localId, { attempts });
  return attempts;
};

/** Vuelve a poner en cola un ítem con error permanente para que el usuario lo reintente a mano. */
export const retryOfflineCotizacion = (localId: string): Promise<number> =>
  offlineDb.offlineCotizaciones.update(localId, {
    status: "pendiente",
    attempts: 0,
    lastError: undefined,
    updatedAt: Date.now(),
  });
