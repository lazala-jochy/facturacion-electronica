/**
 * Generación TXT formatos 606/607 (Norma General 06-18 / 07-18).
 * Estructura alineada a implementación de referencia DGII (pipe-separated).
 */

export type PeriodoFormato = { year: number; month: number };

export type Linea607 = {
  rncCedula: string;
  tipoIdentificacion: "1" | "2" | "3";
  ncf: string;
  ncfModificado?: string;
  tipoIngreso: string;
  fechaComprobante: string;
  fechaRetencion?: string;
  montoFacturado: number;
  itbisFacturado: number;
  itbisRetenidoPorTerceros?: number;
  itbisPercibido?: number;
  retencionRentaPorTerceros?: number;
  isrPercibido?: number;
  impuestoIsc?: number;
  impuestosOtros?: number;
  montoPropinaLegal?: number;
  montoEfectivo?: number;
  montoBanco?: number;
  montoTarjeta?: number;
  montoCredito?: number;
  montoBonos?: number;
  montoPermuta?: number;
  montoOtrasFormas?: number;
};

export type Linea606 = {
  rncCedula: string;
  tipoIdentificacion: "1" | "2" | "3";
  tipoBienesServicios: string;
  ncf: string;
  ncfModificado?: string;
  fechaComprobante: string;
  fechaPago?: string;
  montoServicios?: number;
  montoBienes?: number;
  montoFacturado: number;
  itbisFacturado?: number;
  itbisRetenido?: number;
  itbisSujetoProporcionalidad?: number;
  itbisLlevadoAlCosto?: number;
  itbisPorAdelantar?: number;
  itbisPercibidoCompras?: number;
  tipoRetencionIsr?: string;
  retencionRenta?: number;
  isrPercibidoCompras?: number;
  impuestoIsc?: number;
  impuestosOtros?: number;
  montoPropinaLegal?: number;
  formaPago: string;
};

export const parsePeriodoParam = (raw: string): PeriodoFormato | null => {
  const t = raw.trim();
  const m = /^(\d{4})-(\d{2})$/.exec(t);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
};

export const periodoAaaamm = (p: PeriodoFormato): string =>
  `${p.year}${String(p.month).padStart(2, "0")}`;

export const dgiiTipoIdentificacion = (
  vat: string,
): { rncCedula: string; tipo: "1" | "2" | "3" } => {
  const digits = vat.replace(/\D/g, "");
  if (digits.length === 9) return { rncCedula: digits, tipo: "1" };
  if (digits.length === 11) return { rncCedula: digits, tipo: "2" };
  return { rncCedula: "", tipo: "3" };
};

const fmtMonto = (n: number | undefined | null): string => {
  const v = Math.abs(Number(n) || 0);
  return v.toFixed(2);
};

const pipeField = (value: string | number | undefined | null, trailing = true): string => {
  if (value === undefined || value === null || value === "") {
    return trailing ? "|" : "";
  }
  const s = typeof value === "number" ? fmtMonto(value) : String(value);
  return trailing ? `${s}|` : s;
};

export const build607Txt = (
  rncEmisor: string,
  periodo: PeriodoFormato,
  lines: Linea607[],
): string => {
  const rnc = rncEmisor.replace(/\D/g, "");
  const header = [
    "607",
    rnc,
    periodoAaaamm(periodo),
    String(lines.length),
  ].join("|");

  const detail = lines.map((row) => {
    let ln = "";
    ln += pipeField(row.rncCedula);
    ln += pipeField(row.tipoIdentificacion);
    ln += pipeField(row.ncf.trim());
    ln += pipeField(row.ncfModificado?.trim() ?? "");
    ln += pipeField(row.tipoIngreso || "1");
    ln += pipeField(row.fechaComprobante.replace(/\D/g, ""));
    ln += pipeField(row.fechaRetencion?.replace(/\D/g, "") ?? "");
    ln += pipeField(row.montoFacturado);
    ln += pipeField(row.itbisFacturado);
    ln += pipeField(row.itbisRetenidoPorTerceros);
    ln += pipeField(row.itbisPercibido);
    ln += pipeField(row.retencionRentaPorTerceros);
    ln += pipeField(row.isrPercibido);
    ln += pipeField(row.impuestoIsc);
    ln += pipeField(row.impuestosOtros);
    ln += pipeField(row.montoPropinaLegal);
    ln += pipeField(row.montoEfectivo);
    ln += pipeField(row.montoBanco);
    ln += pipeField(row.montoTarjeta);
    ln += pipeField(row.montoCredito);
    ln += pipeField(row.montoBonos);
    ln += pipeField(row.montoPermuta);
    ln += pipeField(row.montoOtrasFormas, false);
    return ln;
  });

  return [header, ...detail].join("\n") + "\n";
};

export const build606Txt = (
  rncEmisor: string,
  periodo: PeriodoFormato,
  lines: Linea606[],
): string => {
  const rnc = rncEmisor.replace(/\D/g, "");
  const header = [
    "606",
    rnc,
    periodoAaaamm(periodo),
    String(lines.length),
  ].join("|");

  const detail = lines.map((row) => {
    let ln = "";
    ln += pipeField(row.rncCedula);
    ln += pipeField(row.tipoIdentificacion);
    ln += pipeField(row.tipoBienesServicios || "02");
    ln += pipeField(row.ncf.trim());
    ln += pipeField(row.ncfModificado?.trim() ?? "");
    ln += pipeField(row.fechaComprobante.replace(/\D/g, ""));
    ln += pipeField(row.fechaPago?.replace(/\D/g, "") ?? "");
    ln += pipeField(row.montoServicios);
    ln += pipeField(row.montoBienes);
    ln += pipeField(row.montoFacturado);
    ln += pipeField(row.itbisFacturado ?? 0);
    ln += pipeField(row.itbisRetenido);
    ln += pipeField(row.itbisSujetoProporcionalidad);
    ln += pipeField(row.itbisLlevadoAlCosto);
    ln += pipeField(row.itbisPorAdelantar ?? 0);
    ln += pipeField(row.itbisPercibidoCompras);
    ln += pipeField(row.tipoRetencionIsr ?? "");
    ln += pipeField(row.retencionRenta);
    ln += pipeField(row.isrPercibidoCompras);
    ln += pipeField(row.impuestoIsc);
    ln += pipeField(row.impuestosOtros);
    ln += pipeField(row.montoPropinaLegal);
    ln += pipeField(row.formaPago || "02", false);
    return ln;
  });

  return [header, ...detail].join("\n") + "\n";
};

export const dgiiFormatoTxtFilename = (
  tipo: "606" | "607",
  rnc: string,
  periodo: PeriodoFormato,
): string => {
  const r = rnc.replace(/\D/g, "");
  const aaaamm = periodoAaaamm(periodo);
  return `DGII_F_${tipo}_${r}_${aaaamm}.TXT`;
};

/** Forma de pago 606 (01-07, plantilla DGII). */
export const mapFormaPago606 = (paymentMethod: string | null | undefined): string => {
  const pm = (paymentMethod ?? "").toLowerCase();
  if (/efectivo|cash/.test(pm)) return "01";
  if (/transfer|cheque|banco|dep[oó]sito/.test(pm)) return "02";
  if (/tarjeta|card/.test(pm)) return "03";
  if (/cr[eé]dito|credito/.test(pm)) return "04";
  if (/permuta/.test(pm)) return "05";
  if (/nota.*cr[eé]dito|^nc\b/.test(pm)) return "06";
  if (/mixto/.test(pm)) return "07";
  return "04";
};

/** Forma de pago 607 según método de cobro (códigos DGII). */
export const mapFormaPago607 = (
  paymentMethod: string | null | undefined,
  total: number,
): Pick<
  Linea607,
  | "montoEfectivo"
  | "montoBanco"
  | "montoTarjeta"
  | "montoCredito"
  | "montoBonos"
  | "montoPermuta"
  | "montoOtrasFormas"
> => {
  const pm = (paymentMethod ?? "").toLowerCase();
  const zero = {
    montoEfectivo: 0,
    montoBanco: 0,
    montoTarjeta: 0,
    montoCredito: 0,
    montoBonos: 0,
    montoPermuta: 0,
    montoOtrasFormas: 0,
  };
  if (/efectivo|cash/.test(pm)) return { ...zero, montoEfectivo: total };
  if (/transfer|cheque|banco|dep[oó]sito/.test(pm)) return { ...zero, montoBanco: total };
  if (/tarjeta|card/.test(pm)) return { ...zero, montoTarjeta: total };
  if (/bono|certificado/.test(pm)) return { ...zero, montoBonos: total };
  if (/permuta/.test(pm)) return { ...zero, montoPermuta: total };
  if (/otra/.test(pm)) return { ...zero, montoOtrasFormas: total };
  return { ...zero, montoCredito: total };
};
