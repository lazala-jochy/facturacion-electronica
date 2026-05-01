import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import * as clientsController from "../controllers/clients.controller";
import * as cotizacionesController from "../controllers/cotizaciones.controller";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth.middleware";

export const buildRouter = () => {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.post("/auth/register", asyncHandler(authController.register));
  router.post("/auth/login", asyncHandler(authController.login));
  router.get("/auth/me", requireAuth, asyncHandler(authController.me));
  router.put("/auth/company", requireAuth, asyncHandler(authController.updateCompany));

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
    asyncHandler(cotizacionesController.submitEcfByCotizacion),
  );

  return router;
};
