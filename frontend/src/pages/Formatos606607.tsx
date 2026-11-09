import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeaderCard from "../components/PageHeaderCard";
import PageShell from "../components/PageShell";
import { ApiError } from "../services/api";
import {
  crearCompra606DesdeArchivo,
  deleteCompra606,
  downloadDgiiFormatoTxt,
  enviarDgiiFormato,
  listCompras606,
  llenar607DesdeEcf,
  previewDgiiFormato,
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

export default function Formatos606607() {
  const [tab, setTab] = useState<Tab>("607");
  const [periodo, setPeriodo] = useState(currentPeriodo);
  const [preview, setPreview] = useState<FormatoPreview | null>(null);
  const [compras, setCompras] = useState<Compra606Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [envioResult, setEnvioResult] = useState<FormatoEnvioResult | null>(null);
  const [llenar607, setLlenar607] = useState<Llenar607Result | null>(null);
  const [extraerFile, setExtraerFile] = useState<File | null>(null);
  const [textoDetectado, setTextoDetectado] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState("");

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

  const handleSubirFactura = async () => {
    if (!extraerFile) {
      setError("Seleccione una imagen o PDF de la factura de compra.");
      return;
    }
    setActionLoading("subir-factura");
    setError("");
    setSuccessMessage("");
    setTextoDetectado(null);
    try {
      const result = await crearCompra606DesdeArchivo(periodo, extraerFile);
      setSuccessMessage(
        `Gasto registrado: NCF ${result.compra.ncf}, total ${money(result.compra.monto_facturado)}.`,
      );
      setTextoDetectado(result.texto_detectado ?? null);
      setExtraerFile(null);
      await loadPreview();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        const texto = err.body?.texto_detectado;
        setTextoDetectado(typeof texto === "string" ? texto : null);
      } else {
        setError(err instanceof Error ? err.message : "No se pudo procesar el archivo.");
      }
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
        : "Origen: gastos de la empresa. Suba una foto o PDF de la factura de compra y se registra automáticamente.",
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
            <p className="text-xs text-slate-600">
              Cada e-CF solo se reporta una vez: si ya salió en un TXT generado antes (de este periodo
              o cualquier otro), no vuelve a aparecer en una generación nueva.
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
                <strong>606 — gastos de la empresa:</strong> suba una foto o PDF de la factura de
                compra; el sistema lee el RNC, NCF, fecha, montos e ITBIS y la registra directo.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm block min-w-[16rem]">
                  Imagen o PDF de la factura de compra
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setExtraerFile(e.target.files?.[0] ?? null)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void handleSubirFactura()}
                  disabled={!!actionLoading}
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {actionLoading === "subir-factura" ? "Procesando…" : "Subir y registrar gasto"}
                </button>
              </div>
              {successMessage && (
                <p className="text-xs text-emerald-900 border border-emerald-200 rounded-md px-3 py-2 bg-white/70">
                  {successMessage}
                </p>
              )}
              {textoDetectado && (
                <details className="text-xs text-slate-600">
                  <summary className="cursor-pointer font-medium">Ver texto detectado (OCR)</summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded-md border border-slate-200 bg-white/70 p-2">
                    {textoDetectado}
                  </pre>
                </details>
              )}
            </div>

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
