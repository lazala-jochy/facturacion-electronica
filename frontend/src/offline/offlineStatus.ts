import type { OfflineCotizacion } from "./db";

export const offlineStatusLabel: Record<OfflineCotizacion["status"], string> = {
  pendiente: "Pendiente de sincronizar",
  sincronizando: "Sincronizando…",
  error: "Reintentando…",
  error_permanente: "No se pudo sincronizar",
};

export const offlineStatusClass: Record<OfflineCotizacion["status"], string> = {
  pendiente: "bg-amber-100 text-amber-800 border-amber-200",
  sincronizando: "bg-blue-100 text-blue-800 border-blue-200",
  error: "bg-amber-100 text-amber-800 border-amber-200",
  error_permanente: "bg-red-100 text-red-800 border-red-200",
};
