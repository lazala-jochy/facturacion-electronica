import {
  AUTH_STORAGE_KEY,
  type AuthCompany,
  type AuthLoginResponse,
  type AuthSession,
  type AuthUser,
} from "../types/session";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const AUTH_SESSION_INVALIDATED = "fe:auth:session-invalidated";
export const AUTH_SESSION_UPDATED = "fe:auth:session-updated";

const AUTH_EXEMPT_PREFIXES = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
] as const;

const isAuthExemptPath = (path: string): boolean => {
  const p = path.startsWith("http") ? new URL(path).pathname : path;
  return AUTH_EXEMPT_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
};

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

export const persistAuthSession = (session: AuthSession): void => {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_UPDATED, { detail: session }));
};

export const clearAuthSession = (): void => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  window.dispatchEvent(new Event(AUTH_SESSION_INVALIDATED));
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

let refreshInFlight: Promise<AuthSession | null> | null = null;

const loginResponseToSession = (data: AuthLoginResponse): AuthSession => ({
  token: data.token,
  refresh_token: data.refresh_token,
  user: data.user,
  company: data.company,
});

const refreshSessionFromServer = async (): Promise<AuthSession | null> => {
  const session = readAuthSessionFromStorage();
  if (!session?.refresh_token) return null;

  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
  } catch {
    return null;
  }

  const raw = await response.text();
  let data: AuthLoginResponse & { message?: string } = {
    message: "",
    token: "",
    refresh_token: "",
    user: session.user,
    company: session.company,
  };
  if (raw.trim()) {
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      return null;
    }
  }

  if (!response.ok || !data.token || !data.refresh_token) {
    return null;
  }

  const next = loginResponseToSession(data);
  persistAuthSession(next);
  return next;
};

export const ensureRefreshedSession = (): Promise<AuthSession | null> => {
  if (!refreshInFlight) {
    refreshInFlight = refreshSessionFromServer().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
};

/** Renueva JWT si hay refresh_token (p. ej. antes de que expire el access token). */
export const proactiveRefreshIfNeeded = async (): Promise<void> => {
  const session = readAuthSessionFromStorage();
  if (!session?.refresh_token || !session.token) return;

  const expMs = getJwtExpMs(session.token);
  if (expMs == null) return;

  const refreshBeforeMs = 2 * 60 * 1000;
  if (Date.now() < expMs - refreshBeforeMs) return;

  await ensureRefreshedSession();
};

export const getJwtExpMs = (token: string): number | null => {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const payload = JSON.parse(
      atob(part.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
};

const parseJsonResponse = async (response: Response): Promise<Record<string, unknown>> => {
  const raw = await response.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { message: raw.trim().slice(0, 500) };
  }
};

const responseErrorMessage = (
  data: Record<string, unknown>,
  response: Response,
): string =>
  (typeof data.message === "string" && data.message.trim()) ||
  (typeof data.error === "string" && data.error.trim()) ||
  `Solicitud rechazada (${response.status}${response.statusText ? `: ${response.statusText}` : ""}).`;

const handleUnauthorized = async (path: string, retried: boolean): Promise<boolean> => {
  if (retried || isAuthExemptPath(path)) return false;
  const session = readAuthSessionFromStorage();
  if (!session?.refresh_token) {
    clearAuthSession();
    return false;
  }
  const next = await ensureRefreshedSession();
  if (next?.token) return true;
  clearAuthSession();
  return false;
};

/**
 * Fetch autenticado con reintento tras renovar sesión (401).
 * No acepta `company_id` en el cuerpo; el backend usa el JWT.
 */
export const authenticatedFetch = async (
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<Response> => {
  const session = readAuthSessionFromStorage();
  const headers = new Headers(init.headers);
  if (session?.token) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  const url = path.startsWith("http") ? path : `${API_URL}${path}`;

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
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

  if (response.status === 401) {
    const canRetry = await handleUnauthorized(path, retried);
    if (canRetry) return authenticatedFetch(path, init, true);
  }

  return response;
};

/** Actualiza usuario/empresa en localStorage desde `GET /auth/me`. */
export const refreshAuthSessionFromServer = async (): Promise<void> => {
  const session = readAuthSessionFromStorage();
  if (!session?.token) return;
  const data = await apiFetch<{ user: AuthUser; company: AuthCompany }>("/auth/me", {
    method: "GET",
  });
  persistAuthSession({ ...session, user: data.user, company: data.company });
};

export const apiFetch = async <T>(
  path: string,
  init: RequestInit = {},
  retried = false,
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

  if (response.status === 401) {
    const canRetry = await handleUnauthorized(path, retried);
    if (canRetry) return apiFetch<T>(path, init, true);
  }

  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new ApiError(responseErrorMessage(data, response), response.status, data);
  }
  return data as T;
};
