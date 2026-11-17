/** Cuerpo común para aprobación/rechazo comercial DGII (ACECF). */
export type CommercialApprovalActionBody = {
  encf: string;
  rnc_emisor?: string;
  rnc_comprador?: string;
  fecha_emision?: string;
  monto_total?: string | number;
  version?: string;
  /** Si true (default), envía el XML firmado a DGII tras generarlo. */
  send_to_dgii?: boolean;
  /** Si viene definido (cualquier valor), además persiste xml/ y firmados/ en el servidor. */
  desktop_parent_dir?: string;
};

export type CommercialApprovalRejectBody = CommercialApprovalActionBody & {
  detalle_motivo_rechazo: string;
};

export type CommercialApprovalBatchRunBody = {
  excel_path?: string;
  /** Contenido del Excel cuando se sube por multipart (sin ruta en disco). */
  excel_buffer?: Buffer;
  excel_original_name?: string;
};

export type CommercialApprovalBatchSendBody = {
  out_signed_dir: string;
};
