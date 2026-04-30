import PDFDocument from "pdfkit";

type CotizacionForPdf = {
  number: number;
  createdAt: Date;
  paymentTerms: string;
  accountManager: string;
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

const date = (value: Date) =>
  new Intl.DateTimeFormat("es-DO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);

export const buildCotizacionPdfBuffer = (cotizacion: CotizacionForPdf) =>
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
    doc.text(cotizacion.fiscalLegend || "Sin valor fiscal", { align: "center" });
    doc.moveDown(0.5);
    doc
      .font("Helvetica")
      .fontSize(10)
      .text(`Cotizacion #${cotizacion.number}`, { align: "center" });
    doc.text(date(cotizacion.createdAt), { align: "center" });
    doc.moveDown(0.5);

    doc.font("Helvetica-Bold").fontSize(11).text("CLIENTE", { underline: true });
    doc.font("Helvetica").fontSize(10.5);
    doc.text(cotizacion.client.name);
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
    doc.text("SERVICIO", doc.page.margins.left, doc.y, { continued: true, width: 380 });
    doc.text("CANT", { continued: true, width: 60, align: "right" });
    doc.text("VALOR", { align: "right" });
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(10);

    for (const item of cotizacion.items) {
      const label = `${item.description} (${item.unit})`;
      doc.text(label, doc.page.margins.left, doc.y, { continued: true, width: 380 });
      doc.text(item.quantity.toFixed(2), { continued: true, width: 60, align: "right" });
      doc.text(money(item.totalValue), { align: "right" });
    }

    doc.moveDown(0.4);
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();
    doc.moveDown(0.4);

    doc.font("Helvetica").fontSize(11);
    doc.text(`Subtotal: ${money(cotizacion.subtotal)}`, { align: "right" });
    doc.text(`ITBIS: ${money(cotizacion.itbis)}`, { align: "right" });
    doc.font("Helvetica-Bold").fontSize(13).text(`Total: ${money(cotizacion.total)}`, {
      align: "right",
    });
    doc.moveDown(0.7);

    doc.font("Helvetica").fontSize(10.5);
    doc.text(`Condiciones: ${cotizacion.paymentTerms}`, { align: "left" });
    doc.text(`Ejecutivo: ${cotizacion.accountManager}`, { align: "left" });
    doc.moveDown(0.6);
    doc.text(`Total de lineas: ${cotizacion.items.length}`);
    doc.text(
      `Total de productos: ${cotizacion.items.reduce((acc, row) => acc + row.quantity, 0).toFixed(2)}`,
    );
    doc.moveDown(0.8);
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .text("Generado en sistema de facturacion", { align: "center" });

    doc.end();
  });
