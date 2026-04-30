import { randomBytes } from "crypto";
import type { Company } from "@prisma/client";
import type { AuthBody } from "../types/auth";
import { normalizeEmail } from "../utils/email";
import { hashPassword, verifyPassword } from "../utils/password";
import {
  isValidEmailFormat,
  isValidPasswordLength,
  isValidRnc,
} from "../utils/validation";
import { companyService } from "./company.service";

export type RegisterSuccess = {
  ok: true;
  company: Pick<Company, "id" | "razonSocial" | "email" | "rnc" | "direccion">;
};

export type RegisterFailure = {
  ok: false;
  status: number;
  message: string;
};

export type RegisterResult = RegisterSuccess | RegisterFailure;

export type LoginSuccess = {
  ok: true;
  token: string;
  company: Pick<Company, "id" | "razonSocial" | "email" | "rnc" | "direccion">;
};

export type LoginFailure = {
  ok: false;
  status: number;
  message: string;
};

export type LoginResult = LoginSuccess | LoginFailure;

const publicCompanyFields = (company: Company) => ({
  id: company.id,
  razonSocial: company.razonSocial,
  email: company.email,
  rnc: company.rnc,
  direccion: company.direccion,
});

export const authService = {
  async register(body: AuthBody): Promise<RegisterResult> {
    const razonSocial = body.razonSocial?.trim();
    const direccion = body.direccion?.trim();
    const rnc = body.rnc?.trim();
    const email = body.email ? normalizeEmail(body.email) : "";
    const password = body.password?.trim() ?? "";

    if (!razonSocial || !rnc || !email || !password) {
      return { ok: false, status: 400, message: "Completa todos los campos requeridos." };
    }
    if (!isValidRnc(rnc)) {
      return { ok: false, status: 400, message: "El RNC debe tener 9 a 11 digitos." };
    }
    if (!isValidEmailFormat(email)) {
      return { ok: false, status: 400, message: "Correo electronico invalido." };
    }
    if (!isValidPasswordLength(password)) {
      return {
        ok: false,
        status: 400,
        message: "La contrasena debe tener minimo 8 caracteres.",
      };
    }

    const existing = await companyService.findByEmail(email);
    if (existing) {
      return { ok: false, status: 409, message: "Ya existe una cuenta con ese correo." };
    }
    const existingRnc = await companyService.findByRnc(rnc);
    if (existingRnc) {
      return { ok: false, status: 409, message: "Ya existe una cuenta con ese RNC." };
    }

    const company = await companyService.create({
      razonSocial,
      rnc,
      email,
      password: hashPassword(password),
      direccion: direccion ?? "",
    });

    return { ok: true, company: publicCompanyFields(company) };
  },

  async login(body: AuthBody): Promise<LoginResult> {
    const email = body.email ? normalizeEmail(body.email) : "";
    const password = body.password?.trim() ?? "";

    if (!email || !password) {
      return { ok: false, status: 400, message: "Correo y contrasena son obligatorios." };
    }

    const company = await companyService.findByEmail(email);
    if (!company || !verifyPassword(password, company.password)) {
      return { ok: false, status: 401, message: "Credenciales invalidas." };
    }

    return {
      ok: true,
      token: randomBytes(24).toString("hex"),
      company: publicCompanyFields(company),
    };
  },
};
