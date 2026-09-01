import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeaderCard from "../components/PageHeaderCard";
import PageShell from "../components/PageShell";
import {
  DGII_606_FORMA_PAGO,
  DGII_606_TIPO_BIENES,
  DGII_606_TIPO_RET_ISR,
} from "../config/dgii606";
import { listClients, type ClientListItem } from "../services/clients";
import { listCotizaciones, type CotizacionListItem } from "../services/cotizaciones";
import {
  createCompra606,
  deleteCompra606,
  downloadDgiiFormatoTxt,
  enviarDgiiFormato,
  fetchBorrador606,
  listCompras606,
  llenar607DesdeEcf,
  previewDgiiFormato,
  type Borrador606,
  type Compra606Row,
  type FormatoEnvioResult,
  type FormatoPreview,
  type Llenar607Result,
} from "../services/dgiiFormatos";

const currentPeriodo = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const money = (n: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

type Tab = "607" | "606";

const num = (s: string) => Number.parseFloat(s) || 0;

const applyBorradorToForm = (b: Borrador606) => ({
  rnc_cedula: b.rnc_cedula,
  tipo_bienes_servicios: b.tipo_bienes_servicios,
  ncf: b.ncf,
  ncf_modificado: b.ncf_modificado,
  fecha_comprobante: b.fecha_comprobante,
  fecha_pago: b.fecha_pago,
  monto_servicios: b.monto_servicios > 0 ? String(b.monto_servicios) : "",
  monto_bienes: b.monto_bienes > 0 ? String(b.monto_bienes) : "",
  itbis_facturado: b.itbis_facturado > 0 ? String(b.itbis_facturado) : "",
  itbis_retenido: "",
  itbis_sujeto_proporcionalidad: "",
  itbis_llevado_al_costo: "",
  itbis_por_adelantar: "",
  itbis_percibido_compras: "",
  tipo_retencion_isr: "",
  retencion_renta: "",
  isr_percibido_compras: "",
  impuesto_isc: "",
  impuestos_otros: "",
  monto_propina_legal: "",
  forma_pago: b.forma_pago,
});

const cotizacionEnPeriodo = (c: CotizacionListItem, periodo: string): boolean => {
  const raw = c.dgii_submitted_at ?? c.created_at;
  if (!raw) return false;
  const d = new Date(raw);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}` === periodo;
};

const emptyCompraForm = () => ({
  rnc_cedula: "",
  tipo_bienes_servicios: "02",
  ncf: "",
  ncf_modificado: "",
  fecha_comprobante: "",
  fecha_pago: "",
  monto_servicios: "",
  monto_bienes: "",
  itbis_facturado: "",
  itbis_retenido: "",
  itbis_sujeto_proporcionalidad: "",
  itbis_llevado_al_costo: "",
  itbis_por_adelantar: "",
  itbis_percibido_compras: "",
  tipo_retencion_isr: "",
  retencion_renta: "",
  isr_percibido_compras: "",
  impuesto_isc: "",
  impuestos_otros: "",
  monto_propina_legal: "",
  forma_pago: "04",
});

const inputCls = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

export default function Formatos606607() {
  const [tab, setTab] = useState<Tab>("607");
  const [periodo, setPeriodo] = useState(currentPeriodo);
  const [preview, setPreview] = useState<FormatoPreview | null>(null);
  const [compras, setCompras] = useState<Compra606Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [envioResult, setEnvioResult] = useState<FormatoEnvioResult | null>(null);
  const [compraForm, setCompraForm] = useState(emptyCompraForm);
  const [llenar607, setLlenar607] = useState<Llenar607Result | null>(null);
  const [borradorAviso, setBorradorAviso] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [cotizaciones, setCotizaciones] = useState<CotizacionListItem[]>([]);
  const [fillClientId, setFillClientId] = useState("");
  const [fillCotizacionId, setFillCotizacionId] = useState("");

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = await previewDgiiFormato(tab, periodo);
      setPreview(p);
      if (tab === "606") {
        const rows = await listCompras606(periodo);
        setCompras(rows);
      }
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "No se pudo cargar la vista previa.");
    } finally {
      setLoading(false);
    }
  }, [tab, periodo]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  useEffect(() => {
    if (tab !== "606") return;
    void (async () => {
      try {
        const [{ clients: cl }, { cotizaciones: co }] = await Promise.all([
          listClients(),
          listCotizaciones(),
        ]);
        setClients(cl);
        setCotizaciones(co);
      } catch {
        /* opcional para autollenado */
      }
    })();
  }, [tab]);

  const cotizacionesPeriodo = useMemo(
    () => cotizaciones.filter((c) => cotizacionEnPeriodo(c, periodo)),
    [cotizaciones, periodo],
  );

  const handleLlenar607 = async () => {
    setActionLoading("llenar607");
    setError("");
    try {
      const out = await llenar607DesdeEcf(periodo);
      setLlenar607(out);
      await loadPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar desde e-CF.");
    } finally {
      setActionLoading("");
    }
  };

  const handleBorradorCliente = async () => {
    const id = Number(fillClientId);
    if (!id) {
      setError("Seleccione un cliente (proveedor).");
      return;
    }
    setActionLoading("borrador-cliente");
    setError("");
    try {
      const { borrador } = await fetchBorrador606({ client_id: id });
      setCompraForm(applyBorradorToForm(borrador));
      setBorradorAviso(borrador.aviso);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el borrador.");
    } finally {
      setActionLoading("");
    }
  };

  const handleBorradorCotizacion = async () => {
    const id = Number(fillCotizacionId);
    if (!id) {
      setError("Seleccione una cotización / venta del periodo.");
      return;
    }
    setActionLoading("borrador-cot");
    setError("");
    try {
      const { borrador } = await fetchBorrador606({ cotizacion_id: id });
      setCompraForm(applyBorradorToForm(borrador));
      setBorradorAviso(borrador.aviso);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo copiar montos.");
    } finally {
      setActionLoading("");
    }
  };

  const handleDownload = async () => {
    setActionLoading("download");
    setError("");
    try {
      await downloadDgiiFormatoTxt(tab, periodo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar el TXT.");
    } finally {
      setActionLoading("");
    }
  };

  const handleEnviar = async () => {
    setActionLoading("enviar");
    setError("");
    setEnvioResult(null);
    try {
      const out = await enviarDgiiFormato(tab, periodo);
      setEnvioResult(out);
      await downloadDgiiFormatoTxt(tab, periodo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo preparar el envío.");
    } finally {
      setActionLoading("");
    }
  };

  const handleAddCompra = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading("compra");
    setError("");
    try {
      await createCompra606({
        periodo,
        rnc_cedula: compraForm.rnc_cedula.trim(),
        tipo_bienes_servicios: compraForm.tipo_bienes_servicios,
        ncf: compraForm.ncf.trim(),
        ncf_modificado: compraForm.ncf_modificado.trim() || undefined,
        fecha_comprobante: compraForm.fecha_comprobante.replace(/\D/g, ""),
        fecha_pago: compraForm.fecha_pago.replace(/\D/g, "") || undefined,
        monto_servicios: num(compraForm.monto_servicios),
        monto_bienes: num(compraForm.monto_bienes),
        itbis_facturado: num(compraForm.itbis_facturado),
        itbis_retenido: num(compraForm.itbis_retenido),
        itbis_sujeto_proporcionalidad: num(compraForm.itbis_sujeto_proporcionalidad),
        itbis_llevado_al_costo: num(compraForm.itbis_llevado_al_costo),
        itbis_por_adelantar: num(compraForm.itbis_por_adelantar),
        itbis_percibido_compras: num(compraForm.itbis_percibido_compras),
        tipo_retencion_isr: compraForm.tipo_retencion_isr || undefined,
        retencion_renta: num(compraForm.retencion_renta),
        isr_percibido_compras: num(compraForm.isr_percibido_compras),
        impuesto_isc: num(compraForm.impuesto_isc),
        impuestos_otros: num(compraForm.impuestos_otros),
        monto_propina_legal: num(compraForm.monto_propina_legal),
        forma_pago: compraForm.forma_pago,
      });
      setCompraForm(emptyCompraForm());
      await loadPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la compra.");
    } finally {
      setActionLoading("");
    }
  };

  const handleDeleteCompra = async (id: number) => {
    if (!window.confirm("¿Eliminar este registro de compra?")) return;
    setActionLoading(`del-${id}`);
    try {
      await deleteCompra606(id);
      await loadPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar.");
    } finally {
      setActionLoading("");
    }
  };

  const tabDescription = useMemo(
    () =>
      tab === "607"
        ? "Origen: cotizaciones / e-CF con estado aceptado por DGII en el periodo (cliente, e-NCF, montos e ITBIS del XML firmado). No se guarda en base de datos: se calcula al generar el TXT."
        : "Origen: compras a proveedores que usted registra aquí (tabla compras_606). Puede autollenar RNC desde Clientes o copiar montos de una venta como borrador; el NCF debe ser el de la factura de compra del proveedor.",
    [tab],
  );

  return (
    <PageShell>
      <PageHeaderCard
        title="606/607"
        subtitle="Remisión mensual de compras (606) y ventas (607) a la DGII — archivo TXT según Norma 06-18 / 07-18."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("607")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === "607"
              ? "bg-[#0b57d0] text-white shadow-sm"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          607
        </button>
        <button
          type="button"
          onClick={() => setTab("606")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === "606"
              ? "bg-[#0b57d0] text-white shadow-sm"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          606
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm space-y-4">
        <p className="text-sm text-slate-600">{tabDescription}</p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Periodo (AAAA-MM)</span>
            <input
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="mt-1 block w-full min-w-[10rem] rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void loadPreview()}
            disabled={loading}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? "Cargando…" : "Actualizar"}
          </button>
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        {preview && (
          <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4 text-sm text-slate-800">
            <p>
              <strong>Registros:</strong> {preview.registro_count}
              {preview.total_monto_facturado != null && (
                <>
                  {" "}
                  · <strong>Monto facturado:</strong> {money(preview.total_monto_facturado)}
                </>
              )}
              {preview.total_itbis != null && preview.total_itbis > 0 && (
                <>
                  {" "}
                  · <strong>ITBIS:</strong> {money(preview.total_itbis)}
                </>
              )}
            </p>
          </div>
        )}

        {tab === "607" && (
          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4 space-y-3">
            <p className="text-sm text-slate-800">
              <strong>607 — ventas:</strong> cada línea sale de un e-CF aceptado (módulo e-CF / cotización):
              RNC del cliente, e-NCF, tipo de ingreso, fechas y montos del XML firmado.
            </p>
            <button
              type="button"
              onClick={() => void handleLlenar607()}
              disabled={!!actionLoading}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {actionLoading === "llenar607"
                ? "Cargando desde e-CF…"
                : "Llenar desde e-CF aceptados del periodo"}
            </button>
            {llenar607 && (
              <div className="text-sm text-slate-700 space-y-2">
                <p>
                  Incluidos: <strong>{llenar607.fuentes_incluidas.length}</strong>
                  {llenar607.fuentes_excluidas.length > 0 && (
                    <>
                      {" "}
                      · Excluidos: <strong>{llenar607.fuentes_excluidas.length}</strong>
                    </>
                  )}
                </p>
                {llenar607.fuentes_incluidas.length > 0 && (
                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-slate-600">
                          <th className="py-1 pr-2">#</th>
                          <th className="py-1 pr-2">Cliente</th>
                          <th className="py-1 pr-2">e-NCF</th>
                          <th className="py-1 pr-2 text-right">Monto</th>
                          <th className="py-1 pr-2 text-right">ITBIS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {llenar607.fuentes_incluidas.map((f) => (
                          <tr key={f.cotizacion_id} className="border-b border-slate-100">
                            <td className="py-1 pr-2">{f.number}</td>
                            <td className="py-1 pr-2">{f.client_name}</td>
                            <td className="py-1 pr-2 font-mono">{f.encf}</td>
                            <td className="py-1 pr-2 text-right">{money(f.subtotal)}</td>
                            <td className="py-1 pr-2 text-right">{money(f.itbis)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {llenar607.fuentes_excluidas.length > 0 && (
                  <details className="text-xs text-slate-600">
                    <summary className="cursor-pointer font-medium">
                      Ver excluidos del 607 ({llenar607.fuentes_excluidas.length})
                    </summary>
                    <ul className="mt-2 space-y-1 list-disc pl-4">
                      {llenar607.fuentes_excluidas.map((f) => (
                        <li key={f.cotizacion_id}>
                          #{f.number} {f.client_name} — {f.exclude_reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={!!actionLoading}
            className="rounded-lg bg-[#0b57d0] px-4 py-2 text-sm font-medium text-white hover:bg-[#0948ad] disabled:opacity-50"
          >
            {actionLoading === "download" ? "Generando…" : "Generar y descargar TXT"}
          </button>
          <button
            type="button"
            onClick={() => void handleEnviar()}
            disabled={!!actionLoading}
            className="rounded-lg border border-[#0b57d0] bg-white px-4 py-2 text-sm font-medium text-[#0b57d0] hover:bg-blue-50 disabled:opacity-50"
          >
            {actionLoading === "enviar" ? "Preparando…" : "Preparar envío a DGII"}
          </button>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          La DGII no ofrece API pública para 606/607. «Preparar envío» genera el TXT, lo guarda en el
          servidor y descarga una copia. Debe pre-validarlo con la herramienta oficial y subirlo en{" "}
          <a
            href="https://dgii.gov.do/ofv/"
            target="_blank"
            rel="noreferrer"
            className="text-[#0b57d0] underline"
          >
            Oficina Virtual
          </a>{" "}
          → Envío de datos.
        </p>

        {envioResult && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 space-y-2">
            <p className="font-semibold">Archivo listo: {envioResult.filename}</p>
            <p>{envioResult.message}</p>
            <p>
              <a
                href={envioResult.prevalidacion_url}
                target="_blank"
                rel="noreferrer"
                className="text-[#0b57d0] underline"
              >
                Pre-validación DGII
              </a>
            </p>
          </div>
        )}

        {tab === "606" && (
          <div className="border-t border-slate-100 pt-6 space-y-4">
            <div className="rounded-lg border border-amber-100 bg-amber-50/80 p-4 space-y-3">
              <p className="text-sm text-slate-800">
                <strong>606 — compras:</strong> no se generan solas desde sus ventas e-CF. Use el
                maestro de <strong>Clientes</strong> (proveedor) o copie montos de una venta como
                ayuda; siempre ingrese el NCF de la factura de compra del proveedor.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm block min-w-[12rem]">
                  Cliente / proveedor
                  <select
                    value={fillClientId}
                    onChange={(e) => setFillClientId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— Seleccionar —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.rnc_cedula})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => void handleBorradorCliente()}
                  disabled={!!actionLoading}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Llenar RNC desde cliente
                </button>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm block min-w-[14rem]">
                  Venta e-CF del periodo (solo montos)
                  <select
                    value={fillCotizacionId}
                    onChange={(e) => setFillCotizacionId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— Seleccionar —</option>
                    {cotizacionesPeriodo.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.number} {c.client_name} — tipo {c.ecf_tipo ?? "?"} (
                        {c.dgii_status ?? "—"})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => void handleBorradorCotizacion()}
                  disabled={!!actionLoading}
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  Copiar montos desde venta
                </button>
              </div>
              {borradorAviso && (
                <p className="text-xs text-amber-900 border border-amber-200 rounded-md px-3 py-2 bg-white/70">
                  {borradorAviso}
                </p>
              )}
            </div>

            <h3 className="text-sm font-semibold text-slate-900">
              Detalle de compras (plantilla DGII 606)
            </h3>
            <form onSubmit={(e) => void handleAddCompra(e)} className="space-y-5">
              <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <legend className="col-span-full text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Identificación
                </legend>
                <label className="text-sm">
                  RNC / cédula proveedor
                  <input
                    required
                    value={compraForm.rnc_cedula}
                    onChange={(e) => setCompraForm((f) => ({ ...f, rnc_cedula: e.target.value }))}
                    className={inputCls}
                  />
                </label>
                <label className="text-sm">
                  Tipo bienes y servicios
                  <select
                    value={compraForm.tipo_bienes_servicios}
                    onChange={(e) =>
                      setCompraForm((f) => ({ ...f, tipo_bienes_servicios: e.target.value }))
                    }
                    className={inputCls}
                  >
                    {DGII_606_TIPO_BIENES.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.code} — {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  NCF
                  <input
                    required
                    value={compraForm.ncf}
                    onChange={(e) => setCompraForm((f) => ({ ...f, ncf: e.target.value }))}
                    className={inputCls}
                  />
                </label>
                <label className="text-sm">
                  NCF / documento modificado
                  <input
                    value={compraForm.ncf_modificado}
                    onChange={(e) =>
                      setCompraForm((f) => ({ ...f, ncf_modificado: e.target.value }))
                    }
                    className={inputCls}
                  />
                </label>
                <label className="text-sm">
                  Fecha comprobante (AAAAMMDD)
                  <input
                    required
                    placeholder="20260510"
                    value={compraForm.fecha_comprobante}
                    onChange={(e) =>
                      setCompraForm((f) => ({ ...f, fecha_comprobante: e.target.value }))
                    }
                    className={inputCls}
                  />
                </label>
                <label className="text-sm">
                  Fecha pago (AAAAMMDD)
                  <input
                    placeholder="Opcional"
                    value={compraForm.fecha_pago}
                    onChange={(e) => setCompraForm((f) => ({ ...f, fecha_pago: e.target.value }))}
                    className={inputCls}
                  />
                </label>
              </fieldset>

              <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <legend className="col-span-full text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Montos facturados
                </legend>
                <label className="text-sm">
                  Monto en servicios
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={compraForm.monto_servicios}
                    onChange={(e) =>
                      setCompraForm((f) => ({ ...f, monto_servicios: e.target.value }))
                    }
                    className={inputCls}
                  />
                </label>
                <label className="text-sm">
                  Monto en bienes
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={compraForm.monto_bienes}
                    onChange={(e) => setCompraForm((f) => ({ ...f, monto_bienes: e.target.value }))}
                    className={inputCls}
                  />
                </label>
                <p className="text-xs text-slate-500 self-end pb-2">
                  Total = servicios + bienes (si deja ambos en 0, indique al menos uno).
                </p>
              </fieldset>

              <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <legend className="col-span-full text-xs font-semibold uppercase tracking-wide text-slate-500">
                  ITBIS
                </legend>
                {(
                  [
                    ["itbis_facturado", "ITBIS facturado"],
                    ["itbis_retenido", "ITBIS retenido"],
                    ["itbis_sujeto_proporcionalidad", "Sujeto proporcionalidad"],
                    ["itbis_llevado_al_costo", "Llevado al costo"],
                    ["itbis_por_adelantar", "Por adelantar"],
                    ["itbis_percibido_compras", "Percibido en compras"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="text-sm">
                    {label}
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={compraForm[key]}
                      onChange={(e) =>
                        setCompraForm((f) => ({ ...f, [key]: e.target.value }))
                      }
                      className={inputCls}
                    />
                  </label>
                ))}
              </fieldset>

              <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <legend className="col-span-full text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Retenciones e impuestos
                </legend>
                <label className="text-sm">
                  Tipo retención ISR
                  <select
                    value={compraForm.tipo_retencion_isr}
                    onChange={(e) =>
                      setCompraForm((f) => ({ ...f, tipo_retencion_isr: e.target.value }))
                    }
                    className={inputCls}
                  >
                    {DGII_606_TIPO_RET_ISR.map((t) => (
                      <option key={t.code || "none"} value={t.code}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Monto retención renta
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={compraForm.retencion_renta}
                    onChange={(e) =>
                      setCompraForm((f) => ({ ...f, retencion_renta: e.target.value }))
                    }
                    className={inputCls}
                  />
                </label>
                <label className="text-sm">
                  ISR percibido en compras
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={compraForm.isr_percibido_compras}
                    onChange={(e) =>
                      setCompraForm((f) => ({ ...f, isr_percibido_compras: e.target.value }))
                    }
                    className={inputCls}
                  />
                </label>
                <label className="text-sm">
                  Impuesto selectivo (ISC)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={compraForm.impuesto_isc}
                    onChange={(e) =>
                      setCompraForm((f) => ({ ...f, impuesto_isc: e.target.value }))
                    }
                    className={inputCls}
                  />
                </label>
                <label className="text-sm">
                  Otros impuestos / tasas
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={compraForm.impuestos_otros}
                    onChange={(e) =>
                      setCompraForm((f) => ({ ...f, impuestos_otros: e.target.value }))
                    }
                    className={inputCls}
                  />
                </label>
                <label className="text-sm">
                  Monto propina legal
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={compraForm.monto_propina_legal}
                    onChange={(e) =>
                      setCompraForm((f) => ({ ...f, monto_propina_legal: e.target.value }))
                    }
                    className={inputCls}
                  />
                </label>
                <label className="text-sm">
                  Forma de pago
                  <select
                    value={compraForm.forma_pago}
                    onChange={(e) => setCompraForm((f) => ({ ...f, forma_pago: e.target.value }))}
                    className={inputCls}
                  >
                    {DGII_606_FORMA_PAGO.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.code} — {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>

              <button
                type="submit"
                disabled={actionLoading === "compra"}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
              >
                {actionLoading === "compra" ? "Guardando…" : "Agregar al periodo"}
              </button>
            </form>

            {compras.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="py-2 pr-2">RNC</th>
                      <th className="py-2 pr-2">Tipo</th>
                      <th className="py-2 pr-2">NCF</th>
                      <th className="py-2 pr-2">Fecha</th>
                      <th className="py-2 pr-2 text-right">Total</th>
                      <th className="py-2 pr-2 text-right">ITBIS</th>
                      <th className="py-2 pr-2">Pago</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {compras.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100">
                        <td className="py-2 pr-2 font-mono">{c.rnc_cedula}</td>
                        <td className="py-2 pr-2">{c.tipo_bienes_servicios}</td>
                        <td className="py-2 pr-2 font-mono">{c.ncf}</td>
                        <td className="py-2 pr-2">{c.fecha_comprobante}</td>
                        <td className="py-2 pr-2 text-right">{money(c.monto_facturado)}</td>
                        <td className="py-2 pr-2 text-right">{money(c.itbis_facturado)}</td>
                        <td className="py-2 pr-2">{c.forma_pago}</td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => void handleDeleteCompra(c.id)}
                            disabled={actionLoading === `del-${c.id}`}
                            className="text-red-600 hover:underline disabled:opacity-50"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}
