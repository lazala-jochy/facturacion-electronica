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
): Promise<AuthSession> => {
  const data = await postJson<AuthLoginResponse>("/auth/register", {
    ...payload,
    email: normalizeEmail(payload.email),
  });
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
