import type { AuthCompany } from "../types/session";

export default function Dashboard({
  company,
}: {
  company: AuthCompany;
}) {
  return (
    <div className="w-full space-y-5 px-4 sm:px-0">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">
          Bienvenido, {company.name}
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-slate-600 space-y-1 sm:space-y-0">
          <span>RNC: {company.rnc}</span>
          {company.address && (
            <>
              <span className="hidden sm:inline"> | </span>
              <span className="block sm:inline">{company.address}</span>
            </>
          )}
        </p>
        {(company.phone || company.email) && (
          <p className="mt-2 text-xs sm:text-sm text-slate-600 space-y-1 sm:space-y-0">
            {company.phone?.trim() && (
              <span>Tel.: {company.phone.trim()}</span>
            )}
            {company.phone?.trim() && company.email?.trim() && (
              <span className="hidden sm:inline"> · </span>
            )}
            {company.email?.trim() && (
              <>
                <span className="block sm:inline">Email: {company.email.trim()}</span>
              </>
            )}
          </p>
        )}
        <p className="mt-2 sm:mt-1 text-xs sm:text-sm text-slate-500">
          Listo para emitir comprobantes fiscales electronicos (DGII / e-CF).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
          <p className="text-xs sm:text-sm text-slate-500 font-medium">Comprobantes hoy</p>
          <p className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900">0</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
          <p className="text-xs sm:text-sm text-slate-500 font-medium">Clientes activos</p>
          <p className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900">—</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
          <p className="text-xs sm:text-sm text-slate-500 font-medium">Pendientes DGII</p>
          <p className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900">0</p>
        </div>
      </div>
    </div>
  );
}
