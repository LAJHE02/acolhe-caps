-- Acolhe CAPS: esquema do banco (SQLite local; compatível com PostgreSQL com pequenos ajustes).
-- Guarda SOMENTE dados públicos e agregados. Nenhuma tabela tem dado pessoal.
-- is_teste = 1 marca dado FICTÍCIO (nunca misturar sem aviso na tela).

PRAGMA foreign_keys = ON;

-- Registro de cada carga de dados (fonte, data de coleta e modo). Alimenta "Fonte: ..., atualizado em ...".
CREATE TABLE IF NOT EXISTS cargas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  fonte        TEXT    NOT NULL,                    -- nome legível da fonte
  url          TEXT,                                -- endpoint ou arquivo usado
  modo         TEXT    NOT NULL CHECK (modo IN ('online', 'offline', 'teste')),
  coletado_em  TEXT    NOT NULL,                    -- ISO 8601 (UTC)
  linhas       INTEGER NOT NULL DEFAULT 0,
  is_teste     INTEGER NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1))
);

-- Unidades da Federação (tabela de apoio, dado de referência do IBGE).
CREATE TABLE IF NOT EXISTS ufs (
  codigo_uf  INTEGER PRIMARY KEY,                   -- código IBGE (2 dígitos)
  sigla      TEXT    NOT NULL UNIQUE,
  nome       TEXT    NOT NULL,
  is_teste   INTEGER NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1))
);

-- Municípios com população (denominador do indicador por 100 mil habitantes).
CREATE TABLE IF NOT EXISTS municipios (
  codigo_ibge      TEXT    PRIMARY KEY,             -- 7 dígitos (IBGE); teste usa prefixo 'T'
  nome             TEXT    NOT NULL,
  codigo_uf        INTEGER NOT NULL REFERENCES ufs (codigo_uf),
  populacao        INTEGER CHECK (populacao IS NULL OR populacao >= 0),
  populacao_ano    INTEGER,
  populacao_fonte  TEXT,
  latitude         REAL,                            -- centro aproximado (pode ser nulo)
  longitude        REAL,
  is_teste         INTEGER NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1))
);
CREATE INDEX IF NOT EXISTS idx_municipios_uf ON municipios (codigo_uf);

-- Modalidades de CAPS (tabela de apoio com a explicação em uma frase).
CREATE TABLE IF NOT EXISTS modalidades (
  codigo       TEXT    PRIMARY KEY,                 -- ex.: CAPS_I, CAPS_AD_III
  nome         TEXT    NOT NULL,
  descricao    TEXT    NOT NULL,                    -- uma frase, linguagem simples
  ordem        INTEGER NOT NULL,
  codigo_cnes  TEXT,                                -- classificação no CNES (A CONFIRMAR na carga real)
  is_teste     INTEGER NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1))
);

-- Serviços (estabelecimentos) CAPS. Telefone e endereço são de serviço público, não de pessoa.
CREATE TABLE IF NOT EXISTS caps (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  cnes         TEXT    NOT NULL UNIQUE,             -- código CNES do estabelecimento; teste usa prefixo 'T'
  nome         TEXT    NOT NULL,
  modalidade   TEXT    NOT NULL REFERENCES modalidades (codigo),
  endereco     TEXT,
  bairro       TEXT,
  codigo_ibge  TEXT    NOT NULL REFERENCES municipios (codigo_ibge),
  latitude     REAL,
  longitude    REAL,
  telefone     TEXT,
  carga_id     INTEGER NOT NULL REFERENCES cargas (id),
  is_teste     INTEGER NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1))
);
CREATE INDEX IF NOT EXISTS idx_caps_municipio ON caps (codigo_ibge);

-- Série histórica: nº de CAPS por UF e mês (cada carga real grava o retrato do mês).
CREATE TABLE IF NOT EXISTS serie_uf (
  codigo_uf  INTEGER NOT NULL REFERENCES ufs (codigo_uf),
  periodo    TEXT    NOT NULL,                      -- 'AAAA-MM'
  qtd_caps   INTEGER NOT NULL CHECK (qtd_caps >= 0),
  carga_id   INTEGER NOT NULL REFERENCES cargas (id),
  is_teste   INTEGER NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1)),
  PRIMARY KEY (codigo_uf, periodo)
);

-- Parâmetros configuráveis, com fonte. 'confirmado' = 0 até a dupla conferir o valor e a fonte.
CREATE TABLE IF NOT EXISTS parametros (
  chave        TEXT    PRIMARY KEY,
  valor        TEXT    NOT NULL,
  fonte        TEXT    NOT NULL,
  url          TEXT,
  confirmado   INTEGER NOT NULL DEFAULT 0 CHECK (confirmado IN (0, 1)),
  observacao   TEXT,
  is_teste     INTEGER NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1))
);
