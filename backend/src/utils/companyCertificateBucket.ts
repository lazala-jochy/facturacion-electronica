/**
 * A diferencia del logo (bucket público, sube vía URL firmada con el JWT del usuario),
 * el certificado lo necesitan leer también procesos sin sesión HTTP activa (worker de
 * reintento DGII, conector de gateway). Por eso el backend habla directo con la API REST
 * de Storage usando la service_role key -- esto es seguro porque ahora el backend es un
 * único servidor centralizado (ya no un instalador que viaja a la máquina de cada cliente,
 * como en la build de Electron).
 *
 * Se usa `fetch` contra la API REST en vez de `@supabase/supabase-js`: ese SDK crea un
 * cliente de Realtime (websockets) apenas se instancia, y Node 20 no trae WebSocket nativo
 * (solo Node 22+), así que `createClient()` lanza un error antes de poder subir nada.
 */
const BUCKET = "company-certificates";

function storageConfig(): { url: string; serviceRoleKey: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return { url: url.replace(/\/+$/, ""), serviceRoleKey };
}

export const isCertificateBucketConfigured = (): boolean => Boolean(storageConfig());

export const certificateBucketObjectPath = (companyId: number, filename: string): string =>
  `companies/${companyId}/${filename}`;

export async function uploadCertificateToBucket(
  companyId: number,
  filename: string,
  bytes: Buffer,
): Promise<boolean> {
  const config = storageConfig();
  if (!config) return false;
  const objectPath = certificateBucketObjectPath(companyId, filename);
  const res = await fetch(`${config.url}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      apikey: config.serviceRoleKey,
      "Content-Type": "application/octet-stream",
      "x-upsert": "true",
    },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`No se pudo subir el certificado al bucket (${res.status}). ${detail}`);
    return false;
  }
  return true;
}

export async function downloadCertificateFromBucket(objectPath: string): Promise<Buffer> {
  const config = storageConfig();
  if (!config) {
    throw new Error("Supabase Storage no está configurado (faltan SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).");
  }
  const res = await fetch(`${config.url}/storage/v1/object/${BUCKET}/${objectPath}`, {
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      apikey: config.serviceRoleKey,
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`No se pudo descargar el certificado del bucket (${res.status}). ${detail}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function removeCertificateFromBucket(objectPath: string): Promise<void> {
  const config = storageConfig();
  if (!config) return;
  try {
    await fetch(`${config.url}/storage/v1/object/${BUCKET}/${objectPath}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        apikey: config.serviceRoleKey,
      },
    });
  } catch {
    /* no es crítico */
  }
}
