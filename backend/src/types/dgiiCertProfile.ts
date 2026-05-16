/** Perfil de URLs DGII en certificación: Paso 2 (lote Excel / estándar) vs Paso 4 (simulación e-CF). */
export type DgiiCertProfile = "paso2" | "paso4";

export const parseDgiiCertProfile = (raw: unknown): DgiiCertProfile => {
  const s = String(raw ?? "paso2")
    .trim()
    .toLowerCase();
  if (s === "paso4" || s === "4" || s === "paso_4") return "paso4";
  return "paso2";
};
