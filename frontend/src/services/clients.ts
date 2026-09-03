import type { ClientCreatedResponse, CreateClientPayload } from "../types/session";
import { apiFetch } from "./api";

export const createClient = (payload: CreateClientPayload) =>
  apiFetch<ClientCreatedResponse>("/clients", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export type ClientListItem = {
  id: number;
  name: string;
  address?: string | null;
  rnc_cedula: string;
  phone: string | null;
  email: string | null;
  company_id: number;
  created_at?: string;
  cotizaciones: Array<{
    id: number;
    number: number;
    ecf_tipo?: string;
    ecf_ncf_seq?: number;
    ecf_number?: string | null;
    account_manager?: string | null;
    subtotal: number;
    itbis: number;
    total: number;
    dgii_status?: string | null;
    dgii_track_id?: string | null;
    dgii_submitted_at?: string | null;
    dgii_rejection_summary?: string | null;
    dgii_rejection_full?: string | null;
    dgii_resubmit_new_seq?: boolean;
    created_at: string;
  }>;
};

function normalizeClientListItem(raw: ClientListItem): ClientListItem {
  return {
    ...raw,
    cotizaciones: (Array.isArray(raw.cotizaciones) ? raw.cotizaciones : []).map((c) => ({
      ...c,
      number: Number(c.number),
      total: Number(c.total),
      subtotal: Number(c.subtotal),
      itbis: Number(c.itbis),
    })),
  };
}

export const listClients = async () => {
  const data = await apiFetch<{ clients?: ClientListItem[] }>("/clients", { method: "GET" });
  const list = Array.isArray(data.clients) ? data.clients : [];
  return { clients: list.map(normalizeClientListItem) };
};

export const updateClient = (id: number, payload: CreateClientPayload) =>
  apiFetch<ClientCreatedResponse>(`/clients/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const deleteClient = (id: number) =>
  apiFetch<{ message: string }>(`/clients/${id}`, {
    method: "DELETE",
  });
