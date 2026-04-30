import "../types/express-auth.augment";
import type { RequestHandler } from "express";
import { clientService } from "../services/client.service";

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
  const rncCedula = pickRncCedula(req.body);
  const phone = typeof req.body.phone === "string" ? req.body.phone : undefined;
  const email = typeof req.body.email === "string" ? req.body.email : undefined;

  const out = await clientService.createClientOnly(companyId, {
    name,
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
      rnc_cedula: c.rncCedula,
      phone: c.phone,
      email: c.email,
      company_id: c.companyId,
      cotizaciones: c.cotizaciones.map((z) => ({
        id: z.id,
        number: z.number,
        subtotal: z.subtotal,
        itbis: z.itbis,
        total: z.total,
        created_at: z.createdAt.toISOString(),
      })),
    })),
  });
};
