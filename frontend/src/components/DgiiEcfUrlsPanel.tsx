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
import { DGII_ECF_SANDBOX, normalizeAuthBaseUrl, seedUrlFromAuthBase, validateSeedUrlFromAuthBase } from "../utils/dgiiUrls";

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
      // Semilla/validar-semilla (certificación y producción) son opcionales — si se completan, deben ser válidas.
      for (const [label, value] of [
        ["semilla", urls.seedUrl],
        ["validar semilla", urls.validateSeedUrl],
        ["autenticación (Producción)", urls.prodAuthUrl],
        ["recepción e-CF (Producción)", urls.prodReceptionUrl],
        ["consulta (Producción)", urls.prodConsultUrl],
        ["semilla (Producción)", urls.prodSeedUrl],
        ["validar semilla (Producción)", urls.prodValidateSeedUrl],
        ["resúmenes consumo (Producción)", urls.prodConsumerSummaryUrl],
      ] as const) {
        if (!value.trim()) continue;
        try {
          new URL(value.trim());
        } catch {
          throw new Error(`La URL de ${label} no es válida (https://...).`);
        }
      }
      if (
        urls.environment === "PRODUCCION" &&
        (!urls.prodAuthUrl.trim() || !urls.prodReceptionUrl.trim() || !urls.prodConsultUrl.trim())
      ) {
        throw new Error(
          "Elegiste ambiente PRODUCCION pero faltan URLs de Producción. Completalas abajo o volvé a CERTIFICACION.",
        );
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
        Certificación (CerteCF) y producción usan URLs separadas abajo — nunca se pisan entre sí. El ambiente
        que elijas determina cuál juego usa la app al enviar de verdad. El usuario y contraseña DGII se
        configuran en{" "}
        <Link to="/company-profile" className="font-medium text-[#0b57d0] hover:underline">
          Perfil de empresa
        </Link>
        .
      </p>

      <div>
        <label className="block text-xs font-medium text-emerald-950" htmlFor="dgii-ecf-env">
          Ambiente activo (cuál juego de URLs se usa al enviar)
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

      <div className="rounded-lg border border-emerald-200 bg-white/60 p-3 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
          URLs de Certificación (CerteCF)
        </h3>

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
          <label className="block text-xs font-medium text-emerald-950" htmlFor="dgii-ecf-seed">
            Semilla (opcional — si se deja vacío se deriva de autenticación)
          </label>
          <input
            id="dgii-ecf-seed"
            type="url"
            value={urls.seedUrl}
            onChange={(e) => setField("seedUrl", e.target.value)}
            placeholder={seedUrlFromAuthBase(normalizeAuthBaseUrl(urls.authUrl || DGII_ECF_SANDBOX.auth))}
            className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#15803d] focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-emerald-950" htmlFor="dgii-ecf-validate-seed">
            Validar semilla (opcional — si se deja vacío se deriva de autenticación)
          </label>
          <input
            id="dgii-ecf-validate-seed"
            type="url"
            value={urls.validateSeedUrl}
            onChange={(e) => setField("validateSeedUrl", e.target.value)}
            placeholder={validateSeedUrlFromAuthBase(normalizeAuthBaseUrl(urls.authUrl || DGII_ECF_SANDBOX.auth))}
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
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900">
          URLs de Producción
        </h3>
        <p className="text-amber-900 text-xs leading-relaxed">
          Completá esto solo cuando la DGII te confirme que ya estás habilitado como emisor en producción. Si
          lo dejás vacío y cambiás el ambiente a PRODUCCION, los envíos van a fallar en vez de usar las URLs
          de certificación por error.
        </p>

        <div>
          <label className="block text-xs font-medium text-amber-950" htmlFor="dgii-ecf-prod-auth">
            Servicio de autenticación (Producción)
          </label>
          <input
            id="dgii-ecf-prod-auth"
            type="url"
            value={urls.prodAuthUrl}
            onChange={(e) => setField("prodAuthUrl", e.target.value)}
            placeholder="https://ecf.dgii.gov.do/ecf/Autenticacion"
            className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#b45309] focus:outline-none focus:ring-2 focus:ring-amber-100"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-amber-950" htmlFor="dgii-ecf-prod-seed">
            Semilla (Producción) — opcional, se deriva de autenticación si se deja vacío
          </label>
          <input
            id="dgii-ecf-prod-seed"
            type="url"
            value={urls.prodSeedUrl}
            onChange={(e) => setField("prodSeedUrl", e.target.value)}
            placeholder={
              urls.prodAuthUrl.trim() ? seedUrlFromAuthBase(normalizeAuthBaseUrl(urls.prodAuthUrl)) : "https://ecf.dgii.gov.do/ecf/Autenticacion/api/Autenticacion/Semilla"
            }
            className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#b45309] focus:outline-none focus:ring-2 focus:ring-amber-100"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-amber-950" htmlFor="dgii-ecf-prod-validate-seed">
            Validar semilla (Producción) — opcional, se deriva de autenticación si se deja vacío
          </label>
          <input
            id="dgii-ecf-prod-validate-seed"
            type="url"
            value={urls.prodValidateSeedUrl}
            onChange={(e) => setField("prodValidateSeedUrl", e.target.value)}
            placeholder={
              urls.prodAuthUrl.trim()
                ? validateSeedUrlFromAuthBase(normalizeAuthBaseUrl(urls.prodAuthUrl))
                : "https://ecf.dgii.gov.do/ecf/Autenticacion/api/Autenticacion/ValidarSemilla"
            }
            className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#b45309] focus:outline-none focus:ring-2 focus:ring-amber-100"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-amber-950" htmlFor="dgii-ecf-prod-reception">
            Servicio de recepción e-CF (Producción)
          </label>
          <input
            id="dgii-ecf-prod-reception"
            type="url"
            value={urls.prodReceptionUrl}
            onChange={(e) => setField("prodReceptionUrl", e.target.value)}
            placeholder="https://ecf.dgii.gov.do/ecf/Recepcion/api/FacturasElectronicas"
            className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#b45309] focus:outline-none focus:ring-2 focus:ring-amber-100"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-amber-950" htmlFor="dgii-ecf-prod-consult">
            Servicio de consulta de envío (Producción)
          </label>
          <input
            id="dgii-ecf-prod-consult"
            type="url"
            value={urls.prodConsultUrl}
            onChange={(e) => setField("prodConsultUrl", e.target.value)}
            placeholder="https://ecf.dgii.gov.do/ecf/ConsultaResultado/api/Consultas/Estado"
            className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#b45309] focus:outline-none focus:ring-2 focus:ring-amber-100"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-amber-950" htmlFor="dgii-ecf-prod-fc">
            Recepción resúmenes factura de consumo &lt; RD$ 250,000 (Producción)
          </label>
          <input
            id="dgii-ecf-prod-fc"
            type="url"
            value={urls.prodConsumerSummaryUrl}
            onChange={(e) => setField("prodConsumerSummaryUrl", e.target.value)}
            placeholder="https://fc.dgii.gov.do/ecf/RecepcionFC"
            className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#b45309] focus:outline-none focus:ring-2 focus:ring-amber-100"
          />
        </div>
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
