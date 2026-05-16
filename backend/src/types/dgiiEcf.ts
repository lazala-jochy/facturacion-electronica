export type DgiiSubmissionResult = {
  accepted: boolean;
  /** `pending` = recepción OK y trackId pero sin aceptación/rechazo explícito en el cuerpo (no inferir aceptado). */
  status: "accepted" | "rejected" | "prepared" | "pending";
  trackId: string;
  rawResponse: string;
  httpStatus?: number;
  responseContentType?: string;
};

export type DgiiEcfErrorCode =
  | "NETWORK"
  | "MISSING_CREDENTIALS"
  | "AUTH_FAILED"
  | "TOKEN_PARSE"
  | "RECEPTION_FAILED"
  | "CONSULT_FAILED";

export class DgiiEcfError extends Error {
  readonly code: DgiiEcfErrorCode;
  readonly httpStatus?: number;

  constructor(message: string, code: DgiiEcfErrorCode, httpStatus?: number) {
    super(message);
    this.name = "DgiiEcfError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
