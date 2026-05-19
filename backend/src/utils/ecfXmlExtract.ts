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

/**
 * Código para consulta timbre / QR: primeros 6 caracteres del `SignatureValue` (ej. `BTDDYV`).
 * Mismo criterio que `CodigoSeguridadeCF` en RFCE.
 */
export const codigoSeguridadParaConsultaTimbre = (signedXml: string): string =>
  codigoSeguridadRfceDesdeSignedEcf(signedXml);

const parseYyyymmdd = (raw: string): { dd: string; mm: string; yyyy: string } | null => {
  const t = raw.replace(/\D/g, "");
  if (t.length === 8) {
    return { yyyy: t.slice(0, 4), mm: t.slice(4, 6), dd: t.slice(6, 8) };
  }
  return null;
};

/** Parámetro `fechaemision` del QR: siempre `dd-mm-aaaa`. */
export const fechaEmisionUrl = (fechaEmisionRaw: string): string => {
  const raw = fechaEmisionRaw.trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) return raw;
  const p = parseYyyymmdd(raw);
  if (p) return `${p.dd}-${p.mm}-${p.yyyy}`;
  return raw;
};

/** `fechafirma` del QR: usar `FechaHoraFirma` del XML tal cual (dd-mm-aaaa HH:mm:ss). */
export const fechaFirmaParaConsultaTimbre = (signedXml: string, fallback: Date): string => {
  const raw = extractXmlTagValue(signedXml, "FechaHoraFirma").trim();
  if (raw) return raw;
  return formatFechaFirmaQr(fallback);
};

/** Parsea `FechaHoraFirma` del XML (dd-MM-yyyy HH:mm:ss, hora RD). */
export const parseFechaHoraFirmaDesdeXml = (raw: string): Date | null => {
  const m = raw
    .trim()
    .match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  const iso = `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-04:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
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
