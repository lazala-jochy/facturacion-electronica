/**
 * Plantilla exclusiva **e-CF 44** — Regímenes especiales electrónico.
 * Alineado a muestra DGII E440000000010: IdDoc sin IndicadorMontoGravado, totales exentos, ítems fact. 4.
 */

import { create } from "xmlbuilder2";
import type { EcfPayload } from "../../validation";
import { DEFAULT_FECHA_VENC_SEC } from "../common";
import {
  appendComprador,
  appendDetallesItemsRegimenEspecial44,
  appendEmisor,
  appendFechaHoraFirma,
  appendIdDocTipoPagoYFormas,
  appendTotalesRegimenEspecial44,
} from "../bloques";

export function plantillaEcf44(payload: EcfPayload): string {
  const doc = create({ version: "1.0", encoding: "utf-8" });
  const root = doc.ele("ECF");
  const enc = root.ele("Encabezado");
  enc.ele("Version").txt("1.0");

  const idDoc = enc.ele("IdDoc");
  idDoc.ele("TipoeCF").txt("44");
  idDoc.ele("eNCF").txt(payload.ecfNumber.trim());
  idDoc.ele("FechaVencimientoSecuencia").txt(DEFAULT_FECHA_VENC_SEC);
  idDoc.ele("TipoIngresos").txt("01");
  appendIdDocTipoPagoYFormas(idDoc, payload);
  idDoc.up();

  appendEmisor(enc, payload);
  appendComprador(enc, payload);
  appendTotalesRegimenEspecial44(enc, payload);
  enc.up();

  appendDetallesItemsRegimenEspecial44(root, payload);
  appendFechaHoraFirma(root);

  return doc.end({ prettyPrint: true });
}
