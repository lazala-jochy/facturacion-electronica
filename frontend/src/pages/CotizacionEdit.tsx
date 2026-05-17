import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AUTH_STORAGE_KEY, type AuthSession } from "../types/session";
import {
  getCotizacion,
  updateCotizacion,
  type CotizacionItemDraft,
} from "../services/cotizaciones";
import { calculateTotalsFromItems, itemLineTotalValue } from "../utils/tax";
import { formatPhoneInput, isValidPhone } from "../utils/phone";
import {
  DEFAULT_ECF_TIPO,
  ECF_CONSUMO_RFCE_THRESHOLD_RD,
  ECF_TIPO_OPTIONS,
  ECF_TIPO_REQUIERE_REFERENCIA,
  isConsumoMenor250Rfce,
} from "../config/ecfTipos";

type ItemRow = CotizacionItemDraft & { key: string };

const newRow = (): ItemRow => ({
  key: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
  quantity: 1,
  unit: "Servicio",
  description: "",
  unit_price: 0,
});

export default function CotizacionEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cotizacionId = Number(id);
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

  const [certEncSecret, setCertEncSecret] = useState("");
  useEffect(() => {
    const cid = company?.id;
    if (cid == null || typeof sessionStorage === "undefined") return;
    const saved = sessionStorage.getItem(`fe_cert_enc_${cid}`);
    const fromProfile = company?.certificate_keyphrase?.trim() ?? "";
    if (fromProfile) {
      setCertEncSecret((prev) => (prev.trim().length > 0 ? prev : fromProfile));
    } else if (saved) {
      setCertEncSecret((prev) => (prev.trim().length > 0 ? prev : saved));
    }
  }, [company?.id, company?.certificate_keyphrase]);

  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientRnc, setClientRnc] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("50% avance");
  const [paymentMethod, setPaymentMethod] = useState("Efectivo");
  const [accountManager, setAccountManager] = useState("");
  const [comment, setComment] = useState("");
  const [ecfTipo, setEcfTipo] = useState(DEFAULT_ECF_TIPO);
  const [ecfReferenceNcf, setEcfReferenceNcf] = useState("");
  const [items, setItems] = useState<ItemRow[]>(() => [newRow()]);
  const [calcMode, setCalcMode] = useState<"auto" | "manual">("auto");
  const [manualSubtotal, setManualSubtotal] = useState(0);
  const [manualItbis, setManualItbis] = useState(0);
  const [manualTotal, setManualTotal] = useState(0);
  const [numberLabel, setNumberLabel] = useState<string>("—");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [done, setDone] = useState<string>("");

  const lineTotals = items.map((it) => itemLineTotalValue(it.quantity, it.unit_price));
  const totals = calculateTotalsFromItems(lineTotals.map((totalValue) => ({ totalValue })));
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

  useEffect(() => {
    const load = async () => {
      if (!Number.isFinite(cotizacionId) || cotizacionId <= 0) {
        setError("ID de cotización inválido.");
        setLoadingInitial(false);
        return;
      }
      try {
        const out = await getCotizacion(cotizacionId);
        const c = out.cotizacion;
        setNumberLabel(String(c.number));
        setClientName(c.client.name);
        setClientAddress(c.client.address ?? "");
        setClientRnc(c.client.rnc_cedula);
        setClientPhone(c.client.phone ?? "");
        setClientEmail(c.client.email ?? "");
        setPaymentTerms(c.payment_terms ?? "50% avance");
        setPaymentMethod(c.payment_method ?? "Efectivo");
        setAccountManager(c.account_manager ?? "");
        setComment(c.comment ?? "");
        setEcfTipo(c.ecf_tipo?.trim() || DEFAULT_ECF_TIPO);
        setEcfReferenceNcf(c.ecf_reference_ncf?.trim() ?? "");
        const mappedItems =
          c.items && c.items.length > 0
            ? c.items.map((it) => ({
                key: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
                quantity: it.quantity,
                unit: it.unit,
                description: it.description,
                unit_price: it.unit_price,
              }))
            : [newRow()];
        setItems(mappedItems);
        setCalcMode("manual");
        setManualSubtotal(Number((c.subtotal ?? 0).toFixed(2)));
        setManualItbis(Number((c.itbis ?? 0).toFixed(2)));
        setManualTotal(Number((c.total ?? 0).toFixed(2)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar la cotización.");
      } finally {
        setLoadingInitial(false);
      }
    };
    void load();
  }, [cotizacionId]);

  const updateItem = (key: string, patch: Partial<CotizacionItemDraft>) => {
    setItems((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };
  const addItem = () => setItems((prev) => [...prev, newRow()]);
  const removeItem = (key: string) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setDone("");
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
      const enc = certEncSecret.trim() || company?.certificate_keyphrase?.trim() || "";
      await updateCotizacion(cotizacionId, {
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
          ecf_tipo: ecfTipo,
          ecf_reference_ncf:
            ECF_TIPO_REQUIERE_REFERENCIA.has(ecfTipo) && ecfReferenceNcf.trim()
              ? ecfReferenceNcf.trim()
              : undefined,
          calc_mode: calcMode,
          subtotal: displayTotals.subtotal,
          itbis: displayTotals.itbis,
          total: displayTotals.total,
        },
        items: payloadItems,
        ...(enc.length >= 8 ? { certificate_encryption_secret: enc } : {}),
      });
      setDone("Cotización actualizada correctamente.");
      setTimeout(() => navigate("/clients"), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar.");
    } finally {
      setLoading(false);
    }
  };

  if (!company) {
    return (
      <p className="text-slate-600">
        No hay sesion. <Link className="text-indigo-600 underline" to="/">Volver</Link>
      </p>
    );
  }

  if (loadingInitial) {
    return <p className="text-slate-600">Cargando cotización...</p>;
  }

  return (
    <div className="w-full pb-16 px-4 sm:px-0 pt-4 sm:pt-5">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h1 className="text-3xl font-extrabold text-[#0b57d0]">Editar cotización</h1>
          <p className="text-slate-600">Actualiza los datos de la cotización seleccionada.</p>
          <p className="text-xs text-slate-500 mt-1">{company.name} · RNC {company.rnc}</p>
          <Link to="/clients" className="mt-3 inline-block text-sm font-medium text-[#0b57d0] hover:underline whitespace-nowrap">
            Ver clientes
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
          <div className="grid gap-0 border-b border-slate-300 grid-cols-1 sm:grid-cols-[1.2fr_0.8fr]">
            <div className="border-b border-slate-200 p-4 sm:p-5 sm:border-b-0 sm:border-r">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Emisor</p>
              <p className="mt-1 text-base sm:text-lg font-bold text-slate-900 truncate">{company.name}</p>
            </div>
            <div className="flex flex-col justify-between bg-slate-50 p-4 sm:p-5">
              <p className="text-right text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">COTIZACIÓN</p>
              <p className="mt-1 text-right text-xs sm:text-sm text-slate-600">
                Nº: <span className="font-mono font-medium">{numberLabel}</span>
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:gap-4 border-b border-slate-200 p-4 sm:p-5 grid-cols-1 sm:grid-cols-2">
            <div className="rounded border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
              <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm" value={clientName} onChange={(e) => setClientName(e.target.value)} required />
              <input className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm font-mono" value={clientRnc} onChange={(e) => setClientRnc(e.target.value)} required />
              {ecfTipo === "31" && (
                <p className="mt-1 text-[11px] text-slate-500">Tipo 31: RNC o cédula del comprador (crédito fiscal).</p>
              )}
              {ecfTipo === "32" && (
                <p className="mt-1 text-[11px] text-slate-500">Tipo 32: cédula o RNC (consumo).</p>
              )}
              {isConsumoMenor250Rfce(ecfTipo, displayTotals.total) && (
                <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  <strong>Flujo 32 RFCE:</strong> en Clientes usá <strong>Enviar RFCE (32 &lt;250k)</strong> (total &lt; RD$
                  {ECF_CONSUMO_RFCE_THRESHOLD_RD.toLocaleString("es-DO")}).
                </div>
              )}
              <input className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm" value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input inputMode="numeric" className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs" value={clientPhone} onChange={(e) => setClientPhone(formatPhoneInput(e.target.value))} placeholder="xxx-xxx-xxxx" maxLength={12} />
                <input type="email" className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
              </div>
            </div>
            <div className="space-y-3 rounded border border-slate-200 p-3 sm:p-4">
              <div>
                <label htmlFor="pxd0yl" className="text-xs font-medium text-slate-600">
                  Tipo de comprobante fiscal
                </label>
                <select
                  id="pxd0yl"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm"
                  value={ecfTipo}
                  onChange={(e) => setEcfTipo(e.target.value)}
                >
                  {ECF_TIPO_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {ECF_TIPO_REQUIERE_REFERENCIA.has(ecfTipo) && (
                <div>
                  <label className="text-xs font-medium text-slate-600">Documento referencia (e-NCF)</label>
                  <input
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm font-mono"
                    value={ecfReferenceNcf}
                    onChange={(e) => setEcfReferenceNcf(e.target.value)}
                    placeholder="Ej: E310000000001"
                    required
                  />
                </div>
              )}
              <input className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} required />
              <select className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="Efectivo">Efectivo</option>
                <option value="Cheque">Cheque</option>
                <option value="Depósito">Depósito</option>
              </select>
              <input className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm" value={accountManager} onChange={(e) => setAccountManager(e.target.value)} required />
              <textarea className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <div className="mb-2 sm:mb-3 flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm font-semibold text-slate-800">Detalle</p>
              <button type="button" onClick={addItem} className="text-xs sm:text-sm font-medium text-indigo-600 hover:underline whitespace-nowrap">+ Agregar línea</button>
            </div>
            <div className="overflow-x-auto border border-slate-300">
              <table className="w-full text-xs sm:text-sm border-collapse">
                <tbody>
                  {items.map((row, idx) => (
                    <tr key={row.key} className="bg-white">
                      <td className="border border-slate-200 px-2 py-1 text-center text-slate-500 text-xs">{idx + 1}</td>
                      <td className="border border-slate-200 p-1"><input type="number" min={0} step="any" className="w-full rounded border border-slate-200 px-1 py-0.5 text-xs" value={row.quantity} onChange={(e) => updateItem(row.key, { quantity: Number(e.target.value) })} /></td>
                      <td className="border border-slate-200 p-1"><input className="w-full rounded border border-slate-200 px-1 py-0.5 text-xs" value={row.unit} onChange={(e) => updateItem(row.key, { unit: e.target.value })} /></td>
                      <td className="border border-slate-200 p-1"><input className="w-full rounded border border-slate-200 px-1 py-0.5 text-xs" value={row.description} onChange={(e) => updateItem(row.key, { description: e.target.value })} /></td>
                      <td className="border border-slate-200 p-1"><input type="number" min={0} step="0.01" className="w-full rounded border border-slate-200 px-1 py-0.5 text-right text-xs" value={row.unit_price} onChange={(e) => updateItem(row.key, { unit_price: Number(e.target.value) })} /></td>
                      <td className="border border-slate-200 px-2 py-1 text-right font-mono text-slate-800 text-xs">{itemLineTotalValue(row.quantity, row.unit_price).toFixed(2)}</td>
                      <td className="border border-slate-200 p-1 text-center"><button type="button" onClick={() => removeItem(row.key)} className="text-xs text-red-600 hover:underline">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 sm:mt-4 flex justify-end">
              <div className="w-full max-w-xs space-y-1 rounded border border-slate-200 bg-slate-50 p-3 sm:p-4 text-xs sm:text-sm">
                <div className="mb-2 flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1.5">
                  <span className="text-slate-600">Modo cálculo</span>
                  <select value={calcMode} onChange={(e) => setCalcMode(e.target.value as "auto" | "manual")} className="rounded border border-slate-300 px-2 py-1 text-xs">
                    <option value="auto">Automático</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
                <div className="flex justify-between"><span className="text-slate-600">Subtotal</span>{calcMode === "manual" ? <input type="number" step="0.01" min={0} value={manualSubtotal} onChange={(e) => setManualSubtotal(Number(e.target.value))} className="w-32 rounded border border-slate-300 px-2 py-1 text-right font-mono text-xs" /> : <span className="font-mono font-medium">RD$ {totals.subtotal.toFixed(2)}</span>}</div>
                <div className="flex justify-between"><span className="text-slate-600">ITBIS (18%)</span>{calcMode === "manual" ? <input type="number" step="0.01" min={0} value={manualItbis} onChange={(e) => setManualItbis(Number(e.target.value))} className="w-32 rounded border border-slate-300 px-2 py-1 text-right font-mono text-xs" /> : <span className="font-mono font-medium">RD$ {totals.itbis.toFixed(2)}</span>}</div>
                <div className="flex justify-between border-t border-slate-300 pt-2 font-semibold text-slate-900"><span>Total</span>{calcMode === "manual" ? <input type="number" step="0.01" min={0} value={manualTotal} onChange={(e) => setManualTotal(Number(e.target.value))} className="w-32 rounded border border-slate-300 px-2 py-1 text-right font-mono text-xs" /> : <span className="font-mono">RD$ {totals.total.toFixed(2)}</span>}</div>
              </div>
            </div>

            {error && <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs sm:text-sm text-red-700">{error}</p>}
            {done && <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs sm:text-sm text-emerald-700">{done}</p>}

            <div className="mt-6 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
              <Link to="/clients" className="rounded-lg border border-slate-300 px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 text-center">Cancelar</Link>
              <button type="submit" disabled={loading} className="rounded-lg bg-slate-900 px-5 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap">
                {loading ? "Actualizando…" : "Actualizar cotización"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
