import PDFDocument from "pdfkit";

type CotizacionForPdf = {
  number: number;
  createdAt: Date;
  paymentTerms: string;
  paymentMethod: string | null;
  accountManager: string;
  comment: string | null;
  documentTitle: string;
  fiscalLegend: string;
  subtotal: number;
  itbis: number;
  total: number;
  company: {
    name: string;
    rnc: string;
    address: string;
    phone: string | null;
    email: string | null;
    regime: string | null;
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

const money = (value: number) =>
  new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
    minimumFractionDigits: 2,
  }).format(value);

const formatReceiptMoney = (value: number) =>
  `RD$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const buildCotizacionPdfBuffer = (
  cotizacion: CotizacionForPdf,
  issuerPersonName?: string | null,
) =>
  new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      // A4 vertical para un PDF legible al imprimir o visualizar.
      size: "A4",
      margins: { top: 36, left: 40, right: 40, bottom: 36 },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(12).text(issuerPersonName || cotizacion.accountManager, {
      align: "center",
    });
    doc.moveDown(0.15);
    doc.font("Helvetica-Bold").fontSize(18).text(cotizacion.company.name, {
      align: "center",
    });
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(11);
    doc.text(`RNC: ${cotizacion.company.rnc}`, { align: "center" });
    doc.text(cotizacion.company.address, { align: "center" });
    doc.text(
      `Tel: ${cotizacion.company.phone || "-"}  Email: ${cotizacion.company.email || "-"}`,
      { align: "center" },
    );
    doc.text(`Regimen: ${cotizacion.company.regime || "Régimen general"}`, {
      align: "center",
    });
    doc.moveDown(0.6);

    doc.font("Helvetica-Bold").fontSize(13);
    doc.text(cotizacion.documentTitle || "Pre-factura", { align: "center" });
    doc.text("Con valor fiscal", { align: "center" });
    doc.moveDown(0.55);

    doc.font("Helvetica-Bold").fontSize(11).text("CLIENTE", { underline: true });
    doc.font("Helvetica").fontSize(10.5);
    doc.text(cotizacion.client.name);
    doc.text(cotizacion.client.address || "-");
    doc.text(`RNC/Cedula: ${cotizacion.client.rncCedula}`);
    doc.text(`Tel: ${cotizacion.client.phone || "-"}`);
    doc.text(`Email: ${cotizacion.client.email || "-"}`);
    doc.moveDown(0.6);

    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();
    doc.moveDown(0.4);

    doc.font("Helvetica-Bold").fontSize(10.5);
    const leftX = doc.page.margins.left;
    const rightX = doc.page.width - doc.page.margins.right;
    const qtyColX = rightX - 165;
    const valueColX = rightX - 5;
    const headerY = doc.y;
    doc.text("SERVICIOS", leftX, headerY, { width: qtyColX - leftX - 8 });
    doc.text("CANT", qtyColX, headerY, { width: 52, align: "right" });
    doc.text("VALOR", valueColX - 95, headerY, { width: 95, align: "right" });
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(10);

    for (const item of cotizacion.items) {
      const label = `${item.description} (${item.unit})`;
      const rowY = doc.y;
      doc.text(label, leftX, rowY, { width: qtyColX - leftX - 8 });
      doc.text(item.quantity.toFixed(2), qtyColX, rowY, { width: 52, align: "right" });
      doc.text(formatReceiptMoney(item.totalValue), valueColX - 95, rowY, {
        width: 95,
        align: "right",
      });
      doc.y = Math.max(doc.y, rowY + 14);
    }

    doc.moveDown(0.4);
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();
    doc.moveDown(0.4);

    const summaryLeftX = doc.page.width - doc.page.margins.right - 220;
    const summaryWidth = 220;
    const labelWidth = 92;
    const valueWidth = summaryWidth - labelWidth;
    const pushSummaryRow = (
      label: string,
      value: string,
      options?: { bold?: boolean; size?: number; gap?: number },
    ) => {
      const rowY = doc.y;
      const weight = options?.bold ? "Helvetica-Bold" : "Helvetica";
      const size = options?.size ?? 11;
      doc.font(weight).fontSize(size).text(label, summaryLeftX, rowY, {
        width: labelWidth,
        align: "right",
      });
      doc.text(value, summaryLeftX + labelWidth, rowY, {
        width: valueWidth,
        align: "right",
      });
      doc.y = rowY + (options?.gap ?? 22);
    };

    pushSummaryRow("Subtotal:", money(cotizacion.subtotal));
    const subtotalExento = 0;
    const subtotalGravado = cotizacion.subtotal;
    pushSummaryRow("Subtotal Exento:", money(subtotalExento));
    pushSummaryRow("Subtotal Gravado:", money(subtotalGravado));
    pushSummaryRow("ITBIS:", money(cotizacion.itbis));
    pushSummaryRow("Total:", money(cotizacion.total), { bold: true, size: 14, gap: 28 });

    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10.5);
    doc.text(`Condiciones: ${cotizacion.paymentTerms}`, summaryLeftX, doc.y, {
      width: summaryWidth,
      align: "left",
    });
    doc.text(`Forma de pago: ${cotizacion.paymentMethod || "-"}`, summaryLeftX, doc.y, {
      width: summaryWidth,
      align: "left",
    });
    doc.text(`Ejecutivo: ${cotizacion.accountManager}`, summaryLeftX, doc.y, {
      width: summaryWidth,
      align: "left",
    });
    if (cotizacion.comment?.trim()) {
      doc.text(`Comentario: ${cotizacion.comment.trim()}`, summaryLeftX, doc.y, {
        width: summaryWidth,
        align: "left",
      });
    }
    doc.moveDown(0.5);
    doc.text(`Total de lineas: ${cotizacion.items.length}`, summaryLeftX, doc.y, {
      width: summaryWidth,
      align: "left",
    });
    doc.text(
      `Total de productos: ${cotizacion.items.reduce((acc, row) => acc + row.quantity, 0).toFixed(2)}`,
      summaryLeftX,
      doc.y,
      {
        width: summaryWidth,
        align: "left",
      },
    );
    doc.moveDown(0.8);
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .text("Generado en sistema de facturacion", { align: "center" });

    doc.end();
  });
