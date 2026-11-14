/*
  Warnings:

  - You are about to drop the `presupuestos` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "companies" ADD COLUMN "email" TEXT;
ALTER TABLE "companies" ADD COLUMN "phone" TEXT;
ALTER TABLE "companies" ADD COLUMN "regime" TEXT DEFAULT 'Régimen general';

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "presupuestos";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "cotizaciones" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "document_title" TEXT NOT NULL DEFAULT 'Pre-factura',
    "fiscal_legend" TEXT NOT NULL DEFAULT 'Sin valor fiscal',
    "payment_terms" TEXT NOT NULL,
    "account_manager" TEXT NOT NULL,
    "subtotal" REAL NOT NULL,
    "itbis" REAL NOT NULL,
    "total" REAL NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cotizaciones_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cotizaciones_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cotizacion_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cotizacion_id" INTEGER NOT NULL,
    "item_number" INTEGER NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit_price" REAL NOT NULL,
    "total_value" REAL NOT NULL,
    CONSTRAINT "cotizacion_items_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizaciones" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "cotizaciones_company_id_idx" ON "cotizaciones"("company_id");

-- CreateIndex
CREATE INDEX "cotizaciones_client_id_idx" ON "cotizaciones"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "cotizaciones_company_id_number_key" ON "cotizaciones"("company_id", "number");

-- CreateIndex
CREATE INDEX "cotizacion_items_cotizacion_id_idx" ON "cotizacion_items"("cotizacion_id");
