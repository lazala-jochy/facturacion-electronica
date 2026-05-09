export {
  loadPkcs12Material,
  signXml,
  signXmlWithP12Buffer,
  testCertificateCompatibility,
  verifySignedXmlForDgii,
} from "./dgiiXmlSigner";
export type { CertificateInput, DgiiSignatureVerificationReport, SignatureMode } from "./dgiiXmlSigner";
export { signDgiiSemillaXml, signDgiiSemillaXmlFromP12Buffer } from "./dgiiSemillaSigner";
export type { DgiiP12Input } from "./dgiiSemillaSigner";