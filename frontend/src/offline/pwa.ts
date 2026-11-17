/**
 * Registra el service worker del shell offline. Nunca en Electron (`file://` no lo soporta
 * bien y ahí ya funciona offline de forma nativa, sin necesidad de esto).
 *
 * Se registra con ruta y scope ABSOLUTOS ("/sw.js", scope "/") a propósito: el build usa
 * `base: "./"` (necesario para que Electron cargue el bundle desde file://), lo que generaría
 * una ruta relativa al sw.js -- y una recarga en una ruta anidada (ej. /cotizaciones/1/editar)
 * resolvería mal esa ruta relativa. Con rutas absolutas no importa desde qué URL se registre.
 *
 * Auto-actualiza sin preguntar: una vez que el navegador detecta un SW nuevo instalado, activa
 * y recarga solo. Es más seguro que dejar JS viejo dando vueltas (así se rompió el blank-screen
 * bug que se arregló en backend/src/index.ts -- la versión nueva precacheada siempre referencia
 * archivos que sí existen).
 */
export function registerOfflineServiceWorker(): void {
  if (window.electronAPI || window.location.protocol === "file:") return;
  if (!("serviceWorker" in navigator)) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              // Hay una versión nueva instalada y en espera: la activa de una vez (el SW
              // generado por Workbox escucha este mensaje y llama a skipWaiting()).
              installing.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") void registration.update();
        });
      })
      .catch((err) => {
        console.error("No se pudo registrar el service worker offline.", err);
      });
  });
}
