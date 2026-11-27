import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import * as clientsController from "../controllers/clients.controller";
import * as cotizacionesController from "../controllers/cotizaciones.controller";
import * as ecfExcelBatchController from "../controllers/ecfExcelBatch.controller";
import * as portalConsumoMenor250Controller from "../controllers/portalConsumoMenor250.controller";
import * as commercialApprovalsController from "../controllers/commercialApprovals.controller";
import * as dgiiFormatosController from "../controllers/dgiiFormatos.controller";
import * as xmlFirmaController from "../controllers/xmlFirma.controller";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth.middleware";
import { prisma } from "../prisma";
import { isDbUnreachableError } from "../utils/dbErrors";
import {
  acecfExcelUpload,
  authFormUpload,
  compra606DocumentUpload,
  ecfCertificateUpload,
  ecfExcelUpload,
  xmlFirmaUpload,
} from "../middleware/registerUpload.middleware";

export const buildRouter = () => {
  const router = Router();

  // Verifica la DB (no solo que el proceso Node esté vivo): si Supabase es inalcanzable (ej. sin
  // internet), el frontend usa este endpoint como heartbeat de conectividad -- sin este chequeo
  // reportaría "online" aunque ningún guardado pueda completarse.
  router.get(
    "/health",
    asyncHandler(async (_req, res) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (err) {
        if (isDbUnreachableError(err)) {
          res.status(503).json({ ok: false, message: "No se pudo conectar a la base de datos." });
          return;
        }
        throw err;
      }
      res.json({ ok: true });
    }),
  );

  // register/login/forgot-password/reset-password viven en Supabase Edge
  // Functions (supabase/functions/), no aqui: necesitan ver todas las
  // empresas (buscar por email, crear el rol de Postgres dedicado) con una
  // credencial admin que este backend local nunca tiene.
  router.post("/auth/refresh", asyncHandler(authController.refresh));
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
  router.post(
    "/cotizaciones/borrador-desde-pdf-amway",
    requireAuth,
    compra606DocumentUpload,
    asyncHandler(cotizacionesController.borradorCotizacionDesdeAmwayHandler),
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
    "/cotizaciones/:id/ecf/representacion-impresa",
    requireAuth,
    asyncHandler(cotizacionesController.downloadRepresentacionImpresaEcf),
  );
  router.get(
    "/cotizaciones/:id/pdf",
    requireAuth,
    asyncHandler(cotizacionesController.downloadCotizacionPdf),
  );
  router.post(
    "/cotizaciones/:id/send-email",
    requireAuth,
    asyncHandler(cotizacionesController.sendCotizacionEmail),
  );
  router.get(
    "/cotizaciones/:id/ecf/next-seq-preview",
    requireAuth,
    asyncHandler(cotizacionesController.previewNextEcfNcfByCotizacion),
  );
  router.get(
    "/cotizaciones/:id/ecf/xml",
    requireAuth,
    asyncHandler(cotizacionesController.generateEcfXmlByCotizacion),
  );
  router.put(
    "/cotizaciones/:id/ecf/ncf-seq",
    requireAuth,
    asyncHandler(cotizacionesController.setEcfNcfSeqByCotizacion),
  );
  router.post(
    "/cotizaciones/:id/ecf/sign",
    requireAuth,
    ecfCertificateUpload,
    asyncHandler(cotizacionesController.signEcfXmlByCotizacion),
  );
  router.post(
    "/cotizaciones/:id/ecf/consumo-menor-250-pack",
    requireAuth,
    ecfCertificateUpload,
    asyncHandler(cotizacionesController.buildConsumoMenor250PackByCotizacion),
  );
  router.get(
    "/cotizaciones/:id/ecf/consumo-menor-250-integra",
    requireAuth,
    asyncHandler(cotizacionesController.downloadConsumoMenor250IntegraByCotizacion),
  );
  router.post(
    "/cotizaciones/:id/ecf/submit-rfce",
    requireAuth,
    ecfCertificateUpload,
    asyncHandler(cotizacionesController.submitRfceByCotizacion),
  );
  router.post(
    "/cotizaciones/:id/ecf/submit",
    requireAuth,
    ecfCertificateUpload,
    asyncHandler(cotizacionesController.submitEcfByCotizacion),
  );
  router.post(
    "/cotizaciones/:id/ecf/retry-queued",
    requireAuth,
    asyncHandler(cotizacionesController.retryQueuedDgiiSubmitByCotizacion),
  );
  router.get(
    "/cotizaciones/:id/ecf/dgii/query",
    requireAuth,
    asyncHandler(cotizacionesController.queryDgiiEcfByCotizacion),
  );
  router.post(
    "/ecf-excel-batch/run",
    requireAuth,
    ecfExcelUpload,
    asyncHandler(ecfExcelBatchController.runExcelBatchHandler),
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
  router.get(
    "/ecf-excel-batch/download-zip",
    requireAuth,
    asyncHandler(ecfExcelBatchController.downloadEcfBatchZipHandler),
  );

  router.post(
    "/portal-consumo-menor-250/export",
    requireAuth,
    asyncHandler(portalConsumoMenor250Controller.exportPortalConsumoMenor250Handler),
  );
  router.get(
    "/portal-consumo-menor-250/download-zip",
    requireAuth,
    asyncHandler(portalConsumoMenor250Controller.downloadPortalConsumoMenor250ZipHandler),
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
  router.get(
    "/commercial-approvals/batch/download-zip",
    requireAuth,
    asyncHandler(commercialApprovalsController.commercialApprovalBatchDownloadZipHandler),
  );

  router.post(
    "/dgii-formatos/607/llenar-desde-ecf",
    requireAuth,
    asyncHandler(dgiiFormatosController.llenar607DesdeEcfHandler),
  );
  router.post(
    "/xml-firmar/sign",
    requireAuth,
    xmlFirmaUpload,
    asyncHandler(xmlFirmaController.signUploadedXmlHandler),
  );

  router.get(
    "/dgii-formatos/606/borrador",
    requireAuth,
    asyncHandler(dgiiFormatosController.borrador606Handler),
  );
  router.post(
    "/dgii-formatos/606/borrador-desde-archivo",
    requireAuth,
    compra606DocumentUpload,
    asyncHandler(dgiiFormatosController.borrador606DesdeArchivoHandler),
  );
  router.post(
    "/dgii-formatos/606/compras-desde-archivo",
    requireAuth,
    compra606DocumentUpload,
    asyncHandler(dgiiFormatosController.crearCompra606DesdeArchivoHandler),
  );
  router.get(
    "/dgii-formatos/:tipo/preview",
    requireAuth,
    asyncHandler(dgiiFormatosController.previewFormatoHandler),
  );
  router.get(
    "/dgii-formatos/:tipo/txt",
    requireAuth,
    asyncHandler(dgiiFormatosController.downloadFormatoTxtHandler),
  );
  router.post(
    "/dgii-formatos/:tipo/enviar",
    requireAuth,
    asyncHandler(dgiiFormatosController.enviarFormatoHandler),
  );
  router.get(
    "/dgii-formatos/606/compras",
    requireAuth,
    asyncHandler(dgiiFormatosController.listCompras606Handler),
  );
  router.post(
    "/dgii-formatos/606/compras",
    requireAuth,
    asyncHandler(dgiiFormatosController.createCompra606Handler),
  );
  router.delete(
    "/dgii-formatos/606/compras/:id",
    requireAuth,
    asyncHandler(dgiiFormatosController.deleteCompra606Handler),
  );

  return router;
};
