import { apiFetch } from "./api";
import type { AuthCompany } from "../types/session";
import {
  DGII_ECF_SANDBOX,
  authBaseFromSeedUrl,
  buildDgiiEcfUrlsBody,
  resolveDgiiUrl,
  type DgiiEcfUrlFields,
  type DgiiEnvironment,
} from "../utils/dgiiUrls";

export type { DgiiEcfUrlFields, DgiiEnvironment };

export function companyEcfDgiiUrls(company: AuthCompany): DgiiEcfUrlFields {
  return {
    environment: company.dgiiEnvironment === "PRODUCCION" ? "PRODUCCION" : "CERTIFICACION",
    authUrl: resolveDgiiUrl(
      company.dgiiAuthUrl,
      authBaseFromSeedUrl(company.dgiiSeedUrl),
      DGII_ECF_SANDBOX.auth,
    ),
    receptionUrl: resolveDgiiUrl(
      company.dgiiReceptionUrl,
      company.dgiiEcfReceiveUrl,
      DGII_ECF_SANDBOX.reception,
    ),
    consultUrl: resolveDgiiUrl(
      company.dgiiConsultUrl,
      company.dgiiTrackUrl,
      company.dgiiStatusUrl,
      DGII_ECF_SANDBOX.consult,
    ),
    consumerSummaryUrl: resolveDgiiUrl(company.dgiiEcfEndpoint, DGII_ECF_SANDBOX.consumerSummaryReception),
  };
}

export async function saveDgiiEcfExcelUrls(
  urls: DgiiEcfUrlFields,
): Promise<{ message: string; company: AuthCompany }> {
  return apiFetch<{ message: string; company: AuthCompany }>("/auth/company", {
    method: "PUT",
    body: JSON.stringify(buildDgiiEcfUrlsBody(urls)),
  });
}
