import { useState } from "react";
import type { AuthCompany } from "../types/session";

export default function ECF({ company }: { company: AuthCompany }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full space-y-4 sm:space-y-6 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-semibold truncate">e-CF</h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 truncate">
            Empresa: {company.name} · RNC {company.rnc}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-slate-900 px-3 sm:px-4 py-2 text-white hover:bg-slate-700 transition text-sm sm:text-base whitespace-nowrap"
        >
          + Nueva factura
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-center text-xs sm:text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 sm:p-3">Cliente</th>
                <th className="p-2 sm:p-3">RNC</th>
                <th className="p-2 sm:p-3">Total</th>
                <th className="p-2 sm:p-3">Estado</th>
                <th className="p-2 sm:p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {/* Empty state message */}
            </tbody>
          </table>
        </div>
        <div className="p-6 sm:p-8 text-center text-gray-500 text-sm">
          No hay facturas registradas
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md max-h-screen overflow-y-auto space-y-4 rounded-xl bg-white p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg sm:text-xl font-semibold">Nueva factura</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ×
              </button>
            </div>
            <input
              placeholder="Cliente"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <input
              placeholder="RNC"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <input
              placeholder="Total"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-gray-300 px-3 sm:px-4 py-2 text-sm hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded bg-slate-900 px-3 sm:px-4 py-2 text-sm text-white hover:bg-slate-700 transition"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
