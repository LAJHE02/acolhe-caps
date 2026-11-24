"""Utilitários do banco: cria o esquema e carrega as tabelas de apoio (UFs, modalidades, parâmetros).

Só usa a biblioteca padrão do Python (sqlite3), para rodar sem instalar nada.
"""
import os
import sqlite3
from datetime import datetime, timezone

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PADRAO = os.path.join(RAIZ, "data", "acolhe.db")

# Unidades da Federação com código IBGE (dado de referência, não é dado de teste).
UFS = [
    (11, "RO", "Rondônia"), (12, "AC", "Acre"), (13, "AM", "Amazonas"), (14, "RR", "Roraima"),
    (15, "PA", "Pará"), (16, "AP", "Amapá"), (17, "TO", "Tocantins"), (21, "MA", "Maranhão"),
    (22, "PI", "Piauí"), (23, "CE", "Ceará"), (24, "RN", "Rio Grande do Norte"),
    (25, "PB", "Paraíba"), (26, "PE", "Pernambuco"), (27, "AL", "Alagoas"), (28, "SE", "Sergipe"),
    (29, "BA", "Bahia"), (31, "MG", "Minas Gerais"), (32, "ES", "Espírito Santo"),
    (33, "RJ", "Rio de Janeiro"), (35, "SP", "São Paulo"), (41, "PR", "Paraná"),
    (42, "SC", "Santa Catarina"), (43, "RS", "Rio Grande do Sul"), (50, "MS", "Mato Grosso do Sul"),
    (51, "MT", "Mato Grosso"), (52, "GO", "Goiás"), (53, "DF", "Distrito Federal"),
]

# Modalidades: (código, nome, explicação em uma frase revisada conforme página oficial do MS, ordem, código_cnes).
# Códigos CNES confirmados na Tabela de Tipos e Subtipos de Estabelecimento SCNES
# (Tipo 70 = CENTRO DE ATENÇÃO PSICOSSOCIAL; Portaria SAS/MS nº 198/2008 e Portaria GM/MS nº 3.088/2011).
MODALIDADES = [
    ("CAPS_I", "CAPS I",
     "Atende pessoas de todas as idades com sofrimento psíquico intenso ou necessidades ligadas ao uso de álcool e outras drogas, durante o dia (municípios a partir de 15 mil habitantes).",
     1, "70.01"),
    ("CAPS_II", "CAPS II",
     "Atende pessoas com sofrimento psíquico intenso, com acompanhamento diurno por equipe multiprofissional (municípios a partir de 70 mil habitantes).",
     2, "70.02"),
    ("CAPS_III", "CAPS III (24 horas)",
     "Funciona 24 horas por dia, todos os dias, inclusive feriados e fins de semana, com acolhimento noturno para momentos de crise (municípios a partir de 150 mil habitantes).",
     3, "70.03"),
    ("CAPS_AD", "CAPS AD (álcool e outras drogas)",
     "Acolhe pessoas com necessidades ligadas ao uso prejudicial de álcool e outras drogas, com atendimento diurno e sem precisar agendar (municípios a partir de 70 mil habitantes).",
     4, "70.05"),
    ("CAPS_AD_III", "CAPS AD III (24 horas)",
     "Atende pessoas com necessidades ligadas ao uso de álcool e outras drogas e funciona 24 horas por dia, todos os dias, com acolhimento noturno (municípios a partir de 150 mil habitantes).",
     5, "70.06/70.07"),
    ("CAPSI", "CAPS i (infantojuvenil)",
     "Cuida de crianças e adolescentes com sofrimento psíquico intenso, inclusive quando ligado ao uso de álcool e outras drogas (municípios a partir de 70 mil habitantes).",
     6, "70.04"),
]

# Referência de cobertura confirmada: Ministério da Saúde (Saúde Mental em Dados 12 e Portaria de Consolidação nº 3/2017).
PARAMETROS = [
    ("referencia_cobertura_por_100mil", "0.70",
     "Ministério da Saúde – Saúde Mental em Dados 12 e Portaria de Consolidação GM/MS nº 3/2017 (Anexo V, Título I, Art. 7º)",
     "https://www.gov.br/saude/pt-br/composicao/saes/desmad/raps/caps", 1,
     "Parâmetros oficiais do indicador CAPS/100 mil hab. (MS): muito boa (acima de 0,70), boa (0,50 a 0,69), "
     "regular/baixa (0,35 a 0,49), baixa (0,20 a 0,34), insuficiente/crítica (abaixo de 0,20). "
     "No cálculo ponderado do MS, CAPS I pesa 0,5; CAPS II, CAPS i e CAPS AD pesam 1,0; CAPS III e CAPS AD III pesam 1,5."),
]


def agora_utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def conectar(caminho=None):
    caminho = caminho or os.environ.get("DB_PATH") or DB_PADRAO
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    con = sqlite3.connect(caminho)
    con.execute("PRAGMA foreign_keys = ON")
    return con


def criar_esquema(con):
    with open(os.path.join(RAIZ, "db", "schema.sql"), encoding="utf-8") as f:
        con.executescript(f.read())


def carregar_apoio(con):
    """Tabelas de apoio: idempotente (INSERT OR IGNORE / upsert)."""
    con.executemany("INSERT OR IGNORE INTO ufs (codigo_uf, sigla, nome, is_teste) VALUES (?,?,?,0)", UFS)
    con.executemany(
        "INSERT INTO modalidades (codigo, nome, descricao, ordem, codigo_cnes, is_teste) VALUES (?,?,?,?,?,0) "
        "ON CONFLICT(codigo) DO UPDATE SET nome=excluded.nome, descricao=excluded.descricao, "
        "ordem=excluded.ordem, codigo_cnes=excluded.codigo_cnes",
        MODALIDADES,
    )
    con.executemany(
        "INSERT INTO parametros (chave, valor, fonte, url, confirmado, observacao, is_teste) "
        "VALUES (?,?,?,?,?,?,0) "
        "ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, fonte=excluded.fonte, url=excluded.url, "
        "confirmado=excluded.confirmado, observacao=excluded.observacao",
        PARAMETROS,
    )


def iniciar(con):
    criar_esquema(con)
    carregar_apoio(con)
    con.commit()
