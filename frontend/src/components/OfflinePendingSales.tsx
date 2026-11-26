import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { OfflineCotizacion } from "../offline/db";
import {
  listOfflineCotizaciones,
  removeOfflineCotizacion,
} from "../offline/offlineQueue";
import {
  notifyOfflineSync,
  subscribeOfflineSync,
  runOfflineSync,
} from "../offline/syncEngine";
import { formatMoney } from "../utils/money";
import { offlineStatusClass as statusClass, offlineStatusLabel as statusLabel } from "../offline/offlineStatus";

/**
 * Las ventas creadas sin conexión quedan en IndexedDB, invisibles para cualquier vista que
 * solo liste datos del servidor (Clientes, Facturas). Sin esto, el usuario crea una
 * cotización offline y no la vuelve a ver hasta que sincroniza -- no tiene forma de
 * confirmar que de verdad se guardó.
 */
export default function OfflinePendingSales({ companyId }: { companyId?: number }) {
  const [entries, setEntries] = useState<OfflineCotizacion[]>([]);

  useEffect(() => {
    if (!companyId) return;
    const refresh = () => void listOfflineCotizaciones(companyId).then(setEntries);
    refresh();
    return subscribeOfflineSync(refresh);
  }, [companyId]);

  const handleDelete = async (localId: string) => {
    if (!window.confirm("¿Eliminar esta venta offline? Esta acción no se puede deshacer.")) return;
    await removeOfflineCotizacion(localId);
    await notifyOfflineSync();
  };

  if (entries.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-amber-900">
          {entries.length} venta{entries.length === 1 ? "" : "s"} guardada
          {entries.length === 1 ? "" : "s"} sin conexión
        </p>
        <button
          type="button"
          onClick={() => void runOfflineSync()}
          className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
        >
          Sincronizar ahora
        </button>
      </div>
      <ul className="mt-2 space-y-1.5">
        {entries.map((e) => (
          <li
            key={e.localId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/80 px-3 py-1.5"
          >
            <span className="min-w-0 truncate text-slate-800">
              {e.payload.client.name} —{" "}
              <span className="font-mono">RD$ {formatMoney(e.payload.cotizacion.total ?? 0)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass[e.status]}`}
              >
                {statusLabel[e.status]}
              </span>
              {e.status === "error_permanente" && (
                <Link
                  to={`/cotizaciones/offline/${e.localId}/editar`}
                  className="text-[11px] font-medium text-[#0b57d0] hover:underline"
                >
                  Editar
                </Link>
              )}
              <Link
                to={`/cotizaciones/offline/${e.localId}/imprimir`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-medium text-[#0b57d0] hover:underline"
              >
                Ver borrador
              </Link>
              <button
                type="button"
                onClick={() => void handleDelete(e.localId)}
                className="text-[11px] font-medium text-red-600 hover:underline"
              >
                Eliminar
              </button>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-amber-800">
        Se envían a DGII (con NCF real) automáticamente al volver la conexión.
      </p>
    </div>
  );
}
