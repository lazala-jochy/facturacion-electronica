-- Aislamiento multi-tenant real: cada empresa tiene su propio ROL de Postgres
-- (creado por la Edge Function de registro), y las politicas RLS se atan al
-- rol ya autenticado (current_user), nunca a algo que el cliente declare.
--
-- tenant_roles: mapea un rol de Postgres -> company_id. Solo el rol admin
-- (el que corre esta migracion / las Edge Functions) puede leerla o escribirla.
CREATE TABLE IF NOT EXISTS tenant_roles (
  role_name  text PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Contrasena del rol, cifrada con la clave que solo conocen las Edge
  -- Functions (no APP_SECRETS_KEY del backend local) -- permite que `login`
  -- devuelva de nuevo el DATABASE_URL completo en un reinstall/otro dispositivo
  -- sin tener que regenerar el rol.
  role_password_enc text,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON tenant_roles FROM PUBLIC;

-- Resuelve la empresa del rol que esta corriendo la consulta AHORA MISMO.
-- SECURITY DEFINER: corre con los permisos del dueno (admin), asi un rol
-- tenant_* puede ejecutarla sin tener grants directos sobre tenant_roles.
CREATE OR REPLACE FUNCTION current_tenant_company_id() RETURNS integer
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT company_id FROM tenant_roles WHERE role_name = current_user;
$$;
GRANT EXECUTE ON FUNCTION current_tenant_company_id() TO PUBLIC;

-- Patron identico para las 9 tablas tenant-scoped: habilitar RLS y restringir
-- lectura/escritura a la empresa del rol autenticado.
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_isolation ON companies
  USING (id = current_tenant_company_id())
  WITH CHECK (id = current_tenant_company_id());

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_isolation ON users
  USING (company_id = current_tenant_company_id())
  WITH CHECK (company_id = current_tenant_company_id());

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_isolation ON clients
  USING (company_id = current_tenant_company_id())
  WITH CHECK (company_id = current_tenant_company_id());

ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_isolation ON cotizaciones
  USING (company_id = current_tenant_company_id())
  WITH CHECK (company_id = current_tenant_company_id());

ALTER TABLE cotizacion_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_isolation ON cotizacion_items
  USING (company_id = current_tenant_company_id())
  WITH CHECK (company_id = current_tenant_company_id());

ALTER TABLE compras_606 ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_isolation ON compras_606
  USING (company_id = current_tenant_company_id())
  WITH CHECK (company_id = current_tenant_company_id());

ALTER TABLE company_ecf_seq_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_isolation ON company_ecf_seq_counters
  USING (company_id = current_tenant_company_id())
  WITH CHECK (company_id = current_tenant_company_id());

ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_isolation ON refresh_tokens
  USING (company_id = current_tenant_company_id())
  WITH CHECK (company_id = current_tenant_company_id());

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_isolation ON password_reset_tokens
  USING (company_id = current_tenant_company_id())
  WITH CHECK (company_id = current_tenant_company_id());
