/**
 * Plantilla exclusiva **e-CF 45** — Gubernamental.
 * Alineado a muestra DGII E450000000002: dual ITBIS 18%/16%, ValorPagar, ítems fact. 1|2.
 */

import { create } from "xmlbuilder2";
import type { EcfPayload } from "../../validation";
import { DEFAULT_FECHA_VENC_SEC } from "../common";
import {
  appendComprador,
  appendDetallesItemsGubernamental45,
  appendEmisor,
  appendFechaHoraFirma,
  appendIdDocTipoPagoYFormas,
  appendTotalesGubernamental45,
} from "../bloques";

export function plantillaEcf45(payload: EcfPayload): string {
  const doc = create({ version: "1.0", encoding: "utf-8" });
  const root = doc.ele("ECF");
  const enc = root.ele("Encabezado");
  enc.ele("Version").txt("1.0");

  const idDoc = enc.ele("IdDoc");
  idDoc.ele("TipoeCF").txt("45");
  idDoc.ele("eNCF").txt(payload.ecfNumber.trim());
  idDoc.ele("FechaVencimientoSecuencia").txt(DEFAULT_FECHA_VENC_SEC);
  idDoc.ele("IndicadorMontoGravado").txt("0");
  idDoc.ele("TipoIngresos").txt("01");
  appendIdDocTipoPagoYFormas(idDoc, payload);
  idDoc.up();

  appendEmisor(enc, payload);
  appendComprador(enc, payload);
  appendTotalesGubernamental45(enc, payload);
  enc.up();

  appendDetallesItemsGubernamental45(root, payload);
  appendFechaHoraFirma(root);

  return doc.end({ prettyPrint: true });
}
