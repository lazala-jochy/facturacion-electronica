import { prisma } from "../prisma";
import { isValidPhoneFormat } from "../utils/validation";

export type CreateClientInput = {
  name: string;
  address?: string | null;
  rncCedula: string;
  phone?: string | null;
  email?: string | null;
};
export type UpdateClientInput = CreateClientInput;

const trimOrNull = (v: string | undefined | null) => {
  if (v == null) return null;
  const t = v.trim();
  return t.length ? t : null;
};

const toDocDigits = (value: string) => value.replace(/\D/g, "");

export const clientService = {
  /** Crea solo el cliente (sin cotización). Para cotización usar `POST /clients-with-cotizacion`. */
  async createClientOnly(companyId: number, input: CreateClientInput) {
    const name = input.name.trim();
    const rncCedula = input.rncCedula.trim();
    if (!name || !rncCedula) {
      return { ok: false as const, status: 400, message: "Nombre y RNC o cedula son obligatorios." };
    }
    if (rncCedula.length < 3 || rncCedula.length > 32) {
      return {
        ok: false as const,
        status: 400,
        message: "RNC o cedula invalida (longitud).",
      };
    }
    const phone = trimOrNull(input.phone ?? undefined);
    if (phone && !isValidPhoneFormat(phone)) {
      return {
        ok: false as const,
        status: 400,
        message: "El telefono del cliente debe tener formato xxx-xxx-xxxx.",
      };
    }

    const client = await prisma.client.create({
      // Guardamos rnc/cedula por separado para facilitar busquedas.
      data: (() => {
        const doc = toDocDigits(rncCedula);
        const isCedula = doc.length === 11;
        const isRnc = doc.length >= 9 && doc.length <= 11;
        return {
          name,
          address: trimOrNull(input.address ?? undefined),
          rncCedula,
          rnc: isRnc ? doc : null,
          cedula: isCedula ? doc : null,
          phone,
          email: trimOrNull(input.email ?? undefined),
          companyId,
        };
      })(),
    });

    return { ok: true as const, client };
  },

  listByCompany(companyId: number) {
    return prisma.client.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      include: {
        cotizaciones: {
          where: { companyId },
          orderBy: { number: "desc" },
          select: {
            id: true,
            number: true,
            ecfTipo: true,
            ecfNcfSeq: true,
            subtotal: true,
            itbis: true,
            total: true,
            dgiiStatus: true,
            dgiiTrackId: true,
            dgiiResponse: true,
            dgiiSubmittedAt: true,
            dgiiSubmitRetryCount: true,
            dgiiSubmitNextRetryAt: true,
            dgiiSubmitLastError: true,
            createdAt: true,
          },
        },
      },
    });
  },

  async updateClient(companyId: number, clientId: number, input: UpdateClientInput) {
    const name = input.name.trim();
    const rncCedula = input.rncCedula.trim();
    if (!name || !rncCedula) {
      return { ok: false as const, status: 400, message: "Nombre y RNC o cedula son obligatorios." };
    }
    if (rncCedula.length < 3 || rncCedula.length > 32) {
      return {
        ok: false as const,
        status: 400,
        message: "RNC o cedula invalida (longitud).",
      };
    }
    const phone = trimOrNull(input.phone ?? undefined);
    if (phone && !isValidPhoneFormat(phone)) {
      return {
        ok: false as const,
        status: 400,
        message: "El telefono del cliente debe tener formato xxx-xxx-xxxx.",
      };
    }

    const existing = await prisma.client.findFirst({
      where: {
        id: clientId,
        companyId,
      },
      select: { id: true },
    });
    if (!existing) {
      return { ok: false as const, status: 404, message: "Cliente no encontrado." };
    }

    const doc = toDocDigits(rncCedula);
    const isCedula = doc.length === 11;
    const isRnc = doc.length >= 9 && doc.length <= 11;
    const client = await prisma.client.update({
      where: { id: clientId },
      data: {
        name,
        address: trimOrNull(input.address ?? undefined),
        rncCedula,
        rnc: isRnc ? doc : null,
        cedula: isCedula ? doc : null,
        phone,
        email: trimOrNull(input.email ?? undefined),
      },
    });

    return { ok: true as const, client };
  },

  async deleteClient(companyId: number, clientId: number) {
    const existing = await prisma.client.findFirst({
      where: {
        id: clientId,
        companyId,
      },
      select: { id: true },
    });
    if (!existing) {
      return { ok: false as const, status: 404, message: "Cliente no encontrado." };
    }

    await prisma.client.delete({
      where: { id: clientId },
    });

    return { ok: true as const };
  },
};
