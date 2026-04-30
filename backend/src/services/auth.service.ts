import type { Company, User } from "@prisma/client";
import { prisma } from "../prisma";
import type { LoginBody, RegisterBody, UpdateCompanyBody } from "../types/auth";
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

export type AuthOk = {
  ok: true;
  token: string;
  user: {
    id: number;
    email: string;
    full_name: string;
    cedula: string;
  };
  company: Pick<Company, "id" | "name" | "rnc" | "address" | "phone" | "email">;
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
  company: Pick<Company, "id" | "name" | "rnc" | "address" | "phone" | "email">;
};

export type UpdateCompanyOk = {
  ok: true;
  user: {
    id: number;
    email: string;
    full_name: string;
    cedula: string;
  };
  company: Pick<Company, "id" | "name" | "rnc" | "address" | "phone" | "email">;
};

const publicCompany = (c: Company) => ({
  id: c.id,
  name: c.name,
  rnc: c.rnc,
  address: c.address,
  phone: c.phone,
  email: c.email,
});

const publicUser = (u: User) => ({
  id: u.id,
  email: u.email,
  full_name: u.fullName,
  cedula: u.cedula,
});

export const authService = {
  async register(body: RegisterBody): Promise<AuthOk | AuthErr> {
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

    const token = signSessionToken({
      sub: user.id,
      companyId: company.id,
      email: user.email,
    });

    return {
      ok: true,
      token,
      user: publicUser(user),
      company: publicCompany(company),
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

    return { ok: true, user: publicUser(user), company: publicCompany(company) };
  },
};
