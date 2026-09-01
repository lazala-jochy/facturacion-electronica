-- Campos alineados a plantilla DGII «Herramienta Formato 606» (NG 07-2018 / 05-2019)
ALTER TABLE "compras_606" ADD COLUMN "itbis_sujeto_proporcionalidad" REAL NOT NULL DEFAULT 0;
ALTER TABLE "compras_606" ADD COLUMN "itbis_llevado_al_costo" REAL NOT NULL DEFAULT 0;
ALTER TABLE "compras_606" ADD COLUMN "itbis_por_adelantar" REAL NOT NULL DEFAULT 0;
ALTER TABLE "compras_606" ADD COLUMN "itbis_percibido_compras" REAL NOT NULL DEFAULT 0;
ALTER TABLE "compras_606" ADD COLUMN "isr_percibido_compras" REAL NOT NULL DEFAULT 0;
ALTER TABLE "compras_606" ADD COLUMN "impuesto_isc" REAL NOT NULL DEFAULT 0;
ALTER TABLE "compras_606" ADD COLUMN "impuestos_otros" REAL NOT NULL DEFAULT 0;
ALTER TABLE "compras_606" ADD COLUMN "monto_propina_legal" REAL NOT NULL DEFAULT 0;
