import "../types/express-auth.augment";
import path from "path";
import type { Request, RequestHandler } from "express";
import { authService } from "../services/auth.service";
import type { ForgotPasswordBody, RegisterBody, ResetPasswordBody, UpdateCompanyBody } from "../types/auth";
import { isAllowedLogoMime } from "../utils/companyLogo";

const pickStr = (b: Record<string, unknown>, k: string): string | undefined =>
  typeof b[k] === "string" ? (b[k] as string) : undefined;

const updateCompanyBodyFromReq = (req: Request): UpdateCompanyBody => {
  const b = ((req.body as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  return {
    name: pickStr(b, "name"),
    rnc: pickStr(b, "rnc"),
    address: pickStr(b, "address"),
    phone: pickStr(b, "phone"),
    email: pickStr(b, "email"),
    regime: pickStr(b, "regime"),
    full_name: pickStr(b, "full_name"),
    cedula: pickStr(b, "cedula"),
  };
};

const wantsClearLogo = (req: Request): boolean => {
  const b = (req.body as Record<string, unknown>) ?? {};
  const v = b.clear_logo;
  return v === true || v === 1 || v === "1" || v === "true";
};

export const register: RequestHandler = async (req, res) => {
  const file = req.file;
  if (file && file.buffer.length && !isAllowedLogoMime(file.mimetype)) {
    res.status(400).json({
      message: "El logo debe ser PNG, JPG, GIF o WebP de hasta 2 MB.",
    });
    return;
  }
  const uploadsRoot = path.join(process.cwd(), "uploads");
  const result = await authService.register(req.body as RegisterBody, {
    logoFile: file?.buffer?.length ? file : undefined,
    uploadsRoot,
  });
  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }
  res.status(201).json({
    message: "Cuenta creada correctamente.",
    token: result.token,
    user: result.user,
    company: result.company,
  });
};

export const login: RequestHandler = async (req, res) => {
  const result = await authService.login(req.body);
  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }
  res.json({
    message: "Inicio de sesion exitoso.",
    token: result.token,
    user: result.user,
    company: result.company,
  });
};

export const forgotPassword: RequestHandler = async (req, res) => {
  const result = await authService.requestPasswordReset(req.body as ForgotPasswordBody);
  res.json(result);
};

export const resetPassword: RequestHandler = async (req, res) => {
  const result = await authService.resetPasswordWithToken(req.body as ResetPasswordBody);
  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }
  res.json({ message: "Contraseña actualizada. Ya podés iniciar sesión." });
};

export const me: RequestHandler = async (req, res) => {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }
  const result = await authService.me(auth.userId, auth.companyId);
  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }
  res.json({
    user: result.user,
    company: result.company,
  });
};

export const updateCompany: RequestHandler = async (req, res) => {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }

  const file = req.file;
  if (file && file.buffer?.length && !isAllowedLogoMime(file.mimetype)) {
    res.status(400).json({
      message: "El logo debe ser PNG, JPG, GIF o WebP de hasta 2 MB.",
    });
    return;
  }

  const body = updateCompanyBodyFromReq(req);
  const uploadsRoot = path.join(process.cwd(), "uploads");
  const clearLogo = wantsClearLogo(req) && !file?.buffer?.length;

  const result = await authService.updateCompany(auth.companyId, auth.userId, body, {
    logoFile: file?.buffer?.length ? file : undefined,
    uploadsRoot,
    clearLogo,
  });
  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }

  res.json({
    message: "Perfil de empresa actualizado.",
    user: result.user,
    company: result.company,
  });
};
