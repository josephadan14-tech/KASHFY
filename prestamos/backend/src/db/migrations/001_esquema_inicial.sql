-- Esquema inicial. Multi-empresa (SaaS): toda tabla de negocio lleva empresa_id.
-- Montos en NUMERIC(14,2) (lempiras). Nunca float.

CREATE TABLE empresas (
  id            BIGSERIAL PRIMARY KEY,
  nombre        VARCHAR(150) NOT NULL,
  rtn           VARCHAR(20),
  moneda        CHAR(3) NOT NULL DEFAULT 'HNL',
  activa        BOOLEAN NOT NULL DEFAULT TRUE,
  creada_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE usuarios (
  id            BIGSERIAL PRIMARY KEY,
  empresa_id    BIGINT NOT NULL REFERENCES empresas(id),
  nombre        VARCHAR(120) NOT NULL,
  email         VARCHAR(150) NOT NULL,
  password_hash TEXT NOT NULL,
  rol           VARCHAR(20) NOT NULL
                CHECK (rol IN ('ADMIN','EVALUADOR','COBRADOR','CONTADOR')),
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, email)
);

CREATE TABLE clientes (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      BIGINT NOT NULL REFERENCES empresas(id),
  nombres         VARCHAR(150) NOT NULL,
  documento       VARCHAR(30) NOT NULL,          -- DNI / identidad
  telefono        VARCHAR(30),
  direccion       TEXT,
  latitud         NUMERIC(9,6),
  longitud        NUMERIC(9,6),
  limite_credito  NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado          VARCHAR(15) NOT NULL DEFAULT 'ACTIVO'
                  CHECK (estado IN ('ACTIVO','LISTA_NEGRA')),
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, documento)
);

CREATE TABLE creditos (
  id                 BIGSERIAL PRIMARY KEY,
  empresa_id         BIGINT NOT NULL REFERENCES empresas(id),
  cliente_id         BIGINT NOT NULL REFERENCES clientes(id),
  monto              NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  tasa               NUMERIC(8,5) NOT NULL CHECK (tasa >= 0),  -- 0.05 = 5%
  numero_cuotas      INT NOT NULL CHECK (numero_cuotas > 0),
  frecuencia         VARCHAR(10) NOT NULL
                     CHECK (frecuencia IN ('DIARIA','SEMANAL','QUINCENAL','MENSUAL')),
  metodo             VARCHAR(10) NOT NULL
                     CHECK (metodo IN ('FRANCES','ALEMAN','FLAT')),
  fecha_desembolso   DATE NOT NULL,
  -- Configuración de mora (por crédito, copiada de los valores por defecto)
  dias_gracia        INT NOT NULL DEFAULT 0,
  mora_porcentaje_dia NUMERIC(6,4) NOT NULL DEFAULT 0,  -- sobre saldo de la cuota vencida
  mora_monto_fijo    NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado             VARCHAR(12) NOT NULL DEFAULT 'ACTIVO'
                     CHECK (estado IN ('ACTIVO','FINALIZADO','EN_MORA','CASTIGADO')),
  creado_por         BIGINT REFERENCES usuarios(id),
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cuotas (
  id                 BIGSERIAL PRIMARY KEY,
  empresa_id         BIGINT NOT NULL REFERENCES empresas(id),
  credito_id         BIGINT NOT NULL REFERENCES creditos(id) ON DELETE CASCADE,
  numero             INT NOT NULL,
  fecha_vencimiento  DATE NOT NULL,
  capital            NUMERIC(14,2) NOT NULL,
  interes            NUMERIC(14,2) NOT NULL,
  mora               NUMERIC(14,2) NOT NULL DEFAULT 0,
  capital_pagado     NUMERIC(14,2) NOT NULL DEFAULT 0,
  interes_pagado     NUMERIC(14,2) NOT NULL DEFAULT 0,
  mora_pagada        NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado             VARCHAR(10) NOT NULL DEFAULT 'PENDIENTE'
                     CHECK (estado IN ('PENDIENTE','PARCIAL','PAGADO')),
  UNIQUE (credito_id, numero)
);

CREATE TABLE pagos (
  id            BIGSERIAL PRIMARY KEY,
  empresa_id    BIGINT NOT NULL REFERENCES empresas(id),
  credito_id    BIGINT NOT NULL REFERENCES creditos(id),
  fecha_pago    TIMESTAMPTZ NOT NULL DEFAULT now(),
  monto         NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  metodo_pago   VARCHAR(15) NOT NULL CHECK (metodo_pago IN ('EFECTIVO','TRANSFERENCIA')),
  registrado_por BIGINT NOT NULL REFERENCES usuarios(id),
  anulado       BOOLEAN NOT NULL DEFAULT FALSE
);

-- Cómo se repartió cada pago (mora -> interés -> capital) entre cuotas
CREATE TABLE pago_detalle (
  id          BIGSERIAL PRIMARY KEY,
  pago_id     BIGINT NOT NULL REFERENCES pagos(id) ON DELETE CASCADE,
  cuota_id    BIGINT NOT NULL REFERENCES cuotas(id),
  mora        NUMERIC(14,2) NOT NULL DEFAULT 0,
  interes     NUMERIC(14,2) NOT NULL DEFAULT 0,
  capital     NUMERIC(14,2) NOT NULL DEFAULT 0
);

-- Pista de auditoría: solo se inserta, nunca se modifica
CREATE TABLE auditoria (
  id          BIGSERIAL PRIMARY KEY,
  empresa_id  BIGINT NOT NULL REFERENCES empresas(id),
  usuario_id  BIGINT REFERENCES usuarios(id),
  accion      VARCHAR(50) NOT NULL,
  entidad     VARCHAR(50) NOT NULL,
  entidad_id  BIGINT,
  datos       JSONB,
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clientes_empresa   ON clientes(empresa_id);
CREATE INDEX idx_creditos_cliente   ON creditos(cliente_id);
CREATE INDEX idx_creditos_estado    ON creditos(empresa_id, estado);
CREATE INDEX idx_cuotas_vencimiento ON cuotas(empresa_id, fecha_vencimiento, estado);
CREATE INDEX idx_pagos_credito      ON pagos(credito_id);
