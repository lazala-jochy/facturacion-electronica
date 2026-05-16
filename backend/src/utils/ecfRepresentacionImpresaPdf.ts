import QRCode from "qrcode";
import PDFDocument from "pdfkit";
import type { Company } from "@prisma/client";
import { buildConsultaTimbreQrUrl } from "./ecfConsultaTimbreQr";
import { codigoSeguridadDesdeSignedXml, extractXmlTagValue, parseEcfItemRows } from "./ecfXmlExtract";

const fechaEmisionDisplay = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 8) return raw;
  return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
};

export type RepresentacionImpresaInput = {
  signedXml: string;
  company: Pick<Company, "dgiiEnvironment" | "name">;
  ecfTipo: string;
  fechaFirma: Date;
  dgiiTrackId?: string | null;
};

export const buildRepresentacionImpresaPdfBuffer = async (
  input: RepresentacionImpresaInput,
): Promise<Buffer> => {
  const qrUrl = buildConsultaTimbreQrUrl({
    signedXml: input.signedXml,
    dgiiEnvironment: input.company.dgiiEnvironment,
    ecfTipo: input.ecfTipo,
    fechaFirma: input.fechaFirma,
  });
  const codigoSeg = codigoSeguridadDesdeSignedXml(input.signedXml);

  const qrPng = await QRCode.toBuffer(qrUrl, {
    type: "png",
    width: 280,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  const rncE = extractXmlTagValue(input.signedXml, "RNCEmisor");
  const rsE = extractXmlTagValue(input.signedXml, "RazonSocialEmisor");
  const dirE = extractXmlTagValue(input.signedXml, "DireccionEmisor");
  const telE = extractXmlTagValue(input.signedXml, "TelefonoEmisor");
  const mailE = extractXmlTagValue(input.signedXml, "CorreoEmisor");

  const rncC = extractXmlTagValue(input.signedXml, "RNCComprador");
  const rsC = extractXmlTagValue(input.signedXml, "RazonSocialComprador");
  const dirC = extractXmlTagValue(input.signedXml, "DireccionComprador");

  const encf = extractXmlTagValue(input.signedXml, "eNCF");
  const ncfMod = extractXmlTagValue(input.signedXml, "NCFModificado");
  const fechaEm = extractXmlTagValue(input.signedXml, "FechaEmision");

  const gravado = extractXmlTagValue(input.signedXml, "MontoGravadoTotal");
  const itbis = extractXmlTagValue(input.signedXml, "ITBIS1");
  const total = extractXmlTagValue(input.signedXml, "MontoTotal");

  const items = parseEcfItemRows(input.signedXml);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 36, left: 40, right: 40, bottom: 50 },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(14).text("REPRESENTACIÓN IMPRESA", { align: "center" });
    doc
      .font("Helvetica")
      .fontSize(10)
      .text("Comprobante Fiscal Electrónico (e-CF) — datos según XML enviado", { align: "center" });
    doc.moveDown(0.6);

    doc.font("Helvetica-Bold").fontSize(10).text("Emisor");
    doc.font("Helvetica").fontSize(9);
    doc.text(`RNC: ${rncE}`);
    doc.text(`Razón social: ${rsE || input.company.name}`);
    if (dirE) doc.text(`Dirección: ${dirE}`);
    if (telE) doc.text(`Tel.: ${telE}`);
    if (mailE) doc.text(`Email: ${mailE}`);
    doc.moveDown(0.4);

    doc.font("Helvetica-Bold").text("Comprador");
    doc.font("Helvetica");
    doc.text(`RNC / Cédula: ${rncC}`);
    doc.text(`Razón social / nombre: ${rsC}`);
    if (dirC) doc.text(`Dirección: ${dirC}`);
    doc.moveDown(0.4);

    doc.font("Helvetica-Bold").text("Comprobante");
    doc.font("Helvetica");
    doc.text(`e-NCF: ${encf}`);
    if (ncfMod) doc.text(`NCF / e-NCF modificado: ${ncfMod}`);
    doc.text(`Fecha de emisión: ${fechaEmisionDisplay(fechaEm)} (${fechaEm} en XML)`);
    if (input.dgiiTrackId?.trim()) doc.text(`Track ID DGII: ${input.dgiiTrackId.trim()}`);
    doc.moveDown(0.5);

    doc.font("Helvetica-Bold").fontSize(10).text("Detalle");
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(8);

    const left = doc.page.margins.left;
    const y0 = doc.y;
    doc.text("#", left, y0, { width: 22 });
    doc.text("Descripción", left + 22, y0, { width: 200 });
    doc.text("Cant.", left + 230, y0, { width: 40 });
    doc.text("Unidad", left + 268, y0, { width: 48 });
    doc.text("P. unit.", left + 318, y0, { width: 52 });
    doc.text("Monto", left + 400, y0, { width: 60, align: "right" });
    doc.moveDown(0.35);

    for (const row of items) {
      const y = doc.y;
      doc.text(row.numeroLinea || "—", left, y, { width: 22 });
      doc.text(row.nombreItem || "—", left + 22, y, { width: 200 });
      doc.text(row.cantidad || "—", left + 230, y, { width: 40 });
      doc.text(row.unidad || "—", left + 268, y, { width: 48 });
      doc.text(row.precioUnitario || "—", left + 318, y, { width: 52 });
      doc.text(row.montoItem || "—", left + 400, y, { width: 60, align: "right" });
      doc.moveDown(0.25);
    }

    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(9);
    doc.text(`Monto gravado: RD$ ${gravado}`);
    doc.text(`ITBIS: RD$ ${itbis}`);
    doc.text(`Monto total: RD$ ${total}`);
    doc.moveDown(0.8);

    doc.font("Helvetica-Bold").fontSize(10).text("Consulta timbre (código QR)", { align: "center" });
    doc.moveDown(0.3);
    const qrX =
      (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2 + doc.page.margins.left - 70;
    doc.image(qrPng, qrX, doc.y, { width: 140 });
    doc.moveDown(5.2);
    doc.font("Helvetica-Bold").fontSize(11).text(`Código de seguridad: ${codigoSeg}`, { align: "center" });
    doc.moveDown(0.2);
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#333333")
      .text(qrUrl, {
        align: "center",
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      });
    doc.fillColor("#000000");
    doc.moveDown(0.4);
    doc
      .fontSize(8)
      .text(
        "Este documento refleja los mismos datos del e-CF firmado enviado a DGII. " +
          "El escaneo del QR debe abrir la consulta de timbre con los parámetros del comprobante.",
        { align: "center" },
      );

    doc.end();
  });
};
