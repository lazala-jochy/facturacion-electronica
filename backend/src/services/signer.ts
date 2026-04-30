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

const loadPkcs12Material = async (input: CertificateInput): Promise<CertificateMaterial> => {
  const fs = await import("node:fs/promises");
  const p12Raw = await fs.readFile(input.p12Path);
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12Raw.toString("binary")));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, input.password);

  const keyBag =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ]?.[0] ??
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

const compactCert = (pem: string) =>
  pem.replace("-----BEGIN CERTIFICATE-----", "").replace("-----END CERTIFICATE-----", "").replace(/\s+/g, "");

export const signXml = async (
  xml: string,
  certificateInput?: CertificateInput,
): Promise<string> => {
  if (!certificateInput) {
    return xml;
  }

  const material = await loadPkcs12Material(certificateInput);
  const sig = new SignedXml({
    privateKey: material.privateKeyPem,
    publicCert: material.certPem,
    getKeyInfoContent: () =>
      `<X509Data><X509Certificate>${compactCert(material.certPem)}</X509Certificate></X509Data>`,
  });
  sig.addReference({
    xpath: "/*",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
  });
  sig.signatureAlgorithm = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
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
