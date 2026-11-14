-- Tipo de comprobante e-CF (31 Fact. crédito fiscal, 32 consumo, etc.) para envío DGII / preview.
ALTER TABLE "cotizaciones" ADD COLUMN "ecf_tipo" TEXT NOT NULL DEFAULT '31';
