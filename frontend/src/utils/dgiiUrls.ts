/** URLs base CerteCF para pruebas e-CF (Excel). */
export const DGII_ECF_SANDBOX = {
  auth: "https://ecf.dgii.gov.do/CerteCF/Autenticacion",
  reception: "https://ecf.dgii.gov.do/CerteCF/Recepcion/api/FacturasElectronicas",
  /** Base + ruta; la consulta GET usa `?trackid=` (minúsculas). */
  consult: "https://ecf.dgii.gov.do/CerteCF/ConsultaResultado/api/Consultas/Estado",
  consumerSummaryReception: "https://fc.dgii.gov.do/CerteCF/RecepcionFC",
} as const;

export type DgiiEnvironment = "CERTIFICACION" | "PRODUCCION";

const trimTrailingSlashes = (value: string) => value.trim().replace(/\/+$/, "");

export const normalizeDgiiUrl = (value: string) =>
  trimTrailingSlashes(value).replace(/^(https?:\/\/[^/\s]+)\.CerteCF(?=\/|$)/i, "$1/CerteCF");

export const normalizeAuthBaseUrl = (value: string) =>
  normalizeDgiiUrl(value).replace(/\/api\/Autenticacion(?:\/(?:Semilla|ValidarSemilla))?$/i, "");

export const authBaseFromSeedUrl = (seedUrl?: string | null): string | null => {
  const seed = seedUrl?.trim();
  const suffix = "/api/Autenticacion/Semilla";
  if (!seed?.endsWith(suffix)) return null;
  return seed.slice(0, -suffix.length);
};

export const resolveDgiiUrl = (...values: Array<string | null | undefined>) =>
  values.map((v) => (v ? normalizeDgiiUrl(v) : "")).find((v): v is string => Boolean(v)) ?? "";

export const seedUrlFromAuthBase = (authBase: string) =>
  `${normalizeAuthBaseUrl(authBase)}/api/Autenticacion/Semilla`;

export const validateSeedUrlFromAuthBase = (authBase: string) =>
  `${normalizeAuthBaseUrl(authBase)}/api/Autenticacion/ValidarSemilla`;

export type DgiiEcfUrlFields = {
  environment: DgiiEnvironment;
  authUrl: string;
  /** Si se deja vacío, se deriva de authUrl (+ /api/Autenticacion/Semilla) al guardar. */
  seedUrl: string;
  /** Si se deja vacío, se deriva de authUrl (+ /api/Autenticacion/ValidarSemilla) al guardar. */
  validateSeedUrl: string;
  receptionUrl: string;
  consultUrl: string;
  consumerSummaryUrl: string;
  /** URLs de Producción — exclusivas, nunca se derivan ni se mezclan con las de certificación arriba. */
  prodAuthUrl: string;
  /** Si se deja vacío, se deriva de prodAuthUrl al guardar (si hay prodAuthUrl). */
  prodSeedUrl: string;
  /** Si se deja vacío, se deriva de prodAuthUrl al guardar (si hay prodAuthUrl). */
  prodValidateSeedUrl: string;
  prodReceptionUrl: string;
  prodConsultUrl: string;
  prodConsumerSummaryUrl: string;
};

/** Cuerpo PUT /auth/company con URLs derivadas (semilla, recepción e-CF, etc.). */
export function buildDgiiEcfUrlsBody(urls: DgiiEcfUrlFields): Record<string, string> {
  const dgiiAuthBase = normalizeAuthBaseUrl(urls.authUrl || DGII_ECF_SANDBOX.auth);
  const dgiiReceptionBase = normalizeDgiiUrl(urls.receptionUrl || DGII_ECF_SANDBOX.reception);
  const dgiiConsultBase = normalizeDgiiUrl(urls.consultUrl || DGII_ECF_SANDBOX.consult);
  const dgiiConsumerSummaryBase = normalizeDgiiUrl(
    urls.consumerSummaryUrl || DGII_ECF_SANDBOX.consumerSummaryReception,
  );
  // Semilla/validar-semilla son editables; si se dejan vacíos se derivan de authUrl (compatibilidad).
  const dgiiSeedBase = urls.seedUrl.trim() ? normalizeDgiiUrl(urls.seedUrl) : seedUrlFromAuthBase(dgiiAuthBase);
  const dgiiValidateSeedBase = urls.validateSeedUrl.trim()
    ? normalizeDgiiUrl(urls.validateSeedUrl)
    : validateSeedUrlFromAuthBase(dgiiAuthBase);

  // Producción no tiene default de sandbox: si se deja vacío, queda sin configurar (no reutiliza certificación).
  const dgiiProdAuthBase = urls.prodAuthUrl.trim() ? normalizeAuthBaseUrl(urls.prodAuthUrl) : "";
  const dgiiProdReceptionBase = urls.prodReceptionUrl.trim() ? normalizeDgiiUrl(urls.prodReceptionUrl) : "";
  const dgiiProdConsultBase = urls.prodConsultUrl.trim() ? normalizeDgiiUrl(urls.prodConsultUrl) : "";
  const dgiiProdConsumerSummaryBase = urls.prodConsumerSummaryUrl.trim()
    ? normalizeDgiiUrl(urls.prodConsumerSummaryUrl)
    : "";
  const dgiiProdSeedBase = urls.prodSeedUrl.trim()
    ? normalizeDgiiUrl(urls.prodSeedUrl)
    : dgiiProdAuthBase
      ? seedUrlFromAuthBase(dgiiProdAuthBase)
      : "";
  const dgiiProdValidateSeedBase = urls.prodValidateSeedUrl.trim()
    ? normalizeDgiiUrl(urls.prodValidateSeedUrl)
    : dgiiProdAuthBase
      ? validateSeedUrlFromAuthBase(dgiiProdAuthBase)
      : "";

  return {
    dgii_environment: urls.environment,
    dgii_auth_url: dgiiAuthBase,
    dgii_reception_url: dgiiReceptionBase,
    dgii_consult_url: dgiiConsultBase,
    dgii_ecf_endpoint: dgiiConsumerSummaryBase,
    dgii_seed_url: dgiiSeedBase,
    dgii_validate_seed_url: dgiiValidateSeedBase,
    dgii_ecf_receive_url: dgiiReceptionBase,
    dgii_track_url: "",
    dgii_status_url: "",
    dgii_prod_auth_url: dgiiProdAuthBase,
    dgii_prod_seed_url: dgiiProdSeedBase,
    dgii_prod_validate_seed_url: dgiiProdValidateSeedBase,
    dgii_prod_reception_url: dgiiProdReceptionBase,
    dgii_prod_consult_url: dgiiProdConsultBase,
    dgii_prod_consumer_summary_url: dgiiProdConsumerSummaryBase,
  };
}

/** Solo Paso 4 — PUT /auth/company sin tocar columnas del Paso 2. */
export function buildDgiiPaso4UrlsBody(urls: DgiiEcfUrlFields): Record<string, string> {
  const dgiiAuthBase = normalizeAuthBaseUrl(urls.authUrl || "");
  const dgiiReceptionBase = normalizeDgiiUrl(urls.receptionUrl || "");
  const dgiiConsultBase = normalizeDgiiUrl(urls.consultUrl || "");
  const dgiiRfceBase = normalizeDgiiUrl(urls.consumerSummaryUrl || "");

  return {
    dgii_paso4_environment: urls.environment,
    dgii_paso4_auth_url: dgiiAuthBase,
    dgii_paso4_reception_url: dgiiReceptionBase,
    dgii_paso4_consult_url: dgiiConsultBase,
    dgii_paso4_rfce_url: dgiiRfceBase,
  };
}
