/**
 * Plantilla exclusiva **e-CF 41** — Comprobante de compras electrónico.
 * Alineado a muestra DGII E410000000007: IdDoc sin TipoIngresos; retenciones en Totales e Items.
 */

import { create } from "xmlbuilder2";
import type { EcfPayload } from "../../validation";
import { DEFAULT_FECHA_VENC_SEC } from "../common";
import {
  appendCompradorMinimal,
  appendDetallesItemsCompras41,
  appendEmisor,
  appendFechaHoraFirma,
  appendIdDocTipoPagoYFormas,
  appendTotalesCompras41,
} from "../bloques";

export function plantillaEcf41(payload: EcfPayload): string {
  const doc = create({ version: "1.0", encoding: "utf-8" });
  const root = doc.ele("ECF");
  const enc = root.ele("Encabezado");
  enc.ele("Version").txt("1.0");

  const idDoc = enc.ele("IdDoc");
  idDoc.ele("TipoeCF").txt("41");
  idDoc.ele("eNCF").txt(payload.ecfNumber.trim());
  idDoc.ele("FechaVencimientoSecuencia").txt(DEFAULT_FECHA_VENC_SEC);
  idDoc.ele("IndicadorMontoGravado").txt("0");
  appendIdDocTipoPagoYFormas(idDoc, payload);
  idDoc.up();

  appendEmisor(enc, payload);
  appendCompradorMinimal(enc, payload);
  appendTotalesCompras41(enc, payload);
  enc.up();

  appendDetallesItemsCompras41(root, payload);
  appendFechaHoraFirma(root);

  return doc.end({ prettyPrint: true });
}
