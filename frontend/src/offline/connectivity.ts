import { useEffect, useState } from "react";
import { apiUrl } from "../services/api";

/**
 * `navigator.onLine` miente: dice "online" con wifi conectado aunque no haya
 * internet real. Se confirma con un heartbeat propio contra `/health` del backend.
 *
 * Timeout generoso (15s) porque en Render (plan free) el servicio "duerme" tras inactividad y
 * el primer request tras despertar puede tardar bastante -- un timeout corto marcaría "sin
 * conexión" aunque el usuario sí tenga internet, solo que el backend está arrancando. Esto es
 * solo para el BANNER informativo; la decisión real de "¿guardo online o pongo en cola?" nunca
 * depende de este valor cacheado (ver CotizacionCreate.tsx: siempre intenta guardar en línea
 * primero y solo cae a la cola si esa llamada puntual falla de verdad).
 */
const HEARTBEAT_MS = 20_000;
const HEARTBEAT_TIMEOUT_MS = 15_000;

type Listener = (online: boolean) => void;

let online = navigator.onLine;
const listeners = new Set<Listener>();
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let started = false;

const notify = (next: boolean) => {
  if (next === online) return;
  online = next;
  listeners.forEach((l) => l(online));
};

async function probe(): Promise<boolean> {
  if (!navigator.onLine) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiUrl}/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

const runHeartbeat = () => {
  void probe().then(notify);
};

/** Arranca el heartbeat una sola vez por sesión del navegador (llamar desde App). */
export function startConnectivityWatch(): void {
  if (started) return;
  started = true;
  window.addEventListener("online", runHeartbeat);
  window.addEventListener("offline", () => notify(false));
  runHeartbeat();
  heartbeatTimer = setInterval(runHeartbeat, HEARTBEAT_MS);
}

export function stopConnectivityWatch(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  started = false;
}

export const isOnline = (): boolean => online;

/** Fuerza una verificación inmediata (ej. tras una acción del usuario que falló por red). */
export const checkConnectivityNow = (): Promise<boolean> => probe().then((next) => {
  notify(next);
  return next;
});

export function subscribeConnectivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOnlineStatus(): boolean {
  const [value, setValue] = useState(online);
  useEffect(() => subscribeConnectivity(setValue), []);
  return value;
}
