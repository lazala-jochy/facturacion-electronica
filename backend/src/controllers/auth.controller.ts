import "../types/express-auth.augment";
import path from "path";
import type { Express, Request, RequestHandler } from "express";
import { authService } from "../services/auth.service";
import { dgiiAuthService } from "../services/dgiiAuth.service";
import type { UpdateCompanyBody } from "../types/auth";
import { isAllowedLogoMime } from "../utils/companyLogo";
import { isAllowedSignatureMime } from "../utils/companySignature";
import { validateCertificateMulterFile } from "../utils/companyCertificateUpload";
import { getUploadsRoot } from "../utils/uploadsRoot";

const pickStr = (b: Record<string, unknown>, k: string): string | undefined =>
  typeof b[k] === "string" ? (b[k] as string) : undefined;

type MulterFields = { [fieldname: string]: Express.Multer.File[] } | undefined;

const readAuthFiles = (
  req: Request,
): {
  logo?: Express.Multer.File;
  certificate?: Express.Multer.File;
  signature?: Express.Multer.File;
} => {
  const map = req.files as MulterFields;
  const logo = map?.logo?.[0];
  const certificate = map?.certificate?.[0];
  const signature = map?.signature?.[0];
  return {
    ...(logo?.buffer?.length ? { logo } : {}),
    ...(certificate?.buffer?.length ? { certificate } : {}),
    ...(signature?.buffer?.length ? { signature } : {}),
  };
};

const updateCompanyBodyFromReq = (req: Request): UpdateCompanyBody => {
  const b = ((req.body as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  return {
    name: pickStr(b, "name"),
    rnc: pickStr(b, "rnc"),
    address: pickStr(b, "address"),
    phone: pickStr(b, "phone"),
    email: pickStr(b, "email"),
    regime: pickStr(b, "regime"),
    full_name: pickStr(b, "full_name"),
    cedula: pickStr(b, "cedula"),
    login_email: pickStr(b, "login_email"),
    dgii_ecf_endpoint: pickStr(b, "dgii_ecf_endpoint"),
    certificate_keyphrase: pickStr(b, "certificate_keyphrase"),
    app_secrets_key: pickStr(b, "app_secrets_key"),
    dgii_username: pickStr(b, "dgii_username"),
    dgii_password: pickStr(b, "dgii_password"),
    dgii_auth_url: pickStr(b, "dgii_auth_url"),
    dgii_reception_url: pickStr(b, "dgii_reception_url"),
    dgii_consult_url: pickStr(b, "dgii_consult_url"),
    dgii_commercial_approval_url: pickStr(b, "dgii_commercial_approval_url"),
    dgii_seed_url: pickStr(b, "dgii_seed_url"),
    dgii_validate_seed_url: pickStr(b, "dgii_validate_seed_url"),
    dgii_ecf_receive_url: pickStr(b, "dgii_ecf_receive_url"),
    dgii_track_url: pickStr(b, "dgii_track_url"),
    dgii_status_url: pickStr(b, "dgii_status_url"),
    dgii_environment: pickStr(b, "dgii_environment") as "CERTIFICACION" | "PRODUCCION" | undefined,
    dgii_prod_auth_url: pickStr(b, "dgii_prod_auth_url"),
    dgii_prod_seed_url: pickStr(b, "dgii_prod_seed_url"),
    dgii_prod_validate_seed_url: pickStr(b, "dgii_prod_validate_seed_url"),
    dgii_prod_reception_url: pickStr(b, "dgii_prod_reception_url"),
    dgii_prod_consult_url: pickStr(b, "dgii_prod_consult_url"),
    dgii_prod_commercial_approval_url: pickStr(b, "dgii_prod_commercial_approval_url"),
    dgii_prod_consumer_summary_url: pickStr(b, "dgii_prod_consumer_summary_url"),
    dgii_paso4_auth_url: pickStr(b, "dgii_paso4_auth_url"),
    dgii_paso4_reception_url: pickStr(b, "dgii_paso4_reception_url"),
    dgii_paso4_consult_url: pickStr(b, "dgii_paso4_consult_url"),
    dgii_paso4_rfce_url: pickStr(b, "dgii_paso4_rfce_url"),
    dgii_paso4_environment: pickStr(b, "dgii_paso4_environment") as "CERTIFICACION" | "PRODUCCION" | undefined,
    certificate_path: pickStr(b, "certificate_path"),
    certificate_password: pickStr(b, "certificate_password"),
    ecf_gateway_base_url: pickStr(b, "ecf_gateway_base_url"),
    ecf_gateway_api_key: pickStr(b, "ecf_gateway_api_key"),
    smtp_email: pickStr(b, "smtp_email"),
    smtp_app_password: pickStr(b, "smtp_app_password"),
  };
};

const wantsClearLogo = (req: Request): boolean => {
  const b = (req.body as Record<string, unknown>) ?? {};
  const v = b.clear_logo;
  return v === true || v === 1 || v === "1" || v === "true";
};

const wantsClearCertificate = (req: Request): boolean => {
  const b = (req.body as Record<string, unknown>) ?? {};
  const v = b.clear_certificate;
  return v === true || v === 1 || v === "1" || v === "true";
};

const wantsClearSignature = (req: Request): boolean => {
  const b = (req.body as Record<string, unknown>) ?? {};
  const v = b.clear_signature;
  return v === true || v === 1 || v === "1" || v === "true";
};

// register/login/forgot-password/reset-password viven en Supabase Edge
// Functions (supabase/functions/) -- ver backend/src/routes/index.ts.

export const refresh: RequestHandler = async (req, res) => {
  const result = await authService.refresh(req.body);
  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }
  res.json({
    message: "Sesion renovada.",
    token: result.token,
    refresh_token: result.refresh_token,
    user: result.user,
    company: result.company,
  });
};

export const me: RequestHandler = async (req, res) => {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }
  const result = await authService.me(auth.userId, auth.companyId);
  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }
  res.json({
    user: result.user,
    company: result.company,
  });
};

export const updateCompany: RequestHandler = async (req, res) => {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }

  try {
    const {
      logo: logoCandidate,
      certificate: certCandidate,
      signature: signatureCandidate,
    } = readAuthFiles(req);

    let logoFile = logoCandidate;
    if (logoFile && logoFile.buffer.length && !isAllowedLogoMime(logoFile.mimetype)) {
      res.status(400).json({
        message: "El logo debe ser PNG, JPG, GIF o WebP de hasta 2 MB.",
      });
      return;
    }
    if (logoFile && logoFile.buffer.length > 2 * 1024 * 1024) {
      res.status(400).json({ message: "El logo no puede superar 2 MB." });
      return;
    }
    if (logoFile && !logoFile.buffer.length) logoFile = undefined;

    let signatureFile = signatureCandidate;
    if (signatureFile && signatureFile.buffer.length && !isAllowedSignatureMime(signatureFile.mimetype)) {
      res.status(400).json({
        message: "La firma debe ser PNG, JPG, GIF o WebP de hasta 2 MB.",
      });
      return;
    }
    if (signatureFile && signatureFile.buffer.length > 2 * 1024 * 1024) {
      res.status(400).json({ message: "La firma no puede superar 2 MB." });
      return;
    }
    if (signatureFile && !signatureFile.buffer.length) signatureFile = undefined;

    let certificateMulter = certCandidate;
    if (certificateMulter) certificateMulter = validateCertificateMulterFile(certificateMulter);

    const body = updateCompanyBodyFromReq(req);
    const uploadsRoot = getUploadsRoot();
    const clearLogo = wantsClearLogo(req) && !logoCandidate?.buffer?.length;
    const clearCert = wantsClearCertificate(req) && !certificateMulter?.buffer?.length;
    const clearSignature = wantsClearSignature(req) && !signatureCandidate?.buffer?.length;

    const certificatePassword = pickStr(
      (req.body as Record<string, unknown>) ?? {},
      "certificate_password",
    );
    const certificateEncryptionSecret = pickStr(
      (req.body as Record<string, unknown>) ?? {},
      "certificate_encryption_secret",
    );

    const accessToken = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")?.[1];

    const result = await authService.updateCompany(auth.companyId, auth.userId, body, {
      logoFile: logoFile?.buffer?.length ? logoFile : undefined,
      certificateFile: certificateMulter?.buffer?.length ? certificateMulter : undefined,
      signatureFile: signatureFile?.buffer?.length ? signatureFile : undefined,
      certificatePassword,
      certificateEncryptionSecret,
      uploadsRoot,
      clearLogo,
      clearCertificate: clearCert,
      clearSignature,
      accessToken,
    });
    if (!result.ok) {
      res.status(result.status).json({ message: result.message });
      return;
    }

    res.json({
      message: result.message ?? "Perfil de empresa actualizado.",
      user: result.user,
      company: result.company,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Solicitud inválida.";
    res.status(400).json({ message: msg });
  }
};

export const testDgiiConnection: RequestHandler = async (req, res) => {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }
  try {
    const out = await dgiiAuthService.testConnection(auth.companyId);
    res.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al probar conexión DGII.";
    res.status(400).json({ message: msg });
  }
};
