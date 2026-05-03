import { createHash, randomBytes } from "crypto";
import type { Company, User } from "@prisma/client";
import { prisma } from "../prisma";
import type { ForgotPasswordBody, LoginBody, RegisterBody, ResetPasswordBody, UpdateCompanyBody } from "../types/auth";
import { assertCertificateEncryptionSecret } from "../utils/companyCertificateCrypto";
import {
  encryptAndPersistCompanyCertificate,
  companyHasCertificateRecord,
  removeStoredCompanyCertificate,
} from "../utils/companyCertificateStorage";
import { removeUploadedCompanyLogoFiles, saveCompanyLogoFile } from "../utils/companyLogo";
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

export type PublicCompany = Pick<Company, "id" | "name" | "rnc" | "address" | "phone" | "email" | "logoUrl"> & {
  certificateConfigured: boolean;
};

export type AuthOk = {
  ok: true;
  token: string;
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
};

const publicCompany = (c: Company): PublicCompany => ({
  id: c.id,
  name: c.name,
  rnc: c.rnc,
  address: c.address,
  phone: c.phone,
  email: c.email,
  logoUrl: c.logoUrl,
  certificateConfigured: companyHasCertificateRecord(c),
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
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "No se pudo guardar el certificado.";
        return { ok: false, status: 400, message: msg };
      }
    }

    const token = signSessionToken({
      sub: user.id,
      companyId: company.id,
      email: user.email,
    });

    return {
      ok: true,
      token,
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

    const token = signSessionToken({
      sub: user.id,
      companyId: user.companyId,
      email: user.email,
    });

    return {
      ok: true,
      token,
      user: publicUser(user),
      company: publicCompany(user.company),
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
      certificateFile?: { buffer: Buffer; mimetype?: string };
      certificatePassword?: string;
      certificateEncryptionSecret?: string;
      uploadsRoot?: string;
      clearLogo?: boolean;
      clearCertificate?: boolean;
    },
  ): Promise<UpdateCompanyOk | AuthErr> {
    const name = body.name?.trim() ?? "";
    const rnc = body.rnc?.trim() ?? "";
    const address = body.address?.trim() ?? "";
    const phone = body.phone?.trim() ?? "";
    const regime = body.regime?.trim() ?? "";
    const fullName = body.full_name?.trim() ?? "";
    const cedula = (body.cedula ?? "").replace(/\D/g, "");
    const email = body.email ? normalizeEmail(body.email) : "";

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

    const existingRnc = await prisma.company.findUnique({ where: { rnc } });
    if (existingRnc && existingRnc.id !== companyId) {
      return { ok: false, status: 409, message: "Ya existe una empresa registrada con ese RNC." };
    }
    const existingCedula = await prisma.user.findUnique({ where: { cedula } });
    if (existingCedula && existingCedula.id !== userId) {
      return { ok: false, status: 409, message: "Ya existe una cuenta con esa cedula." };
    }

    const { company, user } = await prisma.$transaction(async (tx) => {
      const companyRow = await tx.company.update({
        where: { id: companyId },
        data: {
          name,
          rnc,
          address,
          phone: phone || null,
          email: email || null,
          regime: regime || "Régimen general",
        },
      });
      const userRow = await tx.user.update({
        where: { id: userId },
        data: {
          fullName,
          cedula,
        },
      });
      return { company: companyRow, user: userRow };
    });

    let companyOut = company;
    const uploadsRoot = opts?.uploadsRoot;
    const file = opts?.logoFile;
    if (file?.buffer?.length && uploadsRoot) {
      try {
        const relative = await saveCompanyLogoFile(
          uploadsRoot,
          companyId,
          file.buffer,
          file.mimetype,
        );
        if (relative) {
          companyOut = await prisma.company.update({
            where: { id: companyId },
            data: { logoUrl: relative },
          });
        }
      } catch (e) {
        console.error("No se pudo actualizar el logo de la empresa.", e);
      }
    } else if (opts?.clearLogo && uploadsRoot) {
      try {
        await removeUploadedCompanyLogoFiles(uploadsRoot, companyId);
        companyOut = await prisma.company.update({
          where: { id: companyId },
          data: { logoUrl: null },
        });
      } catch (e) {
        console.error("No se pudo quitar el logo de la empresa.", e);
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
          },
        });
      } catch (e) {
        console.error("No se pudo eliminar certificado de empresa.", e);
      }
    }

    return { ok: true, user: publicUser(user), company: publicCompany(companyOut) };
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
        data: { tokenHash, userId: user.id, expiresAt },
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
    ]);

    return { ok: true };
  },
};
