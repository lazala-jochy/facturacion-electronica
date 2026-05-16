/**
 * Token Bearer DGII para todo el proceso (consulta estado, recepción e-CF, etc.).
 * Configurarlo una vez en el entorno del servidor evita depender solo del flujo semilla por empresa.
 *
 * Variables soportadas (la primera no vacía gana):
 * - `DGII_ECF_TOKEN` (histórico en este proyecto)
 * - `DGII_BEARER_TOKEN`
 * - `DGII_TOKEN`
 */
export function readGlobalDgiiBearerToken(): string | null {
  const t =
    process.env.DGII_ECF_TOKEN?.trim() ||
    process.env.DGII_BEARER_TOKEN?.trim() ||
    process.env.DGII_TOKEN?.trim() ||
    "";
  return t.length > 0 ? t : null;
}
