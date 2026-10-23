-- Datos de anulación de pagos: quién, cuándo y por qué.
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS anulado_por BIGINT REFERENCES usuarios(id);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS anulado_en TIMESTAMPTZ;
