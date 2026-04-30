import type { AuthCompany } from "../types/session";

export default function Dashboard({
  company,
}: {
  company: AuthCompany;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">
          Bienvenido, {company.name}
        </h2>
        <p className="mt-2 text-slate-600">
          RNC: {company.rnc} | {company.address || "Sin direccion registrada"}
          {(company.phone || company.email) && (
            <>
              <br />
              Tel.: {company.phone?.trim() || "—"} · Email empresa:{" "}
              {company.email?.trim() || "—"}
            </>
          )}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Listo para emitir comprobantes fiscales electronicos (DGII / e-CF).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Comprobantes hoy</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">0</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Clientes activos</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">—</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Pendientes DGII</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">0</p>
        </div>
      </div>
    </div>
  );
}
