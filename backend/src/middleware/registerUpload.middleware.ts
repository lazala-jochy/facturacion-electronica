import multer from "multer";

/** Opcional logo; formato validado en el controlador si viene archivo. */
export const registerLogoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});
