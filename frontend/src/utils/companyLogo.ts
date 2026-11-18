import type { AuthCompany } from "../types/session";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/** URL absoluta del logo de la empresa, o null si no hay archivo. */
export function companyUploadedLogoUrl(company: AuthCompany): string | null {
  if (!company.logoUrl) return null;
  // Logo subido al bucket de Supabase Storage: ya es una URL absoluta, se usa tal cual.
  if (/^https?:\/\//i.test(company.logoUrl)) return company.logoUrl;
  // Instalaciones viejas: ruta relativa servida por el backend local (/uploads/...).
  const base = API_URL.replace(/\/$/, "");
  return `${base}${company.logoUrl.startsWith("/") ? company.logoUrl : `/${company.logoUrl}`}`;
}

/** URL absoluta de la firma autorizada de la empresa, o null si no hay archivo. */
export function companyUploadedSignatureUrl(company: AuthCompany): string | null {
  if (!company.signatureUrl) return null;
  if (/^https?:\/\//i.test(company.signatureUrl)) return company.signatureUrl;
  const base = API_URL.replace(/\/$/, "");
  return `${base}${company.signatureUrl.startsWith("/") ? company.signatureUrl : `/${company.signatureUrl}`}`;
}
