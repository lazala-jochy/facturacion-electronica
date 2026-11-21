import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AUTH_STORAGE_KEY, type AuthSession } from "../types/session";
import { ApiError } from "../services/api";
import {
  createClientWithCotizacion,
  importarBorradorCotizacionAmway,
  type CotizacionItemDraft,
  type CreateClientWithCotizacionPayload,
} from "../services/cotizaciones";
import { queueOfflineCotizacion } from "../offline/offlineQueue";
import {
  calculateTotalsFromItems,
  itemLineTotalValue,
} from "../utils/tax";
import { formatPhoneInput, isValidPhone } from "../utils/phone";
import ClientRncAutocomplete from "../components/ClientRncAutocomplete";
import ConfirmModal from "../components/ConfirmModal";
import UnidadMedidaSelect from "../components/UnidadMedidaSelect";
import { formatMoney } from "../utils/money";
import {
  DEFAULT_ECF_TIPO,
  ECF_CONSUMO_RFCE_THRESHOLD_RD,
  ECF_TIPO_OPTIONS,
  ECF_TIPO_REQUIERE_REFERENCIA,
  isConsumoMenor250Rfce,
} from "../config/ecfTipos";
import { BIEN_O_SERVICIO_OPTIONS, DEFAULT_UNIDAD_MEDIDA } from "../config/unidadesMedida";
import { addCustomUnidadMedida, getCustomUnidadesMedida } from "../config/customUnidadesMedida";

type ItemRow = CotizacionItemDraft & { key: string };

/** Importar cotización desde PDF de Amway: función interna, solo para este usuario. */
const AMWAY_IMPORT_ALLOWED_EMAIL = "lazalajochy@gmail.com";

const newRow = (): ItemRow => ({
  key: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
  quantity: 1,
  unit: DEFAULT_UNIDAD_MEDIDA,
  item_type: "servicio",
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

  const [certEncSecret, setCertEncSecret] = useState("");
  useEffect(() => {
    const id = company?.id;
    if (id == null || typeof sessionStorage === "undefined") return;
    const saved = sessionStorage.getItem(`fe_cert_enc_${id}`);
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
  const [paymentMethod, setPaymentMethod] = useState("Efectivo");
  const [creditDueDate, setCreditDueDate] = useState("");
  const [comment, setComment] = useState("");
  const [ecfTipo, setEcfTipo] = useState(DEFAULT_ECF_TIPO);
  const [ecfReferenceNcf, setEcfReferenceNcf] = useState("");
  const [items, setItems] = useState<ItemRow[]>(() => [newRow()]);
  const [customUnits, setCustomUnits] = useState<string[]>(() => getCustomUnidadesMedida());
  const [calcMode, setCalcMode] = useState<"auto" | "manual">("auto");
  const [manualSubtotal, setManualSubtotal] = useState(0);
  const [manualItbisRate, setManualItbisRate] = useState(18);
  const [manualItbis, setManualItbis] = useState(0);
  const [manualTotal, setManualTotal] = useState(0);
  const [exento, setExento] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{
    cotizacionNumber: number;
    dgii: Record<string, unknown>;
  } | null>(null);
  const [offlineQueued, setOfflineQueued] = useState<{
    localId: string;
    clientName: string;
  } | null>(null);
  /** Confirmación previa a guardar (modal propio, no window.confirm). */
  const [pendingSave, setPendingSave] = useState<CreateClientWithCotizacionPayload | null>(null);

  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState("");

  const handleImportAmwayPdf = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    setError("");
    setImportNotice("");
    try {
      const borrador = await importarBorradorCotizacionAmway(file);
      setClientName(borrador.client.name);
      setClientAddress(borrador.client.address);
      setClientRnc(borrador.client.rnc_cedula);
      setPaymentMethod(borrador.cotizacion.payment_method);
      setComment(borrador.cotizacion.comment);
      if (borrador.items.length > 0) {
        setItems(
          borrador.items.map((it) => ({
            ...newRow(),
            description: it.description,
            unit_price: it.unit_price,
          })),
        );
      }
      setImportNotice(borrador.aviso);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el PDF.");
    } finally {
      setImporting(false);
    }
  };

  const lineTotals = items.map((it) =>
    itemLineTotalValue(it.quantity, it.unit_price),
  );
  const totals = calculateTotalsFromItems(
    lineTotals.map((totalValue) => ({ totalValue })),
  );
  const calcModeTotals =
    calcMode === "manual"
      ? {
          subtotal: Number.isFinite(manualSubtotal) ? Math.max(0, manualSubtotal) : 0,
          itbis: Number.isFinite(manualItbis) ? Math.max(0, manualItbis) : 0,
          total: Number.isFinite(manualTotal) ? Math.max(0, manualTotal) : 0,
        }
      : totals;
  const displayTotals = exento
    ? { subtotal: calcModeTotals.subtotal, itbis: 0, total: calcModeTotals.subtotal }
    : calcModeTotals;

  useEffect(() => {
    if (calcMode === "manual") {
      setManualSubtotal(Number(totals.subtotal.toFixed(2)));
    }
  }, [calcMode, totals.subtotal]);

  useEffect(() => {
    if (calcMode !== "manual") return;
    const rate = Number.isFinite(manualItbisRate) ? Math.max(0, manualItbisRate) : 0;
    const subtotal = Number.isFinite(manualSubtotal) ? Math.max(0, manualSubtotal) : 0;
    const itbis = Number(((subtotal * rate) / 100).toFixed(2));
    setManualItbis(itbis);
    setManualTotal(Number((subtotal + itbis).toFixed(2)));
  }, [calcMode, manualSubtotal, manualItbisRate]);

  const today = new Date().toLocaleDateString("es-DO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const todayIso = new Date().toISOString().slice(0, 10);
  const isCredito = paymentMethod === "Crédito";

  const updateItem = (key: string, patch: Partial<CotizacionItemDraft>) => {
    setItems((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  };

  const addItem = () => setItems((prev) => [...prev, newRow()]);
  const removeItem = (key: string) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  };

  const handleAddCustomUnit = (value: string) => {
    setCustomUnits(addCustomUnidadMedida(value));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setDone(null);
    setOfflineQueued(null);
    if (!company) {
      setError("No hay sesión activa.");
      return;
    }
    if (!clientName.trim() || !clientRnc.trim()) {
      setError("Nombre y RNC o cedula del cliente son obligatorios.");
      return;
    }
    if (clientPhone.trim() && !isValidPhone(clientPhone)) {
      setError("El telefono del cliente debe tener formato xxx-xxx-xxxx.");
      return;
    }
    if (isCredito && (!creditDueDate || creditDueDate < todayIso)) {
      setError("Indique la fecha límite de pago (igual o posterior a hoy) para una venta a crédito.");
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
    const badPriceLine = items.findIndex((it) => !(Number(it.unit_price) > 0));
    if (badPriceLine >= 0) {
      setError(`El precio unitario de la línea ${badPriceLine + 1} no puede ser 0.`);
      return;
    }

    const payloadItems: CotizacionItemDraft[] = items.map((it) => ({
      quantity: Number(it.quantity) || 0,
      unit: it.unit.trim() || "Unidad",
      item_type: it.item_type === "bien" ? "bien" : "servicio",
      description: it.description.trim() || "Concepto",
      unit_price: Number(it.unit_price) || 0,
    }));

    const payload: CreateClientWithCotizacionPayload = {
      client: {
        name: clientName.trim(),
        address: clientAddress.trim() || undefined,
        rnc_cedula: clientRnc.trim(),
        phone: clientPhone.trim() || undefined,
        email: clientEmail.trim() || undefined,
      },
      cotizacion: {
        payment_method: paymentMethod,
        fecha_limite_pago: isCredito ? creditDueDate : undefined,
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
        exento,
      },
      items: payloadItems,
    };

    setPendingSave(payload);
  };

  const proceedSave = async (payload: CreateClientWithCotizacionPayload) => {
    if (!company) return;

    const resetForm = () => {
      setClientName("");
      setClientAddress("");
      setClientRnc("");
      setClientPhone("");
      setClientEmail("");
      setPaymentMethod("Efectivo");
      setCreditDueDate("");
      setEcfTipo(DEFAULT_ECF_TIPO);
      setEcfReferenceNcf("");
      setComment("");
      setItems([newRow()]);
      setExento(false);
      setCalcMode("auto");
      setManualSubtotal(0);
      setManualItbis(0);
      setManualTotal(0);
      setImportNotice("");
    };

    // No se decide "offline" por el heartbeat cacheado (puede dar falso negativo si el backend
    // tarda en responder, ej. Render "despertando" el servicio) -- eso dejaría en cola una venta
    // que en realidad sí se podía guardar, confundiendo al usuario (ve el formulario vaciarse sin
    // la confirmación que esperaba). Siempre se intenta guardar en línea primero; solo cae a la
    // cola offline si ESTA llamada puntual falla de verdad por red (ver catch abajo).
    setLoading(true);
    try {
      const enc = certEncSecret.trim() || company?.certificate_keyphrase?.trim() || "";
      const res = await createClientWithCotizacion({
        ...payload,
        ...(enc.length >= 8 ? { certificate_encryption_secret: enc } : {}),
      });
      const cot = res.cotizacion as { number?: number };
      setDone({
        cotizacionNumber: Number(cot.number),
        dgii: res.dgii_preview as Record<string, unknown>,
      });
      resetForm();
    } catch (err) {
      // Esta llamada puntual no llegó al servidor: sin red (status 0) o el servidor no
      // respondió a tiempo (502/503/504 -- típico de un cold start, ej. Render despertando el
      // servicio). Se guarda offline en vez de perder la venta, en lugar de un error genérico.
      const isUnreachable =
        err instanceof ApiError && (err.status === 0 || [502, 503, 504].includes(err.status));
      if (isUnreachable) {
        const entry = await queueOfflineCotizacion(company.id, payload);
        setOfflineQueued({ localId: entry.localId, clientName: payload.client.name });
        resetForm();
      } else {
        setError(err instanceof Error ? err.message : "Error al guardar.");
      }
    } finally {
      setLoading(false);
    }
  };

  const confirmPendingSave = () => {
    const payload = pendingSave;
    if (!payload) return;
    setPendingSave(null);
    void proceedSave(payload);
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
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link
              to="/clients"
              className="text-sm font-medium text-[#0b57d0] hover:underline whitespace-nowrap"
            >
              Ver clientes
            </Link>
            {session?.user?.email?.trim().toLowerCase() === AMWAY_IMPORT_ALLOWED_EMAIL && (
              <label
                className={`inline-flex cursor-pointer items-center gap-2 rounded border border-[#0b57d0] px-3 py-1.5 text-sm font-medium text-[#0b57d0] hover:bg-blue-50 ${
                  importing ? "opacity-60 pointer-events-none" : ""
                }`}
              >
                {importing ? "Leyendo PDF..." : "Importar desde PDF de Amway"}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  disabled={importing}
                  onChange={(e) => {
                    void handleImportAmwayPdf(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          {importNotice && (
            <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              {importNotice}
            </p>
          )}
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
            <ClientRncAutocomplete
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={clientRnc}
              onChange={setClientRnc}
              required
              onSelect={(c) => {
                setClientName(c.name);
                setClientRnc(c.rnc_cedula);
                setClientAddress(c.address ?? "");
                setClientPhone(c.phone ?? "");
                setClientEmail(c.email ?? "");
              }}
            />
            {ecfTipo === "31" && (
              <p className="mt-1 text-[11px] text-slate-500">
                Tipo 31: debe ser RNC o cédula del comprador (comprobante crédito fiscal DGII).
              </p>
            )}
            {ecfTipo === "32" && (
              <p className="mt-1 text-[11px] text-slate-500">
                Tipo 32 (consumo): podés usar cédula de persona física o RNC.
              </p>
            )}
            {isConsumoMenor250Rfce(ecfTipo, displayTotals.total) && (
              <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <strong>Flujo 32 RFCE:</strong> total menor a RD$
                {ECF_CONSUMO_RFCE_THRESHOLD_RD.toLocaleString("es-DO")}. En Clientes usá{" "}
                <strong>Enviar RFCE (32 &lt;250k)</strong>, no «Enviar DGII» directo. Después subí el e-CF íntegro al
                portal CerteCF.
              </div>
            )}
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
              <label htmlFor="pxd0yl" className="text-xs font-medium text-slate-600">
                Tipo de comprobante fiscal
              </label>
              <select
                id="pxd0yl"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                <label className="text-xs font-medium text-slate-600">
                  Documento referencia (e-NCF asociado)
                </label>
                <input
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={ecfReferenceNcf}
                  onChange={(e) => setEcfReferenceNcf(e.target.value)}
                  placeholder="Ej: E310000000001"
                  required
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Obligatorio para notas débito/crédito: e-NCF del comprobante que modificás (XML:
                  NCFModificado).
                </p>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-slate-600">
                Forma de pago
              </label>
              <select
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={paymentMethod}
                onChange={(e) => {
                  setPaymentMethod(e.target.value);
                  if (e.target.value !== "Crédito") setCreditDueDate("");
                }}
              >
                <option value="Efectivo">Efectivo</option>
                <option value="Cheque">Cheque</option>
                <option value="Depósito">Depósito</option>
                <option value="Crédito">Crédito</option>
              </select>
            </div>
            {isCredito && (
              <div>
                <label className="text-xs font-medium text-slate-600">
                  Fecha límite de pago
                </label>
                <input
                  type="date"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={creditDueDate}
                  min={todayIso}
                  onChange={(e) => setCreditDueDate(e.target.value)}
                  required
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Debe ser igual o posterior a hoy (fecha de emisión). Se envía a la DGII como
                  FechaLimitePago del e-CF.
                </p>
              </div>
            )}
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
                  <th className="border border-slate-300 px-1 sm:px-2 py-2 min-w-[8rem]">Unidad de medida</th>
                  <th className="border border-slate-300 px-1 sm:px-2 py-2 min-w-[7rem]">Bien o servicio</th>
                  <th className="border border-slate-300 px-1 sm:px-2 py-2 min-w-[18rem]">Descripción</th>
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
                      <UnidadMedidaSelect
                        value={row.unit}
                        onChange={(unit) => updateItem(row.key, { unit })}
                        customUnits={customUnits}
                        onAddCustomUnit={handleAddCustomUnit}
                      />
                    </td>
                    <td className="border border-slate-200 p-0.5 sm:p-1">
                      <select
                        className="w-full rounded border border-slate-200 px-1 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={row.item_type}
                        onChange={(e) =>
                          updateItem(row.key, {
                            item_type: e.target.value === "bien" ? "bien" : "servicio",
                          })
                        }
                      >
                        {BIEN_O_SERVICIO_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
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
                        min={0.01}
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
                      {formatMoney(itemLineTotalValue(row.quantity, row.unit_price))}
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
              <label className="mb-2 flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1.5">
                <span className="text-slate-600">Exento de ITBIS</span>
                <input
                  type="checkbox"
                  checked={exento}
                  onChange={(e) => setExento(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>
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
                    RD$ {formatMoney(totals.subtotal)}
                  </span>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">
                  {calcMode === "manual" ? "ITBIS" : "ITBIS (18%)"}
                </span>
                {exento ? (
                  <span className="font-mono font-medium">RD$ 0.00</span>
                ) : calcMode === "manual" ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="1"
                        min={0}
                        max={100}
                        value={manualItbisRate}
                        onChange={(e) => setManualItbisRate(Number(e.target.value))}
                        className="w-14 rounded border border-slate-300 px-1 py-1 text-right font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <span className="text-xs text-slate-500">%</span>
                    </div>
                    <span className="w-20 text-right font-mono font-medium">
                      RD$ {formatMoney(manualItbis)}
                    </span>
                  </div>
                ) : (
                  <span className="font-mono font-medium">
                    RD$ {formatMoney(totals.itbis)}
                  </span>
                )}
              </div>
              <div className="flex justify-between border-t border-slate-300 pt-2 font-semibold text-slate-900">
                <span>Total</span>
                {exento ? (
                  <span className="font-mono">RD$ {formatMoney(displayTotals.total)}</span>
                ) : calcMode === "manual" ? (
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={manualTotal}
                    onChange={(e) => setManualTotal(Number(e.target.value))}
                    className="w-32 rounded border border-slate-300 px-2 py-1 text-right font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                ) : (
                  <span className="font-mono">RD$ {formatMoney(totals.total)}</span>
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

          {offlineQueued && (
            <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 sm:p-4 text-xs sm:text-sm text-amber-900">
              <p className="font-semibold">
                Guardada sin conexión — {offlineQueued.clientName}
              </p>
              <p className="mt-1 text-xs text-amber-800">
                Se enviará sola (con NCF real y firma DGII) en cuanto vuelva internet. Mientras
                tanto podés imprimir un comprobante borrador.
              </p>
              <Link
                to={`/cotizaciones/offline/${offlineQueued.localId}/imprimir`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
              >
                Imprimir comprobante borrador
              </Link>
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

      <ConfirmModal
        open={pendingSave != null}
        title="Guardar cotización"
        message={`Vas a guardar la cotización para "${pendingSave?.client.name ?? ""}" por RD$ ${
          pendingSave ? formatMoney(pendingSave.cotizacion.total ?? 0) : "0.00"
        }.\n\n¿Deseas continuar?`}
        confirmLabel="Guardar"
        onConfirm={confirmPendingSave}
        onCancel={() => setPendingSave(null)}
      />
    </div>
  );
}
