import assert from "node:assert/strict";
import test from "node:test";
import forge from "node-forge";
import { DOMParser } from "@xmldom/xmldom";
import { signXmlWithP12Buffer, verifySignedXmlForDgii } from "./dgiiXmlSigner";

const PASSWORD = "test-password";
const FIXED_SEED_XML =
  '<?xml version="1.0" encoding="UTF-8"?><Semilla><Valor>ABC123</Valor></Semilla>';

function createTestPkcs12(): { p12Buffer: Buffer; certificatePem: string } {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, workers: 0 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date("2024-01-01T00:00:00.000Z");
  cert.validity.notAfter = new Date("2034-01-01T00:00:00.000Z");
  const attrs = [{ name: "commonName", value: "DGII XMLDSig Test" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, cert, PASSWORD, {
    algorithm: "3des",
  });

  return {
    p12Buffer: Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), "binary"),
    certificatePem: forge.pki.certificateToPem(cert),
  };
}

function getSingleText(xml: string, tagName: string): string {
  const doc = new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ""), "application/xml");
  const nodes = Array.from(doc.getElementsByTagName("*") as ArrayLike<any>).filter(
    (node) => node.localName === tagName || node.nodeName === tagName || node.nodeName === `ds:${tagName}`,
  );
  assert.equal(nodes.length, 1, `expected one ${tagName}`);
  return nodes[0].textContent?.trim() ?? "";
}

test("deterministic DGII signature structure and digest", () => {
  const { p12Buffer } = createTestPkcs12();
  const first = signXmlWithP12Buffer(FIXED_SEED_XML, p12Buffer, PASSWORD);
  const second = signXmlWithP12Buffer(FIXED_SEED_XML, p12Buffer, PASSWORD);

  assert.equal(getSingleText(first, "DigestValue"), getSingleText(second, "DigestValue"));
  assert.match(first, /<Reference URI="">/);
  assert.doesNotMatch(first, /\sId="_0"/);
  assert.match(first, /<Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">/);
  assert.match(first, /<CanonicalizationMethod Algorithm="http:\/\/www\.w3\.org\/TR\/2001\/REC-xml-c14n-20010315" \/>/);
  assert.match(first, /<SignatureMethod Algorithm="http:\/\/www\.w3\.org\/2001\/04\/xmldsig-more#rsa-sha256" \/>/);
  assert.match(first, /<Transforms>\s*<Transform Algorithm="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#enveloped-signature" \/>\s*<\/Transforms>/);
  assert.doesNotMatch(first, /<Transform Algorithm="http:\/\/www\.w3\.org\/TR\/2001\/REC-xml-c14n-20010315"\/>/);
  assert.ok(getSingleText(first, "X509Certificate").length > 0);
});

test("deep verification recomputes digest and verifies SignedInfo with embedded certificate", () => {
  const { p12Buffer, certificatePem } = createTestPkcs12();
  const signed = signXmlWithP12Buffer(FIXED_SEED_XML, p12Buffer, PASSWORD);
  const report = verifySignedXmlForDgii(signed, certificatePem);

  assert.equal(report.xmlCryptoSignatureValid, true);
  assert.equal(report.signedInfoSignatureValid, true);
  assert.equal(report.digestValid, true);
  assert.equal(report.embeddedCertificateMatchesSigningCertificate, true);
  assert.equal(report.canonicalizedReferenceDigest, report.xmlDigestValue);

  console.log("signature verification PASS");
  console.log("digest match PASS");
});

test("mutation after signing invalidates the digest/signature", () => {
  const { p12Buffer, certificatePem } = createTestPkcs12();
  const signed = signXmlWithP12Buffer(FIXED_SEED_XML, p12Buffer, PASSWORD);
  const mutated = signed.replace("ABC123", "ABC124");

  assert.throws(() => verifySignedXmlForDgii(mutated, certificatePem));
});

