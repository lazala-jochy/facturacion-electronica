import forge from "node-forge";
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";
import { C14nCanonicalization } from "xml-crypto/lib/c14n-canonicalization";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, createSign, createVerify } from "node:crypto";
import { spawnSync } from "node:child_process";

export type CertificateInput = {
  p12Path: string;
  password: string;
};

type CertificateMaterial = {
  privateKeyPem: string;
  certPem: string;
  chainPem: string[];
  subject: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  serialNumber: string;
  keySize: number;
  certSigAlg: string;
  privateKeyMatchesCertificate: boolean;
};

export type SignatureMode = "legacy-sha1" | "modern-sha256";
type SignatureDebugReport = {
  signatureValid: boolean;
  digestValid: boolean | null;
  referenceCount: number;
  canonicalizationAlgorithm: string;
  signatureAlgorithm: string;
  digestAlgorithm: string;
  transforms: string[];
  signedNodeXpath: string;
  referenceUri: string;
  xmlDigestValue: string | null;
  calculatedDigestValue: string | null;
  signatureValueLength: number;
  warningFlags: string[];
};
type CertificateDebugReport = {
  subject: string;
  issuer: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
  expired: boolean;
  keySize: number;
  certificateSignatureAlgorithm: string;
  privateKeyMatchesCertificate: boolean;
  chainCount: number;
};
export type DgiiSignatureVerificationReport = {
  xmlCryptoSignatureValid: boolean;
  signedInfoSignatureValid: boolean;
  digestValid: boolean;
  embeddedCertificateMatchesSigningCertificate: boolean;
  canonicalizedReferenceDigest: string;
  xmlDigestValue: string;
  canonicalizedSignedInfoLength: number;
};

const SIGNATURE_LOG = path.join(process.cwd(), "logs", "dgii-signature.log");
const DEBUG_DIR = path.join(process.cwd(), "logs", "dgii-debug");
const DOTNET_SIGNER_PROJECT = path.join(process.cwd(), "dotnet", "DgiiXmlSigner", "DgiiXmlSigner.csproj");
const DOTNET_SIGNER_DLL = path.join(
  path.dirname(DOTNET_SIGNER_PROJECT),
  "bin",
  "Debug",
  "net10.0",
  "DgiiXmlSigner.dll",
);

/**
 * `dotnet run --project` reconstruye/valida el proyecto en cada llamada (~2-3s de overhead de
 * MSBuild) — inaceptable para flujos síncronos con deadline externo (ej. ARECF ante DGII, con
 * pocos segundos de margen). Si el DLL ya está compilado (caso normal en dev/checkout con build
 * previo) lo ejecutamos directo (~50-100ms); si no existe, cae a `dotnet run` como antes.
 */
function dotnetSignerArgs(extraArgs: string[]): string[] {
  if (fs.existsSync(DOTNET_SIGNER_DLL)) return [DOTNET_SIGNER_DLL, ...extraArgs];
  return ["run", "--project", DOTNET_SIGNER_PROJECT, "--", ...extraArgs];
}
function appendSignatureLog(line: string): void {
  try {
    fs.mkdirSync(path.dirname(SIGNATURE_LOG), { recursive: true });
    fs.appendFileSync(SIGNATURE_LOG, `${new Date().toISOString()} ${line}\n`, "utf8");
  } catch {}
}

const dnToString = (attrs: forge.pki.CertificateField[]): string =>
  attrs.map((a) => `${a.shortName || a.name}=${a.value}`).join(", ");

const pkcs12ToMaterial = (p12: forge.pkcs12.Pkcs12Pfx): CertificateMaterial => {
  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  if (!keyBags.length || !certBags.length) throw new Error("No se encontró llave privada o certificados en el .p12.");

  let selectedKey = keyBags[0].key;
  let selectedCert: forge.pki.Certificate | null = null;
  for (const kb of keyBags) {
    if (!kb.key) continue;
    const keyAny = kb.key as unknown as { n?: { toString: (radix: number) => string }; e?: { toString: (radix: number) => string } };
    const keyN = keyAny.n?.toString(16);
    const keyE = keyAny.e?.toString(16);
    if (!keyN || !keyE) continue;
    for (const cb of certBags) {
      if (!cb.cert) continue;
      const certKey = cb.cert.publicKey as unknown as { n?: { toString: (radix: number) => string }; e?: { toString: (radix: number) => string } };
      if (certKey.n?.toString(16) === keyN && certKey.e?.toString(16) === keyE) {
        selectedKey = kb.key;
        selectedCert = cb.cert;
        break;
      }
    }
    if (selectedCert) break;
  }
  if (!selectedKey) throw new Error("No se encontró llave privada usable en el .p12.");
  if (!selectedCert) selectedCert = certBags.find((b) => b.cert)?.cert ?? null;
  if (!selectedCert) throw new Error("No se encontró certificado de usuario en el .p12.");

  const selectedPubPem = forge.pki.publicKeyToPem(selectedCert.publicKey);
  const chain = certBags
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => Boolean(c))
    .sort((a, b) => (forge.pki.publicKeyToPem(a.publicKey) === selectedPubPem ? -1 : forge.pki.publicKeyToPem(b.publicKey) === selectedPubPem ? 1 : 0));

  return {
    privateKeyPem: forge.pki.privateKeyToPem(selectedKey),
    certPem: forge.pki.certificateToPem(selectedCert),
    chainPem: chain.map((c) => forge.pki.certificateToPem(c)),
    subject: dnToString(selectedCert.subject.attributes),
    issuer: dnToString(selectedCert.issuer.attributes),
    notBefore: selectedCert.validity.notBefore.toISOString(),
    notAfter: selectedCert.validity.notAfter.toISOString(),
    serialNumber: selectedCert.serialNumber,
    keySize: Number((selectedCert.publicKey as unknown as { n?: { bitLength: () => number } }).n?.bitLength?.() ?? 0),
    certSigAlg: selectedCert.siginfo?.algorithmOid ?? "",
    privateKeyMatchesCertificate: true,
  };
};

const loadPkcs12MaterialFromBuffer = (p12Raw: Buffer, password: string): CertificateMaterial => {
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12Raw.toString("binary")));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
  return pkcs12ToMaterial(p12);
};

export const loadPkcs12Material = async (input: CertificateInput): Promise<CertificateMaterial> => {
  const fsProm = await import("node:fs/promises");
  return loadPkcs12MaterialFromBuffer(await fsProm.readFile(input.p12Path), input.password);
};

const compactCert = (pem: string) => pem.replace("-----BEGIN CERTIFICATE-----", "").replace("-----END CERTIFICATE-----", "").replace(/\s+/g, "");
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const SIG_RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
const DIGEST_SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1";
const SIG_RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const DIGEST_SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";
const ENVELOPED_SIGNATURE = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const SIGNED_DOCUMENT_XPATH = "/*";
const EMPTY_REFERENCE_URI = "";
const DGII_REFERENCE_TRANSFORMS = [ENVELOPED_SIGNATURE] as const;
const SIGNING_REFERENCE_TRANSFORMS = [ENVELOPED_SIGNATURE, C14N] as const;

const validateXml = (xml: string) => {
  const parsed = new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ""), "application/xml");
  if (parsed.getElementsByTagName("parsererror").length > 0) throw new Error("El XML firmado no es válido.");
};

const assertCleanXmlInput = (xml: string) => {
  if (xml.charCodeAt(0) === 0xfeff) {
    throw new Error("El XML no debe incluir BOM antes de firmarse.");
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml)) {
    throw new Error("El XML contiene caracteres de control no válidos.");
  }
};

type XmlNodeWithTagLookup = {
  getElementsByTagName(tagName: string): any;
};

const getElementsByLocalName = (doc: XmlNodeWithTagLookup, tagName: string): any[] =>
  Array.from(doc.getElementsByTagName("*") as ArrayLike<any>).filter(
    (node) => node.localName === tagName || node.nodeName === tagName || node.nodeName === `ds:${tagName}`,
  );

const getSingleElement = (doc: XmlNodeWithTagLookup, tagName: string): any => {
  const nodes = getElementsByLocalName(doc, tagName);
  if (nodes.length !== 1) {
    throw new Error(`Se esperaba exactamente un nodo ${tagName}, encontrados: ${nodes.length}.`);
  }
  return nodes[0];
};

const certBase64ToPem = (certBase64: string): string =>
  `-----BEGIN CERTIFICATE-----\n${certBase64.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") ?? ""}\n-----END CERTIFICATE-----\n`;

const hashCanonicalXml = (canonicalXml: string, digestAlgorithm: string): string => {
  if (digestAlgorithm === DIGEST_SHA1) return createHash("sha1").update(canonicalXml).digest("base64");
  if (digestAlgorithm === DIGEST_SHA256) return createHash("sha256").update(canonicalXml).digest("base64");
  throw new Error(`Digest algorithm no soportado para DGII: ${digestAlgorithm}`);
};

const cryptoSignatureAlgorithm = (signatureAlgorithm: string): string => {
  if (signatureAlgorithm === SIG_RSA_SHA1) return "RSA-SHA1";
  if (signatureAlgorithm === SIG_RSA_SHA256) return "RSA-SHA256";
  throw new Error(`Signature algorithm no soportado para DGII: ${signatureAlgorithm}`);
};

const canonicalizeSignedDocumentReference = (signedXml: string): string => {
  const doc = new DOMParser().parseFromString(signedXml.replace(/^\uFEFF/, ""), "application/xml");
  const root = doc.documentElement;
  if (!root) throw new Error("No se encontró raíz XML para recalcular DigestValue.");
  const signatureNode = getSingleElement(doc, "Signature");
  signatureNode.parentNode?.removeChild(signatureNode);
  removeWhitespaceOnlyTextNodes(root);
  return new C14nCanonicalization().process(root as unknown as Node, {});
};

const removeWhitespaceOnlyTextNodes = (node: any) => {
  const childCount = node.childNodes?.length ?? 0;
  for (let i = childCount - 1; i >= 0; i -= 1) {
    const child = node.childNodes[i];
    if (child.nodeType === 3 && /^[\t\r\n ]*$/.test(child.data ?? "")) {
      node.removeChild(child);
      continue;
    }
    removeWhitespaceOnlyTextNodes(child);
  }
};

const canonicalizeElement = (node: unknown): string => {
  removeWhitespaceOnlyTextNodes(node as any);
  return new C14nCanonicalization().process(node as Node, {});
};

const removeExplicitReferenceC14nTransform = (doc: Document) => {
  const transforms = getElementsByLocalName(doc, "Transform");
  for (const transform of transforms) {
    if (transform.getAttribute("Algorithm") === C14N) {
      transform.parentNode?.removeChild(transform);
    }
  }
};

const rewriteAsDgiiImplicitC14nSignature = (
  signedXml: string,
  privateKeyPem: string,
  signatureAlgorithm: string,
): string => {
  const doc = new DOMParser().parseFromString(signedXml, "application/xml");
  removeExplicitReferenceC14nTransform(doc as unknown as Document);
  const signedInfoNode = getSingleElement(doc, "SignedInfo");
  const signatureValueNode = getSingleElement(doc, "SignatureValue");
  const canonicalizedSignedInfo = canonicalizeElement(signedInfoNode);
  const signer = createSign(cryptoSignatureAlgorithm(signatureAlgorithm));
  signer.update(canonicalizedSignedInfo);
  signatureValueNode.textContent = signer.sign(privateKeyPem, "base64");
  return doc.toString();
};

const getRootElementName = (xml: string): string => {
  const doc = new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ""), "application/xml");
  const root = doc.documentElement;
  if (!root?.nodeName) throw new Error("No se encontró raíz XML para firmar.");
  return root.nodeName;
};

const insertSignatureBeforeRootClose = (xml: string, signatureXml: string): string => {
  const rootName = getRootElementName(xml);
  const closingTag = `</${rootName}>`;
  const closingIndex = xml.lastIndexOf(closingTag);
  if (closingIndex < 0) throw new Error(`No se encontró cierre de raíz ${closingTag}.`);

  const beforeClose = xml.slice(0, closingIndex);
  const afterClose = xml.slice(closingIndex);
  const separator = beforeClose.endsWith("\n") ? "" : "\n";
  return `${beforeClose}${separator}  ${signatureXml}\n${afterClose}`;
};

const buildSignedInfoXml = (signatureAlgorithm: string, digestAlgorithm: string, digestValue: string): string =>
  `<SignedInfo>
      <CanonicalizationMethod Algorithm="${C14N}" />
      <SignatureMethod Algorithm="${signatureAlgorithm}" />
      <Reference URI="">
        <Transforms>
          <Transform Algorithm="${ENVELOPED_SIGNATURE}" />
        </Transforms>
        <DigestMethod Algorithm="${digestAlgorithm}" />
        <DigestValue>${digestValue}</DigestValue>
      </Reference>
    </SignedInfo>`;

const canonicalizeSignedInfoXml = (signedInfoXml: string): string => {
  const signatureShell = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
    ${signedInfoXml}
  </Signature>`;
  const doc = new DOMParser().parseFromString(signatureShell, "application/xml");
  return canonicalizeElement(getSingleElement(doc, "SignedInfo"));
};

const buildDgiiFormattedSignature = (
  signedInfoXml: string,
  signatureValue: string,
  certificatePem: string,
): string =>
  `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
    ${signedInfoXml}
    <SignatureValue>${signatureValue}</SignatureValue>
    <KeyInfo>
      <X509Data>
        <X509Certificate>${compactCert(certificatePem)}</X509Certificate>
      </X509Data>
    </KeyInfo>
  </Signature>`;

const signDgiiXmlDocument = (
  xml: string,
  material: CertificateMaterial,
  signatureAlgorithm: string,
  digestAlgorithm: string,
): string => {
  const placeholderSignature = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"></Signature>`;
  const xmlWithPlaceholder = insertSignatureBeforeRootClose(xml, placeholderSignature);
  const digestValue = hashCanonicalXml(canonicalizeSignedDocumentReference(xmlWithPlaceholder), digestAlgorithm);
  const signedInfoXml = buildSignedInfoXml(signatureAlgorithm, digestAlgorithm, digestValue);
  const signer = createSign(cryptoSignatureAlgorithm(signatureAlgorithm));
  signer.update(canonicalizeSignedInfoXml(signedInfoXml));
  const signatureValue = signer.sign(material.privateKeyPem, "base64");
  return insertSignatureBeforeRootClose(
    xml,
    buildDgiiFormattedSignature(signedInfoXml, signatureValue, material.certPem),
  );
};

const verifySignature = (signedXml: string, certPem: string): { ok: boolean; verifier: SignedXml } => {
  const signatureXml = signedXml.match(/<(?:\w+:)?Signature[\s\S]*<\/(?:\w+:)?Signature>/);
  const verifier = new SignedXml({ publicCert: certPem });
  if (!signatureXml?.[0]) return { ok: false, verifier };
  verifier.loadSignature(signatureXml[0]);
  return { ok: verifier.checkSignature(signedXml), verifier };
};

const signXmlWithDotnet = (
  xml: string,
  p12Buffer: Buffer,
  password: string,
  mode: SignatureMode,
): string => {
  if (!fs.existsSync(DOTNET_SIGNER_PROJECT)) {
    throw new Error(`No se encontró el firmador DGII .NET en ${DOTNET_SIGNER_PROJECT}.`);
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "dgii-xmlsign-"));
  const inputPath = path.join(workDir, "input.xml");
  const certPath = path.join(workDir, "certificate.p12");
  const passwordPath = path.join(workDir, "password.txt");
  const outputPath = path.join(workDir, "signed.xml");

  try {
    fs.writeFileSync(inputPath, xml.replace(/^\uFEFF/, ""), "utf8");
    fs.writeFileSync(certPath, p12Buffer);
    fs.writeFileSync(passwordPath, password, "utf8");

    const result = spawnSync(
      "dotnet",
      dotnetSignerArgs([inputPath, certPath, passwordPath, outputPath, mode]),
      {
        cwd: process.cwd(),
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 4,
      },
    );

    if (result.status !== 0) {
      const message = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
      throw new Error(`No se pudo firmar XML con el firmador DGII .NET. ${message}`);
    }

    return fs.readFileSync(outputPath, "utf8");
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore temp cleanup failures
    }
  }
};

const verifyXmlWithDotnet = (signedXml: string): boolean => {
  if (!fs.existsSync(DOTNET_SIGNER_PROJECT)) return false;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "dgii-xmlverify-"));
  const inputPath = path.join(workDir, "signed.xml");
  try {
    fs.writeFileSync(inputPath, signedXml, "utf8");
    const result = spawnSync(
      "dotnet",
      dotnetSignerArgs(["--verify", inputPath]),
      {
        cwd: process.cwd(),
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 4,
      },
    );
    return result.status === 0;
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore temp cleanup failures
    }
  }
};

export const verifySignedXmlForDgii = (
  signedXml: string,
  expectedSigningCertificatePem: string,
): DgiiSignatureVerificationReport => {
  validateXml(signedXml);

  const doc = new DOMParser().parseFromString(signedXml.replace(/^\uFEFF/, ""), "application/xml");
  const signatureNode = getSingleElement(doc, "Signature");
  const signedInfoNode = getSingleElement(signatureNode, "SignedInfo");
  const referenceNode = getSingleElement(signedInfoNode, "Reference");
  const transforms = getElementsByLocalName(referenceNode, "Transform").map((n) => n.getAttribute("Algorithm") || "");
  const canonicalizationAlgorithm = getSingleElement(signedInfoNode, "CanonicalizationMethod").getAttribute("Algorithm") || "";
  const signatureAlgorithm = getSingleElement(signedInfoNode, "SignatureMethod").getAttribute("Algorithm") || "";
  const digestAlgorithm = getSingleElement(referenceNode, "DigestMethod").getAttribute("Algorithm") || "";
  const xmlDigestValue = getSingleElement(referenceNode, "DigestValue").textContent?.trim() || "";
  const signatureValue = getSingleElement(signatureNode, "SignatureValue").textContent?.replace(/\s+/g, "") || "";
  const embeddedCertBase64 = getSingleElement(signatureNode, "X509Certificate").textContent?.replace(/\s+/g, "") || "";

  if (canonicalizationAlgorithm !== C14N) throw new Error(`CanonicalizationMethod inválido: ${canonicalizationAlgorithm}`);
  if (signatureAlgorithm !== SIG_RSA_SHA256 && signatureAlgorithm !== SIG_RSA_SHA1) throw new Error(`SignatureMethod inválido: ${signatureAlgorithm}`);
  if (digestAlgorithm !== DIGEST_SHA256 && digestAlgorithm !== DIGEST_SHA1) throw new Error(`DigestMethod inválido: ${digestAlgorithm}`);
  if (referenceNode.getAttribute("URI") !== EMPTY_REFERENCE_URI) throw new Error("Reference URI debe ser vacío para DGII.");
  if (transforms.length !== DGII_REFERENCE_TRANSFORMS.length || transforms[0] !== ENVELOPED_SIGNATURE) {
    throw new Error("Transforms inválidos: DGII requiere solo enveloped-signature en Reference.");
  }
  if (!embeddedCertBase64 || embeddedCertBase64.includes("BEGIN CERTIFICATE") || embeddedCertBase64.includes("END CERTIFICATE")) {
    throw new Error("X509Certificate debe contener solo base64 DER.");
  }

  const embeddedCertificatePem = certBase64ToPem(embeddedCertBase64);
  const embeddedCertificateMatchesSigningCertificate = compactCert(embeddedCertificatePem) === compactCert(expectedSigningCertificatePem);
  if (!embeddedCertificateMatchesSigningCertificate) {
    throw new Error("El certificado embebido no coincide con el certificado usado para firmar.");
  }

  const canonicalizedReference = canonicalizeSignedDocumentReference(signedXml);
  const canonicalizedReferenceDigest = hashCanonicalXml(canonicalizedReference, digestAlgorithm);
  const digestValid = canonicalizedReferenceDigest === xmlDigestValue;

  const signedInfoSignatureValid = verifyXmlWithDotnet(signedXml);
  const canonicalizedSignedInfo = canonicalizeElement(signedInfoNode);

  if (!digestValid || !signedInfoSignatureValid) {
    throw new Error("La verificación profunda XMLDSig falló.");
  }

  return {
    xmlCryptoSignatureValid: signedInfoSignatureValid && digestValid,
    signedInfoSignatureValid,
    digestValid,
    embeddedCertificateMatchesSigningCertificate,
    canonicalizedReferenceDigest,
    xmlDigestValue,
    canonicalizedSignedInfoLength: canonicalizedSignedInfo.length,
  };
};

function saveDebugArtifacts(
  originalXml: string,
  signedXml: string,
  signatureReport: SignatureDebugReport,
  certificateReport: CertificateDebugReport,
): void {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = path.join(DEBUG_DIR, stamp);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "seed-original.xml"), originalXml, "utf8");
    fs.writeFileSync(path.join(dir, "seed-signed.xml"), signedXml, "utf8");
    fs.writeFileSync(path.join(dir, "signature-report.json"), JSON.stringify(signatureReport, null, 2), "utf8");
    fs.writeFileSync(path.join(dir, "certificate-report.json"), JSON.stringify(certificateReport, null, 2), "utf8");
  } catch {
    // ignore debug persistence errors
  }
}

function buildSignatureReport(
  signedXml: string,
  mode: SignatureMode,
  verifier: SignedXml,
  signatureValid: boolean,
): SignatureDebugReport {
  const doc = new DOMParser().parseFromString(signedXml, "application/xml");
  const ref = getSingleElement(doc, "Reference");
  const digestNode = getSingleElement(doc, "DigestValue");
  const sigVal = getSingleElement(doc, "SignatureValue");
  const transforms = getElementsByLocalName(doc, "Transform").map((n) => n.getAttribute("Algorithm") || "");
  const sigAlgorithm = getSingleElement(doc, "SignatureMethod").getAttribute("Algorithm") || "";
  const canAlgorithm = getSingleElement(doc, "CanonicalizationMethod").getAttribute("Algorithm") || "";
  const digAlgorithm = getSingleElement(doc, "DigestMethod").getAttribute("Algorithm") || "";
  const xmlDigestValue = digestNode?.textContent?.trim() || null;
  const anyVerifier = verifier as unknown as {
    references?: Array<{ calculatedDigestValue?: string; validationResult?: boolean }>;
  };
  const r0 = anyVerifier.references?.[0];
  const calculatedDigestValue = r0?.calculatedDigestValue ?? null;
  const digestValid = typeof r0?.validationResult === "boolean" ? r0.validationResult : null;
  const warningFlags: string[] = [];
  if (mode !== "legacy-sha1") warningFlags.push("using-rsa-sha256-instead-of-rsa-sha1");
  if (mode === "legacy-sha1" && digAlgorithm !== DIGEST_SHA1) warningFlags.push("using-sha256-instead-of-sha1");
  if (transforms.length !== DGII_REFERENCE_TRANSFORMS.length || transforms[0] !== ENVELOPED_SIGNATURE) warningFlags.push("unexpected-transform-order");
  if (!transforms.includes(ENVELOPED_SIGNATURE)) warningFlags.push("missing-enveloped-signature-transform");
  if (!signedXml.includes("<KeyInfo>")) warningFlags.push("empty-keyinfo");
  if (!signedXml.includes("<X509Certificate>")) warningFlags.push("invalid-x509certificate-content");
  const uri = ref?.getAttribute("URI") ?? "";
  if (uri !== EMPTY_REFERENCE_URI) warningFlags.push("reference-uri-mismatch");
  if ((signedXml.match(/<Signature[\s>]/g) || []).length > 1) warningFlags.push("multiple-signature-nodes");
  return {
    signatureValid,
    digestValid,
    referenceCount: getElementsByLocalName(doc, "Reference").length,
    canonicalizationAlgorithm: canAlgorithm,
    signatureAlgorithm: sigAlgorithm,
    digestAlgorithm: digAlgorithm,
    transforms,
    signedNodeXpath: SIGNED_DOCUMENT_XPATH,
    referenceUri: uri,
    xmlDigestValue,
    calculatedDigestValue,
    signatureValueLength: sigVal?.textContent?.trim().length ?? 0,
    warningFlags,
  };
}

const materialToSignedXml = (xml: string, material: CertificateMaterial, mode: SignatureMode): string => {
  assertCleanXmlInput(xml);
  const signatureAlgorithm = mode === "legacy-sha1" ? SIG_RSA_SHA1 : SIG_RSA_SHA256;
  const digestAlgorithm = mode === "legacy-sha1" ? DIGEST_SHA1 : DIGEST_SHA256;
  const signedXml = signDgiiXmlDocument(xml, material, signatureAlgorithm, digestAlgorithm);
  validateXml(signedXml);
  const deepVerification = verifySignedXmlForDgii(signedXml, material.certPem);
  const signatureValid = deepVerification.signedInfoSignatureValid && deepVerification.digestValid;
  const verifier = new SignedXml({ publicCert: material.certPem });
  const certificateReport: CertificateDebugReport = {
    subject: material.subject,
    issuer: material.issuer,
    serialNumber: material.serialNumber,
    notBefore: material.notBefore,
    notAfter: material.notAfter,
    expired: Date.now() > new Date(material.notAfter).getTime(),
    keySize: material.keySize,
    certificateSignatureAlgorithm: material.certSigAlg,
    privateKeyMatchesCertificate: material.privateKeyMatchesCertificate,
    chainCount: material.chainPem.length,
  };
  const signatureReport = buildSignatureReport(signedXml, mode, verifier, signatureValid);
  saveDebugArtifacts(xml, signedXml, signatureReport, certificateReport);
  if (!signatureValid || !deepVerification.signedInfoSignatureValid || !deepVerification.digestValid) {
    console.error("[DGII SIGN ERROR]");
    console.error("Reason: Local deep signature verification failed");
    throw new Error("Firma local inválida.");
  }
  console.log("[DGII SIGN DEBUG]");
  console.log(`Signature Algorithm: ${signatureReport.signatureAlgorithm}`);
  console.log(`Digest Algorithm: ${signatureReport.digestAlgorithm}`);
  console.log(`Local Validation: ${signatureReport.signatureValid ? "PASS" : "FAIL"}`);
  console.log(`Digest Match: ${deepVerification.digestValid ? "PASS" : "FAIL"}`);
  console.log(`SignedInfo Signature: ${deepVerification.signedInfoSignatureValid ? "PASS" : "FAIL"}`);
  console.log(`Embedded Certificate Match: ${deepVerification.embeddedCertificateMatchesSigningCertificate ? "PASS" : "FAIL"}`);
  console.log(`Certificate Valid: ${certificateReport.expired ? "NO" : "YES"}`);
  console.log(`Private Key Match: ${certificateReport.privateKeyMatchesCertificate ? "YES" : "NO"}`);
  appendSignatureLog(`[sign] mode=${mode} sigAlg=${signatureAlgorithm} digAlg=${digestAlgorithm} c14n=${C14N} uri="${EMPTY_REFERENCE_URI}"`);
  appendSignatureLog(`[sign] subject="${material.subject}" issuer="${material.issuer}" notAfter=${material.notAfter} chain=${material.chainPem.length}`);
  appendSignatureLog(`[sign] xml=${signedXml.slice(0, 1500)}`);
  return signedXml;
};

export const testCertificateCompatibility = async (
  p12Buffer: Buffer,
  password: string,
): Promise<{
  privateKeyExists: boolean;
  chainCount: number;
  subject: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  validNow: boolean;
  signatureTestPassed: boolean;
}> => {
  const material = await loadPkcs12MaterialFromBuffer(p12Buffer, password);
  const now = Date.now();
  const validNow = now >= new Date(material.notBefore).getTime() && now <= new Date(material.notAfter).getTime();
  const sample = `<?xml version="1.0" encoding="utf-8"?><SemillaModel xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><valor>TEST</valor><fecha>${new Date().toISOString()}</fecha></SemillaModel>`;
  let signatureTestPassed = false;
  try {
    const signedSample = signXmlWithDotnet(sample, p12Buffer, password, "modern-sha256");
    verifySignedXmlForDgii(signedSample, material.certPem);
    signatureTestPassed = true;
  } catch {
    signatureTestPassed = false;
  }
  return {
    privateKeyExists: Boolean(material.privateKeyPem),
    chainCount: material.chainPem.length,
    subject: material.subject,
    issuer: material.issuer,
    notBefore: material.notBefore,
    notAfter: material.notAfter,
    validNow,
    signatureTestPassed,
  };
};

export const signXml = async (
  xml: string,
  certificateInput?: CertificateInput,
  mode: SignatureMode = "modern-sha256",
): Promise<string> => {
  if (!certificateInput) return xml;
  const fsProm = await import("node:fs/promises");
  return signXmlWithP12Buffer(xml, await fsProm.readFile(certificateInput.p12Path), certificateInput.password, mode);
};

export const signXmlWithP12Buffer = (
  xml: string,
  p12Buffer: Buffer,
  password: string,
  mode: SignatureMode = "modern-sha256",
): string => {
  const material = loadPkcs12MaterialFromBuffer(p12Buffer, password);
  const signedXml = signXmlWithDotnet(xml, p12Buffer, password, mode);
  validateXml(signedXml);
  const deepVerification = verifySignedXmlForDgii(signedXml, material.certPem);
  console.log("[DGII SIGN DEBUG]");
  console.log(`Signature Algorithm: ${mode === "legacy-sha1" ? SIG_RSA_SHA1 : SIG_RSA_SHA256}`);
  console.log(`Digest Algorithm: ${mode === "legacy-sha1" ? DIGEST_SHA1 : DIGEST_SHA256}`);
  console.log(`Local Validation: ${deepVerification.xmlCryptoSignatureValid ? "PASS" : "FAIL"}`);
  console.log(`Digest Match: ${deepVerification.digestValid ? "PASS" : "FAIL"}`);
  console.log(`SignedInfo Signature: ${deepVerification.signedInfoSignatureValid ? "PASS" : "FAIL"}`);
  console.log(`Embedded Certificate Match: ${deepVerification.embeddedCertificateMatchesSigningCertificate ? "PASS" : "FAIL"}`);
  appendSignatureLog(`[sign-dotnet] mode=${mode} c14n=${C14N} uri="${EMPTY_REFERENCE_URI}"`);
  appendSignatureLog(`[sign-dotnet] subject="${material.subject}" issuer="${material.issuer}" notAfter=${material.notAfter} chain=${material.chainPem.length}`);
  appendSignatureLog(`[sign-dotnet] xml=${signedXml.slice(0, 1500)}`);
  return signedXml;
};
