import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AUTH_STORAGE_KEY, type AuthSession } from "../types/session";
import {
  createClientWithCotizacion,
  type CotizacionItemDraft,
} from "../services/cotizaciones";
import {
  calculateTotalsFromItems,
  itemLineTotalValue,
} from "../utils/tax";

type ItemRow = CotizacionItemDraft & { key: string };

const newRow = (): ItemRow => ({
  key: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
  quantity: 1,
  unit: "Servicio",
  description: "",
  unit_price: 0,
});

export default function CotizacionCreate() {
  const session = useMemo<AuthSession | null>(() => {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as AuthSession;
      return s?.token && s?.company ? s : null;
    } catch {
      return null;
    }
  }, []);

  const company = session?.company;

  const [clientName, setClientName] = useState("");
  const [clientRnc, setClientRnc] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("50% avance");
  const [accountManager, setAccountManager] = useState("");
  const [items, setItems] = useState<ItemRow[]>(() => [newRow(), newRow()]);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{
    cotizacionNumber: number;
    dgii: Record<string, unknown>;
  } | null>(null);

  const lineTotals = items.map((it) =>
    itemLineTotalValue(it.quantity, it.unit_price),
  );
  const totals = calculateTotalsFromItems(
    lineTotals.map((totalValue) => ({ totalValue })),
  );

  const today = new Date().toLocaleDateString("es-DO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const updateItem = (key: string, patch: Partial<CotizacionItemDraft>) => {
    setItems((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  };

  const addItem = () => setItems((prev) => [...prev, newRow()]);
  const removeItem = (key: string) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setDone(null);
    if (!clientName.trim() || !clientRnc.trim()) {
      setError("Nombre y RNC o cedula del cliente son obligatorios.");
      return;
    }
    if (!paymentTerms.trim() || !accountManager.trim()) {
      setError("Condiciones de pago y ejecutivo de cuentas son obligatorios.");
      return;
    }

    const payloadItems: CotizacionItemDraft[] = items.map((it) => ({
      quantity: Number(it.quantity) || 0,
      unit: it.unit.trim() || "Unidad",
      description: it.description.trim() || "Concepto",
      unit_price: Number(it.unit_price) || 0,
    }));

    setLoading(true);
    try {
      const res = await createClientWithCotizacion({
        client: {
          name: clientName.trim(),
          rnc_cedula: clientRnc.trim(),
          phone: clientPhone.trim() || undefined,
          email: clientEmail.trim() || undefined,
        },
        cotizacion: {
          payment_terms: paymentTerms.trim(),
          account_manager: accountManager.trim(),
        },
        items: payloadItems,
      });
      const cot = res.cotizacion as { number?: number };
      setDone({
        cotizacionNumber: Number(cot.number),
        dgii: res.dgii_preview as Record<string, unknown>,
      });
      setClientName("");
      setClientRnc("");
      setClientPhone("");
      setClientEmail("");
      setItems([newRow(), newRow()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setLoading(false);
    }
  };

  if (!company) {
    return (
      <p className="text-slate-600">
        No hay sesion.{" "}
        <Link className="text-indigo-600 underline" to="/">
          Volver
        </Link>
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">
          Nueva cotización
        </h1>
        <Link
          to="/clients"
          className="text-sm font-medium text-indigo-600 hover:underline"
        >
          Ver clientes
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm"
      >
        {/* Emisor + encabezado estilo hoja */}
        <div className="grid gap-0 border-b border-slate-300 md:grid-cols-[1.2fr_0.8fr]">
          <div className="border-b border-slate-200 p-5 md:border-b-0 md:border-r">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Emisor
            </p>
            <p className="mt-1 text-lg font-bold text-slate-900">{company.name}</p>
            <dl className="mt-3 space-y-1 text-sm text-slate-700">
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-slate-500">RNC</dt>
                <dd className="font-mono">{company.rnc}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-slate-500">Dirección</dt>
                <dd>{company.address || "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-slate-500">Tel.</dt>
                <dd>{company.phone?.trim() || "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-slate-500">Email</dt>
                <dd>{company.email?.trim() || "—"}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Actualiza teléfono y correo de la empresa en registro o futuro
              perfil de empresa.
            </p>
          </div>
          <div className="flex flex-col justify-between bg-slate-50 p-5">
            <div>
              <p className="text-right text-xs font-semibold uppercase text-slate-500">
                Cotización
              </p>
              <p className="text-right text-3xl font-bold tracking-tight text-slate-900">
                COTIZACIÓN
              </p>
              <p className="mt-1 text-right text-sm text-slate-600">
                Fecha: <span className="font-medium">{today}</span>
              </p>
              <p className="mt-1 text-right text-sm text-slate-600">
                Nº:{" "}
                <span className="font-mono font-medium">
                  {done ? String(done.cotizacionNumber) : "— (al guardar)"}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Cliente + condiciones */}
        <div className="grid gap-4 border-b border-slate-200 p-5 md:grid-cols-2">
          <div className="rounded border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Cliente
            </p>
            <label className="mt-2 block text-xs font-medium text-slate-600">
              Nombre o razón social
            </label>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              required
            />
            <label className="mt-2 block text-xs font-medium text-slate-600">
              RNC o cédula
            </label>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-mono"
              value={clientRnc}
              onChange={(e) => setClientRnc(e.target.value)}
              required
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-slate-600">
                  Tel. (opc.)
                </label>
                <input
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">
                  Email (opc.)
                </label>
                <input
                  type="email"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="space-y-3 rounded border border-slate-200 p-4">
            <div>
              <label className="text-xs font-medium text-slate-600">
                Condiciones de pago
              </label>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">
                Ejecutivo de cuentas
              </label>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={accountManager}
                onChange={(e) => setAccountManager(e.target.value)}
                placeholder="Nombre del ejecutivo"
                required
              />
            </div>
          </div>
        </div>

        {/* Tabla ítems */}
        <div className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">Detalle</p>
            <button
              type="button"
              onClick={addItem}
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              + Agregar línea
            </button>
          </div>
          <div className="overflow-x-auto border border-slate-300">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-200 text-left text-xs font-semibold uppercase text-slate-700">
                  <th className="border border-slate-300 px-2 py-2 w-10">#</th>
                  <th className="border border-slate-300 px-2 py-2">Cant.</th>
                  <th className="border border-slate-300 px-2 py-2">Unidad</th>
                  <th className="border border-slate-300 px-2 py-2">Descripción</th>
                  <th className="border border-slate-300 px-2 py-2 text-right">
                    P. unitario
                  </th>
                  <th className="border border-slate-300 px-2 py-2 text-right">
                    Valor
                  </th>
                  <th className="border border-slate-300 px-2 py-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {items.map((row, idx) => (
                  <tr key={row.key} className="bg-white">
                    <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="border border-slate-200 p-1">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="w-full min-w-[4rem] rounded border border-slate-200 px-1 py-1"
                        value={row.quantity}
                        onChange={(e) =>
                          updateItem(row.key, {
                            quantity: Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td className="border border-slate-200 p-1">
                      <input
                        className="w-full min-w-[5rem] rounded border border-slate-200 px-1 py-1"
                        value={row.unit}
                        onChange={(e) =>
                          updateItem(row.key, { unit: e.target.value })
                        }
                      />
                    </td>
                    <td className="border border-slate-200 p-1">
                      <input
                        className="w-full rounded border border-slate-200 px-1 py-1"
                        value={row.description}
                        onChange={(e) =>
                          updateItem(row.key, { description: e.target.value })
                        }
                      />
                    </td>
                    <td className="border border-slate-200 p-1">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-full min-w-[5rem] rounded border border-slate-200 px-1 py-1 text-right"
                        value={row.unit_price}
                        onChange={(e) =>
                          updateItem(row.key, {
                            unit_price: Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td className="border border-slate-200 px-2 py-1.5 text-right font-mono text-slate-800">
                      {itemLineTotalValue(
                        row.quantity,
                        row.unit_price,
                      ).toFixed(2)}
                    </td>
                    <td className="border border-slate-200 p-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeItem(row.key)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totales */}
          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-xs space-y-1 rounded border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Subtotal</span>
                <span className="font-mono font-medium">
                  RD$ {totals.subtotal.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">ITBIS (18%)</span>
                <span className="font-mono font-medium">
                  RD$ {totals.itbis.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-300 pt-2 text-base font-semibold text-slate-900">
                <span>Total</span>
                <span className="font-mono">RD$ {totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {done && (
            <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-semibold">Cotización guardada (Nº {done.cotizacionNumber})</p>
              <p className="mt-1 text-xs text-emerald-800">
                Vista previa estructura DGII (sin envío aún):
              </p>
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-white p-2 text-xs text-slate-800">
                {JSON.stringify(done.dgii, null, 2)}
              </pre>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <Link
              to="/clients"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Guardando…" : "Guardar cotización"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
