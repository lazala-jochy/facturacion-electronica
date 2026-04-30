import path from "path";
import { pathToFileURL } from "url";
import { PrismaClient } from "@prisma/client";

/** DB por defecto junto a `schema.prisma`. `DATABASE_URL` (p. ej. Electron) la sustituye. */
const defaultSqliteUrl = () => {
  const dbFile = path.join(__dirname, "..", "prisma", "dev.db");
  return pathToFileURL(dbFile).href;
};

export const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL ?? defaultSqliteUrl(),
});
