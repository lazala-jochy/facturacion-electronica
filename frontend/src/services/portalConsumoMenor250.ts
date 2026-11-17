import { apiFetch, downloadZipFromPath } from "./api";

/** Respuesta del export aislado (no comparte tipos con el lote Excel). */
export type PortalConsumoMenor250ExportResponse = {
  outputRoot: string;
  portalSignedDir: string;
  excelPath: string;
  files: { file: string; encf: string; signedPath: string }[];
  logs: string[];
};

export const exportPortalConsumoMenor250FromApp = async (): Promise<PortalConsumoMenor250ExportResponse> =>
  apiFetch<PortalConsumoMenor250ExportResponse>("/portal-consumo-menor-250/export", {
    method: "POST",
    body: JSON.stringify({}),
  });

/** Descarga como ZIP la carpeta de "Facturas de consumo < 250Mil" generada. */
export const downloadPortalConsumoMenor250Zip = (outputRoot: string): Promise<string> =>
  downloadZipFromPath(
    `/portal-consumo-menor-250/download-zip?dir=${encodeURIComponent(outputRoot)}`,
    "portal-consumo-menor-250.zip",
  );
