import Dexie, { type Table } from "dexie";
import type { AuthCompany, AuthUser } from "../types/session";
import type { ClientListItem } from "../services/clients";
import type { CreateClientWithCotizacionPayload } from "../services/cotizaciones";

/** Snapshot de empresa/usuario cacheado para imprimir/trabajar sin conexión. */
export type CachedCompanyProfile = {
  /** Clave fija; solo hay un perfil cacheado a la vez (una sesión por dispositivo). */
  id: "current";
  company: AuthCompany;
  user: AuthUser;
  updatedAt: number;
};

export type CachedClient = ClientListItem & {
  updatedAt: number;
};

/** "error" se reintenta solo (probablemente fue de red); "error_permanente" ya no, requiere acción manual. */
export type OfflineCotizacionStatus = "pendiente" | "sincronizando" | "error" | "error_permanente";

/** Venta creada sin conexión, pendiente de enviar al servidor. */
export type OfflineCotizacion = {
  /** UUID generado en el navegador; también viaja como idempotency_key al sincronizar. */
  localId: string;
  companyId: number;
  payload: CreateClientWithCotizacionPayload;
  status: OfflineCotizacionStatus;
  lastError?: string;
  attempts: number;
  createdAt: number;
  updatedAt: number;
};

class OfflineDatabase extends Dexie {
  cachedClients!: Table<CachedClient, number>;
  cachedCompanyProfile!: Table<CachedCompanyProfile, string>;
  offlineCotizaciones!: Table<OfflineCotizacion, string>;

  constructor() {
    super("fe_rd_offline_v1");
    this.version(1).stores({
      cachedClients: "id, company_id",
      cachedCompanyProfile: "id",
      offlineCotizaciones: "localId, companyId, status, createdAt",
    });
  }
}

export const offlineDb = new OfflineDatabase();
