import { useEffect, useState } from "react";
import { useOnlineStatus } from "../offline/connectivity";
import { subscribeOfflineSync, runOfflineSync } from "../offline/syncEngine";
import { readAuthSessionFromStorage } from "../services/api";
import { listOfflineCotizaciones, retryOfflineCotizacion } from "../offline/offlineQueue";
import type { OfflineCotizacion } from "../offline/db";

/** El resumen y la lista de ventas pendientes vive en OfflinePendingSales; esto solo cubre el
 * aviso de "sin conexión" y los errores permanentes (que necesitan una acción de reintentar). */
export default function OfflineBanner() {
  const online = useOnlineStatus();
  const [permanentErrors, setPermanentErrors] = useState<OfflineCotizacion[]>([]);

  const refreshErrorsList = async () => {
    const companyId = readAuthSessionFromStorage()?.company?.id;
    if (!companyId) return;
    const all = await listOfflineCotizaciones(companyId);
    setPermanentErrors(all.filter((e) => e.status === "error_permanente"));
  };

  useEffect(() => {
    void refreshErrorsList();
    return subscribeOfflineSync(() => void refreshErrorsList());
  }, []);

  const handleRetry = async (localId: string) => {
    await retryOfflineCotizacion(localId);
    void runOfflineSync();
  };

  if (online && permanentErrors.length === 0) return null;

  return (
    <div className="mb-3 space-y-2">
      {!online && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden />
          Sin conexión — podés seguir trabajando; se sincroniza sola al volver internet.
        </div>
      )}
      {permanentErrors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800 space-y-1.5">
          <p className="font-medium">
            {permanentErrors.length} venta{permanentErrors.length === 1 ? "" : "s"} offline no se
            pudo sincronizar (no es un problema de conexión):
          </p>
          <ul className="space-y-1">
            {permanentErrors.map((e) => (
              <li key={e.localId} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {e.payload.client.name} — {e.lastError ?? "Error desconocido."}
                </span>
                <button
                  type="button"
                  onClick={() => void handleRetry(e.localId)}
                  className="shrink-0 rounded border border-red-300 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100"
                >
                  Reintentar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
