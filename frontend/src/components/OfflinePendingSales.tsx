import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { OfflineCotizacion } from "../offline/db";
import { listOfflineCotizaciones } from "../offline/offlineQueue";
import { subscribeOfflineSync, runOfflineSync } from "../offline/syncEngine";

const statusLabel: Record<OfflineCotizacion["status"], string> = {
  pendiente: "Pendiente de sincronizar",
  sincronizando: "Sincronizando…",
  error: "Reintentando…",
  error_permanente: "No se pudo sincronizar",
};

const statusClass: Record<OfflineCotizacion["status"], string> = {
  pendiente: "bg-amber-100 text-amber-800 border-amber-200",
  sincronizando: "bg-blue-100 text-blue-800 border-blue-200",
  error: "bg-amber-100 text-amber-800 border-amber-200",
  error_permanente: "bg-red-100 text-red-800 border-red-200",
};

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
              <span className="font-mono">RD$ {(e.payload.cotizacion.total ?? 0).toFixed(2)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass[e.status]}`}
              >
                {statusLabel[e.status]}
              </span>
              <Link
                to={`/cotizaciones/offline/${e.localId}/imprimir`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-medium text-[#0b57d0] hover:underline"
              >
                Ver borrador
              </Link>
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
