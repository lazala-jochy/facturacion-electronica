export type EcfGatewayPendingItem = {
  id: string;
  type: "RECEPCION_ECF" | "APROBACION_COMERCIAL" | "AUTH_VALIDACION";
  method: string;
  path: string;
  headers: Record<string, string>;
  bodyBase64: string;
};

export type EcfGatewayResponsePayload = {
  status: number;
  headers?: Record<string, string>;
  bodyBase64?: string;
};

export type EcfGatewayErrorCode = "MISSING_CONFIG" | "NETWORK" | "AUTH_FAILED" | "BAD_RESPONSE";

export class EcfGatewayError extends Error {
  readonly code: EcfGatewayErrorCode;

  constructor(message: string, code: EcfGatewayErrorCode) {
    super(message);
    this.name = "EcfGatewayError";
    this.code = code;
  }
}
