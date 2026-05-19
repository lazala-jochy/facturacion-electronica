import QRCode from "qrcode";
import PDFDocument from "pdfkit";
import type { Company } from "@prisma/client";

type PdfDoc = InstanceType<typeof PDFDocument>;
import { buildConsultaTimbreQrUrl } from "./ecfConsultaTimbreQr";
import { codigoSeguridadDesdeSignedXml } from "./ecfXmlExtract";
import {
  formatRd,
  parseRepresentacionImpresaData,
  type RepresentacionImpresaData,
  type RiItemRow,
} from "./ecfRepresentacionImpresaData";

/** §18.2.3: margen mínimo 2 cm desde el borde; QR mínimo 22×22 mm. */
const MARGEN_HOJA_CM_PT = 56.7;
const QR_SIZE_MM_PT = 62.4;

export type RepresentacionImpresaInput = {
  signedXml: string;
  company: Pick<Company, "dgiiEnvironment" | "name">;
  ecfTipo: string;
  fechaFirma: Date;
  dgiiTrackId?: string | null;
};

const drawLabelValue = (
  doc: PdfDoc,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  opts?: { boldValue?: boolean },
) => {
  if (!value.trim()) return y;
  doc.font("Helvetica-Bold").fontSize(8).text(`${label}: `, x, y, { width, continued: true });
  doc
    .font(opts?.boldValue ? "Helvetica-Bold" : "Helvetica")
    .text(value, { width });
  return doc.y;
};

const drawHeaderBlock = (doc: PdfDoc, data: RepresentacionImpresaData) => {
  const pageW = doc.page.width;
  const left = doc.page.margins.left;
  const right = pageW - doc.page.margins.right;
  const mid = (left + right) / 2;
  const colW = mid - left - 8;
  const y0 = doc.y;

  doc.font("Helvetica").fontSize(8);

  let yLeft = y0;
  const pushLeft = (label: string, value: string) => {
    if (!value.trim()) return;
    yLeft = drawLabelValue(doc, left, yLeft, colW, label, value) + 2;
  };

  pushLeft("Nombre comercial", data.emisor.nombreComercial);
  pushLeft(
    "Nombre o razón social",
    data.emisor.razonSocial || "",
  );
  pushLeft("RNC", data.emisor.rnc);
  pushLeft("Dirección", data.emisor.direccion);
  pushLeft("Municipio", data.emisor.municipio);
  pushLeft("Provincia", data.emisor.provincia);
  pushLeft("Fecha de emisión", data.emisor.fechaEmision);

  let yRight = y0;
  const pushRight = (label: string, value: string, bold = false) => {
    if (!value.trim()) return;
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(`${label}: `, mid + 8, yRight, { width: colW, continued: true });
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(bold ? 9 : 8)
      .text(value, { width: colW, align: "right" });
    yRight = doc.y + 2;
  };

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(data.tipoLabel, mid + 8, yRight, { width: colW, align: "right" });
  yRight = doc.y + 4;

  pushRight("e-NCF", data.encf, true);
  if (data.fechaVencimientoSecuencia) {
    pushRight("Fecha vencimiento (secuencia)", data.fechaVencimientoSecuencia);
  }
  if (data.ncfModificado) {
    pushRight("e-NCF modificado", data.ncfModificado);
  }
  if (data.codigoModificacionLabel) {
    pushRight("Código de modificación", data.codigoModificacionLabel);
  } else if (data.codigoModificacion) {
    pushRight("Código de modificación", data.codigoModificacion);
  }

  doc.y = Math.max(yLeft, yRight) + 6;
  doc
    .moveTo(left, doc.y)
    .lineTo(right, doc.y)
    .strokeColor("#cccccc")
    .stroke()
    .strokeColor("#000000");
  doc.moveDown(0.35);

  doc.font("Helvetica-Bold").fontSize(9).text("Cliente / destinatario", left);
  doc.moveDown(0.15);
  doc.font("Helvetica").fontSize(8);
  const compradorId =
    data.comprador.identificadorExtranjero.trim() ||
    data.comprador.rncCedula.trim() ||
    "—";
  doc.text(`Nombre o razón social: ${data.comprador.razonSocial || "—"}`);
  doc.text(
    data.comprador.identificadorExtranjero
      ? `Identificador extranjero: ${data.comprador.identificadorExtranjero}`
      : `RNC / cédula: ${compradorId}`,
  );
  doc.moveDown(0.4);
};

const drawItemsTable = (doc: PdfDoc, data: RepresentacionImpresaData) => {
  const items = data.items;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const tableW = right - left;

  const cols = {
    num: 20,
    desc: 200,
    cant: 36,
    unidad: 52,
    precio: 58,
    itbis: 48,
    valor: 58,
  };
  const xDesc = left + cols.num;
  const xCant = xDesc + cols.desc;
  const xUnidad = xCant + cols.cant;
  const xPrecio = xUnidad + cols.unidad;
  const xItbis = xPrecio + cols.precio;
  const xValor = xItbis + cols.itbis;

  const drawTableHeader = () => {
    const y0 = doc.y;
    doc.font("Helvetica-Bold").fontSize(7);
    doc.text("#", left, y0, { width: cols.num });
    doc.text("Descripción", xDesc, y0, { width: cols.desc });
    doc.text("Cant.", xCant, y0, { width: cols.cant, align: "right" });
    doc.text("Unidad", xUnidad, y0, { width: cols.unidad });
    doc.text("Precio", xPrecio, y0, { width: cols.precio, align: "right" });
    doc.text("ITBIS", xItbis, y0, { width: cols.itbis, align: "right" });
    doc.text("Valor", xValor, y0, { width: cols.valor, align: "right" });
    doc.moveDown(0.35);
    doc
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .strokeColor("#aaaaaa")
      .stroke()
      .strokeColor("#000000");
    doc.moveDown(0.15);
  };

  const footerY = doc.page.height - doc.page.margins.bottom - QR_SIZE_MM_PT - 90;

  doc.font("Helvetica-Bold").fontSize(9).text("Detalle de bienes o servicios", left);
  doc.moveDown(0.2);
  drawTableHeader();

  doc.font("Helvetica").fontSize(7);
  for (const row of items) {
    if (doc.y > footerY) {
      doc.addPage();
      drawHeaderBlock(doc, data);
      doc.font("Helvetica-Bold").fontSize(9).text("Detalle de bienes o servicios (continuación)", left);
      doc.moveDown(0.2);
      drawTableHeader();
      doc.font("Helvetica").fontSize(7);
    }

    const desc =
      (row.prefijoExento ? `${row.prefijoExento} ` : "") + (row.nombreItem || "—");
    const y = doc.y;
    doc.text(row.numeroLinea || "—", left, y, { width: cols.num });
    doc.text(desc, xDesc, y, { width: cols.desc });
    doc.text(row.cantidad || "—", xCant, y, { width: cols.cant, align: "right" });
    doc.text(row.unidadLabel || row.unidadCodigo || "—", xUnidad, y, { width: cols.unidad });
    doc.text(row.precioUnitario || "—", xPrecio, y, { width: cols.precio, align: "right" });
    doc.text(row.itbisLinea || "—", xItbis, y, { width: cols.itbis, align: "right" });
    doc.text(row.montoItem || "—", xValor, y, { width: cols.valor, align: "right" });
    doc.moveDown(0.22);
  }

  if (!items.length) {
    doc.font("Helvetica").fontSize(8).text("Sin líneas de detalle en el XML.", left, doc.y, {
      width: tableW,
    });
    doc.moveDown(0.3);
  }
};

const drawTotales = (doc: PdfDoc, data: RepresentacionImpresaData) => {
  const right = doc.page.width - doc.page.margins.right;
  const labelW = 160;
  const xLabel = right - labelW - 70;

  const pushTotal = (label: string, value: string, bold = false) => {
    if (!value.trim()) return;
    const line = `${label}: ${formatRd(value) || value}`;
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(bold ? 9 : 8)
      .text(line, xLabel, doc.y, { width: right - xLabel, align: "right" });
    doc.moveDown(0.2);
  };

  doc.moveDown(0.3);
  pushTotal("Subtotal gravado", data.totales.subtotalGravado);
  pushTotal("Subtotal exento", data.totales.subtotalExento);
  pushTotal("Total ITBIS", data.totales.totalItbis);
  pushTotal("Total ISC", data.totales.totalIsc);
  pushTotal("Total ISR retención", data.totales.totalIsr);
  pushTotal("Total", data.totales.total, true);
};

const drawQrFooter = (
  doc: PdfDoc,
  qrPng: Buffer,
  qrUrl: string,
  codigoSeg: string,
  fechaFirmaDisplay: string,
  esConsumoMenor250: boolean,
) => {
  const pageH = doc.page.height;
  const left = MARGEN_HOJA_CM_PT;
  const qrY = pageH - MARGEN_HOJA_CM_PT - QR_SIZE_MM_PT;
  const textX = left + QR_SIZE_MM_PT + 12;
  const textW = doc.page.width - textX - doc.page.margins.right;

  doc.image(qrPng, left, qrY, { width: QR_SIZE_MM_PT, height: QR_SIZE_MM_PT });

  doc.font("Helvetica-Bold").fontSize(9);
  doc.text("Consulta de timbre (código QR)", textX, qrY, { width: textW });
  doc.moveDown(0.15);
  doc.font("Helvetica-Bold").fontSize(10).text(`Código de seguridad: ${codigoSeg}`, textX, doc.y, {
    width: textW,
  });
  if (fechaFirmaDisplay.trim()) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .text(`Fecha de firma digital: ${fechaFirmaDisplay}`, textX, doc.y + 2, { width: textW });
  }
  doc
    .font("Helvetica")
    .fontSize(6.5)
    .fillColor("#444444")
    .text(qrUrl, textX, doc.y + 4, { width: textW });
  doc.fillColor("#000000");
  doc
    .fontSize(7)
    .text(
      esConsumoMenor250
        ? "Factura de consumo electrónica menor a RD$250,000. El QR permite consultar el timbre en DGII."
        : "Documento alineado al Informe Técnico e-CF (§18). El escaneo del QR abre la consulta de timbre DGII.",
      textX,
      doc.y + 4,
      { width: textW },
    );
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
  const codigoSeg = codigoSeguridadDesdeSignedXml(input.signedXml);

  const qrPng = await QRCode.toBuffer(qrUrl, {
    type: "png",
    width: 280,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: {
        top: 36,
        left: MARGEN_HOJA_CM_PT,
        right: 40,
        bottom: MARGEN_HOJA_CM_PT,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(11).text("REPRESENTACIÓN IMPRESA", { align: "center" });
    doc
      .font("Helvetica")
      .fontSize(8)
      .text("Comprobante Fiscal Electrónico (e-CF)", { align: "center" });
    if (data.dgiiTrackId?.trim()) {
      doc.fontSize(7).text(`Track ID DGII: ${data.dgiiTrackId.trim()}`, { align: "center" });
    }
    doc.moveDown(0.5);

    drawHeaderBlock(doc, data);
    drawItemsTable(doc, data);
    drawTotales(doc, data);

    const qrReserveTop = doc.page.height - MARGEN_HOJA_CM_PT - QR_SIZE_MM_PT - 72;
    if (doc.y > qrReserveTop) {
      doc.addPage();
    }
    drawQrFooter(doc, qrPng, qrUrl, codigoSeg, fechaFirmaDisplay, data.esConsumoMenor250);

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
