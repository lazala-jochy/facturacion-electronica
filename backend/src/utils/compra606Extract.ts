/**
 * Extracción de campos de Compra 606 desde una imagen o PDF de factura de compra.
 * OCR (tesseract.js) para imágenes; texto embebido (pdf-parse) para PDFs con capa de texto.
 * Heurística best-effort: el resultado siempre se revisa/edita en el formulario antes de guardar.
 */
import { createWorker } from "tesseract.js";
import { PDFParse } from "pdf-parse";
import { mapFormaPago606 } from "./dgiiFormato606607";

export type CamposExtraidos606 = {
  rnc_cedula: string;
  ncf: string;
  fecha_comprobante: string;
  monto_servicios: number;
  monto_bienes: number;
  itbis_facturado: number;
  forma_pago: string;
};

const RNC_LABEL_RE = /(?:RNC|R\.?\s?N\.?\s?C\.?|C[eé]dula)\s*[:#]?\s*([\d][\d\s.-]{7,19}\d)/i;
const NCF_LABEL_RE = /(?:e-?\s?NCF|N\.?C\.?F\.?|Comprobante\s+Fiscal)\s*[:#]?\s*([A-Za-z]\s?[\d\s]{9,18})/i;
const NCF_STANDALONE_RE = /\b([A-Za-z]\d{10,12})\b/;
const FECHA_LABEL_RE =
  /Fecha(?:\s+de\s+emisi[oó]n)?\s*[:#]?\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2,4})/i;
const FECHA_STANDALONE_RE = /\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})\b/;

const parseMoney = (raw: string): number => {
  const normalized = raw.replace(/[^\d.,]/g, "").replace(/,/g, "");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
};

const extraerRncCedula = (text: string): string => {
  const m = text.match(RNC_LABEL_RE);
  if (!m) return "";
  const digits = m[1].replace(/\D/g, "");
  if (digits.length === 9 || digits.length === 11) return digits;
  return digits.length > 11 ? digits.slice(0, 11) : digits;
};

const extraerNcf = (text: string): string => {
  const m = text.match(NCF_LABEL_RE) ?? text.match(NCF_STANDALONE_RE);
  return m ? m[1].replace(/\s+/g, "").toUpperCase() : "";
};

const extraerFecha = (text: string): string => {
  const m = text.match(FECHA_LABEL_RE) ?? text.match(FECHA_STANDALONE_RE);
  if (!m) return "";
  const [, dd, mm, anioRaw] = m;
  const yyyy = anioRaw.length === 2 ? `20${anioRaw}` : anioRaw;
  return `${yyyy}${mm.padStart(2, "0")}${dd.padStart(2, "0")}`;
};

const extraerMontoPorEtiqueta = (text: string, etiquetas: string[]): number => {
  for (const etiqueta of etiquetas) {
    const re = new RegExp(`${etiqueta}\\s*[:#]?\\s*(?:RD\\$|DOP)?\\s*([\\d][\\d.,]*)`, "i");
    const m = text.match(re);
    if (m) return parseMoney(m[1]);
  }
  return 0;
};

const extraerFormaPago = (text: string): string => {
  const m = text.match(/Forma\s+de\s+pago\s*[:#]?\s*([A-Za-zÁÉÍÓÚáéíóú/ ]{3,25})/i);
  return mapFormaPago606(m ? m[1] : text);
};

/** Heurística sobre texto plano; siempre se muestra al usuario para confirmar/editar. */
export const parseFacturaCompraTexto = (text: string): CamposExtraidos606 => {
  const itbis = extraerMontoPorEtiqueta(text, ["ITBIS(?:\\s+facturado)?"]);
  const total = extraerMontoPorEtiqueta(text, ["TOTAL(?:\\s+a\\s+pagar)?", "MONTO\\s+TOTAL"]);
  const subtotal = extraerMontoPorEtiqueta(text, ["Subtotal", "Monto\\s+facturado"]);
  const montoBase = subtotal > 0 ? subtotal : Math.max(total - itbis, 0);
  return {
    rnc_cedula: extraerRncCedula(text),
    ncf: extraerNcf(text),
    fecha_comprobante: extraerFecha(text),
    monto_servicios: montoBase,
    monto_bienes: 0,
    itbis_facturado: itbis,
    forma_pago: extraerFormaPago(text),
  };
};

export const extraerTextoDeImagen = async (buffer: Buffer): Promise<string> => {
  const worker = await createWorker("spa");
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    return text;
  } finally {
    await worker.terminate();
  }
};

export const extraerTextoDePdf = async (buffer: Buffer): Promise<string> => {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
};

export const extraerTextoDeArchivo = async (buffer: Buffer, mimetype: string): Promise<string> => {
  if (mimetype === "application/pdf") {
    const text = await extraerTextoDePdf(buffer);
    if (text.trim().length > 20) return text;
    throw new Error(
      "El PDF no tiene texto legible (parece un escaneo). Subí una foto o imagen en su lugar.",
    );
  }
  if (mimetype.startsWith("image/")) {
    return extraerTextoDeImagen(buffer);
  }
  throw new Error("Formato no soportado. Subí una imagen (JPG/PNG) o un PDF con texto.");
};
