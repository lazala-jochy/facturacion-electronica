/**
 * Plantilla exclusiva **e-CF 43** — Gastos menores electrónicos.
 * Alineado a muestra DGII E430000000011: IdDoc mínimo, sin Comprador, totales exentos, ítems fact. 4.
 */

import { create } from "xmlbuilder2";
import type { EcfPayload } from "../../validation";
import { DEFAULT_FECHA_VENC_SEC } from "../common";
import {
  appendDetallesItemsGastosMenores43,
  appendEmisor,
  appendFechaHoraFirma,
  appendTotalesGastosMenores43,
} from "../bloques";

export function plantillaEcf43(payload: EcfPayload): string {
  const doc = create({ version: "1.0", encoding: "utf-8" });
  const root = doc.ele("ECF");
  const enc = root.ele("Encabezado");
  enc.ele("Version").txt("1.0");

  const idDoc = enc.ele("IdDoc");
  idDoc.ele("TipoeCF").txt("43");
  idDoc.ele("eNCF").txt(payload.ecfNumber.trim());
  idDoc.ele("FechaVencimientoSecuencia").txt(DEFAULT_FECHA_VENC_SEC);
  idDoc.ele("TipoPago").txt(payload.tipoPago ?? "1");
  idDoc.up();

  appendEmisor(enc, payload);
  appendTotalesGastosMenores43(enc, payload);
  enc.up();

  appendDetallesItemsGastosMenores43(root, payload);
  appendFechaHoraFirma(root);

  return doc.end({ prettyPrint: true });
}
