import "./types/express-auth.augment";
import cors from "cors";
import express from "express";
import { buildRouter } from "./routes";
import { prisma } from "./prisma";

const PORT = Number(process.env.PORT ?? 3001);

const bootstrap = async () => {
  const companyCount = await prisma.company.count();
  console.log("Backend ready. Companies:", companyCount);

  const app = express();
  app.use(
    cors({
      origin: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use("/", buildRouter());

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(err);
      res.status(500).json({ message: "Error interno del servidor." });
    },
  );

  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
  });
};

bootstrap();
