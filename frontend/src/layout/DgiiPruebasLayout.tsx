import { Outlet, useLocation } from "react-router-dom";
import type { AuthCompany } from "../types/session";
import DgiiEnvironmentStatus from "../components/DgiiEnvironmentStatus";
import DgiiPruebaTypeSelect from "../components/DgiiPruebaTypeSelect";
import PageHeaderCard from "../components/PageHeaderCard";
import PageShell from "../components/PageShell";
import { DGII_PRUEBAS_BASE, findDgiiPruebaByPath } from "../config/dgiiPruebas";

type Props = {
  company: AuthCompany;
  onCompanyUpdated: (company: AuthCompany) => void;
};

export default function DgiiPruebasLayout({ company, onCompanyUpdated }: Props) {
  const { pathname } = useLocation();
  const isHub = pathname === DGII_PRUEBAS_BASE || pathname === `${DGII_PRUEBAS_BASE}/`;
  const active = findDgiiPruebaByPath(pathname);

  const title = isHub ? "Pruebas DGII" : (active?.label ?? "Pruebas DGII");
  const description = isHub
    ? "Certificación CerteCF: elegí el paso (Excel e-CF, aprobaciones comerciales o simulación) y seguí el flujo oficial de la DGII."
    : active?.description;

  return (
    <PageShell>
      <PageHeaderCard
        title={title}
        description={description}
        company={{ name: company.name, rnc: company.rnc }}
        backLink={
          isHub
            ? undefined
            : { to: DGII_PRUEBAS_BASE, label: "← Todas las pruebas" }
        }
      >
        {!isHub ? (
          <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
            {active ? (
              <p className="text-xs font-medium text-slate-500">{active.paso}</p>
            ) : null}
            <div className="max-w-md">
              <DgiiPruebaTypeSelect compact />
            </div>
            <p className="text-xs text-slate-500">
              Cambiar el tipo de prueba no afecta el progreso de la otra modalidad.
            </p>
          </div>
        ) : (
          <div className="mt-4 border-t border-slate-100 pt-4 max-w-md">
            <DgiiPruebaTypeSelect />
          </div>
        )}
      </PageHeaderCard>

      {isHub ? (
        <DgiiEnvironmentStatus company={company} onCompanyUpdated={onCompanyUpdated} />
      ) : null}

      <Outlet />
    </PageShell>
  );
}
