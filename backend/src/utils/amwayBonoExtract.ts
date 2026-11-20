/**
 * Extracción de datos de un "Resumen de Comisión" / "Dominican ITBIS Invoice" de Amway
 * (REPORT149001_Bonus Statement) para precargar el formulario de Cotización.
 * Heurística sobre el texto embebido del PDF; el resultado siempre se revisa/edita
 * en el formulario antes de guardar -- igual que el flujo 606 desde archivo.
 */
import { extraerTextoDeArchivo } from "./compra606Extract";

export type ItemBorradorAmway = {
  description: string;
  unit_price: number;
};

export type BorradorCotizacionAmway = {
  client: {
    name: string;
    address: string;
    rnc_cedula: string;
  };
  cotizacion: {
    payment_method: string;
    comment: string;
    /** Retención a terceros detectada en el PDF (ej. Amway retiene ITBIS/ISR al IBO sin RNC). */
    retencion_isr_pct?: number;
    retencion_itbis_pct?: number;
  };
  items: ItemBorradorAmway[];
  aviso: string;
};

const parseMoney = (raw: string): number => {
  const n = Number.parseFloat(raw.replace(/[^\d.,-]/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? Math.abs(n) : 0;
};

const matchMoney = (text: string, re: RegExp): number | null => {
  const m = text.match(re);
  return m ? parseMoney(m[1]) : null;
};

const matchStr = (text: string, re: RegExp): string => {
  const m = text.match(re);
  return m ? m[1].trim() : "";
};

/** true si el texto parece ser un reporte de comisión Amway (REPORT149001_Bonus Statement). */
export const esReporteAmwayBono = (texto: string): boolean =>
  /AMWAY/i.test(texto) && /IBO\s+\d+/i.test(texto) && /REPORT149001|RESUMEN DE COMISI[OÓ]N|Dominican ITBIS Invoice/i.test(texto);

export const parseAmwayBonoTexto = (texto: string): BorradorCotizacionAmway => {
  if (!esReporteAmwayBono(texto)) {
    throw new Error(
      "No se reconoció el formato. Se esperaba un reporte de comisión de Amway (Resumen de Comisión / REPORT149001_Bonus Statement).",
    );
  }

  const ibo = matchStr(texto, /IBO\s+(\d+)/i);
  const periodoRaw = matchStr(texto, /Para\s+el\s+mes\s+de\s+([A-Za-zÁÉÍÓÚáéíóú.\/]+\s*\d{4})/i);
  // "Oct./Octubre 2026" -> "Octubre 2026": nos quedamos con el nombre completo del mes.
  const periodo = periodoRaw.replace(/^[A-Za-zÁÉÍÓÚáéíóú]+\.\//, "");
  const numeroFactura = matchStr(texto, /Numero\s+de\s+Factura\s*:?_*(\d+)/i);
  const fechaFactura = matchStr(
    texto,
    /Numero\s+de\s+Comprobante\s+Fiscal.*?Fecha:\s*(\d{2}\/\d{2}\/\d{4})/i,
  );

  // Proveedor (emisor del reporte / IBO) -- referencia solamente, no se usa como cliente.
  const nombreIbo = matchStr(texto, /PARA\s+([A-ZÁÉÍÓÚÑ,.&\s]+?)\n/i);

  // Comprador real de la cotización: línea "Para: <nombre>" seguida de la dirección.
  const compradorMatch = texto.match(/\nPara:\s*(.+)\n(.+)\n-{5,}/);
  const clientName = compradorMatch ? compradorMatch[1].trim() : "Amway of Dominican Republic";
  const clientAddress = compradorMatch ? compradorMatch[2].trim() : "";

  const performance = matchMoney(
    texto,
    /Performance\/Rendimiento[.\s]*:?\s*DOP?\s*([\d.,]+)/i,
  );
  const incentivoBronce = matchMoney(
    texto,
    /Incentivo\s+de\s+Base\s+Bronce\s+([\d.,]+)/i,
  );

  const items: ItemBorradorAmway[] = [];
  const sufijo = periodo ? ` - ${periodo}` : "";
  if (performance != null && performance > 0) {
    items.push({
      description: `Comisión por rendimiento${sufijo}${ibo ? ` (IBO ${ibo})` : ""}`,
      unit_price: performance,
    });
  }
  if (incentivoBronce != null && incentivoBronce > 0) {
    items.push({
      description: `Incentivo de Base Bronce${sufijo}${ibo ? ` (IBO ${ibo})` : ""}`,
      unit_price: incentivoBronce,
    });
  }

  // Retención a terceros: "DR Taxes/Impuestos..." = ISR retenido sobre el subtotal gravado;
  // "ITBIS retenido" = ITBIS retenido sobre el ITBIS facturado. Se expresan como % para que el
  // monto se recalcule en el sistema a partir de los items (no de estas cifras del PDF).
  const subtotalBase = items.reduce((acc, it) => acc + it.unit_price, 0);
  const itbisFacturado = matchMoney(texto, /ITBIS\s*\.{0,}\s*\.18000[^\n]*?([\d.,]+)(?!-)/i);
  const itbisRetenido = matchMoney(
    texto,
    /ITBIS\s+retenido[^\n]*?\.18000[^\n]*?([\d,]+\.\d{2})-/i,
  );
  const drTaxes = matchMoney(
    texto,
    /DR\s+Taxes\/Impuestos\s+de\s+la\s+Republica\s+Dominica[^\n]*?([\d.,]+)-?/i,
  );
  const pct = (parte: number | null, base: number): number | undefined =>
    parte != null && parte > 0 && base > 0
      ? Math.round(((parte / base) * 100) * 100) / 100
      : undefined;
  const retencionIsrPct = pct(drTaxes, subtotalBase);
  const retencionItbisPct = pct(itbisRetenido, itbisFacturado ?? 0);

  const faltantes: string[] = [];
  if (!clientName) faltantes.push("cliente");
  if (items.length === 0) faltantes.push("montos de comisión");

  const refParts: string[] = [];
  if (ibo) refParts.push(`IBO ${ibo}`);
  if (nombreIbo) refParts.push(nombreIbo.replace(/\s+/g, " "));
  if (numeroFactura) refParts.push(`Factura Amway Nº ${numeroFactura}`);
  if (fechaFactura) refParts.push(`del ${fechaFactura}`);
  const comment = refParts.length ? `Comisión Amway: ${refParts.join(", ")}.` : "Comisión Amway.";

  return {
    client: {
      name: clientName,
      address: clientAddress,
      rnc_cedula: "",
    },
    cotizacion: {
      payment_method: "Depósito",
      comment,
      retencion_isr_pct: retencionIsrPct,
      retencion_itbis_pct: retencionItbisPct,
    },
    items,
    aviso:
      faltantes.length > 0
        ? `Datos extraídos del PDF -- no se detectó: ${faltantes.join(", ")}. Completá el formulario antes de guardar.`
        : retencionIsrPct != null || retencionItbisPct != null
          ? `Datos extraídos del PDF de Amway, incluida la retención (ISR ${retencionIsrPct ?? 0}% / ITBIS ${retencionItbisPct ?? 0}%). El RNC/cédula del cliente no viene en el reporte -- completalo antes de guardar. Revisá montos, ítems y retención.`
          : "Datos extraídos del PDF de Amway. El RNC/cédula del cliente no viene en el reporte -- completalo antes de guardar. Revisá montos e ítems.",
  };
};

export const extraerBorradorCotizacionDesdeArchivoAmway = async (
  buffer: Buffer,
  mimetype: string,
): Promise<
  { ok: false; status: number; message: string } | { ok: true; borrador: BorradorCotizacionAmway }
> => {
  let texto: string;
  try {
    texto = await extraerTextoDeArchivo(buffer, mimetype);
  } catch (e) {
    return { ok: false, status: 400, message: e instanceof Error ? e.message : "No se pudo leer el archivo." };
  }
  try {
    const borrador = parseAmwayBonoTexto(texto);
    return { ok: true, borrador };
  } catch (e) {
    return { ok: false, status: 422, message: e instanceof Error ? e.message : "No se pudo interpretar el archivo." };
  }
};
