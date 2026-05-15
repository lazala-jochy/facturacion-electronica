export type AuthUser = {
  id: number;
  email: string;
  full_name: string;
  cedula: string;
};

export type AuthCompany = {
  id: number;
  name: string;
  rnc: string;
  address: string;
  phone?: string | null;
  email?: string | null;
  /** Ruta relativa al API, p. ej. `/uploads/companies/1.png` */
  logoUrl?: string | null;
  /** Indica si hay certificado DGII (.p12) configurado para la empresa. */
  certificateConfigured?: boolean;
  /** URL del servicio DGII para envío e-CF (opcional; si no hay, se usa la variable de entorno del servidor). */
  dgiiEcfEndpoint?: string | null;
  dgiiUsername?: string | null;
  dgiiPassword?: string | null;
  dgiiAuthUrl?: string | null;
  dgiiReceptionUrl?: string | null;
  dgiiConsultUrl?: string | null;
  dgiiCommercialApprovalUrl?: string | null;
  dgiiSeedUrl?: string | null;
  dgiiValidateSeedUrl?: string | null;
  dgiiEcfReceiveUrl?: string | null;
  dgiiTrackUrl?: string | null;
  dgiiStatusUrl?: string | null;
  dgiiEnvironment?: "CERTIFICACION" | "PRODUCCION" | null;
  /** Paso 4 — simulación e-CF (exclusivo; no usa URLs del Paso 2). */
  dgiiPaso4AuthUrl?: string | null;
  dgiiPaso4ReceptionUrl?: string | null;
  dgiiPaso4ConsultUrl?: string | null;
  dgiiPaso4RfceUrl?: string | null;
  dgiiPaso4Environment?: "CERTIFICACION" | "PRODUCCION" | null;
  dgiiPaso4SeedUrl?: string | null;
  dgiiPaso4ValidateSeedUrl?: string | null;
  dgiiPaso4EcfReceiveUrl?: string | null;
  certificatePath?: string | null;
  tokenExpiration?: string | null;
  token_cached?: boolean;
  /** Clave de cifrado del .p12 guardada en perfil (para enviar e-CF sin reingresarla en Cotizaciones). */
  certificate_keyphrase?: string | null;
};

/** Sesión persistida: JWT + contexto de usuario y empresa (multi-tenant). */
export type AuthSession = {
  token: string;
  user: AuthUser;
  company: AuthCompany;
};

export const AUTH_STORAGE_KEY = "fe_rd_session_v2";

export type AuthLoginResponse = {
  message: string;
  token: string;
  user: AuthUser;
  company: AuthCompany;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = LoginPayload & {
  name: string;
  rnc: string;
  address: string;
  full_name: string;
  cedula: string;
  company_phone?: string;
  company_email?: string;
};

export type CreateClientPayload = {
  name: string;
  address?: string;
  rnc_cedula: string;
  phone?: string;
  email?: string;
};

export type ClientCreatedResponse = {
  message: string;
  client: {
    id: number;
    name: string;
    address?: string | null;
    rnc_cedula: string;
    phone: string | null;
    email: string | null;
    company_id: number;
  };
};
