import { createClientWithCotizacion } from "../services/cotizaciones";
import { readAuthSessionFromStorage } from "../services/api";
import { subscribeConnectivity, isOnline } from "./connectivity";
import {
  incrementOfflineCotizacionAttempts,
  listOfflineCotizaciones,
  markOfflineCotizacionStatus,
  recoverStuckOfflineCotizaciones,
  removeOfflineCotizacion,
} from "./offlineQueue";

/** Tras esta cantidad de intentos fallidos, se deja de reintentar solo (probablemente no es un problema de red). */
const MAX_AUTO_RETRIES = 5;

type SyncListener = (info: { pending: number; syncing: boolean }) => void;

const listeners = new Set<SyncListener>();
let syncing = false;
let started = false;

const notify = (pending: number) => listeners.forEach((l) => l({ pending, syncing }));

export function subscribeOfflineSync(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function notifyOfflineSync(): Promise<void> {
  const session = readAuthSessionFromStorage();
  if (!session?.company?.id) return;
  notify((await listOfflineCotizaciones(session.company.id)).length);
}

/**
 * Procesa la cola offline en orden, una por una (no en paralelo: así, si una fila
 * depende de que la anterior ya haya liberado un número de secuencia, no hay carrera).
 * Cada venta viaja con su idempotency_key -- si el servidor ya la recibió en un intento
 * previo que se cortó, la reconoce y no la duplica (ver cotizacion.service.ts).
 */
export async function runOfflineSync(): Promise<void> {
  if (syncing) return;
  const session = readAuthSessionFromStorage();
  if (!session?.company?.id || !isOnline()) return;

  syncing = true;
  try {
    await recoverStuckOfflineCotizaciones(session.company.id);
    const pendingBefore = await listOfflineCotizaciones(session.company.id);
    notify(pendingBefore.length);

    const pendingOnly = pendingBefore.filter(
      (e) => e.status === "pendiente" || e.status === "error",
    );
    for (const entry of pendingOnly) {
      if (!isOnline()) break;
      await markOfflineCotizacionStatus(entry.localId, "sincronizando");
      try {
        // La clave de cifrado del certificado no se guardó offline (ver offlineQueue);
        // se toma la de la sesión actual, igual que hace CotizacionCreate online.
        const enc = session.company.certificate_keyphrase?.trim();
        await createClientWithCotizacion({
          ...entry.payload,
          idempotency_key: entry.localId,
          ...(enc && enc.length >= 8 ? { certificate_encryption_secret: enc } : {}),
        });
        await removeOfflineCotizacion(entry.localId);
      } catch (e) {
        const attempts = await incrementOfflineCotizacionAttempts(entry.localId);
        const message = e instanceof Error ? e.message : "Error al sincronizar.";
        await markOfflineCotizacionStatus(
          entry.localId,
          attempts >= MAX_AUTO_RETRIES ? "error_permanente" : "error",
          message,
        );
      }
      const remaining = await listOfflineCotizaciones(session.company.id);
      notify(remaining.length);
    }
  } finally {
    syncing = false;
    await notifyOfflineSync();
  }
}

/** Arranca la sincronización automática cada vez que vuelve la conexión (llamar desde App). */
export function startOfflineSyncWatch(): () => void {
  if (started) return () => undefined;
  started = true;
  void runOfflineSync();
  const unsubscribe = subscribeConnectivity((online) => {
    if (online) void runOfflineSync();
  });
  return () => {
    unsubscribe();
    started = false;
  };
}
