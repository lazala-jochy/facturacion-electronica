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
  cotizaciones: Array<{
    id: number;
    number: number;
    subtotal: number;
    itbis: number;
    total: number;
    dgii_status?: string | null;
    dgii_track_id?: string | null;
    dgii_submitted_at?: string | null;
    created_at: string;
  }>;
};

export const listClients = () =>
  apiFetch<{ clients: ClientListItem[] }>("/clients", { method: "GET" });

export const updateClient = (id: number, payload: CreateClientPayload) =>
  apiFetch<ClientCreatedResponse>(`/clients/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const deleteClient = (id: number) =>
  apiFetch<{ message: string }>(`/clients/${id}`, {
    method: "DELETE",
  });
