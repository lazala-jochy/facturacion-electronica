import { Link } from "react-router-dom";
import { DGII_PRUEBA_TYPES } from "../config/dgiiPruebas";
import DgiiPruebaTypeSelect from "../components/DgiiPruebaTypeSelect";

export default function DgiiPruebasHub() {
  return (
    <div className="space-y-6">
      <header>
        <p className="mt-2 text-sm text-slate-600">
          Elegí el tipo de prueba en el menú o una tarjeta. Cada modalidad tiene su propia pantalla y lógica.
        </p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:max-w-md">
        <DgiiPruebaTypeSelect />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {DGII_PRUEBA_TYPES.map((t) => (
          <Link
            key={t.id}
            to={t.path}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#0b57d0] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[#0b57d0]">{t.paso}</p>
            <h2 className="mt-1 text-base font-semibold text-slate-900">{t.shortLabel}</h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">{t.description}</p>
            <span className="mt-3 inline-block text-sm font-medium text-[#0b57d0]">Abrir →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
