import { createHash, randomBytes } from "crypto";
import { Prisma, type Company, type User } from "@prisma/client";
import { prisma } from "../prisma";
import type {
  ForgotPasswordBody,
  LoginBody,
  RefreshBody,
  RegisterBody,
  ResetPasswordBody,
  UpdateCompanyBody,
} from "../types/auth";
import {
  assertCertificateEncryptionSecret,
  decryptCompanySecret,
  encryptCompanySecret,
  verifyPkcs12Password,
} from "../utils/companyCertificateCrypto";
import {
  clearCachedAppSecretsKey,
  decryptAppSecretsKey,
  encryptAppSecretsKey,
  parseAppSecretsKey,
  setCachedAppSecretsKey,
} from "../utils/appSecretsKey";
import {
  encryptAndPersistCompanyCertificate,
  companyHasCertificateRecord,
  loadDecryptedPkcs12ForCompany,
  removeStoredCompanyCertificate,
} from "../utils/companyCertificateStorage";
import {
  LogoUploadError,
  removeCompanyLogoFromBucket,
  uploadCompanyLogoToBucket,
  saveCompanyLogoFile,
} from "../utils/companyLogo";
import {
  saveCompanySignatureFile,
  removeUploadedCompanySignatureFiles,
  uploadCompanySignatureToBucket,
  removeCompanySignatureFromBucket,
} from "../utils/companySignature";
import { normalizeEmail } from "../utils/email";
import { hashPassword, verifyPassword } from "../utils/password";
import { signSessionToken } from "../utils/jwt";
import {
  isValidEmailFormat,
  isValidCedula,
  isValidPasswordLength,
  isValidPhoneFormat,
  isValidRnc,
} from "../utils/validation";
import { clearDgiiTokenCache } from "./dgiiEcfApi.service";
import { normalizeDgiiEcfUrl } from "../config/dgiiEcf.constants";
import {
  paso4SeedUrlFromAuthBase,
  paso4ValidateSeedUrlFromAuthBase,
} from "../utils/dgiiPaso4Urls";

export type PublicCompany = Pick<
  Company,
  | "id"
  | "name"
  | "rnc"
  | "address"
  | "phone"
  | "email"
  | "logoUrl"
  | "signatureUrl"
  | "dgiiEcfEndpoint"
  | "dgiiUsername"
  | "dgiiAuthUrl"
  | "dgiiReceptionUrl"
  | "dgiiConsultUrl"
  | "dgiiCommercialApprovalUrl"
  | "dgiiSeedUrl"
  | "dgiiValidateSeedUrl"
  | "dgiiEcfReceiveUrl"
  | "dgiiTrackUrl"
  | "dgiiStatusUrl"
  | "dgiiEnvironment"
  | "dgiiProdAuthUrl"
  | "dgiiProdSeedUrl"
  | "dgiiProdValidateSeedUrl"
  | "dgiiProdReceptionUrl"
  | "dgiiProdConsultUrl"
  | "dgiiProdCommercialApprovalUrl"
  | "dgiiProdConsumerSummaryUrl"
  | "dgiiPaso4AuthUrl"
  | "dgiiPaso4ReceptionUrl"
  | "dgiiPaso4ConsultUrl"
  | "dgiiPaso4RfceUrl"
  | "dgiiPaso4Environment"
  | "dgiiPaso4SeedUrl"
  | "dgiiPaso4ValidateSeedUrl"
  | "dgiiPaso4EcfReceiveUrl"
  | "certificatePath"
  | "tokenExpiration"
  | "ecfGatewayBaseUrl"
  | "ecfGatewayApiKey"
  | "smtpEmail"
> & {
  /** Descifrado de dgiiPasswordEnc; mismo contrato externo que antes (texto plano). */
  dgiiPassword: string | null;
  certificateConfigured: boolean;
  /** Nombre del archivo .p12/.pfx tal como lo subió el usuario, solo para mostrarlo en Perfil de empresa. */
  certificate_original_name: string | null;
  /** Clave de cifrado del .p12 persistida (misma que al guardar el certificado), descifrada de certificateKeyphraseEnc. */
  certificate_keyphrase: string | null;
  /** Nunca se expone el token en claro al frontend. */
  token_cached: boolean;
  /** Indica si la empresa ya tiene APP_SECRETS_KEY guardada. */
  app_secrets_key_configured: boolean;
  /** Descifrada de appSecretsKeyEnc, para precargar el campo en Perfil de empresa. */
  app_secrets_key: string | null;
  /** Indica si ya hay un App Password de Gmail guardado. */
  smtp_app_password_configured: boolean;
  /** Descifrado de smtpAppPasswordEnc, para precargar el campo en Perfil de empresa. */
  smtp_app_password: string | null;
};

const REFRESH_TOKEN_DAYS = Math.max(
  1,
  Number.parseInt(process.env.REFRESH_TOKEN_DAYS ?? "30", 10) || 30,
);
const REFRESH_TTL_MS = REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000;

const hashOpaqueToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

const issueRefreshToken = async (userId: number, companyId: number): Promise<string> => {
  const raw = randomBytes(32).toString("hex");
  const tokenHash = hashOpaqueToken(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await prisma.refreshToken.create({
    data: { userId, companyId, tokenHash, expiresAt },
  });
  return raw;
};

const createSessionPair = async (user: User & { company: Company }) => {
  const token = signSessionToken({
    sub: user.id,
    companyId: user.companyId,
    email: user.email,
  });
  const refresh_token = await issueRefreshToken(user.id, user.companyId);
  return { token, refresh_token };
};

export type AuthOk = {
  ok: true;
  token: string;
  refresh_token: string;
  user: {
    id: number;
    email: string;
    full_name: string;
    cedula: string;
  };
  company: PublicCompany;
};

export type AuthErr = { ok: false; status: number; message: string };

export type MeOk = {
  ok: true;
  user: {
    id: number;
    email: string;
    full_name: string;
    cedula: string;
  };
  company: PublicCompany;
};

export type UpdateCompanyOk = {
  ok: true;
  user: {
    id: number;
    email: string;
    full_name: string;
    cedula: string;
  };
  company: PublicCompany;
  /** Aviso no bloqueante (p. ej. certificado no pudo actualizarse) -- el resto del perfil sí se guardó. */
  message?: string;
};

const publicCompany = (c: Company): PublicCompany => ({
  id: c.id,
  name: c.name,
  rnc: c.rnc,
  address: c.address,
  phone: c.phone,
  email: c.email,
  logoUrl: c.logoUrl,
  signatureUrl: c.signatureUrl,
  dgiiEcfEndpoint: c.dgiiEcfEndpoint,
  dgiiUsername: c.dgiiUsername,
  dgiiPassword: decryptCompanySecret(c.dgiiPasswordEnc, c),
  dgiiAuthUrl: c.dgiiAuthUrl,
  dgiiReceptionUrl: c.dgiiReceptionUrl,
  dgiiConsultUrl: c.dgiiConsultUrl,
  dgiiCommercialApprovalUrl: c.dgiiCommercialApprovalUrl,
  dgiiSeedUrl: c.dgiiSeedUrl,
  dgiiValidateSeedUrl: c.dgiiValidateSeedUrl,
  dgiiEcfReceiveUrl: c.dgiiEcfReceiveUrl,
  dgiiTrackUrl: c.dgiiTrackUrl,
  dgiiStatusUrl: c.dgiiStatusUrl,
  dgiiEnvironment: c.dgiiEnvironment,
  dgiiProdAuthUrl: c.dgiiProdAuthUrl,
  dgiiProdSeedUrl: c.dgiiProdSeedUrl,
  dgiiProdValidateSeedUrl: c.dgiiProdValidateSeedUrl,
  dgiiProdReceptionUrl: c.dgiiProdReceptionUrl,
  dgiiProdConsultUrl: c.dgiiProdConsultUrl,
  dgiiProdCommercialApprovalUrl: c.dgiiProdCommercialApprovalUrl,
  dgiiProdConsumerSummaryUrl: c.dgiiProdConsumerSummaryUrl,
  dgiiPaso4AuthUrl: c.dgiiPaso4AuthUrl,
  dgiiPaso4ReceptionUrl: c.dgiiPaso4ReceptionUrl,
  dgiiPaso4ConsultUrl: c.dgiiPaso4ConsultUrl,
  dgiiPaso4RfceUrl: c.dgiiPaso4RfceUrl,
  dgiiPaso4Environment: c.dgiiPaso4Environment,
  dgiiPaso4SeedUrl: c.dgiiPaso4SeedUrl,
  dgiiPaso4ValidateSeedUrl: c.dgiiPaso4ValidateSeedUrl,
  dgiiPaso4EcfReceiveUrl: c.dgiiPaso4EcfReceiveUrl,
  ecfGatewayBaseUrl: c.ecfGatewayBaseUrl,
  ecfGatewayApiKey: c.ecfGatewayApiKey,
  smtpEmail: c.smtpEmail,
  certificatePath: c.certificatePath,
  tokenExpiration: c.tokenExpiration,
  certificateConfigured: companyHasCertificateRecord(c),
  certificate_original_name: c.certificateOriginalName,
  certificate_keyphrase: decryptCompanySecret(c.certificateKeyphraseEnc, c),
  token_cached: Boolean(
    c.tokenCache &&
      c.tokenExpiration &&
      c.tokenCacheEnvironment === (c.dgiiEnvironment ?? "CERTIFICACION") &&
      c.tokenExpiration.getTime() > Date.now(),
  ),
  app_secrets_key_configured: Boolean(c.appSecretsKeyEnc),
  // Igual que certificate_keyphrase: se devuelve ya descifrada para precargar el campo en
  // Perfil de empresa (si no, el usuario tiene que volver a tipearla a mano en cada guardado,
  // aunque dejarla vacía ya conserva la actual -- mala experiencia que esto evita).
  app_secrets_key: decryptAppSecretsKey(c.appSecretsKeyEnc),
  /** Igual que dgiiPassword: se devuelve descifrada para precargar el campo en Perfil de empresa. */
  smtp_app_password_configured: Boolean(c.smtpAppPasswordEnc),
  smtp_app_password: decryptCompanySecret(c.smtpAppPasswordEnc, c),
});

const publicUser = (u: User) => ({
  id: u.id,
  email: u.email,
  full_name: u.fullName,
  cedula: u.cedula,
});

export const authService = {
  async register(
    body: RegisterBody,
    opts?: {
      logoFile?: { buffer: Buffer; mimetype: string };
      certificateFile?: { buffer: Buffer; mimetype?: string };
      certificatePassword?: string;
      /** Clave definida por el usuario en la interfaz para cifrar el .p12 guardado en disco. */
      certificateEncryptionSecret?: string;
      uploadsRoot?: string;
    },
  ): Promise<AuthOk | AuthErr> {
    const name = body.name?.trim();
    const address = body.address?.trim() ?? "";
    const rnc = body.rnc?.trim();
    const fullName = body.full_name?.trim() ?? "";
    const cedula = (body.cedula ?? "").replace(/\D/g, "");
    const email = body.email ? normalizeEmail(body.email) : "";
    const password = body.password?.trim() ?? "";

    if (!name || !rnc || !email || !password || !address || !fullName || !cedula) {
      return {
        ok: false,
        status: 400,
        message: "Completa todos los campos requeridos (empresa y representante).",
      };
    }
    if (!isValidRnc(rnc)) {
      return { ok: false, status: 400, message: "El RNC debe tener 9 a 11 digitos." };
    }
    if (!isValidEmailFormat(email)) {
      return { ok: false, status: 400, message: "Correo electronico invalido." };
    }
    if (!isValidCedula(cedula)) {
      return { ok: false, status: 400, message: "La cedula debe tener 11 digitos." };
    }
    if (!isValidPasswordLength(password)) {
      return {
        ok: false,
        status: 400,
        message: "La contrasena debe tener minimo 8 caracteres.",
      };
    }

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      return { ok: false, status: 409, message: "Ya existe una cuenta con ese correo." };
    }
    const existingRnc = await prisma.company.findUnique({ where: { rnc } });
    if (existingRnc) {
      return { ok: false, status: 409, message: "Ya existe una empresa registrada con ese RNC." };
    }
    const existingCedula = await prisma.user.findUnique({ where: { cedula } });
    if (existingCedula) {
      return { ok: false, status: 409, message: "Ya existe una cuenta con esa cedula." };
    }

    const companyPhone = body.company_phone?.trim() ?? "";
    const companyEmailRaw = (body.company_email?.trim() || email).trim();
    if (companyPhone && !isValidPhoneFormat(companyPhone)) {
      return {
        ok: false,
        status: 400,
        message: "El telefono de la empresa debe tener formato xxx-xxx-xxxx.",
      };
    }
    if (!isValidEmailFormat(normalizeEmail(companyEmailRaw))) {
      return {
        ok: false,
        status: 400,
        message: "El correo de la empresa no es valido.",
      };
    }

    const { company, user } = await prisma.$transaction(async (tx) => {
      const companyRow = await tx.company.create({
        data: {
          name,
          rnc,
          address,
          phone: companyPhone || null,
          email: normalizeEmail(companyEmailRaw),
        },
      });
      const userRow = await tx.user.create({
        data: {
          fullName,
          cedula,
          email,
          password: hashPassword(password),
          companyId: companyRow.id,
        },
      });
      return { company: companyRow, user: userRow };
    });

    let companyOut = company;
    const file = opts?.logoFile;
    const uploadsRoot = opts?.uploadsRoot;
    if (file?.buffer?.length && uploadsRoot) {
      try {
        const relative = await saveCompanyLogoFile(
          uploadsRoot,
          company.id,
          file.buffer,
          file.mimetype,
        );
        if (relative) {
          companyOut = await prisma.company.update({
            where: { id: company.id },
            data: { logoUrl: relative },
          });
        }
      } catch (e) {
        console.error("No se pudo guardar el logo de la empresa.", e);
      }
    }

    const certBuf = opts?.certificateFile?.buffer;
    const certPw = opts?.certificatePassword?.trim() ?? "";
    if (certBuf?.length) {
      if (!certPw) {
        return {
          ok: false,
          status: 400,
          message: "Si subís un certificado .p12, la contraseña del certificado es obligatoria.",
        };
      }
      let encryptionSecret: string;
      try {
        encryptionSecret = assertCertificateEncryptionSecret(opts?.certificateEncryptionSecret ?? "");
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : "Indicá una clave de cifrado para el certificado (mínimo 8 caracteres; la usarás cada vez que envíes e-CF).";
        return { ok: false, status: 400, message: msg };
      }
      if (!uploadsRoot) {
        return { ok: false, status: 500, message: "Ruta de almacenamiento no configurada." };
      }
      try {
        const persisted = await encryptAndPersistCompanyCertificate({
          uploadsRoot,
          companyId: company.id,
          p12Buffer: certBuf,
          p12Password: certPw,
          encryptionSecret,
        });
        companyOut = await prisma.company.update({
          where: { id: company.id },
          data: {
            certificateSalt: persisted.certificateSalt,
            certificateEncPath: persisted.certificateEncPath,
            certificatePasswordEnc: persisted.certificatePasswordEnc,
            certificateKeyphraseEnc: encryptCompanySecret(encryptionSecret, company),
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "No se pudo guardar el certificado.";
        return { ok: false, status: 400, message: msg };
      }
    }

    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    const { token, refresh_token } = await createSessionPair({ ...user, company: companyOut });

    return {
      ok: true,
      token,
      refresh_token,
      user: publicUser(user),
      company: publicCompany(companyOut),
    };
  },

  async login(body: LoginBody): Promise<AuthOk | AuthErr> {
    const email = body.email ? normalizeEmail(body.email) : "";
    const password = body.password?.trim() ?? "";

    if (!email || !password) {
      return { ok: false, status: 400, message: "Correo y contrasena son obligatorios." };
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: true },
    });
    if (!user || !verifyPassword(password, user.password)) {
      return {
        ok: false,
        status: 401,
        message:
          "Correo o contraseña incorrectos. Si venias de una version anterior, debes registrarte de nuevo: ahora el correo de acceso es el del usuario (cuenta en «Registrate»), no el modelo viejo solo-empresa.",
      };
    }

    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    const { token, refresh_token } = await createSessionPair(user);

    return {
      ok: true,
      token,
      refresh_token,
      user: publicUser(user),
      company: publicCompany(user.company),
    };
  },

  async refresh(body: RefreshBody): Promise<AuthOk | AuthErr> {
    const raw = typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
    if (!raw) {
      return { ok: false, status: 400, message: "refresh_token es obligatorio." };
    }

    const tokenHash = hashOpaqueToken(raw);
    const row = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { company: true } } },
    });

    if (!row || row.expiresAt < new Date()) {
      if (row) {
        await prisma.refreshToken.delete({ where: { id: row.id } }).catch(() => undefined);
      }
      return { ok: false, status: 401, message: "Sesion invalida o expirada." };
    }

    await prisma.refreshToken.delete({ where: { id: row.id } });
    const { token, refresh_token } = await createSessionPair(row.user);

    return {
      ok: true,
      token,
      refresh_token,
      user: publicUser(row.user),
      company: publicCompany(row.user.company),
    };
  },

  async me(userId: number, companyId: number): Promise<MeOk | AuthErr> {
    const user = await prisma.user.findFirst({
      where: { id: userId, companyId },
      include: { company: true },
    });
    if (!user) {
      return { ok: false, status: 401, message: "Usuario no encontrado." };
    }
    return {
      ok: true,
      user: publicUser(user),
      company: publicCompany(user.company),
    };
  },

  async updateCompany(
    companyId: number,
    userId: number,
    body: UpdateCompanyBody,
    opts?: {
      logoFile?: { buffer: Buffer; mimetype: string };
      certificateFile?: { buffer: Buffer; mimetype?: string; originalname?: string };
      signatureFile?: { buffer: Buffer; mimetype: string };
      certificatePassword?: string;
      certificateEncryptionSecret?: string;
      uploadsRoot?: string;
      clearLogo?: boolean;
      clearCertificate?: boolean;
      clearSignature?: boolean;
      /** Access token de la sesion que llama, para pedir la URL firmada de subida del logo. */
      accessToken?: string;
    },
  ): Promise<UpdateCompanyOk | AuthErr> {
    let existingCompany = await prisma.company.findUnique({ where: { id: companyId } });
    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!existingCompany || !existingUser) {
      return { ok: false, status: 404, message: "Empresa o usuario no encontrado." };
    }

    let appSecretsKeyUpdate: string | null | undefined;
    if (body.app_secrets_key !== undefined) {
      let key: string | null;
      try {
        key = parseAppSecretsKey(body.app_secrets_key);
      } catch (e) {
        return {
          ok: false,
          status: 400,
          message: e instanceof Error ? e.message : "APP_SECRETS_KEY inválida.",
        };
      }
      if (key) {
        appSecretsKeyUpdate = encryptAppSecretsKey(key);
        setCachedAppSecretsKey(companyId, key);
        existingCompany = await prisma.company.update({
          where: { id: companyId },
          data: { appSecretsKeyEnc: appSecretsKeyUpdate },
        });
      } else {
        appSecretsKeyUpdate = null;
        clearCachedAppSecretsKey(companyId);
        existingCompany = await prisma.company.update({
          where: { id: companyId },
          data: { appSecretsKeyEnc: null },
        });
      }
    }

    /** Campos omitidos en el body conservan el valor del perfil (p. ej. solo dgii_commercial_approval_url). */
    const name = body.name !== undefined ? body.name.trim() : existingCompany.name;
    const rnc = body.rnc !== undefined ? body.rnc.trim() : existingCompany.rnc;
    const address = body.address !== undefined ? body.address.trim() : existingCompany.address;
    const phone =
      body.phone !== undefined ? body.phone.trim() || null : existingCompany.phone;
    const regime =
      body.regime !== undefined ? body.regime.trim() || "Régimen general" : existingCompany.regime ?? "Régimen general";
    const fullName = body.full_name !== undefined ? body.full_name.trim() : existingUser.fullName;
    const cedula =
      body.cedula !== undefined
        ? (body.cedula ?? "").replace(/\D/g, "")
        : existingUser.cedula;
    const loginEmail =
      body.login_email !== undefined ? normalizeEmail(body.login_email) : existingUser.email;
    const email =
      body.email !== undefined
        ? body.email
          ? normalizeEmail(body.email)
          : ""
        : existingCompany.email ?? "";

    let dgiiEcfEndpointUpdate: { dgiiEcfEndpoint: string | null } | undefined;
    if (body.dgii_ecf_endpoint !== undefined) {
      const dgiiEndpointRaw = (body.dgii_ecf_endpoint ?? "").trim();
      const nextEndpoint = dgiiEndpointRaw ? dgiiEndpointRaw : null;
      if (nextEndpoint) {
        try {
          // eslint-disable-next-line no-new -- validación de URL absoluta
          new URL(nextEndpoint);
        } catch {
          return { ok: false, status: 400, message: "La URL de DGII debe ser una dirección válida (https://...)." };
        }
      }
      dgiiEcfEndpointUpdate = { dgiiEcfEndpoint: nextEndpoint };
    }

    const dgiiTenantMerge: Partial<
      Pick<
        Company,
        | "dgiiUsername"
        | "dgiiPasswordEnc"
        | "dgiiAuthUrl"
        | "dgiiReceptionUrl"
        | "dgiiConsultUrl"
        | "dgiiCommercialApprovalUrl"
        | "dgiiSeedUrl"
        | "dgiiValidateSeedUrl"
        | "dgiiEcfReceiveUrl"
        | "dgiiTrackUrl"
        | "dgiiStatusUrl"
        | "dgiiEnvironment"
        | "dgiiProdAuthUrl"
        | "dgiiProdSeedUrl"
        | "dgiiProdValidateSeedUrl"
        | "dgiiProdReceptionUrl"
        | "dgiiProdConsultUrl"
        | "dgiiProdCommercialApprovalUrl"
        | "dgiiProdConsumerSummaryUrl"
        | "certificatePath"
        | "certificatePassword"
      >
    > = {};

    if (body.dgii_username !== undefined) {
      dgiiTenantMerge.dgiiUsername = (body.dgii_username ?? "").trim() || null;
    }
    if (body.dgii_password !== undefined) {
      const rawDgiiPassword = (body.dgii_password ?? "").trim();
      dgiiTenantMerge.dgiiPasswordEnc = rawDgiiPassword
        ? encryptCompanySecret(rawDgiiPassword, existingCompany)
        : null;
    }
    const parseTenantUrl = (raw: string | undefined, label: string): AuthErr | string | null => {
      const t = normalizeDgiiEcfUrl(raw);
      if (!t) return null;
      try {
        // eslint-disable-next-line no-new -- validación de URL absoluta
        new URL(t);
      } catch {
        return { ok: false, status: 400, message: `La URL de ${label} no es válida (usa https://...).` };
      }
      return t;
    };
    if (body.dgii_auth_url !== undefined) {
      const v = parseTenantUrl(body.dgii_auth_url, "autenticación DGII");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiTenantMerge.dgiiAuthUrl = v === null || typeof v === "string" ? v : null;
    }
    if (body.dgii_reception_url !== undefined) {
      const v = parseTenantUrl(body.dgii_reception_url, "recepción DGII");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiTenantMerge.dgiiReceptionUrl = v === null || typeof v === "string" ? v : null;
    }
    if (body.dgii_consult_url !== undefined) {
      const v = parseTenantUrl(body.dgii_consult_url, "consulta DGII");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiTenantMerge.dgiiConsultUrl = v === null || typeof v === "string" ? v : null;
    }
    if (body.dgii_commercial_approval_url !== undefined) {
      const v = parseTenantUrl(body.dgii_commercial_approval_url, "aprobación comercial DGII");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiTenantMerge.dgiiCommercialApprovalUrl = v === null || typeof v === "string" ? v : null;
    }
    if (body.dgii_seed_url !== undefined) {
      const v = parseTenantUrl(body.dgii_seed_url, "semilla DGII");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiTenantMerge.dgiiSeedUrl = v === null || typeof v === "string" ? v : null;
    }
    if (body.dgii_validate_seed_url !== undefined) {
      const v = parseTenantUrl(body.dgii_validate_seed_url, "validar semilla DGII");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiTenantMerge.dgiiValidateSeedUrl = v === null || typeof v === "string" ? v : null;
    }
    if (body.dgii_ecf_receive_url !== undefined) {
      const v = parseTenantUrl(body.dgii_ecf_receive_url, "recepción e-CF DGII");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiTenantMerge.dgiiEcfReceiveUrl = v === null || typeof v === "string" ? v : null;
    }
    if (body.dgii_track_url !== undefined) {
      const v = parseTenantUrl(body.dgii_track_url, "track DGII");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiTenantMerge.dgiiTrackUrl = v === null || typeof v === "string" ? v : null;
    }
    if (body.dgii_status_url !== undefined) {
      const v = parseTenantUrl(body.dgii_status_url, "status DGII");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiTenantMerge.dgiiStatusUrl = v === null || typeof v === "string" ? v : null;
    }
    if (body.dgii_environment !== undefined) {
      const env = (body.dgii_environment ?? "").trim().toUpperCase();
      if (env !== "CERTIFICACION" && env !== "PRODUCCION") {
        return { ok: false, status: 400, message: "dgii_environment debe ser CERTIFICACION o PRODUCCION." };
      }
      dgiiTenantMerge.dgiiEnvironment = env;
    }
    if (body.dgii_prod_auth_url !== undefined) {
      const v = parseTenantUrl(body.dgii_prod_auth_url, "autenticación DGII (Producción)");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiTenantMerge.dgiiProdAuthUrl = v === null || typeof v === "string" ? v : null;
    }
    if (body.dgii_prod_seed_url !== undefined) {
      const v = parseTenantUrl(body.dgii_prod_seed_url, "semilla DGII (Producción)");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiTenantMerge.dgiiProdSeedUrl = v === null || typeof v === "string" ? v : null;
    }
    if (body.dgii_prod_validate_seed_url !== undefined) {
      const v = parseTenantUrl(body.dgii_prod_validate_seed_url, "validar semilla DGII (Producción)");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiTenantMerge.dgiiProdValidateSeedUrl = v === null || typeof v === "string" ? v : null;
    }
    if (body.dgii_prod_reception_url !== undefined) {
      const v = parseTenantUrl(body.dgii_prod_reception_url, "recepción DGII (Producción)");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiTenantMerge.dgiiProdReceptionUrl = v === null || typeof v === "string" ? v : null;
    }
    if (body.dgii_prod_consult_url !== undefined) {
      const v = parseTenantUrl(body.dgii_prod_consult_url, "consulta DGII (Producción)");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiTenantMerge.dgiiProdConsultUrl = v === null || typeof v === "string" ? v : null;
    }
    if (body.dgii_prod_commercial_approval_url !== undefined) {
      const v = parseTenantUrl(body.dgii_prod_commercial_approval_url, "aprobación comercial DGII (Producción)");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiTenantMerge.dgiiProdCommercialApprovalUrl = v === null || typeof v === "string" ? v : null;
    }
    if (body.dgii_prod_consumer_summary_url !== undefined) {
      const v = parseTenantUrl(body.dgii_prod_consumer_summary_url, "resúmenes de consumo DGII (Producción)");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiTenantMerge.dgiiProdConsumerSummaryUrl = v === null || typeof v === "string" ? v : null;
    }

    const dgiiPaso4Merge: Partial<
      Pick<
        Company,
        | "dgiiPaso4AuthUrl"
        | "dgiiPaso4ReceptionUrl"
        | "dgiiPaso4ConsultUrl"
        | "dgiiPaso4RfceUrl"
        | "dgiiPaso4Environment"
        | "dgiiPaso4SeedUrl"
        | "dgiiPaso4ValidateSeedUrl"
        | "dgiiPaso4EcfReceiveUrl"
      >
    > = {};

    if (body.dgii_paso4_auth_url !== undefined) {
      const v = parseTenantUrl(body.dgii_paso4_auth_url, "autenticación DGII (Paso 4)");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiPaso4Merge.dgiiPaso4AuthUrl = v === null || typeof v === "string" ? v : null;
    }
    if (body.dgii_paso4_reception_url !== undefined) {
      const v = parseTenantUrl(body.dgii_paso4_reception_url, "recepción e-CF (Paso 4)");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiPaso4Merge.dgiiPaso4ReceptionUrl = v === null || typeof v === "string" ? v : null;
    }
    if (body.dgii_paso4_consult_url !== undefined) {
      const v = parseTenantUrl(body.dgii_paso4_consult_url, "consulta de envío (Paso 4)");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiPaso4Merge.dgiiPaso4ConsultUrl = v === null || typeof v === "string" ? v : null;
    }
    if (body.dgii_paso4_rfce_url !== undefined) {
      const v = parseTenantUrl(body.dgii_paso4_rfce_url, "recepción resúmenes consumo (Paso 4)");
      if (v && typeof v === "object" && "ok" in v && v.ok === false) return v;
      dgiiPaso4Merge.dgiiPaso4RfceUrl = v === null || typeof v === "string" ? v : null;
    }
    if (body.dgii_paso4_environment !== undefined) {
      const env = (body.dgii_paso4_environment ?? "").trim().toUpperCase();
      if (env !== "CERTIFICACION" && env !== "PRODUCCION") {
        return {
          ok: false,
          status: 400,
          message: "dgii_paso4_environment debe ser CERTIFICACION o PRODUCCION.",
        };
      }
      dgiiPaso4Merge.dgiiPaso4Environment = env;
    }

    const hasPaso4InBody =
      body.dgii_paso4_auth_url !== undefined ||
      body.dgii_paso4_reception_url !== undefined ||
      body.dgii_paso4_consult_url !== undefined ||
      body.dgii_paso4_rfce_url !== undefined ||
      body.dgii_paso4_environment !== undefined;

    if (hasPaso4InBody) {
      const effAuth =
        body.dgii_paso4_auth_url !== undefined
          ? dgiiPaso4Merge.dgiiPaso4AuthUrl ?? null
          : existingCompany.dgiiPaso4AuthUrl;
      if (effAuth) {
        dgiiPaso4Merge.dgiiPaso4SeedUrl = paso4SeedUrlFromAuthBase(effAuth) || null;
        dgiiPaso4Merge.dgiiPaso4ValidateSeedUrl = paso4ValidateSeedUrlFromAuthBase(effAuth) || null;
      } else {
        dgiiPaso4Merge.dgiiPaso4SeedUrl = null;
        dgiiPaso4Merge.dgiiPaso4ValidateSeedUrl = null;
      }
      const effRec =
        body.dgii_paso4_reception_url !== undefined
          ? dgiiPaso4Merge.dgiiPaso4ReceptionUrl ?? null
          : existingCompany.dgiiPaso4ReceptionUrl;
      dgiiPaso4Merge.dgiiPaso4EcfReceiveUrl = effRec;
    }

    if (body.certificate_path !== undefined) {
      const p = (body.certificate_path ?? "").trim();
      dgiiTenantMerge.certificatePath = p || null;
    }
    if (body.certificate_password !== undefined) {
      const p = (body.certificate_password ?? "").trim();
      // Nunca guardamos contraseña en texto plano.
      dgiiTenantMerge.certificatePassword = p
        ? createHash("sha256").update(p).digest("hex")
        : null;
    }

    const ecfGatewayMerge: Partial<Pick<Company, "ecfGatewayBaseUrl" | "ecfGatewayApiKey">> = {};
    if (body.ecf_gateway_base_url !== undefined) {
      const raw = (body.ecf_gateway_base_url ?? "").trim().replace(/\/+$/, "");
      if (raw) {
        try {
          // eslint-disable-next-line no-new -- validación de URL absoluta
          new URL(raw);
        } catch {
          return {
            ok: false,
            status: 400,
            message: "La URL del DGII Communication Gateway debe ser una dirección válida (https://...).",
          };
        }
      }
      ecfGatewayMerge.ecfGatewayBaseUrl = raw || null;
    }
    if (body.ecf_gateway_api_key !== undefined) {
      ecfGatewayMerge.ecfGatewayApiKey = (body.ecf_gateway_api_key ?? "").trim() || null;
    }

    const smtpMerge: Partial<Pick<Company, "smtpEmail" | "smtpAppPasswordEnc">> = {};
    if (body.smtp_email !== undefined) {
      const smtpEmailRaw = (body.smtp_email ?? "").trim();
      if (smtpEmailRaw && !isValidEmailFormat(smtpEmailRaw)) {
        return { ok: false, status: 400, message: "El correo Gmail no es válido." };
      }
      smtpMerge.smtpEmail = smtpEmailRaw || null;
    }
    if (body.smtp_app_password !== undefined) {
      // Google lo muestra con espacios para legibilidad (ej. "abcd efgh ijkl mnop"), pero el
      // App Password real no los lleva -- guardarlos tal cual rompería la autenticación SMTP.
      const rawAppPassword = (body.smtp_app_password ?? "").replace(/\s+/g, "");
      smtpMerge.smtpAppPasswordEnc = rawAppPassword
        ? encryptCompanySecret(rawAppPassword, existingCompany)
        : null;
    }

    if (!name || !rnc || !address || !fullName || !cedula) {
      return {
        ok: false,
        status: 400,
        message: "Nombre, RNC, direccion, nombre de persona y cedula son obligatorios.",
      };
    }
    if (!isValidRnc(rnc)) {
      return { ok: false, status: 400, message: "El RNC debe tener 9 a 11 digitos." };
    }
    if (email && !isValidEmailFormat(email)) {
      return { ok: false, status: 400, message: "El correo de la empresa no es valido." };
    }
    if (phone && !isValidPhoneFormat(phone)) {
      return {
        ok: false,
        status: 400,
        message: "El telefono de la empresa debe tener formato xxx-xxx-xxxx.",
      };
    }
    if (!isValidCedula(cedula)) {
      return { ok: false, status: 400, message: "La cedula debe tener 11 digitos." };
    }
    if (body.login_email !== undefined && !isValidEmailFormat(loginEmail)) {
      return { ok: false, status: 400, message: "El correo de inicio de sesión no es válido." };
    }

    const existingRnc = await prisma.company.findUnique({ where: { rnc } });
    if (existingRnc && existingRnc.id !== companyId) {
      return { ok: false, status: 409, message: "Ya existe una empresa registrada con ese RNC." };
    }
    const existingCedula = await prisma.user.findUnique({ where: { cedula } });
    if (existingCedula && existingCedula.id !== userId) {
      return { ok: false, status: 409, message: "Ya existe una cuenta con esa cedula." };
    }
    if (body.login_email !== undefined) {
      const existingLoginEmail = await prisma.user.findUnique({ where: { email: loginEmail } });
      if (existingLoginEmail && existingLoginEmail.id !== userId) {
        return { ok: false, status: 409, message: "Ya existe una cuenta con ese correo." };
      }
    }

    let company: Company;
    let user: User;
    try {
      ({ company, user } = await prisma.$transaction(async (tx) => {
        const companyRow = await tx.company.update({
          where: { id: companyId },
          data: {
            name,
            rnc,
            address,
            phone: phone || null,
            email: email || null,
            regime: regime || "Régimen general",
            ...(dgiiEcfEndpointUpdate ?? {}),
            ...dgiiTenantMerge,
            ...(hasPaso4InBody ? dgiiPaso4Merge : {}),
            ...ecfGatewayMerge,
            ...smtpMerge,
            ...(appSecretsKeyUpdate !== undefined
              ? { appSecretsKeyEnc: appSecretsKeyUpdate }
              : {}),
          },
        });
        const userRow = await tx.user.update({
          where: { id: userId },
          data: {
            fullName,
            cedula,
            email: loginEmail,
          },
        });
        return { company: companyRow, user: userRow };
      }));
    } catch (e) {
      // Los checks de unicidad arriba (RNC/cedula/correo) corren bajo el rol de
      // Postgres de ESTA empresa: RLS les oculta las filas de otros tenants, asi
      // que una colision con OTRA empresa solo se detecta aqui, en el UNIQUE
      // constraint real (global, no sujeto a RLS). Bajo el pooler en modo
      // transaccion `meta.target` suele venir vacio, asi que el mensaje se
      // arma por `modelName` en vez del nombre exacto de columna.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = Array.isArray(e.meta?.target) ? e.meta.target.join(",") : String(e.meta?.target ?? "");
        const message = target.includes("email")
          ? "Ya existe una cuenta con ese correo."
          : target.includes("cedula")
            ? "Ya existe una cuenta con esa cedula."
            : target.includes("rnc")
              ? "Ya existe una empresa registrada con ese RNC."
              : e.meta?.modelName === "User"
                ? "Ya existe una cuenta con esa cedula o ese correo."
                : e.meta?.modelName === "Company"
                  ? "Ya existe una empresa registrada con ese RNC."
                  : "Ya existe un registro con ese valor.";
        return { ok: false, status: 409, message };
      }
      throw e;
    }

    let companyOut = company;
    const uploadsRoot = opts?.uploadsRoot;
    const file = opts?.logoFile;
    if (file?.buffer?.length && opts?.accessToken) {
      try {
        const publicUrl = await uploadCompanyLogoToBucket(opts.accessToken, file.buffer, file.mimetype);
        if (publicUrl) {
          companyOut = await prisma.company.update({
            where: { id: companyId },
            data: { logoUrl: publicUrl },
          });
        }
      } catch (e) {
        // 401 del signer (token vencido mientras se usaba esta pantalla) se
        // propaga tal cual para que el frontend lo trate como el resto de
        // 401: refresca la sesion y reintenta solo, en vez de ver un error.
        if (e instanceof LogoUploadError && e.status === 401) {
          return { ok: false, status: 401, message: "Sesion expirada. Vuelve a intentar." };
        }
        const msg = e instanceof Error ? e.message : "No se pudo subir el logo.";
        return { ok: false, status: 502, message: msg };
      }
    } else if (opts?.clearLogo && opts?.accessToken) {
      try {
        await removeCompanyLogoFromBucket(opts.accessToken);
        companyOut = await prisma.company.update({
          where: { id: companyId },
          data: { logoUrl: null },
        });
      } catch (e) {
        console.error("No se pudo quitar el logo de la empresa.", e);
      }
    }

    const signatureFile = opts?.signatureFile;
    if (signatureFile?.buffer?.length && opts?.accessToken) {
      try {
        const publicUrl = await uploadCompanySignatureToBucket(
          opts.accessToken,
          signatureFile.buffer,
          signatureFile.mimetype,
        );
        if (publicUrl) {
          companyOut = await prisma.company.update({
            where: { id: companyId },
            data: { signatureUrl: publicUrl },
          });
        }
      } catch (e) {
        console.error("No se pudo subir la firma de la empresa al bucket.", e);
      }
    } else if (signatureFile?.buffer?.length && uploadsRoot) {
      try {
        const relative = await saveCompanySignatureFile(
          uploadsRoot,
          companyId,
          signatureFile.buffer,
          signatureFile.mimetype,
        );
        if (relative) {
          companyOut = await prisma.company.update({
            where: { id: companyId },
            data: { signatureUrl: relative },
          });
        }
      } catch (e) {
        console.error("No se pudo guardar la firma de la empresa.", e);
      }
    } else if (opts?.clearSignature && opts?.accessToken) {
      try {
        await removeCompanySignatureFromBucket(opts.accessToken);
        companyOut = await prisma.company.update({
          where: { id: companyId },
          data: { signatureUrl: null },
        });
      } catch (e) {
        console.error("No se pudo quitar la firma de la empresa.", e);
      }
    } else if (opts?.clearSignature && uploadsRoot) {
      try {
        await removeUploadedCompanySignatureFiles(uploadsRoot, companyId);
        companyOut = await prisma.company.update({
          where: { id: companyId },
          data: { signatureUrl: null },
        });
      } catch (e) {
        console.error("No se pudo quitar la firma de la empresa.", e);
      }
    }

    const certUpload = opts?.certificateFile?.buffer;
    const certPwd = opts?.certificatePassword?.trim() ?? "";
    if (certUpload?.length && uploadsRoot) {
      if (!certPwd) {
        return {
          ok: false,
          status: 400,
          message: "Contraseña del certificado (.p12) obligatoria al subir el archivo.",
        };
      }
      let encryptionSecret: string;
      try {
        encryptionSecret = assertCertificateEncryptionSecret(opts?.certificateEncryptionSecret ?? "");
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : "Indicá una clave de cifrado para el certificado (mínimo 8 caracteres; la usarás cada vez que envíes e-CF).";
        return { ok: false, status: 400, message: msg };
      }
      try {
        const persisted = await encryptAndPersistCompanyCertificate({
          uploadsRoot,
          companyId,
          p12Buffer: certUpload,
          p12Password: certPwd,
          encryptionSecret,
        });
        companyOut = await prisma.company.update({
          where: { id: companyId },
          data: {
            certificateSalt: persisted.certificateSalt,
            certificateEncPath: persisted.certificateEncPath,
            certificatePasswordEnc: persisted.certificatePasswordEnc,
            certificateKeyphraseEnc: encryptCompanySecret(encryptionSecret, companyOut),
            certificateOriginalName: opts?.certificateFile?.originalname ?? null,
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "No se pudo guardar el certificado.";
        return { ok: false, status: 400, message: msg };
      }
    } else if (opts?.clearCertificate && uploadsRoot) {
      try {
        await removeStoredCompanyCertificate(uploadsRoot, companyId);
        companyOut = await prisma.company.update({
          where: { id: companyId },
          data: {
            certificateSalt: null,
            certificateEncPath: null,
            certificatePasswordEnc: null,
            certificateKeyphraseEnc: null,
            certificateOriginalName: null,
          },
        });
      } catch (e) {
        console.error("No se pudo eliminar certificado de empresa.", e);
      }
    }

    const pwdOnly = opts?.certificatePassword?.trim() ?? "";
    const encForPwdOnly = opts?.certificateEncryptionSecret?.trim() ?? "";
    /**
     * El formulario de Perfil de empresa precarga y reenvía esta clave en CADA guardado (no solo
     * cuando el usuario la cambia a propósito). Si el .p12 guardado quedó en un estado que ya no
     * coincide con la clave (p. ej. drift histórico), revalidar contra el archivo en cada guardado
     * bloqueaba TODO el perfil con "la clave no coincide" aunque el usuario solo quisiera cambiar
     * el teléfono. Comparar contra el valor ya persistido evita revalidar cuando no hay cambio real,
     * y si el usuario sí cambia la clave a propósito y no coincide, se avisa sin tumbar el resto del guardado.
     */
    const currentCertificateKeyphrase = (() => {
      try {
        return decryptCompanySecret(companyOut.certificateKeyphraseEnc, companyOut);
      } catch {
        return null;
      }
    })();
    let certificateWarning: string | undefined;
    if (
      !certUpload?.length &&
      uploadsRoot &&
      !companyHasCertificateRecord(companyOut) &&
      !opts?.clearCertificate &&
      (pwdOnly.length > 0 || encForPwdOnly.length > 0)
    ) {
      return {
        ok: false,
        status: 400,
        message: "No hay certificado guardado. Seleccioná un archivo .p12/.pfx y guardá para configurarlo.",
      };
    }
    if (
      !certUpload?.length &&
      pwdOnly &&
      encForPwdOnly &&
      uploadsRoot &&
      companyHasCertificateRecord(companyOut) &&
      !opts?.clearCertificate &&
      encForPwdOnly !== currentCertificateKeyphrase
    ) {
      try {
        const encryptionSecret = assertCertificateEncryptionSecret(encForPwdOnly);
        const loaded = await loadDecryptedPkcs12ForCompany(companyOut, uploadsRoot, encryptionSecret);
        if (loaded) {
          verifyPkcs12Password(loaded.p12Buffer, pwdOnly);
          const persisted = await encryptAndPersistCompanyCertificate({
            uploadsRoot,
            companyId,
            p12Buffer: loaded.p12Buffer,
            p12Password: pwdOnly,
            encryptionSecret,
          });
          companyOut = await prisma.company.update({
            where: { id: companyId },
            data: {
              certificateSalt: persisted.certificateSalt,
              certificateEncPath: persisted.certificateEncPath,
              certificatePasswordEnc: persisted.certificatePasswordEnc,
              certificateKeyphraseEnc: encryptCompanySecret(encryptionSecret, companyOut),
            },
          });
        }
      } catch (e) {
        console.error(
          "No se pudo actualizar la contraseña del certificado de empresa (se omite; el resto del perfil se guarda igual).",
          e,
        );
        certificateWarning =
          "No se pudo actualizar la contraseña del certificado con la clave de cifrado indicada. El resto del perfil se guardó; volvé a subir el .p12 para corregirlo.";
      }
    }

    if (body.certificate_keyphrase !== undefined && uploadsRoot) {
      const t = (body.certificate_keyphrase ?? "").trim();
      if (t.length > 0 && t.length < 8) {
        return {
          ok: false,
          status: 400,
          message: "La clave de cifrado guardada debe tener al menos 8 caracteres.",
        };
      }
      if (t.length >= 8 && t !== currentCertificateKeyphrase) {
        let canPersist = true;
        if (companyHasCertificateRecord(companyOut)) {
          try {
            await loadDecryptedPkcs12ForCompany(companyOut, uploadsRoot, t);
          } catch (e) {
            canPersist = false;
            console.error(
              "La clave de cifrado indicada no coincide con el certificado guardado (se omite; el resto del perfil se guarda igual).",
              e,
            );
            certificateWarning =
              "La clave de cifrado no coincide con el certificado guardado. El resto del perfil se guardó; volvé a subir el .p12 con esa clave para actualizarla.";
          }
        }
        if (canPersist) {
          companyOut = await prisma.company.update({
            where: { id: companyId },
            data: { certificateKeyphraseEnc: encryptCompanySecret(t, companyOut) },
          });
        }
      } else if (t.length === 0 && !companyHasCertificateRecord(companyOut)) {
        companyOut = await prisma.company.update({
          where: { id: companyId },
          data: { certificateKeyphraseEnc: null },
        });
      }
    }

    if (
      body.dgii_username !== undefined ||
      body.dgii_password !== undefined ||
      body.dgii_auth_url !== undefined ||
      body.dgii_reception_url !== undefined ||
      body.dgii_seed_url !== undefined ||
      body.dgii_validate_seed_url !== undefined ||
      body.dgii_ecf_receive_url !== undefined ||
      body.dgii_paso4_auth_url !== undefined
    ) {
      clearDgiiTokenCache(companyId);
      await prisma.company.update({
        where: { id: companyId },
        data: { tokenCache: null, tokenExpiration: null },
      });
    }

    return {
      ok: true,
      user: publicUser(user),
      company: publicCompany(companyOut),
      message: certificateWarning,
    };
  },

  async requestPasswordReset(
    body: ForgotPasswordBody,
  ): Promise<{ exists: boolean; reset_token?: string }> {
    const email = body.email ? normalizeEmail(body.email) : "";
    if (!email || !isValidEmailFormat(email)) {
      return { exists: false };
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return { exists: false };
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      prisma.passwordResetToken.create({
        data: { tokenHash, userId: user.id, companyId: user.companyId, expiresAt },
      }),
    ]);

    return { exists: true, reset_token: rawToken };
  },

  async resetPasswordWithToken(body: ResetPasswordBody): Promise<AuthErr | { ok: true }> {
    const tokenRaw = typeof body.token === "string" ? body.token.trim() : "";
    const password = typeof body.password === "string" ? body.password.trim() : "";

    if (!tokenRaw || !password) {
      return { ok: false, status: 400, message: "Token y contraseña nueva son obligatorios." };
    }
    if (!isValidPasswordLength(password)) {
      return {
        ok: false,
        status: 400,
        message: "La contraseña debe tener mínimo 8 caracteres.",
      };
    }

    const tokenHash = createHash("sha256").update(tokenRaw).digest("hex");

    const row = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!row || row.expiresAt < new Date()) {
      return {
        ok: false,
        status: 400,
        message:
          "Tu sesión de recuperación venció o no es válida. Volvé a ingresar el correo desde «Olvidé mi contraseña».",
      };
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.userId },
        data: { password: hashPassword(password) },
      }),
      prisma.passwordResetToken.deleteMany({ where: { userId: row.userId } }),
      prisma.refreshToken.deleteMany({ where: { userId: row.userId } }),
    ]);

    return { ok: true };
  },
};
