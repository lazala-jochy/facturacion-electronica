import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Evita rechaziones no capturadas en rutas async (Express 4). */
export const asyncHandler = (fn: RequestHandler): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
};
