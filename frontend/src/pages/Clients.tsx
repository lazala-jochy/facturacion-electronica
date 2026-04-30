import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listClients, type ClientListItem } from "../services/clients";

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

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
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

      {/* Card */}
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
            {/* Header */}
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-6 py-4 text-left">Cliente</th>
                <th className="px-6 py-4 text-left">RNC / Cédula</th>
                <th className="px-6 py-4 text-left">Contacto</th>
                <th className="px-6 py-4 text-left">Última cotización</th>
              </tr>
            </thead>

            {/* Body */}
            <tbody className="divide-y divide-gray-100">
              {clients.map((client) => {
                const last = client.cotizaciones?.[0];

                return (
                  <tr
                    key={client.id}
                    className="group hover:bg-indigo-50/40 transition cursor-pointer"
                  >
                    {/* Cliente */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900 group-hover:text-indigo-600 transition">
                          {client.name}
                        </span>
                      </div>
                    </td>

                    {/* RNC */}
                    <td className="px-6 py-4 text-gray-600">
                      {client.rnc_cedula}
                    </td>

                    {/* Contacto */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col text-gray-600 text-sm">
                        <span>{client.phone || "-"}</span>
                        <span className="text-xs text-gray-400">
                          {client.email || "Sin correo"}
                        </span>
                      </div>
                    </td>

                    {/* Cotización */}
                    <td className="px-6 py-4">
                      {last ? (
                        <div className="flex flex-col">
                          <span className="text-indigo-600 font-semibold">
                            #{last.number}
                          </span>
                          <span className="text-xs text-gray-500">
                            RD$ {last.total.toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">
                          Sin cotización
                        </span>
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