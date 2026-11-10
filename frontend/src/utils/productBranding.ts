/** Título de documento cuando no hay razón social disponible. */
export const defaultDocumentTitle = "Lazala Facturación.";

export function documentTitleWithCompany(razonSocial: string | null | undefined): string {
  const n = razonSocial?.trim();
  if (n) return `Lazala Facturación ${n}.`;
  return defaultDocumentTitle;
}

/** Titular en pantalla (sin punto final). */
export function headlineWithCompany(razonSocial: string | null | undefined): string {
  const n = razonSocial?.trim();
  if (n) return `Lazala Facturación ${n}`;
  return "Lazala Facturación";
}
