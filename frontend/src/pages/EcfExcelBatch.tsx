import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { AuthCompany } from "../types/session";
import { ApiError, apiUrl } from "../services/api";
import {
  runEcfExcelBatchFromApp,
  sendEcfExcelBatchToDgiiFromApp,
  type EcfExcelBatchRunResponse,
  type EcfExcelBatchSendResponse,
} from "../services/ecfExcelBatch";

export default function EcfExcelBatch({ company }: { company: AuthCompany }) {
  const [desktopPreview, setDesktopPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EcfExcelBatchRunResponse | null>(null);
  const [sendError, setSendError] = useState("");
  const [sendResult, setSendResult] = useState<EcfExcelBatchSendResponse | null>(null);
  const [sendDebug, setSendDebug] = useState("");

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
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">
          Casos de prueba DGII (Excel)
        </h1>
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
        {result?.ok ? (
          <button
            type="button"
            onClick={() => void sendBatch()}
            disabled={loading || sending}
            className="w-full sm:w-auto rounded-lg bg-[#0b57d0] text-white px-5 py-2.5 text-sm font-medium shadow hover:bg-[#0a4fc4] disabled:opacity-60 transition"
          >
            {sending ? "Enviando a DGII…" : "Enviar firmados a DGII"}
          </button>
        ) : null}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
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
                    {s.file}: <span className="font-medium">{s.trackId}</span> ({s.status})
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
    </div>
  );
}
