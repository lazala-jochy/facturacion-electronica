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
  logs: string[];
  /** Solo cuando todas las filas fallan pero la respuesta es 200. */
  message?: string;
};

export type EcfExcelBatchSendResponse = {
  outSignedDir: string;
  total: number;
  ok: number;
  fail: number;
  successes: { file: string; trackId: string; status: string }[];
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
