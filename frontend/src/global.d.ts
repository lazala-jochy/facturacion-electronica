export {};

declare global {
  interface Window {
    electronAPI?: {
      getDesktopParentPath: () => Promise<string>;
      /** Abre el buscador del sistema; devuelve la ruta elegida o null si canceló. */
      pickOutputParentFolder: () => Promise<string | null>;
      pickAcecfExcelFile: () => Promise<{ path: string; name: string } | null>;
      pickEcfExcelFile: () => Promise<{ path: string; name: string } | null>;
    };
  }
}
