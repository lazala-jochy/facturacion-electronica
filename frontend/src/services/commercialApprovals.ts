import { apiFetch, authenticatedFetch, readAuthSessionFromStorage, ApiError } from "./api";

export type CommercialApprovalResult = {
  ok: boolean;
  encf: string;
  filename: string;
  unsignedPath?: string;
  signedPath?: string;
  signedXml?: string;
  dgii?: {
    accepted: boolean;
    validation: string;
    message: string;
    encf?: string;
    rawResponse?: string;
    httpStatus?: number;
  };
  error?: string;
};

export type CommercialApprovalBatchRunResponse = {
  success?: boolean;
  outputRoot: string;
  outXmlDir: string;
  outSignedDir: string;
  excelPath: string;
  rowCount: number;
  fail: number;
  ok: number;
  results: CommercialApprovalResult[];
};

export type CommercialApprovalBatchSendResponse = {
  success?: boolean;
  sent: number;
  failed: number;
  skipped: number;
  results: Array<{
    file: string;
    encf?: string;
    ok: boolean;
    dgiiValidation?: string;
    dgiiMessage?: string;
    error?: string;
  }>;
};

export type AcceptCommercialApprovalBody = {
  encf: string;
  rnc_emisor?: string;
  rnc_comprador: string;
  fecha_emision?: string;
  monto_total?: string | number;
  send_to_dgii?: boolean;
  desktop_parent_dir?: string;
};

export async function acceptCommercialApproval(
  body: AcceptCommercialApprovalBody,
): Promise<CommercialApprovalResult> {
  return apiFetch<CommercialApprovalResult>("/commercial-approvals/accept", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function rejectCommercialApproval(
  body: AcceptCommercialApprovalBody & { detalle_motivo_rechazo: string },
): Promise<CommercialApprovalResult> {
  return apiFetch<CommercialApprovalResult>("/commercial-approvals/reject", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function runCommercialApprovalBatch(body: {
  excel_path?: string;
  excel_file?: File;
  desktop_parent_dir?: string;
}): Promise<CommercialApprovalBatchRunResponse> {
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
      response = await authenticatedFetch("/commercial-approvals/batch/run", {
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
    return data as CommercialApprovalBatchRunResponse;
  }

  if (!body.excel_path?.trim()) {
    throw new ApiError("Elegí el Excel oficial (archivo o ruta absoluta).", 400);
  }

  return apiFetch<CommercialApprovalBatchRunResponse>("/commercial-approvals/batch/run", {
    method: "POST",
    body: JSON.stringify({
      excel_path: body.excel_path.trim(),
      desktop_parent_dir: body.desktop_parent_dir,
    }),
  });
}

export async function sendCommercialApprovalBatch(body: {
  out_signed_dir: string;
}): Promise<CommercialApprovalBatchSendResponse> {
  return apiFetch<CommercialApprovalBatchSendResponse>("/commercial-approvals/batch/send", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
