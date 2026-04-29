import { useState } from "react";
import type { AuthCompany } from "../types/company";

export default function ECF({ company }: { company: AuthCompany }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/*header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">e-CF</h2>
        <button
          onClick={() => setOpen(true)}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-700"
        >
          + Nueva factura
        </button>
      </div>
      {/*tabla */}
      <div className="bg-white rounded-xl shodow border">
        <table className="w-full text-center">
          <thead className="bg-slate-100 text-sm"></thead>
          <tr>
            <th className="p-3">Client</th>
            <th className="p-3">RNC</th>
            <th className="p-3">Total</th>
            <th className="p-3">Estado</th>
            <th className="p-3">Acciones</th>
          </tr>
        </table>
      </div>
      {/*modal */}

      {open && (
        <div className="fixed inset-0 -bg-black/40  flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold">Nueva Factura</h3>
            <input
              placeholder="cliente"
              className="w-full border p-2 rounded"
            />
            <input placeholder="RNC" className="w-full border p-2 rounded" />
            <input placeholder="Total" className="w-full border p-2 rounded" />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 border rounded"
              >
                Cancelar
              </button>
              <button className="px-4 py-2 bg-slate-900 text-white rounded">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
