import { useRef } from "react";
import {
  excelSelectionFromFile,
  isAcecfExcelFileName,
  type AcecfExcelSelection,
} from "../services/dgiiAprobacionesComerciales";

type Props = {
  selection: AcecfExcelSelection | undefined;
  onSelect: (excel: AcecfExcelSelection, file?: File) => void;
  onClear: () => void;
};

export default function AcecfExcelSelector({ selection, onSelect, onClear }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const electron = window.electronAPI;
  const canPickFile = !!electron?.pickAcecfExcelFile;

  const applyFile = (file: File, filePath?: string) => {
    if (!isAcecfExcelFileName(file.name)) {
      window.alert("Elegí un archivo Excel (.xlsx o .xls) del set de aprobaciones comerciales DGII.");
      return;
    }
    onSelect(excelSelectionFromFile(file, filePath), file);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) applyFile(file);
    e.target.value = "";
  };

  const browseElectron = async () => {
    if (!electron?.pickAcecfExcelFile) return;
    const picked = await electron.pickAcecfExcelFile();
    if (!picked) return;
    onSelect({
      fileName: picked.name,
      filePath: picked.path,
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-3">
      <div>
        <label htmlFor="acecf-excel-file" className="block text-sm font-medium text-slate-900">
          Excel DGII — Aprobaciones comerciales
        </label>
        <p className="mt-1 text-xs text-slate-600 leading-relaxed">
          Archivo que descargás del portal CerteCF (Paso 3), p. ej.{" "}
          <code className="text-[11px] bg-slate-100 px-1 rounded">04900920846-15052026124136.xlsx</code>, con hoja{" "}
          <strong>ACEECF_Generadas</strong> y <strong>11 filas</strong>. No modifiques columnas ni formatos.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
        <input
          ref={inputRef}
          id="acecf-excel-file"
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={onInputChange}
          className="block w-full max-w-md text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-[#0b57d0] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[#0a4fc4]"
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
              Podés generar y firmar ACECF con este archivo en la misma sesión. Si recargás la página, volvé a
              seleccionarlo.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Todavía no elegiste el Excel. Descargalo del portal CerteCF (Paso 3 — Aprobaciones comerciales) y
          seleccionarlo aquí.
        </p>
      )}
    </div>
  );
}
