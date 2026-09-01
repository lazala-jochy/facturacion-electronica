-- CreateTable
CREATE TABLE "compras_606" (
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
    "retencion_renta" REAL NOT NULL DEFAULT 0,
    "tipo_retencion_isr" TEXT,
    "forma_pago" TEXT NOT NULL DEFAULT '02',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "compras_606_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "compras_606_company_id_periodo_idx" ON "compras_606"("company_id", "periodo");
