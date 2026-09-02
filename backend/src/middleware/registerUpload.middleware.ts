import multer from "multer";

/** Logo opcional hasta 2 MB (validación en controlador); certificado .p12 hasta 14 MB por archivo. */
export const authFormUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 14 * 1024 * 1024 },
}).fields([
  { name: "logo", maxCount: 1 },
  { name: "certificate", maxCount: 1 },
]);

/** Solo certificado en envío e-CF (opcional). */
export const ecfCertificateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 14 * 1024 * 1024 },
}).single("certificate");

/** Excel ACECF del set DGII (hasta 8 MB). */
export const acecfExcelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
}).single("excel");

/** Excel de pruebas e-CF (hojas eCF / rFCE, hasta 8 MB). */
export const ecfExcelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
}).single("excel");

/** Foto o PDF de factura de compra para extraer datos del 606 (hasta 10 MB). */
export const compra606DocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("document");

