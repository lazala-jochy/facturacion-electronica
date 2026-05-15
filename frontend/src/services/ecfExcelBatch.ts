import { apiFetch } from "./api";

export type EcfExcelBatchRunResponse = {
  outputRoot: string;
  excelPath: string;
  rowCount: number;
  ok: number;
  fail: number;
  outXmlDir: string;
  outSignedDir: string;
  failures: { row: number; enf: string | null; error: string }[];
  rfce?: {
    rowCount: number;
    ok: number;
    fail: number;
    outXmlDir: string;
    outSignedDir: string;
    consumoIntegrasSignedDir?: string;
    failures: { row: number; enf: string | null; error: string }[];
  };
  logs: string[];
  /** Solo cuando todas las filas fallan pero la respuesta es 200. */
  message?: string;
};

export type EcfExcelBatchSendResponse = {
  outSignedDir: string;
  total: number;
  ok: number;
  fail: number;
  testSummary?: {
    accepted: number;
    rejected: number;
    pending: number;
    unknown: number;
  };
  successes: {
    file: string;
    trackId: string;
    status: string;
    testStatus?: "accepted" | "rejected" | "pending" | "unknown";
    testMessage?: string;
    httpStatus?: number;
    responseContentType?: string;
    responseSnippet?: string;
  }[];
  failures: { file: string; error: string; code?: string; httpStatus?: number }[];
  logs: string[];
};

/** Lee el primer `.xlsx` en `backend/assets`, genera XML y firmados en el Escritorio. */
export const runEcfExcelBatchFromApp = async (body: {
  desktop_parent_dir?: string;
}): Promise<EcfExcelBatchRunResponse> =>
  apiFetch<EcfExcelBatchRunResponse>("/ecf-excel-batch/run", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const sendEcfExcelBatchToDgiiFromApp = async (body: {
  out_signed_dir: string;
}): Promise<EcfExcelBatchSendResponse> =>
  apiFetch<EcfExcelBatchSendResponse>("/ecf-excel-batch/send", {
    method: "POST",
    body: JSON.stringify(body),
  });

export type EcfBatchConsultEntry = {
  encf: string;
  file: string;
  trackId: string;
  status: "accepted" | "rejected" | "pending" | "unknown" | "already_used" | "no_trackid";
  dgiiEstado: string;
  dgiiCodigo: string;
  fechaRecepcion: string;
  mensajes: string[];
};

export type EcfBatchConsultResponse = {
  outSignedDir: string;
  total: number;
  testSummary: {
    accepted: number;
    rejected: number;
    pending: number;
    unknown: number;
  };
  results: EcfBatchConsultEntry[];
};

export const consultEcfExcelBatchStatus = async (body: {
  out_signed_dir: string;
}): Promise<EcfBatchConsultResponse> =>
  apiFetch<EcfBatchConsultResponse>("/ecf-excel-batch/consult", {
    method: "POST",
    body: JSON.stringify(body),
  });

export type RfceSendResponse = {
  rfceSignedDir: string;
  total: number;
  ok: number;
  fail: number;
  testSummary: { accepted: number; rejected: number };
  successes: {
    file: string;
    encf: string;
    trackId: string;
    status: string;
    testStatus: string;
    testMessage: string;
    responseSnippet: string;
  }[];
  failures: { file: string; error: string; code?: string }[];
  logs: string[];
};

export const sendRfceToDgii = async (body: {
  rfce_signed_dir: string;
}): Promise<RfceSendResponse> =>
  apiFetch<RfceSendResponse>("/ecf-excel-batch/send-rfce", {
    method: "POST",
    body: JSON.stringify(body),
  });
