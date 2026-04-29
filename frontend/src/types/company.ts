export type AuthCompany = {
  id: number;
  razonSocial: string;
  email: string;
  rnc: string;
  direccion: string;
};

export type AuthResponse = {
  message: string;
  company: AuthCompany;
  session?: { token: string };
};

export type AuthPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = AuthPayload & {
  razonSocial: string;
  rnc: string;
  direccion: string;
};