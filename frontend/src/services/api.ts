import { AUTH_STORAGE_KEY, type AuthCompany, type AuthSession, type AuthUser } from "../types/session";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/** Lectura cruda de la sesión (útil antes de llamadas multipart). */
export const readAuthSessionFromStorage = (): AuthSession | null => {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<AuthSession>;
    if (s?.token && s?.user && s?.company) return s as AuthSession;
    return null;
  } catch {
    return null;
  }
};

export const apiUrl = API_URL;

export const getAuthToken = (): string | null => readAuthSessionFromStorage()?.token ?? null;

export class ApiError extends Error {
  readonly status: number;
  readonly body?: Record<string, unknown>;

  constructor(message: string, status: number, body?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Actualiza usuario/empresa en localStorage desde `GET /auth/me` (p. ej. tras guardar certificado). */
export const refreshAuthSessionFromServer = async (): Promise<void> => {
  const session = readAuthSessionFromStorage();
  if (!session?.token) return;
  const data = await apiFetch<{ user: AuthUser; company: AuthCompany }>("/auth/me", {
    method: "GET",
  });
  const next: AuthSession = { ...session, user: data.user, company: data.company };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
};

/**
 * Fetch autenticado: envía `Authorization: Bearer` desde la sesión guardada.
 * No acepta `company_id` en el cuerpo; el backend usa el JWT.
 */
export const apiFetch = async <T>(
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  const session = readAuthSessionFromStorage();
  const headers = new Headers(init.headers);
  if (session?.token) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }
  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    message?: string;
  };
  if (!response.ok) {
    throw new ApiError(data.message ?? "Error en la solicitud.", response.status, data as Record<string, unknown>);
  }
  return data as T;
};
