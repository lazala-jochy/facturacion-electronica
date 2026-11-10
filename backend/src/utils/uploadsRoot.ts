import path from "path";

/**
 * En el empaquetado de Electron, `process.cwd()` apunta a los recursos de la
 * app (se reemplazan en cada actualizacion). `UPLOADS_DIR` lo inyecta el
 * proceso principal apuntando a una carpeta persistente en userData, igual
 * que la base de datos. Fuera de Electron (dev, tests) cae al default.
 */
export const getUploadsRoot = (): string =>
  process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), "uploads");
