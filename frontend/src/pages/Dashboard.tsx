import type { AuthCompany } from "../types/session";
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
}: {
  company: AuthCompany;
}) {
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

    const topCotizaciones = [...cotizaciones]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

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
      topCotizaciones,
      salesSeries,
      maxSeries,
      docTypes,
      totalDocs,
    };
  }, [cotizaciones]);

  return (
    <div className="w-full space-y-4 px-2 sm:px-0 pt-4 sm:pt-5">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-3xl font-extrabold text-[#0b57d0]">¡Bienvenido, Admin!</h2>
        <p className="text-slate-600">Aquí tienes un resumen de tu actividad.</p>
        <p className="text-xs text-slate-500 mt-1">{company.name} · RNC {company.rnc}</p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-slate-500">
          Cargando dashboard...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm text-red-700">
          {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Comprobantes emitidos" value={analytics.emitidasMes} tone="green" />
            <MetricCard title="Ventas totales" value={money(analytics.ingresosMes)} tone="blue" />
            <MetricCard title="Clientes activos" value={clientsCount} tone="green" />
            <MetricCard title="ITBIS del mes" value={money(analytics.itbisMes)} tone="blue" />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Resumen de ventas</h3>
              {analytics.salesSeries.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">Sin ventas del mes para graficar.</p>
              ) : (
                <div className="mt-4">
                  <div className="flex items-end gap-2 h-56 rounded-lg bg-gradient-to-t from-[#e9f9ef] to-white p-3">
                    {analytics.salesSeries.map((item) => (
                      <div key={item.label} className="flex flex-1 flex-col items-center justify-end gap-2">
                        <div
                          className="w-full rounded-t bg-[#16a34a]"
                          style={{ height: `${Math.max(8, (item.total / analytics.maxSeries) * 160)}px` }}
                          title={`${item.label}: ${money(item.total)}`}
                        />
                        <span className="text-[10px] text-slate-500">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Últimos comprobantes</h3>
                <Link to="/clients" className="text-sm font-semibold text-[#0b57d0]">Ver todos</Link>
              </div>
              <div className="space-y-3">
                {analytics.topCotizaciones.slice(0, 5).map((row) => (
                  <div key={row.id} className="rounded-lg border border-slate-100 p-2">
                    <p className="font-semibold text-[#0b57d0]">F{String(row.number).padStart(8, "0")}</p>
                    <p className="text-xs text-slate-600 truncate">Cliente: {row.client_name}</p>
                    <p className="text-right font-semibold text-slate-900">{money(row.total)}</p>
                  </div>
                ))}
                {analytics.topCotizaciones.length === 0 && (
                  <p className="text-sm text-slate-500">Sin comprobantes.</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Comprobantes por tipo</h3>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
                <div className="mx-auto h-44 w-44 rounded-full" style={{
                  background: `conic-gradient(#0b57d0 0 ${percent(analytics.docTypes.Facturas, analytics.totalDocs)}%, #16a34a 0 ${percent(analytics.docTypes.Facturas + analytics.docTypes.Boletas, analytics.totalDocs)}%, #8be7a7 0 100%)`,
                }}>
                  <div
                    className="m-7 rounded-full bg-white"
                    style={{ width: "120px", height: "120px" }}
                  />
                </div>
                <div className="space-y-2 text-sm">
                  <Legend label="Facturas" color="#0b57d0" value={analytics.docTypes.Facturas} pct={percent(analytics.docTypes.Facturas, analytics.totalDocs)} />
                  <Legend label="Boletas" color="#16a34a" value={analytics.docTypes.Boletas} pct={percent(analytics.docTypes.Boletas, analytics.totalDocs)} />
                  <Legend label="Notas de Crédito" color="#8be7a7" value={analytics.docTypes["Notas de Crédito"]} pct={percent(analytics.docTypes["Notas de Crédito"], analytics.totalDocs)} />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Acciones rápidas</h3>
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
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${classes}`}>
        {title}
      </div>
      <p className="mt-3 text-3xl font-extrabold text-slate-900">{value}</p>
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
    <div className="flex items-center justify-between rounded border border-slate-100 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
        <span>{label}</span>
      </div>
      <span className="font-semibold text-slate-700">
        {pct}% ({value})
      </span>
    </div>
  );
}

function QuickAction({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-[#e9f9ef] hover:text-[#15803d]"
    >
      {label}
    </Link>
  );
}
