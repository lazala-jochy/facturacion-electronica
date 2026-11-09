import "dotenv/config";
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
import { startEcfGatewayConnectorWorker } from "./services/ecfGatewayConnector.service";

const PORT = Number(process.env.PORT ?? 3001);

const runPrismaCli = (runtimeRoot: string, prismaCli: string, args: string[]) =>
  execFileSync(process.execPath, [prismaCli, ...args], {
    cwd: runtimeRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
    },
  });

/**
 * Un rename de migracion ya desplegada (ej. corregir su orden) hace que
 * `_prisma_migrations` no la reconozca como aplicada en bases de datos
 * existentes: `migrate deploy` intenta reaplicarla y falla con "duplicate
 * column name" (P3018, la primera vez) o con P3009 (reintentos, porque la
 * corrida anterior ya quedo registrada como fallida).
 */
const extractFailedMigrationName = (output: string): string | null => {
  const alreadyFailed = output.match(/`([^`]+)`\s+migration started at[\s\S]*?failed/);
  if (alreadyFailed) return alreadyFailed[1];
  if (/duplicate column name/i.test(output)) {
    const inline = output.match(/Migration name:\s*(\S+)/);
    if (inline) return inline[1];
  }
  return null;
};

const failedDueToColumnAlreadyApplied = async (migrationName: string, output: string) => {
  if (/duplicate column name/i.test(output)) return true;
  try {
    const rows = await prisma.$queryRawUnsafe<{ logs: string | null }[]>(
      `SELECT logs FROM _prisma_migrations WHERE migration_name = ? ORDER BY started_at DESC LIMIT 1`,
      migrationName,
    );
    return /duplicate column name/i.test(rows[0]?.logs ?? "");
  } catch {
    return false;
  }
};

const maybeMigrate = async () => {
  if (process.env.AUTO_MIGRATE === "false") return;
  const runtimeRoot = path.join(__dirname, "..");
  const prismaCli = path.join(runtimeRoot, "node_modules", "prisma", "build", "index.js");
  const schemaPath = path.join(runtimeRoot, "prisma", "schema.prisma");
  const deployArgs = ["migrate", "deploy", "--schema", schemaPath];

  try {
    console.log(runPrismaCli(runtimeRoot, prismaCli, deployArgs));
  } catch (error) {
    const output = [
      (error as { stdout?: string }).stdout ?? "",
      (error as { stderr?: string }).stderr ?? "",
      error instanceof Error ? error.message : String(error),
    ].join("\n");
    console.error(output);

    const migrationName = extractFailedMigrationName(output);
    const recoverable = migrationName && (await failedDueToColumnAlreadyApplied(migrationName, output));
    if (!migrationName || !recoverable) {
      console.error("No se pudo aplicar migraciones Prisma en el arranque.", error);
      throw error;
    }

    console.warn(
      `Migracion "${migrationName}" ya estaba aplicada en esta base de datos (columna duplicada). Marcandola como aplicada y reintentando...`,
    );
    try {
      runPrismaCli(runtimeRoot, prismaCli, [
        "migrate",
        "resolve",
        "--applied",
        migrationName,
        "--schema",
        schemaPath,
      ]);
      console.log(runPrismaCli(runtimeRoot, prismaCli, deployArgs));
    } catch (recoveryError) {
      console.error("No se pudo recuperar automaticamente de la migracion duplicada.", recoveryError);
      throw recoveryError;
    }
  }
};

const bootstrap = async () => {
  await maybeMigrate();
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
