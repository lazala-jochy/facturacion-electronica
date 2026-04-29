import { PrismaClient } from "@prisma/client";

const datasourceUrl = process.env.DATABASE_URL;

export const prisma = new PrismaClient({
  datasourceUrl,
});