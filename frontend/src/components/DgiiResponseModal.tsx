import { useMemo } from "react";

export type DgiiResponseModalPayload = {
  title?: string;
  status?: string | null;
  trackId?: string | null;
  summary?: string | null;
  fullMessage?: string | null;
  rawResponse?: string | null;
};

type Props = {
  open: boolean;
  payload: DgiiResponseModalPayload | null;
  onClose: () => void;
};

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default function DgiiResponseModal({ open, payload, onClose }: Props) {
  const displayMessage = useMemo(() => {
    const full = payload?.fullMessage?.trim() ?? "";
    const summary = payload?.summary?.trim() ?? "";
    return full || summary || "";
  }, [payload?.fullMessage, payload?.summary]);

  const prettyRaw = useMemo(
    () => (payload?.rawResponse?.trim() ? prettyJson(payload.rawResponse) : ""),
    [payload?.rawResponse],
  );

  if (!open || !payload) return null;

  const copyText = () => {
    const parts = [displayMessage, payload.rawResponse?.trim() ? `\n---\n${prettyRaw}` : ""]
      .filter(Boolean)
      .join("");
    void navigator.clipboard.writeText(parts || prettyRaw);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dgii-response-modal-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h3 id="dgii-response-modal-title" className="text-lg font-semibold text-slate-900">
              {payload.title ?? "Respuesta DGII"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {payload.status ? `Estado: ${payload.status}` : null}
              {payload.status && payload.trackId ? " · " : null}
              {payload.trackId ? `Track ID: ${payload.trackId}` : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 space-y-4">
          {displayMessage ? (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Mensaje DGII
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-900">
                {displayMessage}
              </p>
            </section>
          ) : (
            <p className="text-sm text-slate-600">
              No hay mensaje legible; revisá la respuesta técnica abajo.
            </p>
          )}

          {payload.rawResponse?.trim() ? (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Respuesta técnica (JSON)
              </p>
              <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 whitespace-pre-wrap break-words">
                {prettyRaw}
              </pre>
            </section>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={copyText}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Copiar mensaje
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#0b57d0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0948ad]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
