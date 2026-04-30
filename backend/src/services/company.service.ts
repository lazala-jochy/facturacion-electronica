import { companyRepository, type CreateCompanyData } from "../repositories/company.repository";

export type CreateCompanyInput = CreateCompanyData;

export const companyService = {
  create: (data: CreateCompanyInput) => companyRepository.create(data),

  list: () => companyRepository.findMany(),

  findByEmail: (email: string) => companyRepository.findByEmail(email),

  findByRnc: (rnc: string) => companyRepository.findByRnc(rnc),
};
