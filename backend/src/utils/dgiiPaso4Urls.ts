import { normalizeDgiiEcfUrl } from "../config/dgiiEcf.constants";

/** Base de autenticación DGII a partir de la URL que guarda el usuario (misma lógica que frontend). */
export function normalizePaso4AuthBase(raw: string): string {
  let t = normalizeDgiiEcfUrl(raw.trim());
  t = t.replace(/\/+$/, "");
  return t.replace(/\/api\/Autenticacion(?:\/(?:Semilla|ValidarSemilla))?$/i, "");
}

export function paso4SeedUrlFromAuthBase(authBase: string): string {
  const b = normalizePaso4AuthBase(authBase);
  return b ? `${b}/api/Autenticacion/Semilla` : "";
}

export function paso4ValidateSeedUrlFromAuthBase(authBase: string): string {
  const b = normalizePaso4AuthBase(authBase);
  return b ? `${b}/api/Autenticacion/ValidarSemilla` : "";
}
