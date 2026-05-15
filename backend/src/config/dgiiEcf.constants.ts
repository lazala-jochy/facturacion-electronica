/**
 * URLs por defecto del ambiente de certificación / sandbox DGII e-CF.
 * Producción: configurar URLs explícitas en perfil de empresa o vía variables de entorno.
 */
export const DGII_ECF_SANDBOX_DEFAULTS = {
  auth: "https://ecf.dgii.gov.do/CerteCF/Autenticacion",
  reception: "https://ecf.dgii.gov.do/CerteCF/Recepcion",
  consult: "https://ecf.dgii.gov.do/CerteCF/ConsultaResultado/api/consultas/estado",
  /** RFCE reception. Official doc: fc.dgii.gov.do/{ambiente}/recepcionfc; CerteCF also works at ecf.dgii.gov.do. */
  consumerSummaryReception: "https://ecf.dgii.gov.do/CerteCF/RecepcionFC",
  /** Solo referencia / placeholder en UI; la URL efectiva viene del perfil de empresa. */
  commercialApprovalReception:
    "https://ecf.dgii.gov.do/CerteCF/aprobacioncomercial/api/aprobacioncomercial",
  seed: "https://ecf.dgii.gov.do/CerteCF/Autenticacion/api/Autenticacion/Semilla",
  validateSeed: "https://ecf.dgii.gov.do/CerteCF/Autenticacion/api/Autenticacion/ValidarSemilla",
} as const;

export function normalizeDgiiEcfUrl(raw: string | null | undefined): string {
  const url = raw?.trim() ?? "";
  if (!url) return "";
  return url.replace(/^(https?:\/\/[^/\s]+)\.CerteCF(?=\/|$)/i, "$1/CerteCF");
}
