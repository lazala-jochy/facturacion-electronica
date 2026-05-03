import { AUTH_STORAGE_KEY, type AuthSession } from "../types/session";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const readSession = (): AuthSession | null => {
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

export const getAuthToken = (): string | null => readSession()?.token ?? null;

/**
 * Fetch autenticado: envía `Authorization: Bearer` desde la sesión guardada.
 * No acepta `company_id` en el cuerpo; el backend usa el JWT.
 */
export const apiFetch = async <T>(
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  const session = readSession();
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
    throw new Error(data.message ?? "Error en la solicitud.");
  }
  return data as T;
};
