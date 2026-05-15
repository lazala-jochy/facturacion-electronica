import { Link } from "react-router-dom";
import type { AuthCompany } from "../types/session";
import DgiiPaso4UrlsForm from "../components/DgiiPaso4UrlsForm";
import { findDgiiPruebaById } from "../config/dgiiPruebas";

const PASO2 = findDgiiPruebaById("ecf-excel");
const PASO4 = findDgiiPruebaById("ecf-simulacion");

export default function DgiiEcfSimulacion({
  company,
  onCompanyUpdated,
}: {
  company: AuthCompany;
  onCompanyUpdated?: (company: AuthCompany) => void;
}) {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
          {PASO4.paso} — {PASO4.label}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{PASO4.description}</p>
      </header>

      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 sm:p-5 text-sm text-blue-950 space-y-2">
        <p className="leading-relaxed">
          Configurá manualmente los cuatro servicios DGII para la <strong>simulación e-CF</strong>. No se comparten
          con otras pantallas.
        </p>
        <p className="text-xs text-blue-900/90 leading-relaxed">
          El lote Excel oficial sigue usando las URLs del{" "}
          <Link to={PASO2.path} className="font-medium text-[#0b57d0] hover:underline">
            {PASO2.paso}
          </Link>
          .
        </p>
      </div>

      <DgiiPaso4UrlsForm company={company} onCompanyUpdated={onCompanyUpdated} />
    </div>
  );
}
