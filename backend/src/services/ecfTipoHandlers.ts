import { normalizeEcfTipo } from "../utils/ecfTipo";
import type { EcfPayload } from "./validation";
import type { Cotizacion, Client } from "@prisma/client";

export type CotizacionForEcfHandler = Cotizacion & { client: Client };

export type EcfTipoHandler = {
  validateCotizacionContext(input: {
    ecfReferenceNcf: string | null;
    clientRncCedula: string;
  }): string[];
  refinePayload(
    payload: EcfPayload,
    cotizacion: CotizacionForEcfHandler,
  ): EcfPayload;
};

const trimRef = (v: string | null | undefined) => (v ?? "").trim();

const isLikelyEncf = (raw: string) => /^E\d{10,15}$/i.test(raw.replace(/\s/g, ""));

const defaultHandler: EcfTipoHandler = {
  validateCotizacionContext: () => [],
  refinePayload: (p) => p,
};

const refRequired =
  (tipo: string): EcfTipoHandler =>
  ({
    validateCotizacionContext: ({ ecfReferenceNcf }) => {
      const r = trimRef(ecfReferenceNcf);
      if (!r) {
        return [`Tipo ${tipo}: indicá el e-NCF del documento de referencia (NCFModificado).`];
      }
      if (!isLikelyEncf(r)) {
        return [
          `Tipo ${tipo}: el documento de referencia debe tener formato de e-NCF (ej. E310000000001).`,
        ];
      }
      return [];
    },
    refinePayload: (p, cot) => ({
      ...p,
      referenceEncf: trimRef(cot.ecfReferenceNcf) || undefined,
    }),
  });

const registry: Record<string, EcfTipoHandler> = {
  "33": refRequired("33"),
  "34": refRequired("34"),
};

export const getEcfTipoHandler = (ecfTipo: string): EcfTipoHandler => {
  const tipo = normalizeEcfTipo(ecfTipo);
  return registry[tipo] ?? defaultHandler;
};

export const validateCotizacionEcfBusiness = (
  ecfTipo: string,
  ecfReferenceNcf: string | null,
  clientRncCedula: string,
): string[] =>
  getEcfTipoHandler(ecfTipo).validateCotizacionContext({
    ecfReferenceNcf,
    clientRncCedula,
  });

export const refinePayloadForEcfTipo = (
  payload: EcfPayload,
  cotizacion: CotizacionForEcfHandler,
): EcfPayload => getEcfTipoHandler(cotizacion.ecfTipo).refinePayload(payload, cotizacion);
