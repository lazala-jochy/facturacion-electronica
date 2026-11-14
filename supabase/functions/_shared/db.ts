// Conexion admin (bypassa RLS por ser el rol "postgres", dueno de tenant_roles).
// NUNCA se expone este connection string a ningun cliente instalado.
import { Client } from "npm:pg@8";

export const getAdminClient = (): Client => {
  const url = Deno.env.get("ADMIN_DATABASE_URL");
  if (!url) throw new Error("ADMIN_DATABASE_URL no esta configurada (supabase secrets set).");
  return new Client({ connectionString: url });
};

export const withAdminClient = async <T>(fn: (client: Client) => Promise<T>): Promise<T> => {
  const client = getAdminClient();
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
};
