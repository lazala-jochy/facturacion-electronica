import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Company } from "@prisma/client";
import { prisma } from "../prisma";
import { DGII_ECF_SANDBOX_DEFAULTS } from "../config/dgiiEcf.constants";
import { DgiiEcfError } from "../types/dgiiEcf";
import { describeFetchFailure } from "./dgiiService";
import { signXmlWithP12Buffer, testCertificateCompatibility, type SignatureMode } from "./dgiiXmlSigner";
import { assertCertificateEncryptionSecret } from "../utils/companyCertificateCrypto";
import { loadDecryptedPkcs12ForCompany } from "../utils/companyCertificateStorage";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "dgii.log");
const DGII_AUTH_DUMP_DIR = path.join(LOG_DIR, "dgii-auth");
const DGII_SIGNATURE_LOG = path.join(LOG_DIR, "dgii-signature.log");
const DGII_AUTH_LOG = path.join(LOG_DIR, "dgii-auth.log");
const lastSuccessfulMode = new Map<number, SignatureMode>();

function appendDgiiLog(message: string): void {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const line = `${new Date().toISOString()} ${message}\n`;
    fs.appendFileSync(LOG_FILE, line, "utf8");
  } catch {
    // ignore log failures
  }
}

function appendSignatureFlowLog(message: string): void {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const line = `${new Date().toISOString()} ${message}\n`;
    fs.appendFileSync(DGII_SIGNATURE_LOG, line, "utf8");
  } catch {
    // ignore
  }
}

function appendAuthLog(message: string): void {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const line = `${new Date().toISOString()} ${message}\n`;
    fs.appendFileSync(DGII_AUTH_LOG, line, "utf8");
  } catch {
    // ignore
  }
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeDumpFile(dir: string, filename: string, content: string): void {
  try {
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, filename), content, "utf8");
  } catch {
    // no-op
  }
}

function requireUrl(raw: string, label: string): string {
  const t = raw.trim();
  try {
    const u = new URL(t);
    return u.toString();
  } catch {
    throw new DgiiEcfError(`La URL de ${label} no es válida.`, "AUTH_FAILED", 400);
  }
}

function compactBody(rawText: string, maxLen = 800): string {
  const oneLine = rawText.replace(/\s+/g, " ").trim();
  if (!oneLine) return "(cuerpo vacío)";
  return oneLine.length > maxLen ? `${oneLine.slice(0, maxLen)}…` : oneLine;
}

function extractToken(raw: string): string | null {
  const jwt = raw.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
  if (jwt?.[0]) return jwt[0];
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const candidates = ["token", "access_token", "jwt", "bearer"];
    for (const key of candidates) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {
    // non-json response
  }
  return null;
}

function extractSeedValue(seedResponse: string): string {
  const xmlTagMatch =
    seedResponse.match(/<(?:\w+:)?(?:Semilla|semilla)>\s*([^<\s]+)\s*<\/(?:\w+:)?(?:Semilla|semilla)>/i) ||
    seedResponse.match(/<(?:\w+:)?(?:valor|Valor|seed|Seed)>\s*([^<\s]+)\s*<\/(?:\w+:)?(?:valor|Valor|seed|Seed)>/i);
  if (xmlTagMatch?.[1]?.trim()) return xmlTagMatch[1].trim();

  const maybePlain = seedResponse.replace(/[\r\n\t ]+/g, "").trim();
  if (maybePlain && !maybePlain.startsWith("<")) return maybePlain;
  return "";
}

function buildSemillaXml(seedResponse: string): string {
  if (/^\uFEFF?\s*</.test(seedResponse)) return seedResponse;
  const value = extractSeedValue(seedResponse);
  if (!value) {
    throw new DgiiEcfError("No se pudo extraer el valor de la semilla DGII.", "TOKEN_PARSE");
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Semilla xmlns="http://ecf.dgii.gov.do/autenticacion">
  <Valor>${xmlEscape(value)}</Valor>
</Semilla>`;
}

function extractExpiration(raw: string): Date {
  const inSeconds = raw.match(/"expires_in"\s*:\s*(\d+)/i);
  if (inSeconds?.[1]) {
    const sec = Number(inSeconds[1]);
    if (Number.isFinite(sec) && sec > 0) return new Date(Date.now() + sec * 1000);
  }
  return new Date(Date.now() + 25 * 60 * 1000);
}

function resolveSeedUrl(company: Company): string {
  return requireUrl(
    company.dgiiSeedUrl?.trim() || DGII_ECF_SANDBOX_DEFAULTS.seed,
    "semilla DGII",
  );
}

function resolveValidateSeedUrl(company: Company): string {
  return requireUrl(
    company.dgiiValidateSeedUrl?.trim() || DGII_ECF_SANDBOX_DEFAULTS.validateSeed,
    "validación de semilla DGII",
  );
}

function xmlEscape(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function signSeedWithCompanyCertificate(
  company: Company,
): Promise<(seedXml: string, mode: SignatureMode) => Promise<string>> {
  const uploadsRoot = path.join(process.cwd(), "uploads");
  const encryptionSecret = assertCertificateEncryptionSecret(company.certificateKeyphrase ?? "");
  const loaded = await loadDecryptedPkcs12ForCompany(company, uploadsRoot, encryptionSecret);
  if (!loaded) {
    throw new DgiiEcfError(
      "No hay certificado DGII configurado para firmar semilla.",
      "MISSING_CREDENTIALS",
      428,
    );
  }
  return async (seedXml: string, mode: SignatureMode) =>
    signXmlWithP12Buffer(seedXml, loaded.p12Buffer, loaded.password, mode);
}

async function getSeed(company: Company): Promise<string> {
  const url = resolveSeedUrl(company);
  appendDgiiLog(`[auth] getSeed company=${company.id} url=${url}`);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/xml, text/xml, application/json, */*" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new DgiiEcfError(describeFetchFailure(e, url), "NETWORK");
  }
  const body = await response.text();
  if (!response.ok) {
    appendDgiiLog(`[auth] getSeed failed status=${response.status} body=${compactBody(body)}`);
    throw new DgiiEcfError(`DGII semilla HTTP ${response.status}: ${compactBody(body)}`, "AUTH_FAILED", response.status);
  }
  return body;
}

async function validateSeed(company: Company, signedXml: string): Promise<{ token: string; expiration: Date }> {
  const url = resolveValidateSeedUrl(company);
  const tmpRoot = path.join(os.tmpdir(), "dgii-auth-temp", `company-${company.id}`);
  ensureDir(tmpRoot);
  const tmpFile = path.join(tmpRoot, `signed-seed-${Date.now()}.xml`);
  fs.writeFileSync(tmpFile, signedXml, "utf8");
  appendAuthLog(`[validate] company=${company.id} multipart file=${tmpFile}`);
  try {
    const form = new FormData();
    const blob = new Blob([signedXml], { type: "text/xml" });
    form.append("xml", blob, "signed-seed.xml");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.text();
    appendAuthLog(`[validate] company=${company.id} status=${response.status} body=${compactBody(body, 1400)}`);
    if (!response.ok) {
      throw new DgiiEcfError(
        `DGII validación semilla HTTP ${response.status}: ${compactBody(body)}`,
        "AUTH_FAILED",
        response.status,
      );
    }
    const token = extractToken(body);
    if (!token) {
      throw new DgiiEcfError("No se pudo extraer token desde la respuesta de ValidarSemilla.", "TOKEN_PARSE");
    }
    return { token, expiration: extractExpiration(body) };
  } catch (e) {
    if (e instanceof DgiiEcfError) throw e;
    throw new DgiiEcfError(describeFetchFailure(e, url), "NETWORK");
  } finally {
    try {
      fs.unlinkSync(tmpFile);
      appendAuthLog(`[validate] company=${company.id} temp_deleted=${tmpFile}`);
    } catch {
      // ignore temp cleanup issues
    }
  }
}

export const dgiiAuthService = {
  async getSeed(company: Company): Promise<string> {
    return getSeed(company);
  },

  async signSeed(seedXml: string, certificatePath: string, password: string): Promise<string> {
    const xml = seedXml;
    const pathProvided = certificatePath.trim().length > 0;
    const pwdProvided = password.trim().length > 0;
    if (!pathProvided || !pwdProvided) {
      throw new DgiiEcfError("certificate_path y certificate_password son obligatorios para signSeed().", "MISSING_CREDENTIALS", 400);
    }
    const p12Buffer = fs.readFileSync(certificatePath);
    return signXmlWithP12Buffer(xml, p12Buffer, password, "modern-sha256");
  },

  async validateSeed(company: Company, signedXml: string): Promise<{ token: string; expiration: Date }> {
    return validateSeed(company, signedXml);
  },

  async getToken(companyId: number): Promise<string> {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new DgiiEcfError("Empresa no encontrada.", "MISSING_CREDENTIALS", 404);

    if (company.tokenCache && company.tokenExpiration && company.tokenExpiration.getTime() > Date.now() + 30_000) {
      return company.tokenCache;
    }

    appendDgiiLog(`[auth] token renewal company=${company.id}`);
    appendAuthLog(`[auth] token_renewal_start company=${company.id}`);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const attemptDir = path.join(DGII_AUTH_DUMP_DIR, `company-${company.id}`, stamp);
    ensureDir(attemptDir);
    writeDumpFile(attemptDir, "00-attempt.txt", `company=${company.id}\nstarted_at=${new Date().toISOString()}\n`);

    const seedRaw = await getSeed(company);
    writeDumpFile(attemptDir, "01-seed-raw.txt", seedRaw);

    const seedXml = buildSemillaXml(seedRaw);
    appendDgiiLog(`[auth] seed normalized to xml company=${company.id}`);
    writeDumpFile(attemptDir, "02-seed.xml", seedXml);

    appendDgiiLog(`[auth] signing seed company=${company.id}`);
    const signer = await signSeedWithCompanyCertificate(company);
    const signatureModes: SignatureMode[] = ["modern-sha256", "legacy-sha1"];
    let token = "";
    let expiration = new Date();
    let lastError: unknown = null;
    for (const signatureMode of signatureModes) {
      let signedSeed = "";
      try {
        appendSignatureFlowLog(`[auth] mode=${signatureMode} company=${company.id} signing_start`);
        appendAuthLog(`[auth] signing_mode company=${company.id} mode=${signatureMode}`);
        signedSeed = await signer(seedXml, signatureMode);
        writeDumpFile(attemptDir, `03-seed-signed-${signatureMode}.xml`, signedSeed);
        writeDumpFile(attemptDir, "03-seed-signed.xml", signedSeed);
        writeDumpFile(attemptDir, `04-validate-payload-${signatureMode}-multipart-note.txt`, "multipart/form-data field=xml filename=signed-seed.xml type=text/xml");
        const out = await validateSeed(company, signedSeed);
        token = out.token;
        expiration = out.expiration;
        lastSuccessfulMode.set(company.id, signatureMode);
        appendSignatureFlowLog(`[auth] mode=${signatureMode} company=${company.id} validate_ok`);
        appendAuthLog(`[auth] token_success company=${company.id} mode=${signatureMode}`);
        break;
      } catch (e) {
        lastError = e;
        const msg = e instanceof Error ? e.stack || e.message : String(e);
        appendSignatureFlowLog(
          `[auth] mode=${signatureMode} company=${company.id} failed=${compactBody(msg, 1600)}`,
        );
        appendAuthLog(`[auth] token_fail company=${company.id} mode=${signatureMode} error=${compactBody(msg, 1200)}`);
        writeDumpFile(attemptDir, `03-sign-error-${signatureMode}.txt`, msg);
      }
    }
    if (!token) {
      const msg = lastError instanceof Error ? lastError.message : "No se pudo validar semilla.";
      throw new DgiiEcfError(msg, "AUTH_FAILED", 400);
    }

    await prisma.company.update({
      where: { id: company.id },
      data: {
        tokenCache: token,
        tokenExpiration: expiration,
      },
    });
    appendDgiiLog(`[auth] token refreshed company=${company.id} exp=${expiration.toISOString()}`);
    return token;
  },

  async testConnection(companyId: number): Promise<{
    seedOk: boolean;
    tokenOk: boolean;
    message: string;
    certificate?: {
      subject: string;
      issuer: string;
      validFrom: string;
      validUntil: string;
      chainCount: number;
      privateKey: boolean;
      signatureTestPassed: boolean;
      validNow: boolean;
    };
    signatureModeUsed?: SignatureMode;
  }> {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new DgiiEcfError("Empresa no encontrada.", "MISSING_CREDENTIALS", 404);
    await getSeed(company);
    let certInfo:
      | {
          subject: string;
          issuer: string;
          validFrom: string;
          validUntil: string;
          chainCount: number;
          privateKey: boolean;
          signatureTestPassed: boolean;
          validNow: boolean;
        }
      | undefined;
    try {
      const uploadsRoot = path.join(process.cwd(), "uploads");
      const encryptionSecret = assertCertificateEncryptionSecret(company.certificateKeyphrase ?? "");
      const loaded = await loadDecryptedPkcs12ForCompany(company, uploadsRoot, encryptionSecret);
      if (loaded) {
        const t = await testCertificateCompatibility(loaded.p12Buffer, loaded.password);
        certInfo = {
          subject: t.subject,
          issuer: t.issuer,
          validFrom: t.notBefore,
          validUntil: t.notAfter,
          chainCount: t.chainCount,
          privateKey: t.privateKeyExists,
          signatureTestPassed: t.signatureTestPassed,
          validNow: t.validNow,
        };
      }
    } catch {
      // leave undefined if cert diagnostics fails
    }
    try {
      await this.getToken(companyId);
      return {
        seedOk: true,
        tokenOk: true,
        message: "Semilla y token DGII obtenidos correctamente.",
        signatureModeUsed: lastSuccessfulMode.get(companyId),
        ...(certInfo ? { certificate: certInfo } : {}),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Semilla OK, pero token no disponible.";
      return {
        seedOk: true,
        tokenOk: false,
        message: msg,
        signatureModeUsed: lastSuccessfulMode.get(companyId),
        ...(certInfo ? { certificate: certInfo } : {}),
      };
    }
  },
};
