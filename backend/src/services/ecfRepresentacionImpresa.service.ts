import fs from "node:fs/promises";
import path from "node:path";
import type { Company } from "@prisma/client";
import { prisma } from "../prisma";
import { normalizeEcfTipo } from "../utils/ecfTipo";
import { buildConsultaTimbreQrUrl } from "../utils/ecfConsultaTimbreQr";
import { buildRepresentacionImpresaPdfBuffer } from "../utils/ecfRepresentacionImpresaPdf";
import { extractXmlTagValue } from "../utils/ecfXmlExtract";

export type PersistRiParams = {
  uploadsRoot: string;
  cotizacionId: number;
  company: Pick<Company, "id" | "dgiiEnvironment" | "name" | "logoUrl">;
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
    uploadsRoot: p.uploadsRoot,
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

  const fechaFirma = row.dgiiSubmittedAt ?? new Date();
  const qrUrlActual = buildConsultaTimbreQrUrl({
    signedXml: row.signedXml,
    dgiiEnvironment: row.company.dgiiEnvironment,
    ecfTipo: normalizeEcfTipo(row.ecfTipo),
    fechaFirma,
  });
  const qrGuardado = row.ecfRiQrUrl?.trim() ?? "";
  const riDesactualizada = qrGuardado.length > 0 && qrGuardado !== qrUrlActual;

  const rel = row.ecfRiPdfPath?.trim();
  if (rel && !riDesactualizada) {
    const abs = path.join(uploadsRoot, rel);
    try {
      const buffer = await fs.readFile(abs);
      return { ok: true, buffer, filename: `representacion-ecf-${cotizacionId}.pdf` };
    } catch {
      // Archivo perdido: regenerar
    }
  }

  const out = await persistRepresentacionImpresa({
    uploadsRoot,
    cotizacionId,
    company: {
      id: row.company.id,
      dgiiEnvironment: row.company.dgiiEnvironment,
      name: row.company.name,
      logoUrl: row.company.logoUrl,
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

export type GenerateRiBatchResult = {
  outRiDir: string;
  ok: number;
  fail: number;
  paths: string[];
  errors: { file: string; error: string }[];
};

const isSignedEcfXml = (signedXml: string) => /<\s*ECF[\s>]/i.test(signedXml);

/** Genera PDFs de RI desde carpetas de lote Excel (firmados + consumo íntegros). */
export async function generateRiPdfsForBatchOutput(params: {
  ecfSignedDir: string;
  consumoIntegrasSignedDir?: string;
  dgiiEnvironment: string | null;
  uploadsRoot?: string;
  company?: Pick<Company, "id" | "logoUrl">;
}): Promise<GenerateRiBatchResult> {
  const outRiDir = path.join(path.dirname(params.ecfSignedDir), "representacion-impresa");
  await fs.mkdir(outRiDir, { recursive: true });

  const seenEncf = new Set<string>();
  const sources: { signedXml: string; baseName: string }[] = [];

  const pushDir = async (dir: string | undefined) => {
    if (!dir?.trim()) return;
    let entries: string[] = [];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const file of entries) {
      if (!file.toLowerCase().endsWith(".xml")) continue;
      const full = path.join(dir, file);
      const signedXml = await fs.readFile(full, "utf8");
      if (!signedXml.trim() || !isSignedEcfXml(signedXml)) continue;
      const encf = extractXmlTagValue(signedXml, "eNCF").replace(/\s/g, "");
      if (encf && seenEncf.has(encf)) continue;
      if (encf) seenEncf.add(encf);
      sources.push({ signedXml, baseName: path.basename(file, ".xml") });
    }
  };

  await pushDir(params.consumoIntegrasSignedDir);
  await pushDir(params.ecfSignedDir);

  const company = {
    id: params.company?.id,
    dgiiEnvironment: params.dgiiEnvironment,
    name: "",
    logoUrl: params.company?.logoUrl ?? null,
  };
  const fechaFirma = new Date();
  let ok = 0;
  let fail = 0;
  const paths: string[] = [];
  const errors: { file: string; error: string }[] = [];

  for (const src of sources) {
    try {
      const encf = extractXmlTagValue(src.signedXml, "eNCF");
      const tipo =
        extractXmlTagValue(src.signedXml, "TipoeCF") || encf.match(/^E(\d{2})/i)?.[1] || "31";
      const pdfBuf = await buildRepresentacionImpresaPdfBuffer({
        signedXml: src.signedXml,
        company,
        ecfTipo: normalizeEcfTipo(tipo),
        fechaFirma,
        uploadsRoot: params.uploadsRoot,
      });
      const outPath = path.join(outRiDir, `${src.baseName}.pdf`);
      await fs.writeFile(outPath, pdfBuf);
      paths.push(outPath);
      ok += 1;
    } catch (e) {
      fail += 1;
      errors.push({
        file: src.baseName,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { outRiDir, ok, fail, paths, errors };
}
