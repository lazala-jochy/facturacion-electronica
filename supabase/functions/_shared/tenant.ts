// Aprovisiona el rol de Postgres dedicado de una empresa y arma el
// DATABASE_URL que esa instalacion va a usar directo con Prisma.
import type { Client } from "npm:pg@8";
import {
  decryptWithEdgeAdminKey,
  encryptWithEdgeAdminKey,
  generateAppSecretsKey,
  generateRolePassword,
} from "./crypto.ts";

const TENANT_TABLES = [
  "companies",
  "users",
  "clients",
  "cotizaciones",
  "cotizacion_items",
  "compras_606",
  "company_ecf_seq_counters",
  "refresh_tokens",
  "password_reset_tokens",
];

const roleNameFor = (companyId: number) => `tenant_${companyId}`;

/** El pooler de Supabase exige "<rol>.<project_ref>" como usuario para rutear al proyecto correcto. */
const getProjectRef = (): string => {
  const url = Deno.env.get("ADMIN_DATABASE_URL");
  if (!url) throw new Error("ADMIN_DATABASE_URL no esta configurada.");
  const username = new URL(url).username;
  const ref = username.split(".")[1];
  if (!ref) throw new Error(`No se pudo extraer el project_ref de ADMIN_DATABASE_URL (usuario: ${username}).`);
  return ref;
};

const buildScopedDatabaseUrl = (companyId: number, rolePassword: string): string => {
  const adminUrl = Deno.env.get("ADMIN_DATABASE_URL")!;
  const url = new URL(adminUrl);
  url.username = `${roleNameFor(companyId)}.${getProjectRef()}`;
  url.password = rolePassword;
  // Pooler en modo transaccion (6543): el que usa Prisma Client en runtime.
  url.port = "6543";
  url.searchParams.set("pgbouncer", "true");
  return url.toString();
};

const buildScopedDirectUrl = (companyId: number, rolePassword: string): string => {
  const adminUrl = Deno.env.get("ADMIN_DATABASE_URL")!;
  const url = new URL(adminUrl);
  url.username = `${roleNameFor(companyId)}.${getProjectRef()}`;
  url.password = rolePassword;
  url.port = "5432";
  return url.toString();
};

/** Crea el rol dedicado + grants + fila en tenant_roles para una empresa recien registrada. */
export const createTenantRole = async (
  admin: Client,
  companyId: number,
): Promise<{ databaseUrl: string; directUrl: string; appSecretsKey: string }> => {
  const role = roleNameFor(companyId);
  const password = generateRolePassword();
  const appSecretsKey = generateAppSecretsKey();

  await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password.replace(/'/g, "''")}'`);
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ${TENANT_TABLES.join(", ")} TO ${role}`,
  );
  // Las columnas autoincrementales (id SERIAL) usan una secuencia aparte --
  // GRANT INSERT en la tabla no alcanza, Postgres exige USAGE en la secuencia
  // tambien, o cualquier INSERT revienta con "permission denied for sequence".
  await admin.query(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
  );
  await admin.query(
    `INSERT INTO tenant_roles (role_name, company_id, role_password_enc, app_secrets_key_enc) VALUES ($1, $2, $3, $4)`,
    [role, companyId, encryptWithEdgeAdminKey(password), encryptWithEdgeAdminKey(appSecretsKey)],
  );

  return {
    databaseUrl: buildScopedDatabaseUrl(companyId, password),
    directUrl: buildScopedDirectUrl(companyId, password),
    appSecretsKey,
  };
};

/** Recupera el DATABASE_URL + appSecretsKey de una empresa ya existente (login en un dispositivo nuevo). */
export const getTenantDatabaseUrl = async (
  admin: Client,
  companyId: number,
): Promise<{ databaseUrl: string; directUrl: string; appSecretsKey: string }> => {
  const role = roleNameFor(companyId);
  const row = await admin.query<{ role_password_enc: string | null; app_secrets_key_enc: string | null }>(
    `SELECT role_password_enc, app_secrets_key_enc FROM tenant_roles WHERE role_name = $1`,
    [role],
  );
  const enc = row.rows[0]?.role_password_enc;
  const appSecretsKeyEnc = row.rows[0]?.app_secrets_key_enc;
  if (!enc || !appSecretsKeyEnc) {
    throw new Error(`No hay rol de Postgres registrado para la empresa ${companyId}.`);
  }
  const password = decryptWithEdgeAdminKey(enc);
  const appSecretsKey = decryptWithEdgeAdminKey(appSecretsKeyEnc);
  return {
    databaseUrl: buildScopedDatabaseUrl(companyId, password),
    directUrl: buildScopedDirectUrl(companyId, password),
    appSecretsKey,
  };
};
