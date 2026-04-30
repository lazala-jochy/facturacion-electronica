import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { submitEcfToDgii, type DgiiSubmissionResult } from "./dgiiService";
import { signXml, type CertificateInput } from "./signer";
import { validateEcfPayload, type EcfPayload } from "./validation";
import { buildEcfXml } from "./xmlBuilder";

const buildEcfNumber = (cotizacionNumber: number) => `E3100000000${String(cotizacionNumber).padStart(8, "0")}`;

const contactFromClient = (phone?: string | null, email?: string | null) => {
  if (phone?.trim() && email?.trim()) return `${phone.trim()} | ${email.trim()}`;
  return phone?.trim() || email?.trim() || undefined;
};

type CotizacionWithRelations = Prisma.CotizacionGetPayload<{
  include: { company: true; client: true; items: true };
}>;

const toPayload = (cotizacion: CotizacionWithRelations): EcfPayload => ({
  ecfNumber: buildEcfNumber(cotizacion.number),
  issueDate: cotizacion.createdAt,
  issuer: {
    rnc: cotizacion.company.rnc,
    name: cotizacion.company.name,
    address: cotizacion.company.address,
    phone: cotizacion.company.phone,
    email: cotizacion.company.email,
  },
  buyer: {
    name: cotizacion.client.name,
    rncCedula: cotizacion.client.rncCedula,
    address: cotizacion.client.address,
    contact: contactFromClient(cotizacion.client.phone, cotizacion.client.email),
  },
  items: cotizacion.items.map((item) => ({
    itemNumber: item.itemNumber,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    totalValue: item.totalValue,
  })),
  subtotal: cotizacion.subtotal,
  itbis: cotizacion.itbis,
  total: cotizacion.total,
});

export const ecfService = {
  async generateForCotizacion(cotizacionId: number, companyId: number) {
    const cotizacion = await prisma.cotizacion.findFirst({
      where: { id: cotizacionId, companyId },
      include: { company: true, client: true, items: { orderBy: { itemNumber: "asc" } } },
    });
    if (!cotizacion) {
      return {
        ok: false as const,
        status: 404,
        message: "Cotizacion no encontrada.",
      };
    }

    const payload = toPayload(cotizacion);
    const validation = validateEcfPayload(payload);
    if (!validation.valid) {
      return {
        ok: false as const,
        status: 400,
        message: "Validacion e-CF fallida.",
        errors: validation.errors,
      };
    }

    const xml = buildEcfXml(payload);
    await prisma.cotizacion.update({
      where: { id: cotizacionId },
      data: {
        dgiiStatus: "prepared",
        dgiiResponse: JSON.stringify({
          stage: "prepared",
          message: "XML e-CF generado y listo para envio.",
        }),
      },
    });
    return {
      ok: true as const,
      payload,
      xml,
    };
  },

  async submitForCotizacion(
    cotizacionId: number,
    companyId: number,
    certificateInput?: CertificateInput,
  ) {
    const generation = await this.generateForCotizacion(cotizacionId, companyId);
    if (!generation.ok) return generation;

    const signedXml = await signXml(generation.xml, certificateInput);
    let dgiiResponse: DgiiSubmissionResult;
    try {
      dgiiResponse = await submitEcfToDgii(signedXml);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error de red al enviar a DGII.";
      return {
        ok: false as const,
        status: 503,
        message: `No se pudo enviar a DGII. Verifica la conexion a internet. (${message})`,
      };
    }

    await prisma.cotizacion.update({
      where: { id: cotizacionId },
      data: {
        signedXml,
        dgiiTrackId: dgiiResponse.trackId,
        dgiiStatus: dgiiResponse.status,
        dgiiResponse: dgiiResponse.rawResponse,
        dgiiSubmittedAt: new Date(),
      },
    });

    return {
      ok: true as const,
      xml: generation.xml,
      signedXml,
      dgiiResponse,
    };
  },
};
