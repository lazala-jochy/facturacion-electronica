import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createClient, listClients, type ClientListItem } from "../services/clients";

export default function Clients() {
  const [name, setName] = useState("");
  const [rncCedula, setRncCedula] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ClientListItem[]>([]);

  const refresh = useCallback(async () => {
    try {
      const { clients } = await listClients();
      setRows(clients);
    } catch {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!name.trim() || !rncCedula.trim()) {
      setError("Nombre y RNC o cedula son obligatorios.");
      return;
    }

    setLoading(true);
    try {
      const res = await createClient({
        name: name.trim(),
        rnc_cedula: rncCedula.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
      });
      setSuccess(res.message);
      setName("");
      setRncCedula("");
      setPhone("");
      setEmail("");
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo crear el cliente.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Clientes</h1>
          <p className="mt-1 text-slate-600">
            Cliente solo, o cotización completa con ITBIS 18% (formato RD).
          </p>
        </div>
        <Link
          to="/cotizaciones/nueva"
          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Nueva cotización
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Nuevo cliente (solo)</h2>
        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label
              htmlFor="client-name"
              className="block text-sm font-medium text-slate-700"
            >
              Nombre
            </label>
            <input
              id="client-name"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label
              htmlFor="client-rnc"
              className="block text-sm font-medium text-slate-700"
            >
              RNC o cedula
            </label>
            <input
              id="client-rnc"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={rncCedula}
              onChange={(e) => setRncCedula(e.target.value)}
              required
            />
          </div>
          <div>
            <label
              htmlFor="client-phone"
              className="block text-sm font-medium text-slate-700"
            >
              Telefono (opcional)
            </label>
            <input
              id="client-phone"
              type="tel"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="client-email"
              className="block text-sm font-medium text-slate-700"
            >
              Correo (opcional)
            </label>
            <input
              id="client-email"
              type="email"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {error && (
            <p className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {success && (
            <p className="sm:col-span-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              {success}
            </p>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "Guardando..." : "Crear cliente"}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Clientes recientes</h2>
        {rows.length === 0 ? (
          <p className="mt-4 text-slate-500">Aun no hay clientes.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {rows.map((c) => (
              <li key={c.id} className="py-3">
                <span className="font-medium text-slate-900">{c.name}</span>
                <span className="ml-2 text-slate-500">{c.rnc_cedula}</span>
                {c.cotizaciones[0] && (
                  <span className="ml-2 text-xs text-indigo-600">
                    Cotiz. Nº {c.cotizaciones[0].number} · RD${" "}
                    {c.cotizaciones[0].total.toFixed(2)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
