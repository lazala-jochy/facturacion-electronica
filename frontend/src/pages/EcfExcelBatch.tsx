import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { AuthCompany } from "../types/session";
import { ApiError, apiUrl } from "../services/api";
import {
  runEcfExcelBatchFromApp,
  sendEcfExcelBatchToDgiiFromApp,
  consultEcfExcelBatchStatus,
  sendRfceToDgii,
  type EcfExcelBatchRunResponse,
  type EcfExcelBatchSendResponse,
  type EcfBatchConsultResponse,
  type RfceSendResponse,
} from "../services/ecfExcelBatch";
import {
  exportPortalConsumoMenor250FromApp,
  type PortalConsumoMenor250ExportResponse,
} from "../services/portalConsumoMenor250";
import DgiiEcfUrlsPanel from "../components/DgiiEcfUrlsPanel";

export default function EcfExcelBatch({
  company,
  onCompanyUpdated,
}: {
  company: AuthCompany;
  onCompanyUpdated?: (company: AuthCompany) => void;
}) {
  const [desktopPreview, setDesktopPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EcfExcelBatchRunResponse | null>(null);
  const [sendError, setSendError] = useState("");
  const [sendResult, setSendResult] = useState<EcfExcelBatchSendResponse | null>(null);
  const [sendDebug, setSendDebug] = useState("");
  const [consulting, setConsulting] = useState(false);
  const [consultResult, setConsultResult] = useState<EcfBatchConsultResponse | null>(null);
  const [consultError, setConsultError] = useState("");
  const [sendingRfce, setSendingRfce] = useState(false);
  const [rfceResult, setRfceResult] = useState<RfceSendResponse | null>(null);
  const [rfceError, setRfceError] = useState("");
  const [portalExportLoading, setPortalExportLoading] = useState(false);
  const [portalExportError, setPortalExportError] = useState("");
  const [portalExportResult, setPortalExportResult] =
    useState<PortalConsumoMenor250ExportResponse | null>(null);

  const electron = window.electronAPI;
  const canUseFolderPicker = !!electron?.pickOutputParentFolder;

  const browseFolder = async () => {
    if (!electron?.pickOutputParentFolder) return;
    const chosen = await electron.pickOutputParentFolder();
    if (chosen) setDesktopPreview(chosen);
  };

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.getDesktopParentPath) return;
    void api.getDesktopParentPath().then(setDesktopPreview);
  }, []);

  const hintSubtitle = useMemo(
    () =>
      'Se usa el primer .xlsx de la carpeta de prueba del instalador/assets (hojas "eCF" y opcional "rFCE"). La firma usa el certificado guardado en Perfil de empresa.',
    [],
  );

  const testStatusLabel = (status?: string) => {
    if (status === "accepted") return "Prueba aceptada";
    if (status === "rejected") return "Prueba rechazada";
    if (status === "pending") return "Pendiente de procesamiento";
    return "Estado no confirmado";
  };

  const testStatusClass = (status?: string) => {
    if (status === "accepted") return "text-emerald-700";
    if (status === "rejected") return "text-red-700";
    if (status === "pending") return "text-amber-700";
    return "text-slate-600";
  };

  const ncfTypeLabel = (encf: string) => {
    const code = encf.slice(1, 3);
    const labels: Record<string, string> = {
      "31": "Crédito Fiscal",
      "32": "Consumo",
      "33": "Nota Débito",
      "34": "Nota Crédito",
      "41": "Compras",
      "43": "Gastos Menores",
      "44": "Reg. Especiales",
      "45": "Gubernamental",
      "46": "Exportaciones",
      "47": "Pago Exterior",
    };
    return labels[code] ?? code;
  };

  const consultBatch = async () => {
    if (!result?.outSignedDir) return;
    setConsulting(true);
    setConsultError("");
    setConsultResult(null);
    try {
      const data = await consultEcfExcelBatchStatus({
        out_signed_dir: result.outSignedDir,
      });
      setConsultResult(data);
    } catch (e) {
      setConsultError(
        e instanceof Error ? e.message : "Error al consultar estado DGII.",
      );
    } finally {
      setConsulting(false);
    }
  };

  const sendRfce = async () => {
    const rfceDir = result?.rfce?.outSignedDir;
    if (!rfceDir) return;
    setSendingRfce(true);
    setRfceError("");
    setRfceResult(null);
    try {
      const data = await sendRfceToDgii({ rfce_signed_dir: rfceDir });
      setRfceResult(data);
    } catch (e) {
      setRfceError(e instanceof Error ? e.message : "Error al enviar RFCE a DGII.");
    } finally {
      setSendingRfce(false);
    }
  };

  const runBatch = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    setSendError("");
    setSendResult(null);
    setSendDebug("");
    try {
      let desktop_parent_dir = desktopPreview.trim() || undefined;
      if (electron?.getDesktopParentPath && !desktop_parent_dir) {
        desktop_parent_dir = await electron.getDesktopParentPath();
      }
      const data = await runEcfExcelBatchFromApp({
        desktop_parent_dir,
      });
      setResult(data);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "Error al generar los archivos.");
      }
    } finally {
      setLoading(false);
    }
  };

  const exportPortalConsumoMenor250 = async () => {
    setPortalExportLoading(true);
    setPortalExportError("");
    setPortalExportResult(null);
    try {
      let desktop_parent_dir = desktopPreview.trim() || undefined;
      if (electron?.getDesktopParentPath && !desktop_parent_dir) {
        desktop_parent_dir = await electron.getDesktopParentPath();
      }
      const data = await exportPortalConsumoMenor250FromApp({ desktop_parent_dir });
      setPortalExportResult(data);
    } catch (e) {
      setPortalExportError(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Error al exportar.",
      );
    } finally {
      setPortalExportLoading(false);
    }
  };

  const sendBatch = async () => {
    if (!result?.outSignedDir) return;
    setSending(true);
    setSendError("");
    setSendResult(null);
    setSendDebug("");
    try {
      const data = await sendEcfExcelBatchToDgiiFromApp({
        out_signed_dir: result.outSignedDir,
      });
      setSendResult(data);
    } catch (e) {
      if (e instanceof ApiError) {
        setSendError(e.message);
        const bodyJson = e.body ? JSON.stringify(e.body, null, 2) : "(sin body JSON)";
        const reqJson = JSON.stringify(
          {
            method: "POST",
            url: `${apiUrl}/ecf-excel-batch/send`,
            payload: { out_signed_dir: result.outSignedDir },
          },
          null,
          2,
        );
        setSendDebug(
          [`[REQUEST]`, reqJson, `[RESPONSE] status=${e.status}`, bodyJson].join("\n"),
        );
      } else {
        setSendError(e instanceof Error ? e.message : "Error al enviar firmados a DGII.");
        setSendDebug(
          [
            "[REQUEST]",
            JSON.stringify(
              {
                method: "POST",
                url: `${apiUrl}/ecf-excel-batch/send`,
                payload: { out_signed_dir: result.outSignedDir },
              },
              null,
              2,
            ),
            "[RESPONSE]",
            e instanceof Error ? e.stack || e.message : "Error desconocido.",
          ].join("\n"),
        );
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">Pruebas de Datos e-CF (Excel)</h2>
        <p className="mt-2 text-sm text-slate-600">{hintSubtitle}</p>
      </header>

      {!company.certificateConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 space-y-2">
          <p>
            Primero subí el certificado DGII (.p12 o .pfx) y su contraseña en Perfil de empresa; el servidor los
            guarda cifrados y los usa aquí junto con la clave de cifrado persistida para tu empresa.
          </p>
          <Link
            to="/company-profile"
            className="inline-block font-medium text-amber-900 underline hover:no-underline"
          >
            Ir a Perfil de empresa
          </Link>
        </div>
      )}

      <DgiiEcfUrlsPanel company={company} onCompanyUpdated={onCompanyUpdated} />

      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="ecf-batch-desktop">
            Carpeta donde guardar los resultados
          </label>
          <p className="text-xs text-slate-500">
            Aquí se creará una carpeta nueva (p. ej. ECF-DGII-Pruebas-…) con xml/ y firmados/.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <input
              id="ecf-batch-desktop"
              type="text"
              placeholder={
                canUseFolderPicker
                  ? "Tocá «Explorar» o pegá/edita la ruta…"
                  : "Ruta absoluta del Escritorio o carpeta donde guardar"
              }
              className="flex-1 min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white"
              value={desktopPreview}
              onChange={(e) => setDesktopPreview(e.target.value)}
            />
            {canUseFolderPicker ? (
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void browseFolder()}
                  disabled={loading}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                >
                  Explorar carpeta…
                </button>
                <button
                  type="button"
                  onClick={() => void electron?.getDesktopParentPath().then(setDesktopPreview)}
                  disabled={loading}
                  className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 whitespace-nowrap"
                >
                  Escritorio por defecto
                </button>
              </div>
            ) : null}
          </div>
          {!canUseFolderPicker && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              En el navegador hay que pegar la ruta completa a mano (o vacío si el servidor detecta ~/Desktop /
              ~/Escritorio). En la app de escritorio aparece «Explorar carpeta».
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => void runBatch()}
          disabled={loading}
          className="w-full sm:w-auto rounded-lg bg-[#15803d] text-white px-5 py-2.5 text-sm font-medium shadow hover:bg-[#166534] disabled:opacity-60 transition"
        >
          {loading ? "Generando…" : "Generar en el Escritorio"}
        </button>

        <div className="rounded-lg border border-blue-200 bg-blue-50/80 p-4 space-y-3">
          <p className="text-sm font-medium text-blue-950">
            CerteCF — Facturas de consumo &lt; 250Mil (exportación aislada)
          </p>
          <p className="text-xs text-blue-900 leading-relaxed">
            Solo si aún no enviaste RFCE. Si ya tenés resúmenes aceptados, subí los XML de{" "}
            <code className="bg-white/80 px-1 rounded">consumo-integras-firmados/</code> del mismo lote (misma firma).
            Una exportación nueva cambia la firma y DGII rechaza con error genérico.
          </p>
          <button
            type="button"
            onClick={() => void exportPortalConsumoMenor250()}
            disabled={loading || portalExportLoading || !company.certificateConfigured}
            className="w-full sm:w-auto rounded-lg bg-[#0b57d0] text-white px-5 py-2.5 text-sm font-medium shadow hover:bg-[#0a4fc4] disabled:opacity-60 transition"
          >
            {portalExportLoading
              ? "Exportando…"
              : "Exportar Facturas Consumo <250k"}
          </button>
          {!company.certificateConfigured && (
            <p className="text-xs text-amber-800">Configurá el certificado en Perfil de empresa primero.</p>
          )}
        </div>

        {result?.ok ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void sendBatch()}
              disabled={loading || sending || consulting || sendingRfce}
              className="w-full sm:w-auto rounded-lg bg-[#0b57d0] text-white px-5 py-2.5 text-sm font-medium shadow hover:bg-[#0a4fc4] disabled:opacity-60 transition"
            >
              {sending ? "Enviando a DGII…" : "Enviar firmados a DGII"}
            </button>
            {result.rfce && result.rfce.ok > 0 && (
              <button
                type="button"
                onClick={() => void sendRfce()}
                disabled={loading || sending || consulting || sendingRfce}
                className="w-full sm:w-auto rounded-lg bg-amber-600 text-white px-5 py-2.5 text-sm font-medium shadow hover:bg-amber-700 disabled:opacity-60 transition"
              >
                {sendingRfce ? "Enviando RFCE…" : `Enviar ${result.rfce.ok} resúmenes consumo`}
              </button>
            )}
            <button
              type="button"
              onClick={() => void consultBatch()}
              disabled={loading || sending || consulting || sendingRfce}
              className="w-full sm:w-auto rounded-lg bg-slate-700 text-white px-5 py-2.5 text-sm font-medium shadow hover:bg-slate-800 disabled:opacity-60 transition"
            >
              {consulting ? "Consultando…" : "Consultar estado DGII"}
            </button>
          </div>
        ) : null}
      </div>

      {portalExportError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {portalExportError}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {portalExportResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 sm:p-5 shadow-sm space-y-2 text-sm">
          <p className="font-medium text-emerald-900">4 facturas listas para «Facturas de consumo &lt; 250Mil»</p>
          <p className="text-xs text-slate-700 break-all">
            Carpeta:{" "}
            <code className="bg-white/90 px-1 rounded">{portalExportResult.portalSignedDir}</code>
          </p>
          {portalExportResult.zipPath && (
            <p className="text-xs text-slate-700 break-all">
              ZIP: <code className="bg-white/90 px-1 rounded">{portalExportResult.zipPath}</code>
            </p>
          )}
          <ul className="text-xs list-disc ml-5 space-y-0.5">
            {portalExportResult.files.map((f) => (
              <li key={f.encf}>
                <code className="bg-white/90 px-1 rounded">{f.file}</code> — {f.encf}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-3">
          {result.message && (
            <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {result.message}
            </p>
          )}
          <p
            className={`text-sm font-medium ${
              result.ok === 0 && result.fail > 0 ? "text-red-800" : "text-slate-900"
            }`}
          >
            {result.ok > 0
              ? `Listo: ${result.ok} generados correctamente${result.fail > 0 ? ` · ${result.fail} con error` : ""}.`
              : `Falló todo el lote (${result.fail} error${result.fail === 1 ? "" : "es"}).`}
          </p>
          <p className="text-sm text-slate-700">
            Carpeta principal:{" "}
            <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded break-all">{result.outputRoot}</code>
          </p>
          <ul className="text-xs text-slate-600 list-disc ml-5 space-y-1">
            <li>
              XML sin firmar: <code className="bg-slate-100 px-1 rounded">{result.outXmlDir}</code>
            </li>
            <li>
              XML firmados: <code className="bg-slate-100 px-1 rounded">{result.outSignedDir}</code>
            </li>
          </ul>
          {result.rfce && result.rfce.rowCount > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 space-y-1">
              <div>
                <span className="font-medium">RFCE (Resúmenes Consumo &lt; 250K):</span>{" "}
                {result.rfce.ok} generados{result.rfce.fail > 0 ? ` · ${result.rfce.fail} con error` : ""}
                <br />
                <code className="text-xs bg-amber-100 px-1 rounded">{result.rfce.outSignedDir}</code>
              </div>
              {result.rfce.consumoIntegrasSignedDir && (
                <div>
                  <span className="font-medium">Portal — Facturas consumo &lt; 250Mil:</span> subí estos 4 XML
                  (después de RFCE aceptados):
                  <br />
                  <code className="text-xs bg-amber-100 px-1 rounded break-all">
                    {result.rfce.consumoIntegrasSignedDir}
                  </code>
                </div>
              )}
            </div>
          )}
          {result.failures?.length ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-red-700 font-medium">Filas con error</summary>
              <ul className="mt-2 space-y-1 text-xs">
                {result.failures.map((f) => (
                  <li key={`${f.row}-${f.enf ?? ""}-${f.error.slice(0, 40)}`}>
                    Fila {f.row} {f.enf ? `(${f.enf})` : ""}: {f.error}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-700 font-medium">Registro técnico</summary>
            <pre className="mt-2 max-h-60 overflow-auto text-xs bg-slate-50 rounded-md p-3 border border-slate-100 whitespace-pre-wrap">
              {result.logs.join("\n")}
            </pre>
          </details>
        </div>
      )}

      {sendError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 space-y-2">
          <p>{sendError}</p>
          {sendDebug ? (
            <details className="text-xs">
              <summary className="cursor-pointer font-medium">Ver error completo de la solicitud</summary>
              <pre className="mt-2 max-h-80 overflow-auto text-xs bg-red-100 rounded-md p-3 border border-red-200 whitespace-pre-wrap">
                {sendDebug}
              </pre>
            </details>
          ) : null}
        </div>
      )}

      {sendResult && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-3">
          {sendResult.testSummary ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <p className="font-medium text-slate-900">Estado de pruebas DGII</p>
              <p className="mt-1 text-xs text-slate-700">
                Aceptadas: <span className="font-semibold text-emerald-700">{sendResult.testSummary.accepted}</span>{" "}
                · Rechazadas: <span className="font-semibold text-red-700">{sendResult.testSummary.rejected}</span>{" "}
                · Pendientes: <span className="font-semibold text-amber-700">{sendResult.testSummary.pending}</span>{" "}
                · Sin confirmar: <span className="font-semibold text-slate-600">{sendResult.testSummary.unknown}</span>
              </p>
            </div>
          ) : null}
          <p
            className={`text-sm font-medium ${
              sendResult.ok === 0 && sendResult.fail > 0 ? "text-red-800" : "text-slate-900"
            }`}
          >
            {sendResult.ok > 0
              ? `DGII: ${sendResult.ok} enviados correctamente${sendResult.fail > 0 ? ` · ${sendResult.fail} con error` : ""}.`
              : `DGII rechazó o falló todo el lote (${sendResult.fail} error${sendResult.fail === 1 ? "" : "es"}).`}
          </p>
          <p className="text-xs text-slate-600">
            Carpeta enviada: <code className="bg-slate-100 px-1 rounded break-all">{sendResult.outSignedDir}</code>
          </p>
          {sendResult.successes.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-emerald-700 font-medium">Enviados (trackId)</summary>
              <ul className="mt-2 space-y-1 text-xs">
                {sendResult.successes.map((s) => (
                  <li key={`${s.file}-${s.trackId}`}>
                    {s.file}: <span className="font-medium">{s.trackId}</span> ({s.status}) ·{" "}
                    <span className={`font-semibold ${testStatusClass(s.testStatus)}`}>
                      {testStatusLabel(s.testStatus)}
                    </span>
                    {s.testMessage ? (
                      <span className="block pl-3 text-slate-500">{s.testMessage}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {sendResult.failures.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-red-700 font-medium">Errores de envío</summary>
              <ul className="mt-2 space-y-1 text-xs">
                {sendResult.failures.map((f) => (
                  <li key={`${f.file}-${f.code ?? ""}-${f.error.slice(0, 30)}`}>
                    {f.file}: {f.error}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-700 font-medium">Log de envío DGII</summary>
            <pre className="mt-2 max-h-60 overflow-auto text-xs bg-slate-50 rounded-md p-3 border border-slate-100 whitespace-pre-wrap">
              {sendResult.logs.join("\n")}
            </pre>
          </details>
        </div>
      )}

      {rfceError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {rfceError}
        </div>
      )}

      {rfceResult && (
        <div className="rounded-xl border border-amber-200 bg-white p-4 sm:p-5 shadow-sm space-y-3">
          <h2 className="text-base font-semibold text-amber-900">
            RFCE — Resúmenes de Consumo
          </h2>
          <p className="text-sm text-slate-800">
            {rfceResult.ok} enviados{rfceResult.fail > 0 ? ` · ${rfceResult.fail} con error` : ""}{" "}
            · Aceptados: <span className="font-semibold text-emerald-700">{rfceResult.testSummary.accepted}</span>{" "}
            · Rechazados: <span className="font-semibold text-red-700">{rfceResult.testSummary.rejected}</span>
          </p>
          {rfceResult.successes.length > 0 && (
            <div className="overflow-x-auto -mx-4 sm:-mx-5">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-amber-200 bg-amber-50 text-left text-amber-800">
                    <th className="px-4 py-2 font-medium">eNCF</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                    <th className="px-3 py-2 font-medium">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {rfceResult.successes.map((s) => (
                    <tr key={s.encf || s.file} className="hover:bg-amber-50/40">
                      <td className="px-4 py-2.5 font-mono font-medium text-slate-900">{s.encf || s.file}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                          s.testStatus === "accepted"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : s.testStatus === "rejected"
                              ? "bg-red-50 text-red-800 border-red-200"
                              : "bg-amber-50 text-amber-800 border-amber-200"
                        }`}>
                          {s.testStatus === "accepted" ? "Aceptado" : s.testStatus === "rejected" ? "Rechazado" : "Pendiente"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 max-w-xs">{s.testMessage || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rfceResult.failures.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-red-700 font-medium">Errores RFCE</summary>
              <ul className="mt-2 space-y-1 text-xs">
                {rfceResult.failures.map((f) => (
                  <li key={f.file}>{f.file}: {f.error}</li>
                ))}
              </ul>
            </details>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-700 font-medium">Log RFCE</summary>
            <pre className="mt-2 max-h-40 overflow-auto text-xs bg-slate-50 rounded-md p-3 border border-slate-100 whitespace-pre-wrap">
              {rfceResult.logs.join("\n")}
            </pre>
          </details>
        </div>
      )}

      {consultError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {consultError}
        </div>
      )}

      {consultResult && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Estado DGII — {consultResult.total} comprobantes
            </h2>
            <div className="flex gap-3 text-xs font-medium">
              <span className="text-emerald-700">{consultResult.testSummary.accepted} aceptados</span>
              <span className="text-red-700">{consultResult.testSummary.rejected} rechazados</span>
              {consultResult.testSummary.pending > 0 && (
                <span className="text-amber-700">{consultResult.testSummary.pending} pendientes</span>
              )}
              {consultResult.testSummary.unknown > 0 && (
                <span className="text-slate-500">{consultResult.testSummary.unknown} sin confirmar</span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto -mx-4 sm:-mx-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                  <th className="px-4 py-2 font-medium">eNCF</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Fecha recepción</th>
                  <th className="px-3 py-2 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {consultResult.results
                  .slice()
                  .sort((a, b) => a.encf.localeCompare(b.encf))
                  .map((r) => {
                    const statusColor =
                      r.status === "accepted"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : r.status === "rejected"
                          ? "bg-red-50 text-red-800 border-red-200"
                          : r.status === "pending"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-slate-50 text-slate-600 border-slate-200";
                    const statusLabel =
                      r.status === "accepted"
                        ? "Aceptado"
                        : r.status === "rejected"
                          ? "Rechazado"
                          : r.status === "pending"
                            ? "Pendiente"
                            : r.status === "already_used"
                              ? "Ya utilizado"
                              : "Sin confirmar";
                    return (
                      <tr key={r.encf} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 font-mono font-medium text-slate-900">{r.encf}</td>
                        <td className="px-3 py-2.5 text-slate-700">{ncfTypeLabel(r.encf)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusColor}`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{r.fechaRecepcion || "—"}</td>
                        <td className="px-3 py-2.5 text-slate-600 max-w-xs">
                          {r.mensajes.length > 0 ? (
                            <ul className="space-y-0.5">
                              {r.mensajes.map((m, i) => (
                                <li key={i}>{m}</li>
                              ))}
                            </ul>
                          ) : (
                            r.dgiiEstado || "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
