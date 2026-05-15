import { useNavigate, useLocation } from "react-router-dom";
import {
  DGII_PRUEBA_TYPES,
  DEFAULT_DGII_PRUEBA_PATH,
  findDgiiPruebaByPath,
} from "../config/dgiiPruebas";

type Props = {
  className?: string;
  /** Select más compacto en barra superior */
  compact?: boolean;
};

export default function DgiiPruebaTypeSelect({ className = "", compact = false }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const current = findDgiiPruebaByPath(pathname)?.id ?? DGII_PRUEBA_TYPES[0].id;

  return (
    <div className={className}>
      <label
        htmlFor="dgii-prueba-type"
        className={`block font-medium text-slate-700 ${compact ? "text-xs mb-1" : "text-sm mb-1.5"}`}
      >
        Tipo de prueba
      </label>
      <select
        id="dgii-prueba-type"
        value={current}
        onChange={(e) => {
          const next = DGII_PRUEBA_TYPES.find((t) => t.id === e.target.value);
          navigate(next?.path ?? DEFAULT_DGII_PRUEBA_PATH);
        }}
        className={`w-full rounded-lg border border-slate-300 bg-white text-slate-900 shadow-sm focus:border-[#0b57d0] focus:outline-none focus:ring-2 focus:ring-blue-100 ${
          compact ? "text-sm py-2 px-3" : "text-sm py-2.5 px-3"
        }`}
      >
        {DGII_PRUEBA_TYPES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.paso} — {t.label}
          </option>
        ))}
      </select>
      {!compact && findDgiiPruebaByPath(pathname) && (
        <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
          {findDgiiPruebaByPath(pathname)?.description}
        </p>
      )}
    </div>
  );
}
