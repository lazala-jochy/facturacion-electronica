// Igual que backend/src/services/auth.service.ts#requestPasswordReset, pero
// corriendo con la conexion admin (necesita ver PasswordResetToken sin
// conocer de antemano la empresa del usuario).
import { createHash, randomBytes } from "node:crypto";
import { withAdminClient } from "../_shared/db.ts";
import { isValidEmailFormat, normalizeEmail } from "../_shared/validation.ts";
import { json, handleOptions } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ message: "Metodo no permitido." }, 405);

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return json({ exists: false });
  }

  const email = body.email ? normalizeEmail(body.email) : "";
  if (!email || !isValidEmailFormat(email)) return json({ exists: false });

  try {
    return await withAdminClient(async (admin) => {
      const userRow = await admin.query<{ id: number; company_id: number }>(
        `SELECT id, company_id FROM users WHERE email = $1`,
        [email],
      );
      const user = userRow.rows[0];
      if (!user) return json({ exists: false });

      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await admin.query("BEGIN");
      try {
        await admin.query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [user.id]);
        await admin.query(
          `INSERT INTO password_reset_tokens (token_hash, user_id, company_id, expires_at) VALUES ($1, $2, $3, $4)`,
          [tokenHash, user.id, user.company_id, expiresAt],
        );
        await admin.query("COMMIT");
      } catch (e) {
        await admin.query("ROLLBACK");
        throw e;
      }

      // Mismo comportamiento que auth.service.ts#requestPasswordReset hoy:
      // no envia correo, devuelve el token directo en la respuesta.
      return json({ exists: true, reset_token: rawToken });
    });
  } catch (e) {
    console.error("forgot-password error:", e);
    return json({ exists: false });
  }
});
