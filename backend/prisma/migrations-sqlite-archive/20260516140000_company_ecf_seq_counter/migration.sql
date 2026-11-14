-- CreateTable
CREATE TABLE "company_ecf_seq_counters" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "company_id" INTEGER NOT NULL,
    "ecf_tipo" TEXT NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "company_ecf_seq_counters_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "company_ecf_tipo_seq" ON "company_ecf_seq_counters"("company_id", "ecf_tipo");

-- CreateIndex
CREATE INDEX "company_ecf_seq_counters_company_id_idx" ON "company_ecf_seq_counters"("company_id");

-- Seed from cotizaciones existentes (máximo por empresa y tipo)
INSERT INTO "company_ecf_seq_counters" ("company_id", "ecf_tipo", "last_seq")
SELECT "company_id", "ecf_tipo", MAX("ecf_ncf_seq")
FROM "cotizaciones"
WHERE "ecf_ncf_seq" > 0
GROUP BY "company_id", "ecf_tipo";
