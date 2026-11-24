// Testes da API (node --test). Cria um banco temporário com o seed de teste e consulta o servidor.
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { criarServidor } = require('./server');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'acolhe-'));
const dbTemp = path.join(pasta, 'teste.db');
execFileSync('python3', [path.join(__dirname, '..', 'scripts', 'seed_teste.py')], { env: { ...process.env, DB_PATH: dbTemp } });

let servidor, base;
test.before(async () => {
  servidor = criarServidor(dbTemp);
  await new Promise((ok) => servidor.listen(0, ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
test.after(() => { servidor.close(); fs.rmSync(pasta, { recursive: true, force: true }); });

const get = async (p) => { const r = await fetch(base + p); return { r, corpo: r.headers.get('content-type').includes('json') ? await r.json() : await r.text() }; };

test('meta indica dados de teste e traz a referência oficial de cobertura confirmada (0,70)', async () => {
  const { r, corpo } = await get('/api/meta');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(corpo.tem_teste, true);
  assert.strictEqual(corpo.modo_offline, false);
  assert.strictEqual(corpo.referencia_cobertura.confirmado, true);
  assert.strictEqual(corpo.referencia_cobertura.valor, 0.70);
  assert.ok(corpo.ultima_carga_teste.coletado_em);
});

test('municípios: cobertura simples e ponderada por 100 mil e casos de borda', async () => {
  const { corpo } = await get('/api/municipios');
  assert.strictEqual(corpo.length, 36);
  const metropole = corpo.find((m) => m.nome.startsWith('Metrópole'));
  assert.strictEqual(metropole.qtd_caps, 2);
  assert.strictEqual(metropole.por_100mil, 0.08);
  assert.strictEqual(metropole.ponderado_por_100mil, 0.08);
  assert.strictEqual(metropole.status, 'abaixo');
  assert.strictEqual(metropole.faixa_ms, 'insuficiente');
  const semPop = corpo.find((m) => m.nome.startsWith('Vila Sem Dados'));
  assert.strictEqual(semPop.por_100mil, null);
  assert.strictEqual(semPop.status, 'sem_populacao');
  const zero = corpo.find((m) => m.nome.startsWith('Povoado Zero'));
  assert.strictEqual(zero.status, 'sem_populacao');
  assert.ok(corpo.some((m) => m.qtd_caps === 0), 'deve haver município sem CAPS');
  assert.ok(corpo.every((m) => m.is_teste === 1));
});

test('caps, modalidades (com código CNES 70.xx), ufs e série', async () => {
  assert.ok((await get('/api/caps')).corpo.length >= 20);
  const mods = (await get('/api/modalidades')).corpo;
  assert.strictEqual(mods.length, 6);
  assert.ok(mods.every((m) => m.codigo_cnes && m.codigo_cnes.startsWith('70.')));
  assert.strictEqual((await get('/api/ufs')).corpo.length, 27);
  const serie = (await get('/api/serie')).corpo;
  assert.ok(new Set(serie.map((s) => s.periodo)).size >= 12);
});

test('privacidade: a API recusa parâmetros e métodos de escrita; sem cookies', async () => {
  const { r } = await get('/api/caps?municipio=1234');
  assert.strictEqual(r.status, 400);
  const post = await fetch(base + '/api/caps', { method: 'POST', body: 'x' });
  assert.strictEqual(post.status, 405);
  const ok = await fetch(base + '/api/ufs');
  assert.strictEqual(ok.headers.get('set-cookie'), null);
  assert.match(ok.headers.get('content-security-policy'), /connect-src 'self'/);
});

test('rota inexistente e path traversal', async () => {
  assert.strictEqual((await get('/api/nada')).r.status, 404);
  assert.strictEqual((await get('/api/constructor')).r.status, 404);
  const t = await fetch(base + '/..%2Fserver%2Fserver.js');
  assert.ok([403, 404].includes(t.status));
});

test('sem banco: responde 503 com mensagem clara', async () => {
  const s = criarServidor(path.join(pasta, 'nao-existe.db'));
  await new Promise((ok) => s.listen(0, ok));
  const r = await fetch(`http://127.0.0.1:${s.address().port}/api/ufs`);
  assert.strictEqual(r.status, 503);
  s.close();
});

test('carga de amostra real (Plano B / modo offline): is_teste=0 e modo_offline=true', async () => {
  const dbReal = path.join(pasta, 'real.db');
  execFileSync('python3', [path.join(__dirname, '..', 'scripts', 'carga_real.py'), 'carregar-amostra'], {
    env: { ...process.env, DB_PATH: dbReal },
  });
  const s = criarServidor(dbReal);
  await new Promise((ok) => s.listen(0, ok));
  const urlBase = `http://127.0.0.1:${s.address().port}`;
  const meta = await (await fetch(`${urlBase}/api/meta`)).json();
  assert.strictEqual(meta.tem_teste, false);
  assert.strictEqual(meta.modo_offline, true);
  assert.strictEqual(meta.ultima_carga_real.modo, 'offline');
  const caps = await (await fetch(`${urlBase}/api/caps`)).json();
  assert.ok(caps.length >= 150);
  assert.ok(caps.every((c) => c.is_teste === 0));
  s.close();
});
