import { apiFetch, apiUrl, ApiError, readAuthSessionFromStorage } from "./api";
import { AUTH_STORAGE_KEY, type AuthSession } from "../types/session";

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
  account_manager: string;
  subtotal: number;
  itbis: number;
  total: number;
  created_at: string;
  client_name: string;
  client_rnc_cedula?: string;
  dgii_status?: string | null;
  dgii_track_id?: string | null;
  dgii_submitted_at?: string | null;
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
  signed_xml?: string | null;
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
    calc_mode?: "auto" | "manual";
    subtotal?: number;
    itbis?: number;
    total?: number;
  };
  items: CotizacionItemDraft[];
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
  apiFetch<{ message: string; ecf_number: string; xml: string }>(
    `/cotizaciones/${id}/ecf/xml`,
    { method: "GET" },
  );

export type SubmitEcfResult = {
  message: string;
  status: "accepted" | "rejected";
  track_id: string;
  accepted: boolean;
  dgii_response: string;
  certificate_saved?: boolean;
};

export const submitEcf = async (
  id: number,
  opts?: {
    certificate?: File;
    certificatePassword?: string;
    /** Misma clave que al guardar el .p12; obligatoria si ya hay certificado guardado o al subir uno en este envío. */
    certificateEncryptionSecret?: string;
  },
): Promise<SubmitEcfResult> => {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Debes conectarte a internet para enviar a DGII.");
  }
  const session = readAuthSessionFromStorage();
  if (!session?.token) throw new ApiError("No hay sesión.", 401);

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${session.token}`);

  const fd = new FormData();
  const enc = opts?.certificateEncryptionSecret?.trim();
  if (enc) fd.append("certificate_encryption_secret", enc);
  if (opts?.certificate) {
    fd.append("certificate", opts.certificate);
    fd.append("certificate_password", opts.certificatePassword ?? "");
  }

  const response = await fetch(`${apiUrl}/cotizaciones/${id}/ecf/submit`, {
    method: "POST",
    headers,
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
    const session = (() => {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      try {
        const s = JSON.parse(raw) as Partial<AuthSession>;
        if (s?.token && s?.user && s?.company) return s as AuthSession;
        return null;
      } catch {
        return null;
      }
    })();

    const headers = new Headers();
    if (session?.token) {
      headers.set("Authorization", `Bearer ${session.token}`);
    }

    const response = await fetch(`${apiUrl}/cotizaciones/${id}/pdf`, {
      method: "GET",
      headers,
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

