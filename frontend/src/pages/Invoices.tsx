import { useEffect, useMemo, useState } from "react";
import { listCotizaciones } from "../services/cotizaciones";

type CotizacionListRow = {
  id: number;
  number: number;
  client_name: string;
  total: number;
  subtotal: number;
  itbis: number;
  created_at: string;
};

type MovementType = "ingreso" | "salida";

type Movement = {
  id: string;
  date: string;
  description: string;
  type: MovementType;
  amount: number;
  reference: string;
};

const money = (value: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(value);

const MONTHS = [
  { value: "01", label: "Enero" },
  { value: "02", label: "Febrero" },
  { value: "03", label: "Marzo" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Mayo" },
  { value: "06", label: "Junio" },
  { value: "07", label: "Julio" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Septiembre" },
  { value: "10", label: "Octubre" },
  { value: "11", label: "Noviembre" },
  { value: "12", label: "Diciembre" },
];

const parseCotizacionRows = (raw: unknown[]): CotizacionListRow[] =>
  raw
    .map((entry) => entry as Partial<CotizacionListRow>)
    .filter((row): row is CotizacionListRow => {
      return (
        typeof row.id === "number" &&
        typeof row.number === "number" &&
        typeof row.client_name === "string" &&
        typeof row.total === "number" &&
        typeof row.subtotal === "number" &&
        typeof row.itbis === "number" &&
        typeof row.created_at === "string"
      );
    });

export default function Invoices() {
  const [allMovements, setAllMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | MovementType>("all");
  const [textFilter, setTextFilter] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await listCotizaciones();
        const rows = parseCotizacionRows(res.cotizaciones as unknown[]);
        const mapped: Movement[] = rows.map((row) => ({
          id: `ingreso-${row.id}`,
          date: row.created_at,
          description: `Cotización #${row.number} - ${row.client_name}`,
          type: "ingreso",
          amount: row.total,
          reference: `COT-${row.number}`,
        }));
        setAllMovements(mapped);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el reporte.");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const years = useMemo(() => {
    const setYears = new Set<number>();
    for (const m of allMovements) setYears.add(new Date(m.date).getFullYear());
    return Array.from(setYears).sort((a, b) => b - a);
  }, [allMovements]);

  const filtered = useMemo(() => {
    const min = minAmount.trim() ? Number(minAmount) : null;
    const max = maxAmount.trim() ? Number(maxAmount) : null;
    const text = textFilter.trim().toLowerCase();

    return allMovements.filter((m) => {
      const d = new Date(m.date);
      const y = String(d.getFullYear());
      const mo = String(d.getMonth() + 1).padStart(2, "0");

      if (yearFilter !== "all" && y !== yearFilter) return false;
      if (monthFilter !== "all" && mo !== monthFilter) return false;
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (text && !`${m.description} ${m.reference}`.toLowerCase().includes(text)) return false;
      if (min != null && Number.isFinite(min) && m.amount < min) return false;
      if (max != null && Number.isFinite(max) && m.amount > max) return false;
      return true;
    });
  }, [allMovements, yearFilter, monthFilter, typeFilter, textFilter, minAmount, maxAmount]);

  const totals = useMemo(() => {
    const ingresos = filtered
      .filter((m) => m.type === "ingreso")
      .reduce((acc, m) => acc + m.amount, 0);
    const salidas = filtered
      .filter((m) => m.type === "salida")
      .reduce((acc, m) => acc + m.amount, 0);
    return {
      ingresos,
      salidas,
      ganancias: ingresos - salidas,
    };
  }, [filtered]);

  return (
    <div className="w-full px-4 sm:px-0 pb-10">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900">Reporte financiero</h1>
        <p className="mt-1 text-sm text-slate-600">
          Consulta ingresos, salidas y movimientos económicos con filtros avanzados.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
          <p className="text-xs uppercase font-semibold text-emerald-700">Ingresos</p>
          <p className="mt-1 text-2xl font-bold text-emerald-900">{money(totals.ingresos)}</p>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
          <p className="text-xs uppercase font-semibold text-rose-700">Salidas</p>
          <p className="mt-1 text-2xl font-bold text-rose-900">{money(totals.salidas)}</p>
        </div>
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
          <p className="text-xs uppercase font-semibold text-indigo-700">Ganancias</p>
          <p className="mt-1 text-2xl font-bold text-indigo-900">{money(totals.ganancias)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 transition-all duration-300 hover:shadow-md">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <select
            className="rounded border border-slate-300 px-3 py-2 text-sm transition-all duration-200 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
          >
            <option value="all">Todos los años</option>
            {years.map((year) => (
              <option key={year} value={String(year)}>
                {year}
              </option>
            ))}
          </select>
          <select
            className="rounded border border-slate-300 px-3 py-2 text-sm transition-all duration-200 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
          >
            <option value="all">Todos los meses</option>
            {MONTHS.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
          <select
            className="rounded border border-slate-300 px-3 py-2 text-sm transition-all duration-200 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "all" | MovementType)}
          >
            <option value="all">Todos los tipos</option>
            <option value="ingreso">Ingresos</option>
            <option value="salida">Salidas</option>
          </select>
          <input
            className="rounded border border-slate-300 px-3 py-2 text-sm transition-all duration-200 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            placeholder="Buscar por descripción o referencia"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
          />
          <input
            className="rounded border border-slate-300 px-3 py-2 text-sm transition-all duration-200 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            placeholder="Monto mínimo"
            inputMode="decimal"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
          />
          <input
            className="rounded border border-slate-300 px-3 py-2 text-sm transition-all duration-200 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            placeholder="Monto máximo"
            inputMode="decimal"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="mt-5 text-sm text-slate-600">Cargando movimientos...</p>
        ) : error ? (
          <p className="mt-5 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : filtered.length === 0 ? (
          <p className="mt-5 text-sm text-slate-600">
            No hay movimientos para los filtros seleccionados.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-left">Descripción</th>
                  <th className="px-3 py-2 text-left">Referencia</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100 transition-colors duration-150 hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-700">
                      {new Date(m.date).toLocaleDateString("es-DO")}
                    </td>
                    <td className="px-3 py-2 text-slate-900">{m.description}</td>
                    <td className="px-3 py-2 font-mono text-slate-700">{m.reference}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          m.type === "ingreso"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {m.type}
                      </span>
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-semibold ${
                        m.type === "ingreso" ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {money(m.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-slate-500">
          Nota: actualmente los movimientos provienen de cotizaciones (ingresos). Cuando agreguemos
          módulo de egresos, las salidas se reflejarán automáticamente en este reporte.
        </p>
      </div>
    </div>
  );
}
