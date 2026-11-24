"""Carga de dados REAIS (CNES + IBGE) para o banco. Só biblioteca padrão do Python.

Modos de uso:
  1) python3 scripts/carga_real.py carregar [--manter-teste]
       Conecta nas APIs oficiais do Governo Federal (IBGE + CNES/DEMAS), baixa os dados atualizados,
       salva no banco SQLite com modo = 'online' e data/hora da coleta, atualiza data/caps.json e
       recria abrir_direto_no_navegador.html. Se a API cair, aciona o Plano B automaticamente (modo = 'offline').
  2) python3 scripts/carga_real.py carregar-amostra [--manter-teste]
       Carrega imediatamente a amostra real verificada (data/amostras/amostra_real_cnes_ibge.json — Plano B / modo offline).
  3) python3 scripts/carga_real.py descobrir
       Faz requisições reais às APIs DEMAS e IBGE, salva as respostas em data/amostras/ e mostra status e campos.
  4) python3 scripts/carga_real.py centroides
       (opcional) Calcula o centro aproximado de cada município pelas malhas do IBGE.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

import banco
import seed_teste

# As variáveis de ambiente existem só para os testes (servidor falso); em uso normal valem os padrões.
DEMAS = os.environ.get("ACOLHE_DEMAS", "https://apidadosabertos.saude.gov.br")
IBGE = os.environ.get("ACOLHE_IBGE", "https://servicodados.ibge.gov.br/api")
PASTA_DADOS = os.environ.get("ACOLHE_DADOS", os.path.join(banco.RAIZ, "data"))
PASTA_AMOSTRAS = os.path.join(PASTA_DADOS, "amostras")
AMOSTRA_REAL_PADRAO = os.path.join(banco.RAIZ, "data", "amostras", "amostra_real_cnes_ibge.json")
CONFIG = os.path.join(PASTA_DADOS, "config_cnes.json")
SAIDA_JSON = os.path.join(PASTA_DADOS, "caps.json")

# Nomes alternativos de campos aceitos na resposta do CNES (API DEMAS ou dump SCNES).
ALIASES_CAMPOS = {
    "cnes": ["codigo_cnes", "co_cnes", "cnes", "co_unidade"],
    "nome": ["nome_fantasia", "no_fantasia", "nome_razao_social", "no_razao_social", "nome"],
    "endereco": ["endereco_estabelecimento", "no_logradouro", "endereco", "logradouro"],
    "bairro": ["bairro_estabelecimento", "no_bairro", "bairro"],
    "codigo_municipio": ["codigo_municipio", "co_municipio_gestor", "co_municipio", "cod_municipio"],
    "latitude": ["latitude_estabelecimento_decimo_grau", "nu_latitude", "latitude", "lat"],
    "longitude": ["longitude_estabelecimento_decimo_grau", "nu_longitude", "longitude", "lon"],
    "telefone": ["numero_telefone_estabelecimento", "nu_telefone", "telefone", "tel"],
}

# Fontes a descobrir. Na API DEMAS, limit deve ser <= 20 (conforme documentação oficial no Catálogo ODA).
FONTES_DESCOBERTA = {
    "cnes_tipounidades": (f"{DEMAS}/cnes/tipounidades", {}),
    "cnes_estabelecimentos_tipo70": (f"{DEMAS}/cnes/estabelecimentos", {"codigo_tipo_unidade": 70, "limit": 20, "offset": 0}),
    "cnes_servicos_especializados": (f"{DEMAS}/assistencia-a-saude/cnes-servicos-especializados", {"limit": 20, "offset": 0}),
    "ibge_estados": (f"{IBGE}/v1/localidades/estados", {}),
    "ibge_populacao_censo2022": (f"{IBGE}/v3/agregados/4714/periodos/2022/variaveis/93", {"localidades": "N6[all]"}),
}


def requisitar(url, params=None, timeout=45):
    """GET que devolve JSON. Lança exceção em erro de rede/HTTP/JSON."""
    if params:
        url = f"{url}?{urllib.parse.urlencode(params, safe='[]')}"
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "AcolheCAPS-estudo/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8")), r.status


def salvar_amostra(nome, dados):
    os.makedirs(PASTA_AMOSTRAS, exist_ok=True)
    with open(os.path.join(PASTA_AMOSTRAS, f"{nome}.json"), "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1)


def ler_amostra(nome):
    caminho = os.path.join(PASTA_AMOSTRAS, f"{nome}.json")
    if not os.path.exists(caminho):
        return None
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def obter(nome, url, params, modos):
    """Tenta a API; se falhar, usa a amostra salva (plano B). Registra o modo usado em `modos`."""
    try:
        dados, _ = requisitar(url, params)
        salvar_amostra(nome, dados)
        modos.add("online")
        return dados
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
        amostra = ler_amostra(nome)
        if amostra is None:
            raise SystemExit(f"ERRO: {nome} falhou ({e}) e não há amostra salva em data/amostras/. Pare e confira a fonte.")
        print(f"AVISO: {nome} falhou ({e}); usando amostra salva (modo offline).")
        modos.add("offline")
        return amostra


def atualizar_html_autonomo_se_Padrao():
    """Se estivermos atualizando o banco principal do projeto, recria também o HTML de 2 cliques."""
    caminho_atual = os.environ.get("DB_PATH") or banco.DB_PADRAO
    if os.path.abspath(caminho_atual) == os.path.abspath(banco.DB_PADRAO):
        try:
            import gerar_html_autonomo
            gerar_html_autonomo.gerar()
        except Exception as e:  # noqa: BLE001
            print(f"Aviso ao regenerar HTML autônomo: {e}")


# ---------- Plano B: carregar amostra real verificada (CnesWeb + Secretarias + IBGE Censo 2022) ----------
def carregar_amostra_real(caminho_amostra=None, manter_teste=False):
    """Carrega a amostra real salva em data/amostras/amostra_real_cnes_ibge.json (modo offline, is_teste = 0)."""
    caminho = caminho_amostra or os.path.join(PASTA_AMOSTRAS, "amostra_real_cnes_ibge.json")
    if not os.path.exists(caminho) and os.path.exists(AMOSTRA_REAL_PADRAO):
        caminho = AMOSTRA_REAL_PADRAO
    if not os.path.exists(caminho):
        raise SystemExit(f"ERRO: amostra real não encontrada em {caminho}.")

    with open(caminho, encoding="utf-8") as f:
        amostra = json.load(f)

    con = banco.conectar()
    banco.iniciar(con)
    if not manter_teste:
        seed_teste.limpar(con)

    coletado_em = amostra.get("coletado_em") or banco.agora_utc()
    fonte = amostra.get("fonte") or "CNES/DATASUS (Tipo 70 - CAPS) e IBGE Censo Demográfico 2022"
    url = amostra.get("url") or "http://cnes2.datasus.gov.br/Mod_Ind_Unidade_Listar.asp?VTipo=70"

    con.execute("DELETE FROM serie_uf WHERE is_teste = 0")
    con.execute("DELETE FROM caps WHERE is_teste = 0")
    con.execute("DELETE FROM municipios WHERE is_teste = 0")
    con.execute("DELETE FROM cargas WHERE is_teste = 0")

    carga_id = con.execute(
        "INSERT INTO cargas (fonte, url, modo, coletado_em, linhas, is_teste) VALUES (?,?,?,?,0,0)",
        (fonte, url, "offline", coletado_em),
    ).lastrowid

    n_mun = 0
    for m in amostra.get("municipios", []):
        con.execute(
            "INSERT INTO municipios (codigo_ibge, nome, codigo_uf, populacao, populacao_ano, populacao_fonte, "
            "latitude, longitude, is_teste) VALUES (?,?,?,?,?,?,?,?,0) "
            "ON CONFLICT(codigo_ibge) DO UPDATE SET nome=excluded.nome, codigo_uf=excluded.codigo_uf, "
            "populacao=excluded.populacao, populacao_ano=excluded.populacao_ano, "
            "populacao_fonte=excluded.populacao_fonte, latitude=excluded.latitude, longitude=excluded.longitude",
            (
                str(m["codigo_ibge"]),
                m["nome"],
                int(m["codigo_uf"]),
                m.get("populacao"),
                m.get("populacao_ano", 2022),
                m.get("populacao_fonte", "IBGE, Censo Demográfico 2022 (Tabela SIDRA 4714)"),
                m.get("latitude"),
                m.get("longitude"),
            ),
        )
        n_mun += 1

    gravados = []
    for c in amostra.get("caps", []):
        linha = (
            str(c["cnes"]),
            c["nome"].strip(),
            c["modalidade"],
            c.get("endereco"),
            c.get("bairro"),
            str(c["codigo_ibge"]),
            c.get("latitude"),
            c.get("longitude"),
            c.get("telefone"),
            carga_id,
        )
        con.execute(
            "INSERT OR REPLACE INTO caps (cnes, nome, modalidade, endereco, bairro, codigo_ibge, "
            "latitude, longitude, telefone, carga_id, is_teste) VALUES (?,?,?,?,?,?,?,?,?,?,0)",
            linha,
        )
        gravados.append(
            dict(
                zip(
                    ("cnes", "nome", "modalidade", "endereco", "bairro", "codigo_ibge", "latitude", "longitude", "telefone"),
                    linha,
                )
            )
        )

    n_serie = 0
    for s in amostra.get("serie_uf", []):
        con.execute(
            "INSERT OR REPLACE INTO serie_uf (codigo_uf, periodo, qtd_caps, carga_id, is_teste) VALUES (?,?,?,?,0)",
            (int(s["codigo_uf"]), s["periodo"], int(s["qtd_caps"]), carga_id),
        )
        n_serie += 1

    con.execute("UPDATE cargas SET linhas = ? WHERE id = ?", (len(gravados), carga_id))
    con.commit()

    os.makedirs(os.path.dirname(SAIDA_JSON), exist_ok=True)
    with open(SAIDA_JSON, "w", encoding="utf-8") as f:
        json.dump({"coletado_em": coletado_em, "modo": "offline", "fonte": fonte, "caps": gravados}, f, ensure_ascii=False, indent=2)

    print(f"Amostra real carregada (modo offline / Plano B): {n_mun} municípios, {len(gravados)} CAPS, {n_serie} registros de série.")
    atualizar_html_autonomo_se_Padrao()
    return {"modo": "offline", "municipios": n_mun, "caps": len(gravados), "serie_uf": n_serie}


# ---------- etapa 1: descobrir ----------
def descobrir():
    for nome, (url, params) in FONTES_DESCOBERTA.items():
        print(f"\n== {nome}\n   GET {url} {params or ''}")
        try:
            dados, status = requisitar(url, params)
        except Exception as e:  # noqa: BLE001 - queremos mostrar qualquer falha ao aluno
            print(f"   FALHOU: {e}")
            continue
        salvar_amostra(nome, dados)
        itens = dados if isinstance(dados, list) else next((v for v in dados.values() if isinstance(v, list)), None)
        print(f"   HTTP {status}; tipo={type(dados).__name__}; chaves={list(dados)[:8] if isinstance(dados, dict) else '(lista)'}")
        if itens:
            print(f"   {len(itens)} itens; campos do 1º: {list(itens[0])[:30] if isinstance(itens[0], dict) else itens[0]}")
    print("\nAmostras salvas em data/amostras/. Confira os campos e preencha data/config_cnes.json.")


# ---------- etapa 3: carregar online ----------
def ler_config():
    if not os.path.exists(CONFIG):
        raise SystemExit("Falta data/config_cnes.json. Rode 'descobrir' e copie data/config_cnes.exemplo.json.")
    with open(CONFIG, encoding="utf-8") as f:
        cfg = json.load(f)
    if cfg.get("confirmado") is not True:
        raise SystemExit('Config ainda não confirmada: confira os códigos na documentação do CNES e coloque "confirmado": true.')
    faltando = [k for k, v in cfg["estabelecimentos"]["campos"].items() if v is None and k in ("cnes", "nome", "codigo_municipio")]
    if faltando or not cfg["estabelecimentos"].get("params") or not cfg.get("modalidades"):
        raise SystemExit(f"Config incompleta (campos obrigatórios sem valor: {faltando}).")
    return cfg


def extrair_lista(dados, chave):
    if isinstance(dados, list):
        return dados
    if isinstance(dados, dict):
        if chave and chave in dados and isinstance(dados[chave], list):
            return dados[chave]
        for v in dados.values():
            if isinstance(v, list):
                return v
    raise KeyError(f"Lista não encontrada na resposta JSON (chave esperada: {chave})")


def obter_campo(registro, chave_cfg, tipo_campo):
    if chave_cfg and chave_cfg in registro:
        return registro.get(chave_cfg)
    for alias in ALIASES_CAMPOS.get(tipo_campo, []):
        if alias in registro:
            return registro.get(alias)
        if alias.upper() in registro:
            return registro.get(alias.upper())
    return None


def baixar_estabelecimentos(cfg, modos):
    """Pagina a API de estabelecimentos já filtrando pelo tipo de unidade da config."""
    est = cfg["estabelecimentos"]
    pag = est.get("paginacao") or {}
    limite, p_lim, p_off = pag.get("limite", 20), pag.get("limite_param", "limit"), pag.get("offset_param", "offset")
    max_paginas = pag.get("max_paginas", 0)
    tudo, offset, pagina = [], 0, 0
    try:
        while True:
            pagina += 1
            params = {**est["params"], p_lim: limite, p_off: offset}
            dados, _ = requisitar(est["url"], params)
            lote = extrair_lista(dados, est.get("chave_lista"))
            tudo += lote
            if len(lote) < limite or (max_paginas and pagina >= max_paginas):
                break
            offset += limite
        salvar_amostra("cnes_caps_completo", tudo)
        modos.add("online")
        return tudo
    except (urllib.error.URLError, TimeoutError, ValueError, OSError, KeyError) as e:
        amostra = ler_amostra("cnes_caps_completo")
        if amostra is None:
            raise SystemExit(f"ERRO: CNES falhou ({e}) e não há data/amostras/cnes_caps_completo.json.")
        print(f"AVISO: CNES falhou ({e}); usando amostra salva (modo offline).")
        modos.add("offline")
        return amostra


def classificar(registro, cfg):
    """Descobre a modalidade pelo valor do campo configurado. Sem correspondência -> None (não adivinha)."""
    est = cfg["estabelecimentos"]
    valor = registro.get(est["campo_modalidade"]) if est.get("campo_modalidade") else None
    texto = str(valor).strip() if valor is not None else ""
    for codigo, regra in cfg["modalidades"].items():
        if texto and texto in [str(v) for v in regra.get("valores", [])]:
            return codigo
    nome = str(obter_campo(registro, est["campos"].get("nome"), "nome") or "")
    for codigo, regra in cfg["modalidades"].items():
        rx = regra.get("regex_nome")
        if rx and re.search(rx, nome, re.IGNORECASE):
            return codigo
    return None


def numero(v):
    try:
        return float(str(v).replace(",", ".")) if v not in (None, "") else None
    except ValueError:
        return None


def carregar_populacao(con, modos):
    """IBGE agregados: população por município (id, 'Nome - UF', valor)."""
    url, params = FONTES_DESCOBERTA["ibge_populacao_censo2022"]
    dados = obter("ibge_populacao_censo2022", url, params, modos)
    ufs_por_sigla = {s: c for c, s, _ in banco.UFS}
    n = 0
    for serie in dados[0]["resultados"][0]["series"]:
        loc = serie["localidade"]
        nome, _, sigla = loc["nome"].rpartition(" - ")
        valor = next(iter(serie["serie"].values()), None)
        if sigla not in ufs_por_sigla:
            continue
        pop = int(valor) if valor and valor.isdigit() else None
        con.execute(
            "INSERT INTO municipios (codigo_ibge, nome, codigo_uf, populacao, populacao_ano, populacao_fonte, is_teste) "
            "VALUES (?,?,?,?,?,?,0) ON CONFLICT(codigo_ibge) DO UPDATE SET nome=excluded.nome, "
            "populacao=excluded.populacao, populacao_ano=excluded.populacao_ano, populacao_fonte=excluded.populacao_fonte",
            (loc["id"], nome, ufs_por_sigla[sigla], pop, 2022, "IBGE, Censo Demográfico 2022 (tabela SIDRA 4714)"),
        )
        n += 1
    return n


def carregar(manter_teste=False, fallback_amostra_verificada=False):
    cfg = ler_config()
    con = banco.conectar()
    banco.iniciar(con)
    modos = set()
    agora = banco.agora_utc()
    if not manter_teste:
        seed_teste.limpar(con)
    try:
        n_mun = carregar_populacao(con, modos)
        registros = baixar_estabelecimentos(cfg, modos)
    except SystemExit:
        if fallback_amostra_verificada and os.path.exists(AMOSTRA_REAL_PADRAO):
            print("AVISO: APIs online indisponíveis no momento; mantendo/acionando amostra real do Plano B (modo offline).")
            con.close()
            return carregar_amostra_real(manter_teste=manter_teste)
        raise

    modo = "offline" if "offline" in modos else "online"

    carga_id = con.execute(
        "INSERT INTO cargas (fonte, url, modo, coletado_em, linhas, is_teste) VALUES (?,?,?,?,0,0)",
        ("CNES (Ministério da Saúde, API de Dados Abertos) e IBGE", cfg["estabelecimentos"]["url"], modo, agora),
    ).lastrowid

    campos = cfg["estabelecimentos"]["campos"]
    cod7_por_6 = {r[0][:6]: r[0] for r in con.execute("SELECT codigo_ibge FROM municipios WHERE is_teste = 0")}
    con.execute("DELETE FROM caps WHERE is_teste = 0")  # recarga completa: substitui o retrato anterior
    gravados, sem_mod, sem_mun = [], 0, 0
    for r in registros:
        mod = classificar(r, cfg)
        if mod is None:
            sem_mod += 1
            continue
        cod = str(obter_campo(r, campos.get("codigo_municipio"), "codigo_municipio") or "")
        cod = cod if len(cod) == 7 else cod7_por_6.get(cod[:6])
        if cod not in cod7_por_6.values():
            sem_mun += 1
            continue
        get = lambda k: obter_campo(r, campos.get(k), k)  # noqa: E731
        linha = (str(get("cnes")), str(get("nome")).strip(), mod, get("endereco"), get("bairro"), cod,
                 numero(get("latitude")), numero(get("longitude")), get("telefone"), carga_id)
        con.execute("INSERT OR REPLACE INTO caps (cnes, nome, modalidade, endereco, bairro, codigo_ibge, latitude, longitude, "
                    "telefone, carga_id, is_teste) VALUES (?,?,?,?,?,?,?,?,?,?,0)", linha)
        gravados.append(dict(zip(("cnes", "nome", "modalidade", "endereco", "bairro", "codigo_ibge", "latitude", "longitude", "telefone"), linha)))

    # Série histórica: grava o retrato do mês corrente por UF (cada carga acrescenta/atualiza o mês).
    periodo = agora[:7]
    for codigo_uf, qtd in con.execute(
            "SELECT m.codigo_uf, COUNT(c.id) FROM caps c JOIN municipios m ON m.codigo_ibge = c.codigo_ibge "
            "WHERE c.is_teste = 0 GROUP BY m.codigo_uf").fetchall():
        con.execute("INSERT OR REPLACE INTO serie_uf (codigo_uf, periodo, qtd_caps, carga_id, is_teste) VALUES (?,?,?,?,0)",
                    (codigo_uf, periodo, qtd, carga_id))
    con.execute("UPDATE cargas SET linhas = ? WHERE id = ?", (len(gravados), carga_id))
    con.commit()
    os.makedirs(os.path.dirname(SAIDA_JSON), exist_ok=True)
    with open(SAIDA_JSON, "w", encoding="utf-8") as f:
        json.dump({"coletado_em": agora, "modo": modo, "caps": gravados}, f, ensure_ascii=False, indent=1)
    print(f"Modo: {modo}. Municípios: {n_mun}. CAPS gravados: {len(gravados)}. "
          f"Ignorados sem modalidade reconhecida: {sem_mod}; sem município no IBGE: {sem_mun}.")
    if sem_mod:
        print("Confira a config: registros sem modalidade NÃO foram adivinhados.")
    atualizar_html_autonomo_se_Padrao()
    return {"modo": modo, "municipios": n_mun, "caps": len(gravados), "sem_modalidade": sem_mod, "sem_municipio": sem_mun}


# ---------- etapa 4: centroides (opcional) ----------
def centroides():
    """Centro aproximado (centro da caixa que envolve o polígono) de cada município, por UF, pelas malhas do IBGE."""
    con = banco.conectar()
    modos = set()
    total = 0
    for codigo_uf, sigla, _ in banco.UFS:
        url = f"{IBGE}/v3/malhas/estados/{sigla}"
        params = {"intrarregiao": "municipio", "formato": "application/vnd.geo+json", "qualidade": "minima"}
        geo = obter(f"ibge_malha_{sigla}", url, params, modos)
        for feat in geo.get("features", []):
            cod = str(feat["properties"].get("codarea"))
            pontos = []

            def coletar(c):
                if c and isinstance(c[0], (int, float)):
                    pontos.append(c)
                else:
                    for x in c:
                        coletar(x)
            coletar(feat["geometry"]["coordinates"])
            if not pontos:
                continue
            lon = (min(p[0] for p in pontos) + max(p[0] for p in pontos)) / 2
            lat = (min(p[1] for p in pontos) + max(p[1] for p in pontos)) / 2
            total += con.execute("UPDATE municipios SET latitude=?, longitude=? WHERE codigo_ibge=? AND is_teste=0",
                                 (round(lat, 5), round(lon, 5), cod)).rowcount
    con.commit()
    print(f"Centros aproximados gravados para {total} municípios.")
    atualizar_html_autonomo_se_Padrao()
    return total


if __name__ == "__main__":
    comando = sys.argv[1] if len(sys.argv) > 1 else ""
    if comando == "carregar-amostra":
        carregar_amostra_real(manter_teste="--manter-teste" in sys.argv)
    elif comando == "descobrir":
        descobrir()
    elif comando in ("carregar", "atualizar-auto"):
        carregar(
            manter_teste="--manter-teste" in sys.argv,
            fallback_amostra_verificada=(comando == "atualizar-auto" or "--fallback-plano-b" in sys.argv),
        )
    elif comando == "centroides":
        centroides()
    else:
        print(__doc__)
