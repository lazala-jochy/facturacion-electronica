export type AuthCompany = {
  id: number;
  razonSocial: string;
  email: string;
  rnc: string;
  direccion: string;
};

type AuthResponse = {
  message: string;
  company: AuthCompany;
  session?: { token: string };
};

type AuthPayload = {
  email: string;
  password: string;
};

type RegisterPayload = AuthPayload & {
  razonSocial: string;
  rnc: string;
  direccion: string;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const request = async <T>(path: string, payload: object): Promise<T> => {
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

export const registerCompany = (payload: RegisterPayload) =>
  request<AuthResponse>("/auth/register", payload);

export const loginCompany = (payload: AuthPayload) =>
  request<AuthResponse>("/auth/login", payload);
