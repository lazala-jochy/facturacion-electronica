import { apiFetch, authenticatedFetch, ApiError, readAuthSessionFromStorage } from "./api";

export type CotizacionItemDraft = {
  quantity: number;
  unit: string;
  description: string;
  unit_price: number;
};

export type CotizacionListItem = {
  id: number;
  number: number;
  client_id: number;
  company_id: number;
  payment_terms: string;
  payment_method?: string | null;
  account_manager: string;
  comment?: string | null;
  subtotal: number;
  itbis: number;
  total: number;
  created_at: string;
  client_name: string;
  client_rnc_cedula?: string;
  dgii_status?: string | null;
  dgii_track_id?: string | null;
  dgii_submitted_at?: string | null;
  dgii_rejection_summary?: string | null;
  dgii_resubmit_new_seq?: boolean;
  ecf_tipo?: string;
  ecf_ncf_seq?: number | null;
  ecf_reference_ncf?: string | null;
  items_count: number;
};

export type CotizacionDetail = {
  id: number;
  number: number;
  created_at?: string;
  payment_terms?: string;
  payment_method?: string | null;
  account_manager?: string;
  comment?: string | null;
  subtotal?: number;
  itbis?: number;
  total: number;
  dgii_status?: string | null;
  dgii_track_id?: string | null;
  dgii_response?: string | null;
  dgii_rejection_summary?: string | null;
  dgii_resubmit_new_seq?: boolean;
  signed_xml?: string | null;
  ecf_ri_pdf_path?: string | null;
  ecf_ri_qr_url?: string | null;
  ecf_ri_generated_at?: string | null;
  ecf_tipo?: string;
  ecf_ncf_seq?: number;
  ecf_reference_ncf?: string | null;
  client: {
    name: string;
    rnc_cedula: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  items?: Array<{
    item_number: number;
    quantity: number;
    unit: string;
    description: string;
    unit_price: number;
    total_value: number;
  }>;
};

export type CreateClientWithCotizacionPayload = {
  client: {
    name: string;
    address?: string;
    rnc_cedula: string;
    phone?: string;
    email?: string;
  };
  cotizacion: {
    payment_terms: string;
    payment_method?: string;
    account_manager: string;
    comment?: string;
    ecf_tipo?: string;
    ecf_reference_ncf?: string;
    calc_mode?: "auto" | "manual";
    subtotal?: number;
    itbis?: number;
    total?: number;
  };
  items: CotizacionItemDraft[];
  /** Clave de cifrado del .p12 (mín. 8); obligatoria si la empresa tiene certificado sin clave guardada en perfil. */
  certificate_encryption_secret?: string;
};

export const createClientWithCotizacion = (payload: CreateClientWithCotizacionPayload) =>
  apiFetch<{
    message: string;
    client: Record<string, unknown>;
    cotizacion: Record<string, unknown>;
    dgii_preview: Record<string, unknown>;
  }>("/clients-with-cotizacion", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const listCotizaciones = () =>
  apiFetch<{ cotizaciones: CotizacionListItem[] }>("/cotizaciones", { method: "GET" });

export const getCotizacion = (id: number) =>
  apiFetch<{ cotizacion: CotizacionDetail; dgii_preview: Record<string, unknown> }>(
    `/cotizaciones/${id}`,
    { method: "GET" },
  );

export const updateCotizacion = (id: number, payload: CreateClientWithCotizacionPayload) =>
  apiFetch<{
    message: string;
    cotizacion: CotizacionDetail;
    dgii_preview: Record<string, unknown>;
  }>(`/cotizaciones/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const deleteCotizacion = (id: number) =>
  apiFetch<{ message: string }>(`/cotizaciones/${id}`, {
    method: "DELETE",
  });

export const generateEcfXml = (id: number) =>
  apiFetch<{ message: string; ecf_number: string; xml: string; signed?: boolean }>(
    `/cotizaciones/${id}/ecf/xml`,
    { method: "GET" },
  );

/** Firma el XML con el certificado de la empresa sin enviar a DGII (misma autenticación que submit). */
export type ConsumoMenor250PackResponse = {
  message: string;
  ecf_number: string;
  codigo_seguridade_cf: string;
  integra_signed_xml: string;
  rfce_signed_xml: string;
};

/** Genera y firma RFCE + e-CF íntegro (consumo 32 &lt; RD$250k) para subida manual a CerteCF. */
export type SubmitConsumoMenor250RfceResult = {
  message: string;
  flow: string;
  document_type: string;
  ecf_number: string;
  codigo_seguridade_cf: string;
  dgii_status: "accepted" | "rejected" | "pending";
  dgii_response: string;
};

/** Genera RFCE + e-CF íntegro y envía el RFCE a DGII (tipo 32 &lt; RD$250k). */
export const submitConsumoMenor250Rfce = async (
  id: number,
  opts?: {
    certificate?: File;
    certificatePassword?: string;
    certificateEncryptionSecret?: string;
  },
): Promise<SubmitConsumoMenor250RfceResult> => {
  const session = readAuthSessionFromStorage();
  if (!session?.token) throw new ApiError("No hay sesión.", 401);

  const fd = new FormData();
  const fromCompany = session.company?.certificate_keyphrase?.trim() ?? "";
  const enc = (opts?.certificateEncryptionSecret?.trim() || fromCompany || "").trim();
  if (enc.length >= 8) fd.append("certificate_encryption_secret", enc);
  if (opts?.certificate) {
    fd.append("certificate", opts.certificate);
    fd.append("certificate_password", opts.certificatePassword ?? "");
  }

  const response = await authenticatedFetch(`/cotizaciones/${id}/ecf/submit-rfce`, {
    method: "POST",
    body: fd,
  });
  const data = (await response.json().catch(() => ({}))) as SubmitConsumoMenor250RfceResult & {
    message?: string;
    code?: string;
  };
  if (!response.ok) {
    throw new ApiError(data.message ?? "No se pudo enviar el RFCE.", response.status, data as Record<string, unknown>);
  }
  return data;
};

/** Descarga el e-CF íntegro ya firmado (mismo del envío RFCE; no re-firma). */
export const downloadConsumoMenor250Integra = async (id: number): Promise<string> => {
  const response = await authenticatedFetch(`/cotizaciones/${id}/ecf/consumo-menor-250-integra`);
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(
      data.message ?? "No hay e-CF íntegro guardado. Enviá el RFCE primero.",
      response.status,
    );
  }
  return response.text();
};

export const buildConsumoMenor250Pack = async (
  id: number,
  opts?: {
    certificate?: File;
    certificatePassword?: string;
    certificateEncryptionSecret?: string;
    /** Si se indica, la respuesta es el archivo XML (attachment) en lugar de JSON. */
    downloadPart?: "rfce" | "integra";
  },
): Promise<ConsumoMenor250PackResponse | string> => {
  const session = readAuthSessionFromStorage();
  if (!session?.token) throw new ApiError("No hay sesión.", 401);

  const fd = new FormData();
  const fromCompany = session.company?.certificate_keyphrase?.trim() ?? "";
  const enc = (opts?.certificateEncryptionSecret?.trim() || fromCompany || "").trim();
  if (enc.length >= 8) fd.append("certificate_encryption_secret", enc);
  if (opts?.certificate) {
    fd.append("certificate", opts.certificate);
    fd.append("certificate_password", opts.certificatePassword ?? "");
  }

  const q = opts?.downloadPart ? `?part=${encodeURIComponent(opts.downloadPart)}` : "";
  const response = await authenticatedFetch(`/cotizaciones/${id}/ecf/consumo-menor-250-pack${q}`, {
    method: "POST",
    body: fd,
  });

  if (opts?.downloadPart) {
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      throw new ApiError(data.message ?? "No se pudo generar el XML.", response.status);
    }
    return response.text();
  }

  const data = (await response.json().catch(() => ({}))) as ConsumoMenor250PackResponse & {
    message?: string;
  };
  if (!response.ok) {
    throw new ApiError(data.message ?? "No se pudo generar el paquete RFCE.", response.status, data as Record<string, unknown>);
  }
  return data;
};

export const signEcfXmlLocal = async (
  id: number,
  opts?: {
    certificate?: File;
    certificatePassword?: string;
    certificateEncryptionSecret?: string;
  },
): Promise<{ message: string; ecf_number: string; signed_xml: string }> => {
  const session = readAuthSessionFromStorage();
  if (!session?.token) throw new ApiError("No hay sesión.", 401);

  const fd = new FormData();
  const fromCompany = session.company?.certificate_keyphrase?.trim() ?? "";
  const enc = (opts?.certificateEncryptionSecret?.trim() || fromCompany || "").trim();
  if (enc.length >= 8) fd.append("certificate_encryption_secret", enc);
  if (opts?.certificate) {
    fd.append("certificate", opts.certificate);
    fd.append("certificate_password", opts.certificatePassword ?? "");
  }

  const response = await authenticatedFetch(`/cotizaciones/${id}/ecf/sign`, {
    method: "POST",
    body: fd,
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string; signed_xml?: string; ecf_number?: string; code?: string };
  if (!response.ok) {
    throw new ApiError(data.message ?? "No se pudo firmar el XML.", response.status, data as Record<string, unknown>);
  }
  return data as { message: string; ecf_number: string; signed_xml: string };
};

/** Consulta estado en DGII por trackId guardado en la cotización (GET). Opcional `dgii_cert_profile=paso4` si usás solo URLs Paso 4. */
export const queryDgiiEcfForCotizacion = (
  id: number,
  opts?: { dgiiCertProfile?: "paso2" | "paso4" },
) => {
  const q =
    opts?.dgiiCertProfile != null
      ? `?dgii_cert_profile=${encodeURIComponent(opts.dgiiCertProfile)}`
      : "";
  return apiFetch<{
    message: string;
    http_status: number;
    dgii_response: string;
    dgii_status?: string | null;
  }>(
    `/cotizaciones/${id}/ecf/dgii/query${q}`,
    { method: "GET" },
  );
};

export type SubmitEcfResult = {
  message: string;
  status: "accepted" | "rejected" | "prepared" | "pending";
  track_id: string;
  accepted: boolean;
  dgii_response: string;
  certificate_saved?: boolean;
  /** Correlativo e-NCF guardado tras el envío (p. ej. tras rechazo por secuencia). */
  ecf_ncf_seq?: number;
  /** e-NCF completo, p. ej. E310000000017 */
  ecf_number?: string;
  /** Resumen legible del estado DGII (aceptado, rechazado o pendiente). */
  dgii_status_summary?: string;
  /** Presente si status === rejected: texto legible de mensajes DGII. */
  dgii_rejection_summary?: string;
  /** true si el rechazo se clasifica como secuencia/correlativo (avanzar e-NCF). */
  dgii_resubmit_new_seq?: boolean;
};

export const submitEcf = async (
  id: number,
  opts?: {
    certificate?: File;
    certificatePassword?: string;
    /** Misma clave que al guardar el .p12; obligatoria si ya hay certificado guardado o al subir uno en este envío. */
    certificateEncryptionSecret?: string;
    /** Solo certificación: paso2 (URLs estándar) vs paso4 (simulación e-CF). */
    dgiiCertProfile?: "paso2" | "paso4";
  },
): Promise<SubmitEcfResult> => {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Debes conectarte a internet para enviar a DGII.");
  }
  const session = readAuthSessionFromStorage();
  if (!session?.token) throw new ApiError("No hay sesión.", 401);

  const fd = new FormData();
  const fromCompany = session.company?.certificate_keyphrase?.trim() ?? "";
  const enc = (opts?.certificateEncryptionSecret?.trim() || fromCompany || "").trim();
  if (enc.length >= 8) fd.append("certificate_encryption_secret", enc);
  const profile = opts?.dgiiCertProfile ?? "paso2";
  fd.append("dgii_cert_profile", profile);
  if (opts?.certificate) {
    fd.append("certificate", opts.certificate);
    fd.append("certificate_password", opts.certificatePassword ?? "");
  }

  const response = await authenticatedFetch(`/cotizaciones/${id}/ecf/submit`, {
    method: "POST",
    body: fd,
  });
  const data = (await response.json().catch(() => ({}))) as SubmitEcfResult & {
    message?: string;
    code?: string;
  };

  if (!response.ok) {
    throw new ApiError(data.message ?? "No se pudo enviar.", response.status, data as Record<string, unknown>);
  }
  return data as SubmitEcfResult;
};

/**
 * Descarga una cotización en formato PDF
 */
export const downloadCotizacionPDF = async (id: number, fileName?: string) => {
  try {
    const response = await authenticatedFetch(`/cotizaciones/${id}/pdf`, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error("No se pudo descargar el PDF");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || `cotizacion-${id}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : "Error al descargar el PDF"
    );
  }
};

/** Representación impresa e-CF (PDF con QR consulta timbre DGII). */
export const downloadRepresentacionImpresaEcf = async (id: number, fileName?: string) => {
  const session = readAuthSessionFromStorage();
  if (!session?.token) throw new Error("No hay sesión.");

  const response = await authenticatedFetch(`/cotizaciones/${id}/ecf/representacion-impresa`, {
    method: "GET",
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? "No se pudo descargar la representación impresa.");
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || `representacion-ecf-${id}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

