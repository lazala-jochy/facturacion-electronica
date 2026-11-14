// Busca el usuario por email SIN conocer de antemano la empresa (solo la
// conexion admin puede ver a traves de todos los tenants). Devuelve el
// DATABASE_URL del rol ya existente de esa empresa junto con el JWT.
import { createHash, randomBytes } from "node:crypto";
import { withAdminClient } from "../_shared/db.ts";
import { verifyPassword } from "../_shared/crypto.ts";
import { signSessionToken } from "../_shared/jwt.ts";
import { normalizeEmail } from "../_shared/validation.ts";
import { getTenantDatabaseUrl } from "../_shared/tenant.ts";
import { toPublicCompany } from "../_shared/publicCompany.ts";
import { json, handleOptions } from "../_shared/http.ts";

const REFRESH_TOKEN_DAYS = 30;

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ message: "Metodo no permitido." }, 405);

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ message: "Cuerpo JSON invalido." }, 400);
  }

  const email = body.email ? normalizeEmail(body.email) : "";
  const password = body.password?.trim() ?? "";
  if (!email || !password) return json({ message: "Correo y contrasena son obligatorios." }, 400);

  try {
    return await withAdminClient(async (admin) => {
      const userRow = await admin.query<{
        id: number;
        full_name: string;
        cedula: string;
        email: string;
        password: string;
        company_id: number;
      }>(`SELECT id, full_name, cedula, email, password, company_id FROM users WHERE email = $1`, [email]);

      const user = userRow.rows[0];
      if (!user || !verifyPassword(password, user.password)) {
        return json({ message: "Correo o contrasena incorrectos." }, 401);
      }

      const { databaseUrl, directUrl, appSecretsKey } = await getTenantDatabaseUrl(admin, user.company_id);

      const companyRow = await admin.query(`SELECT * FROM companies WHERE id = $1`, [user.company_id]);
      const company = toPublicCompany(companyRow.rows[0], appSecretsKey);

      const token = signSessionToken({ sub: user.id, companyId: user.company_id, email: user.email });
      const rawRefresh = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawRefresh).digest("hex");
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

      await admin.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [user.id]);
      await admin.query(
        `INSERT INTO refresh_tokens (token_hash, user_id, company_id, expires_at) VALUES ($1, $2, $3, $4)`,
        [tokenHash, user.id, user.company_id, expiresAt],
      );

      return json({
        ok: true,
        token,
        refresh_token: rawRefresh,
        database_url: databaseUrl,
        direct_url: directUrl,
        app_secrets_key: appSecretsKey,
        user: { id: user.id, email: user.email, full_name: user.full_name, cedula: user.cedula },
        company,
      });
    });
  } catch (e) {
    console.error("login error:", e);
    return json({ message: "No se pudo iniciar sesion." }, 500);
  }
});
