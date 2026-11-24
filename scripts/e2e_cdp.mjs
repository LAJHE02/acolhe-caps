// Teste de interface com Chrome headless via protocolo CDP (sem dependências; usa o WebSocket do Node 22).
// Uso: node scripts/e2e_cdp.mjs [http://localhost:3000]
// Verifica: CVV/SAMU visíveis em 360 px em todas as telas, sem rolagem horizontal, avisos (modo offline ou teste),
// fonte, rodapé, busca por município (com e sem CAPS), mapa (Leaflet ou SVG interativo), cobertura, e que NENHUMA
// requisição leva dado do usuário.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BASE = process.argv[2] || 'http://localhost:3000';
const SAIDA = process.env.SAIDA || path.join(tmpdir(), 'acolhe-e2e');
mkdirSync(SAIDA, { recursive: true });
const porta = 9335;
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${porta}`,
  `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'chrome-'))}`, 'about:blank'], { stdio: 'ignore' });
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'OK   ' : 'FALHA'} ${msg}`); if (!cond) falhas++; };

async function conectar() {
  for (let i = 0; i < 40; i++) {
    try { const abas = await (await fetch(`http://127.0.0.1:${porta}/json`)).json(); const aba = abas.find((a) => a.type === 'page'); if (aba) return aba.webSocketDebuggerUrl; } catch { /* espera */ }
    await dorme(250);
  }
  throw new Error('Chrome não iniciou');
}
const ws = new WebSocket(await conectar());
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); const requisicoes = []; const erros = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Network.requestWillBeSent') requisicoes.push(m.params.request.url);
  if (m.method === 'Runtime.exceptionThrown') erros.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const avalia = async (expr) => { const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value; };
const foto = async (nome) => { const r = await cmd('Page.captureScreenshot', { format: 'png' }); writeFileSync(path.join(SAIDA, `${nome}.png`), Buffer.from(r.result.data, 'base64')); };
async function ir(rota) { await cmd('Page.navigate', { url: 'about:blank' }); await dorme(200); await cmd('Page.navigate', { url: `${BASE}/#${rota}` }); await dorme(500); }
async function espera(expr, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await avalia(expr)) return true; await dorme(150); } return false; }

await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Network.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });

const rotas = ['/', '/buscar', '/servicos', '/cobertura', '/sobre'];
for (const r of rotas) {
  await ir(r);
  await espera(`document.querySelector('main h1') !== null`);
  await dorme(400);
  const info = await avalia(`(() => { const a = document.querySelector('.apoio-fixo').getBoundingClientRect();
    window.scrollTo(0, document.body.scrollHeight); const a2 = document.querySelector('.apoio-fixo').getBoundingClientRect(); window.scrollTo(0,0);
    const txt = document.body.innerText;
    return { top: a.top, topRolado: a2.top, largura: document.documentElement.scrollWidth, cvv: !!document.querySelector('a[href="tel:188"]'), samu: !!document.querySelector('a[href="tel:192"]'),
      avisoValido: txt.includes('Dados de teste, não são reais') || txt.includes('(modo offline)'), fonte: txt.includes('Fonte:'),
      rodape: txt.includes('Informativo. Não substitui atendimento de saúde. Emergência: SAMU 192.'), h1: document.querySelector('main h1')?.innerText }; })()`);
  ok(info.top === 0 && info.topRolado === 0 && info.cvv && info.samu, `${r}: CVV 188 e SAMU 192 visíveis no topo (inclusive após rolar)`);
  ok(info.largura <= 360, `${r}: sem rolagem horizontal em 360 px (largura ${info.largura})`);
  ok(info.avisoValido && info.fonte && info.rodape, `${r}: aviso (offline/teste), "Fonte:" e rodapé presentes (h1: ${info.h1})`);
  await foto(`tela${r.replace('/', '_') || '_inicio'}`);
}

// Busca: município com CAPS e município sem CAPS
await ir('/buscar');
await espera(`document.querySelector('#uf') !== null`);
const escolher = (idSel, valor) => avalia(`(() => { const s = document.getElementById('${idSel}'); s.value = '${valor}'; s.dispatchEvent(new Event('change', {bubbles:true})); return s.value; })()`);
await escolher('uf', 'MG');
const opcoes = await avalia(`[...document.querySelectorAll('#municipio option')].map(o => [o.value, o.textContent])`);
ok(opcoes.length >= 2, `busca: UF MG lista municípios (${opcoes.length - 1})`);
const dadosMun = await avalia(`fetch('/api/municipios').then(r => r.json())`);
const comCaps = dadosMun.find((m) => m.uf === 'MG' && m.qtd_caps >= 2);
const semCaps = dadosMun.find((m) => m.qtd_caps === 0 && m.latitude !== null);
await escolher('municipio', comCaps.codigo_ibge);
await dorme(400);
const n1 = await avalia(`document.querySelectorAll('#resultado .cartao').length`);
ok(n1 === comCaps.qtd_caps, `busca: ${comCaps.nome} mostra ${n1} cartões (esperado ${comCaps.qtd_caps})`);
const cartao = await avalia(`document.querySelector('#resultado .cartao').innerText`);
ok(/Endereço/.test(cartao) && /Telefone/.test(cartao) && /Como chegar/.test(cartao), 'busca: cartão tem modalidade explicada, endereço, telefone e como chegar');
ok(await avalia(`document.querySelector('.mapa svg.mapa-svg, .mapa .leaflet-pane') !== null`), 'busca: mapa renderizado (Leaflet ou SVG interativo)');
await foto('busca_com_caps');
await escolher('uf', semCaps.uf); await escolher('municipio', semCaps.codigo_ibge); await dorme(400);
const txt2 = await avalia(`document.getElementById('resultado').innerText`);
ok(/Não encontramos CAPS/.test(txt2) && /mais próximos/.test(txt2), `busca: ${semCaps.nome} (0 CAPS) mostra estado vazio e serviços mais próximos`);
await foto('busca_sem_caps');

// Cobertura
await ir('/cobertura');
await espera(`document.querySelectorAll('table tbody tr').length > 0`);
const cob = await avalia(`document.body.innerText`);
ok(/abaixo da referência de 0,70/.test(cob) && /Referência oficial MS/.test(cob), 'cobertura: resumo e selo "Referência oficial MS" visíveis');
ok(await avalia(`document.querySelector('.mapa svg.mapa-svg, .mapa .leaflet-pane') !== null`), 'cobertura: mapa dos municípios renderizado');
await escolher('uf-cob', 'RS'); await dorme(400);
ok(await avalia(`document.querySelector('svg.grafico') !== null && document.body.innerText.includes('Dados do gráfico')`), 'cobertura: gráfico SVG com tabela equivalente');
await foto('cobertura');

// Privacidade: nenhuma requisição com parâmetros de consulta para o nosso servidor; sem cookies
const nossas = requisicoes.filter((u) => u.startsWith(BASE));
ok(nossas.every((u) => !u.includes('?')), `privacidade: ${nossas.length} requisições ao servidor, todas sem parâmetros`);
ok((await avalia('document.cookie')) === '', 'privacidade: sem cookies');
ok(await avalia(`localStorage.length === 0 && sessionStorage.length === 0`), 'privacidade: nada em localStorage/sessionStorage');
const relevantes = erros.filter((e) => !/leaflet|L is not defined/i.test(e));
ok(relevantes.length === 0, `sem exceções JavaScript não tratadas ${relevantes.length ? JSON.stringify(relevantes) : ''}`);
console.log(`Capturas de tela em ${SAIDA}`);
chrome.kill();
process.exit(falhas ? 1 : 0);
