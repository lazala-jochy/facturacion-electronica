import { authenticatedFetch, ApiError } from "./api";

export type FormatoPreview = {
  tipo: "606" | "607";
  periodo: string;
  registro_count: number;
  total_monto_facturado: number;
  total_itbis?: number;
  lines_preview?: unknown[];
  /** Solo 607: e-CF aceptados por DGII en el periodo que sí entran en el TXT. */
  fuentes_incluidas?: Fuente607Cotizacion[];
  /** Solo 607: e-CF del periodo que se excluyeron del TXT, con el motivo (ej. consumo < RD$250,000 → va en RFCE). */
  fuentes_excluidas?: Fuente607Cotizacion[];
};

export type Fuente607Cotizacion = {
  cotizacion_id: number;
  number: number;
  client_name: string;
  client_rnc_cedula: string;
  encf: string;
  ecf_tipo: string;
  dgii_status: string | null;
  fecha_emision: string;
  subtotal: number;
  itbis: number;
  total: number;
  included: boolean;
  exclude_reason: string | null;
};

export type Llenar607Result = {
  ok: boolean;
  periodo: string;
  fuente: string;
  descripcion: string;
  registro_count: number;
  total_monto_facturado: number;
  total_itbis: number;
  fuentes_incluidas: Fuente607Cotizacion[];
  fuentes_excluidas: Fuente607Cotizacion[];
};

export type Borrador606 = {
  rnc_cedula: string;
  tipo_bienes_servicios: string;
  ncf: string;
  ncf_modificado: string;
  fecha_comprobante: string;
  fecha_pago: string;
  monto_servicios: number;
  monto_bienes: number;
  itbis_facturado: number;
  forma_pago: string;
  aviso: string | null;
  origen: "cliente" | "cotizacion" | "archivo";
  origen_id: number;
  referencia_venta_encf: string | null;
  texto_detectado?: string;
};

export type Compra606Row = {
  id: number;
  rnc_cedula: string;
  tipo_bienes_servicios: string;
  ncf: string;
  ncf_modificado: string | null;
  fecha_comprobante: string;
  fecha_pago: string | null;
  monto_servicios: number;
  monto_bienes: number;
  monto_facturado: number;
  itbis_facturado: number;
  itbis_retenido: number;
  itbis_sujeto_proporcionalidad: number;
  itbis_llevado_al_costo: number;
  itbis_por_adelantar: number;
  itbis_percibido_compras: number;
  retencion_renta: number;
  tipo_retencion_isr: string | null;
  isr_percibido_compras: number;
  impuesto_isc: number;
  impuestos_otros: number;
  monto_propina_legal: number;
  forma_pago: string;
  created_at: string;
};

export type CreateCompra606Payload = {
  periodo: string;
  rnc_cedula: string;
  tipo_bienes_servicios?: string;
  ncf: string;
  ncf_modificado?: string;
  fecha_comprobante: string;
  fecha_pago?: string;
  monto_servicios?: number;
  monto_bienes?: number;
  monto_facturado?: number;
  itbis_facturado?: number;
  itbis_retenido?: number;
  itbis_sujeto_proporcionalidad?: number;
  itbis_llevado_al_costo?: number;
  itbis_por_adelantar?: number;
  itbis_percibido_compras?: number;
  retencion_renta?: number;
  tipo_retencion_isr?: string;
  isr_percibido_compras?: number;
  impuesto_isc?: number;
  impuestos_otros?: number;
  monto_propina_legal?: number;
  forma_pago?: string;
};

export type FormatoEnvioResult = {
  ok: boolean;
  tipo: "606" | "607";
  periodo: string;
  filename: string;
  registro_count: number;
  stored_path: string;
  manual_upload_required: boolean;
  message: string;
  ofv_url: string;
  prevalidacion_url: string;
};

const parseJson = async (response: Response) => {
  const raw = await response.text();
  const trimmed = raw.trim();
  if (!trimmed) {
    if (!response.ok) {
      throw new ApiError(`Solicitud rechazada (${response.status}).`, response.status);
    }
    return {};
  }
  if (trimmed.startsWith("<")) {
    const hint =
      response.status === 404
        ? "El servidor no tiene la ruta 606/607. Reiniciá el backend (npm run dev en /backend)."
        : "El servidor respondió HTML en lugar de JSON. Verificá que el backend esté en marcha y VITE_API_URL apunte a http://localhost:3001.";
    throw new ApiError(hint, response.status);
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    throw new ApiError(
      trimmed.slice(0, 200) || `Respuesta no válida (${response.status}).`,
      response.status,
    );
  }
  if (!response.ok) {
    throw new ApiError(
      (data.message as string) ?? "Error en la solicitud.",
      response.status,
      data,
    );
  }
  return data;
};

export const previewDgiiFormato = async (
  tipo: "606" | "607",
  periodo: string,
): Promise<FormatoPreview> => {
  const q = new URLSearchParams({ periodo });
  const response = await authenticatedFetch(`/dgii-formatos/${tipo}/preview?${q}`);
  return (await parseJson(response)) as FormatoPreview;
};

export const downloadDgiiFormatoTxt = async (tipo: "606" | "607", periodo: string) => {
  const q = new URLSearchParams({ periodo });
  const response = await authenticatedFetch(`/dgii-formatos/${tipo}/txt?${q}`);
  if (!response.ok) {
    await parseJson(response);
    throw new ApiError("No se pudo generar el archivo.", response.status);
  }
  const ct = response.headers.get("Content-Type") ?? "";
  if (ct.includes("text/html")) {
    throw new ApiError(
      "El servidor respondió HTML. Reiniciá el backend (npm run dev en /backend).",
      response.status,
    );
  }
  const blob = await response.blob();
  const disp = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/i.exec(disp);
  const filename = match?.[1] ?? `DGII_F_${tipo}_${periodo.replace("-", "")}.TXT`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return filename;
};

export const enviarDgiiFormato = async (
  tipo: "606" | "607",
  periodo: string,
): Promise<FormatoEnvioResult> => {
  const response = await authenticatedFetch(`/dgii-formatos/${tipo}/enviar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ periodo }),
  });
  return (await parseJson(response)) as FormatoEnvioResult;
};

export const listCompras606 = async (periodo: string): Promise<Compra606Row[]> => {
  const q = new URLSearchParams({ periodo });
  const response = await authenticatedFetch(`/dgii-formatos/606/compras?${q}`);
  const data = await parseJson(response);
  return (data.compras as Compra606Row[]) ?? [];
};

export const createCompra606 = async (payload: CreateCompra606Payload) => {
  const response = await authenticatedFetch("/dgii-formatos/606/compras", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response);
};

export const deleteCompra606 = async (id: number) => {
  const response = await authenticatedFetch(`/dgii-formatos/606/compras/${id}`, {
    method: "DELETE",
  });
  return parseJson(response);
};

export const llenar607DesdeEcf = async (periodo: string): Promise<Llenar607Result> => {
  const response = await authenticatedFetch("/dgii-formatos/607/llenar-desde-ecf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ periodo }),
  });
  return (await parseJson(response)) as Llenar607Result;
};

export type CrearCompra606DesdeArchivoResult = {
  message: string;
  compra: Compra606Row;
  texto_detectado?: string;
};

export const crearCompra606DesdeArchivo = async (
  periodo: string,
  file: File,
): Promise<CrearCompra606DesdeArchivoResult> => {
  const form = new FormData();
  form.append("document", file);
  form.append("periodo", periodo);
  const response = await authenticatedFetch("/dgii-formatos/606/compras-desde-archivo", {
    method: "POST",
    body: form,
  });
  return (await parseJson(response)) as CrearCompra606DesdeArchivoResult;
};

export const fetchBorrador606 = async (params: {
  client_id?: number;
  cotizacion_id?: number;
}): Promise<{ borrador: Borrador606 }> => {
  const q = new URLSearchParams();
  if (params.cotizacion_id) q.set("cotizacion_id", String(params.cotizacion_id));
  else if (params.client_id) q.set("client_id", String(params.client_id));
  const response = await authenticatedFetch(`/dgii-formatos/606/borrador?${q}`);
  return (await parseJson(response)) as { borrador: Borrador606 };
};
