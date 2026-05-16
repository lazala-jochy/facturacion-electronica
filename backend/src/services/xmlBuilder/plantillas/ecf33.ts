/**
 * Plantilla exclusiva **e-CF 33** — Nota de débito electrónica.
 * IdDoc alineado a muestra DGII: sin NCFModificado (va en InformacionReferencia).
 */

import { create } from "xmlbuilder2";
import type { EcfPayload } from "../../validation";
import { DEFAULT_FECHA_VENC_SEC } from "../common";
import {
  appendComprador,
  appendDetallesItems,
  appendEmisor,
  appendFechaHoraFirma,
  appendIdDocTipoPagoYFormas,
  appendInformacionReferencia,
  appendTotalesItbis18,
} from "../bloques";

/** Código modificación nota de débito (muestra DGII tipo 33). */
const CODIGO_MODIFICACION_NOTA_DEBITO = "3";

export function plantillaEcf33(payload: EcfPayload): string {
  const doc = create({ version: "1.0", encoding: "utf-8" });
  const root = doc.ele("ECF");
  const enc = root.ele("Encabezado");
  enc.ele("Version").txt("1.0");

  const idDoc = enc.ele("IdDoc");
  idDoc.ele("TipoeCF").txt("33");
  idDoc.ele("eNCF").txt(payload.ecfNumber.trim());
  idDoc.ele("FechaVencimientoSecuencia").txt(DEFAULT_FECHA_VENC_SEC);
  idDoc.ele("IndicadorMontoGravado").txt("0");
  idDoc.ele("TipoIngresos").txt("01");
  appendIdDocTipoPagoYFormas(idDoc, payload);
  idDoc.up();

  appendEmisor(enc, payload);
  appendComprador(enc, payload);
  appendTotalesItbis18(enc, payload);
  enc.up();

  appendDetallesItems(root, payload);
  appendInformacionReferencia(root, payload, CODIGO_MODIFICACION_NOTA_DEBITO);
  appendFechaHoraFirma(root);

  return doc.end({ prettyPrint: true });
}
