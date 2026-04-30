export type DgiiSubmissionResult = {
  accepted: boolean;
  status: "accepted" | "rejected";
  trackId: string;
  rawResponse: string;
};

const makeTrackId = () => `DGII-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

const submitMock = async (signedXml: string): Promise<DgiiSubmissionResult> => {
  const accepted = signedXml.length > 0;
  return {
    accepted,
    status: accepted ? "accepted" : "rejected",
    trackId: makeTrackId(),
    rawResponse: JSON.stringify({
      mode: "mock",
      accepted,
      message: accepted ? "e-CF recibido por DGII (mock)." : "e-CF rechazado (mock).",
    }),
  };
};

export const submitEcfToDgii = async (signedXml: string): Promise<DgiiSubmissionResult> => {
  const endpoint = process.env.DGII_ECF_ENDPOINT?.trim();
  const token = process.env.DGII_ECF_TOKEN?.trim();

  if (!endpoint) {
    return submitMock(signedXml);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/xml",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: signedXml,
  });

  const rawResponse = await response.text();
  const trackId =
    response.headers.get("x-track-id") ??
    response.headers.get("track-id") ??
    makeTrackId();
  const accepted = response.ok;

  return {
    accepted,
    status: accepted ? "accepted" : "rejected",
    trackId,
    rawResponse,
  };
};
