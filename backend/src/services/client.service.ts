import { prisma } from "../prisma";

export type CreateClientInput = {
  name: string;
  rncCedula: string;
  phone?: string | null;
  email?: string | null;
};

const trimOrNull = (v: string | undefined | null) => {
  if (v == null) return null;
  const t = v.trim();
  return t.length ? t : null;
};

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
      data: {
        name,
        rncCedula,
        phone: trimOrNull(input.phone ?? undefined),
        email: trimOrNull(input.email ?? undefined),
        companyId,
      },
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
            createdAt: true,
          },
        },
      },
    });
  },
};
