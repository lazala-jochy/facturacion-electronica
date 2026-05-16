/**
 * Registro de plantillas e-CF: un módulo por tipo (`ecf31.ts` … `ecf47.ts`).
 */

import type { EcfPayload } from "../../validation";
import { resolvePlantillaEcfTipo } from "../../../utils/ecfTipo";
export { mapUnidadMedidaDgii } from "../common";

import { plantillaEcf31 } from "./ecf31";
import { plantillaEcf32 } from "./ecf32";
import { plantillaEcf33 } from "./ecf33";
import { plantillaEcf34 } from "./ecf34";
import { plantillaEcf41 } from "./ecf41";
import { plantillaEcf43 } from "./ecf43";
import { plantillaEcf44 } from "./ecf44";
import { plantillaEcf45 } from "./ecf45";
import { plantillaEcf46 } from "./ecf46";
import { plantillaEcf47 } from "./ecf47";

export {
  plantillaEcf31,
  plantillaEcf32,
  plantillaEcf33,
  plantillaEcf34,
  plantillaEcf41,
  plantillaEcf43,
  plantillaEcf44,
  plantillaEcf45,
  plantillaEcf46,
  plantillaEcf47,
};

const REGISTRY: Record<string, (p: EcfPayload) => string> = {
  "31": plantillaEcf31,
  "32": plantillaEcf32,
  "33": plantillaEcf33,
  "34": plantillaEcf34,
  "41": plantillaEcf41,
  "43": plantillaEcf43,
  "44": plantillaEcf44,
  "45": plantillaEcf45,
  "46": plantillaEcf46,
  "47": plantillaEcf47,
};

export const ECF_XML_PLANTILLA_TIPOS = Object.keys(REGISTRY).sort() as string[];

/**
 * Genera XML `ECF` con la plantilla del **tipo de comprobante fiscal** (`payload.ecfTipo`).
 * Si no está definido, se usa el tipo inferido del prefijo del e-NCF.
 */
export function buildEcfXml(payload: EcfPayload): string {
  const tipo = resolvePlantillaEcfTipo(payload);
  const fn = REGISTRY[tipo];
  if (!fn) {
    throw new Error(
      `Plantilla XML no definida para tipo e-CF ${tipo}. Implementada: ${ECF_XML_PLANTILLA_TIPOS.join(", ")}.`,
    );
  }
  return fn(payload);
}

export { resolvePlantillaEcfTipo };
