import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listClients, type ClientListItem } from "../services/clients";
import { downloadCotizacionPDF } from "../services/cotizaciones";

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
  const [downloadError, setDownloadError] = useState<string>("");

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
        {loading ? (
          <div className="p-6 sm:p-8 text-gray-500 text-center">
            Cargando clientes...
          </div>
        ) : clients.length === 0 ? (
          <div className="p-6 sm:p-8 text-gray-500 text-center">
            No hay clientes registrados.
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
                    <th className="px-4 sm:px-6 py-4 text-center">PDF</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {clients.map((client) => {
                    const last = client.cotizaciones?.[0];

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
              {clients.map((client) => {
                const last = client.cotizaciones?.[0];

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
          </>
        )}
      </div>

      {downloadError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
          <p className="font-semibold">Error al descargar</p>
          <p className="mt-1">{downloadError}</p>
        </div>
      )}
    </div>
  );
}