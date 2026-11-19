// Mismo patron que logo-upload-url: el backend local nunca tiene credencial de Supabase
// Storage embebida, pide aqui una URL firmada de subida acotada a la carpeta de SU PROPIA
// empresa (segun el JWT de sesion), usando la service role key que solo existe server-side.
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifySessionToken } from "../_shared/jwt.ts";
import { json, handleOptions } from "../_shared/http.ts";

const BUCKET = "company-signatures";
const KNOWN_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];
const extByMime: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

const getBearerToken = (req: Request): string | null => {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
};

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ message: "Metodo no permitido." }, 405);

  const token = getBearerToken(req);
  if (!token) return json({ message: "No autorizado." }, 401);

  let claims: { sub: number; companyId: number };
  try {
    claims = verifySessionToken(token);
  } catch {
    return json({ message: "Token invalido o vencido." }, 401);
  }

  let body: { action?: "sign" | "delete"; contentType?: string };
  try {
    body = await req.json();
  } catch {
    return json({ message: "Cuerpo JSON invalido." }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (body.action === "delete") {
    const paths = KNOWN_EXTENSIONS.map((ext) => `companies/${claims.companyId}/signature.${ext}`);
    await admin.storage.from(BUCKET).remove(paths);
    return json({ ok: true });
  }

  const ext = body.contentType ? extByMime[body.contentType] : undefined;
  if (!ext) {
    return json({ message: "La firma debe ser PNG, JPG, GIF o WebP." }, 400);
  }
  const path = `companies/${claims.companyId}/signature.${ext}`;

  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path, {
    upsert: true,
  });
  if (error || !data) {
    return json({ message: `No se pudo preparar la subida de la firma: ${error?.message ?? ""}` }, 500);
  }

  const { data: publicData } = admin.storage.from(BUCKET).getPublicUrl(path);

  return json({ signedUrl: data.signedUrl, path, publicUrl: publicData.publicUrl });
});
