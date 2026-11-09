import fs from "node:fs";
import path from "node:path";
import { prisma } from "../prisma";
import { EcfGatewayError, type EcfGatewayPendingItem, type EcfGatewayResponsePayload } from "../types/ecfGatewayConnector";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "ecf-gateway.log");

function appendLog(message: string): void {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${message}\n`, "utf8");
  } catch {
    // ignore log failures
  }
}

export type GatewayConfig = { baseUrl: string; apiKey: string };

/** Un connector activo por empresa — esta instalacion puede atender varios RNC a la vez. */
export type GatewayConnectorTarget = GatewayConfig & { companyId: number; companyRnc: string };

/**
 * Lista las empresas con connector configurado (campo editable en CompanyProfile). Si NINGUNA
 * empresa lo tiene configurado, cae a ECF_GATEWAY_BASE_URL / ECF_GATEWAY_API_KEY (instalaciones
 * viejas de una sola empresa via .env) — pero si al menos una empresa SI lo tiene en su perfil,
 * el .env se ignora por completo (evita mezclar una empresa "fantasma" con las reales).
 */
export async function listGatewayConnectorTargets(): Promise<GatewayConnectorTarget[]> {
  const companies = await prisma.company.findMany({
    where: { ecfGatewayApiKey: { not: null }, ecfGatewayBaseUrl: { not: null } },
    select: { id: true, rnc: true, ecfGatewayBaseUrl: true, ecfGatewayApiKey: true },
  });

  const targets = companies
    .map((c) => ({
      companyId: c.id,
      companyRnc: c.rnc,
      baseUrl: (c.ecfGatewayBaseUrl ?? "").trim().replace(/\/+$/, ""),
      apiKey: (c.ecfGatewayApiKey ?? "").trim(),
    }))
    .filter((t) => t.baseUrl && t.apiKey);

  if (targets.length > 0) return targets;

  const baseUrl = (process.env.ECF_GATEWAY_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const apiKey = (process.env.ECF_GATEWAY_API_KEY ?? "").trim();
  if (!baseUrl || !apiKey) return [];
  return [{ companyId: 0, companyRnc: "env", baseUrl, apiKey }];
}

async function attemptFetch(config: GatewayConfig, pathSuffix: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  return fetch(`${config.baseUrl}${pathSuffix}`, {
    ...init,
    // Connection: close fuerza una conexión nueva por request — los workers de polling de cada
    // empresa mantienen long-polls permanentes contra el mismo host, y un socket keep-alive
    // reciclado desde ese pool puede quedar muerto y colgar la próxima request hasta el timeout.
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${config.apiKey}`, Connection: "close" },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Reintenta una vez ante fallo de red/timeout. Se observó, en pruebas contra el gateway en Render,
 * que una conexión keep-alive reciclada por un long-poll previo puede quedar muerta y el siguiente
 * request (ej. submitResponse) se cuelga hasta agotar el timeout; un reintento con conexión nueva
 * lo resuelve. Seguro para los 3 endpoints del connector (idempotentes por diseño, ver
 * CommunicationService.submitResponse/claimNext).
 */
async function callGateway(config: GatewayConfig, pathSuffix: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    return await attemptFetch(config, pathSuffix, init, timeoutMs);
  } catch (firstErr) {
    const firstMessage = firstErr instanceof Error ? firstErr.message : "Error de red desconocido.";
    appendLog(`fetch failed (intento 1) path=${pathSuffix} error=${firstMessage}`);
    try {
      return await attemptFetch(config, pathSuffix, init, timeoutMs);
    } catch (secondErr) {
      const message = secondErr instanceof Error ? secondErr.message : "Error de red desconocido.";
      appendLog(`fetch failed (intento 2) path=${pathSuffix} error=${message}`);
      throw new EcfGatewayError(`No se pudo contactar al gateway (${pathSuffix}): ${message}`, "NETWORK");
    }
  }
}

/**
 * Long-poll: el gateway sostiene esta llamada hasta ~20s si no hay nada pendiente. Devuelve como
 * mucho 1 item, ya reclamado (CLAIMED) para este connector.
 */
export async function getPendingFromGateway(config: GatewayConfig): Promise<EcfGatewayPendingItem | null> {
  const res = await callGateway(config, "/connector/pending", { method: "GET" }, 25_000);
  if (res.status === 401) {
    throw new EcfGatewayError("API key de connector invalida o revocada.", "AUTH_FAILED");
  }
  if (!res.ok) {
    throw new EcfGatewayError(`Respuesta inesperada del gateway (${res.status}) en /connector/pending.`, "BAD_RESPONSE");
  }
  const data = (await res.json()) as { items: EcfGatewayPendingItem[] };
  return data.items[0] ?? null;
}

export async function submitResponseToGateway(
  config: GatewayConfig,
  requestId: string,
  payload: EcfGatewayResponsePayload,
): Promise<void> {
  // Timeout corto: DGII sostiene la conexión ~9s del lado del gateway, y para cuando llegamos acá
  // ya se gastó tiempo firmando. callGateway reintenta una vez con conexión nueva ante un socket
  // keep-alive muerto, así que 2 intentos cortos entran mejor en el presupuesto que uno largo.
  const res = await callGateway(
    config,
    `/connector/pending/${requestId}/response`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    3_000,
  );
  if (!res.ok) {
    appendLog(`respuesta rechazada por el gateway id=${requestId} status=${res.status}`);
  }
}

export async function sendHeartbeatToGateway(config: GatewayConfig): Promise<void> {
  await callGateway(config, "/connector/heartbeat", { method: "POST" }, 5_000);
}

export { appendLog as appendEcfGatewayLog };
