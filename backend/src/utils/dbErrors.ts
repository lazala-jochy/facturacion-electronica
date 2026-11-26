import { Prisma } from "@prisma/client";

/**
 * Códigos de Prisma que indican que no se pudo ni abrir la conexión al servidor Postgres.
 * P2024 incluido a propósito: sin internet, el pool de conexiones no logra abrir ninguna nueva y
 * cualquier query en vuelo expira esperando una libre ("Timed out fetching a new connection from
 * the connection pool"), en vez de fallar de inmediato con P1001.
 */
const DB_UNREACHABLE_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);

/** True si el error es Prisma no pudiendo alcanzar la base de datos (ej. sin internet hacia Supabase). */
export const isDbUnreachableError = (err: unknown): boolean => {
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    DB_UNREACHABLE_CODES.has(err.code)
  ) {
    return true;
  }
  return false;
};
