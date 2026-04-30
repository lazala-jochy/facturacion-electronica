import "../types/express-auth.augment";
import type { RequestHandler } from "express";
import { authService } from "../services/auth.service";

export const register: RequestHandler = async (req, res) => {
  const result = await authService.register(req.body);
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
