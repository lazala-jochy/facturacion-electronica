/**
 * Plantilla exclusiva **e-CF 34** — Nota de crédito electrónica.
 * Requiere NCFModificado (referenceEncf).
 */

import { create } from "xmlbuilder2";
import type { EcfPayload } from "../../validation";
import { DEFAULT_FECHA_VENC_SEC } from "../common";
import {
  appendComprador,
  appendDetallesItems,
  appendEmisor,
  appendFechaHoraFirma,
  appendIdDocTipoPagoYFormas,
  appendTotalesItbis18,
} from "../bloques";

export function plantillaEcf34(payload: EcfPayload): string {
  const ref = (payload.referenceEncf ?? "").trim();

  const doc = create({ version: "1.0", encoding: "utf-8" });
  const root = doc.ele("ECF");
  const enc = root.ele("Encabezado");
  enc.ele("Version").txt("1.0");

  const idDoc = enc.ele("IdDoc");
  idDoc.ele("TipoeCF").txt("34");
  idDoc.ele("eNCF").txt(payload.ecfNumber.trim());
  if (ref) idDoc.ele("NCFModificado").txt(ref);
  idDoc.ele("IndicadorNotaCredito").txt("1");
  idDoc.ele("FechaVencimientoSecuencia").txt(DEFAULT_FECHA_VENC_SEC);
  idDoc.ele("IndicadorMontoGravado").txt("0");
  idDoc.ele("TipoIngresos").txt("01");
  appendIdDocTipoPagoYFormas(idDoc, payload);
  idDoc.up();

  appendEmisor(enc, payload);
  appendComprador(enc, payload);
  appendTotalesItbis18(enc, payload);
  enc.up();

  appendDetallesItems(root, payload);
  appendFechaHoraFirma(root);

  return doc.end({ prettyPrint: true });
}
