import { PrismaClient } from "@prisma/client";

// DATABASE_URL apunta al rol de Postgres propio de esta empresa en Supabase
// (obtenido al hacer login/registro, ver electron/src/main.ts) — ya viene
// resuelto en process.env cuando Electron spawnea este proceso.
export const prisma = new PrismaClient();
