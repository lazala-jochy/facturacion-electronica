import {
  codigoSeguridadDesdeSignedXml,
  extractXmlTagValue,
  fechaEmisionUrl,
  formatFechaFirmaQr,
  onlyDigits,
  parseFechaHoraFirmaDesdeXml,
} from "./ecfXmlExtract";

/** Bases oficiales DGII (consulta timbre / RI). */
const URL_CONSULTA_TIMBRE_ECF: Record<string, string> = {
  PRODUCCION: "https://ecf.dgii.gov.do/ecf/consultatimbre",
  CERTIFICACION: "https://ecf.dgii.gov.do/certecf/consultatimbre",
};

const URL_CONSULTA_TIMBRE_FC: Record<string, string> = {
  PRODUCCION: "https://fc.dgii.gov.do/ecf/consultatimbrefc",
  CERTIFICACION: "https://fc.dgii.gov.do/testecf/consultatimbrefc",
};

const envKey = (raw: string | null | undefined) =>
  raw === "PRODUCCION" ? "PRODUCCION" : "CERTIFICACION";

export type ConsultaTimbreQrInput = {
  signedXml: string;
  dgiiEnvironment: string | null | undefined;
  ecfTipo: string;
  fechaFirma: Date;
};

const montoDosDec = (n: number) => {
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
};

/**
 * URL del QR de consulta timbre DGII (parámetros según ambiente).
 * Tipo 32 y monto &lt; 250.000 RD$: RFCE (host fc.dgii.gov.do).
 */
export const buildConsultaTimbreQrUrl = (input: ConsultaTimbreQrInput): string => {
  const env = envKey(input.dgiiEnvironment);
  const tipoRaw = (input.ecfTipo || "31").replace(/\D/g, "");
  const tipo = tipoRaw.length >= 2 ? tipoRaw.slice(0, 2) : tipoRaw.padStart(2, "0");
  const monto = Number.parseFloat(extractXmlTagValue(input.signedXml, "MontoTotal") || "0");
  const useFc = tipo === "32" && Number.isFinite(monto) && monto < 250000;

  const rncE = onlyDigits(extractXmlTagValue(input.signedXml, "RNCEmisor"));
  const encf = extractXmlTagValue(input.signedXml, "eNCF").replace(/\s/g, "");
  const montoStr = montoDosDec(monto);
  const codigo = codigoSeguridadDesdeSignedXml(input.signedXml);
  const firmaXml = parseFechaHoraFirmaDesdeXml(
    extractXmlTagValue(input.signedXml, "FechaHoraFirma"),
  );
  const firmaQr = formatFechaFirmaQr(firmaXml ?? input.fechaFirma);

  if (useFc) {
    const base = URL_CONSULTA_TIMBRE_FC[env] ?? URL_CONSULTA_TIMBRE_FC.CERTIFICACION;
    const q = new URLSearchParams({
      rncemisor: rncE,
      encf,
      montototal: montoStr,
      codigoseguridad: codigo,
    });
    return `${base}?${q.toString()}`;
  }

  const base = URL_CONSULTA_TIMBRE_ECF[env] ?? URL_CONSULTA_TIMBRE_ECF.CERTIFICACION;
  const rncC = onlyDigits(extractXmlTagValue(input.signedXml, "RNCComprador"));
  const fechaEm = fechaEmisionUrl(extractXmlTagValue(input.signedXml, "FechaEmision"));

  const q = new URLSearchParams({
    rncemisor: rncE,
    rnccomprador: rncC,
    encf,
    fechaemision: fechaEm,
    montototal: montoStr,
    fechafirma: firmaQr,
    codigoseguridad: codigo,
  });
  return `${base}?${q.toString()}`;
};
