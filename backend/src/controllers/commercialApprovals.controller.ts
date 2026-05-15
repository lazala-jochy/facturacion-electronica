import "../types/express-auth.augment";
import type { RequestHandler } from "express";
import {
  processCommercialApprovalAccept,
  processCommercialApprovalReject,
  runCommercialApprovalBatchFromExcel,
  sendCommercialApprovalBatchSigned,
} from "../commercial-approvals/commercialApproval.service";
import type {
  CommercialApprovalActionBody,
  CommercialApprovalBatchRunBody,
  CommercialApprovalBatchSendBody,
  CommercialApprovalRejectBody,
} from "../commercial-approvals/commercialApproval.dto";

const pickStr = (b: Record<string, unknown>, k: string): string | undefined =>
  typeof b[k] === "string" ? (b[k] as string) : undefined;

function actionBodyFromReq(req: { body?: unknown }): CommercialApprovalActionBody {
  const b = ((req.body as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  return {
    encf: pickStr(b, "encf") ?? "",
    rnc_emisor: pickStr(b, "rnc_emisor"),
    rnc_comprador: pickStr(b, "rnc_comprador"),
    fecha_emision: pickStr(b, "fecha_emision"),
    monto_total: b.monto_total as string | number | undefined,
    version: pickStr(b, "version"),
    send_to_dgii: b.send_to_dgii === false ? false : true,
    desktop_parent_dir: pickStr(b, "desktop_parent_dir"),
  };
}

function rejectBodyFromReq(req: { body?: unknown }): CommercialApprovalRejectBody {
  const base = actionBodyFromReq(req);
  const b = ((req.body as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  return {
    ...base,
    detalle_motivo_rechazo: pickStr(b, "detalle_motivo_rechazo") ?? "",
  };
}

/** POST /commercial-approvals/accept */
export const commercialApprovalAcceptHandler: RequestHandler = async (req, res, next) => {
  try {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ message: "No autorizado." });
      return;
    }
    const body = actionBodyFromReq(req);
    if (!body.encf?.trim()) {
      res.status(400).json({ message: "encf es obligatorio." });
      return;
    }
    const result = await processCommercialApprovalAccept(auth.companyId, body);
    res.status(result.ok ? 200 : 422).json(result);
  } catch (e) {
    next(e);
  }
};

/** POST /commercial-approvals/reject */
export const commercialApprovalRejectHandler: RequestHandler = async (req, res, next) => {
  try {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ message: "No autorizado." });
      return;
    }
    const body = rejectBodyFromReq(req);
    if (!body.encf?.trim()) {
      res.status(400).json({ message: "encf es obligatorio." });
      return;
    }
    if (!body.detalle_motivo_rechazo?.trim()) {
      res.status(400).json({ message: "detalle_motivo_rechazo es obligatorio." });
      return;
    }
    const result = await processCommercialApprovalReject(auth.companyId, body);
    res.status(result.ok ? 200 : 422).json(result);
  } catch (e) {
    next(e);
  }
};

/** POST /commercial-approvals/batch/run — genera y firma desde Excel ACECF (sin enviar). */
export const commercialApprovalBatchRunHandler: RequestHandler = async (req, res, next) => {
  try {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ message: "No autorizado." });
      return;
    }
    const b = ((req.body as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    const uploaded = req.file;
    const body: CommercialApprovalBatchRunBody = {
      excel_path: pickStr(b, "excel_path"),
      desktop_parent_dir: pickStr(b, "desktop_parent_dir"),
      excel_buffer: uploaded?.buffer,
      excel_original_name: uploaded?.originalname,
    };
    const result = await runCommercialApprovalBatchFromExcel(auth.companyId, body);
    res.status(200).json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
};

/** POST /commercial-approvals/batch/send — envía firmados ACECF a DGII. */
export const commercialApprovalBatchSendHandler: RequestHandler = async (req, res, next) => {
  try {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ message: "No autorizado." });
      return;
    }
    const b = ((req.body as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    const body: CommercialApprovalBatchSendBody = {
      out_signed_dir: pickStr(b, "out_signed_dir") ?? "",
    };
    if (!body.out_signed_dir.trim()) {
      res.status(400).json({ message: "out_signed_dir es obligatorio." });
      return;
    }
    const result = await sendCommercialApprovalBatchSigned(auth.companyId, body);
    res.status(200).json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
};
