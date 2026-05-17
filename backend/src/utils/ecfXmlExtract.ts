import crypto from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";

export const extractXmlTagValue = (xml: string, tagName: string): string => {
  const match = xml.match(
    new RegExp(`<(?:\\w+:)?${tagName}\\b[^>]*>\\s*([^<]+?)\\s*</(?:\\w+:)?${tagName}>`, "i"),
  );
  return (match?.[1] ?? "").trim();
};

export const onlyDigits = (s: string) => s.replace(/\D/g, "");

export type EcfItemRow = {
  numeroLinea: string;
  nombreItem: string;
  cantidad: string;
  unidad: string;
  precioUnitario: string;
  montoItem: string;
};

export const parseEcfItemRows = (signedXml: string): EcfItemRow[] => {
  const doc = new DOMParser().parseFromString(signedXml.replace(/^\uFEFF/, ""), "text/xml");
  const items = doc.getElementsByTagName("Item");
  const rows: EcfItemRow[] = [];
  for (let i = 0; i < items.length; i++) {
    const el = items.item(i);
    if (!el) continue;
    const txt = (name: string) => {
      const kids = el.getElementsByTagName(name);
      const first = kids.item(0);
      return (first?.textContent ?? "").trim();
    };
    rows.push({
      numeroLinea: txt("NumeroLinea"),
      nombreItem: txt("NombreItem"),
      cantidad: txt("CantidadItem"),
      unidad: txt("UnidadMedida"),
      precioUnitario: txt("PrecioUnitarioItem"),
      montoItem: txt("MontoItem"),
    });
  }
  return rows;
};

/** Primeros 6 caracteres del SignatureValue del e-CF íntegro (CerteCF / RFCE). */
export const codigoSeguridadRfceDesdeSignedEcf = (signedXml: string): string => {
  const raw = extractXmlTagValue(signedXml, "SignatureValue").replace(/\s/g, "");
  return raw.length >= 6 ? raw.substring(0, 6) : raw;
};

export const codigoSeguridadDesdeSignedXml = (signedXml: string): string => {
  const raw = extractXmlTagValue(signedXml, "SignatureValue").replace(/\s/g, "");
  if (!raw) return "------";
  let buf: Buffer;
  try {
    buf = Buffer.from(raw, "base64");
  } catch {
    return "------";
  }
  if (!buf.length) return "------";
  const digest = crypto.createHash("sha256").update(buf).digest();
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[digest[i]! % alphabet.length];
  }
  return out;
};

const parseYyyymmdd = (raw: string): { dd: string; mm: string; yyyy: string } | null => {
  const t = raw.replace(/\D/g, "");
  if (t.length === 8) {
    return { yyyy: t.slice(0, 4), mm: t.slice(4, 6), dd: t.slice(6, 8) };
  }
  return null;
};

export const fechaEmisionUrl = (fechaEmisionRaw: string): string => {
  const p = parseYyyymmdd(fechaEmisionRaw);
  if (!p) return fechaEmisionRaw.trim();
  return `${p.dd}-${p.mm}-${p.yyyy}`;
};

export const formatFechaFirmaQr = (d: Date): string => {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Santo_Domingo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((x) => x.type === type)?.value ?? "";
  const day = get("day");
  const month = get("month");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");
  return `${day}-${month}-${year} ${hour}:${minute}:${second}`;
};
