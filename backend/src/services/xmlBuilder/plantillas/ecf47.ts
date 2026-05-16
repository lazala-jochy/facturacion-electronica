/**
 * Plantilla exclusiva **e-CF 47** — Pagos al exterior.
 * Alineado a muestra DGII E470000000009: comprador extranjero, exento, retención ISR.
 */

import { create } from "xmlbuilder2";
import type { EcfPayload } from "../../validation";
import { DEFAULT_FECHA_VENC_SEC } from "../common";
import {
  appendCompradorExtranjero47,
  appendDetallesItemsPagoExterior47,
  appendEmisor,
  appendFechaHoraFirma,
  appendIdDocTipoPagoYFormas,
  appendTotalesPagoExterior47,
} from "../bloques";

export function plantillaEcf47(payload: EcfPayload): string {
  const doc = create({ version: "1.0", encoding: "utf-8" });
  const root = doc.ele("ECF");
  const enc = root.ele("Encabezado");
  enc.ele("Version").txt("1.0");

  const idDoc = enc.ele("IdDoc");
  idDoc.ele("TipoeCF").txt("47");
  idDoc.ele("eNCF").txt(payload.ecfNumber.trim());
  idDoc.ele("FechaVencimientoSecuencia").txt(DEFAULT_FECHA_VENC_SEC);
  appendIdDocTipoPagoYFormas(idDoc, payload);
  idDoc.up();

  appendEmisor(enc, payload);
  appendCompradorExtranjero47(enc, payload);
  appendTotalesPagoExterior47(enc, payload);
  enc.up();

  appendDetallesItemsPagoExterior47(root, payload);
  appendFechaHoraFirma(root);

  return doc.end({ prettyPrint: true });
}
