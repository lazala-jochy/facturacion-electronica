import type { DgiiResponseModalPayload } from "./DgiiResponseModal";

type Props = {
  status?: string | null;
  summary?: string | null;
  fullMessage?: string | null;
  rawResponse?: string | null;
  trackId?: string | null;
  cotNumber?: number;
  onViewFull: (payload: DgiiResponseModalPayload) => void;
  className?: string;
};

/** Resumen corto + enlace para abrir el mensaje DGII completo. */
export default function DgiiRejectionHint({
  status,
  summary,
  fullMessage,
  rawResponse,
  trackId,
  cotNumber,
  onViewFull,
  className = "",
}: Props) {
  const s = summary?.trim() ?? "";
  const full = fullMessage?.trim() ?? "";
  const raw = rawResponse?.trim() ?? "";
  if (status !== "rejected" && !s && !full && !raw) return null;

  const canExpand = Boolean(full || raw || s);

  return (
    <div className={className}>
      {s ? (
        <p className="text-[10px] leading-snug text-amber-950 line-clamp-3 sm:text-xs">{s}</p>
      ) : null}
      {canExpand ? (
        <button
          type="button"
          onClick={() =>
            onViewFull({
              title:
                cotNumber != null
                  ? `Respuesta DGII · cotización #${cotNumber}`
                  : "Respuesta DGII",
              status: status ?? "rejected",
              trackId,
              summary: s || null,
              fullMessage: full || s || null,
              rawResponse: raw || null,
            })
          }
          className="mt-1 text-left text-[10px] font-semibold text-[#0b57d0] hover:underline sm:text-xs"
        >
          Ver mensaje completo
        </button>
      ) : null}
    </div>
  );
}
