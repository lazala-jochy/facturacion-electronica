import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { AuthCompany } from "../types/session";
import { ApiError } from "../services/api";
import AcecfExcelSelector from "../components/AcecfExcelSelector";
import {
  DGII_ACECF_CASE_COUNT,
  DGII_AUTH_URL_PLACEHOLDER,
  DGII_COMMERCIAL_APPROVAL_URL_PLACEHOLDER,
  DGII_PORTAL_CERT_URL,
  acecfStatusLabel,
  companyAcecfDgiiUrls,
  countByStatus,
  loadAcecfProgress,
  saveAcecfProgress,
  saveDgiiAcecfUrls,
  type AcecfCaseStatus,
  type AcecfExcelSelection,
  type AcecfProgress,
} from "../services/dgiiAprobacionesComerciales";

const CASE_HINTS: Record<number, string> = {
  1: "Aprobación sobre e-CF de consumo (< RD$250k) ya recibido por DGII.",
  2: "Verificar RNC emisor/comprador y eNCF del escenario del Excel oficial.",
  3: "Montos y fechas deben coincidir con la fila del set de pruebas.",
  4: "Estado de aprobación coherente con la condición del caso.",
  5: "No alterar columnas ni formato del Excel de DGII.",
  6: "El e-CF referenciado debe existir en el ambiente CerteCF.",
  7: "Revisar tipo e-CF 32, 41 o 43 según indique el caso.",
  8: "XML raíz ACECF, firmado con el certificado de la empresa.",
  9: "Enviar por POST multipart al servicio de aprobación comercial.",
  10: "Consultar resultado en portal o respuesta del servicio.",
  11: "Último caso: confirmar 11/11 antes de avanzar en CerteCF.",
};

function statusSelectClass(status: AcecfCaseStatus): string {
  const base = "rounded-md border px-2 py-1 text-xs font-medium ";
  switch (status) {
    case "aprobado":
      return base + "border-emerald-300 bg-emerald-50 text-emerald-800";
    case "rechazado":
      return base + "border-red-300 bg-red-50 text-red-800";
    case "observado":
      return base + "border-amber-300 bg-amber-50 text-amber-900";
    case "enviado":
      return base + "border-blue-300 bg-blue-50 text-blue-900";
    default:
      return base + "border-slate-300 bg-white text-slate-700";
  }
}

export default function DgiiAprobacionesComerciales({
  company,
  onCompanyUpdated,
}: {
  company: AuthCompany;
  onCompanyUpdated?: (company: AuthCompany) => void;
}) {
  const [progress, setProgress] = useState<AcecfProgress>(() => loadAcecfProgress(company.id));
  const [notes, setNotes] = useState(progress.notes ?? "");
  const [dgiiUrls, setDgiiUrls] = useState(() => companyAcecfDgiiUrls(company));
  const [urlSaving, setUrlSaving] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [urlSuccess, setUrlSuccess] = useState("");

  useEffect(() => {
    setDgiiUrls(companyAcecfDgiiUrls(company));
  }, [company]);
  const counts = useMemo(() => countByStatus(progress), [progress]);
  const allApproved = counts.aprobado === DGII_ACECF_CASE_COUNT;

  const persist = useCallback(
    (next: AcecfProgress) => {
      setProgress(next);
      saveAcecfProgress(company.id, next);
    },
    [company.id],
  );

  const setCaseStatus = (caseNum: number, status: AcecfCaseStatus) => {
    const key = String(caseNum);
    persist({
      ...progress,
      cases: { ...progress.cases, [key]: status },
      notes,
    });
  };

  const saveNotes = () => {
    persist({ ...progress, notes });
  };

  const markAllApproved = () => {
    const cases: Record<string, AcecfCaseStatus> = {};
    for (let i = 1; i <= DGII_ACECF_CASE_COUNT; i++) cases[String(i)] = "aprobado";
    persist({ cases, notes });
  };

  const resetProgress = () => {
    if (!window.confirm("¿Borrar el seguimiento local de los 11 casos?")) return;
    persist({ cases: {}, notes: "" });
    setNotes("");
  };

  const handleExcelSelect = (excel: AcecfExcelSelection) => {
    persist({ ...progress, excel, notes });
  };

  const handleExcelClear = () => {
    const { excel: _removed, ...rest } = progress;
    persist({ ...rest, notes });
  };

  const saveDgiiUrls = async () => {
    setUrlSaving(true);
    setUrlError("");
    setUrlSuccess("");
    try {
      for (const [label, value] of [
        ["autenticación", dgiiUrls.authUrl],
        ["aprobación comercial", dgiiUrls.commercialApprovalUrl],
      ] as const) {
        if (!value.trim()) {
          throw new Error(`Completá la URL de ${label}.`);
        }
        try {
          new URL(value.trim());
        } catch {
          throw new Error(`La URL de ${label} no es válida (https://...).`);
        }
      }
      const res = await saveDgiiAcecfUrls(dgiiUrls);
      onCompanyUpdated?.(res.company);
      setDgiiUrls(companyAcecfDgiiUrls(res.company));
      setUrlSuccess("URLs DGII guardadas para esta empresa.");
    } catch (e) {
      setUrlError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setUrlSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">Aprobaciones Comerciales (ACECF)</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Envío de los <strong>11 XML de Aprobación Comercial (ACECF)</strong> del set oficial DGII.
          Cada ACECF debe referenciar un e-CF ya recibido/aceptado en el ambiente de certificación.
        </p>
      </header>

      <AcecfExcelSelector
        selection={progress.excel}
        onSelect={handleExcelSelect}
        onClear={handleExcelClear}
      />

      {!company.certificateConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 space-y-2">
          <p>Configurá el certificado DGII en Perfil de empresa antes de firmar y enviar ACECF.</p>
          <Link
            to="/company-profile"
            className="inline-block font-medium text-amber-900 underline hover:no-underline"
          >
            Ir a Perfil de empresa
          </Link>
        </div>
      )}

      <div
        className={`rounded-xl border p-4 sm:p-5 shadow-sm ${
          allApproved ? "border-emerald-200 bg-emerald-50/80" : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">Progreso local (seguimiento manual)</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[#0b57d0]">
              {counts.aprobado} / {DGII_ACECF_CASE_COUNT} aprobados
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
              Pendientes: {counts.pendiente}
            </span>
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-900">
              Enviados: {counts.enviado}
            </span>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">
              Observados: {counts.observado}
            </span>
            <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-800">
              Rechazados: {counts.rechazado}
            </span>
          </div>
        </div>
        {allApproved && (
          <p className="mt-3 text-sm font-medium text-emerald-800">
            Los 11 casos están marcados como aprobados en esta app. Confirmá el estado en el portal CerteCF.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Antes de empezar</h2>
        <ol className="list-decimal ml-5 space-y-2 text-sm text-slate-700">
          <li>
            Completar las <strong>Pruebas de Datos e-CF</strong> (recepción de comprobantes, RFCE y facturas
            consumo &lt; 250Mil) en{" "}
            <Link to="/dgii-pruebas/ecf-excel" className="font-medium text-[#0b57d0] hover:underline">
              Pruebas de Datos e-CF (Excel)
            </Link>
            .
          </li>
          <li>
            Descargar del{" "}
            <a
              href={DGII_PORTAL_CERT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#0b57d0] hover:underline"
            >
              portal CerteCF
            </a>{" "}
            el Excel oficial y seleccionarlo arriba (11 filas; no modificar columnas ni orden).
          </li>
          <li>
            Generar y firmar un XML <code className="text-xs bg-slate-100 px-1 rounded">ACECF</code> por cada fila,
            referenciando el eNCF del escenario.
          </li>
          <li>
            Enviar cada ACECF al servicio de recepción (POST, Bearer, multipart) y registrar el resultado abajo.
          </li>
        </ol>
      </div>

      <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 sm:p-5 shadow-sm space-y-3 text-sm">
        <h2 className="font-semibold text-indigo-950">Servicios DGII — Aprobación comercial (ACECF)</h2>
        <p className="text-indigo-900 text-xs leading-relaxed">
          Autenticación (semilla/token) y recepción ACECF para las pruebas de esta empresa. Usuario y contraseña DGII en{" "}
          <Link to="/company-profile" className="font-medium text-[#0b57d0] hover:underline">
            Perfil de empresa
          </Link>
          .
        </p>

        <div>
          <label htmlFor="acecf-dgii-auth-url" className="block text-xs font-medium text-indigo-950">
            Servicio de autenticación
          </label>
          <input
            id="acecf-dgii-auth-url"
            type="url"
            value={dgiiUrls.authUrl}
            onChange={(e) => {
              setDgiiUrls((prev) => ({ ...prev, authUrl: e.target.value }));
              setUrlError("");
              setUrlSuccess("");
            }}
            placeholder={DGII_AUTH_URL_PLACEHOLDER}
            className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#0b57d0] focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div>
          <label htmlFor="acecf-dgii-url" className="block text-xs font-medium text-indigo-950">
            Recepción aprobación comercial (ACECF)
          </label>
          <input
            id="acecf-dgii-url"
            type="url"
            value={dgiiUrls.commercialApprovalUrl}
            onChange={(e) => {
              setDgiiUrls((prev) => ({ ...prev, commercialApprovalUrl: e.target.value }));
              setUrlError("");
              setUrlSuccess("");
            }}
            placeholder={DGII_COMMERCIAL_APPROVAL_URL_PLACEHOLDER}
            className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#0b57d0] focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <button
          type="button"
          onClick={() => void saveDgiiUrls()}
          disabled={urlSaving}
          className="rounded-lg bg-[#0b57d0] px-4 py-2 text-sm font-medium text-white shadow hover:bg-[#0a4fc4] disabled:opacity-60"
        >
          {urlSaving ? "Guardando…" : "Guardar URLs DGII"}
        </button>
        {urlError && (
          <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{urlError}</p>
        )}
        {urlSuccess && (
          <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {urlSuccess}
          </p>
        )}
        <p className="text-xs text-indigo-800">
          Códigos frecuentes: <strong>1</strong> aceptado · <strong>2</strong> rechazado ·{" "}
          <strong>4</strong> aceptado condicional. Error <strong>02</strong>: el e-CF base no está en CerteCF.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <h2 className="text-sm font-semibold text-slate-900">11 casos de prueba (ACECF)</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={markAllApproved}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
            >
              Marcar todos aprobados
            </button>
            <button
              type="button"
              onClick={resetProgress}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Reiniciar seguimiento
            </button>
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {Array.from({ length: DGII_ACECF_CASE_COUNT }, (_, i) => i + 1).map((caseNum) => {
            const status = progress.cases[String(caseNum)] ?? "pendiente";
            return (
              <li
                key={caseNum}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">Caso {caseNum}</p>
                  <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                    {CASE_HINTS[caseNum] ?? "Seguir instrucciones del Excel oficial DGII."}
                  </p>
                </div>
                <select
                  value={status}
                  onChange={(e) => setCaseStatus(caseNum, e.target.value as AcecfCaseStatus)}
                  className={statusSelectClass(status)}
                  aria-label={`Estado caso ${caseNum}`}
                >
                  {(["pendiente", "enviado", "aprobado", "observado", "rechazado"] as const).map((s) => (
                    <option key={s} value={s}>
                      {acecfStatusLabel(s)}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-3">
        <label htmlFor="acecf-notes" className="block text-sm font-medium text-slate-700">
          Notas / respuestas DGII
        </label>
        <textarea
          id="acecf-notes"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Pegá códigos de error, eNCF rechazados o mensajes del portal…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0b57d0] focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <p className="text-xs text-slate-500">
          RNC emisor: <span className="font-mono">{company.rnc}</span>
          {progress.updatedAt && (
            <>
              {" "}
              · Última actualización: {new Date(progress.updatedAt).toLocaleString("es-DO")}
            </>
          )}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 leading-relaxed">
        <p className="font-medium text-slate-800">Próximamente en esta app</p>
        <p className="mt-1">
          Generación automática de ACECF desde el Excel oficial y envío al servicio de aprobación comercial (sin
          alterar el flujo de e-CF del lote Excel).
        </p>
      </div>
    </div>
  );
}
