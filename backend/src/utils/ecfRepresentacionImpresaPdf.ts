import QRCode from "qrcode";
import PDFDocument from "pdfkit";
import type { Company } from "@prisma/client";

type PdfDoc = InstanceType<typeof PDFDocument>;
import { buildConsultaTimbreQrUrl } from "./ecfConsultaTimbreQr";
import { resolveCompanyLogoImage } from "./companyLogo";
import { codigoSeguridadParaConsultaTimbre } from "./ecfXmlExtract";
import {
  parseRepresentacionImpresaData,
  type RepresentacionImpresaData,
  type RiItemRow,
} from "./ecfRepresentacionImpresaData";

/** §18.2.3: margen mínimo 2 cm; QR mínimo 22×22 mm. */
const MARGEN_HOJA_CM_PT = 56.7;
const QR_SIZE_MM_PT = 62.4;
const QR_FOOTER_TEXT_LINE_H_PT = 14;
const QR_FOOTER_TEXT_GAP_PT = 6;
/** QR + código de seguridad y fecha firma debajo del QR. */
const FOOTER_BLOCK_H_PT =
  QR_SIZE_MM_PT + QR_FOOTER_TEXT_GAP_PT + QR_FOOTER_TEXT_LINE_H_PT * 2 + 8;

const COLOR_ACCENT = "#1e4a8a";
const COLOR_TABLE_HEAD = "#d9dce3";
const COLOR_GRID = "#a9afba";
const LOGO_MAX_PT = 56;
const TABLE_HEADER_H_PT = 32;
const TABLE_ROW_PAD_PT = 5;
const BASE_FONT_PT = 9.5;

export type RepresentacionImpresaInput = {
  signedXml: string;
  company: Pick<Company, "dgiiEnvironment" | "name" | "logoUrl" | "phone"> & { id?: number };
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
    "34": "PZA",
    "43": "UND",
    "48": "DOC",
    "12": "DOC",
    "23": "KG",
    "29": "LT",
    "36": "MT",
  };
  return map[c] ?? (row.unidadLabel.length <= 6 ? row.unidadLabel : c);
};

const direccionEmisorLinea = (data: RepresentacionImpresaData): string => {
  const parts = [data.emisor.direccion, "Rep. Dom."].filter((p) => p.trim());
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

/** Dibuja "Etiqueta: valor" con la etiqueta en negrita y el valor en texto normal. */
/** Devuelve el alto (pt) realmente ocupado, para que el llamador avance `y` incluso si el valor hizo wrap. */
const drawKeyValue = (
  doc: PdfDoc,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  align: "left" | "right" = "left",
  size = BASE_FONT_PT,
): number => {
  const labelText = `${label}: `;
  const lineH = size + 4;
  if (align === "right") {
    doc.font("Helvetica-Bold").fontSize(size);
    const labelW = doc.widthOfString(labelText);
    doc.font("Helvetica").fontSize(size);
    const valueW = doc.widthOfString(value);
    if (labelW + valueW <= width) {
      const startX = x + width - (labelW + valueW);
      doc.font("Helvetica-Bold").fontSize(size).text(labelText, startX, y, { lineBreak: false });
      doc.font("Helvetica").fontSize(size).text(value, startX + labelW, y, { lineBreak: false });
      return lineH;
    }
    // El valor no cabe junto a la etiqueta en una línea: lo envolvemos debajo, ambos a la derecha.
    doc.font("Helvetica-Bold").fontSize(size).text(labelText, x, y, { width, align: "right" });
    const valueY = y + lineH;
    doc.font("Helvetica").fontSize(size).text(value, x, valueY, { width, align: "right" });
    const valueH = doc.heightOfString(value, { width });
    return lineH + Math.max(lineH, valueH + 2);
  }
  doc.font("Helvetica-Bold").fontSize(size).text(labelText, x, y, { continued: true, width });
  doc.font("Helvetica").fontSize(size).text(value);
  doc.font("Helvetica-Bold").fontSize(size);
  const h = doc.heightOfString(`${labelText}${value}`, { width });
  return Math.max(lineH, h + 2);
};

/** §18.2.1 + modelo ilustrativo DGII: logo (si existe), emisor izquierda, tipo/e-NCF derecha. */
const drawHeaderBlock = (
  doc: PdfDoc,
  data: RepresentacionImpresaData,
  logoPath: string | Buffer | null,
  companyPhone?: string | null,
) => {
  const pageW = doc.page.width;
  const left = doc.page.margins.left;
  const right = pageW - doc.page.margins.right;
  const mid = (left + right) / 2;
  const y0 = doc.y;

  const textLeft = left;
  let contentStartY = y0;
  if (logoPath) {
    try {
      doc.image(logoPath, left, y0, { fit: [LOGO_MAX_PT, LOGO_MAX_PT] });
      contentStartY = y0 + LOGO_MAX_PT + 8;
    } catch {
      contentStartY = y0;
    }
  }
  let yLeft = contentStartY;

  const colW = mid - textLeft - 10;
  if (data.emisor.nombreComercial.trim()) {
    doc.font("Helvetica-Bold").fontSize(12.5).text(data.emisor.nombreComercial, textLeft, yLeft, {
      width: colW,
    });
    yLeft = doc.y + 3;
  }
  const razon = data.emisor.razonSocial.trim();
  if (razon && razon !== data.emisor.nombreComercial.trim()) {
    doc.font("Helvetica-Bold").fontSize(10.5).text(razon, textLeft, yLeft, { width: colW });
    yLeft = doc.y + 3;
  }
  doc.font("Helvetica").fontSize(BASE_FONT_PT);
  if (data.emisor.sucursal.trim()) {
    yLeft += drawKeyValue(doc, "Sucursal", data.emisor.sucursal, textLeft, yLeft, colW);
  }
  if (data.emisor.rnc.trim()) {
    yLeft += drawKeyValue(doc, "RNC", data.emisor.rnc, textLeft, yLeft, colW);
  }
  const dir = direccionEmisorLinea(data);
  if (dir) {
    yLeft += drawKeyValue(doc, "Dirección", dir, textLeft, yLeft, colW);
  }
  if (companyPhone?.trim()) {
    yLeft += drawKeyValue(doc, "Teléfono", companyPhone.trim(), textLeft, yLeft, colW);
  }
  if (data.emisor.fechaEmision.trim()) {
    yLeft += drawKeyValue(doc, "Fecha Emisión", data.emisor.fechaEmision, textLeft, yLeft, colW);
  }

  let yRight = contentStartY;
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(COLOR_ACCENT)
    .text(data.tipoLabel, mid + 10, yRight, { width: right - mid - 10, align: "right" });
  doc.fillColor("#000000");
  yRight = doc.y + 6;

  const pushRightKv = (label: string, value: string, size = BASE_FONT_PT) => {
    if (!value.trim()) return;
    yRight += drawKeyValue(doc, label, value, mid + 10, yRight, right - mid - 10, "right", size);
  };
  const pushRight = (text: string) => {
    if (!text.trim()) return;
    doc.font("Helvetica").fontSize(BASE_FONT_PT).text(text, mid + 10, yRight, { width: right - mid - 10, align: "right" });
    yRight = doc.y + 3;
  };

  pushRightKv("e-NCF", data.encf, BASE_FONT_PT + 1);
  if (data.fechaVencimientoSecuencia) {
    pushRightKv("Fecha Vencimiento", formatFechaRiSlash(data.fechaVencimientoSecuencia));
  }
  if (data.ncfModificado) {
    pushRightKv("e-NCF modificado", data.ncfModificado);
  }
  if (data.codigoModificacionLabel) {
    pushRight(data.codigoModificacionLabel);
  } else if (data.codigoModificacion) {
    pushRightKv("Código modificación", data.codigoModificacion);
  }

  doc.y = Math.max(yLeft, yRight) + 8;
  drawAccentRule(doc, doc.y);
  doc.moveDown(0.45);

  let yClient = doc.y;
  yClient += drawKeyValue(doc, "Razón social cliente", data.comprador.razonSocial || "—", left, yClient, colW);
  if (data.comprador.identificadorExtranjero.trim()) {
    yClient += drawKeyValue(doc, "Identificador extranjero", data.comprador.identificadorExtranjero, left, yClient, colW);
  } else {
    yClient += drawKeyValue(doc, "RNC Cliente", data.comprador.rncCedula.trim() || "—", left, yClient, colW);
  }
  doc.y = yClient + 2;
};

type ItemsTableCols = {
  cant: number;
  desc: number;
  unidad: number;
  precio: number;
  itbis: number;
  descuento: number;
  recargo: number;
  valor: number;
};

type ItemsTableLayout = {
  gap: number;
  w: ItemsTableCols;
  x: ItemsTableCols;
};

const buildItemsTableLayout = (left: number, tableW: number): ItemsTableLayout => {
  const gap = 6;
  const ratios = {
    cant: 0.083,
    desc: 0.188,
    unidad: 0.07,
    precio: 0.13,
    itbis: 0.13,
    descuento: 0.145,
    recargo: 0.124,
    valor: 0.13,
  };
  const gapCount = 7;
  const contentW = tableW - gap * gapCount;
  const w: ItemsTableCols = {
    cant: Math.floor(contentW * ratios.cant),
    desc: Math.floor(contentW * ratios.desc),
    unidad: Math.floor(contentW * ratios.unidad),
    precio: Math.floor(contentW * ratios.precio),
    itbis: Math.floor(contentW * ratios.itbis),
    descuento: Math.floor(contentW * ratios.descuento),
    recargo: Math.floor(contentW * ratios.recargo),
    valor: Math.max(42, Math.floor(contentW * ratios.valor)),
  };
  const used =
    w.cant + w.desc + w.unidad + w.precio + w.itbis + w.descuento + w.recargo + w.valor +
    gap * gapCount;
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
      descuento: nextX(w.descuento),
      recargo: nextX(w.recargo),
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
  logoPath: string | Buffer | null,
  reservedFooterH: number,
) => {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const tableW = right - left;
  const layout = buildItemsTableLayout(left, tableW);
  const { w, x, gap } = layout;

  const boundaries = [
    left,
    x.desc - gap / 2,
    x.unidad - gap / 2,
    x.precio - gap / 2,
    x.itbis - gap / 2,
    x.descuento - gap / 2,
    x.recargo - gap / 2,
    x.valor - gap / 2,
    right,
  ];

  const drawGridBox = (top: number, bottom: number) => {
    doc.save();
    doc.lineWidth(0.5).strokeColor(COLOR_GRID);
    doc.moveTo(boundaries[0], top).lineTo(boundaries[boundaries.length - 1], top).stroke();
    doc.moveTo(boundaries[0], bottom).lineTo(boundaries[boundaries.length - 1], bottom).stroke();
    for (const bx of boundaries) {
      doc.moveTo(bx, top).lineTo(bx, bottom).stroke();
    }
    doc.restore();
  };

  const footerReserveTop = () =>
    doc.page.height - doc.page.margins.bottom - reservedFooterH - 24;

  const drawTableHeader = () => {
    const y0 = doc.y;
    const h = TABLE_HEADER_H_PT;
    doc.rect(left, y0, tableW, h).fill(COLOR_TABLE_HEAD);
    drawGridBox(y0, y0 + h);
    doc.fillColor("#000000").font("Helvetica-Bold").fontSize(BASE_FONT_PT - 1.5);
    const ty = y0 + 6;
    cellText(doc, "Cant", x.cant, ty, w.cant, "right");
    cellText(doc, "Descripción", x.desc, ty, w.desc);
    cellText(doc, "Unidad", x.unidad, ty, w.unidad);
    cellText(doc, "Precio RD$", x.precio, ty, w.precio, "right");
    cellText(doc, "ITBIS RD$", x.itbis, ty, w.itbis, "right");
    cellText(doc, "Descuento RD$", x.descuento, ty, w.descuento, "right");
    cellText(doc, "Recargo RD$", x.recargo, ty, w.recargo, "right");
    cellText(doc, "Valor RD$", x.valor, ty, w.valor, "right");
    doc.y = y0 + h;
  };

  drawTableHeader();
  doc.font("Helvetica").fontSize(BASE_FONT_PT - 1);

  if (!data.items.length) {
    const rowTop = doc.y;
    const rowH = 22;
    drawGridBox(rowTop, rowTop + rowH);
    doc.font("Helvetica").fontSize(BASE_FONT_PT).text("Sin líneas de detalle.", left + 6, rowTop + 7);
    doc.y = rowTop + rowH;
    return;
  }

  for (const row of data.items) {
    if (doc.y > footerReserveTop()) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      drawTableHeader();
      doc.font("Helvetica").fontSize(BASE_FONT_PT - 1);
    }

    const desc =
      (row.prefijoExento ? `${row.prefijoExento} ` : "") + (row.nombreItem || "—");
    const itbisTxt = row.itbisLinea.trim() ? formatMontoRi(row.itbisLinea) : "—";
    const descuentoTxt = row.descuento.trim() ? formatMontoRi(row.descuento) : "-";
    const recargoTxt = row.recargo.trim() ? formatMontoRi(row.recargo) : "-";
    const descH = doc.heightOfString(desc, { width: w.desc, lineBreak: true });

    const rowTop = doc.y;
    const rowH = Math.max(BASE_FONT_PT + 3, descH + 2) + TABLE_ROW_PAD_PT * 2;
    const textY = rowTop + TABLE_ROW_PAD_PT;

    drawGridBox(rowTop, rowTop + rowH);

    cellText(doc, formatCantidadRi(row.cantidad), x.cant, textY, w.cant, "right");
    doc.text(desc, x.desc, textY, { width: w.desc, lineBreak: true });
    cellText(doc, unidadCorta(row), x.unidad, textY, w.unidad);
    cellText(
      doc,
      row.precioUnitario ? formatMontoRi(row.precioUnitario) : "—",
      x.precio,
      textY,
      w.precio,
      "right",
    );
    cellText(doc, itbisTxt, x.itbis, textY, w.itbis, "right");
    cellText(doc, descuentoTxt, x.descuento, textY, w.descuento, "right");
    cellText(doc, recargoTxt, x.recargo, textY, w.recargo, "right");
    cellText(doc, row.montoItem ? formatMontoRi(row.montoItem) : "—", x.valor, textY, w.valor, "right");
    doc.y = rowTop + rowH;
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

type TotalLine = { label: string; value: string; bold?: boolean };

const TOTALES_ROW_H_PT = 15;

/** §18.2.3 modelo DGII: Subtotal Gravado/Exento, Otros Impuestos Adicionales, ISCe/ISCav, ITBIS, CDT, Propina, Monto Total. */
const buildTotalesLines = (data: RepresentacionImpresaData): TotalLine[] => {
  const lines: TotalLine[] = [];
  lines.push({
    label: "Subtotal Gravado",
    value: data.totales.subtotalGravado.trim() ? formatMontoRi(data.totales.subtotalGravado) : "-",
  });
  lines.push({
    label: "Subtotal Exento",
    value: data.totales.subtotalExento.trim() ? formatMontoRi(data.totales.subtotalExento) : "-",
  });
  lines.push({
    label: "Otros Impuestos Adicionales",
    value: data.totales.otrosImpuestosAdicionales.trim()
      ? formatMontoRi(data.totales.otrosImpuestosAdicionales)
      : "-",
  });
  lines.push({
    label: "Total ISCe",
    value: data.totales.totalIscEspecifico.trim()
      ? formatMontoRi(data.totales.totalIscEspecifico)
      : "-",
  });
  lines.push({
    label: "Total ISCav",
    value: data.totales.totalIscAdValorem.trim()
      ? formatMontoRi(data.totales.totalIscAdValorem)
      : "-",
  });
  lines.push({
    label: "Total ITBIS",
    value: data.totales.totalItbis.trim() ? formatMontoRi(data.totales.totalItbis) : "-",
  });
  lines.push({
    label: "CDT",
    value: data.totales.totalCdt.trim() ? formatMontoRi(data.totales.totalCdt) : "-",
  });
  lines.push({
    label: "Propina Legal",
    value: data.totales.totalPropina.trim() ? formatMontoRi(data.totales.totalPropina) : "-",
  });
  if (data.totales.totalIsr.trim()) {
    lines.push({ label: "Total ISR retención", value: formatMontoRi(data.totales.totalIsr) });
  }
  lines.push({
    label: "Monto Total",
    value: data.totales.total.trim() ? formatMontoRi(data.totales.total) : "-",
    bold: true,
  });

  return lines;
};

const totalesBoxHeight = (lineCount: number) => TOTALES_ROW_H_PT * lineCount + 6;

/** Totales alineados a la derecha (modelo DGII); `bottomY` es el borde inferior del bloque. */
const drawTotalesFooter = (
  doc: PdfDoc,
  lines: TotalLine[],
  bottomY: number,
) => {
  const right = doc.page.width - doc.page.margins.right;
  const valueW = 110;
  const labelW = 170;
  const boxLeft = right - labelW - valueW;
  const valueX = right - valueW;

  const boxH = totalesBoxHeight(lines.length);
  const boxTop = bottomY - boxH;
  const baseY = boxTop + 3;

  doc.rect(valueX, boxTop, valueW, boxH).fill(COLOR_TABLE_HEAD);
  drawAccentRule(doc, boxTop);

  let y = baseY;
  for (const line of lines) {
    const size = line.bold ? BASE_FONT_PT + 1 : BASE_FONT_PT;
    doc
      .fillColor("#000000")
      .font("Helvetica-Bold")
      .fontSize(size)
      .text(`${line.label}:`, boxLeft, y, { width: labelW - 8, align: "right" });
    doc
      .font(line.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(size)
      .text(line.value, valueX, y, { width: valueW - 8, align: "right" });
    y += TOTALES_ROW_H_PT;
  }
};

/** Fecha RI con barras (ej. 31/12/2028). */
const formatFechaRiSlash = (raw: string): string => raw.trim().replace(/-/g, "/");

/** Pie §18.2.3: QR inferior izquierdo; código de seguridad y fecha firma debajo del QR. */
const drawQrFooter = (
  doc: PdfDoc,
  qrPng: Buffer,
  codigoSeg: string,
  fechaFirmaDisplay: string,
) => {
  const pageH = doc.page.height;
  const left = MARGEN_HOJA_CM_PT;
  const footerTop = pageH - MARGEN_HOJA_CM_PT - FOOTER_BLOCK_H_PT;
  const qrY = footerTop;

  doc.image(qrPng, left, qrY, { width: QR_SIZE_MM_PT, height: QR_SIZE_MM_PT });

  const footerTextW = doc.page.width - doc.page.margins.right - left;
  let textY = qrY + QR_SIZE_MM_PT + QR_FOOTER_TEXT_GAP_PT;
  drawKeyValue(doc, "Código de Seguridad", codigoSeg, left, textY, footerTextW);
  textY += QR_FOOTER_TEXT_LINE_H_PT;
  if (fechaFirmaDisplay.trim()) {
    drawKeyValue(doc, "Fecha Firma", fechaFirmaDisplay, left, textY, footerTextW);
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

  let logoPath: string | Buffer | null = null;
  if (input.uploadsRoot && input.company.id != null) {
    logoPath = await resolveCompanyLogoImage(
      input.uploadsRoot,
      input.company.id,
      input.company.logoUrl,
    );
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: {
        top: MARGEN_HOJA_CM_PT,
        left: MARGEN_HOJA_CM_PT,
        right: MARGEN_HOJA_CM_PT,
        bottom: MARGEN_HOJA_CM_PT,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const totalesLines = buildTotalesLines(data);
    const reservedFooterH = Math.max(FOOTER_BLOCK_H_PT, totalesBoxHeight(totalesLines.length));

    drawHeaderBlock(doc, data, logoPath, input.company.phone);
    doc.moveDown(0.4);
    drawItemsTable(doc, data, logoPath, reservedFooterH);
    drawDescuentosRecargosGlobales(doc, data);

    const footerBottomY = doc.page.height - MARGEN_HOJA_CM_PT;
    const totalesTopY = footerBottomY - totalesBoxHeight(totalesLines.length);
    if (doc.y > totalesTopY - 8) {
      doc.addPage();
    }

    drawTotalesFooter(doc, totalesLines, footerBottomY);
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
