/**
 * Tipos para `req.auth`. Sin `import "…"` para no emitir `require` en el JS compilado.
 * ts-node-dev carga este módulo antes de los controladores que usan `req.auth`.
 */
/// <reference types="express-serve-static-core" />

declare module "express-serve-static-core" {
  interface Request {
    auth?: {
      userId: number;
      companyId: number;
      email: string;
    };
  }
}

export {};
