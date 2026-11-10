import { apiFetch } from "./api";
import type { AuthCompany } from "../types/session";
import { buildDgiiPaso4UrlsBody, type DgiiEcfUrlFields, type DgiiEnvironment } from "../utils/dgiiUrls";

export type { DgiiEcfUrlFields, DgiiEnvironment };

/** URLs guardadas solo para Paso 4 (columnas dgii_paso4_*); sin mezclar con Paso 2. */
export function companyPaso4DgiiUrls(company: AuthCompany): DgiiEcfUrlFields {
  return {
    environment: company.dgiiPaso4Environment === "PRODUCCION" ? "PRODUCCION" : "CERTIFICACION",
    authUrl: company.dgiiPaso4AuthUrl?.trim() ?? "",
    receptionUrl: company.dgiiPaso4ReceptionUrl?.trim() ?? "",
    consultUrl: company.dgiiPaso4ConsultUrl?.trim() ?? "",
    consumerSummaryUrl: company.dgiiPaso4RfceUrl?.trim() ?? "",
    // Paso 4 no usa semilla explícita ni juego de Producción separado (ver dgiiPaso4Urls.ts en backend).
    seedUrl: "",
    validateSeedUrl: "",
    prodAuthUrl: "",
    prodSeedUrl: "",
    prodValidateSeedUrl: "",
    prodReceptionUrl: "",
    prodConsultUrl: "",
    prodConsumerSummaryUrl: "",
  };
}

export async function saveDgiiPaso4Urls(
  urls: DgiiEcfUrlFields,
): Promise<{ message: string; company: AuthCompany }> {
  return apiFetch<{ message: string; company: AuthCompany }>("/auth/company", {
    method: "PUT",
    body: JSON.stringify(buildDgiiPaso4UrlsBody(urls)),
  });
}
