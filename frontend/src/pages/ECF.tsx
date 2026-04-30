import { useEffect, useMemo, useState } from "react";
import type { AuthCompany } from "../types/session";
import {
  getCotizacion,
  listCotizaciones,
  type CotizacionDetail,
  type CotizacionListItem,
} from "../services/cotizaciones";

export default function ECF({ company }: { company: AuthCompany }) {
  const [rows, setRows] = useState<CotizacionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailCotizacion, setDetailCotizacion] = useState<CotizacionDetail | null>(null);
  const [detailPreview, setDetailPreview] = useState<Record<string, unknown> | null>(null);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"client" | "rnc" | "total" | "status">("client");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

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

  const ecfRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = rows
      .filter((r) =>
        ["prepared", "accepted", "rejected"].includes((r.dgii_status ?? "").toLowerCase()),
      )
      .filter((r) => {
        if (!normalizedQuery) return true;
        return [
          r.client_name,
          r.client_rnc_cedula ?? "",
          r.dgii_status ?? "",
          r.dgii_track_id ?? "",
          String(r.number),
          String(r.total),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      });

    return [...filtered].sort((a, b) => {
      let compare = 0;
      if (sortBy === "client") compare = a.client_name.localeCompare(b.client_name);
      if (sortBy === "rnc") compare = (a.client_rnc_cedula ?? "").localeCompare(b.client_rnc_cedula ?? "");
      if (sortBy === "total") compare = a.total - b.total;
      if (sortBy === "status") compare = (a.dgii_status ?? "").localeCompare(b.dgii_status ?? "");
      return sortDir === "asc" ? compare : -compare;
    });
  }, [rows, query, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(ecfRows.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return ecfRows.slice(start, start + pageSize);
  }, [ecfRows, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [query, sortBy, sortDir, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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

  const handleOpenDetail = async (id: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError("");
    setDetailCotizacion(null);
    setDetailPreview(null);
    try {
      const out = await getCotizacion(id);
      setDetailCotizacion(out.cotizacion);
      setDetailPreview(out.dgii_preview);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "No se pudo cargar el detalle.");
    } finally {
      setDetailLoading(false);
    }
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
        <div className="border-b border-slate-100 bg-slate-50/70 p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por cliente, RNC, estado, track ID..."
              className="md:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "client" | "rnc" | "total" | "status")}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="client">Ordenar por Cliente</option>
              <option value="rnc">Ordenar por RNC</option>
              <option value="total">Ordenar por Total</option>
              <option value="status">Ordenar por Estado</option>
            </select>
            <div className="flex gap-2">
              <select
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
                className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-center text-xs sm:text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 sm:p-3">Cliente</th>
                <th className="p-2 sm:p-3">RNC</th>
                <th className="p-2 sm:p-3">Total</th>
                <th className="p-2 sm:p-3">Estado</th>
                <th className="p-2 sm:p-3">Track ID</th>
                <th className="p-2 sm:p-3">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((row) => (
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
                  <td className="p-2 sm:p-3">
                    <button
                      type="button"
                      onClick={() => handleOpenDetail(row.id)}
                      className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
                      title="Ver detalle"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    </button>
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
            No hay resultados para ese filtro.
          </div>
        )}
        {!loading && !error && ecfRows.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
            <span>
              Mostrando {pageRows.length} de {ecfRows.length} registros
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded border border-slate-300 px-2.5 py-1 disabled:opacity-50"
              >
                Anterior
              </button>
              <span>
                Pagina {page} de {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded border border-slate-300 px-2.5 py-1 disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
      {detailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="mx-auto w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Detalle enviado a DGII</h3>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
              >
                Cerrar
              </button>
            </div>
            {detailLoading && <p className="text-sm text-slate-500">Cargando detalle...</p>}
            {detailError && <p className="text-sm text-red-600">{detailError}</p>}
            {!detailLoading && !detailError && detailCotizacion && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <p><span className="font-semibold">Cliente:</span> {detailCotizacion.client.name}</p>
                  <p><span className="font-semibold">RNC:</span> {detailCotizacion.client.rnc_cedula}</p>
                  <p><span className="font-semibold">Cotización:</span> #{detailCotizacion.number}</p>
                  <p><span className="font-semibold">Estado:</span> {statusLabel(detailCotizacion.dgii_status)}</p>
                  <p><span className="font-semibold">Track ID:</span> {detailCotizacion.dgii_track_id ?? "-"}</p>
                </div>

                <div>
                  <h4 className="mb-1 text-sm font-semibold text-slate-900">Payload e-CF</h4>
                  <pre className="max-h-44 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                    {JSON.stringify(detailPreview ?? {}, null, 2)}
                  </pre>
                </div>

                <div>
                  <h4 className="mb-1 text-sm font-semibold text-slate-900">Respuesta DGII</h4>
                  <pre className="max-h-36 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                    {detailCotizacion.dgii_response ?? "Sin respuesta registrada."}
                  </pre>
                </div>

                <div>
                  <h4 className="mb-1 text-sm font-semibold text-slate-900">XML firmado enviado</h4>
                  <pre className="max-h-52 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                    {detailCotizacion.signed_xml ?? "Sin XML firmado almacenado."}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
