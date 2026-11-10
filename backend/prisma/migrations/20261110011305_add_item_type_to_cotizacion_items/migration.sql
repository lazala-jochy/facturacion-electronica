-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_compras_606" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "company_id" INTEGER NOT NULL,
    "periodo" TEXT NOT NULL,
    "rnc_cedula" TEXT NOT NULL,
    "tipo_bienes_servicios" TEXT NOT NULL DEFAULT '02',
    "ncf" TEXT NOT NULL,
    "ncf_modificado" TEXT,
    "fecha_comprobante" TEXT NOT NULL,
    "fecha_pago" TEXT,
    "monto_servicios" REAL NOT NULL DEFAULT 0,
    "monto_bienes" REAL NOT NULL DEFAULT 0,
    "monto_facturado" REAL NOT NULL,
    "itbis_facturado" REAL NOT NULL DEFAULT 0,
    "itbis_retenido" REAL NOT NULL DEFAULT 0,
    "itbis_sujeto_proporcionalidad" REAL NOT NULL DEFAULT 0,
    "itbis_llevado_al_costo" REAL NOT NULL DEFAULT 0,
    "itbis_por_adelantar" REAL NOT NULL DEFAULT 0,
    "itbis_percibido_compras" REAL NOT NULL DEFAULT 0,
    "retencion_renta" REAL NOT NULL DEFAULT 0,
    "tipo_retencion_isr" TEXT,
    "isr_percibido_compras" REAL NOT NULL DEFAULT 0,
    "impuesto_isc" REAL NOT NULL DEFAULT 0,
    "impuestos_otros" REAL NOT NULL DEFAULT 0,
    "monto_propina_legal" REAL NOT NULL DEFAULT 0,
    "forma_pago" TEXT NOT NULL DEFAULT '04',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "compras_606_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_compras_606" ("company_id", "created_at", "fecha_comprobante", "fecha_pago", "forma_pago", "id", "impuesto_isc", "impuestos_otros", "isr_percibido_compras", "itbis_facturado", "itbis_llevado_al_costo", "itbis_percibido_compras", "itbis_por_adelantar", "itbis_retenido", "itbis_sujeto_proporcionalidad", "monto_bienes", "monto_facturado", "monto_propina_legal", "monto_servicios", "ncf", "ncf_modificado", "periodo", "retencion_renta", "rnc_cedula", "tipo_bienes_servicios", "tipo_retencion_isr") SELECT "company_id", "created_at", "fecha_comprobante", "fecha_pago", "forma_pago", "id", "impuesto_isc", "impuestos_otros", "isr_percibido_compras", "itbis_facturado", "itbis_llevado_al_costo", "itbis_percibido_compras", "itbis_por_adelantar", "itbis_retenido", "itbis_sujeto_proporcionalidad", "monto_bienes", "monto_facturado", "monto_propina_legal", "monto_servicios", "ncf", "ncf_modificado", "periodo", "retencion_renta", "rnc_cedula", "tipo_bienes_servicios", "tipo_retencion_isr" FROM "compras_606";
DROP TABLE "compras_606";
ALTER TABLE "new_compras_606" RENAME TO "compras_606";
CREATE INDEX "compras_606_company_id_periodo_idx" ON "compras_606"("company_id", "periodo");
CREATE TABLE "new_cotizacion_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cotizacion_id" INTEGER NOT NULL,
    "item_number" INTEGER NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "item_type" TEXT NOT NULL DEFAULT 'servicio',
    "description" TEXT NOT NULL,
    "unit_price" REAL NOT NULL,
    "total_value" REAL NOT NULL,
    CONSTRAINT "cotizacion_items_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizaciones" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_cotizacion_items" ("cotizacion_id", "description", "id", "item_number", "quantity", "total_value", "unit", "unit_price") SELECT "cotizacion_id", "description", "id", "item_number", "quantity", "total_value", "unit", "unit_price" FROM "cotizacion_items";
DROP TABLE "cotizacion_items";
ALTER TABLE "new_cotizacion_items" RENAME TO "cotizacion_items";
CREATE INDEX "cotizacion_items_cotizacion_id_idx" ON "cotizacion_items"("cotizacion_id");
CREATE TABLE "new_cotizaciones" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "document_title" TEXT NOT NULL DEFAULT 'Pre-factura',
    "fiscal_legend" TEXT NOT NULL DEFAULT 'Sin valor fiscal',
    "payment_terms" TEXT NOT NULL,
    "payment_method" TEXT,
    "account_manager" TEXT NOT NULL,
    "comment" TEXT,
    "subtotal" REAL NOT NULL,
    "itbis" REAL NOT NULL,
    "total" REAL NOT NULL,
    "exento" BOOLEAN NOT NULL DEFAULT false,
    "dgii_track_id" TEXT,
    "dgii_status" TEXT,
    "dgii_response" TEXT,
    "signed_xml" TEXT,
    "dgii_submitted_at" DATETIME,
    "dgii_submit_retry_count" INTEGER NOT NULL DEFAULT 0,
    "dgii_submit_next_retry_at" DATETIME,
    "dgii_submit_last_error" TEXT,
    "dgii_submit_cert_profile" TEXT,
    "formato_607_generado_at" DATETIME,
    "ecf_tipo" TEXT NOT NULL DEFAULT '31',
    "ecf_ncf_seq" INTEGER NOT NULL,
    "ecf_reference_ncf" TEXT,
    "ecf_ri_pdf_path" TEXT,
    "ecf_ri_qr_url" TEXT,
    "ecf_ri_generated_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cotizaciones_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cotizaciones_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_cotizaciones" ("account_manager", "client_id", "comment", "company_id", "created_at", "dgii_response", "dgii_status", "dgii_submit_cert_profile", "dgii_submit_last_error", "dgii_submit_next_retry_at", "dgii_submit_retry_count", "dgii_submitted_at", "dgii_track_id", "document_title", "ecf_ncf_seq", "ecf_reference_ncf", "ecf_ri_generated_at", "ecf_ri_pdf_path", "ecf_ri_qr_url", "ecf_tipo", "exento", "fiscal_legend", "formato_607_generado_at", "id", "itbis", "number", "payment_method", "payment_terms", "signed_xml", "subtotal", "total") SELECT "account_manager", "client_id", "comment", "company_id", "created_at", "dgii_response", "dgii_status", "dgii_submit_cert_profile", "dgii_submit_last_error", "dgii_submit_next_retry_at", "dgii_submit_retry_count", "dgii_submitted_at", "dgii_track_id", "document_title", "ecf_ncf_seq", "ecf_reference_ncf", "ecf_ri_generated_at", "ecf_ri_pdf_path", "ecf_ri_qr_url", "ecf_tipo", "exento", "fiscal_legend", "formato_607_generado_at", "id", "itbis", "number", "payment_method", "payment_terms", "signed_xml", "subtotal", "total" FROM "cotizaciones";
DROP TABLE "cotizaciones";
ALTER TABLE "new_cotizaciones" RENAME TO "cotizaciones";
CREATE INDEX "cotizaciones_company_id_idx" ON "cotizaciones"("company_id");
CREATE INDEX "cotizaciones_client_id_idx" ON "cotizaciones"("client_id");
CREATE UNIQUE INDEX "cotizaciones_company_id_number_key" ON "cotizaciones"("company_id", "number");
CREATE UNIQUE INDEX "cotizaciones_company_id_ecf_tipo_ecf_ncf_seq_key" ON "cotizaciones"("company_id", "ecf_tipo", "ecf_ncf_seq");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- RedefineIndex
DROP INDEX "company_ecf_tipo_seq";
CREATE UNIQUE INDEX "company_ecf_seq_counters_company_id_ecf_tipo_key" ON "company_ecf_seq_counters"("company_id", "ecf_tipo");
