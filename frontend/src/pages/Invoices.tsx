import { useEffect, useMemo, useState } from "react";
import { listCotizaciones } from "../services/cotizaciones";
import { AUTH_STORAGE_KEY, type AuthSession } from "../types/session";

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

const monthLabel = (key: string) => {
  const [year, month] = key.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("es-DO", { month: "short", year: "2-digit" });
};

export default function Invoices() {
  const session = useMemo<AuthSession | null>(() => {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as AuthSession;
      return s?.token && s?.company ? s : null;
    } catch {
      return null;
    }
  }, []);
  const company = session?.company;
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

  const chartData = useMemo(() => {
    const monthlyMap = new Map<string, number>();
    for (const row of filtered) {
      const date = new Date(row.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + row.amount);
    }
    const monthly = Array.from(monthlyMap.entries())
      .map(([period, total]) => ({ period, total }))
      .sort((a, b) => a.period.localeCompare(b.period))
      .slice(-8);
    const monthlyMax = monthly.reduce((acc, row) => Math.max(acc, row.total), 1);
    const monthlyTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
      ratio,
      value: monthlyMax * ratio,
    }));

    const ranges = {
      Alto: filtered.filter((m) => m.amount >= 10000).length,
      Medio: filtered.filter((m) => m.amount >= 4000 && m.amount < 10000).length,
      Bajo: filtered.filter((m) => m.amount < 4000).length,
    };
    const rangesTotal = ranges.Alto + ranges.Medio + ranges.Bajo;

    return { monthly, monthlyMax, monthlyTicks, ranges, rangesTotal };
  }, [filtered]);

  return (
    <div className="w-full px-4 sm:px-0 pb-10 pt-4 sm:pt-5">
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-3xl font-extrabold text-[#0b57d0]">Reporte financiero</h1>
        <p className="text-slate-600">Consulta ingresos, salidas y movimientos económicos con filtros avanzados.</p>
        {company ? (
          <p className="text-xs text-slate-500 mt-1">{company.name} · RNC {company.rnc}</p>
        ) : null}
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr] mb-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Tendencia de ingresos</h3>
          {chartData.monthly.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">Sin datos para graficar.</p>
          ) : (
            <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
              <div className="relative h-56">
                <div className="absolute inset-y-0 left-0 w-16 text-[10px] text-slate-500">
                  {chartData.monthlyTicks.map((tick) => (
                    <div
                      key={tick.ratio}
                      className="absolute left-0 -translate-y-1/2"
                      style={{ top: `${(1 - tick.ratio) * 100}%` }}
                    >
                      {money(tick.value)}
                    </div>
                  ))}
                </div>
                <div className="absolute inset-y-0 left-16 right-0">
                  {chartData.monthlyTicks.map((tick) => (
                    <div
                      key={`line-${tick.ratio}`}
                      className="absolute left-0 right-0 border-t border-dashed border-slate-200"
                      style={{ top: `${(1 - tick.ratio) * 100}%` }}
                    />
                  ))}
                  <div className="absolute bottom-0 left-0 right-0 flex items-end gap-2">
                    {chartData.monthly.map((item) => (
                      <div key={item.period} className="flex flex-1 flex-col items-center gap-2">
                        <div
                          className="w-full rounded-t bg-[#16a34a]"
                          style={{ height: `${Math.max(6, (item.total / chartData.monthlyMax) * 180)}px` }}
                          title={`${monthLabel(item.period)}: ${money(item.total)}`}
                        />
                        <span className="text-[10px] text-slate-500">{monthLabel(item.period)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Distribución por monto</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[140px_1fr]">
            <div
              className="mx-auto h-32 w-32 rounded-full"
              style={{
                background: `conic-gradient(#0b57d0 0 ${
                  chartData.rangesTotal ? Math.round((chartData.ranges.Alto / chartData.rangesTotal) * 100) : 0
                }%, #16a34a 0 ${
                  chartData.rangesTotal
                    ? Math.round(((chartData.ranges.Alto + chartData.ranges.Medio) / chartData.rangesTotal) * 100)
                    : 0
                }%, #8be7a7 0 100%)`,
              }}
            >
              <div className="m-5 h-[88px] w-[88px] rounded-full bg-white" />
            </div>
            <div className="space-y-2 text-sm">
              <Legend
                label="Alto (>=10k)"
                color="#0b57d0"
                value={chartData.ranges.Alto}
                percent={chartData.rangesTotal ? Math.round((chartData.ranges.Alto / chartData.rangesTotal) * 100) : 0}
              />
              <Legend
                label="Medio (4k-10k)"
                color="#16a34a"
                value={chartData.ranges.Medio}
                percent={chartData.rangesTotal ? Math.round((chartData.ranges.Medio / chartData.rangesTotal) * 100) : 0}
              />
              <Legend
                label="Bajo (<4k)"
                color="#8be7a7"
                value={chartData.ranges.Bajo}
                percent={chartData.rangesTotal ? Math.round((chartData.ranges.Bajo / chartData.rangesTotal) * 100) : 0}
              />
            </div>
          </div>
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

function Legend({
  label,
  color,
  value,
  percent,
}: {
  label: string;
  color: string;
  value: number;
  percent: number;
}) {
  return (
    <div className="flex items-center justify-between rounded border border-slate-100 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
        <span>{label}</span>
      </div>
      <span className="font-semibold text-slate-700">{value} ({percent}%)</span>
    </div>
  );
}
