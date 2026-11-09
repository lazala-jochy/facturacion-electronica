-- Campo para no reportar dos veces el mismo e-CF en el formato 607
ALTER TABLE "cotizaciones" ADD COLUMN "formato_607_generado_at" DATETIME;
