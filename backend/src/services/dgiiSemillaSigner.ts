import fs from "node:fs/promises";
import forge from "node-forge";
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const DIGEST_SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";
const ENVELOPED_SIGNATURE = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

export type DgiiP12Input = {
  p12Path: string;
  password: string;
};

type CertificateMaterial = {
  privateKeyPem: string;
  leafCertPem: string;
  chainCertPem: string[];
};

function compactCertificatePem(pem: string): string {
  return pem
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "")
    .replace(/\s+/g, "");
}

function extractMaterialFromP12Buffer(p12Buffer: Buffer, password: string): CertificateMaterial {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const derBuffer = forge.util.createBuffer(p12Buffer.toString("binary"));
    const p12Asn1 = forge.asn1.fromDer(derBuffer);
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
  } catch {
    throw new Error("No se pudo abrir el certificado .p12/.pfx. Verifica contraseña y archivo.");
  }

  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];

  if (!keyBags.length || !certBags.length) {
    throw new Error("El .p12 no contiene llave privada o certificados.");
  }

  let selectedKey = keyBags[0].key;
  let selectedLeaf: forge.pki.Certificate | null = null;

  for (const kb of keyBags) {
    if (!kb.key) continue;
    const keyAny = kb.key as unknown as {
      n?: { toString: (radix: number) => string };
      e?: { toString: (radix: number) => string };
    };
    const keyN = keyAny.n?.toString(16);
    const keyE = keyAny.e?.toString(16);
    if (!keyN || !keyE) continue;

    for (const cb of certBags) {
      if (!cb.cert) continue;
      const certKey = cb.cert.publicKey as unknown as {
        n?: { toString: (radix: number) => string };
        e?: { toString: (radix: number) => string };
      };
      if (certKey.n?.toString(16) === keyN && certKey.e?.toString(16) === keyE) {
        selectedKey = kb.key;
        selectedLeaf = cb.cert;
        break;
      }
    }
    if (selectedLeaf) break;
  }

  if (!selectedKey) throw new Error("No se encontró llave privada utilizable en el .p12.");
  if (!selectedLeaf) {
    selectedLeaf = certBags.find((b) => b.cert)?.cert ?? null;
  }
  if (!selectedLeaf) throw new Error("No se encontró certificado en el .p12.");

  const selectedPublicPem = forge.pki.publicKeyToPem(selectedLeaf.publicKey);
  const orderedChain = certBags
    .map((bag) => bag.cert)
    .filter((cert): cert is forge.pki.Certificate => Boolean(cert))
    .sort((a, b) =>
      forge.pki.publicKeyToPem(a.publicKey) === selectedPublicPem
        ? -1
        : forge.pki.publicKeyToPem(b.publicKey) === selectedPublicPem
          ? 1
          : 0,
    );

  return {
    privateKeyPem: forge.pki.privateKeyToPem(selectedKey),
    leafCertPem: forge.pki.certificateToPem(selectedLeaf),
    chainCertPem: orderedChain.map((cert) => forge.pki.certificateToPem(cert)),
  };
}

async function extractMaterialFromP12File(input: DgiiP12Input): Promise<CertificateMaterial> {
  const p12Buffer = await fs.readFile(input.p12Path);
  return extractMaterialFromP12Buffer(p12Buffer, input.password);
}

function verifySignedXmlSignature(signedXml: string, leafCertificatePem: string): boolean {
  const signatureNode = signedXml.match(/<Signature[\s\S]*<\/Signature>/);
  if (!signatureNode?.[0]) return false;

  const verifier = new SignedXml({ publicCert: leafCertificatePem });
  verifier.loadSignature(signatureNode[0]);
  return verifier.checkSignature(signedXml);
}

function validateXmlWellFormed(xml: string): void {
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  if (parsed.getElementsByTagName("parsererror").length > 0) {
    throw new Error("El XML firmado no es válido.");
  }
}

/**
 * Firma un SemillaModel con XMLDSig para DGII usando:
 * - RSA-SHA256
 * - SHA256 Digest
 * - C14N inclusivo
 * - Reference URI vacío
 * - Transform enveloped-signature + c14n
 * La firma se inserta como hijo del nodo raíz.
 */
export async function signDgiiSemillaXml(xml: string, p12: DgiiP12Input): Promise<string> {
  const material = await extractMaterialFromP12File(p12);
  return signWithMaterial(xml, material);
}

function signWithMaterial(xml: string, material: CertificateMaterial): string {
  const signer = new SignedXml({
    privateKey: material.privateKeyPem,
    publicCert: material.leafCertPem,
    signatureAlgorithm: RSA_SHA256,
    canonicalizationAlgorithm: C14N,
    getKeyInfoContent: () =>
      `<X509Data>${material.chainCertPem.map((pem) => `<X509Certificate>${compactCertificatePem(pem)}</X509Certificate>`).join("")}</X509Data>`,
  });

  signer.addReference({
    xpath: "/*",
    uri: "",
    isEmptyUri: true,
    transforms: [ENVELOPED_SIGNATURE, C14N],
    digestAlgorithm: DIGEST_SHA256,
  });

  signer.computeSignature(xml, { location: { reference: "/*", action: "append" } });
  const signedXml = signer.getSignedXml();

  validateXmlWellFormed(signedXml);

  const ok = verifySignedXmlSignature(signedXml, material.leafCertPem);
  if (!ok) {
    throw new Error("La validación local de la firma XMLDSig falló.");
  }

  return signedXml;
}

export async function signDgiiSemillaXmlFromP12Buffer(
  xml: string,
  p12Buffer: Buffer,
  password: string,
): Promise<string> {
  const material = extractMaterialFromP12Buffer(p12Buffer, password);
  return signWithMaterial(xml, material);
}
