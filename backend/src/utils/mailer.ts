import nodemailer from "nodemailer";
import type { Company } from "@prisma/client";
import { decryptCompanySecret } from "./companyCertificateCrypto";

export class SmtpNotConfiguredError extends Error {}

type MailableCompany = Pick<Company, "id" | "appSecretsKeyEnc" | "smtpEmail" | "smtpAppPasswordEnc" | "name">;

/** Credenciales Gmail (SMTP) de la empresa, descifradas. Null si no hay correo configurado. */
export const resolveCompanySmtpCredentials = (
  company: MailableCompany,
): { user: string; pass: string } | null => {
  const user = company.smtpEmail?.trim();
  if (!user || !company.smtpAppPasswordEnc) return null;
  const pass = decryptCompanySecret(company.smtpAppPasswordEnc, company)?.trim() ?? "";
  if (!pass) return null;
  return { user, pass };
};

export type MailAttachment = {
  filename?: string;
  content?: Buffer;
  path?: string;
  contentType?: string;
  cid?: string;
};

/** Envía un correo desde la cuenta Gmail (App Password) configurada en Perfil de empresa. */
export async function sendCompanyEmail(
  company: MailableCompany,
  opts: { to: string; subject: string; html: string; attachments?: MailAttachment[] },
): Promise<void> {
  const creds = resolveCompanySmtpCredentials(company);
  if (!creds) {
    throw new SmtpNotConfiguredError(
      "No hay correo Gmail configurado para esta empresa. Guardá el correo y el App Password en Perfil de empresa antes de enviar.",
    );
  }
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: creds.user, pass: creds.pass },
  });
  try {
    await transporter.sendMail({
      from: `"${company.name}" <${creds.user}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido.";
    throw new Error(
      `No se pudo enviar el correo con la cuenta Gmail configurada. Verificá el correo y el App Password en Perfil de empresa. Detalle: ${msg}`,
    );
  }
}
