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
  rnc_cedula: string;
  phone?: string;
  email?: string;
};

export type ClientCreatedResponse = {
  message: string;
  client: {
    id: number;
    name: string;
    rnc_cedula: string;
    phone: string | null;
    email: string | null;
    company_id: number;
  };
};
