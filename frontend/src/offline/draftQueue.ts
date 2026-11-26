import { offlineDb, type CotizacionDraft, type CotizacionDraftState } from "./db";

/** Autoguarda (o sobreescribe) el borrador de "Nueva cotización" de esta empresa. */
export async function saveCotizacionDraft(
  companyId: number,
  state: CotizacionDraftState,
): Promise<void> {
  await offlineDb.cotizacionDrafts.put({ companyId, state, updatedAt: Date.now() });
}

export const getCotizacionDraft = (companyId: number): Promise<CotizacionDraft | undefined> =>
  offlineDb.cotizacionDrafts.get(companyId);

export const clearCotizacionDraft = (companyId: number): Promise<void> =>
  offlineDb.cotizacionDrafts.delete(companyId);
