import { prisma } from "../prisma";

export type CreateCompanyData = {
  rnc: string;
  razonSocial: string;
  email: string;
  password: string;
  direccion: string;
};

export const companyRepository = {
  create: (data: CreateCompanyData) => prisma.company.create({ data }),

  findMany: () => prisma.company.findMany(),

  findByEmail: (email: string) =>
    prisma.company.findFirst({
      where: { email },
    }),

  findByRnc: (rnc: string) =>
    prisma.company.findFirst({
      where: { rnc },
    }),
};
