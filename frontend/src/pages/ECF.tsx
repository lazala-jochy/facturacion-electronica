import { useEffect, useMemo, useState } from "react";
import type { AuthCompany } from "../types/session";
import { listCotizaciones, type CotizacionListItem } from "../services/cotizaciones";

export default function ECF({ company }: { company: AuthCompany }) {
  const [rows, setRows] = useState<CotizacionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError("");
        const out = await listCotizaciones();
        setRows(out.cotizaciones);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar e-CF.");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const ecfRows = useMemo(
    () =>
      rows.filter((r) =>
        ["prepared", "accepted", "rejected"].includes((r.dgii_status ?? "").toLowerCase()),
      ),
    [rows],
  );

  const statusLabel = (status?: string | null) => {
    if (!status) return "Pendiente";
    if (status === "prepared") return "Preparado";
    if (status === "accepted") return "Aceptado";
    if (status === "rejected") return "Rechazado";
    return status;
  };

  const statusClass = (status?: string | null) => {
    if (status === "accepted") return "bg-emerald-100 text-emerald-700";
    if (status === "rejected") return "bg-red-100 text-red-700";
    if (status === "prepared") return "bg-amber-100 text-amber-700";
    return "bg-slate-100 text-slate-700";
  };

  return (
    <div className="w-full space-y-4 sm:space-y-6 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-semibold truncate">e-CF</h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 truncate">
            Empresa: {company.name} · RNC {company.rnc}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-center text-xs sm:text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 sm:p-3">Cliente</th>
                <th className="p-2 sm:p-3">RNC</th>
                <th className="p-2 sm:p-3">Total</th>
                <th className="p-2 sm:p-3">Estado</th>
                <th className="p-2 sm:p-3">Track ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ecfRows.map((row) => (
                <tr key={row.id}>
                  <td className="p-2 sm:p-3 text-left">{row.client_name}</td>
                  <td className="p-2 sm:p-3">{row.client_rnc_cedula ?? "-"}</td>
                  <td className="p-2 sm:p-3">
                    {new Intl.NumberFormat("es-DO", {
                      style: "currency",
                      currency: "DOP",
                    }).format(row.total)}
                  </td>
                  <td className="p-2 sm:p-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(row.dgii_status)}`}>
                      {statusLabel(row.dgii_status)}
                    </span>
                  </td>
                  <td className="p-2 sm:p-3 text-[11px] sm:text-xs text-slate-600">
                    {row.dgii_track_id ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && (
          <div className="p-6 sm:p-8 text-center text-gray-500 text-sm">
            Cargando flujo e-CF...
          </div>
        )}
        {!loading && error && (
          <div className="p-6 sm:p-8 text-center text-red-600 text-sm">{error}</div>
        )}
        {!loading && !error && ecfRows.length === 0 && (
          <div className="p-6 sm:p-8 text-center text-gray-500 text-sm">
            No hay e-CF preparados o enviados todavia.
          </div>
        )}
      </div>
    </div>
  );
}
