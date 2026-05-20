import { useState } from "react";

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
  const [showTechnical, setShowTechnical] = useState(false);

  if (!open || !payload) return null;

  const dgiiMessage =
    payload.fullMessage?.trim() || payload.summary?.trim() || "";
  const prettyRaw = payload.rawResponse?.trim() ? prettyJson(payload.rawResponse) : "";

  const copyMessage = () => {
    void navigator.clipboard.writeText(dgiiMessage);
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

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {dgiiMessage ? (
            <section className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-950">
                Mensaje DGII
              </h4>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-amber-950">
                {dgiiMessage}
              </p>
            </section>
          ) : (
            <p className="text-sm text-slate-600">No hay mensaje de DGII registrado.</p>
          )}

          {prettyRaw ? (
            <details
              className="mt-6 rounded-lg border border-slate-200 bg-slate-50/80"
              open={showTechnical}
              onToggle={(e) => setShowTechnical(e.currentTarget.open)}
            >
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-600">
                Respuesta técnica (JSON)
              </summary>
              <pre className="max-h-48 overflow-auto border-t border-slate-200 px-3 py-2 text-[11px] text-slate-700 whitespace-pre-wrap break-words">
                {prettyRaw}
              </pre>
            </details>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-5">
          {dgiiMessage ? (
            <button
              type="button"
              onClick={copyMessage}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Copiar mensaje
            </button>
          ) : null}
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
