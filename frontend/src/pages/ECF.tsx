import { useState } from "react";
import type { AuthCompany } from "../types/session";

export default function ECF({ company }: { company: AuthCompany }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">e-CF</h2>
          <p className="mt-1 text-sm text-slate-500">
            Empresa: {company.name} · RNC {company.rnc}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
        >
          + Nueva factura
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-center">
          <thead className="bg-slate-100 text-sm">
            <tr>
              <th className="p-3">Cliente</th>
              <th className="p-3">RNC</th>
              <th className="p-3">Total</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Acciones</th>
            </tr>
          </thead>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md space-y-4 rounded-xl bg-white p-6">
            <h3 className="text-lg font-semibold">Nueva factura</h3>
            <input
              placeholder="Cliente"
              className="w-full rounded border p-2"
            />
            <input placeholder="RNC" className="w-full rounded border p-2" />
            <input placeholder="Total" className="w-full rounded border p-2" />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border px-4 py-2"
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded bg-slate-900 px-4 py-2 text-white"
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
