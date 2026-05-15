import { apiFetch } from "./api";
import type { AuthCompany } from "../types/session";
import {
  DGII_ECF_SANDBOX,
  authBaseFromSeedUrl,
  normalizeAuthBaseUrl,
  resolveDgiiUrl,
  seedUrlFromAuthBase,
  validateSeedUrlFromAuthBase,
} from "../utils/dgiiUrls";

/** Paso 3 CerteCF — Aprobaciones Comerciales (ACECF). */

export const DGII_ACECF_CASE_COUNT = 11;

export const DGII_AUTH_URL_PLACEHOLDER = DGII_ECF_SANDBOX.auth;

export const DGII_COMMERCIAL_APPROVAL_URL_PLACEHOLDER =
  "https://ecf.dgii.gov.do/CerteCF/aprobacioncomercial/api/aprobacioncomercial";

export type AcecfDgiiUrlFields = {
  authUrl: string;
  commercialApprovalUrl: string;
};

export function companyAcecfDgiiUrls(company: AuthCompany): AcecfDgiiUrlFields {
  return {
    authUrl: resolveDgiiUrl(
      company.dgiiAuthUrl,
      authBaseFromSeedUrl(company.dgiiSeedUrl),
      DGII_ECF_SANDBOX.auth,
    ),
    commercialApprovalUrl: company.dgiiCommercialApprovalUrl?.trim() ?? "",
  };
}

export const DGII_PORTAL_CERT_URL = "https://ecf.dgii.gov.do/certecf/portalcertificacion";

/** Respuesta DGII Paso 3 — Aprobaciones o Rechazos Comerciales (no es TrackId de e-CF). */
export const ACECF_DGII_VALIDATION_LABELS = {
  OK: "OK — validación satisfactoria",
  ERROR: "Error — validación no satisfactoria",
  INCORRECTO: "Incorrecto — validación no satisfactoria",
} as const;

export type AcecfCaseStatus = "pendiente" | "enviado" | "aprobado" | "rechazado" | "observado";

export type AcecfExcelSelection = {
  fileName: string;
  fileSize?: number;
  fileLastModified?: number;
  /** Ruta absoluta cuando se elige desde la app de escritorio. */
  filePath?: string;
};

export type AcecfProgress = {
  cases: Record<string, AcecfCaseStatus>;
  notes?: string;
  updatedAt?: string;
  excel?: AcecfExcelSelection;
};

const storageKey = (companyId: number) => `fe_rd_acecf_progress_v1_${companyId}`;

export function loadAcecfProgress(companyId: number): AcecfProgress {
  try {
    const raw = localStorage.getItem(storageKey(companyId));
    if (!raw) return { cases: {} };
    const parsed = JSON.parse(raw) as AcecfProgress;
    return {
      cases: parsed.cases ?? {},
      notes: parsed.notes,
      updatedAt: parsed.updatedAt,
      excel: parsed.excel,
    };
  } catch {
    return { cases: {} };
  }
}

export function saveAcecfProgress(companyId: number, progress: AcecfProgress): void {
  const next: AcecfProgress = {
    ...progress,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(storageKey(companyId), JSON.stringify(next));
}

export function acecfStatusLabel(status: AcecfCaseStatus): string {
  const labels: Record<AcecfCaseStatus, string> = {
    pendiente: "Pendiente",
    enviado: "Enviado",
    aprobado: "Aprobado",
    rechazado: "Rechazado",
    observado: "Observado",
  };
  return labels[status];
}

export function isAcecfExcelFileName(name: string): boolean {
  return /\.(xlsx|xls)$/i.test(name.trim());
}

export function excelSelectionFromFile(file: File, filePath?: string): AcecfExcelSelection {
  return {
    fileName: file.name,
    fileSize: file.size,
    fileLastModified: file.lastModified,
    filePath: filePath?.trim() || undefined,
  };
}

export async function saveDgiiAcecfUrls(
  urls: AcecfDgiiUrlFields,
): Promise<{ message: string; company: AuthCompany }> {
  const authBase = normalizeAuthBaseUrl(urls.authUrl || DGII_ECF_SANDBOX.auth);
  return apiFetch<{ message: string; company: AuthCompany }>("/auth/company", {
    method: "PUT",
    body: JSON.stringify({
      dgii_auth_url: authBase,
      dgii_seed_url: seedUrlFromAuthBase(authBase),
      dgii_validate_seed_url: validateSeedUrlFromAuthBase(authBase),
      dgii_commercial_approval_url: urls.commercialApprovalUrl.trim(),
    }),
  });
}

/** @deprecated Usar saveDgiiAcecfUrls */
export async function saveDgiiCommercialApprovalUrl(
  url: string,
): Promise<{ message: string; company: AuthCompany }> {
  return saveDgiiAcecfUrls({ authUrl: DGII_ECF_SANDBOX.auth, commercialApprovalUrl: url });
}

export function countByStatus(progress: AcecfProgress): Record<AcecfCaseStatus, number> {
  const counts: Record<AcecfCaseStatus, number> = {
    pendiente: 0,
    enviado: 0,
    aprobado: 0,
    rechazado: 0,
    observado: 0,
  };
  for (let i = 1; i <= DGII_ACECF_CASE_COUNT; i++) {
    const key = String(i);
    const status = progress.cases[key] ?? "pendiente";
    counts[status] += 1;
  }
  return counts;
}
