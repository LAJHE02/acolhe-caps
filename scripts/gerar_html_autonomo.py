"""Gera um arquivo HTML único e 100% autônomo (abrir_direto_no_navegador.html).

Esse arquivo embute o CSS, o JavaScript e uma cópia dos dados públicos do banco SQLite (data/acolhe.db),
permitindo abrir o sistema com DOIS CLIQUES direto no navegador (file://), sem precisar instalar Node.js,
sem instalar Python e sem usar terminal.
"""
import json
import os
import re

import banco
import carga_real
import servidor

RAIZ = banco.RAIZ


def ler(rel):
    with open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def remover_imports_exports(codigo):
    linhas = []
    for linha in codigo.splitlines():
        if re.match(r"^\s*import\s+.*from\s+['\"].*['\"];?\s*$", linha):
            continue
        linha = re.sub(r"^\s*export\s+(async\s+function|function|const|let|var)\s+", r"\1 ", linha)
        linhas.append(linha)
    return "\n".join(linhas)


def gerar():
    caminho_db = os.environ.get("DB_PATH") or banco.DB_PADRAO
    if not os.path.exists(caminho_db):
        carga_real.carregar_amostra_real()

    con = banco.conectar(caminho_db)
    try:
        dados = {rota: servidor.consultar_api(con, rota) for rota in ("meta", "ufs", "modalidades", "municipios", "caps", "serie")}
    finally:
        con.close()

    css = ler("public/css/estilo.css")
    js_partes = [
        "// Dados públicos e agregados exportados do banco SQLite (data/acolhe.db) para execução direta no navegador:",
        f"const DADOS_EMBUTIDOS = {json.dumps(dados, ensure_ascii=False)};",
        "async function carregarDados() { return DADOS_EMBUTIDOS; }",
    ]
    for arq in ("public/js/util.js", "public/js/textos.js", "public/js/mapa.js", "public/js/paginas.js", "public/js/app.js"):
        js_partes.append(f"\n// --- {arq} ---\n" + remover_imports_exports(ler(arq)).replace("const NS =", "const SVG_NS =" if "mapa.js" in arq else "const NS =").replace("createElementNS(NS,", "createElementNS(SVG_NS," if "mapa.js" in arq else "createElementNS(NS,"))

    html = ler("public/index.html")
    html = html.replace('<link rel="stylesheet" href="css/estilo.css">', f"<style>\n{css}\n</style>")
    bloco_js = "\n".join(js_partes)
    html = html.replace('  <script type="module" src="js/app.js"></script>\n', "")
    html = html.replace("</body>", f"<script>\n(() => {{\n{bloco_js}\n}})();\n</script>\n</body>")

    destino_projeto = os.path.join(RAIZ, "abrir_direto_no_navegador.html")
    with open(destino_projeto, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Arquivo HTML autônomo gerado: {destino_projeto} ({os.path.getsize(destino_projeto) // 1024} KB)")
    return destino_projeto, html


if __name__ == "__main__":
    gerar()
