import {
  appendEcfGatewayLog,
  getPendingFromGateway,
  listGatewayConnectorTargets,
  sendHeartbeatToGateway,
  submitResponseToGateway,
  type GatewayConnectorTarget,
} from "./ecfGatewayClient";
import { dispatchEcfGatewayItem } from "./ecfGatewayHandlers";

const HEARTBEAT_INTERVAL_MS = 30_000;
const RETRY_AFTER_ERROR_MS = 5_000;
const RESCAN_INTERVAL_MS = 30_000;

type CompanyWorker = {
  stopSignal: { stopped: boolean };
  heartbeatHandle: NodeJS.Timeout;
  configKey: string;
};

const configKeyOf = (t: GatewayConnectorTarget) => `${t.baseUrl}::${t.apiKey}`;

async function pollLoop(target: GatewayConnectorTarget, workerId: number, stopSignal: { stopped: boolean }): Promise<void> {
  while (!stopSignal.stopped) {
    try {
      const item = await getPendingFromGateway(target);
      if (!item) continue;

      const response = await dispatchEcfGatewayItem(item);
      await submitResponseToGateway(target, item.id, response);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido.";
      appendEcfGatewayLog(`rnc=${target.companyRnc} worker=${workerId} error en poll loop: ${message}`);
      await new Promise((r) => setTimeout(r, RETRY_AFTER_ERROR_MS));
    }
  }
}

/**
 * Arranca (y mantiene al dia) un set de workers de long-polling POR EMPRESA contra el DGII
 * Communication Gateway — esta instalacion puede atender varios RNC a la vez, cada uno con su
 * propio connector (URL/API key en el perfil de esa empresa). Un reescaneo periodico detecta
 * altas (empresa nueva con connector configurado), bajas (se borro/vacio la config) y cambios de
 * API key, sin necesitar reiniciar el proceso. Se puede desactivar todo con ECF_GATEWAY_CONNECTOR=false.
 */
export function startEcfGatewayConnectorWorker(): () => void {
  const enabled = process.env.ECF_GATEWAY_CONNECTOR !== "false";
  if (!enabled) {
    return () => undefined;
  }

  const workerCount = Math.min(Math.max(Number.parseInt(process.env.ECF_GATEWAY_CONNECTOR_WORKERS ?? "2", 10) || 2, 1), 5);
  const running = new Map<number, CompanyWorker>();
  let stopped = false;

  const startForCompany = (target: GatewayConnectorTarget) => {
    const stopSignal = { stopped: false };
    for (let i = 0; i < workerCount; i += 1) void pollLoop(target, i, stopSignal);

    const heartbeatHandle = setInterval(() => {
      sendHeartbeatToGateway(target).catch((err) =>
        appendEcfGatewayLog(`rnc=${target.companyRnc} heartbeat fallo: ${err instanceof Error ? err.message : err}`),
      );
    }, HEARTBEAT_INTERVAL_MS);

    running.set(target.companyId, { stopSignal, heartbeatHandle, configKey: configKeyOf(target) });
    console.log(`[ecf-gateway] connector activo para RNC ${target.companyRnc} (${workerCount} workers de polling).`);
  };

  const stopForCompany = (companyId: number) => {
    const worker = running.get(companyId);
    if (!worker) return;
    worker.stopSignal.stopped = true;
    clearInterval(worker.heartbeatHandle);
    running.delete(companyId);
  };

  const rescan = async () => {
    let targets: GatewayConnectorTarget[];
    try {
      targets = await listGatewayConnectorTargets();
    } catch (err) {
      appendEcfGatewayLog(`rescan de connectors fallo: ${err instanceof Error ? err.message : err}`);
      return;
    }

    const seen = new Set<number>();
    for (const target of targets) {
      seen.add(target.companyId);
      const existing = running.get(target.companyId);
      if (!existing) {
        startForCompany(target);
      } else if (existing.configKey !== configKeyOf(target)) {
        stopForCompany(target.companyId);
        startForCompany(target);
      }
    }
    for (const companyId of [...running.keys()]) {
      if (!seen.has(companyId)) stopForCompany(companyId);
    }
  };

  void rescan();
  const rescanHandle = setInterval(() => {
    if (!stopped) void rescan();
  }, RESCAN_INTERVAL_MS);

  return () => {
    stopped = true;
    clearInterval(rescanHandle);
    for (const companyId of [...running.keys()]) stopForCompany(companyId);
  };
}
