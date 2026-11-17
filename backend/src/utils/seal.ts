import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const AES = "aes-256-gcm";
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;

export const seal = (key: Buffer, plaintext: Buffer): Buffer => {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(AES, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
};

export const open = (key: Buffer, payload: Buffer): Buffer => {
  if (payload.length < IV_LEN + AUTH_TAG_LEN) {
    throw new Error("Paquete cifrado inválido.");
  }
  const iv = payload.subarray(0, IV_LEN);
  const tag = payload.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const data = payload.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = createDecipheriv(AES, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
};
