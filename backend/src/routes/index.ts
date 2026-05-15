import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import * as clientsController from "../controllers/clients.controller";
import * as cotizacionesController from "../controllers/cotizaciones.controller";
import * as ecfExcelBatchController from "../controllers/ecfExcelBatch.controller";
import * as portalConsumoMenor250Controller from "../controllers/portalConsumoMenor250.controller";
import * as commercialApprovalsController from "../controllers/commercialApprovals.controller";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth.middleware";
import {
  acecfExcelUpload,
  authFormUpload,
  ecfCertificateUpload,
} from "../middleware/registerUpload.middleware";

export const buildRouter = () => {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.post("/auth/register", authFormUpload, asyncHandler(authController.register));
  router.post("/auth/login", asyncHandler(authController.login));
  router.post("/auth/forgot-password", asyncHandler(authController.forgotPassword));
  router.post("/auth/reset-password", asyncHandler(authController.resetPassword));
  router.get("/auth/me", requireAuth, asyncHandler(authController.me));
  router.put("/auth/company", requireAuth, authFormUpload, asyncHandler(authController.updateCompany));
  router.post("/auth/company/dgii/test", requireAuth, asyncHandler(authController.testDgiiConnection));

  router.post("/clients", requireAuth, asyncHandler(clientsController.createClient));
  router.get("/clients", requireAuth, asyncHandler(clientsController.listClients));
  router.put("/clients/:id", requireAuth, asyncHandler(clientsController.updateClient));
  router.delete("/clients/:id", requireAuth, asyncHandler(clientsController.deleteClient));

  router.post(
    "/clients-with-cotizacion",
    requireAuth,
    asyncHandler(cotizacionesController.createClientWithCotizacion),
  );
  router.get(
    "/cotizaciones",
    requireAuth,
    asyncHandler(cotizacionesController.listCotizaciones),
  );
  router.get(
    "/cotizaciones/:id",
    requireAuth,
    asyncHandler(cotizacionesController.getCotizacionById),
  );
  router.put(
    "/cotizaciones/:id",
    requireAuth,
    asyncHandler(cotizacionesController.updateCotizacionById),
  );
  router.delete(
    "/cotizaciones/:id",
    requireAuth,
    asyncHandler(cotizacionesController.deleteCotizacionById),
  );
  router.get(
    "/cotizaciones/:id/pdf",
    requireAuth,
    asyncHandler(cotizacionesController.downloadCotizacionPdf),
  );
  router.get(
    "/cotizaciones/:id/ecf/xml",
    requireAuth,
    asyncHandler(cotizacionesController.generateEcfXmlByCotizacion),
  );
  router.post(
    "/cotizaciones/:id/ecf/submit",
    requireAuth,
    ecfCertificateUpload,
    asyncHandler(cotizacionesController.submitEcfByCotizacion),
  );
  router.get(
    "/cotizaciones/:id/ecf/dgii/query",
    requireAuth,
    asyncHandler(cotizacionesController.queryDgiiEcfByCotizacion),
  );

  router.post(
    "/ecf-excel-batch/run",
    requireAuth,
    asyncHandler(ecfExcelBatchController.runExcelBatchToDesktopHandler),
  );
  router.post(
    "/ecf-excel-batch/send",
    requireAuth,
    asyncHandler(ecfExcelBatchController.sendExcelBatchSignedToDgiiHandler),
  );
  router.post(
    "/ecf-excel-batch/consult",
    requireAuth,
    asyncHandler(ecfExcelBatchController.consultBatchStatusHandler),
  );
  router.post(
    "/ecf-excel-batch/send-rfce",
    requireAuth,
    asyncHandler(ecfExcelBatchController.sendRfceToDgiiHandler),
  );

  router.post(
    "/portal-consumo-menor-250/export",
    requireAuth,
    asyncHandler(portalConsumoMenor250Controller.exportPortalConsumoMenor250Handler),
  );

  router.post(
    "/commercial-approvals/accept",
    requireAuth,
    asyncHandler(commercialApprovalsController.commercialApprovalAcceptHandler),
  );
  router.post(
    "/commercial-approvals/reject",
    requireAuth,
    asyncHandler(commercialApprovalsController.commercialApprovalRejectHandler),
  );
  router.post(
    "/commercial-approvals/batch/run",
    requireAuth,
    acecfExcelUpload,
    asyncHandler(commercialApprovalsController.commercialApprovalBatchRunHandler),
  );
  router.post(
    "/commercial-approvals/batch/send",
    requireAuth,
    asyncHandler(commercialApprovalsController.commercialApprovalBatchSendHandler),
  );

  return router;
};
