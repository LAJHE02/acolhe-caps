"""Servidor alternativo em Python puro (biblioteca padrão: http.server + sqlite3).

Permite rodar o Acolhe CAPS com o banco SQLite real (data/acolhe.db) SEM precisar instalar o Node.js.
Uso:
    python3 scripts/servidor.py
"""
import json
import mimetypes
import os
import sqlite3
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import unquote, urlparse

import banco
import carga_real

RAIZ = banco.RAIZ
PUBLICO = os.path.join(RAIZ, "public")


def classificar_faixa_ms(indice):
    if indice is None:
        return "sem_populacao"
    if indice >= 0.70:
        return "muito_boa"
    if indice >= 0.50:
        return "boa"
    if indice >= 0.35:
        return "regular_baixa"
    if indice >= 0.20:
        return "baixa"
    return "insuficiente"


def consultar_api(con, rota):
    con.row_factory = sqlite3.Row

    def ref():
        p = con.execute(
            "SELECT valor, fonte, url, confirmado, observacao FROM parametros WHERE chave = 'referencia_cobertura_por_100mil'"
        ).fetchone()
        if not p:
            return None
        return {
            "valor": float(p["valor"]),
            "fonte": p["fonte"],
            "url": p["url"],
            "confirmado": p["confirmado"] == 1,
            "observacao": p["observacao"],
        }

    if rota == "ufs":
        return [dict(r) for r in con.execute("SELECT codigo_uf, sigla, nome FROM ufs ORDER BY sigla")]
    if rota == "modalidades":
        return [dict(r) for r in con.execute("SELECT codigo, nome, descricao, ordem, codigo_cnes FROM modalidades ORDER BY ordem")]
    if rota == "caps":
        return [
            dict(r)
            for r in con.execute(
                "SELECT cnes, nome, modalidade, endereco, bairro, codigo_ibge, latitude, longitude, telefone, is_teste FROM caps ORDER BY nome"
            )
        ]
    if rota == "municipios":
        r_cob = ref()
        linhas = con.execute(
            """
            SELECT m.codigo_ibge, m.nome, u.sigla AS uf, m.populacao, m.populacao_ano, m.populacao_fonte,
                   m.latitude, m.longitude, m.is_teste,
                   COUNT(c.id) AS qtd_caps,
                   COALESCE(SUM(CASE
                     WHEN c.modalidade = 'CAPS_I' THEN 0.5
                     WHEN c.modalidade IN ('CAPS_III', 'CAPS_AD_III') THEN 1.5
                     WHEN c.id IS NOT NULL THEN 1.0
                     ELSE 0
                   END), 0) AS soma_ponderada
            FROM municipios m
            JOIN ufs u ON u.codigo_uf = m.codigo_uf
            LEFT JOIN caps c ON c.codigo_ibge = m.codigo_ibge
            GROUP BY m.codigo_ibge
            ORDER BY u.sigla, m.nome
            """
        ).fetchall()
        saida = []
        for linha in linhas:
            d = dict(linha)
            soma_pond = d.pop("soma_ponderada")
            pop = d["populacao"]
            tem_pop = pop is not None and pop > 0
            por_100mil = round((d["qtd_caps"] * 100000 / pop), 2) if tem_pop else None
            pond_100mil = round((soma_pond * 100000 / pop), 2) if tem_pop else None
            status = "sem_populacao"
            if tem_pop and r_cob:
                status = "abaixo" if por_100mil < r_cob["valor"] else "adequado"
            d["por_100mil"] = por_100mil
            d["ponderado_por_100mil"] = pond_100mil
            d["faixa_ms"] = classificar_faixa_ms(pond_100mil)
            d["status"] = status
            saida.append(d)
        return saida
    if rota == "serie":
        return [
            dict(r)
            for r in con.execute(
                "SELECT s.codigo_uf, u.sigla AS uf, s.periodo, s.qtd_caps, s.is_teste "
                "FROM serie_uf s JOIN ufs u ON u.codigo_uf = s.codigo_uf ORDER BY u.sigla, s.periodo"
            )
        ]
    if rota == "meta":
        cargas = [dict(r) for r in con.execute("SELECT id, fonte, url, modo, coletado_em, linhas, is_teste FROM cargas ORDER BY id DESC")]
        reais = [c for c in cargas if c["modo"] != "teste"]
        testes = [c for c in cargas if c["modo"] == "teste"]
        tem_teste = (
            con.execute("SELECT (SELECT COUNT(*) FROM caps WHERE is_teste=1) + (SELECT COUNT(*) FROM municipios WHERE is_teste=1)").fetchone()[0]
            > 0
        )
        return {
            "tem_teste": tem_teste,
            "ultima_carga_real": reais[0] if reais else None,
            "ultima_carga_teste": testes[0] if testes else None,
            "modo_offline": bool(reais and reais[0]["modo"] == "offline"),
            "referencia_cobertura": ref(),
        }
    return None


class Manipulador(BaseHTTPRequestHandler):
    def do_GET(self):
        u = urlparse(self.path)
        if u.path.startswith("/api/"):
            if u.query:
                self.responder_json(400, {"erro": "Esta API não aceita parâmetros."})
                return
            nome = u.path[5:]
            con = banco.conectar()
            try:
                dados = consultar_api(con, nome)
            finally:
                con.close()
            if dados is None:
                self.responder_json(404, {"erro": "Rota não encontrada."})
            else:
                self.responder_json(200, dados)
            return

        rota = "/index.html" if u.path == "/" else unquote(u.path)
        arq = os.path.normpath(os.path.join(PUBLICO, rota.lstrip("/")))
        if not arq.startswith(PUBLICO + os.sep) or not os.path.isfile(arq):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Pagina nao encontrada")
            return
        tipo, _ = mimetypes.guess_type(arq)
        with open(arq, "rb") as f:
            conteudo = f.read()
        self.send_response(200)
        self.send_header("Content-Type", (tipo or "application/octet-stream") + ("; charset=utf-8" if tipo and tipo.startswith("text/") else ""))
        self.end_headers()
        self.wfile.write(conteudo)

    def responder_json(self, status, corpo):
        dados = json.dumps(corpo, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(dados)

    def log_message(self, *args):
        pass  # Privacidade: não registra IP nem URL acessada


def main():
    import sys
    caminho_db = os.environ.get("DB_PATH") or banco.DB_PADRAO
    if not os.path.exists(caminho_db):
        carga_real.carregar_amostra_real()
    if os.environ.get("ATUALIZAR_ONLINE") == "1" or "--atualizar-online" in sys.argv:
        print("[auto-update] Consultando APIs oficiais do IBGE e CNES...")
        carga_real.carregar_online(fallback_plano_b=True)
    porta = int(os.environ.get("PORT", "3000"))
    srv = HTTPServer(("127.0.0.1", porta), Manipulador)
    url = f"http://localhost:{porta}"
    print(f"Acolhe CAPS rodando (Python) em {url}")
    if os.environ.get("ABRIR_NAVEGADOR") == "1":
        webbrowser.open(url)
    srv.serve_forever()


if __name__ == "__main__":
    main()
