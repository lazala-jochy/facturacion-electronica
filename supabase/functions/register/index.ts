// Unica via para crear una empresa nueva: corre con la credencial admin
// (bypassa RLS) porque todavia no existe ningun rol de Postgres para esta
// empresa. Crea Company + User + el rol dedicado, y devuelve el
// DATABASE_URL que el backend local va a usar de ahi en adelante.
//
// Replica la logica de backend/src/services/auth.service.ts#register, SIN
// la parte de certificado/logo (esos se suben despues contra el backend
// local, que ya tiene acceso a disco -- ver Fase 6 del plan).
import { createHash, randomBytes } from "node:crypto";
import { withAdminClient } from "../_shared/db.ts";
import { hashPassword } from "../_shared/crypto.ts";
import { signSessionToken } from "../_shared/jwt.ts";
import {
  isValidCedula,
  isValidEmailFormat,
  isValidPasswordLength,
  isValidPhoneFormat,
  isValidRnc,
  normalizeEmail,
} from "../_shared/validation.ts";
import { createTenantRole } from "../_shared/tenant.ts";
import { toPublicCompany } from "../_shared/publicCompany.ts";
import { json, handleOptions } from "../_shared/http.ts";

const REFRESH_TOKEN_DAYS = 30;

type RegisterBody = {
  name?: string;
  rnc?: string;
  address?: string;
  phone?: string;
  email?: string;
  full_name?: string;
  cedula?: string;
  user_email?: string;
  password?: string;
};

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ message: "Metodo no permitido." }, 405);

  let body: RegisterBody;
  try {
    body = await req.json();
  } catch {
    return json({ message: "Cuerpo JSON invalido." }, 400);
  }

  const name = body.name?.trim() ?? "";
  const rnc = (body.rnc ?? "").replace(/\D/g, "");
  const address = body.address?.trim() ?? "";
  const phone = body.phone?.trim() ?? "";
  const companyEmail = body.email?.trim() ?? "";
  const fullName = body.full_name?.trim() ?? "";
  const cedula = (body.cedula ?? "").replace(/\D/g, "");
  const userEmail = body.user_email ? normalizeEmail(body.user_email) : "";
  const password = body.password ?? "";

  if (!name || !rnc || !address || !fullName || !cedula || !userEmail || !password) {
    return json({ message: "Faltan campos obligatorios de empresa o usuario." }, 400);
  }
  if (!isValidRnc(rnc)) return json({ message: "RNC invalido (9 a 11 digitos)." }, 400);
  if (!isValidCedula(cedula)) return json({ message: "Cedula invalida (11 digitos)." }, 400);
  if (!isValidEmailFormat(userEmail)) return json({ message: "Correo de usuario invalido." }, 400);
  if (!isValidPasswordLength(password)) {
    return json({ message: "La contrasena debe tener al menos 8 caracteres." }, 400);
  }
  if (phone && !isValidPhoneFormat(phone)) {
    return json({ message: "Telefono invalido (formato 000-000-0000)." }, 400);
  }
  if (companyEmail && !isValidEmailFormat(companyEmail)) {
    return json({ message: "Correo de empresa invalido." }, 400);
  }

  try {
    return await withAdminClient(async (admin) => {
      const [existingEmail, existingRnc, existingCedula] = await Promise.all([
        admin.query(`SELECT 1 FROM users WHERE email = $1`, [userEmail]),
        admin.query(`SELECT 1 FROM companies WHERE rnc = $1`, [rnc]),
        admin.query(`SELECT 1 FROM users WHERE cedula = $1`, [cedula]),
      ]);
      if (existingEmail.rowCount) return json({ message: "Ese correo ya esta registrado." }, 409);
      if (existingRnc.rowCount) return json({ message: "Ese RNC ya esta registrado." }, 409);
      if (existingCedula.rowCount) return json({ message: "Esa cedula ya esta registrada." }, 409);

      await admin.query("BEGIN");
      let companyId: number;
      // deno-lint-ignore no-explicit-any
      let companyRowData: Record<string, any>;
      let userId: number;
      try {
        const companyRow = await admin.query(
          `INSERT INTO companies (name, rnc, address, phone, email)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [name, rnc, address, phone || null, companyEmail || null],
        );
        companyId = companyRow.rows[0].id;
        companyRowData = companyRow.rows[0];

        const userRow = await admin.query<{ id: number }>(
          `INSERT INTO users (full_name, cedula, email, password, company_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [fullName, cedula, userEmail, hashPassword(password), companyId],
        );
        userId = userRow.rows[0].id;

        await admin.query("COMMIT");
      } catch (e) {
        await admin.query("ROLLBACK");
        throw e;
      }

      const { databaseUrl, directUrl, appSecretsKey } = await createTenantRole(admin, companyId);

      const token = signSessionToken({ sub: userId, companyId, email: userEmail });
      const rawRefresh = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawRefresh).digest("hex");
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
      await admin.query(
        `INSERT INTO refresh_tokens (token_hash, user_id, company_id, expires_at) VALUES ($1, $2, $3, $4)`,
        [tokenHash, userId, companyId, expiresAt],
      );

      return json({
        ok: true,
        token,
        refresh_token: rawRefresh,
        database_url: databaseUrl,
        direct_url: directUrl,
        app_secrets_key: appSecretsKey,
        user: { id: userId, email: userEmail, full_name: fullName, cedula },
        company: toPublicCompany(companyRowData, appSecretsKey),
      });
    });
  } catch (e) {
    console.error("register error:", e);
    return json({ message: "No se pudo completar el registro." }, 500);
  }
});
