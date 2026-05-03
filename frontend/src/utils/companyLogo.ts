import type { AuthCompany } from "../types/session";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/** URL absoluta del logo subido al API, o null si no hay archivo. */
export function companyUploadedLogoUrl(company: AuthCompany): string | null {
  if (!company.logoUrl) return null;
  const base = API_URL.replace(/\/$/, "");
  return `${base}${company.logoUrl.startsWith("/") ? company.logoUrl : `/${company.logoUrl}`}`;
}
