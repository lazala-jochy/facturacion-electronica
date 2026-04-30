import jwt, { type Secret, type SignOptions } from "jsonwebtoken";

const SECRET: Secret =
  process.env.JWT_SECRET ?? "dev-only-change-JWT_SECRET-in-production";

const signOptions: SignOptions = {
  expiresIn: (process.env.JWT_EXPIRES_IN as SignOptions["expiresIn"]) ?? "7d",
};

export type SessionClaims = {
  sub: number;
  companyId: number;
  email: string;
};

export const signSessionToken = (claims: SessionClaims) =>
  jwt.sign(
    { sub: String(claims.sub), companyId: claims.companyId, email: claims.email },
    SECRET,
    signOptions,
  );

export const verifySessionToken = (token: string): SessionClaims => {
  const decoded = jwt.verify(token, SECRET) as jwt.JwtPayload & {
    companyId?: number;
    email?: string;
  };
  const sub = Number(decoded.sub);
  const companyId = Number(decoded.companyId);
  if (!Number.isFinite(sub) || !Number.isFinite(companyId) || !decoded.email) {
    throw new Error("Invalid token payload");
  }
  return { sub, companyId, email: String(decoded.email) };
};
