import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const normalizeSqliteUrl = () => {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return;
  if (!raw.startsWith("file:./")) return;

  const relativeDbPath = raw.slice("file:./".length);
  const appRoot = path.resolve(__dirname, "..");
  const absoluteDbPath = path.resolve(appRoot, relativeDbPath);

  fs.mkdirSync(path.dirname(absoluteDbPath), { recursive: true });
  process.env.DATABASE_URL = `file:${absoluteDbPath}`;
};

normalizeSqliteUrl();

export const prisma = new PrismaClient();
