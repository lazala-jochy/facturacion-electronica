import type {
  AuthLoginResponse,
  AuthSession,
  LoginPayload,
  RegisterPayload,
} from "../types/session";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

type EdgeAuthResponse = AuthLoginResponse & {
  ok?: boolean;
  database_url?: string;
  direct_url?: string;
  app_secrets_key?: string;
};

/**
 * register/login/forgot-password/reset-password viven en Supabase Edge
 * Functions: necesitan ver todas las empresas (buscar por email, crear el
 * rol de Postgres dedicado) con una credencial admin que el instalador
 * nunca debe tener -- ver supabase/functions/ y el plan de migracion.
 */
const postFunctionJson = async <T>(fn: string, payload: object): Promise<T> => {
  if (!FUNCTIONS_URL || !ANON_KEY) {
    throw new Error("Falta configurar VITE_SUPABASE_FUNCTIONS_URL/VITE_SUPABASE_ANON_KEY.");
  }
  const response = await fetch(`${FUNCTIONS_URL}/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new Error(data.message ?? "No se pudo completar la solicitud.");
  }
  return data as T;
};

const toSession = (data: AuthLoginResponse): AuthSession => ({
  token: data.token,
  refresh_token: data.refresh_token,
  user: data.user,
  company: data.company,
});

/**
 * En Electron (app empaquetada): persiste el DATABASE_URL del rol de esta
 * empresa y (re)arranca el backend local con el, esperando a que levante
 * antes de seguir -- sin esto, cualquier llamada subsiguiente al backend
 * local (incluido el upload de logo/certificado abajo) fallaria porque
 * todavia no hay proceso backend corriendo. En dev/navegador, electronAPI
 * no existe y el backend ya corre aparte -- no hay nada que hacer.
 */
const completeBackendHandoff = async (
  companyId: number,
  databaseUrl?: string,
  appSecretsKey?: string,
): Promise<void> => {
  if (!window.electronAPI || !databaseUrl || !appSecretsKey) return;
  const result = await window.electronAPI.completeAuth(companyId, databaseUrl, appSecretsKey);
  if (!result.ok) {
    throw new Error(`No se pudo iniciar el backend local: ${result.message}`);
  }
};

/** Adjunta logo/certificado contra el backend local YA corriendo (ver completeBackendHandoff). */
const attachCompanyFiles = async (
  token: string,
  opts: {
    logoFile?: File | null;
    certificateFile?: File | null;
    certificatePassword?: string;
    certificateEncryptionSecret?: string;
  },
): Promise<void> => {
  if (!opts.logoFile && !opts.certificateFile) return;

  const fd = new FormData();
  if (opts.logoFile) fd.append("logo", opts.logoFile);
  if (opts.certificateFile) {
    fd.append("certificate", opts.certificateFile);
    if (opts.certificatePassword) fd.append("certificate_password", opts.certificatePassword);
    if (opts.certificateEncryptionSecret) {
      fd.append("certificate_encryption_secret", opts.certificateEncryptionSecret);
    }
  }

  const response = await fetch(`${API_URL}/auth/company`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? "La empresa se creo, pero no se pudo guardar el logo/certificado.");
  }
};

export const registerCompany = async (
  payload: RegisterPayload,
  opts?: {
    logoFile?: File | null;
    certificateFile?: File | null;
    certificatePassword?: string;
    certificateEncryptionSecret?: string;
  },
): Promise<AuthSession> => {
  const data = await postFunctionJson<EdgeAuthResponse>("register", {
    name: payload.name,
    rnc: payload.rnc,
    address: payload.address,
    full_name: payload.full_name,
    cedula: payload.cedula,
    user_email: normalizeEmail(payload.email),
    password: payload.password,
    phone: payload.company_phone,
    email: payload.company_email ? normalizeEmail(payload.company_email) : undefined,
  });

  await completeBackendHandoff(data.company.id, data.database_url, data.app_secrets_key);
  if (opts) await attachCompanyFiles(data.token, opts);

  return toSession(data);
};

export const loginCompany = async (payload: LoginPayload): Promise<AuthSession> => {
  const data = await postFunctionJson<EdgeAuthResponse>("login", {
    email: normalizeEmail(payload.email),
    password: payload.password,
  });
  await completeBackendHandoff(data.company.id, data.database_url, data.app_secrets_key);
  return toSession(data);
};

export type PasswordResetLookupResult = {
  exists: boolean;
  reset_token?: string;
};

export const requestPasswordReset = async (
  email: string,
): Promise<PasswordResetLookupResult> => {
  return postFunctionJson<PasswordResetLookupResult>("forgot-password", {
    email: normalizeEmail(email),
  });
};

export const resetPasswordWithToken = async (
  token: string,
  password: string,
): Promise<{ message: string }> => {
  return postFunctionJson<{ message: string }>("reset-password", {
    token: token.trim(),
    password,
  });
};
