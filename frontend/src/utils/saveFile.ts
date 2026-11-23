type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
};

type FileSystemWindow = Window & {
  showSaveFilePicker?: (options: SaveFilePickerOptions) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

const triggerBrowserDownload = (blob: Blob, suggestedName: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

/**
 * Guarda un blob dejando que el usuario elija carpeta/nombre (File System Access API) cuando el
 * navegador lo soporta (Chrome/Edge); si no, cae a la descarga automática de siempre a la carpeta
 * de Descargas. Si el usuario cancela el diálogo, no hace nada (no se interpreta como error).
 */
export const saveFile = async (
  blob: Blob,
  suggestedName: string,
  types?: SaveFilePickerOptions["types"],
): Promise<void> => {
  const picker = (window as FileSystemWindow).showSaveFilePicker;
  if (typeof picker === "function") {
    try {
      const handle = await picker({ suggestedName, types });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      // Cualquier otro error del picker (p.ej. permiso denegado): cae a la descarga clásica.
    }
  }
  triggerBrowserDownload(blob, suggestedName);
};

export const PDF_FILE_TYPES = [
  { description: "PDF", accept: { "application/pdf": [".pdf"] } },
];

export const XML_FILE_TYPES = [
  { description: "XML", accept: { "application/xml": [".xml"] } },
];

export const ZIP_FILE_TYPES = [
  { description: "ZIP", accept: { "application/zip": [".zip"] } },
];
