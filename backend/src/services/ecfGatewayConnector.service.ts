import { appendEcfGatewayLog, getPendingFromGateway, sendHeartbeatToGateway, submitResponseToGateway } from "./ecfGatewayClient";
import { dispatchEcfGatewayItem } from "./ecfGatewayHandlers";
import { EcfGatewayError } from "../types/ecfGatewayConnector";

const HEARTBEAT_INTERVAL_MS = 30_000;
const RETRY_AFTER_ERROR_MS = 5_000;

async function pollLoop(workerId: number, stopSignal: { stopped: boolean }): Promise<void> {
  while (!stopSignal.stopped) {
    try {
      const item = await getPendingFromGateway();
      if (!item) continue;

      const response = await dispatchEcfGatewayItem(item);
      await submitResponseToGateway(item.id, response);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido.";
      appendEcfGatewayLog(`worker=${workerId} error en poll loop: ${message}`);
      if (err instanceof EcfGatewayError && err.code === "MISSING_CONFIG") {
        return; // sin configuracion no tiene sentido reintentar en loop apretado
      }
      await new Promise((r) => setTimeout(r, RETRY_AFTER_ERROR_MS));
    }
  }
}

/**
 * Arranca N workers de long-polling contra el DGII Communication Gateway. La URL/API key se leen
 * del perfil de empresa (CompanyProfile) o, si ese campo esta vacio, de ECF_GATEWAY_BASE_URL /
 * ECF_GATEWAY_API_KEY. Se puede desactivar con ECF_GATEWAY_CONNECTOR=false. Si no hay configuracion
 * en ningun lado, cada worker se apaga solo al primer intento (ver MISSING_CONFIG en pollLoop).
 */
export function startEcfGatewayConnectorWorker(): () => void {
  const enabled = process.env.ECF_GATEWAY_CONNECTOR !== "false";
  if (!enabled) {
    return () => undefined;
  }

  const workerCount = Math.min(Math.max(Number.parseInt(process.env.ECF_GATEWAY_CONNECTOR_WORKERS ?? "2", 10) || 2, 1), 5);
  const stopSignal = { stopped: false };

  for (let i = 0; i < workerCount; i += 1) {
    void pollLoop(i, stopSignal);
  }

  const heartbeatHandle = setInterval(() => {
    sendHeartbeatToGateway().catch((err) => appendEcfGatewayLog(`heartbeat fallo: ${err instanceof Error ? err.message : err}`));
  }, HEARTBEAT_INTERVAL_MS);

  console.log(`[ecf-gateway] connector activo (${workerCount} workers de polling).`);

  return () => {
    stopSignal.stopped = true;
    clearInterval(heartbeatHandle);
  };
}
