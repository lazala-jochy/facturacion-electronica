import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listClients, type ClientListItem } from "../services/clients";

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

  const handleDownload = (id: number) => {
    console.log("Descargar PDF:", id);
    // window.open(`/api/cotizaciones/${id}/pdf`);
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Clientes
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestiona tus clientes y sus cotizaciones
          </p>
        </div>

        <Link
          to="/cotizaciones/nueva"
          className="rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:from-indigo-700 hover:to-indigo-600 transition"
        >
          + Nueva cotización
        </Link>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-lg">
        {loading ? (
          <div className="p-8 text-gray-500 text-center">
            Cargando clientes...
          </div>
        ) : clients.length === 0 ? (
          <div className="p-8 text-gray-500 text-center">
            No hay clientes registrados.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-6 py-4 text-left">Nombre</th>
                <th className="px-6 py-4 text-left">RNC / Cédula</th>
                <th className="px-6 py-4 text-left">Teléfono</th>
                <th className="px-6 py-4 text-left">Correo</th>
                <th className="px-6 py-4 text-left">N° Cotización</th>
                <th className="px-6 py-4 text-left">Total</th>
                <th className="px-6 py-4 text-center">PDF</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {clients.map((client) => {
                const last = client.cotizaciones?.[0];

                return (
                  <tr key={client.id} className="hover:bg-indigo-50/40 transition">
                    <td className="px-6 py-4 font-semibold text-gray-900">
                      {client.name}
                    </td>

                    <td className="px-6 py-4 text-gray-600">
                      {client.rnc_cedula}
                    </td>

                    <td className="px-6 py-4 text-gray-600">
                      {client.phone || "-"}
                    </td>

                    <td className="px-6 py-4 text-gray-600">
                      {client.email || "-"}
                    </td>

                    <td className="px-6 py-4 text-indigo-600 font-medium">
                      {last ? `#${last.number}` : "-"}
                    </td>

                    <td className="px-6 py-4 text-gray-700 font-medium">
                      {last ? formatCurrency(last.total) : "-"}
                    </td>

                    <td className="px-6 py-4 text-center">
                      {last ? (
                        <button
                          onClick={() => handleDownload(last.id)}
                          className="p-2 rounded-lg hover:bg-indigo-100 transition"
                        >
                          {/* SVG icon */}
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-5 h-5 text-indigo-600"
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
        )}
      </div>
    </div>
  );
}