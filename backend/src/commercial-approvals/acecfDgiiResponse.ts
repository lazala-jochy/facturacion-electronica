/**
 * Respuestas DGII — Paso 3 Aprobaciones o Rechazos Comerciales (ACECF).
 * Documentación: estado satisfactorio «OK»; no satisfactorio «Error» o «Incorrecto».
 * (Distinto del TrackId de e-CF: Aceptado / Rechazado / Aceptado Condicional / En Proceso.)
 */

export type AcecfDgiiValidation = "OK" | "ERROR" | "INCORRECTO" | "UNKNOWN";

export type AcecfDgiiSendResult = {
  validation: AcecfDgiiValidation;
  /** Alias documentación DGII: true solo si validation === "OK". */
  accepted: boolean;
  message: string;
  encf: string;
  rawResponse: string;
  httpStatus: number;
  responseContentType?: string;
  /** Código numérico DGII cuando exista (p. ej. 1 aceptado en otros servicios). */
  codigo: number | null;
};

const norm = (s: string) => s.trim().toLowerCase();

function validationFromToken(token: string): AcecfDgiiValidation | null {
  const t = norm(token);
  if (t === "ok" || t === "aceptado" || t === "satisfactorio") return "OK";
  if (t === "incorrecto") return "INCORRECTO";
  if (t === "error" || t === "rechazado" || t === "rechazada") return "ERROR";
  return null;
}

function messageForValidation(v: AcecfDgiiValidation, detail: string): string {
  if (v === "OK") return detail || "Validación DGII: OK (satisfactorio).";
  if (v === "INCORRECTO") return detail || "Validación DGII: Incorrecto (no satisfactorio).";
  if (v === "ERROR") return detail || "Validación DGII: Error (no satisfactorio).";
  return detail || "Validación DGII: respuesta no reconocida.";
}

/** Parsea cuerpo de respuesta del servicio de aprobación comercial. */
export function parseAcecfDgiiValidationResponse(
  raw: string,
  httpStatus: number,
  contentType?: string,
): AcecfDgiiSendResult {
  const trimmed = raw.trim();
  const base = {
    rawResponse: raw,
    httpStatus,
    responseContentType: contentType,
    encf: "",
    codigo: null as number | null,
  };

  if (!trimmed) {
    return {
      ...base,
      validation: "UNKNOWN",
      accepted: false,
      message: "Respuesta DGII vacía.",
    };
  }

  const whole = validationFromToken(trimmed.replace(/[."']/g, ""));
  if (whole) {
    return {
      ...base,
      validation: whole,
      accepted: whole === "OK",
      message: messageForValidation(whole, trimmed),
    };
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed.codigo === "number") base.codigo = parsed.codigo;
    if (typeof parsed.encf === "string") base.encf = parsed.encf.trim();

    const candidates = [
      parsed.validacion,
      parsed.validación,
      parsed.resultado,
      parsed.estado,
      parsed.status,
      parsed.mensaje,
      parsed.message,
    ];
    for (const c of candidates) {
      if (typeof c === "string") {
        const v = validationFromToken(c);
        if (v) {
          const msgs = Array.isArray(parsed.mensajes)
            ? (parsed.mensajes as unknown[])
                .map((m) =>
                  typeof m === "object" && m && "valor" in m
                    ? String((m as { valor: unknown }).valor)
                    : String(m),
                )
                .join("; ")
            : "";
          return {
            ...base,
            validation: v,
            accepted: v === "OK",
            message: messageForValidation(v, msgs || c),
          };
        }
      }
    }

    if (base.codigo === 1 || base.codigo === 4) {
      return {
        ...base,
        validation: "OK",
        accepted: true,
        message: messageForValidation("OK", `codigo=${base.codigo}`),
      };
    }
    if (base.codigo === 2) {
      return {
        ...base,
        validation: "ERROR",
        accepted: false,
        message: messageForValidation("ERROR", `codigo=${base.codigo}`),
      };
    }
  } catch {
    // XML o texto
  }

  const encfXml = trimmed.match(/<eNCF>\s*([^<\s]+)\s*<\/eNCF>/i)?.[1]?.trim();
  if (encfXml) base.encf = encfXml;

  const codigoXml = trimmed.match(/<codigo>\s*(\d+)\s*<\/codigo>/i);
  if (codigoXml) base.codigo = Number(codigoXml[1]);

  const estadoXml = trimmed.match(/<estado>\s*([^<]+)\s*<\/estado>/i)?.[1]?.trim() ?? "";
  const vXml = validationFromToken(estadoXml);
  if (vXml) {
    return {
      ...base,
      validation: vXml,
      accepted: vXml === "OK",
      message: messageForValidation(vXml, estadoXml),
    };
  }

  if (/\bincorrecto\b/i.test(trimmed)) {
    return {
      ...base,
      validation: "INCORRECTO",
      accepted: false,
      message: messageForValidation("INCORRECTO", compactSnippet(trimmed)),
    };
  }

  if (/\berror\b/i.test(trimmed) && !/\bok\b/i.test(trimmed)) {
    return {
      ...base,
      validation: "ERROR",
      accepted: false,
      message: messageForValidation("ERROR", compactSnippet(trimmed)),
    };
  }

  if (/\bok\b/i.test(trimmed) || base.codigo === 1 || base.codigo === 4) {
    return {
      ...base,
      validation: "OK",
      accepted: true,
      message: messageForValidation("OK", compactSnippet(trimmed)),
    };
  }

  return {
    ...base,
    validation: "UNKNOWN",
    accepted: false,
    message: `Respuesta DGII no clasificada: ${compactSnippet(trimmed)}`,
  };
}

function compactSnippet(raw: string, max = 200): string {
  const one = raw.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}
