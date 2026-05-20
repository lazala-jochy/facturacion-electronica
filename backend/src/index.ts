import "./types/express-auth.augment";
import cors from "cors";
import express from "express";
import fs from "fs/promises";
import multer from "multer";
import { execFileSync } from "child_process";
import path from "path";
import { buildRouter } from "./routes";
import { prisma } from "./prisma";
import { startDgiiSubmitRetryWorker } from "./services/dgiiSubmitQueue.service";

const PORT = Number(process.env.PORT ?? 3001);

const maybeMigrate = () => {
  if (process.env.AUTO_MIGRATE === "false") return;
  const runtimeRoot = path.join(__dirname, "..");
  const prismaCli = path.join(runtimeRoot, "node_modules", "prisma", "build", "index.js");
  const schemaPath = path.join(runtimeRoot, "prisma", "schema.prisma");
  try {
    execFileSync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], {
      cwd: runtimeRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
      },
    });
  } catch (error) {
    console.error("No se pudo aplicar migraciones Prisma en el arranque.", error);
    throw error;
  }
};

const bootstrap = async () => {
  maybeMigrate();
  const companyCount = await prisma.company.count();
  console.log("Backend ready. Companies:", companyCount);

  const uploadsRoot = path.join(process.cwd(), "uploads");
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
  app.use("/", buildRouter());

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
      console.error(err);
      res.status(500).json({ message: "Error interno del servidor." });
    },
  );

  const stopDgiiRetryWorker = startDgiiSubmitRetryWorker(uploadsRoot);

  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
    console.log("Worker de reintento DGII activo (DGII_SUBMIT_RETRY_WORKER=false para desactivar).");
  });

  process.on("SIGTERM", () => stopDgiiRetryWorker());
  process.on("SIGINT", () => stopDgiiRetryWorker());
};

bootstrap();
