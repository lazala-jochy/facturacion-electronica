import PDFDocument from "pdfkit";
import { ECF_TIPO_LABELS } from "./ecfTipo";
import { resolveCompanyLogoImage } from "./companyLogo";
import { resolveCompanySignatureImage } from "./companySignature";

type PdfDoc = InstanceType<typeof PDFDocument>;

type CotizacionForPdf = {
  number: number;
  createdAt: Date;
  paymentTerms: string;
  paymentMethod: string | null;
  fechaLimitePago?: Date | null;
  comment: string | null;
  documentTitle: string;
  fiscalLegend: string;
  ecfTipo?: string | null;
  ecfReferenceNcf?: string | null;
  subtotal: number;
  itbis: number;
  total: number;
  exento?: boolean;
  company: {
    id?: number;
    name: string;
    rnc: string;
    address: string;
    phone: string | null;
    email: string | null;
    regime: string | null;
    logoUrl?: string | null;
    signatureUrl?: string | null;
  };
  client: {
    name: string;
    address: string | null;
    rncCedula: string;
    phone: string | null;
    email: string | null;
  };
  items: Array<{
    itemNumber: number;
    quantity: number;
    unit: string;
    description: string;
    unitPrice: number;
    totalValue: number;
  }>;
};

/** Mismo lenguaje visual que la representación impresa del e-CF (acento azul, tabla con encabezado gris). */
const MARGEN_PT = 56.7;
const COLOR_ACCENT = "#1e4a8a";
const COLOR_TABLE_HEAD = "#d9dce3";
const COLOR_GRID = "#a9afba";
const LOGO_MAX_PT = 56;
const TABLE_HEADER_H_PT = 22;
const TABLE_ROW_PAD_PT = 5;
const BASE_FONT_PT = 9.5;

const money = (value: number) =>
  new Intl.NumberFormat("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatDateDisplay = (d: Date) =>
  new Intl.DateTimeFormat("es-DO", { timeZone: "America/Santo_Domingo" }).format(d);

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

/** Dibuja "Etiqueta: valor" (negrita + normal) y devuelve el alto ocupado (por si el valor hizo wrap). */
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

const drawHeaderBlock = (
  doc: PdfDoc,
  cotizacion: CotizacionForPdf,
  logoPath: string | Buffer | null,
) => {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
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
  doc.font("Helvetica-Bold").fontSize(13).text(cotizacion.company.name, textLeft, yLeft, {
    width: colW,
  });
  yLeft = doc.y + 3;
  doc.font("Helvetica").fontSize(BASE_FONT_PT);
  yLeft += drawKeyValue(doc, "RNC", cotizacion.company.rnc, textLeft, yLeft, colW);
  if (cotizacion.company.address.trim()) {
    yLeft += drawKeyValue(doc, "Dirección", cotizacion.company.address, textLeft, yLeft, colW);
  }
  yLeft += drawKeyValue(doc, "Tel", cotizacion.company.phone || "-", textLeft, yLeft, colW);
  yLeft += drawKeyValue(doc, "Email", cotizacion.company.email || "-", textLeft, yLeft, colW);
  yLeft += drawKeyValue(doc, "Fecha Emisión", formatDateDisplay(cotizacion.createdAt), textLeft, yLeft, colW);

  let yRight = contentStartY;
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(COLOR_ACCENT)
    .text(cotizacion.documentTitle || "Pre-factura", mid + 10, yRight, {
      width: right - mid - 10,
      align: "right",
    });
  doc.fillColor("#000000");
  yRight = doc.y + 6;

  const pushRightKv = (label: string, value: string, size = BASE_FONT_PT) => {
    if (!value.trim()) return;
    yRight += drawKeyValue(doc, label, value, mid + 10, yRight, right - mid - 10, "right", size);
  };

  pushRightKv("No.", String(cotizacion.number), BASE_FONT_PT + 1);
  if (cotizacion.fechaLimitePago) {
    pushRightKv("Fecha límite de pago", formatDateDisplay(cotizacion.fechaLimitePago));
  }
  const tipo = (cotizacion.ecfTipo ?? "").trim();
  if (tipo) {
    const lbl = ECF_TIPO_LABELS[tipo] ?? "";
    pushRightKv("Tipo comprobante (e-CF)", lbl ? `${tipo} — ${lbl}` : tipo);
  }
  const refDoc = (cotizacion.ecfReferenceNcf ?? "").trim();
  if (refDoc) {
    pushRightKv("Documento referencia", refDoc);
  }

  doc.y = Math.max(yLeft, yRight) + 8;
  drawAccentRule(doc, doc.y);
  doc.moveDown(0.45);

  let yClient = doc.y;
  yClient += drawKeyValue(doc, "Razón social cliente", cotizacion.client.name || "—", left, yClient, colW);
  yClient += drawKeyValue(doc, "RNC Cliente", cotizacion.client.rncCedula || "—", left, yClient, colW);
  if (cotizacion.client.address?.trim()) {
    yClient += drawKeyValue(doc, "Dirección", cotizacion.client.address.trim(), left, yClient, colW);
  }
  if (cotizacion.client.phone?.trim()) {
    yClient += drawKeyValue(doc, "Teléfono", cotizacion.client.phone.trim(), left, yClient, colW);
  }
  if (cotizacion.client.email?.trim()) {
    yClient += drawKeyValue(doc, "Correo", cotizacion.client.email.trim(), left, yClient, colW);
  }
  doc.y = yClient + 10;

  if (cotizacion.fiscalLegend.trim()) {
    doc.font("Helvetica-Oblique").fontSize(BASE_FONT_PT).fillColor("#444444");
    doc.text(cotizacion.fiscalLegend, left);
    doc.fillColor("#000000");
    doc.y += 14;
  }
};

type ItemsTableLayout = {
  gap: number;
  w: { cant: number; desc: number; unidad: number; precio: number; valor: number };
  x: { cant: number; desc: number; unidad: number; precio: number; valor: number };
};

const buildItemsTableLayout = (left: number, tableW: number): ItemsTableLayout => {
  const gap = 8;
  const ratios = { cant: 0.08, desc: 0.42, unidad: 0.14, precio: 0.17, valor: 0.19 };
  const contentW = tableW - gap * 4;
  const w = {
    cant: Math.floor(contentW * ratios.cant),
    desc: Math.floor(contentW * ratios.desc),
    unidad: Math.floor(contentW * ratios.unidad),
    precio: Math.floor(contentW * ratios.precio),
    valor: Math.max(55, Math.floor(contentW * ratios.valor)),
  };
  const used = w.cant + w.desc + w.unidad + w.precio + w.valor + gap * 4;
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

const drawItemsTable = (doc: PdfDoc, cotizacion: CotizacionForPdf) => {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const tableW = right - left;
  const { w, x, gap } = buildItemsTableLayout(left, tableW);
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 24;

  const boundaries = [
    left,
    x.desc - gap / 2,
    x.unidad - gap / 2,
    x.precio - gap / 2,
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

  const drawTableHeader = () => {
    const y0 = doc.y;
    const h = TABLE_HEADER_H_PT;
    doc.rect(left, y0, tableW, h).fill(COLOR_TABLE_HEAD);
    drawGridBox(y0, y0 + h);
    doc.fillColor("#000000").font("Helvetica-Bold").fontSize(BASE_FONT_PT - 1);
    const ty = y0 + 6;
    cellText(doc, "Cant", x.cant, ty, w.cant, "right");
    cellText(doc, "Descripción", x.desc, ty, w.desc);
    cellText(doc, "Unidad", x.unidad, ty, w.unidad);
    cellText(doc, "Precio", x.precio, ty, w.precio, "right");
    cellText(doc, "Valor", x.valor, ty, w.valor, "right");
    doc.y = y0 + h;
  };

  drawTableHeader();
  doc.font("Helvetica").fontSize(BASE_FONT_PT);

  if (!cotizacion.items.length) {
    const rowTop = doc.y;
    const rowH = 24;
    drawGridBox(rowTop, rowTop + rowH);
    doc.font("Helvetica").fontSize(BASE_FONT_PT).text("Sin líneas de detalle.", left + 6, rowTop + 7);
    doc.y = rowTop + rowH;
  } else {
    for (const item of cotizacion.items) {
      if (doc.y > bottomLimit) {
        doc.addPage();
        doc.y = doc.page.margins.top;
        drawTableHeader();
        doc.font("Helvetica").fontSize(BASE_FONT_PT);
      }

      const desc = item.description.trim() || "(Sin descripción)";
      const descH = doc.heightOfString(desc, { width: w.desc, lineBreak: true });
      const rowTop = doc.y;
      const rowH = Math.max(BASE_FONT_PT + 2, descH + 2) + TABLE_ROW_PAD_PT * 2;
      const textY = rowTop + TABLE_ROW_PAD_PT;

      drawGridBox(rowTop, rowTop + rowH);

      cellText(doc, item.quantity.toFixed(2), x.cant, textY, w.cant, "right");
      doc.text(desc, x.desc, textY, { width: w.desc, lineBreak: true });
      cellText(doc, item.unit || "-", x.unidad, textY, w.unidad);
      cellText(doc, money(item.unitPrice), x.precio, textY, w.precio, "right");
      cellText(doc, money(item.totalValue), x.valor, textY, w.valor, "right");
      doc.y = rowTop + rowH;
    }
  }

  doc.y += 30;
};

const TOTALES_ROW_H_PT = 16;

/** Dibuja la caja de totales empezando en `topY` (mismo nivel que la info de pago) y devuelve el Y final. */
const drawTotalesBox = (doc: PdfDoc, cotizacion: CotizacionForPdf, topY: number): number => {
  const right = doc.page.width - doc.page.margins.right;
  const valueW = 110;
  const labelW = 150;
  const boxLeft = right - labelW - valueW;
  const valueX = right - valueW;

  const subtotalExento = cotizacion.exento ? cotizacion.subtotal : 0;
  const subtotalGravado = cotizacion.exento ? 0 : cotizacion.subtotal;
  const moneyOrDash = (value: number) => (value > 0 ? money(value) : "-");
  const lines: { label: string; value: string; bold?: boolean }[] = [
    { label: "Subtotal Gravado", value: moneyOrDash(subtotalGravado) },
    { label: "Subtotal Exento", value: moneyOrDash(subtotalExento) },
    { label: "Total ITBIS", value: moneyOrDash(cotizacion.itbis) },
    { label: "Monto Total", value: money(cotizacion.total), bold: true },
  ];

  const boxH = TOTALES_ROW_H_PT * lines.length + 6;
  const boxTop = topY;
  const baseY = boxTop + 3;

  doc.rect(valueX, boxTop, valueW, boxH).fill(COLOR_TABLE_HEAD);

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

  return boxTop + boxH;
};

/** Dibuja la info de pago empezando en `topY` (mismo nivel que la caja de totales) y devuelve el Y final. */
const drawPaymentInfo = (doc: PdfDoc, cotizacion: CotizacionForPdf, topY: number): number => {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - 110 - 150 - 12 - left;
  let y = topY;
  const row = (label: string, value: string) => {
    y += drawKeyValue(doc, label, value, left, y, width, "left", BASE_FONT_PT + 0.5);
  };

  if (cotizacion.paymentTerms.trim()) {
    row("Condiciones", cotizacion.paymentTerms);
  }
  row("Forma de pago", cotizacion.paymentMethod || "-");
  if (cotizacion.fechaLimitePago) {
    row("Fecha límite de pago", formatDateDisplay(cotizacion.fechaLimitePago));
  }
  if (cotizacion.comment?.trim()) {
    row("Comentario", cotizacion.comment.trim());
  }
  y += 6;
  row("Total de líneas", String(cotizacion.items.length));
  row(
    "Total de productos",
    cotizacion.items.reduce((acc, item) => acc + item.quantity, 0).toFixed(2),
  );
  return y;
};

const SIGNATURE_IMAGE_MAX_W_PT = 140;
const SIGNATURE_IMAGE_MAX_H_PT = 60;

/** Nombre completo + "Firma autorizada" + imagen de firma (en ese orden), debajo de los totales. */
const drawSignatureBlock = (
  doc: PdfDoc,
  signerFullName: string | null | undefined,
  signatureImagePath: string | Buffer | null,
) => {
  const name = (signerFullName ?? "").trim();
  if (!name && !signatureImagePath) return;

  const left = doc.page.margins.left;
  const bottom = doc.page.height - doc.page.margins.bottom;
  const estimatedH = 18 + 14 + (signatureImagePath ? SIGNATURE_IMAGE_MAX_H_PT + 6 : 0);
  if (doc.y + estimatedH > bottom) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }

  let y = doc.y;
  if (name) {
    doc.font("Helvetica-Bold").fontSize(BASE_FONT_PT).fillColor("#000000").text(name, left, y);
    y = doc.y + 2;
  }
  doc
    .font("Helvetica")
    .fontSize(BASE_FONT_PT - 0.5)
    .fillColor("#444444")
    .text("Firma autorizada", left, y);
  y = doc.y + 6;

  if (signatureImagePath) {
    try {
      doc.image(signatureImagePath, left, y, {
        fit: [SIGNATURE_IMAGE_MAX_W_PT, SIGNATURE_IMAGE_MAX_H_PT],
      });
      y += SIGNATURE_IMAGE_MAX_H_PT + 6;
    } catch {
      /* imagen invalida/corrupta: se omite sin romper el PDF */
    }
  }
  doc.fillColor("#000000");
  doc.y = y;
};

export const buildCotizacionPdfBuffer = async (
  cotizacion: CotizacionForPdf,
  opts?: { uploadsRoot?: string; signerFullName?: string | null },
): Promise<Buffer> => {
  let logoPath: string | Buffer | null = null;
  let signaturePath: string | Buffer | null = null;
  if (opts?.uploadsRoot && cotizacion.company.id != null) {
    logoPath = await resolveCompanyLogoImage(
      opts.uploadsRoot,
      cotizacion.company.id,
      cotizacion.company.logoUrl,
    );
    signaturePath = await resolveCompanySignatureImage(
      opts.uploadsRoot,
      cotizacion.company.id,
      cotizacion.company.signatureUrl,
    );
  }

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGEN_PT, left: MARGEN_PT, right: MARGEN_PT, bottom: MARGEN_PT },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawHeaderBlock(doc, cotizacion, logoPath);
    drawItemsTable(doc, cotizacion);
    const sectionTop = doc.y;
    const paymentBottomY = drawPaymentInfo(doc, cotizacion, sectionTop);
    const totalsBottomY = drawTotalesBox(doc, cotizacion, sectionTop);
    doc.y = Math.max(paymentBottomY, totalsBottomY) + 16;

    doc.moveDown(0.8);
    drawSignatureBlock(doc, opts?.signerFullName, signaturePath);

    doc.moveDown(0.8);
    doc
      .font("Helvetica-Oblique")
      .fontSize(BASE_FONT_PT)
      .fillColor("#444444")
      .text("Generado en sistema de facturación", { align: "center" });

    doc.end();
  });
};
