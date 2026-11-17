import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { OfflineCotizacion } from "../offline/db";
import { getOfflineCotizacion } from "../offline/offlineQueue";
import { getCachedCompanyProfile } from "../offline/cacheRefresh";
import { itemLineTotalValue } from "../utils/tax";
import type { AuthCompany } from "../types/session";

/**
 * Comprobante NO fiscal: una venta hecha sin conexión todavía no tiene NCF ni firma DGII (eso
 * requiere internet). Esto es un borrador para el cliente mientras tanto; el comprobante oficial
 * (con QR y sello DGII) se genera recién cuando la venta se sincroniza y se envía a DGII.
 */
export default function OfflineDraftPrint() {
  const { localId } = useParams<{ localId: string }>();
  const [entry, setEntry] = useState<OfflineCotizacion | null | undefined>(undefined);
  const [company, setCompany] = useState<AuthCompany | null>(null);

  useEffect(() => {
    if (!localId) return;
    void getOfflineCotizacion(localId).then((e) => setEntry(e ?? null));
    void getCachedCompanyProfile().then((p) => setCompany(p?.company ?? null));
  }, [localId]);

  useEffect(() => {
    if (entry) setTimeout(() => window.print(), 300);
  }, [entry]);

  if (entry === undefined) return null;
  if (entry === null) {
    return (
      <div className="p-6 text-sm text-slate-600">
        No se encontró este borrador (puede que ya se haya sincronizado).{" "}
        <Link to="/cotizaciones/nueva" className="text-indigo-600 underline">
          Volver
        </Link>
      </div>
    );
  }

  const { client, cotizacion, items } = entry.payload;
  const createdAt = new Date(entry.createdAt);

  return (
    <div className="mx-auto max-w-2xl p-6 text-slate-900 print:p-0">
      <div className="mb-4 flex items-center justify-between rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 print:border print:bg-white">
        BORRADOR — PENDIENTE DE ENVÍO A DGII (sin conexión al crearse)
      </div>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">{company?.name ?? "Empresa"}</h1>
          <p className="text-xs text-slate-600">RNC: {company?.rnc ?? "—"}</p>
          <p className="text-xs text-slate-600">{company?.address ?? ""}</p>
        </div>
        <div className="text-right text-xs text-slate-600">
          <p>{createdAt.toLocaleString("es-DO")}</p>
          <p className="font-mono">Ref. local: {entry.localId.slice(0, 8)}</p>
        </div>
      </div>

      <div className="mb-4 rounded border border-slate-200 p-3 text-sm">
        <p className="font-semibold">{client.name}</p>
        <p className="text-xs text-slate-600">RNC/Cédula: {client.rnc_cedula}</p>
        {client.address && <p className="text-xs text-slate-600">{client.address}</p>}
        {client.phone && <p className="text-xs text-slate-600">Tel: {client.phone}</p>}
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-300 text-left">
            <th className="py-1">Descripción</th>
            <th className="py-1 text-right">Cant.</th>
            <th className="py-1 text-right">P. Unit.</th>
            <th className="py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-1">{it.description}</td>
              <td className="py-1 text-right">
                {it.quantity} {it.unit}
              </td>
              <td className="py-1 text-right">RD$ {it.unit_price.toFixed(2)}</td>
              <td className="py-1 text-right">
                RD$ {itemLineTotalValue(it.quantity, it.unit_price).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 ml-auto w-48 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-600">Subtotal</span>
          <span>RD$ {(cotizacion.subtotal ?? 0).toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">ITBIS</span>
          <span>RD$ {(cotizacion.itbis ?? 0).toFixed(2)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-300 pt-1 font-semibold">
          <span>Total</span>
          <span>RD$ {(cotizacion.total ?? 0).toFixed(2)}</span>
        </div>
      </div>

      <p className="mt-6 text-center text-[11px] text-slate-500">
        Este documento no tiene valor fiscal. El comprobante electrónico oficial (e-CF, con número
        y sello DGII) se genera automáticamente al recuperar la conexión.
      </p>

      <div className="mt-4 text-center print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Imprimir
        </button>
      </div>
    </div>
  );
}
