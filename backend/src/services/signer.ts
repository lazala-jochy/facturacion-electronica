import forge from "node-forge";
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";

export type CertificateInput = {
  p12Path: string;
  password: string;
};

type CertificateMaterial = {
  privateKeyPem: string;
  certPem: string;
};

const pkcs12ToMaterial = (p12: forge.pkcs12.Pkcs12Pfx): CertificateMaterial => {
  const keyBag =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];

  if (!keyBag?.key || !certBag?.cert) {
    throw new Error("No se encontro llave privada o certificado en el .p12.");
  }

  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certPem: forge.pki.certificateToPem(certBag.cert),
  };
};

const loadPkcs12MaterialFromBuffer = async (p12Raw: Buffer, password: string): Promise<CertificateMaterial> => {
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12Raw.toString("binary")));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
  return pkcs12ToMaterial(p12);
};

export const loadPkcs12Material = async (input: CertificateInput): Promise<CertificateMaterial> => {
  const fs = await import("node:fs/promises");
  const p12Raw = await fs.readFile(input.p12Path);
  return loadPkcs12MaterialFromBuffer(p12Raw, input.password);
};

const compactCert = (pem: string) =>
  pem.replace("-----BEGIN CERTIFICATE-----", "").replace("-----END CERTIFICATE-----", "").replace(/\s+/g, "");

const C14N_INCLUSIVE = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";

const materialToSignedXml = (xml: string, material: CertificateMaterial): string => {
  const sig = new SignedXml({
    privateKey: material.privateKeyPem,
    publicCert: material.certPem,
    signatureAlgorithm: RSA_SHA256,
    // xml-crypto v6 exige canonicalización explícita para SignedInfo (antes era implícita).
    canonicalizationAlgorithm: C14N_INCLUSIVE,
    getKeyInfoContent: () =>
      `<X509Data><X509Certificate>${compactCert(material.certPem)}</X509Certificate></X509Data>`,
  });
  sig.addReference({
    xpath: "/*",
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", C14N_INCLUSIVE],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
  });
  sig.computeSignature(xml, {
    location: { reference: "/*", action: "append" },
  });
  const signedXml = sig.getSignedXml();

  const parsed = new DOMParser().parseFromString(signedXml, "application/xml");
  const parserErrors = parsed.getElementsByTagName("parsererror");
  if (parserErrors.length > 0) {
    throw new Error("El XML firmado no es valido.");
  }

  return signedXml;
};

/** Firma usando un .p12 en disco (retrocompatibilidad). */
export const signXml = async (
  xml: string,
  certificateInput?: CertificateInput,
): Promise<string> => {
  if (!certificateInput) {
    return xml;
  }

  const material = await loadPkcs12Material(certificateInput);
  return materialToSignedXml(xml, material);
};

/** Firma con buffer PKCS#12 descifrado. */
export const signXmlWithP12Buffer = async (
  xml: string,
  p12Buffer: Buffer,
  password: string,
): Promise<string> => {
  const material = await loadPkcs12MaterialFromBuffer(p12Buffer, password);
  return materialToSignedXml(xml, material);
};
