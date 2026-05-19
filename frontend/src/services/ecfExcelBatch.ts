import { ApiError, apiFetch, authenticatedFetch, readAuthSessionFromStorage } from "./api";
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

/** Genera XML y firmados desde el Excel de pruebas e-CF. */
export const runEcfExcelBatchFromApp = async (body: {
  desktop_parent_dir?: string;
  excel_path?: string;
  excel_file?: File;
}): Promise<EcfExcelBatchRunResponse> => {
  if (body.excel_file) {
    const session = readAuthSessionFromStorage();
    if (!session?.token) throw new ApiError("No hay sesión.", 401);

    const fd = new FormData();
    fd.append("excel", body.excel_file);
    if (body.desktop_parent_dir?.trim()) {
      fd.append("desktop_parent_dir", body.desktop_parent_dir.trim());
    }

    let response: Response;
    try {
      response = await authenticatedFetch("/ecf-excel-batch/run", {
        method: "POST",
        body: fd,
      });
    } catch {
      throw new ApiError("No se pudo contactar el servidor.", 0);
    }

    const raw = await response.text();
    let data: Record<string, unknown> = {};
    if (raw.trim()) {
      try {
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        data = { message: raw.trim().slice(0, 500) };
      }
    }
    if (!response.ok) {
      const msg =
        (typeof data.message === "string" && data.message.trim()) ||
        `Solicitud rechazada (${response.status}).`;
      throw new ApiError(msg, response.status, data);
    }
    return data as EcfExcelBatchRunResponse;
  }

  if (!body.excel_path?.trim()) {
    throw new ApiError("Elegí el Excel de pruebas (archivo o ruta).", 400);
  }

  return apiFetch<EcfExcelBatchRunResponse>("/ecf-excel-batch/run", {
    method: "POST",
    body: JSON.stringify({
      excel_path: body.excel_path.trim(),
      desktop_parent_dir: body.desktop_parent_dir,
    }),
  });
};

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
