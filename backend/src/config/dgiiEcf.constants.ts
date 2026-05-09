/**
 * URLs por defecto del ambiente de certificación / sandbox DGII e-CF.
 * Producción: configurar URLs explícitas en perfil de empresa o vía variables de entorno.
 */
export const DGII_ECF_SANDBOX_DEFAULTS = {
  auth: "https://ecf.dgii.gov.do/CerteCF/Autenticacion",
  reception: "https://ecf.dgii.gov.do/CerteCF/Recepcion",
  consult: "https://ecf.dgii.gov.do/CerteCF/ConsultaResultado",
  consumerSummaryReception: "https://fc.dgii.gov.do/CerteCF/RecepcionFC",
  seed: "https://ecf.dgii.gov.do/CerteCF/Autenticacion/api/Autenticacion/Semilla",
  validateSeed: "https://ecf.dgii.gov.do/CerteCF/Autenticacion/api/Autenticacion/ValidarSemilla",
} as const;

export function normalizeDgiiEcfUrl(raw: string | null | undefined): string {
  const url = raw?.trim() ?? "";
  if (!url) return "";
  return url.replace(/^(https?:\/\/[^/\s]+)\.CerteCF(?=\/|$)/i, "$1/CerteCF");
}
