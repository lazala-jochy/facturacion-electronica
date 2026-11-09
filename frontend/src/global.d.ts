export {};

type UpdateStatus =
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "not-available" }
  | { status: "downloading"; percent: number }
  | { status: "downloaded"; version: string }
  | { status: "error"; message: string };

declare global {
  interface Window {
    electronAPI?: {
      getDesktopParentPath: () => Promise<string>;
      /** Abre el buscador del sistema; devuelve la ruta elegida o null si canceló. */
      pickOutputParentFolder: () => Promise<string | null>;
      pickAcecfExcelFile: () => Promise<{ path: string; name: string } | null>;
      pickEcfExcelFile: () => Promise<{ path: string; name: string } | null>;
      /** Version actual de la app empaquetada (electron/package.json). */
      getAppVersion: () => Promise<string>;
      /** Dispara un chequeo manual de actualizaciones (electron-updater). */
      checkForUpdates: () => Promise<{ ok: boolean; message?: string }>;
      /** Suscribe a eventos de estado del auto-updater; devuelve funcion para desuscribirse. */
      onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
    };
  }
}
