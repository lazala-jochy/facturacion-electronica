/**
 * Registra el service worker del shell offline. Nunca en Electron (`file://` no lo soporta
 * bien y ahí ya funciona offline de forma nativa, sin necesidad de esto).
 *
 * Se registra con ruta y scope ABSOLUTOS ("/sw.js", scope "/") a propósito: el build usa
 * `base: "./"` (necesario para que Electron cargue el bundle desde file://), lo que generaría
 * una ruta relativa al sw.js -- y una recarga en una ruta anidada (ej. /cotizaciones/1/editar)
 * resolvería mal esa ruta relativa. Con rutas absolutas no importa desde qué URL se registre.
 *
 * El SW generado (vite.config.ts: skipWaiting+clientsClaim) activa y toma control de las
 * pestañas abiertas apenas hay una versión nueva, sin esperar a que cierren todas las pestañas.
 * Acá solo hace falta recargar la página cuando eso pasa, para que el JS ya cargado en memoria
 * se actualice también (el SW nuevo controla los fetches, pero no reescribe la pestaña sola).
 */
export function registerOfflineServiceWorker(): void {
  if (window.electronAPI || window.location.protocol === "file:") return;
  if (!("serviceWorker" in navigator)) return;

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        // Revisa si hay una versión nueva cada vez que vuelve la pestaña a primer plano
        // (evita quedarse con JS viejo por días en un equipo que nunca cierra el navegador).
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") void registration.update();
        });
      })
      .catch((err) => {
        console.error("No se pudo registrar el service worker offline.", err);
      });
  });
}
