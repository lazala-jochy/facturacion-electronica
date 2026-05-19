import type { AuthCompany, AuthUser } from "../types/session";
import { useEffect, useMemo, useState } from "react";
import { listClients } from "../services/clients";
import { listCotizaciones } from "../services/cotizaciones";
import { Link } from "react-router-dom";

type CotizacionRow = {
  id: number;
  number: number;
  client_name: string;
  subtotal: number;
  itbis: number;
  total: number;
  created_at: string;
};

const money = (value: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(value);

const percent = (value: number, total: number) => {
  if (!total) return 0;
  return Math.round((value / total) * 100);
};

export default function Dashboard({
  company,
  user,
}: {
  company: AuthCompany;
  user: AuthUser;
}) {
  const displayName = user.full_name?.trim() || user.email || "Usuario";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clientsCount, setClientsCount] = useState(0);
  const [cotizaciones, setCotizaciones] = useState<CotizacionRow[]>([]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const [clientsRes, cotRes] = await Promise.all([listClients(), listCotizaciones()]);
        setClientsCount(clientsRes.clients.length);
        const parsed = (cotRes.cotizaciones as unknown[])
          .map((row) => row as Partial<CotizacionRow>)
          .filter(
            (row): row is CotizacionRow =>
              typeof row.id === "number" &&
              typeof row.number === "number" &&
              typeof row.client_name === "string" &&
              typeof row.subtotal === "number" &&
              typeof row.itbis === "number" &&
              typeof row.total === "number" &&
              typeof row.created_at === "string",
          );
        setCotizaciones(parsed);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar la data.");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const analytics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const inCurrentMonth = cotizaciones.filter((c) => {
      const date = new Date(c.created_at);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });

    const ingresosMes = inCurrentMonth.reduce((acc, c) => acc + c.total, 0);
    const itbisMes = inCurrentMonth.reduce((acc, c) => acc + c.itbis, 0);
    const ticketPromedio = inCurrentMonth.length ? ingresosMes / inCurrentMonth.length : 0;

    const topClientsMap = new Map<string, number>();
    for (const c of cotizaciones) {
      topClientsMap.set(c.client_name, (topClientsMap.get(c.client_name) ?? 0) + c.total);
    }
    const topClients = Array.from(topClientsMap.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const latestComprobantes = [...cotizaciones]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 3);

    const byDayMap = new Map<string, number>();
    for (const c of inCurrentMonth) {
      const day = new Date(c.created_at).toLocaleDateString("es-DO", {
        day: "2-digit",
        month: "short",
      });
      byDayMap.set(day, (byDayMap.get(day) ?? 0) + c.total);
    }
    const salesSeries = Array.from(byDayMap.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(-8);
    const maxSeries = salesSeries.reduce((acc, item) => Math.max(acc, item.total), 1);

    const docTypes = {
      Facturas: analyticsCount(cotizaciones, (c) => c.total >= 10000),
      Boletas: analyticsCount(cotizaciones, (c) => c.total < 10000 && c.total >= 4000),
      "Notas de Crédito": analyticsCount(cotizaciones, (c) => c.total < 4000),
    };
    const totalDocs = docTypes.Facturas + docTypes.Boletas + docTypes["Notas de Crédito"];

    return {
      ingresosMes,
      itbisMes,
      ticketPromedio,
      emitidasMes: inCurrentMonth.length,
      topClients,
      latestComprobantes,
      salesSeries,
      maxSeries,
      docTypes,
      totalDocs,
    };
  }, [cotizaciones]);

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-4 pt-1 sm:pt-2 pb-8">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="break-words text-2xl font-extrabold tracking-tight text-[#0b57d0] sm:text-3xl">
          ¡Bienvenido, {displayName}!
        </h2>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">Aquí tienes un resumen de tu actividad.</p>
        <p className="mt-2 break-all text-xs text-slate-500 sm:break-words">
          <span className="font-medium text-slate-600">{company.name}</span>
          <span className="text-slate-400"> · </span>
          <span className="tabular-nums">RNC {company.rnc}</span>
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm shadow-sm text-slate-500 sm:text-base">
          Cargando dashboard...
        </div>
      ) : error ? (
        <div className="break-words rounded-xl border border-red-200 bg-red-50 p-6 text-sm shadow-sm text-red-700 sm:text-base">
          {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Comprobantes emitidos" value={analytics.emitidasMes} tone="green" />
            <MetricCard title="Ventas totales" value={money(analytics.ingresosMes)} tone="blue" />
            <MetricCard title="Clientes activos" value={clientsCount} tone="green" />
            <MetricCard title="ITBIS del mes" value={money(analytics.itbisMes)} tone="blue" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
            <div className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex min-h-[1.75rem] items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-slate-900 sm:text-lg">Resumen de ventas</h3>
                <span className="invisible shrink-0 text-sm" aria-hidden>
                  Ver todos
                </span>
              </div>
              {analytics.salesSeries.length === 0 ? (
                <p className="flex min-h-[13.5rem] flex-1 items-center text-sm text-slate-500 sm:min-h-[15.5rem]">
                  Sin ventas del mes para graficar.
                </p>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="min-h-0 flex-1 overflow-x-auto overscroll-x-contain rounded-lg pb-1 [-webkit-overflow-scrolling:touch]">
                    <div
                      className="flex h-full min-h-[13.5rem] items-stretch gap-1.5 rounded-lg bg-gradient-to-t from-[#e9f9ef] to-white p-2 sm:min-h-[15.5rem] sm:gap-2 sm:p-3"
                      style={{
                        minWidth: `min(100%, ${Math.max(analytics.salesSeries.length * 40, 220)}px)`,
                      }}
                    >
                      {analytics.salesSeries.map((item) => {
                        const barPct = Math.max(6, (item.total / analytics.maxSeries) * 100);
                        return (
                          <div
                            key={item.label}
                            className="flex h-full min-h-0 min-w-[28px] max-w-[52px] flex-1 flex-col gap-1"
                          >
                            <div className="flex min-h-0 flex-1 flex-col justify-end">
                              <div
                                className="w-full rounded-t bg-[#16a34a]"
                                style={{ height: `${barPct}%`, minHeight: "6px" }}
                                title={`${item.label}: ${money(item.total)}`}
                              />
                            </div>
                            <span className="line-clamp-2 min-h-[2rem] shrink-0 text-center text-[9px] leading-tight text-slate-500 sm:min-h-0 sm:text-[10px]">
                              {item.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex min-h-[1.75rem] items-start justify-between gap-3">
                <h3 className="min-w-0 text-base font-semibold text-slate-900 sm:text-lg">
                  Últimos comprobantes
                </h3>
                <Link to="/ecf" className="shrink-0 text-sm font-semibold text-[#0b57d0] hover:underline">
                  Ver todos
                </Link>
              </div>
              <div className="flex min-h-[13.5rem] flex-1 flex-col space-y-3 sm:min-h-[15.5rem]">
                {analytics.latestComprobantes.map((row) => (
                  <div key={row.id} className="min-w-0 rounded-lg border border-slate-100 p-2.5 sm:p-3">
                    <p className="font-semibold tabular-nums text-[#0b57d0]">
                      F{String(row.number).padStart(8, "0")}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-600" title={row.client_name}>
                      Cliente: {row.client_name}
                    </p>
                    <p className="mt-1 break-all text-right text-sm font-semibold tabular-nums text-slate-900 sm:text-base">
                      {money(row.total)}
                    </p>
                  </div>
                ))}
                {analytics.latestComprobantes.length === 0 && (
                  <p className="flex flex-1 items-center text-sm text-slate-500">Sin comprobantes.</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h3 className="text-base font-semibold text-slate-900 sm:text-lg">Comprobantes por tipo</h3>
              <div className="mt-4 flex min-w-0 flex-col items-stretch gap-6 md:flex-row md:items-center md:justify-between md:gap-8">
                <div
                  className="relative mx-auto aspect-square w-[min(100%,10.5rem)] shrink-0 rounded-full sm:w-44"
                  style={{
                    background: `conic-gradient(#0b57d0 0 ${percent(analytics.docTypes.Facturas, analytics.totalDocs)}%, #16a34a 0 ${percent(analytics.docTypes.Facturas + analytics.docTypes.Boletas, analytics.totalDocs)}%, #8be7a7 0 100%)`,
                  }}
                >
                  <div className="absolute inset-[22%] rounded-full bg-white" />
                </div>
                <div className="min-w-0 flex-1 space-y-2 text-sm">
                  <Legend
                    label="Facturas"
                    color="#0b57d0"
                    value={analytics.docTypes.Facturas}
                    pct={percent(analytics.docTypes.Facturas, analytics.totalDocs)}
                  />
                  <Legend
                    label="Boletas"
                    color="#16a34a"
                    value={analytics.docTypes.Boletas}
                    pct={percent(analytics.docTypes.Boletas, analytics.totalDocs)}
                  />
                  <Legend
                    label="Notas de Crédito"
                    color="#8be7a7"
                    value={analytics.docTypes["Notas de Crédito"]}
                    pct={percent(analytics.docTypes["Notas de Crédito"], analytics.totalDocs)}
                  />
                </div>
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h3 className="text-base font-semibold text-slate-900 sm:text-lg">Acciones rápidas</h3>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <QuickAction to="/cotizaciones/nueva" label="Nueva Factura" />
                <QuickAction to="/ecf" label="Flujo e-CF" />
                <QuickAction to="/clients" label="Nuevo Cliente" />
                <QuickAction to="/invoices" label="Reporte" />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function analyticsCount(
  rows: CotizacionRow[],
  predicate: (row: CotizacionRow) => boolean,
) {
  return rows.reduce((acc, row) => acc + (predicate(row) ? 1 : 0), 0);
}

function MetricCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string | number;
  tone: "green" | "blue";
}) {
  const classes =
    tone === "green"
      ? "bg-[#e9f9ef] text-[#15803d]"
      : "bg-[#e8f0ff] text-[#0b57d0]";
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div
        className={`inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-snug ${classes}`}
      >
        <span className="break-words">{title}</span>
      </div>
      <p className="mt-3 break-words text-2xl font-extrabold tabular-nums leading-tight text-slate-900 sm:text-3xl">
        {value}
      </p>
    </div>
  );
}

function Legend({
  label,
  color,
  value,
  pct,
}: {
  label: string;
  color: string;
  value: number;
  pct: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 px-2 py-2 sm:px-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="min-w-0 break-words text-xs sm:text-sm">{label}</span>
      </div>
      <span className="shrink-0 font-semibold tabular-nums text-slate-700 text-xs sm:text-sm">
        {pct}% ({value})
      </span>
    </div>
  );
}

function QuickAction({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-[3rem] items-center justify-center rounded-lg border border-slate-200 bg-white px-2 py-2.5 text-center text-xs font-medium leading-snug text-slate-700 hover:bg-[#e9f9ef] hover:text-[#15803d] sm:min-h-0 sm:px-3 sm:text-sm sm:leading-normal"
    >
      {label}
    </Link>
  );
}
