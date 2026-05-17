import { useState } from "react";
import type { AuthCompany } from "../types/session";
import {
  downloadConsumoMenor250Integra,
  submitConsumoMenor250Rfce,
} from "../services/cotizaciones";
import { isConsumoMenor250Rfce } from "../config/ecfTipos";
import { formatEcfNumberDisplay } from "../utils/ecfNumber";

function downloadXmlBlob(xml: string, filename: string) {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

type Props = {
  cotizacionId: number;
  ecfTipo?: string;
  total: number;
  ecfNcfSeq?: number;
  dgiiStatus?: string | null;
  company?: AuthCompany | null;
  certificateEncryptionSecret: string;
  disabled?: boolean;
  onStatusChange?: () => void;
  onError?: (msg: string) => void;
  onSuccess?: (msg: string) => void;
};

export default function ConsumoMenor250RfceActions({
  cotizacionId,
  ecfTipo,
  total,
  ecfNcfSeq,
  dgiiStatus,
  company,
  certificateEncryptionSecret,
  disabled,
  onStatusChange,
  onError,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);

  if (!isConsumoMenor250Rfce(ecfTipo, total)) return null;

  const encForSign =
    certificateEncryptionSecret.trim() || company?.certificate_keyphrase?.trim() || "";
  const certReady = Boolean(company?.certificateConfigured && encForSign.length >= 8);
  const encfLabel = formatEcfNumberDisplay(ecfTipo, ecfNcfSeq ?? null).replace(/[^\w.-]/g, "") || "consumo";
  const accepted = dgiiStatus === "accepted";
  const primaryLabel = loading
    ? accepted
      ? "Descargando…"
      : "Enviando RFCE…"
    : accepted
      ? "Descargar íntegro"
      : dgiiStatus === "rejected"
        ? "Reenviar RFCE"
        : "Enviar RFCE (32 <250k)";

  const handlePrimary = async () => {
    setLoading(true);
    try {
      if (accepted) {
        const xml = await downloadConsumoMenor250Integra(cotizacionId);
        if (!xml.trim()) throw new Error("XML vacío.");
        downloadXmlBlob(xml, `ECF-${encfLabel}.xml`);
        onSuccess?.("e-CF íntegro descargado. Subilo a CerteCF «Facturas de consumo <250Mil».");
        return;
      }
      if (!certReady) {
        onError?.(
          "Configurá el certificado y la clave de cifrado (Perfil de empresa) para el flujo RFCE.",
        );
        return;
      }
      const out = await submitConsumoMenor250Rfce(cotizacionId, {
        certificateEncryptionSecret: encForSign,
      });
      onSuccess?.(out.message);
      onStatusChange?.();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Error en flujo RFCE.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-stretch gap-1 min-w-[10.5rem]">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-900 text-center">
        Flujo 32 RFCE
      </span>
      <button
        type="button"
        onClick={() => void handlePrimary()}
        disabled={
          disabled ||
          loading ||
          (!accepted && (!certReady || dgiiStatus === "pending"))
        }
        className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${
          accepted
            ? "border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700"
            : "border-amber-500 bg-amber-500 text-white hover:bg-amber-600"
        }`}
        title={
          accepted
            ? "Descarga el e-CF íntegro ya firmado (mismo del RFCE enviado)"
            : "Genera RFCE + e-CF íntegro y envía el resumen RFCE a DGII"
        }
      >
        {primaryLabel}
      </button>
      {accepted ? (
        <p className="text-[10px] leading-snug text-emerald-800 text-center">
          Subí el XML al portal &lt;250Mil.
        </p>
      ) : (
        <p className="text-[10px] leading-snug text-amber-900/90 text-center">
          Paso 1: RFCE a DGII. Paso 2: descargar íntegro y subir manual.
        </p>
      )}
    </div>
  );
}
