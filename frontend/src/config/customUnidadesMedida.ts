/**
 * Unidades de medida que el usuario agrega a mano porque no están en el catálogo DGII
 * (config/unidadesMedida.ts). Se guardan en localStorage para que queden disponibles en
 * cotizaciones futuras. Valores no reconocidos por DGII caen en "Unidad" (código 43) al
 * armar el XML -- ver mapUnidadMedidaDgii en el backend.
 */
const STORAGE_KEY = "customUnidadesMedida";

export function getCustomUnidadesMedida(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function addCustomUnidadMedida(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return getCustomUnidadesMedida();
  const current = getCustomUnidadesMedida();
  if (current.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return current;
  const updated = [...current, trimmed];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}
