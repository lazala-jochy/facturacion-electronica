import { useRef } from "react";

export type EcfExcelSelection = {
  fileName: string;
  filePath?: string;
  fileSize?: number;
  fileLastModified?: number;
};

type Props = {
  selection: EcfExcelSelection | undefined;
  onSelect: (excel: EcfExcelSelection, file?: File) => void;
  onClear: () => void;
};

export function isEcfExcelFileName(name: string): boolean {
  return /\.(xlsx|xls)$/i.test(name.trim());
}

export function ecfExcelSelectionFromFile(file: File, filePath?: string): EcfExcelSelection {
  return {
    fileName: file.name,
    fileSize: file.size,
    fileLastModified: file.lastModified,
    filePath: filePath?.trim() || undefined,
  };
}

export default function EcfExcelSelector({ selection, onSelect, onClear }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const electron = window.electronAPI;
  const canPickFile = !!electron?.pickEcfExcelFile;

  const applyFile = (file: File, filePath?: string) => {
    if (!isEcfExcelFileName(file.name)) {
      window.alert("Elegí un archivo Excel (.xlsx o .xls) del set de pruebas e-CF DGII.");
      return;
    }
    onSelect(ecfExcelSelectionFromFile(file, filePath), file);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) applyFile(file);
    e.target.value = "";
  };

  const browseElectron = async () => {
    if (!electron?.pickEcfExcelFile) return;
    const picked = await electron.pickEcfExcelFile();
    if (!picked) return;
    onSelect({
      fileName: picked.name,
      filePath: picked.path,
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-3">
      <div>
        <label htmlFor="ecf-batch-excel-file" className="block text-sm font-medium text-slate-900">
          Excel DGII — Pruebas de datos e-CF
        </label>
        <p className="mt-1 text-xs text-slate-600 leading-relaxed">
          Archivo del portal CerteCF (Paso 2 — Datos e-CF), con hojas <strong>eCF</strong> y opcional{" "}
          <strong>rFCE</strong>. No modifiques columnas ni formatos del set oficial.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
        <input
          ref={inputRef}
          id="ecf-batch-excel-file"
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={onInputChange}
          className="block w-full max-w-md text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-[#15803d] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[#166534]"
        />
        {canPickFile && (
          <button
            type="button"
            onClick={() => void browseElectron()}
            className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap"
          >
            Buscar en el equipo…
          </button>
        )}
        {selection && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap"
          >
            Quitar archivo
          </button>
        )}
      </div>

      {selection ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-2.5 text-sm text-emerald-950 space-y-1">
          <p>
            <span className="font-medium">Seleccionado:</span>{" "}
            <code className="text-xs bg-white/80 px-1.5 py-0.5 rounded break-all">{selection.fileName}</code>
          </p>
          {selection.filePath && (
            <p className="text-xs break-all text-emerald-900">
              Ruta: <code className="bg-white/70 px-1 rounded">{selection.filePath}</code>
            </p>
          )}
          {selection.fileSize != null && selection.fileSize > 0 && (
            <p className="text-xs text-emerald-800">
              Tamaño: {(selection.fileSize / 1024).toFixed(1)} KB
              {selection.fileLastModified
                ? ` · ${new Date(selection.fileLastModified).toLocaleString("es-DO")}`
                : ""}
            </p>
          )}
          {!selection.filePath && (
            <p className="text-xs text-emerald-800">
              Podés generar XML en la misma sesión. Si recargás la página, volvé a elegir el archivo.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Elegí el Excel de pruebas antes de generar los comprobantes.
        </p>
      )}
    </div>
  );
}
