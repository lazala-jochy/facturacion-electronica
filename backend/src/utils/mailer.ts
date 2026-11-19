import fs from "fs/promises";
import type { Company } from "@prisma/client";

/**
 * SMTP (incl. Gmail) no funciona en Render: la plataforma bloquea todo tráfico SMTP saliente,
 * sin importar el puerto -- la conexión se queda colgada hasta hacer timeout. Resend envía
 * por HTTPS (igual que cualquier llamada a una API REST), así que sí atraviesa esa red.
 */
export class MailNotConfiguredError extends Error {}

type MailableCompany = Pick<Company, "name" | "smtpEmail">;

export type MailAttachment = {
  filename?: string;
  content?: Buffer;
  path?: string;
  contentType?: string;
  cid?: string;
};

const RESEND_API_URL = "https://api.resend.com/emails";

const resolveAttachmentContent = async (a: MailAttachment): Promise<string | undefined> => {
  if (a.content) return a.content.toString("base64");
  if (!a.path) return undefined;
  if (/^https?:\/\//i.test(a.path)) {
    const res = await fetch(a.path);
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  }
  return (await fs.readFile(a.path)).toString("base64");
};

/** Envía un correo vía la API de Resend, desde el remitente verificado de la cuenta (no el Gmail de la empresa). */
export async function sendCompanyEmail(
  company: MailableCompany,
  opts: { to: string; subject: string; html: string; attachments?: MailAttachment[] },
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !fromEmail) {
    throw new MailNotConfiguredError(
      "El envío de correo no está configurado en el servidor (RESEND_API_KEY / RESEND_FROM_EMAIL).",
    );
  }

  const attachments = await Promise.all(
    (opts.attachments ?? []).map(async (a) => ({
      filename: a.filename ?? "adjunto",
      content: await resolveAttachmentContent(a),
      ...(a.cid ? { content_id: a.cid } : {}),
    })),
  );

  const replyTo = company.smtpEmail?.trim() || undefined;

  let res: Response;
  try {
    res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${company.name} <${fromEmail}>`,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        attachments,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido.";
    throw new Error(`No se pudo contactar el servicio de correo (Resend). Detalle: ${msg}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`No se pudo enviar el correo (Resend respondió ${res.status}). Detalle: ${body}`);
  }
}
