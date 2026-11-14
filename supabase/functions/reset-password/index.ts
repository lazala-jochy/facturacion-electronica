// Igual que backend/src/services/auth.service.ts#resetPasswordWithToken,
// corriendo con la conexion admin (busca el token sin conocer de antemano
// la empresa).
import { createHash } from "node:crypto";
import { withAdminClient } from "../_shared/db.ts";
import { hashPassword } from "../_shared/crypto.ts";
import { isValidPasswordLength } from "../_shared/validation.ts";
import { json, handleOptions } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ message: "Metodo no permitido." }, 405);

  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ message: "Cuerpo JSON invalido." }, 400);
  }

  const tokenRaw = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password.trim() : "";

  if (!tokenRaw || !password) {
    return json({ message: "Token y contrasena nueva son obligatorios." }, 400);
  }
  if (!isValidPasswordLength(password)) {
    return json({ message: "La contrasena debe tener minimo 8 caracteres." }, 400);
  }

  const tokenHash = createHash("sha256").update(tokenRaw).digest("hex");

  try {
    return await withAdminClient(async (admin) => {
      const row = await admin.query<{ user_id: number; expires_at: Date }>(
        `SELECT user_id, expires_at FROM password_reset_tokens WHERE token_hash = $1`,
        [tokenHash],
      );
      const found = row.rows[0];
      if (!found || new Date(found.expires_at) < new Date()) {
        return json(
          {
            message:
              "Tu sesion de recuperacion vencio o no es valida. Volve a ingresar el correo desde «Olvide mi contrasena».",
          },
          400,
        );
      }

      await admin.query("BEGIN");
      try {
        await admin.query(`UPDATE users SET password = $1 WHERE id = $2`, [
          hashPassword(password),
          found.user_id,
        ]);
        await admin.query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [found.user_id]);
        await admin.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [found.user_id]);
        await admin.query("COMMIT");
      } catch (e) {
        await admin.query("ROLLBACK");
        throw e;
      }

      return json({ ok: true });
    });
  } catch (e) {
    console.error("reset-password error:", e);
    return json({ message: "No se pudo actualizar la contrasena." }, 500);
  }
});
