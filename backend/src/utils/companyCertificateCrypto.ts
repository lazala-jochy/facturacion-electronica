import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";
import forge from "node-forge";

const AES = "aes-256-gcm";
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;
const SALT_BYTES = 16;
const MIN_ENCRYPTION_SECRET_LEN = 8;

/** Clave derivada con scrypt a partir de la frase que el usuario ingresa en la UI (no se guarda en servidor). */
const deriveStorageKey = (userSecretUtf8: string, salt: Buffer, companyId: number): Buffer => {
  const normalized = userSecretUtf8.normalize("NFKC").trim();
  const idBuf = Buffer.allocUnsafe(4);
  idBuf.writeUInt32BE(companyId >>> 0, 0);
  const combinedSalt = Buffer.concat([salt, idBuf]);
  return scryptSync(Buffer.from(normalized, "utf8"), combinedSalt, 32, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 128 * 1024 * 1024,
  });
};

const seal = (key: Buffer, plaintext: Buffer): Buffer => {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(AES, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
};

const open = (key: Buffer, payload: Buffer): Buffer => {
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

export function assertCertificateEncryptionSecret(secret: string): string {
  const s = typeof secret === "string" ? secret.normalize("NFKC").trim() : "";
  if (s.length < MIN_ENCRYPTION_SECRET_LEN) {
    throw new Error(
      `La clave de cifrado del certificado debe tener al menos ${MIN_ENCRYPTION_SECRET_LEN} caracteres.`,
    );
  }
  return s;
}

export function generateCertificateSalt(): Buffer {
  return randomBytes(SALT_BYTES);
}

/** Valida contraseña .p12 leyendo el contenedor PKCS#12 desde buffer. */
export const verifyPkcs12Password = (p12Buffer: Buffer, password: string): void => {
  try {
    const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12Buffer.toString("binary")));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password ?? "");
    const keyBag =
      p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
      p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
    const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
    if (!keyBag?.key || !certBag?.cert) {
      throw new Error("El archivo no contiene par llave/certificado válido.");
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("par llave")) throw e;
    throw new Error(
      "No se pudo abrir el certificado. Verificá que sea un .p12/.pfx válido y que la contraseña sea correcta.",
    );
  }
};

/** Cifrar buffer y texto de contraseña del .p12 para persistencia. */
export const encryptCompanyCertificatePayload = (
  encryptionSecret: string,
  companyId: number,
  saltBuffer: Buffer,
  p12Buffer: Buffer,
  p12PassphraseUtf8: string,
): {
  encryptedP12: Buffer;
  encryptedPasswordPayload: Buffer;
} => {
  const secret = assertCertificateEncryptionSecret(encryptionSecret);
  const key = deriveStorageKey(secret, saltBuffer, companyId);
  const encryptedP12 = seal(key, p12Buffer);
  const encryptedPasswordPayload = seal(key, Buffer.from(p12PassphraseUtf8, "utf8"));
  return { encryptedP12, encryptedPasswordPayload };
};

export const decryptCompanyP12Payload = (
  encryptionSecret: string,
  companyId: number,
  saltBuffer: Buffer,
  encryptedP12: Buffer,
  encryptedPasswordPayload: Buffer,
): { p12Buffer: Buffer; password: string } => {
  const secret = assertCertificateEncryptionSecret(encryptionSecret);
  const key = deriveStorageKey(secret, saltBuffer, companyId);
  const pwdBuf = open(key, encryptedPasswordPayload);
  const password = pwdBuf.toString("utf8");
  const p12Buffer = open(key, encryptedP12);
  return { p12Buffer, password };
};
