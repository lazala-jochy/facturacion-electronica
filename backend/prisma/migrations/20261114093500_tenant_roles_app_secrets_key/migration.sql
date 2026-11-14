-- Cada empresa tiene su propia clave de cifrado para dgiiPasswordEnc /
-- certificateKeyphraseEnc (generada al registrarse, igual que su
-- contrasena de Postgres), en vez de una clave global compartida -- si no,
-- cualquier instalador filtrado podria descifrar los secretos DGII de
-- CUALQUIER empresa, no solo la propia.
ALTER TABLE tenant_roles ADD COLUMN IF NOT EXISTS app_secrets_key_enc text;
