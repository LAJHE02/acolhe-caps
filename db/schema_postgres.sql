-- Acolhe CAPS: esquema do banco para PostgreSQL (hospedagem persistente em produção, ex.: Cloud Run + Cloud SQL / Neon / Supabase).
-- Guarda SOMENTE dados públicos e agregados. Nenhuma tabela tem dado pessoal.
-- is_teste = 1 marca dado FICTÍCIO (nunca misturar sem aviso na tela).

CREATE TABLE IF NOT EXISTS cargas (
  id           SERIAL PRIMARY KEY,
  fonte        TEXT    NOT NULL,
  url          TEXT,
  modo         TEXT    NOT NULL CHECK (modo IN ('online', 'offline', 'teste')),
  coletado_em  TEXT    NOT NULL,
  linhas       INTEGER NOT NULL DEFAULT 0,
  is_teste     INTEGER NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1))
);

CREATE TABLE IF NOT EXISTS ufs (
  codigo_uf  INTEGER PRIMARY KEY,
  sigla      TEXT    NOT NULL UNIQUE,
  nome       TEXT    NOT NULL,
  is_teste   INTEGER NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1))
);

CREATE TABLE IF NOT EXISTS municipios (
  codigo_ibge      TEXT             PRIMARY KEY,
  nome             TEXT             NOT NULL,
  codigo_uf        INTEGER          NOT NULL REFERENCES ufs (codigo_uf),
  populacao        INTEGER          CHECK (populacao IS NULL OR populacao >= 0),
  populacao_ano    INTEGER,
  populacao_fonte  TEXT,
  latitude         DOUBLE PRECISION,
  longitude        DOUBLE PRECISION,
  is_teste         INTEGER          NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1))
);
CREATE INDEX IF NOT EXISTS idx_municipios_uf ON municipios (codigo_uf);

CREATE TABLE IF NOT EXISTS modalidades (
  codigo       TEXT    PRIMARY KEY,
  nome         TEXT    NOT NULL,
  descricao    TEXT    NOT NULL,
  ordem        INTEGER NOT NULL,
  codigo_cnes  TEXT,
  is_teste     INTEGER NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1))
);

CREATE TABLE IF NOT EXISTS caps (
  id           SERIAL           PRIMARY KEY,
  cnes         TEXT             NOT NULL UNIQUE,
  nome         TEXT             NOT NULL,
  modalidade   TEXT             NOT NULL REFERENCES modalidades (codigo),
  endereco     TEXT,
  bairro       TEXT,
  codigo_ibge  TEXT             NOT NULL REFERENCES municipios (codigo_ibge),
  latitude     DOUBLE PRECISION,
  longitude    DOUBLE PRECISION,
  telefone     TEXT,
  carga_id     INTEGER          NOT NULL REFERENCES cargas (id),
  is_teste     INTEGER          NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1))
);
CREATE INDEX IF NOT EXISTS idx_caps_municipio ON caps (codigo_ibge);

CREATE TABLE IF NOT EXISTS serie_uf (
  codigo_uf  INTEGER NOT NULL REFERENCES ufs (codigo_uf),
  periodo    TEXT    NOT NULL,
  qtd_caps   INTEGER NOT NULL CHECK (qtd_caps >= 0),
  carga_id   INTEGER NOT NULL REFERENCES cargas (id),
  is_teste   INTEGER NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1)),
  PRIMARY KEY (codigo_uf, periodo)
);

CREATE TABLE IF NOT EXISTS parametros (
  chave        TEXT    PRIMARY KEY,
  valor        TEXT    NOT NULL,
  fonte        TEXT    NOT NULL,
  url          TEXT,
  confirmado   INTEGER NOT NULL DEFAULT 0 CHECK (confirmado IN (0, 1)),
  observacao   TEXT,
  is_teste     INTEGER NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1))
);
