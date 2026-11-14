// Mismo formato/secreto que backend/src/utils/jwt.ts -- un token firmado aqui
// debe poder verificarse con requireAuth en el backend local (misma JWT_SECRET).
import jwt from "npm:jsonwebtoken@9";

export type SessionClaims = {
  sub: number;
  companyId: number;
  email: string;
};

const getSecret = (): string => {
  const secret = Deno.env.get("JWT_SECRET");
  if (!secret) throw new Error("JWT_SECRET no esta configurada (supabase secrets set).");
  return secret;
};

export const signSessionToken = (claims: SessionClaims): string =>
  jwt.sign(
    { sub: String(claims.sub), companyId: claims.companyId, email: claims.email },
    getSecret(),
    { expiresIn: Deno.env.get("JWT_ACCESS_EXPIRES_IN") ?? "1h" },
  );

/** Verifica un access token emitido por signSessionToken (o por el backend local, misma JWT_SECRET). */
export const verifySessionToken = (token: string): SessionClaims => {
  const decoded = jwt.verify(token, getSecret()) as { sub: string; companyId: number; email: string };
  return { sub: Number(decoded.sub), companyId: decoded.companyId, email: decoded.email };
};
