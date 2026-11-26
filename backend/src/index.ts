import "dotenv/config";
import "./types/express-auth.augment";
import cors from "cors";
import express from "express";
import fs from "fs/promises";
import multer from "multer";
import path from "path";
import { buildRouter } from "./routes";
import { prisma } from "./prisma";
import { isDbUnreachableError } from "./utils/dbErrors";
import { startDgiiSubmitRetryWorker } from "./services/dgiiSubmitQueue.service";
import { startEcfGatewayConnectorWorker } from "./services/ecfGatewayConnector.service";
import { getUploadsRoot } from "./utils/uploadsRoot";

const PORT = Number(process.env.PORT ?? 3001);
/**
 * Solo la imagen Docker (web) prende esto: el bundle de frontend viaja empacado junto al
 * backend en un solo proceso/imagen. Electron y `npm run dev` no la seteán — ahí frontend y
 * backend corren en puertos separados (5173/3001) y la API sigue montada en la raíz para no
 * romper esos flujos.
 */
const SERVE_FRONTEND = process.env.SERVE_FRONTEND === "true";

// Las migraciones ya no corren en la maquina del cliente: viven en Supabase
// (un solo proyecto) y se aplican una vez por release con `prisma migrate
// deploy` contra ese proyecto, no en cada arranque del backend empaquetado.

const bootstrap = async () => {
  const companyCount = await prisma.company.count();
  console.log("Backend ready. Companies:", companyCount);

  const uploadsRoot = getUploadsRoot();
  await fs.mkdir(path.join(uploadsRoot, "companies"), { recursive: true });

  const app = express();
  app.use(
    cors({
      origin: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use("/uploads", express.static(uploadsRoot));

  if (SERVE_FRONTEND) {
    // Namespace propio para la API: rutas de React Router como /clients coinciden con
    // endpoints reales del backend (GET /clients). Montadas ambas en la raíz, un refresh del
    // navegador en esas rutas caería en el handler de la API (401 JSON) en vez de la SPA.
    app.use("/api", buildRouter());
    const frontendDist = path.join(process.cwd(), "public");
    // index.html nunca se cachea: si no, tras cada redeploy el navegador puede seguir usando un
    // index.html viejo que apunta a JS con hash que ya no existe en el servidor nuevo (pantalla en
    // blanco + "Expected a JavaScript module but server responded with text/html"). Los demás
    // archivos (assets/*.js, *.css) sí llevan hash en el nombre, así que cachearlos es seguro.
    app.use(
      express.static(frontendDist, {
        setHeaders: (res, filePath) => {
          if (path.basename(filePath) === "index.html") {
            res.setHeader("Cache-Control", "no-store");
          }
        },
      }),
    );
    app.get(/^(?!\/api\/|\/uploads\/).*$/, (_req, res) => {
      res.set("Cache-Control", "no-store");
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  } else {
    app.use("/", buildRouter());
  }

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ message: "El logo no puede superar 2 MB." });
        return;
      }
      if (isDbUnreachableError(err)) {
        console.error("DB inalcanzable:", err);
        res.status(503).json({ message: "No se pudo conectar a la base de datos." });
        return;
      }
      console.error(err);
      res.status(500).json({ message: "Error interno del servidor." });
    },
  );

  const stopDgiiRetryWorker = startDgiiSubmitRetryWorker(uploadsRoot);
  const stopEcfGatewayConnector = startEcfGatewayConnectorWorker();

  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
    console.log("Worker de reintento DGII activo (DGII_SUBMIT_RETRY_WORKER=false para desactivar).");
  });

  const shutdown = () => {
    stopDgiiRetryWorker();
    stopEcfGatewayConnector();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
};

bootstrap();
