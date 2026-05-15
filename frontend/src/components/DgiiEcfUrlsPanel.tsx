import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AuthCompany } from "../types/session";
import { ApiError } from "../services/api";
import {
  companyEcfDgiiUrls,
  saveDgiiEcfExcelUrls,
  type DgiiEcfUrlFields,
  type DgiiEnvironment,
} from "../services/dgiiEcfExcelPruebas";
import { DGII_ECF_SANDBOX } from "../utils/dgiiUrls";

type Props = {
  company: AuthCompany;
  onCompanyUpdated?: (company: AuthCompany) => void;
};

export default function DgiiEcfUrlsPanel({ company, onCompanyUpdated }: Props) {
  const [urls, setUrls] = useState<DgiiEcfUrlFields>(() => companyEcfDgiiUrls(company));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setUrls(companyEcfDgiiUrls(company));
  }, [company]);

  const setField = <K extends keyof DgiiEcfUrlFields>(key: K, value: DgiiEcfUrlFields[K]) => {
    setUrls((prev) => ({ ...prev, [key]: value }));
    setError("");
    setSuccess("");
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      for (const [label, value] of [
        ["autenticación", urls.authUrl],
        ["recepción e-CF", urls.receptionUrl],
        ["consulta", urls.consultUrl],
        ["resúmenes consumo", urls.consumerSummaryUrl],
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
      const res = await saveDgiiEcfExcelUrls(urls);
      onCompanyUpdated?.(res.company);
      setUrls(companyEcfDgiiUrls(res.company));
      setSuccess("URLs DGII guardadas para esta empresa.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:p-5 shadow-sm space-y-3 text-sm">
      <h2 className="font-semibold text-emerald-950">Servicios DGII — Pruebas e-CF (Excel)</h2>
      <p className="text-emerald-900 text-xs leading-relaxed">
        URLs de certificación o producción para generar, enviar y consultar e-CF y resúmenes RFCE. El usuario y
        contraseña DGII se configuran en{" "}
        <Link to="/company-profile" className="font-medium text-[#0b57d0] hover:underline">
          Perfil de empresa
        </Link>
        .
      </p>

      <div>
        <label className="block text-xs font-medium text-emerald-950" htmlFor="dgii-ecf-env">
          Ambiente DGII
        </label>
        <select
          id="dgii-ecf-env"
          className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
          value={urls.environment}
          onChange={(e) => setField("environment", e.target.value as DgiiEnvironment)}
        >
          <option value="CERTIFICACION">CERTIFICACION</option>
          <option value="PRODUCCION">PRODUCCION</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-emerald-950" htmlFor="dgii-ecf-auth">
          Servicio de autenticación
        </label>
        <input
          id="dgii-ecf-auth"
          type="url"
          value={urls.authUrl}
          onChange={(e) => setField("authUrl", e.target.value)}
          placeholder={DGII_ECF_SANDBOX.auth}
          className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#15803d] focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-emerald-950" htmlFor="dgii-ecf-reception">
          Servicio de recepción e-CF
        </label>
        <input
          id="dgii-ecf-reception"
          type="url"
          value={urls.receptionUrl}
          onChange={(e) => setField("receptionUrl", e.target.value)}
          placeholder={DGII_ECF_SANDBOX.reception}
          className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#15803d] focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-emerald-950" htmlFor="dgii-ecf-consult">
          Servicio de consulta de envío
        </label>
        <input
          id="dgii-ecf-consult"
          type="url"
          value={urls.consultUrl}
          onChange={(e) => setField("consultUrl", e.target.value)}
          placeholder={DGII_ECF_SANDBOX.consult}
          className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#15803d] focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-emerald-950" htmlFor="dgii-ecf-fc">
          Recepción resúmenes factura de consumo &lt; RD$ 250,000
        </label>
        <input
          id="dgii-ecf-fc"
          type="url"
          value={urls.consumerSummaryUrl}
          onChange={(e) => setField("consumerSummaryUrl", e.target.value)}
          placeholder={DGII_ECF_SANDBOX.consumerSummaryReception}
          className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#15803d] focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="rounded-lg bg-[#15803d] px-4 py-2 text-sm font-medium text-white shadow hover:bg-[#166534] disabled:opacity-60"
      >
        {saving ? "Guardando…" : "Guardar URLs DGII"}
      </button>

      {error ? (
        <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      ) : null}
      {success ? (
        <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {success}
        </p>
      ) : null}
    </div>
  );
}
