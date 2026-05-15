import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AuthCompany } from "../types/session";
import { ApiError } from "../services/api";
import {
  companyPaso4DgiiUrls,
  saveDgiiPaso4Urls,
  type DgiiEcfUrlFields,
  type DgiiEnvironment,
} from "../services/dgiiPaso4Pruebas";
import { DGII_ECF_SANDBOX } from "../utils/dgiiUrls";
import { findDgiiPruebaById } from "../config/dgiiPruebas";

const PASO4 = findDgiiPruebaById("ecf-simulacion");

type Props = {
  company: AuthCompany;
  onCompanyUpdated?: (company: AuthCompany) => void;
};

export default function DgiiPaso4UrlsForm({ company, onCompanyUpdated }: Props) {
  const [urls, setUrls] = useState<DgiiEcfUrlFields>(() => companyPaso4DgiiUrls(company));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setUrls(companyPaso4DgiiUrls(company));
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
        ["consulta de envío", urls.consultUrl],
        ["resúmenes consumo < RD$ 250,000", urls.consumerSummaryUrl],
      ] as const) {
        if (!value.trim()) {
          throw new Error(`Completá la URL de ${label}.`);
        }
        try {
          new URL(value.trim());
        } catch {
          throw new Error(`La URL de ${label} no es válida (https://…).`);
        }
      }
      const res = await saveDgiiPaso4Urls(urls);
      onCompanyUpdated?.(res.company);
      setUrls(companyPaso4DgiiUrls(res.company));
      setSuccess("URLs del Paso 4 guardadas. No se modificaron las del Paso 2.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:p-5 shadow-sm space-y-3 text-sm">
      <h2 className="font-semibold text-emerald-950">
        {PASO4.paso} — Servicios DGII (solo esta vista)
      </h2>
      <p className="text-emerald-900 text-xs leading-relaxed">
        Estas URLs son independientes del{" "}
        <Link to="/dgii-pruebas/ecf-excel" className="font-medium text-[#0b57d0] hover:underline">
          Paso 2 (Excel)
        </Link>
        . Usuario y contraseña DGII en{" "}
        <Link to="/company-profile" className="font-medium text-[#0b57d0] hover:underline">
          Perfil de empresa
        </Link>
        .
      </p>

      <div>
        <label className="block text-xs font-medium text-emerald-950" htmlFor="paso4-env">
          Ambiente (Paso 4)
        </label>
        <select
          id="paso4-env"
          className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
          value={urls.environment}
          onChange={(e) => setField("environment", e.target.value as DgiiEnvironment)}
        >
          <option value="CERTIFICACION">CERTIFICACION</option>
          <option value="PRODUCCION">PRODUCCION</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-emerald-950" htmlFor="paso4-auth">
          Servicio de autenticación
        </label>
        <input
          id="paso4-auth"
          type="url"
          value={urls.authUrl}
          onChange={(e) => setField("authUrl", e.target.value)}
          placeholder={DGII_ECF_SANDBOX.auth}
          className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#15803d] focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-emerald-950" htmlFor="paso4-recv">
          Servicio de recepción de e-CF
        </label>
        <input
          id="paso4-recv"
          type="url"
          value={urls.receptionUrl}
          onChange={(e) => setField("receptionUrl", e.target.value)}
          placeholder={DGII_ECF_SANDBOX.reception}
          className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#15803d] focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-emerald-950" htmlFor="paso4-consult">
          Servicio de consulta de envío
        </label>
        <input
          id="paso4-consult"
          type="url"
          value={urls.consultUrl}
          onChange={(e) => setField("consultUrl", e.target.value)}
          placeholder={DGII_ECF_SANDBOX.consult}
          className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#15803d] focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-emerald-950" htmlFor="paso4-rfce">
          Servicio de recepción de resúmenes de factura de consumo menor a RD$ 250,000.00
        </label>
        <input
          id="paso4-rfce"
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
        {saving ? "Guardando…" : "Guardar URLs (Paso 4)"}
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
