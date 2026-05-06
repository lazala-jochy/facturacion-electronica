import type { DgiiSubmissionResult } from "../types/dgiiEcf";

export type { DgiiSubmissionResult } from "../types/dgiiEcf";

const makeTrackId = () => `DGII-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

/** Texto útil cuando `fetch` falla (Node suele poner detalle en `cause` y poco en el mensaje). */
export function describeFetchFailure(err: unknown, endpoint: string): string {
  let host = endpoint;
  try {
    const u = new URL(endpoint);
    host = u.port ? `${u.hostname}:${u.port}` : u.hostname;
  } catch {
    /* URL inválida: mostrar tal cual acotado */
    host = endpoint.length > 120 ? `${endpoint.slice(0, 120)}…` : endpoint;
  }

  const bits: string[] = [];

  const pushCauseChain = (e: unknown, depth: number) => {
    if (depth > 4 || e == null) return;
    if (e instanceof Error) {
      if (e.message.trim()) bits.push(e.message.trim());
      const c = (e as Error & { cause?: unknown }).cause;
      if (c) pushCauseChain(c, depth + 1);
      const code = (e as NodeJS.ErrnoException).code;
      if (code && !bits.some((b) => b.includes(code))) bits.push(`código ${code}`);
    } else if (typeof e === "object" && e !== null && "message" in e) {
      bits.push(String((e as { message: unknown }).message));
    } else {
      bits.push(String(e));
    }
  };

  pushCauseChain(err, 0);

  if (bits.length === 0) bits.push("fallo de red desconocido");

  const detail = [...new Set(bits)].join(" · ");
  return `No se pudo conectar con el servidor DGII (${host}). ${detail}`;
}

const submitMock = async (signedXml: string): Promise<DgiiSubmissionResult> => {
  const accepted = signedXml.length > 0;
  return {
    accepted,
    status: accepted ? "accepted" : "rejected",
    trackId: makeTrackId(),
    rawResponse: JSON.stringify({
      mode: "mock",
      accepted,
      message: accepted ? "e-CF recibido por DGII (mock)." : "e-CF rechazado (mock).",
    }),
  };
};

export const submitEcfToDgii = async (
  signedXml: string,
  opts?: {
    /** Si la empresa definió URL en perfil, tiene prioridad sobre DGII_ECF_ENDPOINT. */
    endpoint?: string | null;
    bearerToken?: string | null;
  },
): Promise<DgiiSubmissionResult> => {
  const endpoint = (opts?.endpoint?.trim() || process.env.DGII_ECF_ENDPOINT?.trim()) ?? "";
  const token = (opts?.bearerToken?.trim() || process.env.DGII_ECF_TOKEN?.trim()) ?? "";

  if (!endpoint) {
    return submitMock(signedXml);
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: signedXml,
    });
  } catch (e) {
    throw new Error(describeFetchFailure(e, endpoint));
  }

  let rawResponse: string;
  try {
    rawResponse = await response.text();
  } catch (e) {
    throw new Error(
      `${describeFetchFailure(e, endpoint)} (al leer la respuesta HTTP ${response.status}).`,
    );
  }
  const trackId =
    response.headers.get("x-track-id") ??
    response.headers.get("track-id") ??
    makeTrackId();
  const accepted = response.ok;

  return {
    accepted,
    status: accepted ? "accepted" : "rejected",
    trackId,
    rawResponse,
  };
};
