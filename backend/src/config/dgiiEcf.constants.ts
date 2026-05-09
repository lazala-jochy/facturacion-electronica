/**
 * URLs por defecto del ambiente de certificación / sandbox DGII e-CF.
 * Producción: configurar URLs explícitas en perfil de empresa o vía variables de entorno.
 */
export const DGII_ECF_SANDBOX_DEFAULTS = {
  auth: "https://ecf.dgii.gov.do/ecf/autenticacion/api/Autenticacion",
  reception: "https://ecf.dgii.gov.do/ecf/recepcion/api/RecepcionFC",
  consult: "https://ecf.dgii.gov.do/ecf/consulta/api/ConsultaResultado",
  seed: "https://ecf.dgii.gov.do/CerteCF/Autenticacion/api/Autenticacion/Semilla",
  validateSeed: "https://ecf.dgii.gov.do/CerteCF/Autenticacion/api/Autenticacion/ValidarSemilla",
} as const;
