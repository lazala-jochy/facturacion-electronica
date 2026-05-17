/**
 * Plantilla **RFCE 32** — Resumen Factura de Consumo Electrónica (&lt; RD$250.000).
 * Raíz `RFCE` (no `ECF`). Alineado a muestra DGII E320000000011.
 */

import { create } from "xmlbuilder2";
import type { RfcePayload } from "../../validation";
import {
  appendCompradorRfce32,
  appendEmisorRfce32,
  appendTotalesRfce32,
} from "../bloques";

export function plantillaRfce32(payload: RfcePayload): string {
  const doc = create({ version: "1.0", encoding: "utf-8" });
  const root = doc.ele("RFCE");
  const enc = root.ele("Encabezado");
  enc.ele("Version").txt("1.0");

  const idDoc = enc.ele("IdDoc");
  idDoc.ele("TipoeCF").txt("32");
  idDoc.ele("eNCF").txt(payload.ecfNumber.trim());
  idDoc.ele("TipoIngresos").txt("01");
  idDoc.ele("TipoPago").txt(payload.tipoPago ?? "1");
  idDoc.up();

  appendEmisorRfce32(enc, payload);
  appendCompradorRfce32(enc, payload);
  appendTotalesRfce32(enc, payload);
  enc.ele("CodigoSeguridadeCF").txt(payload.codigoSeguridadeCF.trim());
  enc.up();

  return doc.end({ prettyPrint: true });
}
