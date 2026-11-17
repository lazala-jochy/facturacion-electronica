import { createHash } from "crypto";
import type { Company } from "@prisma/client";
import { prisma } from "../prisma";
import { open, seal } from "./seal";

const APP_SECRETS_KEY_LEN = 32;

const getMasterKey = (): Buffer => {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error("JWT_SECRET no esta configurada (se usa para cifrar app_secrets_key por empresa).");
  }
  return createHash("sha256").update(`app-secrets-key-master:${secret}`).digest();
};

export const parseAppSecretsKey = (raw: string | null | undefined): string | null => {
  const value = raw?.trim();
  if (!value) return null;
  const key = Buffer.from(value, "base64");
  if (key.length !== APP_SECRETS_KEY_LEN) {
    throw new Error(`APP_SECRETS_KEY debe decodificar a ${APP_SECRETS_KEY_LEN} bytes (base64).`);
  }
  return value;
};

export const encryptAppSecretsKey = (appSecretsKey: string): string =>
  seal(getMasterKey(), Buffer.from(appSecretsKey, "utf8")).toString("base64");

export const decryptAppSecretsKey = (ciphertextB64: string | null | undefined): string | null => {
  if (!ciphertextB64) return null;
  return open(getMasterKey(), Buffer.from(ciphertextB64, "base64")).toString("utf8");
};

const keyCache = new Map<number, string>();

export const resolveAppSecretsKeyForCompany = async (companyId: number): Promise<string> => {
  const cached = keyCache.get(companyId);
  if (cached) return cached;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, appSecretsKeyEnc: true },
  });
  const key = parseAppSecretsKey(
    decryptAppSecretsKey(company?.appSecretsKeyEnc) ?? process.env.APP_SECRETS_KEY?.trim(),
  );
  if (!key) {
    throw new Error(
      "APP_SECRETS_KEY no esta configurada para esta empresa. Generala con: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\" y guardala en Perfil de empresa.",
    );
  }
  keyCache.set(companyId, key);
  return key;
};

export const appSecretsKeyFor = (company: Pick<Company, "id" | "appSecretsKeyEnc">): string => {
  const cached = keyCache.get(company.id);
  if (cached) return cached;
  return parseAppSecretsKey(decryptAppSecretsKey(company.appSecretsKeyEnc)) ?? "";
};

export const setCachedAppSecretsKey = (companyId: number, key: string): void => {
  keyCache.set(companyId, key);
};

export const clearCachedAppSecretsKey = (companyId: number): void => {
  keyCache.delete(companyId);
};
