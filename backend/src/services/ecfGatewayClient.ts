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

/**
 * Config del connector: primero el perfil de empresa (campo editable en CompanyProfile),
 * con fallback a ECF_GATEWAY_BASE_URL / ECF_GATEWAY_API_KEY (instalaciones viejas via .env).
 */
async function requireConfig(): Promise<{ baseUrl: string; apiKey: string }> {
  // Puede haber varias empresas registradas en esta instalacion (desktop multi-perfil); se busca
  // puntualmente la que tiene el connector configurado en vez de asumir la primera por id.
  const company = await prisma.company.findFirst({
    where: { ecfGatewayApiKey: { not: null } },
    orderBy: { id: "asc" },
  });
  const baseUrl = (company?.ecfGatewayBaseUrl ?? process.env.ECF_GATEWAY_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const apiKey = (company?.ecfGatewayApiKey ?? process.env.ECF_GATEWAY_API_KEY ?? "").trim();
  if (!baseUrl || !apiKey) {
    throw new EcfGatewayError(
      "Falta configurar la URL y el API key del DGII Communication Gateway (perfil de empresa o ECF_GATEWAY_BASE_URL/ECF_GATEWAY_API_KEY).",
      "MISSING_CONFIG",
    );
  }
  return { baseUrl, apiKey };
}

async function attemptFetch(baseUrl: string, apiKey: string, pathSuffix: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  return fetch(`${baseUrl}${pathSuffix}`, {
    ...init,
    // Connection: close fuerza una conexión nueva por request — los 2 workers de polling
    // mantienen long-polls permanentes contra el mismo host, y un socket keep-alive reciclado
    // desde ese pool puede quedar muerto y colgar la próxima request hasta el timeout.
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${apiKey}`, Connection: "close" },
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
async function callGateway(pathSuffix: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const { baseUrl, apiKey } = await requireConfig();
  try {
    return await attemptFetch(baseUrl, apiKey, pathSuffix, init, timeoutMs);
  } catch (firstErr) {
    const firstMessage = firstErr instanceof Error ? firstErr.message : "Error de red desconocido.";
    appendLog(`fetch failed (intento 1) path=${pathSuffix} error=${firstMessage}`);
    try {
      return await attemptFetch(baseUrl, apiKey, pathSuffix, init, timeoutMs);
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
export async function getPendingFromGateway(): Promise<EcfGatewayPendingItem | null> {
  const res = await callGateway("/connector/pending", { method: "GET" }, 25_000);
  if (res.status === 401) {
    throw new EcfGatewayError("API key de connector invalida o revocada.", "AUTH_FAILED");
  }
  if (!res.ok) {
    throw new EcfGatewayError(`Respuesta inesperada del gateway (${res.status}) en /connector/pending.`, "BAD_RESPONSE");
  }
  const data = (await res.json()) as { items: EcfGatewayPendingItem[] };
  return data.items[0] ?? null;
}

export async function submitResponseToGateway(requestId: string, payload: EcfGatewayResponsePayload): Promise<void> {
  // Timeout corto: DGII sostiene la conexión ~9s del lado del gateway, y para cuando llegamos acá
  // ya se gastó tiempo firmando. callGateway reintenta una vez con conexión nueva ante un socket
  // keep-alive muerto, así que 2 intentos cortos entran mejor en el presupuesto que uno largo.
  const res = await callGateway(
    `/connector/pending/${requestId}/response`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    3_000,
  );
  if (!res.ok) {
    appendLog(`respuesta rechazada por el gateway id=${requestId} status=${res.status}`);
  }
}

export async function sendHeartbeatToGateway(): Promise<void> {
  await callGateway("/connector/heartbeat", { method: "POST" }, 5_000);
}

export { appendLog as appendEcfGatewayLog };
