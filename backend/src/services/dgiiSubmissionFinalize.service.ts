import type { Company } from "@prisma/client";
import type { DgiiCertProfile } from "../types/dgiiCertProfile";
import type { DgiiSubmissionResult } from "../types/dgiiEcf";
import {
  isInconclusiveDgiiReceptionBody,
  mapDgiiRawBodyToCotizacionEstado,
} from "../utils/dgiiEstadoRecepcion";
import { consultDgiiTrackId } from "./dgiiEcfApi.service";

export { isInconclusiveDgiiReceptionBody };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Tras recepción, consulta GET estado por trackId hasta obtener Aceptado/Rechazado
 * (mismo criterio que el lote Excel).
 */
export async function finalizeDgiiSubmissionAfterReception(
  company: Company,
  initial: DgiiSubmissionResult,
  options?: { certProfile?: DgiiCertProfile },
): Promise<DgiiSubmissionResult> {
  const trackId = initial.trackId?.trim();
  if (!trackId) return initial;

  const needsConsult =
    initial.status === "pending" || isInconclusiveDgiiReceptionBody(initial.rawResponse);
  if (!needsConsult) return initial;

  const delays = [0, 2000];
  let lastBody = initial.rawResponse;

  for (const delayMs of delays) {
    if (delayMs > 0) await sleep(delayMs);
    try {
      const consult = await consultDgiiTrackId(company, trackId, {
        certProfile: options?.certProfile,
      });
      lastBody = consult.body;
      const finalStatus = mapDgiiRawBodyToCotizacionEstado(consult.body);
      if (finalStatus === "accepted" || finalStatus === "rejected") {
        return {
          ...initial,
          accepted: finalStatus === "accepted",
          status: finalStatus,
          rawResponse: consult.body,
        };
      }
    } catch {
      /* reintento con delay */
    }
  }

  const mapped = mapDgiiRawBodyToCotizacionEstado(lastBody);
  if (mapped) {
    return {
      ...initial,
      accepted: mapped === "accepted",
      status: mapped,
      rawResponse: lastBody,
    };
  }

  return {
    ...initial,
    status: "pending",
    accepted: false,
    rawResponse: lastBody,
  };
}
