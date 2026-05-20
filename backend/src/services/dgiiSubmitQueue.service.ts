import type { Company } from "@prisma/client";
import { prisma } from "../prisma";
import type { DgiiSubmissionResult } from "../types/dgiiEcf";
import { DgiiEcfError } from "../types/dgiiEcf";
import { submitSignedEcfWithTenantConfig } from "./dgiiEcfApi.service";
import { finalizeDgiiSubmissionAfterReception } from "./dgiiSubmissionFinalize.service";
import { persistRepresentacionImpresa } from "./ecfRepresentacionImpresa.service";
import { persistCotizacionAfterDgiiSubmission } from "./cotizacion.service";
import { parseDgiiCertProfile, type DgiiCertProfile } from "../types/dgiiCertProfile";
import { normalizeEcfTipo } from "../utils/ecfTipo";
import {
  computeNextDgiiSubmitRetryAt,
  defaultDgiiSubmitMaxRetries,
  DGII_SUBMIT_FAILED_STATUS,
  DGII_SUBMIT_QUEUED_STATUS,
  DGII_SUBMIT_SUBMITTING_STATUS,
  isRetryableDgiiSubmitError,
} from "../utils/dgiiSubmitRetry";

export type QueueFailedDgiiSubmitArgs = {
  cotizacionId: number;
  companyId: number;
  signedXml: string;
  certProfile?: DgiiCertProfile;
  errorCode?: string;
  errorMessage: string;
  httpStatus?: number;
};

export async function queueFailedDgiiSubmit(args: QueueFailedDgiiSubmitArgs): Promise<{
  retryCount: number;
  nextRetryAt: Date;
}> {
  const existing = await prisma.cotizacion.findFirst({
    where: { id: args.cotizacionId, companyId: args.companyId },
    select: { dgiiSubmitRetryCount: true },
  });
  const nextAttempt = (existing?.dgiiSubmitRetryCount ?? 0) + 1;
  const nextRetryAt = computeNextDgiiSubmitRetryAt(nextAttempt);
  const certProfile = args.certProfile ?? "paso2";

  await prisma.cotizacion.update({
    where: { id: args.cotizacionId },
    data: {
      signedXml: args.signedXml,
      dgiiStatus: DGII_SUBMIT_QUEUED_STATUS,
      dgiiTrackId: null,
      dgiiSubmittedAt: null,
      dgiiResponse: JSON.stringify({
        queued: true,
        code: args.errorCode ?? "NETWORK",
        httpStatus: args.httpStatus ?? null,
        message: args.errorMessage,
        queuedAt: new Date().toISOString(),
      }),
      dgiiSubmitRetryCount: nextAttempt,
      dgiiSubmitNextRetryAt: nextRetryAt,
      dgiiSubmitLastError: args.errorMessage.slice(0, 2000),
      dgiiSubmitCertProfile: certProfile,
    },
  });

  return { retryCount: nextAttempt, nextRetryAt };
}

export type RetryQueuedSubmitResult =
  | {
      ok: true;
      dgiiResponse: DgiiSubmissionResult;
      newEcfNcfSeq?: number;
    }
  | {
      ok: false;
      status: number;
      message: string;
      code?: string;
      requeued?: boolean;
      submitFailed?: boolean;
    };

async function loadCompanyForRetry(companyId: number): Promise<Company | null> {
  return prisma.company.findUnique({ where: { id: companyId } });
}

/**
 * Reenvía a DGII un e-CF ya firmado (`signedXml`). Usado por el worker y por reintento manual.
 */
export async function retryQueuedCotizacionSubmit(
  cotizacionId: number,
  companyId: number,
  options: {
    uploadsRoot: string;
    certificateEncryptionSecret?: string;
    certProfile?: DgiiCertProfile;
    /** Ignora `dgiiSubmitNextRetryAt` (reintento manual). */
    force?: boolean;
  },
): Promise<RetryQueuedSubmitResult> {
  const cot = await prisma.cotizacion.findFirst({
    where: { id: cotizacionId, companyId },
    select: {
      id: true,
      signedXml: true,
      dgiiStatus: true,
      dgiiSubmitRetryCount: true,
      dgiiSubmitNextRetryAt: true,
      dgiiSubmitCertProfile: true,
      ecfTipo: true,
    },
  });

  if (!cot) {
    return { ok: false, status: 404, message: "Cotizacion no encontrada." };
  }

  const status = cot.dgiiStatus?.trim() ?? "";
  const allowedStatuses = [
    DGII_SUBMIT_QUEUED_STATUS,
    DGII_SUBMIT_FAILED_STATUS,
    DGII_SUBMIT_SUBMITTING_STATUS,
  ];
  if (!(allowedStatuses as readonly string[]).includes(status)) {
    return {
      ok: false,
      status: 409,
      message: "Esta cotización no está en cola de envío a DGII.",
      code: "DGII_NOT_QUEUED",
    };
  }

  if (!options.force && cot.dgiiSubmitNextRetryAt && cot.dgiiSubmitNextRetryAt > new Date()) {
    return {
      ok: false,
      status: 409,
      message: `El próximo reintento automático está programado para ${cot.dgiiSubmitNextRetryAt.toISOString()}.`,
      code: "DGII_RETRY_SCHEDULED",
    };
  }

  const signedXml = cot.signedXml?.trim() ?? "";
  if (!signedXml) {
    return {
      ok: false,
      status: 400,
      message: "No hay XML firmado guardado. Volvé a enviar desde la cotización.",
      code: "DGII_NO_SIGNED_XML",
    };
  }

  const maxRetries = defaultDgiiSubmitMaxRetries();
  if (cot.dgiiSubmitRetryCount >= maxRetries && status !== DGII_SUBMIT_SUBMITTING_STATUS) {
    return {
      ok: false,
      status: 409,
      message: `Se agotaron los ${maxRetries} reintentos automáticos. Revisá conectividad DGII y reenviá manualmente.`,
      code: "DGII_RETRY_EXHAUSTED",
      submitFailed: true,
    };
  }

  const companyRow = await loadCompanyForRetry(companyId);
  if (!companyRow) {
    return { ok: false, status: 404, message: "Empresa no encontrada." };
  }

  const certProfile =
    options.certProfile ??
    parseDgiiCertProfile(cot.dgiiSubmitCertProfile ?? undefined) ??
    "paso2";

  await prisma.cotizacion.update({
    where: { id: cotizacionId },
    data: { dgiiStatus: DGII_SUBMIT_SUBMITTING_STATUS },
  });

  try {
    const reception = await submitSignedEcfWithTenantConfig(companyRow, signedXml, {
      certProfile,
    });
    const dgiiResponse = await finalizeDgiiSubmissionAfterReception(companyRow, reception, {
      certProfile,
    });

    const dgiiSubmittedAt = new Date();
    const persistResult = await persistCotizacionAfterDgiiSubmission(
      cotizacionId,
      companyId,
      normalizeEcfTipo(cot.ecfTipo),
      {
        dgiiResponse,
        signedXml,
        dgiiSubmittedAt,
      },
    );

    await prisma.cotizacion.update({
      where: { id: cotizacionId },
      data: {
        dgiiSubmitNextRetryAt: null,
        dgiiSubmitLastError: null,
        dgiiSubmitCertProfile: null,
      },
    });

    if (dgiiResponse.status !== "rejected") {
      try {
        await persistRepresentacionImpresa({
          uploadsRoot: options.uploadsRoot,
          cotizacionId,
          company: {
            id: companyRow.id,
            dgiiEnvironment: companyRow.dgiiEnvironment,
            name: companyRow.name,
            logoUrl: companyRow.logoUrl,
          },
          signedXml,
          ecfTipo: normalizeEcfTipo(cot.ecfTipo),
          fechaFirma: dgiiSubmittedAt,
          dgiiTrackId: dgiiResponse.trackId ?? null,
        });
      } catch (riErr) {
        console.error("[dgii-retry] representacion impresa:", riErr);
      }
    }

    return {
      ok: true,
      dgiiResponse,
      newEcfNcfSeq: persistResult.newSeq,
    };
  } catch (error) {
    const errCode = error instanceof DgiiEcfError ? error.code : undefined;
    const httpStatus = error instanceof DgiiEcfError ? error.httpStatus : undefined;
    const message =
      error instanceof Error ? error.message : "Error desconocido al llamar al servicio DGII.";

    if (isRetryableDgiiSubmitError(errCode, httpStatus)) {
      const nextAttempt = cot.dgiiSubmitRetryCount + 1;
      if (nextAttempt >= maxRetries) {
        await prisma.cotizacion.update({
          where: { id: cotizacionId },
          data: {
            dgiiStatus: DGII_SUBMIT_FAILED_STATUS,
            dgiiSubmitRetryCount: nextAttempt,
            dgiiSubmitNextRetryAt: null,
            dgiiSubmitLastError: message.slice(0, 2000),
          },
        });
        return {
          ok: false,
          status: 503,
          message: `DGII sigue sin responder tras ${maxRetries} intentos. ${message}`,
          code: errCode ?? "NETWORK",
          submitFailed: true,
        };
      }

      const nextRetryAt = computeNextDgiiSubmitRetryAt(nextAttempt);
      await prisma.cotizacion.update({
        where: { id: cotizacionId },
        data: {
          dgiiStatus: DGII_SUBMIT_QUEUED_STATUS,
          dgiiSubmitRetryCount: nextAttempt,
          dgiiSubmitNextRetryAt: nextRetryAt,
          dgiiSubmitLastError: message.slice(0, 2000),
        },
      });

      return {
        ok: false,
        status: 503,
        message,
        code: errCode ?? "NETWORK",
        requeued: true,
      };
    }

    await prisma.cotizacion.update({
      where: { id: cotizacionId },
      data: {
        dgiiStatus: DGII_SUBMIT_FAILED_STATUS,
        dgiiSubmitNextRetryAt: null,
        dgiiSubmitLastError: message.slice(0, 2000),
      },
    });

    return {
      ok: false,
      status: error instanceof DgiiEcfError ? 400 : 502,
      message,
      code: errCode,
      submitFailed: true,
    };
  }
}

export type ProcessDueRetriesSummary = {
  scanned: number;
  succeeded: number;
  requeued: number;
  failed: number;
};

/** Procesa cotizaciones en cola cuyo `dgiiSubmitNextRetryAt` ya venció. */
export async function processDueDgiiSubmitRetries(
  uploadsRoot: string,
): Promise<ProcessDueRetriesSummary> {
  const maxRetries = defaultDgiiSubmitMaxRetries();
  const now = new Date();
  const batchSize = Math.min(
    Math.max(Number.parseInt(process.env.DGII_SUBMIT_RETRY_BATCH_SIZE ?? "8", 10) || 8, 1),
    25,
  );

  const due = await prisma.cotizacion.findMany({
    where: {
      dgiiStatus: { in: [DGII_SUBMIT_QUEUED_STATUS, DGII_SUBMIT_SUBMITTING_STATUS] },
      signedXml: { not: null },
      dgiiSubmitRetryCount: { lt: maxRetries },
      OR: [
        { dgiiStatus: DGII_SUBMIT_SUBMITTING_STATUS },
        { dgiiSubmitNextRetryAt: null },
        { dgiiSubmitNextRetryAt: { lte: now } },
      ],
    },
    orderBy: [{ dgiiSubmitNextRetryAt: "asc" }, { id: "asc" }],
    take: batchSize,
    select: { id: true, companyId: true },
  });

  const summary: ProcessDueRetriesSummary = {
    scanned: due.length,
    succeeded: 0,
    requeued: 0,
    failed: 0,
  };

  for (const row of due) {
    const out = await retryQueuedCotizacionSubmit(row.id, row.companyId, {
      uploadsRoot,
      force: true,
    });
    if (out.ok) {
      summary.succeeded += 1;
    } else if (out.requeued) {
      summary.requeued += 1;
    } else {
      summary.failed += 1;
    }
  }

  return summary;
}

export function startDgiiSubmitRetryWorker(uploadsRoot: string): () => void {
  const intervalMs = Math.max(
    Number.parseInt(process.env.DGII_SUBMIT_RETRY_INTERVAL_MS ?? "60000", 10) || 60_000,
    15_000,
  );
  const enabled = process.env.DGII_SUBMIT_RETRY_WORKER !== "false";

  if (!enabled) {
    return () => undefined;
  }

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const summary = await processDueDgiiSubmitRetries(uploadsRoot);
      if (summary.scanned > 0) {
        console.log(
          `[dgii-retry] procesadas=${summary.scanned} ok=${summary.succeeded} reencoladas=${summary.requeued} fallidas=${summary.failed}`,
        );
      }
    } catch (err) {
      console.error("[dgii-retry] error en worker:", err);
    } finally {
      running = false;
    }
  };

  void tick();
  const handle = setInterval(() => void tick(), intervalMs);
  return () => clearInterval(handle);
}
