import { useEffect, useMemo, useRef, useState } from "react";
import { UNIDAD_MEDIDA_OPTIONS } from "../config/unidadesMedida";

type Props = {
  value: string;
  onChange: (value: string) => void;
  customUnits: string[];
  onAddCustomUnit: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

const VISIBLE_ROWS = 10;
const ROW_HEIGHT_PX = 34;

/**
 * Selector de unidad de medida con búsqueda, en un modal (no un dropdown flotante): el
 * catálogo DGII tiene ~60 unidades y el campo vive dentro de una tabla con scroll horizontal
 * (overflow-x-auto), que recorta cualquier panel flotante posicionado fuera de esa área. El
 * modal evita ese recorte. La lista muestra un tamaño fijo (10 filas) y hace scroll para el
 * resto. Si lo escrito no existe en el catálogo, se puede agregar como unidad nueva
 * (persistente vía onAddCustomUnit).
 */
export default function UnidadMedidaSelect({
  value,
  onChange,
  customUnits,
  onAddCustomUnit,
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const allOptions = useMemo(() => {
    const extra = customUnits.filter(
      (u) => !UNIDAD_MEDIDA_OPTIONS.some((o) => o.value === u),
    );
    const base = [...UNIDAD_MEDIDA_OPTIONS, ...extra.map((u) => ({ value: u, label: u }))];
    return base.some((o) => o.value === value)
      ? base
      : [{ value, label: value }, ...base];
  }, [customUnits, value]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? allOptions.filter((o) => o.label.toLowerCase().includes(normalizedQuery))
    : allOptions;

  const exactMatch = allOptions.some((o) => o.label.toLowerCase() === normalizedQuery);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    close();
  };

  const handleAddNew = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    onAddCustomUnit(trimmed);
    handleSelect(trimmed);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        className={
          className ??
          "flex w-full items-center justify-between gap-1 rounded border border-slate-200 bg-white px-1 py-0.5 text-left text-xs disabled:bg-slate-100 disabled:text-slate-500"
        }
      >
        <span className="truncate">{value || "Seleccionar…"}</span>
        <span className="shrink-0 text-slate-400">▾</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <div
            className="flex w-full max-w-sm flex-col rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Unidad de medida</h3>
              <button
                type="button"
                onClick={close}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="px-4 pt-3">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar unidad…"
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                onKeyDown={(e) => {
                  if (e.key === "Escape") close();
                  else if (e.key === "Enter") {
                    e.preventDefault();
                    if (filtered.length > 0) handleSelect(filtered[0].value);
                    else if (query.trim()) handleAddNew();
                  }
                }}
              />
            </div>

            <ul
              className="mt-2 overflow-y-auto px-2 pb-2"
              style={{ maxHeight: `${VISIBLE_ROWS * ROW_HEIGHT_PX}px` }}
            >
              {filtered.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => handleSelect(o.value)}
                    className={`block w-full rounded px-2 py-2 text-left text-sm hover:bg-blue-50 ${
                      o.value === value ? "bg-blue-50 font-medium text-blue-700" : "text-slate-700"
                    }`}
                  >
                    {o.label}
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-2 py-2 text-sm text-slate-400">Sin resultados</li>
              )}
            </ul>

            {query.trim() && !exactMatch && (
              <div className="border-t border-slate-200 p-3">
                <button
                  type="button"
                  onClick={handleAddNew}
                  className="block w-full rounded-lg bg-[#0b57d0] px-4 py-2 text-center text-sm font-semibold text-white hover:bg-[#0948ad]"
                >
                  + Agregar “{query.trim()}” como nueva unidad
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
