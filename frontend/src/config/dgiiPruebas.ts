/** Tipos de prueba CerteCF — cada uno con ruta y vista propia. */

export type DgiiPruebaTypeId = "ecf-excel" | "aprobaciones-comerciales";

export type DgiiPruebaTypeConfig = {
  id: DgiiPruebaTypeId;
  path: string;
  label: string;
  shortLabel: string;
  paso: string;
  description: string;
};

export const DGII_PRUEBA_TYPES: DgiiPruebaTypeConfig[] = [
  {
    id: "ecf-excel",
    path: "/dgii-pruebas/ecf-excel",
    label: "Pruebas de Datos e-CF (Excel)",
    shortLabel: "Casos Excel e-CF",
    paso: "Paso 2",
    description:
      "Generar, firmar y enviar comprobantes desde el Excel de pruebas (eCF, RFCE, consumo < 250Mil).",
  },
  {
    id: "aprobaciones-comerciales",
    path: "/dgii-pruebas/aprobaciones-comerciales",
    label: "Aprobaciones Comerciales (ACECF)",
    shortLabel: "Aprobaciones comerciales",
    paso: "Paso 3",
    description: "11 XML de aprobación comercial referenciando e-CF ya aceptados en CerteCF.",
  },
];

export const DGII_PRUEBAS_BASE = "/dgii-pruebas";

export const DEFAULT_DGII_PRUEBA_PATH = DGII_PRUEBA_TYPES[0].path;

export function findDgiiPruebaByPath(pathname: string): DgiiPruebaTypeConfig | undefined {
  return DGII_PRUEBA_TYPES.find((t) => pathname === t.path || pathname.startsWith(`${t.path}/`));
}

export function findDgiiPruebaById(id: DgiiPruebaTypeId): DgiiPruebaTypeConfig {
  const found = DGII_PRUEBA_TYPES.find((t) => t.id === id);
  if (!found) throw new Error(`Tipo de prueba DGII desconocido: ${id}`);
  return found;
}
