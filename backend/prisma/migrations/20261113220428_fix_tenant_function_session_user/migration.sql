-- current_user dentro de una funcion SECURITY DEFINER resuelve al DUENO de la
-- funcion (el admin), no al rol que realmente se conecto -- eso bloqueaba TODO,
-- incluidos los datos propios de cada empresa (confirmado con prueba real:
-- conectado como tenant_test_a, SELECT en clients devolvia vacio incluso para
-- su propia fila). session_user si refleja el rol real de la conexion.
CREATE OR REPLACE FUNCTION current_tenant_company_id() RETURNS integer
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT company_id FROM tenant_roles WHERE role_name = session_user;
$$;
