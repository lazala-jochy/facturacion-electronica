/**
 * e-CF 32 **íntegro** para flujo consumo &lt; 250k (RFCE + CerteCF).
 * Alineado a `consumo-integras-firmados/E320000000011` del lote Excel DGII:
 * sin xmlns, sin `IndicadorEnvioDiferido`, sin `TablaFormasPago`; con `ITBIS1` en Totales.
 */

import { create } from "xmlbuilder2";
import type { EcfPayload } from "../../validation";
import {
  appendComprador,
  appendDetallesItems,
  appendEmisor,
  appendFechaHoraFirma,
  appendTotalesExento,
  appendTotalesItbis18,
} from "../bloques";

export function plantillaEcf32ConsumoIntegra(payload: EcfPayload): string {
  const doc = create({ version: "1.0", encoding: "utf-8" });
  const root = doc.ele("ECF");
  const enc = root.ele("Encabezado");
  enc.ele("Version").txt("1.0");

  const idDoc = enc.ele("IdDoc");
  idDoc.ele("TipoeCF").txt("32");
  idDoc.ele("eNCF").txt(payload.ecfNumber.trim());
  if (!payload.exento) {
    idDoc.ele("IndicadorMontoGravado").txt("0");
  }
  idDoc.ele("TipoIngresos").txt("01");
  idDoc.ele("TipoPago").txt(payload.tipoPago ?? "1");
  idDoc.up();

  appendEmisor(enc, payload);
  appendComprador(enc, payload);
  if (payload.exento) {
    appendTotalesExento(enc, payload);
  } else {
    appendTotalesItbis18(enc, payload);
  }
  enc.up();

  appendDetallesItems(root, payload, payload.exento ? "4" : "1");
  appendFechaHoraFirma(root);

  return doc.end({ prettyPrint: true });
}
