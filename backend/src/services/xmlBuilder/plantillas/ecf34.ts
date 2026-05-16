/**
 * Plantilla exclusiva **e-CF 34** — Nota de crédito electrónica.
 * Dos perfiles DGII:
 * - Con ITBIS (cotización habitual): IndicadorNotaCredito 0 + IndicadorMontoGravado + TipoIngresos + TipoPago.
 * - Sin ITBIS (muestra E340000000016): IndicadorNotaCredito 1 + TipoPago, totales MontoNoFacturable, ítems fact. 0.
 */

import { create } from "xmlbuilder2";
import type { EcfPayload } from "../../validation";
import {
  appendComprador,
  appendDetallesItems,
  appendEmisor,
  appendFechaHoraFirma,
  appendInformacionReferencia,
  appendTotalesItbis18,
  appendTotalesMontoNoFacturable,
} from "../bloques";

/** Código modificación nota de crédito (muestras DGII tipo 34). */
const CODIGO_MODIFICACION_NOTA_CREDITO = "2";

const usesGravadoItbis = (payload: EcfPayload) => payload.itbis > 0.001;

export function plantillaEcf34(payload: EcfPayload): string {
  const gravado = usesGravadoItbis(payload);

  const doc = create({ version: "1.0", encoding: "utf-8" });
  const root = doc.ele("ECF");
  const enc = root.ele("Encabezado");
  enc.ele("Version").txt("1.0");

  const idDoc = enc.ele("IdDoc");
  idDoc.ele("TipoeCF").txt("34");
  idDoc.ele("eNCF").txt(payload.ecfNumber.trim());
  if (gravado) {
    idDoc.ele("IndicadorNotaCredito").txt("0");
    idDoc.ele("IndicadorMontoGravado").txt("0");
    idDoc.ele("TipoIngresos").txt("01");
    idDoc.ele("TipoPago").txt("1");
  } else {
    idDoc.ele("IndicadorNotaCredito").txt("1");
    idDoc.ele("TipoPago").txt("1");
  }
  idDoc.up();

  appendEmisor(enc, payload);
  appendComprador(enc, payload);
  if (gravado) {
    appendTotalesItbis18(enc, payload);
  } else {
    appendTotalesMontoNoFacturable(enc, payload);
  }
  enc.up();

  appendDetallesItems(root, payload, gravado ? "1" : "0");
  appendInformacionReferencia(root, payload, CODIGO_MODIFICACION_NOTA_CREDITO);
  appendFechaHoraFirma(root);

  return doc.end({ prettyPrint: true });
}
