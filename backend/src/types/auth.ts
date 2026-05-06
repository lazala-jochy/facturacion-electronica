export type RegisterBody = {
  name?: string;
  rnc?: string;
  address?: string;
  full_name?: string;
  cedula?: string;
  email?: string;
  password?: string;
  /** Teléfono de la empresa (emisor en cotización). */
  company_phone?: string;
  /** Correo de contacto de la empresa (distinto al del usuario). */
  company_email?: string;
};

export type LoginBody = {
  email?: string;
  password?: string;
};

export type ForgotPasswordBody = {
  email?: string;
};

export type ResetPasswordBody = {
  token?: string;
  password?: string;
};

export type UpdateCompanyBody = {
  name?: string;
  rnc?: string;
  address?: string;
  phone?: string;
  email?: string;
  regime?: string;
  full_name?: string;
  cedula?: string;
  /** URL del endpoint DGII (e-CF). Vacío deja de usar valor por empresa. */
  dgii_ecf_endpoint?: string;
  /** Clave de cifrado del certificado guardada en perfil (se valida contra el .p12 si ya hay certificado). */
  certificate_keyphrase?: string;
  dgii_username?: string;
  dgii_password?: string;
  dgii_auth_url?: string;
  dgii_reception_url?: string;
  dgii_consult_url?: string;
};
