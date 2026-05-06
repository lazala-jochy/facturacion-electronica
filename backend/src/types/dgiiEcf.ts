export type DgiiSubmissionResult = {
  accepted: boolean;
  status: "accepted" | "rejected";
  trackId: string;
  rawResponse: string;
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
