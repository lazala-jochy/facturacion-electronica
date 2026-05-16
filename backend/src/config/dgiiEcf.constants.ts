/**
 * URLs por defecto del ambiente de certificación / sandbox DGII e-CF.
 * Producción: configurar URLs explícitas en perfil de empresa o vía variables de entorno.
 */

/** Por tipo de e-CF la DGII asigna secuencias en 1 .. 10.000.000; no deben reutilizarse al reiniciar pruebas. */
export const ECF_NCF_SEQ_MAX = 10_000_000;

export const ECF_NCF_SEQ_EXCEEDED_MESSAGE =
  "Límite DGII: la secuencia e-NCF por tipo alcanzó el máximo permitido (10.000.000) para esta empresa.";

/**
 * Facturas de consumo (32) con total &lt; RD$250.000: en certificación DGII el flujo oficial exige RFCE (resumen)
 * por recepción de resúmenes antes de cargar el e-CF completo por la interfaz de pruebas.
 */
export const ECF_CONSUMO_RFCE_TOTAL_THRESHOLD_RD = 250_000;

export const DGII_ECF_SANDBOX_DEFAULTS = {
  auth: "https://ecf.dgii.gov.do/CerteCF/Autenticacion",
  reception: "https://ecf.dgii.gov.do/CerteCF/Recepcion",
  /** Documentación CerteCF: `.../api/Consultas/Estado?trackid={uuid}` */
  consult: "https://ecf.dgii.gov.do/CerteCF/ConsultaResultado/api/Consultas/Estado",
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
