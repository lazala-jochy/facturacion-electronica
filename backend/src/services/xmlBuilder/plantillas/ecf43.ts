/**
 * Plantilla exclusiva **e-CF 43** — Gastos menores.
 * IdDoc alineado a muestra DGII E430000000011: solo FechaVencimientoSecuencia; sin Comprador.
 */

import { create } from "xmlbuilder2";
import type { EcfPayload } from "../../validation";
import { DEFAULT_FECHA_VENC_SEC } from "../common";
import {
  appendDetallesItems,
  appendEmisor,
  appendFechaHoraFirma,
  appendTotalesExento,
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
  idDoc.up();

  appendEmisor(enc, payload);
  appendTotalesExento(enc, payload);
  enc.up();

  appendDetallesItems(root, payload, "4");
  appendFechaHoraFirma(root);

  return doc.end({ prettyPrint: true });
}
