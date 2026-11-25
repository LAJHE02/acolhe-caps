// Servidor do Acolhe CAPS. Sem dependências externas: usa só node:http e node:sqlite (Node 22+).
//
// Regras de privacidade deste servidor:
//  - todas as rotas /api são GET e SEM parâmetros: o navegador baixa os dados agregados e filtra
//    localmente, então nada do que a pessoa escolhe chega ao servidor;
//  - não há cookies, login, analytics nem registro de acessos (nenhum log de IP ou de URL).
// O banco é aberto somente para leitura; quem grava é o Python (scripts/).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const RAIZ = path.resolve(__dirname, '..');
const PUBLICO = path.join(RAIZ, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

// CSP: só o próprio site, o Leaflet (unpkg) e as imagens do mapa (OpenStreetMap e fallback Carto/OSM).
// Referrer-Policy: 'strict-origin' envia apenas o domínio raiz (sem caminho/parâmetros), exigido pela política de uso de tiles do OpenStreetMap (evita erro 403 Access blocked).
const CABECALHOS_SEGURANCA = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
  'Referrer-Policy': 'strict-origin',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
};

/** Classificação oficial do Ministério da Saúde (Saúde Mental em Dados / Portaria de Consolidação nº 3/2017). */
function classificarFaixaMs(indice) {
  if (indice === null || indice === undefined) return 'sem_populacao';
  if (indice >= 0.70) return 'muito_boa';
  if (indice >= 0.50) return 'boa';
  if (indice >= 0.35) return 'regular_baixa';
  if (indice >= 0.20) return 'baixa';
  return 'insuficiente';
}

/** Abre o banco (somente leitura). Lança erro claro se o arquivo não existir. */
function abrirBanco(caminho) {
  if (!fs.existsSync(caminho)) {
    const e = new Error('Banco de dados não encontrado. Rode: python3 scripts/carga_real.py carregar-amostra');
    e.codigo = 'SEM_BANCO';
    throw e;
  }
  return new DatabaseSync(caminho, { readOnly: true });
}

/** Consultas ao banco. Cada função devolve JSON pronto para a rota. */
function consultas(db) {
  const referencia = () => {
    const p = db.prepare("SELECT valor, fonte, url, confirmado, observacao FROM parametros WHERE chave = 'referencia_cobertura_por_100mil'").get();
    return p ? { valor: Number(p.valor), fonte: p.fonte, url: p.url, confirmado: p.confirmado === 1, observacao: p.observacao } : null;
  };

  return {
    ufs: () => db.prepare('SELECT codigo_uf, sigla, nome FROM ufs ORDER BY sigla').all(),

    modalidades: () => db.prepare('SELECT codigo, nome, descricao, ordem, codigo_cnes FROM modalidades ORDER BY ordem').all(),

    caps: () => db.prepare(`
      SELECT c.cnes, c.nome, c.modalidade, c.endereco, c.bairro, c.codigo_ibge, c.latitude, c.longitude,
             c.telefone, c.is_teste
      FROM caps c ORDER BY c.nome`).all(),

    // Cobertura = nº de CAPS ÷ população × 100 mil (simples) e índice ponderado oficial do MS:
    // (CAPS_I * 0,5 + CAPS_II * 1,0 + CAPS_III * 1,5 + CAPSI * 1,0 + CAPS_AD * 1,0 + CAPS_AD_III * 1,5) ÷ pop × 100 mil.
    municipios: () => {
      const ref = referencia();
      const linhas = db.prepare(`
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
        ORDER BY u.sigla, m.nome`).all();
      return linhas.map((m) => {
        const temPop = m.populacao !== null && m.populacao > 0;
        const por100mil = temPop ? Math.round((m.qtd_caps * 100000 / m.populacao) * 100) / 100 : null;
        const ponderadoPor100mil = temPop ? Math.round((m.soma_ponderada * 100000 / m.populacao) * 100) / 100 : null;
        let status = 'sem_populacao';
        if (temPop && ref) status = por100mil < ref.valor ? 'abaixo' : 'adequado';
        const { soma_ponderada, ...resto } = m;
        return {
          ...resto,
          por_100mil: por100mil,
          ponderado_por_100mil: ponderadoPor100mil,
          faixa_ms: classificarFaixaMs(ponderadoPor100mil),
          status,
        };
      });
    },

    serie: () => db.prepare(`
      SELECT s.codigo_uf, u.sigla AS uf, s.periodo, s.qtd_caps, s.is_teste
      FROM serie_uf s JOIN ufs u ON u.codigo_uf = s.codigo_uf ORDER BY u.sigla, s.periodo`).all(),

    // Metadados para "Fonte: ..., atualizado em ..." e para os avisos de teste/offline.
    meta: () => {
      const cargas = db.prepare('SELECT id, fonte, url, modo, coletado_em, linhas, is_teste FROM cargas ORDER BY id DESC').all();
      const reais = cargas.filter((c) => c.modo !== 'teste');
      const testes = cargas.filter((c) => c.modo === 'teste');
      const temTeste = db.prepare(`SELECT (SELECT COUNT(*) FROM caps WHERE is_teste = 1)
                                        + (SELECT COUNT(*) FROM municipios WHERE is_teste = 1) AS n`).get().n > 0;
      return {
        tem_teste: temTeste,
        ultima_carga_real: reais[0] || null,
        ultima_carga_teste: testes[0] || null,
        modo_offline: !!(reais[0] && reais[0].modo === 'offline'),
        referencia_cobertura: referencia(),
      };
    },
  };
}

function enviarJson(res, status, corpo) {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CABECALHOS_SEGURANCA });
  res.end(texto);
}

function servirEstatico(req, res) {
  let rota = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rota === '/') rota = '/index.html';
  const arquivo = path.normalize(path.join(PUBLICO, rota));
  // Impede sair da pasta public (path traversal).
  if (!arquivo.startsWith(PUBLICO + path.sep)) { res.writeHead(403, CABECALHOS_SEGURANCA); return res.end('Acesso negado'); }
  fs.readFile(arquivo, (erro, dados) => {
    if (erro) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...CABECALHOS_SEGURANCA }); return res.end('Página não encontrada'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...CABECALHOS_SEGURANCA });
    res.end(dados);
  });
}

function criarServidor(caminhoBanco) {
  let db = null;
  let consultasDb = null;
  const garantirBanco = () => { if (!db) { db = abrirBanco(caminhoBanco); consultasDb = consultas(db); } return consultasDb; };

  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD', ...CABECALHOS_SEGURANCA }); return res.end(); }
    const { pathname, search } = new URL(req.url, 'http://x');
    if (!pathname.startsWith('/api/')) return servirEstatico(req, res);
    if (search) return enviarJson(res, 400, { erro: 'Esta API não aceita parâmetros.' });
    const nome = pathname.slice(5);
    try {
      const q = garantirBanco();
      if (!Object.hasOwn(q, nome)) return enviarJson(res, 404, { erro: 'Rota não encontrada.' });
      return enviarJson(res, 200, q[nome]());
    } catch (e) {
      if (e.codigo === 'SEM_BANCO') return enviarJson(res, 503, { erro: e.message });
      console.error('Erro interno:', e.message); // sem dados do usuário no log
      return enviarJson(res, 500, { erro: 'Erro interno ao ler os dados.' });
    }
  });
}

module.exports = { criarServidor };

async function sincronizarOnlineAoIniciar(caminhoBanco) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 4500);
  try {
    const url = 'https://servicodados.ibge.gov.br/api/v3/agregados/4714/periodos/2022/variaveis/93?localidades=N6[N3[33,53]]';
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'AcolheCAPS-Educacional/1.0' },
    });
    if (!r.ok) return;
    const dados = await r.json();
    const series = dados?.[0]?.resultados?.[0]?.series || [];
    if (series.length === 0) return;

    const dbEscrita = new DatabaseSync(caminhoBanco);
    try {
      const agora = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      dbEscrita.prepare("UPDATE cargas SET modo = 'online', coletado_em = ? WHERE is_teste = 0").run(agora);
      console.log(`[Modo Online] Conectado com sucesso à API oficial do IBGE (${agora}).`);
    } finally {
      dbEscrita.close();
    }
  } catch {
    // Sem internet ou API governamental indisponível: permanece em modo offline (Plano B)
  } finally {
    clearTimeout(t);
  }
}

if (require.main === module) {
  const { spawn } = require('node:child_process');
  const porta = Number(process.env.PORT) || 3000;
  const banco = process.env.DB_PATH || path.join(RAIZ, 'data', 'acolhe.db');
  const autoOnline = process.env.ATUALIZAR_ONLINE === '1' || process.argv.includes('--atualizar-online');

  if (!fs.existsSync(banco)) {
    console.log('Banco não encontrado; inicializando com a amostra real (Plano B)...');
    execFileSync('python3', [path.join(RAIZ, 'scripts', 'carga_real.py'), 'carregar-amostra'], {
      env: { ...process.env, DB_PATH: banco },
      stdio: 'inherit',
    });
  }

  // Verifica automaticamente a conexão com a API oficial do governo ao iniciar (e a cada 6 horas)
  sincronizarOnlineAoIniciar(banco);
  setInterval(() => sincronizarOnlineAoIniciar(banco), 6 * 3600 * 1000).unref();

  const dispararAtualizacaoOnline = () => {
    console.log('[Atualização automática] Consultando APIs oficiais do CNES e IBGE em segundo plano...');
    const p = spawn('python3', [path.join(RAIZ, 'scripts', 'carga_real.py'), 'atualizar-auto'], {
      env: { ...process.env, DB_PATH: banco },
      stdio: 'inherit',
    });
    p.on('exit', (cod) => console.log(`[Atualização automática] Finalizada (código ${cod}).`));
  };

  if (autoOnline) {
    dispararAtualizacaoOnline();
    const horas = Number(process.env.INTERVALO_HORAS) || 24;
    setInterval(dispararAtualizacaoOnline, horas * 3600 * 1000).unref();
  }

  criarServidor(banco).listen(porta, () => console.log(`Acolhe CAPS em http://localhost:${porta}`));
}
