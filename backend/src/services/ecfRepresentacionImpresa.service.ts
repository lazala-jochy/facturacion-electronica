import fs from "node:fs/promises";
import path from "node:path";
import type { Company } from "@prisma/client";
import { prisma } from "../prisma";
import { normalizeEcfTipo } from "../utils/ecfTipo";
import { buildConsultaTimbreQrUrl } from "../utils/ecfConsultaTimbreQr";
import { buildRepresentacionImpresaPdfBuffer } from "../utils/ecfRepresentacionImpresaPdf";

export type PersistRiParams = {
  uploadsRoot: string;
  cotizacionId: number;
  company: Pick<Company, "id" | "dgiiEnvironment" | "name">;
  signedXml: string;
  ecfTipo: string;
  fechaFirma: Date;
  dgiiTrackId: string | null;
};

export const persistRepresentacionImpresa = async (
  p: PersistRiParams,
): Promise<{ relativePath: string; qrUrl: string } | null> => {
  if (!p.signedXml?.trim()) return null;

  const qrUrl = buildConsultaTimbreQrUrl({
    signedXml: p.signedXml,
    dgiiEnvironment: p.company.dgiiEnvironment,
    ecfTipo: p.ecfTipo,
    fechaFirma: p.fechaFirma,
  });

  const pdfBuf = await buildRepresentacionImpresaPdfBuffer({
    signedXml: p.signedXml,
    company: p.company,
    ecfTipo: p.ecfTipo,
    fechaFirma: p.fechaFirma,
    dgiiTrackId: p.dgiiTrackId,
  });

  const relativePath = path.join("ecf-ri", String(p.company.id), `${p.cotizacionId}.pdf`);
  const absPath = path.join(p.uploadsRoot, relativePath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, pdfBuf);

  await prisma.cotizacion.update({
    where: { id: p.cotizacionId },
    data: {
      ecfRiPdfPath: relativePath.replace(/\\/g, "/"),
      ecfRiQrUrl: qrUrl,
      ecfRiGeneratedAt: new Date(),
    },
  });

  return { relativePath: relativePath.replace(/\\/g, "/"), qrUrl };
};

type EnsureRiOk = { ok: true; buffer: Buffer; filename: string };
type EnsureRiErr = { ok: false; status: number; message: string };

/** Sirve el PDF guardado o lo regenera desde `signed_xml` si falta el archivo. */
export async function ensureRepresentacionImpresaPdfForCotizacion(
  cotizacionId: number,
  companyId: number,
  uploadsRoot: string,
): Promise<EnsureRiOk | EnsureRiErr> {
  const row = await prisma.cotizacion.findFirst({
    where: { id: cotizacionId, companyId },
    include: { company: true },
  });
  if (!row) {
    return { ok: false, status: 404, message: "Cotizacion no encontrada." };
  }
  if (!row.signedXml?.trim()) {
    return {
      ok: false,
      status: 400,
      message: "No hay comprobante firmado. Enviá primero el e-CF a DGII.",
    };
  }

  const rel = row.ecfRiPdfPath?.trim();
  if (rel) {
    const abs = path.join(uploadsRoot, rel);
    try {
      const buffer = await fs.readFile(abs);
      return { ok: true, buffer, filename: `representacion-ecf-${cotizacionId}.pdf` };
    } catch {
      // Archivo perdido: regenerar
    }
  }

  const fechaFirma = row.dgiiSubmittedAt ?? new Date();
  const out = await persistRepresentacionImpresa({
    uploadsRoot,
    cotizacionId,
    company: {
      id: row.company.id,
      dgiiEnvironment: row.company.dgiiEnvironment,
      name: row.company.name,
    },
    signedXml: row.signedXml,
    ecfTipo: normalizeEcfTipo(row.ecfTipo),
    fechaFirma,
    dgiiTrackId: row.dgiiTrackId,
  });
  if (!out) {
    return { ok: false, status: 500, message: "No se pudo generar la representación impresa." };
  }
  const buffer = await fs.readFile(path.join(uploadsRoot, out.relativePath));
  return { ok: true, buffer, filename: `representacion-ecf-${cotizacionId}.pdf` };
}
