/**
 * Firma XML e-CF (<ECF>) con PKCS#12: RSA-SHA256, C14N 20010315, enveloped, Reference URI="".
 */

const forge = require("node-forge");
const { SignedXml } = require("xml-crypto");
const fs = require("fs");
const path = require("path");

/** Canonicalización aplicada por DGII para esta firma (no exclusive). */
const C14N_20010315 = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";

const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SHA256_DIGEST = "http://www.w3.org/2001/04/xmlenc#sha256";
const ENV_SIGNATURE = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

/** Raíz del comprobante electrónico. */
const ECF_ROOT_XPATH = "/*[local-name(.)='ECF']";

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

/**
 * Firma enveloped sobre <ECF>, Reference URI vacío (documento).
 * @param {string} xml
 * @param {Buffer} p12Buffer
 * @param {string} passphrase
 */
function signXmlEnvelope(xml, p12Buffer, passphrase) {
  const material = loadPkcs12MaterialFromBuffer(p12Buffer, passphrase);

  const sig = new SignedXml({
    privateKey: material.privateKeyPem,
    publicCert: material.certPem,
    canonicalizationAlgorithm: C14N_20010315,
    signatureAlgorithm: RSA_SHA256,
    getKeyInfoContent: () =>
      `<X509Data><X509Certificate>${compactCert(material.certPem)}</X509Certificate></X509Data>`,
  });

  sig.addReference({
    xpath: ECF_ROOT_XPATH,
    transforms: [ENV_SIGNATURE, C14N_20010315],
    digestAlgorithm: SHA256_DIGEST,
    isEmptyUri: true,
  });

  sig.computeSignature(xml, {
    location: { reference: ECF_ROOT_XPATH, action: "append" },
  });

  return sig.getSignedXml();
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
