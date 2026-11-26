import Dexie, { type Table } from "dexie";
import type { AuthCompany, AuthUser } from "../types/session";
import type { ClientListItem } from "../services/clients";
import type { CotizacionItemDraft, CreateClientWithCotizacionPayload } from "../services/cotizaciones";

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

/** Campos editables del formulario de "Nueva cotización", para autoguardar un borrador local. */
export type CotizacionDraftState = {
  clientName: string;
  clientAddress: string;
  clientRnc: string;
  clientPhone: string;
  clientEmail: string;
  paymentMethod: string;
  creditDueDate: string;
  comment: string;
  ecfTipo: string;
  ecfReferenceNcf: string;
  items: Array<CotizacionItemDraft & { key: string }>;
  calcMode: "auto" | "manual";
  manualSubtotal: number;
  manualItbisRate: number;
  manualItbis: number;
  manualTotal: number;
  exento: boolean;
};

/** Borrador autoguardado del formulario de nueva cotización; uno solo por empresa. */
export type CotizacionDraft = {
  companyId: number;
  state: CotizacionDraftState;
  updatedAt: number;
};

class OfflineDatabase extends Dexie {
  cachedClients!: Table<CachedClient, number>;
  cachedCompanyProfile!: Table<CachedCompanyProfile, string>;
  offlineCotizaciones!: Table<OfflineCotizacion, string>;
  cotizacionDrafts!: Table<CotizacionDraft, number>;

  constructor() {
    super("fe_rd_offline_v1");
    this.version(1).stores({
      cachedClients: "id, company_id",
      cachedCompanyProfile: "id",
      offlineCotizaciones: "localId, companyId, status, createdAt",
    });
    this.version(2).stores({
      cachedClients: "id, company_id",
      cachedCompanyProfile: "id",
      offlineCotizaciones: "localId, companyId, status, createdAt",
      cotizacionDrafts: "companyId",
    });
  }
}

export const offlineDb = new OfflineDatabase();
