-- Rutas de cobro: cada cliente puede tener un cobrador asignado y una zona.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cobrador_id BIGINT REFERENCES usuarios(id);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS zona VARCHAR(80);
CREATE INDEX IF NOT EXISTS idx_clientes_cobrador ON clientes(empresa_id, cobrador_id);

-- Arqueo diario: efectivo que debía entregar un cobrador vs. lo que entregó.
CREATE TABLE IF NOT EXISTS arqueos (
  id                 BIGSERIAL PRIMARY KEY,
  empresa_id         BIGINT NOT NULL REFERENCES empresas(id),
  fecha              DATE NOT NULL,
  cobrador_id        BIGINT NOT NULL REFERENCES usuarios(id),
  efectivo_esperado  NUMERIC(14,2) NOT NULL,
  efectivo_entregado NUMERIC(14,2) NOT NULL CHECK (efectivo_entregado >= 0),
  diferencia         NUMERIC(14,2) NOT NULL,
  observacion        TEXT,
  registrado_por     BIGINT NOT NULL REFERENCES usuarios(id),
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, fecha, cobrador_id)
);
