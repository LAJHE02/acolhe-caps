"""Testa a LÓGICA de carga_real.py contra um servidor FALSO local (payloads inventados, só para teste).
Isso NÃO prova que as APIs reais têm este formato: o formato real precisa ser conferido com 'descobrir'.

Rodar: python3 scripts/test_carga_real.py
"""
import json
import os
import sqlite3
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.dirname(__file__))

# Formato FICTÍCIO, definido só para o teste.
EST_FALSOS = [
    {"id": "9000001", "nm": "CAPS II FICTICIO UM", "mun": "3550308", "end": "Rua Falsa, 1", "mod": "II", "lat": "-23.5", "lon": "-46.6", "tel": "(00) 5550-0001"},
    {"id": "9000002", "nm": "CAPS AD III FICTICIO DOIS", "mun": "3304557", "end": "Rua Falsa, 2", "mod": "ADIII", "lat": None, "lon": None, "tel": None},
    {"id": "9000003", "nm": "OUTRO TIPO FICTICIO", "mun": "3304557", "end": "Rua Falsa, 3", "mod": "ZZZ", "lat": None, "lon": None, "tel": None},
    {"id": "9000004", "nm": "CAPS I FICTICIO MUN INEXISTENTE", "mun": "9999999", "end": "Rua Falsa, 4", "mod": "I", "lat": None, "lon": None, "tel": None},
]
POP_FALSA = [{"id": "93", "resultados": [{"series": [
    {"localidade": {"id": "3550308", "nome": "Município Falso Um - SP"}, "serie": {"2022": "1000000"}},
    {"localidade": {"id": "3304557", "nome": "Município Falso Dois - RJ"}, "serie": {"2022": "-"}},
]}]}]


class Falso(BaseHTTPRequestHandler):
    def do_GET(self):
        if "/agregados/" in self.path:
            corpo = POP_FALSA
        elif "/cnes/estabelecimentos" in self.path:
            corpo = EST_FALSOS
        else:
            self.send_response(404); self.end_headers(); return
        dados = json.dumps(corpo).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(dados)

    def log_message(self, *a):
        pass


class TesteCarga(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        os.environ["DB_PATH"] = os.path.join(self.tmp, "t.db")
        os.environ["ACOLHE_DADOS"] = self.tmp
        self.srv = HTTPServer(("127.0.0.1", 0), Falso)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{self.srv.server_address[1]}"
        os.environ["ACOLHE_DEMAS"] = base
        os.environ["ACOLHE_IBGE"] = base
        for m in [m for m in sys.modules if m in ("carga_real", "banco", "seed_teste")]:
            del sys.modules[m]
        import carga_real, seed_teste  # noqa: E401
        self.cr, self.seed = carga_real, seed_teste
        self.cfg = {
            "confirmado": True,
            "estabelecimentos": {
                "url": f"{base}/cnes/estabelecimentos", "params": {"codigo_tipo_unidade": 70},
                "paginacao": {"limite": 100, "limite_param": "limit", "offset_param": "offset"}, "chave_lista": None,
                "campo_modalidade": "mod",
                "campos": {"cnes": "id", "nome": "nm", "endereco": "end", "bairro": None, "codigo_municipio": "mun",
                           "latitude": "lat", "longitude": "lon", "telefone": "tel"},
            },
            "modalidades": {"CAPS_II": {"valores": ["II"]}, "CAPS_AD_III": {"valores": ["ADIII"]}, "CAPS_I": {"valores": ["I"]}},
        }

    def escreve_cfg(self, **mudancas):
        cfg = {**self.cfg, **mudancas}
        with open(os.path.join(self.tmp, "config_cnes.json"), "w") as f:
            json.dump(cfg, f)

    def consulta(self, sql):
        return sqlite3.connect(os.environ["DB_PATH"]).execute(sql).fetchall()

    def test_recusa_config_nao_confirmada(self):
        self.escreve_cfg(confirmado=False)
        with self.assertRaises(SystemExit):
            self.cr.carregar()

    def test_carga_online_nao_adivinha_modalidade(self):
        self.escreve_cfg()
        # Antes: dados de teste no banco; a carga real deve apagá-los.
        con = self.cr.banco.conectar(); self.cr.banco.iniciar(con); self.seed.semear(con)
        r = self.cr.carregar()
        self.assertEqual(r["modo"], "online")
        self.assertEqual(r["caps"], 2)
        self.assertEqual(r["sem_modalidade"], 1)   # "ZZZ" não é adivinhado
        self.assertEqual(r["sem_municipio"], 1)    # município inexistente é descartado
        self.assertEqual(self.consulta("SELECT COUNT(*) FROM caps WHERE is_teste=1")[0][0], 0)
        self.assertEqual(self.consulta("SELECT populacao FROM municipios WHERE codigo_ibge='3304557'")[0][0], None)  # "-" vira nulo
        self.assertEqual(self.consulta("SELECT modo FROM cargas ORDER BY id DESC LIMIT 1")[0][0], "online")
        self.assertTrue(os.path.exists(os.path.join(self.tmp, "caps.json")))
        self.assertEqual(self.consulta("PRAGMA foreign_key_check"), [])

    def test_plano_b_offline_usa_amostra(self):
        self.escreve_cfg()
        self.cr.carregar()              # online: salva amostras
        self.srv.shutdown(); self.srv.server_close()   # a "API" cai
        r = self.cr.carregar(manter_teste=True)
        self.assertEqual(r["modo"], "offline")
        self.assertEqual(r["caps"], 2)
        self.assertEqual(self.consulta("SELECT modo FROM cargas ORDER BY id DESC LIMIT 1")[0][0], "offline")

    def test_sem_amostra_e_sem_api_para_e_avisa(self):
        self.escreve_cfg()
        self.srv.shutdown(); self.srv.server_close()
        with self.assertRaises(SystemExit):
            self.cr.carregar()


if __name__ == "__main__":
    unittest.main(verbosity=2)
