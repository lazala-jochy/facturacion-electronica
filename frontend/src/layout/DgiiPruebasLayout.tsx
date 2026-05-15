import { Outlet, Link, useLocation } from "react-router-dom";
import DgiiPruebaTypeSelect from "../components/DgiiPruebaTypeSelect";
import { DGII_PRUEBAS_BASE, findDgiiPruebaByPath } from "../config/dgiiPruebas";

export default function DgiiPruebasLayout() {
  const { pathname } = useLocation();
  const isHub = pathname === DGII_PRUEBAS_BASE || pathname === `${DGII_PRUEBAS_BASE}/`;
  const active = findDgiiPruebaByPath(pathname);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <Link
              to={DGII_PRUEBAS_BASE}
              className="text-xs font-medium text-[#0b57d0] hover:underline"
            >
              ← Todas las pruebas
            </Link>
            <h1 className="mt-1 text-lg font-semibold text-slate-900 sm:text-xl">
              CerteCF — Pruebas de datos
            </h1>
            {!isHub && active && (
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                {active.paso} · {active.label}
              </p>
            )}
          </div>
          {!isHub && (
            <div className="w-full lg:max-w-sm shrink-0">
              <DgiiPruebaTypeSelect compact />
            </div>
          )}
        </div>
        {!isHub && (
          <p className="mt-3 text-xs text-slate-500 border-t border-slate-100 pt-3">
            Cambiar el tipo de prueba no afecta el progreso de la otra modalidad.
          </p>
        )}
      </div>

      <Outlet />
    </div>
  );
}
