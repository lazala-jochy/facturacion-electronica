import { useEffect, useMemo, useState, type FormEvent } from "react";
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
import { formatPhoneInput, isValidPhone } from "../utils/phone";

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
  const [clientAddress, setClientAddress] = useState("");
  const [clientRnc, setClientRnc] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("50% avance");
  const [paymentMethod, setPaymentMethod] = useState("Efectivo");
  const [accountManager, setAccountManager] = useState("");
  const [comment, setComment] = useState("");
  const [items, setItems] = useState<ItemRow[]>(() => [newRow(), newRow()]);
  const [calcMode, setCalcMode] = useState<"auto" | "manual">("auto");
  const [manualSubtotal, setManualSubtotal] = useState(0);
  const [manualItbis, setManualItbis] = useState(0);
  const [manualTotal, setManualTotal] = useState(0);

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
  const displayTotals =
    calcMode === "manual"
      ? {
          subtotal: Number.isFinite(manualSubtotal) ? Math.max(0, manualSubtotal) : 0,
          itbis: Number.isFinite(manualItbis) ? Math.max(0, manualItbis) : 0,
          total: Number.isFinite(manualTotal) ? Math.max(0, manualTotal) : 0,
        }
      : totals;

  useEffect(() => {
    if (calcMode === "manual") {
      setManualSubtotal(Number(totals.subtotal.toFixed(2)));
      setManualItbis(Number(totals.itbis.toFixed(2)));
      setManualTotal(Number(totals.total.toFixed(2)));
    }
  }, [calcMode, totals.subtotal, totals.itbis, totals.total]);

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
    if (clientPhone.trim() && !isValidPhone(clientPhone)) {
      setError("El telefono del cliente debe tener formato xxx-xxx-xxxx.");
      return;
    }
    if (
      calcMode === "manual" &&
      Math.abs(
        Number((displayTotals.subtotal + displayTotals.itbis).toFixed(2)) -
          Number(displayTotals.total.toFixed(2)),
      ) > 0.01
    ) {
      setError("En modo manual, el total debe ser subtotal + ITBIS.");
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
          address: clientAddress.trim() || undefined,
          rnc_cedula: clientRnc.trim(),
          phone: clientPhone.trim() || undefined,
          email: clientEmail.trim() || undefined,
        },
        cotizacion: {
          payment_terms: paymentTerms.trim(),
          payment_method: paymentMethod,
          account_manager: accountManager.trim(),
          comment: comment.trim() || undefined,
          calc_mode: calcMode,
          subtotal: displayTotals.subtotal,
          itbis: displayTotals.itbis,
          total: displayTotals.total,
        },
        items: payloadItems,
      });
      const cot = res.cotizacion as { number?: number };
      setDone({
        cotizacionNumber: Number(cot.number),
        dgii: res.dgii_preview as Record<string, unknown>,
      });
      setClientName("");
      setClientAddress("");
      setClientRnc("");
      setClientPhone("");
      setClientEmail("");
      setPaymentMethod("Efectivo");
      setComment("");
      setItems([newRow(), newRow()]);
      setCalcMode("auto");
      setManualSubtotal(0);
      setManualItbis(0);
      setManualTotal(0);
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
    <div className="w-full pb-16 px-4 sm:px-0 pt-4 sm:pt-5">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h1 className="text-3xl font-extrabold text-[#0b57d0]">Nueva cotización</h1>
          <p className="text-slate-600">Crea una cotización con datos del cliente e items.</p>
          <p className="text-xs text-slate-500 mt-1">{company.name} · RNC {company.rnc}</p>
          <Link
            to="/clients"
            className="mt-3 inline-block text-sm font-medium text-[#0b57d0] hover:underline whitespace-nowrap"
          >
            Ver clientes
          </Link>
        </div>

        <form
          onSubmit={handleSubmit}
          className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm"
        >
          {/* Emisor + encabezado estilo hoja */}
          <div className="grid gap-0 border-b border-slate-300 grid-cols-1 sm:grid-cols-[1.2fr_0.8fr]">
            <div className="border-b border-slate-200 p-4 sm:p-5 sm:border-b-0 sm:border-r">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Emisor
              </p>
              <p className="mt-1 text-base sm:text-lg font-bold text-slate-900 truncate">
                {company.name}
              </p>
              <dl className="mt-3 space-y-1 text-xs sm:text-sm text-slate-700">
                <div className="flex gap-2 min-w-0">
                  <dt className="w-16 sm:w-20 shrink-0 text-slate-500">RNC</dt>
                  <dd className="font-mono truncate">{company.rnc}</dd>
                </div>
                <div className="flex gap-2 min-w-0">
                  <dt className="w-16 sm:w-20 shrink-0 text-slate-500">Dirección</dt>
                  <dd className="truncate">{company.address || "—"}</dd>
                </div>
                <div className="flex gap-2 min-w-0">
                  <dt className="w-16 sm:w-20 shrink-0 text-slate-500">Tel.</dt>
                  <dd className="truncate">{company.phone?.trim() || "—"}</dd>
                </div>
                <div className="flex gap-2 min-w-0">
                  <dt className="w-16 sm:w-20 shrink-0 text-slate-500">Email</dt>
                  <dd className="truncate text-xs">{company.email?.trim() || "—"}</dd>
                </div>
              </dl>
            </div>
            <div className="flex flex-col justify-between bg-slate-50 p-4 sm:p-5">
              <div>
                <p className="text-right text-xs font-semibold uppercase text-slate-500">
                  Cotización
                </p>
                <p className="text-right text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  COTIZACIÓN
                </p>
                <p className="mt-1 text-right text-xs sm:text-sm text-slate-600">
                  Fecha: <span className="font-medium">{today}</span>
                </p>
                <p className="mt-1 text-right text-xs sm:text-sm text-slate-600">
                  Nº:{" "}
                  <span className="font-mono font-medium">
                    {done ? String(done.cotizacionNumber) : "— (al guardar)"}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Cliente + condiciones */}
          <div className="grid gap-3 sm:gap-4 border-b border-slate-200 p-4 sm:p-5 grid-cols-1 sm:grid-cols-2">
          <div className="rounded border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Cliente
            </p>
            <label className="mt-2 block text-xs font-medium text-slate-600">
              Nombre o razón social
            </label>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              required
            />
            <label className="mt-2 block text-xs font-medium text-slate-600">
              RNC o cédula
            </label>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={clientRnc}
              onChange={(e) => setClientRnc(e.target.value)}
              required
            />
            <label className="mt-2 block text-xs font-medium text-slate-600">
              Dirección
            </label>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={clientAddress}
              onChange={(e) => setClientAddress(e.target.value)}
              placeholder="Dirección del cliente"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-slate-600">
                  Tel. (opc.)
                </label>
                <input
                  inputMode="numeric"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(formatPhoneInput(e.target.value))}
                  placeholder="xxx-xxx-xxxx"
                  maxLength={12}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">
                  Email (opc.)
                </label>
                <input
                  type="email"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="space-y-3 rounded border border-slate-200 p-3 sm:p-4">
            <div>
              <label className="text-xs font-medium text-slate-600">
                Condiciones de pago
              </label>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">
                Forma de pago
              </label>
              <select
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="Efectivo">Efectivo</option>
                <option value="Cheque">Cheque</option>
                <option value="Depósito">Depósito</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">
                Ejecutivo de cuentas
              </label>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={accountManager}
                onChange={(e) => setAccountManager(e.target.value)}
                placeholder="Nombre del ejecutivo"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">
                Comentario contable (opc.)
              </label>
              <textarea
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Ej: Válido por los 15 días del mes"
              />
            </div>
          </div>
        </div>

        {/* Tabla ítems */}
        <div className="p-4 sm:p-5">
          <div className="mb-2 sm:mb-3 flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-semibold text-slate-800">Detalle</p>
            <button
              type="button"
              onClick={addItem}
              className="text-xs sm:text-sm font-medium text-indigo-600 hover:underline whitespace-nowrap"
            >
              + Agregar línea
            </button>
          </div>
          <div className="overflow-x-auto border border-slate-300">
            <table className="w-full text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="bg-slate-200 text-left font-semibold uppercase text-slate-700">
                  <th className="border border-slate-300 px-1 sm:px-2 py-2 w-8">#</th>
                  <th className="border border-slate-300 px-1 sm:px-2 py-2 min-w-[4rem]">Cant.</th>
                  <th className="border border-slate-300 px-1 sm:px-2 py-2 min-w-[4rem]">Unidad</th>
                  <th className="border border-slate-300 px-1 sm:px-2 py-2 min-w-[8rem]">Descripción</th>
                  <th className="border border-slate-300 px-1 sm:px-2 py-2 text-right min-w-[5rem]">
                    P. unitario
                  </th>
                  <th className="border border-slate-300 px-1 sm:px-2 py-2 text-right min-w-[5rem]">
                    Valor
                  </th>
                  <th className="border border-slate-300 px-1 sm:px-2 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map((row, idx) => (
                  <tr key={row.key} className="bg-white">
                    <td className="border border-slate-200 px-1 sm:px-2 py-1 sm:py-1.5 text-center text-slate-500 text-xs">
                      {idx + 1}
                    </td>
                    <td className="border border-slate-200 p-0.5 sm:p-1">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="w-full rounded border border-slate-200 px-1 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={row.quantity}
                        onChange={(e) =>
                          updateItem(row.key, {
                            quantity: Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td className="border border-slate-200 p-0.5 sm:p-1">
                      <input
                        className="w-full rounded border border-slate-200 px-1 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={row.unit}
                        onChange={(e) =>
                          updateItem(row.key, { unit: e.target.value })
                        }
                      />
                    </td>
                    <td className="border border-slate-200 p-0.5 sm:p-1">
                      <input
                        className="w-full rounded border border-slate-200 px-1 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={row.description}
                        onChange={(e) =>
                          updateItem(row.key, { description: e.target.value })
                        }
                      />
                    </td>
                    <td className="border border-slate-200 p-0.5 sm:p-1">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-full rounded border border-slate-200 px-1 py-0.5 text-right text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={row.unit_price}
                        onChange={(e) =>
                          updateItem(row.key, {
                            unit_price: Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td className="border border-slate-200 px-1 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-slate-800 text-xs">
                      {itemLineTotalValue(
                        row.quantity,
                        row.unit_price,
                      ).toFixed(2)}
                    </td>
                    <td className="border border-slate-200 p-0.5 sm:p-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeItem(row.key)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totales */}
          <div className="mt-3 sm:mt-4 flex justify-end">
            <div className="w-full max-w-xs space-y-1 rounded border border-slate-200 bg-slate-50 p-3 sm:p-4 text-xs sm:text-sm">
              <div className="mb-2 flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1.5">
                <span className="text-slate-600">Modo cálculo</span>
                <select
                  value={calcMode}
                  onChange={(e) => setCalcMode(e.target.value as "auto" | "manual")}
                  className="rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="auto">Automático</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Subtotal</span>
                {calcMode === "manual" ? (
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={manualSubtotal}
                    onChange={(e) => setManualSubtotal(Number(e.target.value))}
                    className="w-32 rounded border border-slate-300 px-2 py-1 text-right font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                ) : (
                  <span className="font-mono font-medium">
                    RD$ {totals.subtotal.toFixed(2)}
                  </span>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">ITBIS (18%)</span>
                {calcMode === "manual" ? (
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={manualItbis}
                    onChange={(e) => setManualItbis(Number(e.target.value))}
                    className="w-32 rounded border border-slate-300 px-2 py-1 text-right font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                ) : (
                  <span className="font-mono font-medium">
                    RD$ {totals.itbis.toFixed(2)}
                  </span>
                )}
              </div>
              <div className="flex justify-between border-t border-slate-300 pt-2 font-semibold text-slate-900">
                <span>Total</span>
                {calcMode === "manual" ? (
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={manualTotal}
                    onChange={(e) => setManualTotal(Number(e.target.value))}
                    className="w-32 rounded border border-slate-300 px-2 py-1 text-right font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                ) : (
                  <span className="font-mono">RD$ {totals.total.toFixed(2)}</span>
                )}
              </div>
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs sm:text-sm text-red-700">
              {error}
            </p>
          )}

          {done && (
            <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3 sm:p-4 text-xs sm:text-sm text-emerald-900">
              <p className="font-semibold">Cotización guardada (Nº {done.cotizacionNumber})</p>
              <p className="mt-1 text-xs text-emerald-800">
                Vista previa estructura DGII (sin envío aún):
              </p>
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-white p-2 text-xs text-slate-800">
                {JSON.stringify(done.dgii, null, 2)}
              </pre>
            </div>
          )}

          <div className="mt-6 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
            <Link
              to="/clients"
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 text-center"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-slate-900 px-5 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
            >
              {loading ? "Guardando…" : "Guardar cotización"}
            </button>
          </div>
        </div>
      </form>
      </div>
    </div>
  );
}
