import type { Client, Company, Cotizacion, CotizacionItem } from "@prisma/client";

export type CotizacionForDGII = Cotizacion & {
  company: Company;
  client: Client;
  items: CotizacionItem[];
};

/**
 * Estructura orientada a futura integración e-CF / DGII (sin llamadas HTTP).
 */
export const generateDGIIData = (cotizacion: CotizacionForDGII) => {
  const fecha = cotizacion.createdAt.toISOString().slice(0, 10);
  return {
    rnc_emisor: cotizacion.company.rnc,
    rnc_cliente: cotizacion.client.rncCedula,
    monto_total: cotizacion.total,
    itbis: cotizacion.itbis,
    items: cotizacion.items
      .slice()
      .sort((a, b) => a.itemNumber - b.itemNumber)
      .map((row) => ({
        numero_linea: row.itemNumber,
        descripcion: row.description,
        cantidad: row.quantity,
        unidad: row.unit,
        precio_unitario: row.unitPrice,
        monto_item: row.totalValue,
      })),
    fecha,
    numero_documento: String(cotizacion.number),
    nombre_emisor: cotizacion.company.name,
    nombre_cliente: cotizacion.client.name,
  };
};
