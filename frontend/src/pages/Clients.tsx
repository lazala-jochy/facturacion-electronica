import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listClients, type ClientListItem } from "../services/clients";
import {
  downloadCotizacionPDF,
  getCotizacion,
  submitEcf,
  type CotizacionDetail,
} from "../services/cotizaciones";

// Helper para formatear moneda
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
  }).format(value);
};

export default function Clients() {
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [sendingEcfId, setSendingEcfId] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string>("");
  const [ecfError, setEcfError] = useState<string>("");
  const [ecfSuccess, setEcfSuccess] = useState<string>("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "rnc" | "number" | "total" | "status">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detail, setDetail] = useState<CotizacionDetail | null>(null);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const { clients } = await listClients();
        setClients(clients);
      } catch (error) {
        console.error("Error al cargar clientes", error);
      } finally {
        setLoading(false);
      }
    };

    fetchClients();
  }, []);

  const handleDownload = async (cotizacionId: number, clientName: string) => {
    setDownloadingId(cotizacionId);
    setDownloadError("");
    try {
      await downloadCotizacionPDF(cotizacionId, `cotizacion-${clientName}.pdf`);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Error al descargar el PDF";
      setDownloadError(errorMsg);
      console.error("Error al descargar PDF:", error);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSendEcf = async (cotizacionId: number) => {
    setSendingEcfId(cotizacionId);
    setEcfError("");
    setEcfSuccess("");
    try {
      const out = await submitEcf(cotizacionId);
      setEcfSuccess(`e-CF enviado (Track ID: ${out.track_id}).`);
      setClients((prev) =>
        prev.map((client) => ({
          ...client,
          cotizaciones: client.cotizaciones.map((row) =>
            row.id === cotizacionId
              ? {
                  ...row,
                  dgii_status: out.status,
                  dgii_track_id: out.track_id,
                  dgii_submitted_at: new Date().toISOString(),
                }
              : row,
          ),
        })),
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Error al enviar e-CF";
      setEcfError(errorMsg);
      console.error("Error al enviar e-CF:", error);
    } finally {
      setSendingEcfId(null);
    }
  };

  const handleOpenDetail = async (cotizacionId: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);
    try {
      const out = await getCotizacion(cotizacionId);
      setDetail(out.cotizacion);
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "No se pudo cargar el detalle.",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const withLast = clients
      .map((client) => {
        const last = client.cotizaciones?.[0];
        return { client, last };
      })
      .filter(({ client, last }) => {
        if (!normalizedQuery) return true;
        const raw = [
          client.name,
          client.rnc_cedula,
          client.phone ?? "",
          client.email ?? "",
          last ? String(last.number) : "",
          last ? String(last.total) : "",
          last?.dgii_status ?? "",
          last?.dgii_track_id ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return raw.includes(normalizedQuery);
      });

    const sorted = [...withLast].sort((a, b) => {
      const aStatus = a.last?.dgii_status ?? "";
      const bStatus = b.last?.dgii_status ?? "";
      const aNumber = a.last?.number ?? -1;
      const bNumber = b.last?.number ?? -1;
      const aTotal = a.last?.total ?? -1;
      const bTotal = b.last?.total ?? -1;

      let compare = 0;
      if (sortBy === "name") compare = a.client.name.localeCompare(b.client.name);
      if (sortBy === "rnc") compare = a.client.rnc_cedula.localeCompare(b.client.rnc_cedula);
      if (sortBy === "number") compare = aNumber - bNumber;
      if (sortBy === "total") compare = aTotal - bTotal;
      if (sortBy === "status") compare = aStatus.localeCompare(bStatus);
      return sortDir === "asc" ? compare : -compare;
    });
    return sorted;
  }, [clients, query, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [query, sortBy, sortDir, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="w-full px-4 sm:px-6 md:px-8 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Clientes
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestiona tus clientes y sus cotizaciones
          </p>
        </div>

        <Link
          to="/cotizaciones/nueva"
          className="rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 sm:px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:from-indigo-700 hover:to-indigo-600 transition whitespace-nowrap"
        >
          + Nueva cotización
        </Link>
      </div>

      {/* Tabla Desktop / Cards Mobile */}
      <div className="rounded-3xl border border-gray-200 bg-white shadow-lg overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50/70 p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, RNC, correo, estado..."
              className="md:col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "name" | "rnc" | "number" | "total" | "status")}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="name">Ordenar por Nombre</option>
              <option value="rnc">Ordenar por RNC/Cedula</option>
              <option value="number">Ordenar por No. Cotizacion</option>
              <option value="total">Ordenar por Total</option>
              <option value="status">Ordenar por Estado e-CF</option>
            </select>
            <div className="flex gap-2">
              <select
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
                className="w-1/2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="w-1/2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>
        {loading ? (
          <div className="p-6 sm:p-8 text-gray-500 text-center">
            Cargando clientes...
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 sm:p-8 text-gray-500 text-center">
            No hay resultados para ese filtro.
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="px-4 sm:px-6 py-4 text-left">Nombre</th>
                    <th className="px-4 sm:px-6 py-4 text-left">RNC / Cédula</th>
                    <th className="hidden lg:table-cell px-4 sm:px-6 py-4 text-left">Teléfono</th>
                    <th className="hidden xl:table-cell px-4 sm:px-6 py-4 text-left">Correo</th>
                    <th className="px-4 sm:px-6 py-4 text-left">N° Cotización</th>
                    <th className="px-4 sm:px-6 py-4 text-left">Total</th>
                    <th className="px-4 sm:px-6 py-4 text-center">Detalle</th>
                    <th className="px-4 sm:px-6 py-4 text-center">e-CF</th>
                    <th className="px-4 sm:px-6 py-4 text-center">PDF</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {pageRows.map(({ client, last }) => {
                    const alreadySent =
                      last?.dgii_status === "accepted" || last?.dgii_status === "rejected";

                    return (
                      <tr key={client.id} className="hover:bg-indigo-50/40 transition">
                        <td className="px-4 sm:px-6 py-4 font-semibold text-gray-900 text-sm">
                          {client.name}
                        </td>

                        <td className="px-4 sm:px-6 py-4 text-gray-600 text-sm">
                          {client.rnc_cedula}
                        </td>

                        <td className="hidden lg:table-cell px-4 sm:px-6 py-4 text-gray-600 text-sm">
                          {client.phone || "-"}
                        </td>

                        <td className="hidden xl:table-cell px-4 sm:px-6 py-4 text-gray-600 text-sm">
                          {client.email || "-"}
                        </td>

                        <td className="px-4 sm:px-6 py-4 text-indigo-600 font-medium text-sm">
                          {last ? `#${last.number}` : "-"}
                        </td>

                        <td className="px-4 sm:px-6 py-4 text-gray-700 font-medium text-sm">
                          {last ? formatCurrency(last.total) : "-"}
                        </td>
                        <td className="px-4 sm:px-6 py-4 text-center">
                          {last ? (
                            <button
                              onClick={() => handleOpenDetail(last.id)}
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
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>

                        <td className="px-4 sm:px-6 py-4 text-center">
                          {last ? (
                            <button
                              onClick={() => handleSendEcf(last.id)}
                              disabled={sendingEcfId === last.id || alreadySent}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                                alreadySent
                                  ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                                  : "border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                              }`}
                              title={alreadySent ? "e-CF ya enviado" : "Enviar e-CF"}
                            >
                              {sendingEcfId === last.id
                                ? "Enviando..."
                                : alreadySent
                                  ? "Enviado"
                                  : "Enviar DGII"}
                            </button>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>

                        <td className="px-4 sm:px-6 py-4 text-center">
                          {last ? (
                            <button
                              onClick={() => handleDownload(last.id, client.name)}
                              disabled={downloadingId === last.id}
                              className="p-2 rounded-lg hover:bg-indigo-100 transition inline-block disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Descargar PDF"
                            >
                              {downloadingId === last.id ? (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 animate-spin"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <circle
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    fill="none"
                                    opacity="0.25"
                                  />
                                  <path
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M12 3v12m0 0l4-4m-4 4l-4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                                  />
                                </svg>
                              )}
                            </button>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {pageRows.map(({ client, last }) => {
                const alreadySent =
                  last?.dgii_status === "accepted" || last?.dgii_status === "rejected";

                return (
                  <div key={client.id} className="p-4 hover:bg-indigo-50/40 transition">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate text-sm sm:text-base">
                          {client.name}
                        </h3>
                        <p className="text-sm text-gray-500">RNC: {client.rnc_cedula}</p>
                      </div>
                      {last ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenDetail(last.id)}
                            className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
                            title="Ver detalle de cotización"
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
                          <button
                            onClick={() => handleSendEcf(last.id)}
                            disabled={sendingEcfId === last.id || alreadySent}
                            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                              alreadySent
                                ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                                : "border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                            }`}
                            title={alreadySent ? "e-CF ya enviado" : "Enviar e-CF"}
                          >
                            {sendingEcfId === last.id
                              ? "..."
                              : alreadySent
                                ? "Enviado"
                                : "Enviar DGII"}
                          </button>
                          <button
                            onClick={() => handleDownload(last.id, client.name)}
                            disabled={downloadingId === last.id}
                            className="p-2 rounded-lg hover:bg-indigo-100 transition flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Descargar PDF"
                          >
                            {downloadingId === last.id ? (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-4 h-4 text-indigo-600 animate-spin"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <circle
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  fill="none"
                                  opacity="0.25"
                                />
                                <path
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                            ) : (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-4 h-4 text-indigo-600"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M12 3v12m0 0l4-4m-4 4l-4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500 text-xs">Teléfono</p>
                        <p className="text-gray-900 font-medium">{client.phone || "-"}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Correo</p>
                        <p className="text-gray-900 font-medium truncate">{client.email || "-"}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">N° Cotización</p>
                        <p className="text-indigo-600 font-medium">{last ? `#${last.number}` : "-"}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Total</p>
                        <p className="text-gray-900 font-medium">{last ? formatCurrency(last.total) : "-"}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-gray-600">
              <span>
                Mostrando {pageRows.length} de {rows.length} registros
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded border border-gray-300 px-2.5 py-1 disabled:opacity-50"
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
                  className="rounded border border-gray-300 px-2.5 py-1 disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {downloadError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
          <p className="font-semibold">Error al descargar</p>
          <p className="mt-1">{downloadError}</p>
        </div>
      )}
      {ecfError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
          <p className="font-semibold">Error en e-CF</p>
          <p className="mt-1">{ecfError}</p>
        </div>
      )}
      {ecfSuccess && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 text-sm">
          <p className="font-semibold">Flujo e-CF listo</p>
          <p className="mt-1">{ecfSuccess}</p>
        </div>
      )}
      {detailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="mx-auto w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                Detalle de cotización
              </h3>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
              >
                Cerrar
              </button>
            </div>
            {detailLoading && (
              <p className="text-sm text-slate-500">Cargando detalle...</p>
            )}
            {detailError && <p className="text-sm text-red-600">{detailError}</p>}
            {!detailLoading && !detailError && detail && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <p>
                    <span className="font-semibold">Cotización:</span> #{detail.number}
                  </p>
                  <p>
                    <span className="font-semibold">Estado DGII:</span>{" "}
                    {detail.dgii_status ?? "Pendiente"}
                  </p>
                  <p>
                    <span className="font-semibold">Cliente:</span> {detail.client.name}
                  </p>
                  <p>
                    <span className="font-semibold">RNC/Cédula:</span>{" "}
                    {detail.client.rnc_cedula}
                  </p>
                  <p>
                    <span className="font-semibold">Forma de pago:</span>{" "}
                    {detail.payment_method ?? "-"}
                  </p>
                  <p>
                    <span className="font-semibold">Condiciones:</span>{" "}
                    {detail.payment_terms ?? "-"}
                  </p>
                  <p>
                    <span className="font-semibold">Ejecutivo:</span>{" "}
                    {detail.account_manager ?? "-"}
                  </p>
                  <p>
                    <span className="font-semibold">Track ID:</span>{" "}
                    {detail.dgii_track_id ?? "-"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-800">
                    Comentario
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {detail.comment?.trim() || "-"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-semibold text-slate-800">Items</p>
                  {detail.items && detail.items.length > 0 ? (
                    <div className="max-h-56 overflow-auto">
                      <table className="w-full text-xs sm:text-sm">
                        <thead className="text-slate-500">
                          <tr>
                            <th className="text-left py-1">#</th>
                            <th className="text-left py-1">Descripción</th>
                            <th className="text-right py-1">Cant.</th>
                            <th className="text-right py-1">P. unitario</th>
                            <th className="text-right py-1">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.items.map((item) => (
                            <tr key={item.item_number} className="border-t border-slate-100">
                              <td className="py-1">{item.item_number}</td>
                              <td className="py-1">{item.description}</td>
                              <td className="py-1 text-right">{item.quantity}</td>
                              <td className="py-1 text-right">
                                {formatCurrency(item.unit_price)}
                              </td>
                              <td className="py-1 text-right">
                                {formatCurrency(item.total_value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600">Sin items registrados.</p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <p className="rounded bg-slate-50 p-2">
                    <span className="font-semibold">Subtotal:</span>{" "}
                    {formatCurrency(detail.subtotal ?? 0)}
                  </p>
                  <p className="rounded bg-slate-50 p-2">
                    <span className="font-semibold">ITBIS:</span>{" "}
                    {formatCurrency(detail.itbis ?? 0)}
                  </p>
                  <p className="rounded bg-slate-50 p-2">
                    <span className="font-semibold">Total:</span>{" "}
                    {formatCurrency(detail.total)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}