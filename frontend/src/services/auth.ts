import type {
  AuthLoginResponse,
  AuthSession,
  LoginPayload,
  RegisterPayload,
} from "../types/session";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const postJson = async <T>(path: string, payload: object): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  user: data.user,
  company: data.company,
});

export const registerCompany = async (
  payload: RegisterPayload,
  logoFile?: File | null,
): Promise<AuthSession> => {
  const formData = new FormData();
  formData.append("name", payload.name);
  formData.append("rnc", payload.rnc);
  formData.append("address", payload.address);
  formData.append("full_name", payload.full_name);
  formData.append("cedula", payload.cedula);
  formData.append("email", normalizeEmail(payload.email));
  formData.append("password", payload.password);
  if (payload.company_phone != null && payload.company_phone !== "") {
    formData.append("company_phone", payload.company_phone);
  }
  if (payload.company_email != null && payload.company_email !== "") {
    formData.append("company_email", normalizeEmail(payload.company_email));
  }
  if (logoFile) formData.append("logo", logoFile);

  const response = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    body: formData,
  });
  const data = (await response.json()) as AuthLoginResponse & { message?: string };
  if (!response.ok) {
    throw new Error(data.message ?? "No se pudo completar la solicitud.");
  }
  return toSession(data);
};

export const loginCompany = async (
  payload: LoginPayload,
): Promise<AuthSession> => {
  const data = await postJson<AuthLoginResponse>("/auth/login", {
    ...payload,
    email: normalizeEmail(payload.email),
  });
  return toSession(data);
};

export type PasswordResetLookupResult = {
  exists: boolean;
  reset_token?: string;
};

export const requestPasswordReset = async (
  email: string,
): Promise<PasswordResetLookupResult> => {
  return postJson<PasswordResetLookupResult>("/auth/forgot-password", {
    email: normalizeEmail(email),
  });
};

export const resetPasswordWithToken = async (
  token: string,
  password: string,
): Promise<{ message: string }> => {
  return postJson<{ message: string }>("/auth/reset-password", {
    token: token.trim(),
    password,
  });
};
