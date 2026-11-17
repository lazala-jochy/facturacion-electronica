import { offlineDb } from "./db";
import type { AuthSession } from "../types/session";
import { listClients } from "../services/clients";

/** Guarda el perfil de empresa/usuario de la sesión actual para usarlo sin conexión (imprimir, etc.). */
export async function cacheCompanyProfile(session: AuthSession): Promise<void> {
  await offlineDb.cachedCompanyProfile.put({
    id: "current",
    company: session.company,
    user: session.user,
    updatedAt: Date.now(),
  });
}

export const getCachedCompanyProfile = () => offlineDb.cachedCompanyProfile.get("current");

/** Refresca el cache de clientes contra el servidor; no hace nada si falla (se usa el cache que ya había). */
export async function refreshCachedClients(): Promise<void> {
  try {
    const { clients } = await listClients();
    const now = Date.now();
    await offlineDb.transaction("rw", offlineDb.cachedClients, async () => {
      await offlineDb.cachedClients.clear();
      await offlineDb.cachedClients.bulkPut(clients.map((c) => ({ ...c, updatedAt: now })));
    });
  } catch {
    /* sin conexión o error puntual: se sigue usando el cache existente */
  }
}

export const getCachedClients = () => offlineDb.cachedClients.toArray();
