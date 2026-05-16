import "../types/express-auth.augment";
import path from "path";
import type { Express, Request, RequestHandler } from "express";
import { authService } from "../services/auth.service";
import { dgiiAuthService } from "../services/dgiiAuth.service";
import type { ForgotPasswordBody, RegisterBody, ResetPasswordBody, UpdateCompanyBody } from "../types/auth";
import { isAllowedLogoMime } from "../utils/companyLogo";
import { validateCertificateMulterFile } from "../utils/companyCertificateUpload";

const pickStr = (b: Record<string, unknown>, k: string): string | undefined =>
  typeof b[k] === "string" ? (b[k] as string) : undefined;

type MulterFields = { [fieldname: string]: Express.Multer.File[] } | undefined;

const readAuthFiles = (
  req: Request,
): { logo?: Express.Multer.File; certificate?: Express.Multer.File } => {
  const map = req.files as MulterFields;
  const logo = map?.logo?.[0];
  const certificate = map?.certificate?.[0];
  return {
    ...(logo?.buffer?.length ? { logo } : {}),
    ...(certificate?.buffer?.length ? { certificate } : {}),
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
    dgii_ecf_endpoint: pickStr(b, "dgii_ecf_endpoint"),
    certificate_keyphrase: pickStr(b, "certificate_keyphrase"),
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
    dgii_paso4_auth_url: pickStr(b, "dgii_paso4_auth_url"),
    dgii_paso4_reception_url: pickStr(b, "dgii_paso4_reception_url"),
    dgii_paso4_consult_url: pickStr(b, "dgii_paso4_consult_url"),
    dgii_paso4_rfce_url: pickStr(b, "dgii_paso4_rfce_url"),
    dgii_paso4_environment: pickStr(b, "dgii_paso4_environment") as "CERTIFICACION" | "PRODUCCION" | undefined,
    certificate_path: pickStr(b, "certificate_path"),
    certificate_password: pickStr(b, "certificate_password"),
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

export const register: RequestHandler = async (req, res) => {
  try {
    const { logo: logoFileRaw, certificate: certRaw } = readAuthFiles(req);
    let certificateFile = certRaw;
    if (certificateFile) certificateFile = validateCertificateMulterFile(certificateFile);
    let logoCandidate = logoFileRaw;
    if (logoCandidate && logoCandidate.buffer.length && !isAllowedLogoMime(logoCandidate.mimetype)) {
      res.status(400).json({
        message: "El logo debe ser PNG, JPG, GIF o WebP de hasta 2 MB.",
      });
      return;
    }
    if (logoCandidate && logoCandidate.buffer.length > 2 * 1024 * 1024) {
      res.status(400).json({ message: "El logo no puede superar 2 MB." });
      return;
    }
    if (logoCandidate && !logoCandidate.buffer.length) logoCandidate = undefined;

    const uploadsRoot = path.join(process.cwd(), "uploads");
    const body = req.body as RegisterBody & { certificate_password?: string };
    const certificatePassword = pickStr(
      (req.body as Record<string, unknown>) ?? {},
      "certificate_password",
    );
    const certificateEncryptionSecret = pickStr(
      (req.body as Record<string, unknown>) ?? {},
      "certificate_encryption_secret",
    );

    const result = await authService.register(body, {
      logoFile: logoCandidate?.buffer?.length ? logoCandidate : undefined,
      certificateFile: certificateFile?.buffer?.length ? certificateFile : undefined,
      certificatePassword,
      certificateEncryptionSecret,
      uploadsRoot,
    });
    if (!result.ok) {
      res.status(result.status).json({ message: result.message });
      return;
    }
    res.status(201).json({
      message: "Cuenta creada correctamente.",
      token: result.token,
      refresh_token: result.refresh_token,
      user: result.user,
      company: result.company,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Solicitud inválida.";
    res.status(400).json({ message: msg });
  }
};

export const login: RequestHandler = async (req, res) => {
  const result = await authService.login(req.body);
  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }
  res.json({
    message: "Inicio de sesion exitoso.",
    token: result.token,
    refresh_token: result.refresh_token,
    user: result.user,
    company: result.company,
  });
};

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

export const forgotPassword: RequestHandler = async (req, res) => {
  const result = await authService.requestPasswordReset(req.body as ForgotPasswordBody);
  res.json(result);
};

export const resetPassword: RequestHandler = async (req, res) => {
  const result = await authService.resetPasswordWithToken(req.body as ResetPasswordBody);
  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }
  res.json({ message: "Contraseña actualizada. Ya podés iniciar sesión." });
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
    const { logo: logoCandidate, certificate: certCandidate } = readAuthFiles(req);

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

    let certificateMulter = certCandidate;
    if (certificateMulter) certificateMulter = validateCertificateMulterFile(certificateMulter);

    const body = updateCompanyBodyFromReq(req);
    const uploadsRoot = path.join(process.cwd(), "uploads");
    const clearLogo = wantsClearLogo(req) && !logoCandidate?.buffer?.length;
    const clearCert = wantsClearCertificate(req) && !certificateMulter?.buffer?.length;

    const certificatePassword = pickStr(
      (req.body as Record<string, unknown>) ?? {},
      "certificate_password",
    );
    const certificateEncryptionSecret = pickStr(
      (req.body as Record<string, unknown>) ?? {},
      "certificate_encryption_secret",
    );

    const result = await authService.updateCompany(auth.companyId, auth.userId, body, {
      logoFile: logoFile?.buffer?.length ? logoFile : undefined,
      certificateFile: certificateMulter?.buffer?.length ? certificateMulter : undefined,
      certificatePassword,
      certificateEncryptionSecret,
      uploadsRoot,
      clearLogo,
      clearCertificate: clearCert,
    });
    if (!result.ok) {
      res.status(result.status).json({ message: result.message });
      return;
    }

    res.json({
      message: "Perfil de empresa actualizado.",
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
