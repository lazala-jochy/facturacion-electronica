import type { AuthCompany } from "../services/auth";

export default function Dashboard({
  company,
  onLogout,
}: {
  company: AuthCompany;
  onLogout: () => void;
}) {
  return (
    
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">
            Bienvenido, {company.razonSocial}
          </h2>
          <p className="mt-2 text-slate-600">
            Empresa activa: {company.rnc} | {company.email}
          </p>
           <p className="mt-2 text-slate-600">
            Direccion: {company.direccion} 
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Listo para emitir comprobantes fiscales electronicos en RD.
          </p>
          <button
            onClick={onLogout}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Cerrar sesion
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Comprobantes hoy</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">0</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Clientes activos</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">0</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Pendientes DGII</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">0</p>
          </div>
        </div>
      </div>
    
  );
}
