import "../types/express-auth.augment";
import type { RequestHandler } from "express";
import { verifySessionToken } from "../utils/jwt";

const bearer = (header?: string) => {
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
};

/** Requiere `Authorization: Bearer <jwt>`. Adjunta `req.auth` con userId y companyId. */
export const requireAuth: RequestHandler = (req, res, next) => {
  const token = bearer(req.headers.authorization);
  if (!token) {
    res.status(401).json({ message: "No autorizado. Inicia sesion." });
    return;
  }
  try {
    const claims = verifySessionToken(token);
    req.auth = {
      userId: claims.sub,
      companyId: claims.companyId,
      email: claims.email,
    };
    next();
  } catch {
    res.status(401).json({ message: "Sesion invalida o expirada." });
  }
};
