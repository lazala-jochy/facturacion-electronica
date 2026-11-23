import type { RequestHandler } from "express";
import { signUploadedXml } from "../services/xmlFirma.service";

export const signUploadedXmlHandler: RequestHandler = async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }
  const file = req.file;
  if (!file?.buffer?.length) {
    res.status(400).json({ message: "Suba un archivo XML." });
    return;
  }

  const out = await signUploadedXml(companyId, file.buffer);
  if (!out.ok) {
    res.status(out.status).json({ message: out.message });
    return;
  }

  res.json({ message: "XML firmado correctamente.", signed_xml: out.signedXml });
};
