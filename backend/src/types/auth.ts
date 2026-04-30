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

export type UpdateCompanyBody = {
  name?: string;
  rnc?: string;
  address?: string;
  phone?: string;
  email?: string;
  regime?: string;
  full_name?: string;
  cedula?: string;
};
