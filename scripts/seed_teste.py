"""Popula o banco com dados FICTÍCIOS de teste (is_teste = 1) ou apaga apenas esses dados.

Uso:
    python3 scripts/seed_teste.py            # cria/recria os dados de teste (idempotente)
    python3 scripts/seed_teste.py --limpar   # apaga somente as linhas com is_teste = 1

PLANO (regras usadas para inventar cada valor; semente fixa, então o resultado é repetível):
  municipios : 36 municípios FICTÍCIOS em 8 UFs reais, nomes com "(teste)" e código "T0001"... (nunca
               colide com código IBGE real). População por faixa: pequena (5 a 14 mil), média
               (20 a 140 mil) e grande (160 a 900 mil). Coordenadas = centro aproximado da UF + desvio.
  caps       : quantidade e modalidade por faixa de população (inspirada nas faixas da Portaria
               GM/MS 3.088/2011): <15 mil = nenhum; 15 a 70 mil = CAPS I; 70 a 150 mil = CAPS II + AD
               (+ CAPS i se > 100 mil); > 150 mil = CAPS III + AD III + CAPS i + CAPS II (1 a cada 300 mil).
               Endereço "Rua X, n (endereço fictício)" e telefone "(00) 5550-NNNN" (número inexistente).
  serie_uf   : 12 meses até o mês atual; o último mês = contagem real do teste; os anteriores
               diminuem de forma gradual.
  Casos de borda: município com 0 CAPS, população 0, população vazia, população muito alta (2,4 milhões
               com 2 CAPS), CAPS sem telefone, CAPS sem endereço e sem coordenadas, município sem coordenadas,
               UF com mês faltando na série, UF com valor zero no começo da série.
Nenhum dado pessoal: só valores agregados e serviços inventados.
"""
import random
import sys
from datetime import datetime, timezone

import banco

SEMENTE = 20261124

# UF -> (código, nome, latitude central aprox., longitude central aprox.)
UFS_TESTE = {
    "MG": (31, -18.5, -44.5), "BA": (29, -12.9, -41.7), "PR": (41, -24.9, -51.5), "PE": (26, -8.3, -37.9),
    "RS": (43, -29.7, -53.2), "GO": (52, -15.9, -49.8), "CE": (23, -5.2, -39.3), "PA": (15, -3.9, -52.5),
}
PREFIXOS = ["Vila", "Nova", "Porto", "Santa", "Alto", "Campo", "Serra", "Barra", "Monte", "Rio"]
SUFIXOS = ["Esperança", "Horizonte", "Aurora", "das Flores", "do Sol", "Verde", "Alegre", "Bonita",
           "Serena", "Clara", "das Palmeiras", "do Vale"]
RUAS = ["das Palmeiras", "da Esperança", "do Comércio", "Principal", "das Acácias", "da Paz",
        "do Lago", "Nova", "da Escola", "das Flores"]


def periodos(n=12):
    """Lista de 'AAAA-MM' dos últimos n meses, do mais antigo ao atual."""
    hoje = datetime.now(timezone.utc)
    ano, mes = hoje.year, hoje.month
    lista = []
    for _ in range(n):
        lista.append(f"{ano:04d}-{mes:02d}")
        mes -= 1
        if mes == 0:
            ano, mes = ano - 1, 12
    return list(reversed(lista))


def limpar(con):
    """Apaga só dados de teste, respeitando a ordem das chaves estrangeiras."""
    for tabela in ("serie_uf", "caps", "municipios", "cargas"):
        con.execute(f"DELETE FROM {tabela} WHERE is_teste = 1")


def gerar_municipios(rnd):
    """Retorna lista de dicts de municípios fictícios, incluindo os casos de borda."""
    nomes = [f"{p} {s}" for p in PREFIXOS for s in SUFIXOS]
    rnd.shuffle(nomes)
    ufs = list(UFS_TESTE)
    munis = []
    for i in range(32):
        uf = ufs[i % len(ufs)]
        faixa = rnd.choices(["pequena", "media", "grande"], weights=[3, 5, 3])[0]
        pop = {"pequena": rnd.randint(5_000, 14_000),
               "media": rnd.randint(20_000, 140_000),
               "grande": rnd.randint(160_000, 900_000)}[faixa]
        munis.append({"nome": nomes[i], "uf": uf, "pop": pop})
    # Casos de borda (valores extremos ou vazios).
    munis += [
        {"nome": "Metrópole Modelo", "uf": "MG", "pop": 2_400_000, "forcar_caps": 2},  # muito alto, cobertura baixíssima
        {"nome": "Povoado Zero", "uf": "BA", "pop": 0},                                # população zero
        {"nome": "Vila Sem Dados", "uf": "PA", "pop": None, "forcar_caps": 1},          # população vazia
        {"nome": "Ilha Sem Mapa", "uf": "CE", "pop": 45_000, "sem_coord": True},        # sem coordenadas
    ]
    for n, m in enumerate(munis, start=1):
        m["codigo"] = f"T{n:04d}"
        m["nome_exibido"] = f"{m['nome']} (teste)"
        _, lat, lon = UFS_TESTE[m["uf"]]
        m["lat"] = None if m.get("sem_coord") else round(lat + rnd.uniform(-1.5, 1.5), 5)
        m["lon"] = None if m.get("sem_coord") else round(lon + rnd.uniform(-1.5, 1.5), 5)
    return munis


def modalidades_para(m):
    """Regra de negócio do teste: quais CAPS inventar conforme a população."""
    if "forcar_caps" in m:
        return (["CAPS_II", "CAPS_AD"] if m["forcar_caps"] == 2 else ["CAPS_I"])
    pop = m["pop"] or 0
    if pop < 15_000:
        return []
    if pop < 70_000:
        return ["CAPS_I"]
    if pop < 150_000:
        lista = ["CAPS_II", "CAPS_AD"]
        if pop > 100_000:
            lista.append("CAPSI")
        return lista
    lista = ["CAPS_III", "CAPS_AD_III", "CAPSI", "CAPS_AD"]
    lista += ["CAPS_II"] * (1 + pop // 300_000)
    return lista


def semear(con):
    rnd = random.Random(SEMENTE)
    limpar(con)  # idempotente: recria sempre do zero, sem duplicar
    agora = banco.agora_utc()

    carga_id = con.execute(
        "INSERT INTO cargas (fonte, url, modo, coletado_em, linhas, is_teste) VALUES (?,?,?,?,0,1)",
        ("Dados de teste fictícios (gerados por scripts/seed_teste.py)", None, "teste", agora),
    ).lastrowid

    nomes_mod = {c: n for c, n, *_ in banco.MODALIDADES}
    munis = gerar_municipios(rnd)
    for m in munis:
        con.execute(
            "INSERT INTO municipios (codigo_ibge, nome, codigo_uf, populacao, populacao_ano, populacao_fonte, "
            "latitude, longitude, is_teste) VALUES (?,?,?,?,?,?,?,?,1)",
            (m["codigo"], m["nome_exibido"], UFS_TESTE[m["uf"]][0], m["pop"],
             None if m["pop"] is None else 2022, "Valor fictício de teste", m["lat"], m["lon"]),
        )

    n_caps = 0
    por_uf = {uf: 0 for uf in UFS_TESTE}
    for m in munis:
        for cod_mod in modalidades_para(m):
            n_caps += 1
            tem_coord = m["lat"] is not None
            lat = round(m["lat"] + rnd.uniform(-0.03, 0.03), 5) if tem_coord else None
            lon = round(m["lon"] + rnd.uniform(-0.03, 0.03), 5) if tem_coord else None
            endereco = f"Rua {rnd.choice(RUAS)}, {rnd.randint(10, 999)} (endereço fictício)"
            telefone = f"(00) 5550-{n_caps:04d}"
            if n_caps == 5:      # borda: sem telefone
                telefone = None
            if n_caps == 8:      # borda: sem endereço e sem coordenadas
                endereco, lat, lon = None, None, None
            con.execute(
                "INSERT INTO caps (cnes, nome, modalidade, endereco, bairro, codigo_ibge, latitude, longitude, "
                "telefone, carga_id, is_teste) VALUES (?,?,?,?,?,?,?,?,?,?,1)",
                (f"T{n_caps:06d}", f"{nomes_mod[cod_mod]} {m['nome']} (teste)", cod_mod, endereco,
                 "Centro (fictício)", m["codigo"], lat, lon, telefone, carga_id),
            )
            por_uf[m["uf"]] += 1

    # Série histórica por UF (12 meses). Último mês = contagem do teste; antes disso, cresce aos poucos.
    pers = periodos(12)
    n_serie = 0
    for uf, qtd_final in por_uf.items():
        codigo_uf = UFS_TESTE[uf][0]
        valor = qtd_final
        valores = {}
        for p in reversed(pers):
            valores[p] = valor
            if rnd.random() < 0.35 and valor > 0:
                valor -= 1
        if uf == "CE":                       # borda: valor zero no começo da série
            for p in pers[:3]:
                valores[p] = 0
        if uf == "PA":                       # borda: período sem dados
            del valores[pers[5]]
        for p, q in valores.items():
            con.execute(
                "INSERT INTO serie_uf (codigo_uf, periodo, qtd_caps, carga_id, is_teste) VALUES (?,?,?,?,1)",
                (codigo_uf, p, q, carga_id),
            )
            n_serie += 1

    con.execute("UPDATE cargas SET linhas = ? WHERE id = ?", (n_caps, carga_id))
    con.commit()
    return {"municipios": len(munis), "caps": n_caps, "serie_uf": n_serie, "cargas": 1}


def main():
    con = banco.conectar()
    banco.iniciar(con)
    if "--limpar" in sys.argv:
        limpar(con)
        con.commit()
        print("Dados de teste apagados (linhas com is_teste = 1).")
        return
    resumo = semear(con)
    print("Dados de teste gerados (fictícios):")
    for tabela, qtd in resumo.items():
        print(f"  {tabela}: {qtd} linhas")


if __name__ == "__main__":
    main()
