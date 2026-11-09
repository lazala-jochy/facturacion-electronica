import { useState } from "react";
import { apiFetch } from "../services/api";
import type { AuthCompany } from "../types/session";

type Props = {
  company: AuthCompany;
  onCompanyUpdated: (company: AuthCompany) => void;
};

/**
 * Switch de "graduacion" certificacion -> produccion. Vive en Pruebas DGII (no en Perfil de
 * empresa) porque es el lugar donde se sigue el proceso de certificacion de punta a punta.
 * Cambia dgii_environment en el perfil, que Clientes usa para decidir si mostrar el selector
 * Paso 2 / Paso 4 (ver Clients.tsx: isDgiiCertification).
 */
export default function DgiiEnvironmentStatus({ company, onCompanyUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isProduction = company.dgiiEnvironment === "PRODUCCION";

  const setEnvironment = async (next: "CERTIFICACION" | "PRODUCCION") => {
    if (next === "PRODUCCION") {
      const confirmed = window.confirm(
        "Vas a marcar el sistema como PRODUCCIÓN. A partir de ahora se asume que DGII ya confirmó la certificación y se deja de mostrar el selector Paso 2 / Paso 4 en Clientes. ¿Confirmás?",
      );
      if (!confirmed) return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<{ company: AuthCompany }>("/auth/company", {
        method: "PUT",
        body: JSON.stringify({ dgii_environment: next }),
      });
      onCompanyUpdated(res.company);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`rounded-xl border p-4 text-sm ${
        isProduction ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-800">
            Estado del sistema:{" "}
            <span className={isProduction ? "text-emerald-700" : "text-amber-700"}>
              {isProduction ? "Producción" : "Certificación (CerteCF)"}
            </span>
          </p>
          <p className="mt-1 max-w-xl text-xs text-slate-600">
            {isProduction
              ? "El sistema asume que DGII ya certificó este RNC."
              : "Marcá el sistema como Producción recién cuando DGII confirme que pasaste todas las pruebas de certificación."}
          </p>
        </div>
        {isProduction ? (
          <button
            type="button"
            className="text-xs font-medium text-slate-500 hover:underline disabled:opacity-50"
            disabled={loading}
            onClick={() => setEnvironment("CERTIFICACION")}
          >
            Volver a certificación
          </button>
        ) : (
          <button
            type="button"
            className="rounded-lg bg-[#0b57d0] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0948ad] disabled:opacity-50"
            disabled={loading}
            onClick={() => setEnvironment("PRODUCCION")}
          >
            {loading ? "Guardando…" : "Marcar sistema como Producción"}
          </button>
        )}
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
