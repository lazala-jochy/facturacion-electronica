/**
 * Builder XML ARECF (Acuse de Recibo del e-CF) — spec oficial DGII "Formato Acuse de Recibo
 * (ARECF) v1.0" (Gerencia de Facturación). Raíz ARECF > DetalleAcusedeRecibo, firma como en ACECF.
 */

import { create } from "xmlbuilder2";

export type ArecfEstado = "0" | "1";

/** Código motivo de No Recibido (solo cuando Estado = 1). */
export type ArecfCodigoMotivoNoRecibido = "1" | "2" | "3" | "4";

export type BuildArecfInput = {
  version?: string;
  rncEmisor: string;
  rncComprador: string;
  encf: string;
  estado: ArecfEstado;
  codigoMotivoNoRecibido?: ArecfCodigoMotivoNoRecibido;
  fechaHoraAcuseRecibo?: string;
};

const onlyDigits = (v: string) => v.replace(/\D/g, "");

export function fechaHoraAcuseReciboDgii(date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${dd}-${mm}-${y} ${h}:${mi}:${s}`;
}

/** Nombre de archivo DGII: RNCComprador + eNCF.xml (misma convención que ACECF). */
export function arecfDgiiFilename(rncComprador: string, encf: string): string {
  const rnc = onlyDigits(rncComprador);
  const enf = encf.trim().replace(/[^\w.-]/g, "");
  return rnc && enf ? `${rnc}${enf}.xml` : enf ? `${enf}.xml` : "arecf-signed.xml";
}

export function buildArecfXml(input: BuildArecfInput): { xml: string; encf: string; filename: string } {
  const encf = input.encf.trim();
  if (!encf) throw new Error("eNCF obligatorio para ARECF.");
  const rncEmisor = onlyDigits(input.rncEmisor);
  const rncComprador = onlyDigits(input.rncComprador);
  if (!rncEmisor) throw new Error("RNC emisor obligatorio para ARECF.");
  if (!rncComprador) throw new Error("RNC comprador obligatorio para ARECF.");
  if (input.estado === "1" && !input.codigoMotivoNoRecibido) {
    throw new Error("CodigoMotivoNoRecibido obligatorio cuando Estado es 1 (no recibido).");
  }

  const doc = create({ version: "1.0", encoding: "UTF-8" });
  const root = doc.ele("ARECF", {
    "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
    "xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
  });

  const det = root.ele("DetalleAcusedeRecibo");
  det.ele("Version").txt(input.version?.trim() || "1.0");
  det.ele("RNCEmisor").txt(rncEmisor);
  det.ele("RNCComprador").txt(rncComprador);
  det.ele("eNCF").txt(encf);
  det.ele("Estado").txt(input.estado);
  if (input.estado === "1" && input.codigoMotivoNoRecibido) {
    det.ele("CodigoMotivoNoRecibido").txt(input.codigoMotivoNoRecibido);
  }
  det.ele("FechaHoraAcuseRecibo").txt(input.fechaHoraAcuseRecibo?.trim() || fechaHoraAcuseReciboDgii());

  const xml = doc.end({ prettyPrint: true });
  return { xml, encf, filename: arecfDgiiFilename(rncComprador, encf) };
}
