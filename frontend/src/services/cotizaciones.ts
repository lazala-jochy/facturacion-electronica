import { apiFetch } from "./api";
import { apiUrl } from "./api";
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

export const generateEcfXml = (id: number) =>
  apiFetch<{ message: string; ecf_number: string; xml: string }>(
    `/cotizaciones/${id}/ecf/xml`,
    { method: "GET" },
  );

export const submitEcf = (id: number) =>
  apiFetch<{
    message: string;
    status: "accepted" | "rejected";
    track_id: string;
    accepted: boolean;
    dgii_response: string;
  }>(`/cotizaciones/${id}/ecf/submit`, {
    method: "POST",
    body: JSON.stringify({}),
  });

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

