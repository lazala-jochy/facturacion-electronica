import { ApiError, authenticatedFetch } from "./api";

export type SignUploadedXmlResponse = {
  message: string;
  signed_xml: string;
};

/** Firma cualquier XML (ej. Postulación DGII) con el certificado ya configurado de la empresa. */
export const signUploadedXml = async (file: File): Promise<SignUploadedXmlResponse> => {
  const fd = new FormData();
  fd.append("xml", file);

  const response = await authenticatedFetch("/xml-firmar/sign", {
    method: "POST",
    body: fd,
  });
  const data = (await response.json().catch(() => ({}))) as Partial<SignUploadedXmlResponse> & {
    message?: string;
  };
  if (!response.ok) {
    throw new ApiError(data.message ?? "No se pudo firmar el XML.", response.status, data as Record<string, unknown>);
  }
  return data as SignUploadedXmlResponse;
};
