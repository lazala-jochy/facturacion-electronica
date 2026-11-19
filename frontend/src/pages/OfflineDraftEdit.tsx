import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { OfflineCotizacion } from "../offline/db";
import {
  getOfflineCotizacion,
  updateOfflineCotizacionPayload,
} from "../offline/offlineQueue";
import { notifyOfflineSync, runOfflineSync } from "../offline/syncEngine";
import type {
  CotizacionItemDraft,
  CreateClientWithCotizacionPayload,
} from "../services/cotizaciones";
import {
  BIEN_O_SERVICIO_OPTIONS,
  DEFAULT_UNIDAD_MEDIDA,
  UNIDAD_MEDIDA_OPTIONS,
} from "../config/unidadesMedida";
import { calculateTotals, itemLineTotalValue } from "../utils/tax";
import { formatMoney } from "../utils/money";

export default function OfflineDraftEdit() {
  const { localId } = useParams<{ localId: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<OfflineCotizacion | null | undefined>(undefined);
  const [clientName, setClientName] = useState("");
  const [rncCedula, setRncCedula] = useState("");
  const [items, setItems] = useState<CotizacionItemDraft[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!localId) return;
    void getOfflineCotizacion(localId).then((found) => {
      setEntry(found ?? null);
      if (found) {
        setClientName(found.payload.client.name);
        setRncCedula(found.payload.client.rnc_cedula);
        setItems(found.payload.items.map((item) => ({ ...item })));
      }
    });
  }, [localId]);

  if (entry === undefined) return null;

  if (entry === null) {
    return (
      <div className="p-6 text-sm text-slate-600">
        No se encontró esta venta offline (puede que ya se haya sincronizado o eliminado).{" "}
        <Link to="/" className="text-indigo-600 underline">
          Volver
        </Link>
      </div>
    );
  }

  const exento = Boolean(entry.payload.cotizacion.exento);
  const subtotal = items.reduce(
    (sum, item) => sum + itemLineTotalValue(item.quantity, item.unit_price),
    0,
  );
  const baseTotals = calculateTotals(subtotal);
  const totals = exento
    ? { ...baseTotals, itbis: 0, total: baseTotals.subtotal }
    : baseTotals;

  const updateItem = (index: number, patch: Partial<CotizacionItemDraft>) =>
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      {
        quantity: 1,
        unit: DEFAULT_UNIDAD_MEDIDA,
        item_type: "servicio",
        description: "",
        unit_price: 0,
      },
    ]);

  const removeItem = (index: number) =>
    setItems((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!clientName.trim() || !rncCedula.trim()) {
      setError("El cliente y su RNC/Cédula son obligatorios.");
      return;
    }
    if (items.length === 0) {
      setError("La venta debe tener al menos una línea.");
      return;
    }
    const badPriceLine = items.findIndex((item) => !(Number(item.unit_price) > 0));
    if (badPriceLine >= 0) {
      setError(`El precio unitario de la línea ${badPriceLine + 1} no puede ser 0.`);
      return;
    }

    const cleanedItems: CotizacionItemDraft[] = items.map((item) => ({
      quantity: Number(item.quantity) || 0,
      unit: item.unit.trim() || DEFAULT_UNIDAD_MEDIDA,
      item_type: item.item_type,
      description: item.description.trim() || "Concepto",
      unit_price: Number(item.unit_price) || 0,
    }));

    const badLine = cleanedItems.findIndex(
      (item) => itemLineTotalValue(item.quantity, item.unit_price) <= 0,
    );
    if (badLine >= 0) {
      setError(
        `Línea ${badLine + 1}: el monto debe ser mayor que cero (cantidad × precio). Revisá la cantidad y el precio unitario.`,
      );
      return;
    }

    const newSubtotal = cleanedItems.reduce(
      (sum, item) => sum + itemLineTotalValue(item.quantity, item.unit_price),
      0,
    );
    const newTotals = calculateTotals(newSubtotal);
    const payload: CreateClientWithCotizacionPayload = {
      ...entry.payload,
      client: {
        ...entry.payload.client,
        name: clientName.trim(),
        rnc_cedula: rncCedula.trim(),
      },
      cotizacion: {
        ...entry.payload.cotizacion,
        calc_mode: "auto",
        subtotal: newTotals.subtotal,
        itbis: exento ? 0 : newTotals.itbis,
        total: exento ? newTotals.subtotal : newTotals.total,
      },
      items: cleanedItems,
      certificate_encryption_secret: undefined,
      idempotency_key: entry.localId,
    };

    setSaving(true);
    try {
      await updateOfflineCotizacionPayload(entry.localId, payload);
      await notifyOfflineSync();
      void runOfflineSync();
      navigate("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la venta offline.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-6 text-slate-900">
      <h1 className="text-xl font-bold">Editar venta offline</h1>
      <p className="mt-1 text-sm text-slate-600">
        Corregí los datos y se volverá a intentar el envío con el mismo comprobante local.
      </p>

      <form onSubmit={(event) => void handleSubmit(event)} className="mt-5 space-y-4">
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="block font-medium">Cliente</span>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="block font-medium">RNC/Cédula</span>
            <input
              value={rncCedula}
              onChange={(e) => setRncCedula(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </label>
        </div>

        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Líneas</h2>
            <button
              type="button"
              onClick={addItem}
              className="rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50"
            >
              Agregar línea
            </button>
          </div>
          {items.map((item, index) => (
            <div key={index} className="grid gap-2 rounded border border-slate-100 p-2 sm:grid-cols-5">
              <label className="text-xs sm:col-span-2">
                <span className="block font-medium">Descripción</span>
                <input
                  value={item.description}
                  onChange={(e) => updateItem(index, { description: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="text-xs">
                <span className="block font-medium">Cant.</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="text-xs">
                <span className="block font-medium">Precio unit.</span>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={item.unit_price}
                  onChange={(e) => updateItem(index, { unit_price: Number(e.target.value) })}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <div className="flex items-end justify-between gap-2">
                <label className="text-xs">
                  <span className="block font-medium">Unidad</span>
                  <select
                    value={item.unit}
                    onChange={(e) => updateItem(index, { unit: e.target.value })}
                    className="mt-1 rounded border border-slate-300 px-1 py-1"
                  >
                    {UNIDAD_MEDIDA_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="mb-1 rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Quitar
                </button>
              </div>
              <div className="text-xs text-slate-600 sm:col-span-5">
                Tipo:{" "}
                <select
                  value={item.item_type}
                  onChange={(e) =>
                    updateItem(index, { item_type: e.target.value as CotizacionItemDraft["item_type"] })
                  }
                  className="rounded border border-slate-300 px-1 py-0.5"
                >
                  {BIEN_O_SERVICIO_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        <div className="ml-auto w-56 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Subtotal</span>
            <span>RD$ {formatMoney(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">ITBIS</span>
            <span>RD$ {formatMoney(totals.itbis)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-300 pt-1 font-semibold">
            <span>Total</span>
            <span>RD$ {formatMoney(totals.total)}</span>
          </div>
        </div>

        {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar y sincronizar"}
          </button>
          <Link
            to="/"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
