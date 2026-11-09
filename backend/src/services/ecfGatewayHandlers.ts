import { appendEcfGatewayLog } from "./ecfGatewayClient";
import type { EcfGatewayPendingItem, EcfGatewayResponsePayload } from "../types/ecfGatewayConnector";
import { prisma } from "../prisma";
import { loadCompanySigningMaterial } from "../commercial-approvals/companySigning";
import { signXmlWithP12Buffer } from "./signer";
import { buildArecfXml, type ArecfCodigoMotivoNoRecibido } from "./arecfXmlBuilder";

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, "i"));
  return match ? match[1] : null;
}

/** El path del connector viene como /{rnc}/fe/.../api/... (ver ecf-gateway README). */
function extractRncFromPath(path: string): string | null {
  return path.match(/^\/(\d{9}|\d{11})\//)?.[1] ?? null;
}

function jsonResponse(status: number, message: string): EcfGatewayResponsePayload {
  return {
    status,
    headers: { "content-type": "application/json" },
    bodyBase64: Buffer.from(JSON.stringify({ message })).toString("base64"),
  };
}

/**
 * Genera y firma el XML `ARECF` (Acuse de Recibo del e-CF) — spec oficial DGII "Formato Acuse de
 * Recibo (ARECF) v1.0". El acuse solo confirma recepción del e-CF, no aprobación/rechazo comercial
 * (eso va por APROBACION_COMERCIAL). Si el e-CF recibido no trae los datos mínimos, se responde
 * igual un ARECF firmado con Estado=1 (no recibido) — DGII no documenta un código de error HTTP
 * para este servicio, así que la firma es la única vía honesta de reportar el rechazo.
 */
async function handleRecepcionEcf(item: EcfGatewayPendingItem): Promise<EcfGatewayResponsePayload> {
  const rncReceptor = extractRncFromPath(item.path);
  if (!rncReceptor) {
    appendEcfGatewayLog(`RECEPCION_ECF id=${item.id} — no se pudo extraer RNC del path=${item.path}.`);
    return jsonResponse(502, "No se pudo determinar el contribuyente receptor a partir de la URL.");
  }

  const company = await prisma.company.findUnique({ where: { rnc: rncReceptor } });
  if (!company) {
    appendEcfGatewayLog(`RECEPCION_ECF id=${item.id} — empresa no encontrada para rnc=${rncReceptor}.`);
    return jsonResponse(503, "Contribuyente receptor no configurado en este sistema.");
  }

  const signing = await loadCompanySigningMaterial(company);
  if (!signing) {
    appendEcfGatewayLog(`RECEPCION_ECF id=${item.id} — empresa ${company.id} sin certificado DGII configurado.`);
    return jsonResponse(503, "Certificado DGII no configurado para este contribuyente.");
  }

  const receivedXml = Buffer.from(item.bodyBase64, "base64").toString("utf8");
  const rncEmisor = extractTag(receivedXml, "rncemisor");
  const encf = extractTag(receivedXml, "encf");

  let estado: "0" | "1" = "0";
  let codigoMotivoNoRecibido: ArecfCodigoMotivoNoRecibido | undefined;
  if (!rncEmisor || !encf) {
    estado = "1";
    codigoMotivoNoRecibido = "1"; // Error de especificación.
  }

  try {
    const { xml } = buildArecfXml({
      // RNCEmisor es obligatorio en el ARECF aunque el e-CF recibido no lo traiga (Estado=1 ya
      // reporta el error de especificación); placeholder NUM(9) para no romper el formato.
      rncEmisor: rncEmisor ?? "000000000",
      rncComprador: company.rnc,
      encf: encf ?? `SIN-ENCF-${item.id}`,
      estado,
      codigoMotivoNoRecibido,
    });
    const signedXml = signXmlWithP12Buffer(xml, signing.p12Buffer, signing.passphrase, "modern-sha256");
    appendEcfGatewayLog(
      `RECEPCION_ECF id=${item.id} rncEmisor=${rncEmisor ?? "?"} eNCF=${encf ?? "?"} estado=${estado} — ARECF firmado (200).`,
    );
    return {
      status: 200,
      headers: { "content-type": "application/xml" },
      bodyBase64: Buffer.from(signedXml, "utf8").toString("base64"),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error generando ARECF.";
    appendEcfGatewayLog(`RECEPCION_ECF id=${item.id} — error generando/firmando ARECF: ${message}`);
    return jsonResponse(503, "No se pudo generar el acuse de recibo.");
  }
}

/**
 * TODO (pendiente): validar la firma del XML semilla recibido contra un certificado/RNC de
 * confianza y emitir un token propio. No implementado — este backend hoy no valida firmas de
 * terceros, solo firma las suyas propias hacia DGII.
 */
async function handleAuthValidacion(item: EcfGatewayPendingItem): Promise<EcfGatewayResponsePayload> {
  appendEcfGatewayLog(`AUTH_VALIDACION id=${item.id} — sin implementar, respondiendo 401.`);
  return { status: 401, headers: { "content-type": "application/json" }, bodyBase64: Buffer.from(JSON.stringify({ message: "Autenticacion de receptor no implementada." })).toString("base64") };
}

/**
 * Implementación mínima: DGII solo exige el código HTTP (200/400) para este endpoint, sin
 * contrato de cuerpo. Se registra la aprobación comercial recibida para auditoría; correlacionarla
 * con la cotización/e-CF original queda para una iteración futura.
 */
async function handleAprobacionComercial(item: EcfGatewayPendingItem): Promise<EcfGatewayResponsePayload> {
  const xml = Buffer.from(item.bodyBase64, "base64").toString("utf8");
  const rncEmisor = extractTag(xml, "rncemisor");
  const rncComprador = extractTag(xml, "rnccomprador");
  const encf = extractTag(xml, "encf");
  appendEcfGatewayLog(
    `APROBACION_COMERCIAL id=${item.id} rncEmisor=${rncEmisor ?? "?"} rncComprador=${rncComprador ?? "?"} eNCF=${encf ?? "?"} — aceptada (200).`,
  );
  return { status: 200 };
}

export async function dispatchEcfGatewayItem(item: EcfGatewayPendingItem): Promise<EcfGatewayResponsePayload> {
  switch (item.type) {
    case "RECEPCION_ECF":
      return handleRecepcionEcf(item);
    case "APROBACION_COMERCIAL":
      return handleAprobacionComercial(item);
    case "AUTH_VALIDACION":
      return handleAuthValidacion(item);
    default:
      appendEcfGatewayLog(`tipo desconocido id=${item.id} type=${item.type}`);
      return { status: 502 };
  }
}
