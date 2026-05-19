import { Link } from "react-router-dom";
import type { AuthCompany } from "../types/session";
import DgiiPaso4UrlsForm from "../components/DgiiPaso4UrlsForm";
import { findDgiiPruebaById } from "../config/dgiiPruebas";

const PASO2 = findDgiiPruebaById("ecf-excel");

export default function DgiiEcfSimulacion({
  company,
  onCompanyUpdated,
}: {
  company: AuthCompany;
  onCompanyUpdated?: (company: AuthCompany) => void;
}) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 sm:p-5 text-sm text-blue-950">
        <p className="text-xs text-blue-900/90 leading-relaxed">
          El lote Excel oficial ({PASO2.paso}) usa otras URLs:{" "}
          <Link to={PASO2.path} className="font-medium text-[#0b57d0] hover:underline">
            abrir Paso 2
          </Link>
          .
        </p>
      </div>

      <DgiiPaso4UrlsForm company={company} onCompanyUpdated={onCompanyUpdated} />
    </div>
  );
}
