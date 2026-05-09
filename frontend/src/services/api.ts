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
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
    });
  } catch (e) {
    const offline =
      e instanceof TypeError && typeof e.message === "string"
        ? e.message.toLowerCase().includes("fetch")
        : false;
    throw new ApiError(
      offline ? "No se pudo contactar el servidor (¿backend encendido o URL correcta?)." : "Error de red.",
      0,
    );
  }

  const raw = await response.text();
  let data: Record<string, unknown> = {};
  if (raw.trim()) {
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      data = { message: raw.trim().slice(0, 500) };
    }
  }

  if (!response.ok) {
    const msg =
      (typeof data.message === "string" && data.message.trim()) ||
      (typeof data.error === "string" && data.error.trim()) ||
      `Solicitud rechazada (${response.status}${response.statusText ? `: ${response.statusText}` : ""}).`;
    throw new ApiError(msg, response.status, data);
  }
  return data as T;
};
