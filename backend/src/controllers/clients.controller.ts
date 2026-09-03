import "../types/express-auth.augment";
import type { RequestHandler } from "express";
import { clientService } from "../services/client.service";
import {
  formatDgiiResponseFullMessage,
  isDgiiSequenceRejection,
  summarizeDgiiResponse,
} from "../utils/dgiiRejection";
import { buildEcfNumber } from "../utils/ecfTipo";

const pickRncCedula = (body: Record<string, unknown>) => {
  const v = body.rnc_cedula ?? body.rncCedula;
  return typeof v === "string" ? v : "";
};

export const createClient: RequestHandler = async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }

  if (req.body && typeof req.body === "object") {
    delete (req.body as Record<string, unknown>).company_id;
    delete (req.body as Record<string, unknown>).companyId;
  }

  const name = typeof req.body.name === "string" ? req.body.name : "";
  const address = typeof req.body.address === "string" ? req.body.address : undefined;
  const rncCedula = pickRncCedula(req.body);
  const phone = typeof req.body.phone === "string" ? req.body.phone : undefined;
  const email = typeof req.body.email === "string" ? req.body.email : undefined;

  const out = await clientService.createClientOnly(companyId, {
    name,
    address,
    rncCedula,
    phone,
    email,
  });

  if (!out.ok) {
    res.status(out.status).json({ message: out.message });
    return;
  }

  res.status(201).json({
    message: "Cliente creado.",
    client: {
      id: out.client.id,
      name: out.client.name,
      address: out.client.address,
      rnc_cedula: out.client.rncCedula,
      phone: out.client.phone,
      email: out.client.email,
      company_id: out.client.companyId,
    },
  });
};

export const listClients: RequestHandler = async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }
  const rows = await clientService.listByCompany(companyId);
  res.json({
    clients: rows.map((c) => ({
      id: c.id,
      name: c.name,
      address: c.address,
      rnc_cedula: c.rncCedula,
      phone: c.phone,
      email: c.email,
      company_id: c.companyId,
      created_at: c.createdAt.toISOString(),
      cotizaciones: c.cotizaciones.map((z) => ({
        id: z.id,
        number: z.number,
        ecf_tipo: z.ecfTipo,
        ecf_ncf_seq: z.ecfNcfSeq,
        ecf_number:
          z.ecfNcfSeq > 0 ? buildEcfNumber(z.ecfTipo, z.ecfNcfSeq) : null,
        account_manager: z.accountManager,
        subtotal: z.subtotal,
        itbis: z.itbis,
        total: z.total,
        dgii_status: z.dgiiStatus,
        dgii_track_id: z.dgiiTrackId,
        dgii_submitted_at: z.dgiiSubmittedAt?.toISOString() ?? null,
        dgii_submit_retry_count: z.dgiiSubmitRetryCount ?? 0,
        dgii_submit_next_retry_at: z.dgiiSubmitNextRetryAt?.toISOString() ?? null,
        dgii_submit_last_error: z.dgiiSubmitLastError ?? null,
        dgii_rejection_summary:
          z.dgiiStatus === "rejected" && z.dgiiResponse?.trim()
            ? summarizeDgiiResponse(z.dgiiResponse)
            : null,
        dgii_rejection_full:
          z.dgiiStatus === "rejected" && z.dgiiResponse?.trim()
            ? formatDgiiResponseFullMessage(z.dgiiResponse)
            : null,
        dgii_resubmit_new_seq:
          z.dgiiStatus === "rejected" && z.dgiiResponse?.trim()
            ? isDgiiSequenceRejection(z.dgiiResponse)
            : false,
        created_at: z.createdAt.toISOString(),
      })),
    })),
  });
};

export const updateClient: RequestHandler = async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }

  const clientId = Number(req.params.id);
  if (!Number.isFinite(clientId) || clientId <= 0) {
    res.status(400).json({ message: "ID de cliente invalido." });
    return;
  }

  if (req.body && typeof req.body === "object") {
    delete (req.body as Record<string, unknown>).company_id;
    delete (req.body as Record<string, unknown>).companyId;
  }

  const name = typeof req.body.name === "string" ? req.body.name : "";
  const address = typeof req.body.address === "string" ? req.body.address : undefined;
  const rncCedula = pickRncCedula(req.body);
  const phone = typeof req.body.phone === "string" ? req.body.phone : undefined;
  const email = typeof req.body.email === "string" ? req.body.email : undefined;

  const out = await clientService.updateClient(companyId, clientId, {
    name,
    address,
    rncCedula,
    phone,
    email,
  });

  if (!out.ok) {
    res.status(out.status).json({ message: out.message });
    return;
  }

  res.json({
    message: "Cliente actualizado.",
    client: {
      id: out.client.id,
      name: out.client.name,
      address: out.client.address,
      rnc_cedula: out.client.rncCedula,
      phone: out.client.phone,
      email: out.client.email,
      company_id: out.client.companyId,
    },
  });
};

export const deleteClient: RequestHandler = async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }

  const clientId = Number(req.params.id);
  if (!Number.isFinite(clientId) || clientId <= 0) {
    res.status(400).json({ message: "ID de cliente invalido." });
    return;
  }

  const out = await clientService.deleteClient(companyId, clientId);
  if (!out.ok) {
    res.status(out.status).json({ message: out.message });
    return;
  }

  res.json({ message: "Cliente eliminado." });
};
