/** Ambiente DGII vigente para una empresa: nunca se mezclan secuencias ni tokens entre ambos. */

export const DGII_ENVIRONMENTS = ["CERTIFICACION", "PRODUCCION"] as const;
export type DgiiEnvironment = (typeof DGII_ENVIRONMENTS)[number];

export const DEFAULT_DGII_ENVIRONMENT: DgiiEnvironment = "CERTIFICACION";

export const normalizeDgiiEnvironment = (raw: unknown): DgiiEnvironment =>
  raw === "PRODUCCION" ? "PRODUCCION" : DEFAULT_DGII_ENVIRONMENT;
