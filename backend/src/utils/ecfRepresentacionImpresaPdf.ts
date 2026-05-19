import QRCode from "qrcode";
import PDFDocument from "pdfkit";
import type { Company } from "@prisma/client";

type PdfDoc = InstanceType<typeof PDFDocument>;
import { buildConsultaTimbreQrUrl } from "./ecfConsultaTimbreQr";
import { resolveCompanyLogoAbsolutePath } from "./companyLogo";
import { codigoSeguridadParaConsultaTimbre } from "./ecfXmlExtract";
import {
  parseRepresentacionImpresaData,
  type RepresentacionImpresaData,
  type RiItemRow,
} from "./ecfRepresentacionImpresaData";

/** §18.2.3: margen mínimo 2 cm; QR mínimo 22×22 mm. */
const MARGEN_HOJA_CM_PT = 56.7;
const QR_SIZE_MM_PT = 62.4;
const FOOTER_BLOCK_H_PT = QR_SIZE_MM_PT + 44;

const COLOR_ACCENT = "#1e4a8a";
const COLOR_TABLE_HEAD = "#d9dce3";
const LOGO_MAX_PT = 56;

export type RepresentacionImpresaInput = {
  signedXml: string;
  company: Pick<Company, "dgiiEnvironment" | "name" | "logoUrl"> & { id?: number };
  ecfTipo: string;
  fechaFirma: Date;
  dgiiTrackId?: string | null;
  uploadsRoot?: string;
};

/** Montos al estilo modelo DGII (334,300.00). */
const formatMontoRi = (raw: string): string => {
  const t = raw.trim();
  if (!t) return "";
  const n = Number.parseFloat(t.replace(/,/g, ""));
  if (!Number.isFinite(n)) return t;
  return n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatCantidadRi = (raw: string): string => {
  const t = raw.trim();
  if (!t) return "—";
  const n = Number.parseFloat(t.replace(/,/g, ""));
  if (!Number.isFinite(n)) return t;
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("es-DO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const unidadCorta = (row: RiItemRow): string => {
  const c = row.unidadCodigo.trim();
  if (!c) return row.unidadLabel || "—";
  const map: Record<string, string> = {
    "41": "CAJ",
    "43": "PZA",
    "48": "DOC",
    "12": "DOC",
    "23": "KG",
    "29": "LT",
    "36": "MT",
  };
  return map[c] ?? (row.unidadLabel.length <= 6 ? row.unidadLabel : c);
};

const direccionEmisorLinea = (data: RepresentacionImpresaData): string => {
  const parts = [
    data.emisor.direccion,
    data.emisor.municipio,
    data.emisor.provincia,
    "Rep. Dom.",
  ].filter((p) => p.trim());
  return parts.join(", ");
};

const drawAccentRule = (doc: PdfDoc, y: number) => {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc
    .moveTo(left, y)
    .lineTo(right, y)
    .lineWidth(2)
    .strokeColor(COLOR_ACCENT)
    .stroke()
    .lineWidth(1)
    .strokeColor("#000000");
};

/** §18.2.1 + modelo ilustrativo DGII: logo (si existe), emisor izquierda, tipo/e-NCF derecha. */
const drawHeaderBlock = (
  doc: PdfDoc,
  data: RepresentacionImpresaData,
  logoPath: string | null,
) => {
  const pageW = doc.page.width;
  const left = doc.page.margins.left;
  const right = pageW - doc.page.margins.right;
  const mid = (left + right) / 2;
  const y0 = doc.y;

  let textLeft = left;
  if (logoPath) {
    try {
      doc.image(logoPath, left, y0, { fit: [LOGO_MAX_PT, LOGO_MAX_PT] });
      textLeft = left + LOGO_MAX_PT + 10;
    } catch {
      textLeft = left;
    }
  }

  const colW = mid - textLeft - 10;
  let yLeft = y0;
  if (data.emisor.nombreComercial.trim()) {
    doc.font("Helvetica-Bold").fontSize(11).text(data.emisor.nombreComercial, textLeft, yLeft, {
      width: colW,
    });
    yLeft = doc.y + 2;
  }
  const razon = data.emisor.razonSocial.trim();
  if (razon && razon !== data.emisor.nombreComercial.trim()) {
    doc.font("Helvetica-Bold").fontSize(9).text(razon, textLeft, yLeft, { width: colW });
    yLeft = doc.y + 2;
  }
  doc.font("Helvetica").fontSize(8);
  if (data.emisor.sucursal.trim()) {
    doc.text(`Sucursal ${data.emisor.sucursal}`, textLeft, yLeft, { width: colW });
    yLeft = doc.y + 2;
  }
  if (data.emisor.rnc.trim()) {
    doc.text(`RNC ${data.emisor.rnc}`, textLeft, yLeft, { width: colW });
    yLeft = doc.y + 2;
  }
  const dir = direccionEmisorLinea(data);
  if (dir) {
    doc.text(dir, textLeft, yLeft, { width: colW });
    yLeft = doc.y + 2;
  }
  if (data.emisor.fechaEmision.trim()) {
    doc.text(`Fecha Emisión ${data.emisor.fechaEmision}`, textLeft, yLeft, { width: colW });
    yLeft = doc.y + 2;
  }
  if (logoPath) {
    yLeft = Math.max(yLeft, y0 + LOGO_MAX_PT);
  }

  let yRight = y0;
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLOR_ACCENT)
    .text(data.tipoLabel, mid + 10, yRight, { width: right - mid - 10, align: "right" });
  doc.fillColor("#000000");
  yRight = doc.y + 6;

  const pushRight = (text: string, bold = false, size = 8) => {
    if (!text.trim()) return;
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(size)
      .text(text, mid + 10, yRight, { width: right - mid - 10, align: "right" });
    yRight = doc.y + 3;
  };

  pushRight(`e-NCF ${data.encf}`, true, 9);
  if (data.fechaVencimientoSecuencia) {
    pushRight(`Fecha Vencimiento ${data.fechaVencimientoSecuencia}`);
  }
  if (data.ncfModificado) {
    pushRight(`e-NCF modificado ${data.ncfModificado}`);
  }
  if (data.codigoModificacionLabel) {
    pushRight(data.codigoModificacionLabel);
  } else if (data.codigoModificacion) {
    pushRight(`Código modificación ${data.codigoModificacion}`);
  }

  doc.y = Math.max(yLeft, yRight) + 8;
  drawAccentRule(doc, doc.y);
  doc.moveDown(0.45);

  doc.font("Helvetica").fontSize(8);
  doc.text(`Razón social cliente ${data.comprador.razonSocial || "—"}`, left);
  doc.moveDown(0.15);
  if (data.comprador.identificadorExtranjero.trim()) {
    doc.text(`Identificador extranjero ${data.comprador.identificadorExtranjero}`, left);
  } else {
    doc.text(`RNC Cliente ${data.comprador.rncCedula.trim() || "—"}`, left);
  }
  doc.moveDown(0.5);
};

type ItemsTableLayout = {
  gap: number;
  w: { cant: number; desc: number; unidad: number; precio: number; itbis: number; valor: number };
  x: { cant: number; desc: number; unidad: number; precio: number; itbis: number; valor: number };
};

const buildItemsTableLayout = (left: number, tableW: number): ItemsTableLayout => {
  const gap = 8;
  const ratios = {
    cant: 0.09,
    desc: 0.31,
    unidad: 0.14,
    precio: 0.15,
    itbis: 0.14,
    valor: 0.17,
  };
  const contentW = tableW - gap * 5;
  const w = {
    cant: Math.floor(contentW * ratios.cant),
    desc: Math.floor(contentW * ratios.desc),
    unidad: Math.floor(contentW * ratios.unidad),
    precio: Math.floor(contentW * ratios.precio),
    itbis: Math.floor(contentW * ratios.itbis),
    valor: Math.max(48, Math.floor(contentW * ratios.valor)),
  };
  const used = w.cant + w.desc + w.unidad + w.precio + w.itbis + w.valor + gap * 5;
  if (used < tableW) w.desc += tableW - used;

  let xCursor = left;
  const nextX = (width: number) => {
    const x = xCursor;
    xCursor += width + gap;
    return x;
  };
  return {
    gap,
    w,
    x: {
      cant: nextX(w.cant),
      desc: nextX(w.desc),
      unidad: nextX(w.unidad),
      precio: nextX(w.precio),
      itbis: nextX(w.itbis),
      valor: nextX(w.valor),
    },
  };
};

const cellText = (
  doc: PdfDoc,
  text: string,
  x: number,
  y: number,
  width: number,
  align: "left" | "right" | "center" = "left",
) => {
  doc.text(text, x, y, { width, align, lineBreak: false });
};

const drawItemsTable = (
  doc: PdfDoc,
  data: RepresentacionImpresaData,
  logoPath: string | null,
) => {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const tableW = right - left;
  const layout = buildItemsTableLayout(left, tableW);
  const { w, x } = layout;

  const footerReserveTop = () =>
    doc.page.height - doc.page.margins.bottom - FOOTER_BLOCK_H_PT - 24;

  const drawTableHeader = () => {
    const y0 = doc.y;
    const h = 16;
    doc.rect(left, y0, tableW, h).fill(COLOR_TABLE_HEAD);
    doc.fillColor("#000000").font("Helvetica-Bold").fontSize(7);
    const ty = y0 + 4;
    cellText(doc, "Cantidad", x.cant, ty, w.cant, "right");
    cellText(doc, "Descripción", x.desc, ty, w.desc);
    cellText(doc, "U. medida", x.unidad, ty, w.unidad);
    cellText(doc, "Precio", x.precio, ty, w.precio, "right");
    cellText(doc, "ITBIS", x.itbis, ty, w.itbis, "right");
    cellText(doc, "Valor", x.valor, ty, w.valor, "right");
    doc.y = y0 + h + 4;
  };

  drawTableHeader();
  doc.font("Helvetica").fontSize(7.5);

  for (const row of data.items) {
    if (doc.y > footerReserveTop()) {
      doc.addPage();
      drawHeaderBlock(doc, data, logoPath);
      drawTableHeader();
      doc.font("Helvetica").fontSize(7.5);
    }

    const desc =
      (row.prefijoExento ? `${row.prefijoExento} ` : "") + (row.nombreItem || "—");
    const y = doc.y;
    const itbisTxt = row.itbisLinea.trim() ? formatMontoRi(row.itbisLinea) : "—";
    cellText(doc, formatCantidadRi(row.cantidad), x.cant, y, w.cant, "right");
    cellText(doc, desc, x.desc, y, w.desc);
    cellText(doc, unidadCorta(row), x.unidad, y, w.unidad);
    cellText(
      doc,
      row.precioUnitario ? formatMontoRi(row.precioUnitario) : "—",
      x.precio,
      y,
      w.precio,
      "right",
    );
    cellText(doc, itbisTxt, x.itbis, y, w.itbis, "right");
    cellText(doc, row.montoItem ? formatMontoRi(row.montoItem) : "—", x.valor, y, w.valor, "right");
    doc.moveDown(0.28);
  }

  if (!data.items.length) {
    doc.font("Helvetica").fontSize(8).text("Sin líneas de detalle.", left);
    doc.moveDown(0.3);
  }
};

const drawDescuentosRecargosGlobales = (doc: PdfDoc, data: RepresentacionImpresaData) => {
  if (!data.descuentosRecargosGlobales.length) return;
  const left = doc.page.margins.left;
  doc.font("Helvetica").fontSize(8);
  for (const dr of data.descuentosRecargosGlobales) {
    const tipo = dr.esDescuento ? "Descuento" : "Recargo";
    const parts = [tipo];
    if (dr.descripcion.trim()) parts.push(dr.descripcion.trim());
    if (dr.porcentaje.trim()) parts.push(`${dr.porcentaje}%`);
    if (dr.monto.trim()) parts.push(formatMontoRi(dr.monto));
    doc.text(parts.join(" — "), left);
    doc.moveDown(0.12);
  }
  doc.moveDown(0.2);
};

/** Totales alineados a la derecha (modelo DGII). */
const drawTotalesFooter = (doc: PdfDoc, data: RepresentacionImpresaData, baseY: number) => {
  const right = doc.page.width - doc.page.margins.right;
  const labelW = 130;
  const x = right - labelW;

  const lines: { label: string; value: string; bold?: boolean }[] = [];
  if (data.totales.subtotalGravado.trim()) {
    lines.push({ label: "Subtotal Gravado", value: formatMontoRi(data.totales.subtotalGravado) });
  }
  if (data.totales.subtotalExento.trim()) {
    lines.push({ label: "Subtotal Exento", value: formatMontoRi(data.totales.subtotalExento) });
  }
  if (data.totales.totalItbis.trim()) {
    lines.push({ label: "Total ITBIS", value: formatMontoRi(data.totales.totalItbis) });
  }
  if (data.totales.totalIsc.trim()) {
    lines.push({ label: "Total ISC", value: formatMontoRi(data.totales.totalIsc) });
  }
  if (data.totales.totalCdt.trim()) {
    lines.push({ label: "CDT", value: formatMontoRi(data.totales.totalCdt) });
  }
  if (data.totales.totalPropina.trim()) {
    lines.push({ label: "Propina legal", value: formatMontoRi(data.totales.totalPropina) });
  }
  if (data.totales.totalIsr.trim()) {
    lines.push({ label: "Total ISR retención", value: formatMontoRi(data.totales.totalIsr) });
  }
  if (data.totales.total.trim()) {
    lines.push({ label: "Total", value: formatMontoRi(data.totales.total), bold: true });
  }

  let y = baseY;
  for (const line of lines) {
    doc
      .font(line.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(line.bold ? 9 : 8)
      .text(`${line.label} ${line.value}`, x, y, { width: labelW, align: "right" });
    y += line.bold ? 14 : 12;
  }
};

/** Pie §18.2.3: QR inferior izquierdo + código de seguridad y fecha firma. */
const drawQrFooter = (
  doc: PdfDoc,
  qrPng: Buffer,
  codigoSeg: string,
  fechaFirmaDisplay: string,
) => {
  const pageH = doc.page.height;
  const left = MARGEN_HOJA_CM_PT;
  const qrY = pageH - MARGEN_HOJA_CM_PT - QR_SIZE_MM_PT;
  const textX = left + QR_SIZE_MM_PT + 10;

  doc.image(qrPng, left, qrY, { width: QR_SIZE_MM_PT, height: QR_SIZE_MM_PT });

  doc.font("Helvetica").fontSize(8);
  doc.text(`Código de Seguridad ${codigoSeg}`, textX, qrY + 4);
  if (fechaFirmaDisplay.trim()) {
    doc.text(`Fecha Firma ${fechaFirmaDisplay}`, textX, qrY + 16);
  }
};

export const buildRepresentacionImpresaPdfBuffer = async (
  input: RepresentacionImpresaInput,
): Promise<Buffer> => {
  const data = parseRepresentacionImpresaData(input.signedXml, input.ecfTipo, {
    dgiiTrackId: input.dgiiTrackId,
  });

  const fechaFirmaDisplay =
    data.fechaHoraFirma.trim() || formatFechaFirmaFromDate(input.fechaFirma);

  const qrUrl = buildConsultaTimbreQrUrl({
    signedXml: input.signedXml,
    dgiiEnvironment: input.company.dgiiEnvironment,
    ecfTipo: data.tipoEcf,
    fechaFirma: input.fechaFirma,
  });
  const codigoSeg = codigoSeguridadParaConsultaTimbre(input.signedXml);

  const qrPng = await QRCode.toBuffer(qrUrl, {
    type: "png",
    width: 400,
    margin: 2,
    errorCorrectionLevel: "H",
  });

  let logoPath: string | null = null;
  if (input.uploadsRoot && input.company.id != null) {
    logoPath = await resolveCompanyLogoAbsolutePath(
      input.uploadsRoot,
      input.company.id,
      input.company.logoUrl,
    );
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: {
        top: 40,
        left: MARGEN_HOJA_CM_PT,
        right: MARGEN_HOJA_CM_PT,
        bottom: MARGEN_HOJA_CM_PT,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawHeaderBlock(doc, data, logoPath);
    drawItemsTable(doc, data, logoPath);
    drawDescuentosRecargosGlobales(doc, data);

    const footerY = doc.page.height - MARGEN_HOJA_CM_PT - QR_SIZE_MM_PT;
    if (doc.y > footerY - 8) {
      doc.addPage();
    }

    drawTotalesFooter(doc, data, footerY);
    drawQrFooter(doc, qrPng, codigoSeg, fechaFirmaDisplay);

    doc.end();
  });
};

const formatFechaFirmaFromDate = (d: Date): string => {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Santo_Domingo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((x) => x.type === type)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")}:${get("second")}`;
};
