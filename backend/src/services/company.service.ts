import { prisma } from "../prisma";

export type CreateCompanyInput = {
  rnc: string;
  razonSocial: string;
  email: string;
  password: string;
  direccion: string;
};

export const createCompany = async (data: CreateCompanyInput) => {
  return prisma.company.create({ data });
};

export const getCompanies = async () => {
  return prisma.company.findMany();
};

export const findCompanyByEmail = async (email: string) => {
  return prisma.company.findFirst({
    where: { email },
  });
};

export const findCompanyByRnc = async (rnc: string) => {
  return prisma.company.findFirst({
    where: { rnc },
  });
};
