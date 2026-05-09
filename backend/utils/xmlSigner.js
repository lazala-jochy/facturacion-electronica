/**
 * Firma XML e-CF (<ECF>) con PKCS#12: RSA-SHA256, C14N 20010315, enveloped, Reference URI="".
 */

const forge = require("node-forge");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

/** Canonicalización aplicada por DGII para esta firma (no exclusive). */
const C14N_20010315 = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";

const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SHA256_DIGEST = "http://www.w3.org/2001/04/xmlenc#sha256";
/** Raíz del comprobante electrónico. */
const ECF_ROOT_XPATH = "/*[local-name(.)='ECF']";
const DOTNET_SIGNER_PROJECT = path.join(process.cwd(), "dotnet", "DgiiXmlSigner", "DgiiXmlSigner.csproj");

/**
 * @returns {string}
 */
function findFirstP12Path(assetsDir) {
  if (!fs.existsSync(assetsDir)) {
    throw new Error(`Assets no existe: ${assetsDir}`);
  }
  const file = fs
    .readdirSync(assetsDir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .find((name) => {
      const l = name.toLowerCase();
      return l.endsWith(".p12") || l.endsWith(".pfx");
    });
  if (!file) throw new Error(`No se encontró .p12/.pfx en ${assetsDir}`);
  return path.join(assetsDir, file);
}

function compactCert(pem) {
  return pem
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "")
    .replace(/\s+/g, "");
}

/**
 * @param {Buffer} p12Buffer
 * @param {string} password
 * @returns {{ privateKeyPem: string; certPem: string }}
 */
function loadPkcs12MaterialFromBuffer(p12Buffer, password) {
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12Buffer.toString("binary")));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
  const keyBag =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];

  if (!keyBag?.key || !certBag?.cert) {
    throw new Error("El archivo .p12 no contiene par llave privada/certificado válido.");
  }

  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certPem: forge.pki.certificateToPem(certBag.cert),
  };
}

function signXmlEnvelope(xml, p12Buffer, passphrase) {
  loadPkcs12MaterialFromBuffer(p12Buffer, passphrase);
  if (!fs.existsSync(DOTNET_SIGNER_PROJECT)) {
    throw new Error(`No se encontró el firmador DGII .NET en ${DOTNET_SIGNER_PROJECT}.`);
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "dgii-ecf-xmlsign-"));
  const inputPath = path.join(workDir, "input.xml");
  const certPath = path.join(workDir, "certificate.p12");
  const passwordPath = path.join(workDir, "password.txt");
  const outputPath = path.join(workDir, "signed.xml");
  try {
    fs.writeFileSync(inputPath, xml.replace(/^\uFEFF/, ""), "utf8");
    fs.writeFileSync(certPath, p12Buffer);
    fs.writeFileSync(passwordPath, passphrase ?? "", "utf8");
    const result = spawnSync(
      "dotnet",
      ["run", "--project", DOTNET_SIGNER_PROJECT, "--", inputPath, certPath, passwordPath, outputPath, "modern-sha256"],
      { cwd: process.cwd(), encoding: "utf8", maxBuffer: 1024 * 1024 * 4 },
    );
    if (result.status !== 0) {
      const message = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
      throw new Error(`No se pudo firmar XML e-CF con el firmador DGII .NET. ${message}`);
    }
    return fs.readFileSync(outputPath, "utf8");
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup issues
    }
  }
}

/**
 * @param {string} xml
 * @param {string} assetsDir
 * @param {string} certPassword
 */
function signFacturaElectronica(xml, assetsDir, certPassword) {
  const p12Path = findFirstP12Path(assetsDir);
  const buf = fs.readFileSync(p12Path);
  return signXmlEnvelope(xml, buf, certPassword ?? "");
}

/**
 * @param {string} xml
 * @param {Buffer} p12Buffer
 * @param {string} p12Passphrase
 */
function signFacturaElectronicaFromBuffer(xml, p12Buffer, p12Passphrase) {
  if (!Buffer.isBuffer(p12Buffer)) {
    throw new Error("Buffer PKCS#12 inválido para firmar.");
  }
  return signXmlEnvelope(xml, p12Buffer, p12Passphrase ?? "");
}

module.exports = {
  ECF_ROOT_XPATH,
  C14N_20010315,
  findFirstP12Path,
  signFacturaElectronica,
  signFacturaElectronicaFromBuffer,
  signXmlEnvelope,
};
