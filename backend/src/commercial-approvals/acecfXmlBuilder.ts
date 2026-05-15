/**
 * Builder XML ACECF (Aprobación Comercial e-CF) — aislado del flujo <ECF>/<RFCE>.
 * Estructura según ACECF v1.0: raíz ACECF > DetalleAprobacionComercial.
 */

import { create } from "xmlbuilder2";

export type AcecfEstado = "1" | "2";

export type BuildAcecfInput = {
  version?: string;
  rncEmisor: string;
  encf: string;
  fechaEmision: string;
  montoTotal: string;
  rncComprador: string;
  estado: AcecfEstado;
  fechaHoraAprobacionComercial: string;
  detalleMotivoRechazo?: string;
};

const onlyDigits = (v: string) => v.replace(/\D/g, "");

export function formatAcecfMontoTotal(value: string | number): string {
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return "0.00";
  return Number.isInteger(n) ? `${n}.00` : n.toFixed(2);
}

export function fechaHoraAprobacionComercialDgii(date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${dd}-${mm}-${y} ${h}:${mi}:${s}`;
}

export function normalizeFechaEmisionDdMmYyyy(raw?: string): string {
  const t = (raw ?? "").trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y, m, d] = t.split("-");
    return `${d}-${m}-${y}`;
  }
  return fechaHoraAprobacionComercialDgii().slice(0, 10);
}

/** Nombre de archivo DGII: RNCComprador + eNCF.xml */
export function acecfDgiiFilename(rncComprador: string, encf: string): string {
  const rnc = onlyDigits(rncComprador);
  const enf = encf.trim().replace(/[^\w.-]/g, "");
  return rnc && enf ? `${rnc}${enf}.xml` : enf ? `${enf}.xml` : "acecf-signed.xml";
}

export function buildAcecfXml(input: BuildAcecfInput): { xml: string; encf: string; filename: string } {
  const encf = input.encf.trim();
  if (!encf) throw new Error("eNCF obligatorio para ACECF.");
  const rncEmisor = onlyDigits(input.rncEmisor);
  const rncComprador = onlyDigits(input.rncComprador);
  if (!rncEmisor) throw new Error("RNC emisor obligatorio para ACECF.");
  if (!rncComprador) throw new Error("RNC comprador obligatorio para ACECF.");

  const doc = create({ version: "1.0", encoding: "UTF-8" });
  const root = doc.ele("ACECF", {
    "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
    "xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
  });

  const det = root.ele("DetalleAprobacionComercial");
  det.ele("Version").txt(input.version?.trim() || "1.0");
  det.ele("RNCEmisor").txt(rncEmisor);
  det.ele("eNCF").txt(encf);
  det.ele("FechaEmision").txt(normalizeFechaEmisionDdMmYyyy(input.fechaEmision));
  det.ele("MontoTotal").txt(formatAcecfMontoTotal(input.montoTotal));
  det.ele("RNCComprador").txt(rncComprador);
  det.ele("Estado").txt(input.estado);
  const motivo = (input.detalleMotivoRechazo ?? "").trim();
  if (input.estado === "2") {
    if (!motivo) throw new Error("DetalleMotivoRechazo obligatorio cuando Estado es 2 (rechazo).");
    det.ele("DetalleMotivoRechazo").txt(motivo);
  } else if (motivo) {
    // Estado 1: solo incluir si el Excel trae valor; no enviar nodo vacío (DGII lo rechaza).
    det.ele("DetalleMotivoRechazo").txt(motivo);
  }
  det.ele("FechaHoraAprobacionComercial").txt(
    input.fechaHoraAprobacionComercial.trim() || fechaHoraAprobacionComercialDgii(),
  );

  const xml = doc.end({ prettyPrint: true });
  return { xml, encf, filename: acecfDgiiFilename(rncComprador, encf) };
}
