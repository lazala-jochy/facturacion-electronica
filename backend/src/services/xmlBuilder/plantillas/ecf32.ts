/**
 * Plantilla exclusiva **e-CF 32** — Factura de consumo (ECF; monto ≥ RD$250.000 o flujo directo).
 * XSD DGII `e-CF 32 v.1.0`: `IndicadorServicioTodoIncluido` es opcional y, si existe, **solo admite 1**.
 * Si no es servicio todo incluido, **omitir** el elemento (no enviar 0 — no está en la enumeración y DGII rechaza).
 * Sin `FechaVencimientoSecuencia` en IdDoc (no aplica igual que en tipo 31).
 * Consumo &lt; 250k en certificación: RFCE (`buildRfceXml` en utils), no este archivo.
 */

import { create } from "xmlbuilder2";
import type { EcfPayload } from "../../validation";
import {
  appendComprador,
  appendDetallesItems,
  appendEmisor,
  appendFechaHoraFirma,
  appendIdDocTipoPagoYFormas,
  appendTotalesItbis18,
} from "../bloques";

export function plantillaEcf32(payload: EcfPayload): string {
  const doc = create({ version: "1.0", encoding: "utf-8" });
  const root = doc.ele("ECF");
  const enc = root.ele("Encabezado");
  enc.ele("Version").txt("1.0");

  const idDoc = enc.ele("IdDoc");
  idDoc.ele("TipoeCF").txt("32");
  idDoc.ele("eNCF").txt(payload.ecfNumber.trim());
  /** DGII código 164: para e-CF 32 sólo vale 1 (envío AUTORIZADO), no 0. */
  idDoc.ele("IndicadorEnvioDiferido").txt("1");
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
