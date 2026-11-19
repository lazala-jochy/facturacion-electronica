-- Correo Gmail (SMTP) para enviar cotizaciones a clientes.
ALTER TABLE "companies" ADD COLUMN "smtp_email" TEXT;
ALTER TABLE "companies" ADD COLUMN "smtp_app_password_enc" TEXT;
