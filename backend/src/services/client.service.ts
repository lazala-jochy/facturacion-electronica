import { prisma } from "../prisma";

export type CreateClientInput = {
  name: string;
  address?: string | null;
  rncCedula: string;
  phone?: string | null;
  email?: string | null;
};

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
          phone: trimOrNull(input.phone ?? undefined),
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
      orderBy: { id: "desc" },
      include: {
        cotizaciones: {
          where: { companyId },
          orderBy: { id: "desc" },
          take: 3,
          select: {
            id: true,
            number: true,
            subtotal: true,
            itbis: true,
            total: true,
            dgiiStatus: true,
            dgiiTrackId: true,
            dgiiSubmittedAt: true,
            createdAt: true,
          },
        },
      },
    });
  },
};
