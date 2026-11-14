-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "rnc" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "logo_url" TEXT,
    "regime" TEXT DEFAULT 'Régimen general',
    "certificate_salt" TEXT,
    "certificate_enc_path" TEXT,
    "certificate_password_enc" TEXT,
    "dgii_ecf_endpoint" TEXT,
    "dgii_username" TEXT,
    "dgii_password_enc" TEXT,
    "dgii_auth_url" TEXT,
    "dgii_reception_url" TEXT,
    "dgii_consult_url" TEXT,
    "dgii_commercial_approval_url" TEXT,
    "dgii_seed_url" TEXT,
    "dgii_validate_seed_url" TEXT,
    "dgii_ecf_receive_url" TEXT,
    "dgii_track_url" TEXT,
    "dgii_status_url" TEXT,
    "dgii_environment" TEXT DEFAULT 'CERTIFICACION',
    "dgii_paso4_auth_url" TEXT,
    "dgii_paso4_reception_url" TEXT,
    "dgii_paso4_consult_url" TEXT,
    "dgii_paso4_rfce_url" TEXT,
    "dgii_paso4_environment" TEXT DEFAULT 'CERTIFICACION',
    "dgii_paso4_seed_url" TEXT,
    "dgii_paso4_validate_seed_url" TEXT,
    "dgii_paso4_ecf_receive_url" TEXT,
    "dgii_prod_auth_url" TEXT,
    "dgii_prod_seed_url" TEXT,
    "dgii_prod_validate_seed_url" TEXT,
    "dgii_prod_reception_url" TEXT,
    "dgii_prod_consult_url" TEXT,
    "dgii_prod_commercial_approval_url" TEXT,
    "dgii_prod_consumer_summary_url" TEXT,
    "ecf_gateway_base_url" TEXT,
    "ecf_gateway_api_key" TEXT,
    "certificate_path" TEXT,
    "certificate_password" TEXT,
    "token_cache" TEXT,
    "token_expiration" TIMESTAMP(3),
    "token_cache_environment" TEXT,
    "certificate_keyphrase_enc" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compras_606" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "periodo" TEXT NOT NULL,
    "rnc_cedula" TEXT NOT NULL,
    "tipo_bienes_servicios" TEXT NOT NULL DEFAULT '02',
    "ncf" TEXT NOT NULL,
    "ncf_modificado" TEXT,
    "fecha_comprobante" TEXT NOT NULL,
    "fecha_pago" TEXT,
    "monto_servicios" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monto_bienes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monto_facturado" DOUBLE PRECISION NOT NULL,
    "itbis_facturado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "itbis_retenido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "itbis_sujeto_proporcionalidad" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "itbis_llevado_al_costo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "itbis_por_adelantar" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "itbis_percibido_compras" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retencion_renta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tipo_retencion_isr" TEXT,
    "isr_percibido_compras" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impuesto_isc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impuestos_otros" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monto_propina_legal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "forma_pago" TEXT NOT NULL DEFAULT '04',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compras_606_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_ecf_seq_counters" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "ecf_tipo" TEXT NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "company_ecf_seq_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "full_name" TEXT NOT NULL,
    "cedula" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "company_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "rnc_cedula" TEXT NOT NULL,
    "rnc" TEXT,
    "cedula" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "company_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizaciones" (
    "id" SERIAL NOT NULL,
    "number" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "document_title" TEXT NOT NULL DEFAULT 'Pre-factura',
    "fiscal_legend" TEXT NOT NULL DEFAULT 'Sin valor fiscal',
    "payment_terms" TEXT NOT NULL,
    "payment_method" TEXT,
    "fecha_limite_pago" TIMESTAMP(3),
    "account_manager" TEXT NOT NULL,
    "comment" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "itbis" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "exento" BOOLEAN NOT NULL DEFAULT false,
    "dgii_track_id" TEXT,
    "dgii_status" TEXT,
    "dgii_response" TEXT,
    "signed_xml" TEXT,
    "dgii_submitted_at" TIMESTAMP(3),
    "dgii_submit_retry_count" INTEGER NOT NULL DEFAULT 0,
    "dgii_submit_next_retry_at" TIMESTAMP(3),
    "dgii_submit_last_error" TEXT,
    "dgii_submit_cert_profile" TEXT,
    "formato_607_generado_at" TIMESTAMP(3),
    "ecf_tipo" TEXT NOT NULL DEFAULT '31',
    "ecf_ncf_seq" INTEGER NOT NULL,
    "ecf_reference_ncf" TEXT,
    "ecf_ri_pdf_path" TEXT,
    "ecf_ri_qr_url" TEXT,
    "ecf_ri_generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion_items" (
    "id" SERIAL NOT NULL,
    "cotizacion_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "item_number" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "item_type" TEXT NOT NULL DEFAULT 'servicio',
    "description" TEXT NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "total_value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "cotizacion_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_rnc_key" ON "companies"("rnc");

-- CreateIndex
CREATE INDEX "compras_606_company_id_periodo_idx" ON "compras_606"("company_id", "periodo");

-- CreateIndex
CREATE INDEX "company_ecf_seq_counters_company_id_idx" ON "company_ecf_seq_counters"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_ecf_seq_counters_company_id_ecf_tipo_key" ON "company_ecf_seq_counters"("company_id", "ecf_tipo");

-- CreateIndex
CREATE UNIQUE INDEX "users_cedula_key" ON "users"("cedula");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_company_id_idx" ON "users"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_company_id_idx" ON "refresh_tokens"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_company_id_idx" ON "password_reset_tokens"("company_id");

-- CreateIndex
CREATE INDEX "clients_company_id_idx" ON "clients"("company_id");

-- CreateIndex
CREATE INDEX "clients_rnc_idx" ON "clients"("rnc");

-- CreateIndex
CREATE INDEX "clients_cedula_idx" ON "clients"("cedula");

-- CreateIndex
CREATE INDEX "cotizaciones_company_id_idx" ON "cotizaciones"("company_id");

-- CreateIndex
CREATE INDEX "cotizaciones_client_id_idx" ON "cotizaciones"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "cotizaciones_company_id_number_key" ON "cotizaciones"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "cotizaciones_company_id_ecf_tipo_ecf_ncf_seq_key" ON "cotizaciones"("company_id", "ecf_tipo", "ecf_ncf_seq");

-- CreateIndex
CREATE INDEX "cotizacion_items_cotizacion_id_idx" ON "cotizacion_items"("cotizacion_id");

-- CreateIndex
CREATE INDEX "cotizacion_items_company_id_idx" ON "cotizacion_items"("company_id");

-- AddForeignKey
ALTER TABLE "compras_606" ADD CONSTRAINT "compras_606_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_ecf_seq_counters" ADD CONSTRAINT "company_ecf_seq_counters_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_items" ADD CONSTRAINT "cotizacion_items_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
