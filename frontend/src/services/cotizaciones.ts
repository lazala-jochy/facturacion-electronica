import { apiFetch } from "./api";

export type CotizacionItemDraft = {
  quantity: number;
  unit: string;
  description: string;
  unit_price: number;
};

export type CreateClientWithCotizacionPayload = {
  client: {
    name: string;
    rnc_cedula: string;
    phone?: string;
    email?: string;
  };
  cotizacion: {
    payment_terms: string;
    account_manager: string;
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
  apiFetch<{ cotizaciones: unknown[] }>("/cotizaciones", { method: "GET" });

export const getCotizacion = (id: number) =>
  apiFetch<{ cotizacion: unknown; dgii_preview: unknown }>(
    `/cotizaciones/${id}`,
    { method: "GET" },
  );
