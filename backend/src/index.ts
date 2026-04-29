import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import {
  createCompany,
  findCompanyByEmail,
  findCompanyByRnc,
  getCompanies,
} from "./services/company.service";

const PORT = Number(process.env.PORT ?? 3001);

type AuthBody = {
  razonSocial?: string;
  direccion?: string;
  rnc?: string;
  email?: string;
  password?: string;
};

const json = (res: ServerResponse, statusCode: number, data: unknown) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

const verifyPassword = (password: string, stored: string) => {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(hash, "hex");
  if (storedBuffer.length !== derived.length) return false;
  return timingSafeEqual(storedBuffer, derived);
};

const readBody = async (req: IncomingMessage): Promise<AuthBody> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as AuthBody;
};

const handleRegister = async (req: IncomingMessage, res: ServerResponse) => {
  const body = await readBody(req);
  const razonSocial = body.razonSocial?.trim();
  const direccion = body.direccion?.trim();
  const rnc = body.rnc?.trim();
  const email = body.email ? normalizeEmail(body.email) : "";
  const password = body.password?.trim() ?? "";
console.log(body, "this is the data sent")
  if (!razonSocial || !rnc || !email || !password) {
    return json(res, 400, { message: "Completa todos los campos requeridos." });
  }
  if (!/^[0-9]{9,11}$/.test(rnc)) {
    return json(res, 400, { message: "El RNC debe tener 9 a 11 digitos." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(res, 400, { message: "Correo electronico invalido." });
  }
  if (password.length < 8) {
    return json(res, 400, { message: "La contrasena debe tener minimo 8 caracteres." });
  }

  const existing = await findCompanyByEmail(email);
  if (existing) {
    return json(res, 409, { message: "Ya existe una cuenta con ese correo." });
  }
  const existingRnc = await findCompanyByRnc(rnc);
  if (existingRnc) {
    return json(res, 409, { message: "Ya existe una cuenta con ese RNC." });
  }

  const company = await createCompany({
    razonSocial,
    rnc,
    email,
    password: hashPassword(password),
    direccion: direccion ?? "",
  });

  return json(res, 201, {
    message: "Cuenta creada correctamente.",
    company: { id: company.id, razonSocial: company.razonSocial, email: company.email, rnc: company.rnc, direccion: company.direccion },
  });
};

const handleLogin = async (req: IncomingMessage, res: ServerResponse) => {
  const body = await readBody(req);
  const email = body.email ? normalizeEmail(body.email) : "";
  const password = body.password?.trim() ?? "";

  if (!email || !password) {
    return json(res, 400, { message: "Correo y contrasena son obligatorios." });
  }

  const company = await findCompanyByEmail(email);
  if (!company || !verifyPassword(password, company.password)) {
    return json(res, 401, { message: "Credenciales invalidas." });
  }

  return json(res, 200, {
    message: "Inicio de sesion exitoso.",
    session: { token: randomBytes(24).toString("hex") },
    company: { id: company.id, razonSocial: company.razonSocial, email: company.email, rnc: company.rnc, direccion: company.direccion },
  });
};

const bootstrap = async () => {
  const companies = await getCompanies();
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
        return await handleRegister(req, res);
      }
      if (req.method === "POST" && req.url === "/auth/login") {
        return await handleLogin(req, res);
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