import type { DgiiEcfErrorCode } from "../types/dgiiEcf";

/** Cotización firmada; envío a DGII pendiente o reintentando. */
export const DGII_SUBMIT_QUEUED_STATUS = "submit_queued" as const;
/** Reintentos agotados; requiere acción manual. */
export const DGII_SUBMIT_FAILED_STATUS = "submit_failed" as const;
export const DGII_SUBMIT_SUBMITTING_STATUS = "submitting" as const;

export type DgiiSubmitQueueStatus =
  | typeof DGII_SUBMIT_QUEUED_STATUS
  | typeof DGII_SUBMIT_FAILED_STATUS
  | typeof DGII_SUBMIT_SUBMITTING_STATUS;

/** Delays entre intentos: 1m, 2m, 5m, 10m, 15m, 30m, luego 1h. */
export const DGII_SUBMIT_RETRY_DELAYS_MS = [
  60_000,
  120_000,
  300_000,
  600_000,
  900_000,
  1_800_000,
  3_600_000,
] as const;

export const defaultDgiiSubmitMaxRetries = () => {
  const raw = process.env.DGII_SUBMIT_MAX_RETRIES?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 100;
  return Number.isFinite(n) && n > 0 ? n : 100;
};

export function computeNextDgiiSubmitRetryAt(attemptNumber: number): Date {
  const idx = Math.min(
    Math.max(attemptNumber - 1, 0),
    DGII_SUBMIT_RETRY_DELAYS_MS.length - 1,
  );
  return new Date(Date.now() + DGII_SUBMIT_RETRY_DELAYS_MS[idx]);
}

/** Errores transitorios: red, 5xx, 429 en recepción/auth. */
export function isRetryableDgiiSubmitError(
  code: DgiiEcfErrorCode | string | undefined,
  httpStatus?: number,
): boolean {
  if (code === "NETWORK") return true;
  if (code === "RECEPTION_FAILED") {
    if (httpStatus == null) return true;
    return httpStatus >= 500 || httpStatus === 429;
  }
  if (code === "AUTH_FAILED" && httpStatus != null && httpStatus >= 500) return true;
  return false;
}

export function isDgiiSubmitQueueStatus(status: string | null | undefined): boolean {
  const s = status?.trim() ?? "";
  return (
    s === DGII_SUBMIT_QUEUED_STATUS ||
    s === DGII_SUBMIT_FAILED_STATUS ||
    s === DGII_SUBMIT_SUBMITTING_STATUS
  );
}
