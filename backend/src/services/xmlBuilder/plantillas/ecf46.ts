/**
 * Plantilla exclusiva **e-CF 46** — Exportaciones.
 * Alineado a muestra DGII E460000000001: crédito, totales I3/ITBIS 0%, ítems fact. 3.
 */

import { create } from "xmlbuilder2";
import type { EcfPayload } from "../../validation";
import { DEFAULT_FECHA_VENC_SEC } from "../common";
import {
  appendComprador,
  appendDetallesItemsExportacion46,
  appendEmisor,
  appendFechaHoraFirma,
  appendIdDocExportacion46,
  appendTotalesExportacion46,
} from "../bloques";

export function plantillaEcf46(payload: EcfPayload): string {
  const doc = create({ version: "1.0", encoding: "utf-8" });
  const root = doc.ele("ECF");
  const enc = root.ele("Encabezado");
  enc.ele("Version").txt("1.0");

  const idDoc = enc.ele("IdDoc");
  idDoc.ele("TipoeCF").txt("46");
  idDoc.ele("eNCF").txt(payload.ecfNumber.trim());
  idDoc.ele("FechaVencimientoSecuencia").txt(DEFAULT_FECHA_VENC_SEC);
  idDoc.ele("TipoIngresos").txt("01");
  appendIdDocExportacion46(idDoc, payload);
  idDoc.up();

  appendEmisor(enc, payload);
  appendComprador(enc, payload);
  appendTotalesExportacion46(enc, payload);
  enc.up();

  appendDetallesItemsExportacion46(root, payload);
  appendFechaHoraFirma(root);

  return doc.end({ prettyPrint: true });
}
