import { createServer } from "http";
import { authController } from "./controllers/auth.controller";
import { companyService } from "./services/company.service";
import { json } from "./utils/http";

const PORT = Number(process.env.PORT ?? 3001);

const bootstrap = async () => {
  const companies = await companyService.list();
  console.log("Backend auth ready. Companies:", companies.length);

  const server = createServer(async (req, res) => {
    if (!req.url || !req.method) {
      return json(res, 404, { message: "Ruta no encontrada." });
    }

    if (req.method === "OPTIONS") {
      return json(res, 204, {});
    }

    try {
      if (req.method === "GET" && req.url === "/health") {
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && req.url === "/auth/register") {
        return await authController.register(req, res);
      }
      if (req.method === "POST" && req.url === "/auth/login") {
        return await authController.login(req, res);
      }
      return json(res, 404, { message: "Ruta no encontrada." });
    } catch (error) {
      console.error("Backend error:", error);
      return json(res, 500, { message: "Error interno del servidor." });
    }
  });

  server.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
  });
};

bootstrap();
