import { apiFetch } from "./api";

/** Respuesta del export aislado (no comparte tipos con el lote Excel). */
export type PortalConsumoMenor250ExportResponse = {
  outputRoot: string;
  portalSignedDir: string;
  zipPath: string | null;
  excelPath: string;
  files: { file: string; encf: string; signedPath: string }[];
  logs: string[];
};

export const exportPortalConsumoMenor250FromApp = async (body: {
  desktop_parent_dir?: string;
}): Promise<PortalConsumoMenor250ExportResponse> =>
  apiFetch<PortalConsumoMenor250ExportResponse>("/portal-consumo-menor-250/export", {
    method: "POST",
    body: JSON.stringify(body),
  });
