import type { AuthCompany } from "../types/session";
import { useEffect, useMemo, useState } from "react";
import { listClients } from "../services/clients";
import { listCotizaciones } from "../services/cotizaciones";

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

    const recentMovements = [...cotizaciones]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6);

    return {
      ingresosMes,
      itbisMes,
      ticketPromedio,
      emitidasMes: inCurrentMonth.length,
      topClients,
      recentMovements,
    };
  }, [cotizaciones]);

  return (
    <div className="w-full space-y-5 px-4 pt-3 sm:px-0 sm:pt-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">
          Inicio - {company.name}
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-slate-600 space-y-1 sm:space-y-0">
          <span>RNC: {company.rnc}</span>
          {company.address && (
            <>
              <span className="hidden sm:inline"> | </span>
              <span className="block sm:inline">{company.address}</span>
            </>
          )}
        </p>
        {(company.phone || company.email) && (
          <p className="mt-2 text-xs sm:text-sm text-slate-600 space-y-1 sm:space-y-0">
            {company.phone?.trim() && (
              <span>Tel.: {company.phone.trim()}</span>
            )}
            {company.phone?.trim() && company.email?.trim() && (
              <span className="hidden sm:inline"> · </span>
            )}
            {company.email?.trim() && (
              <>
                <span className="block sm:inline">Email: {company.email.trim()}</span>
              </>
            )}
          </p>
        )}
        <p className="mt-2 sm:mt-1 text-xs sm:text-sm text-slate-500">
          Resumen financiero para decisiones contables del negocio.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
          <p className="text-sm text-slate-600">Cargando indicadores...</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 sm:p-6 shadow-sm">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : (
        <>
      <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm min-h-[124px] flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
          <p className="text-xs sm:text-sm text-slate-500 font-medium leading-tight">
            Ingresos del mes
          </p>
          <p className="mt-2 text-[clamp(1.35rem,3.8vw,1.95rem)] font-bold leading-tight text-emerald-700 break-words">
            {money(analytics.ingresosMes)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm min-h-[124px] flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
          <p className="text-xs sm:text-sm text-slate-500 font-medium leading-tight">
            ITBIS acumulado mes
          </p>
          <p className="mt-2 text-[clamp(1.35rem,3.8vw,1.95rem)] font-bold leading-tight text-indigo-700 break-words">
            {money(analytics.itbisMes)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm min-h-[124px] flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
          <p className="text-xs sm:text-sm text-slate-500 font-medium leading-tight">
            Ticket promedio mes
          </p>
          <p className="mt-2 text-[clamp(1.35rem,3.8vw,1.95rem)] font-bold leading-tight text-slate-900 break-words">
            {money(analytics.ticketPromedio)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm min-h-[124px] flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
          <p className="text-xs sm:text-sm text-slate-500 font-medium leading-tight">
            Facturas emitidas mes
          </p>
          <p className="mt-2 text-[clamp(1.35rem,3.8vw,1.95rem)] font-bold leading-tight text-slate-900 break-words">
            {analytics.emitidasMes}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm min-h-[124px] flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
          <p className="text-xs sm:text-sm text-slate-500 font-medium leading-tight">
            Clientes registrados
          </p>
          <p className="mt-2 text-[clamp(1.35rem,3.8vw,1.95rem)] font-bold leading-tight text-slate-900 break-words">
            {clientsCount}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
          <h3 className="text-sm font-semibold text-slate-900">Top clientes por facturación</h3>
          {analytics.topClients.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">Sin datos todavía.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {analytics.topClients.map((row, idx) => (
                <div key={row.name} className="flex items-center justify-between text-sm rounded-md px-2 py-1.5 transition-colors duration-200 hover:bg-slate-50">
                  <p className="text-slate-700">
                    {idx + 1}. {row.name}
                  </p>
                  <p className="font-semibold text-slate-900">{money(row.total)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
          <h3 className="text-sm font-semibold text-slate-900">Movimientos recientes</h3>
          {analytics.recentMovements.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">Sin movimientos registrados.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {analytics.recentMovements.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 text-sm rounded-md px-2 py-1.5 transition-colors duration-200 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-slate-900">
                      Cotización #{row.number} - {row.client_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(row.created_at).toLocaleDateString("es-DO")}
                    </p>
                  </div>
                  <p className="font-semibold text-emerald-700 whitespace-nowrap">
                    {money(row.total)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
