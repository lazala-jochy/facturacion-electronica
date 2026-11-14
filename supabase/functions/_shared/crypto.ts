// Mismo esquema que backend/src/utils/password.ts (scrypt) y
// companyCertificateCrypto.ts (AES-256-GCM) para que el hash/los secretos
// sean compatibles entre Edge Functions y el backend local.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

export const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

export const verifyPassword = (password: string, stored: string): boolean => {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(hash, "hex");
  if (storedBuffer.length !== derived.length) return false;
  return timingSafeEqual(storedBuffer, derived);
};

const AES = "aes-256-gcm";
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;

const seal = (key: Buffer, plaintext: string): string => {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(AES, key, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
};

const open = (key: Buffer, ciphertextB64: string): string => {
  const payload = Buffer.from(ciphertextB64, "base64");
  const iv = payload.subarray(0, IV_LEN);
  const tag = payload.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const data = payload.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = createDecipheriv(AES, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
};

// Clave propia de las Edge Functions para cifrar lo que vive SOLO en
// tenant_roles (contrasena del rol de Postgres, y la app_secrets_key de cada
// empresa) -- nunca sale de aqui, nunca viaja a ningun instalador.
let cachedEdgeAdminKey: Buffer | null = null;
const getEdgeAdminKey = (): Buffer => {
  if (cachedEdgeAdminKey) return cachedEdgeAdminKey;
  const raw = Deno.env.get("EDGE_ADMIN_KEY");
  if (!raw) throw new Error("EDGE_ADMIN_KEY no esta configurada (supabase secrets set).");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("EDGE_ADMIN_KEY debe decodificar a 32 bytes (base64).");
  cachedEdgeAdminKey = key;
  return key;
};

export const encryptWithEdgeAdminKey = (plaintext: string): string => seal(getEdgeAdminKey(), plaintext);
export const decryptWithEdgeAdminKey = (ciphertextB64: string): string => open(getEdgeAdminKey(), ciphertextB64);

export const generateRolePassword = (): string => randomBytes(24).toString("base64url");

/**
 * Clave de cifrado de dgiiPasswordEnc/certificateKeyphraseEnc -- UNICA por
 * empresa (ver companyCertificateCrypto.ts del backend local), no una clave
 * global. Si fuera global, cualquiera que la extraiga de SU instalador
 * podria descifrar los secretos DGII de CUALQUIER empresa en cuanto
 * consiguiera leer la tabla companies por otra via (un dump, un bug futuro
 * de RLS). Se genera una vez por empresa (como su password de Postgres),
 * se guarda cifrada con EDGE_ADMIN_KEY en tenant_roles.app_secrets_key_enc,
 * y se entrega en claro solo a esa empresa via login/registro.
 */
export const generateAppSecretsKey = (): string => randomBytes(32).toString("base64");

export const decryptAppSecret = (
  ciphertextB64: string | null | undefined,
  appSecretsKeyB64: string,
): string | null => {
  if (!ciphertextB64) return null;
  const key = Buffer.from(appSecretsKeyB64, "base64");
  return open(key, ciphertextB64);
};

export const encryptAppSecret = (plaintext: string, appSecretsKeyB64: string): string =>
  seal(Buffer.from(appSecretsKeyB64, "base64"), plaintext);
