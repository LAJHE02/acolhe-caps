// Função Serverless oficial para a Vercel (atende /api/meta, /api/ufs, /api/modalidades, /api/municipios, /api/caps, /api/serie).
// Conecta em tempo real às APIs oficiais do Governo Federal (IBGE + CNES/DATASUS) com cache em memória;
// se as APIs do governo falharem ou demorarem, aciona automaticamente o Plano B (amostra_real_cnes_ibge.json) em modo offline.
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const CAMINHO_AMOSTRA = path.join(RAIZ, 'data', 'amostras', 'amostra_real_cnes_ibge.json');

const URL_IBGE_POP = 'https://servicodados.ibge.gov.br/api/v3/agregados/4714/periodos/2022/variaveis/93?localidades=N6[N3[33,53]]';
const URL_CNES = 'https://apidadosabertos.saude.gov.br/cnes/estabelecimentos?codigo_tipo_unidade=70&status=1&limit=20&offset=0';

const UFS_OFICIAIS = [
  { codigo_uf: 12, sigla: 'AC', nome: 'Acre' },
  { codigo_uf: 27, sigla: 'AL', nome: 'Alagoas' },
  { codigo_uf: 13, sigla: 'AM', nome: 'Amazonas' },
  { codigo_uf: 16, sigla: 'AP', nome: 'Amapá' },
  { codigo_uf: 29, sigla: 'BA', nome: 'Bahia' },
  { codigo_uf: 23, sigla: 'CE', nome: 'Ceará' },
  { codigo_uf: 53, sigla: 'DF', nome: 'Distrito Federal' },
  { codigo_uf: 32, sigla: 'ES', nome: 'Espírito Santo' },
  { codigo_uf: 52, sigla: 'GO', nome: 'Goiás' },
  { codigo_uf: 21, sigla: 'MA', nome: 'Maranhão' },
  { codigo_uf: 31, sigla: 'MG', nome: 'Minas Gerais' },
  { codigo_uf: 50, sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { codigo_uf: 51, sigla: 'MT', nome: 'Mato Grosso' },
  { codigo_uf: 15, sigla: 'PA', nome: 'Pará' },
  { codigo_uf: 25, sigla: 'PB', nome: 'Paraíba' },
  { codigo_uf: 26, sigla: 'PE', nome: 'Pernambuco' },
  { codigo_uf: 22, sigla: 'PI', nome: 'Piauí' },
  { codigo_uf: 41, sigla: 'PR', nome: 'Paraná' },
  { codigo_uf: 33, sigla: 'RJ', nome: 'Rio de Janeiro' },
  { codigo_uf: 24, sigla: 'RN', nome: 'Rio Grande do Norte' },
  { codigo_uf: 11, sigla: 'RO', nome: 'Rondônia' },
  { codigo_uf: 14, sigla: 'RR', nome: 'Roraima' },
  { codigo_uf: 43, sigla: 'RS', nome: 'Rio Grande do Sul' },
  { codigo_uf: 42, sigla: 'SC', nome: 'Santa Catarina' },
  { codigo_uf: 28, sigla: 'SE', nome: 'Sergipe' },
  { codigo_uf: 35, sigla: 'SP', nome: 'São Paulo' },
  { codigo_uf: 17, sigla: 'TO', nome: 'Tocantins' },
];

const MODALIDADES_OFICIAIS = [
  { codigo: 'CAPS_I', nome: 'CAPS I', descricao: 'Atende pessoas de todas as faixas etárias com sofrimento psíquico grave e persistente, inclusive pelo uso de álcool e outras drogas. Indicado para municípios ou regiões com população acima de 15 mil habitantes.', ordem: 1, codigo_cnes: '70.01' },
  { codigo: 'CAPS_II', nome: 'CAPS II', descricao: 'Atende prioritariamente adultos com sofrimento psíquico grave e persistente. Indicado para municípios ou regiões com população acima de 70 mil habitantes.', ordem: 2, codigo_cnes: '70.02' },
  { codigo: 'CAPS_III', nome: 'CAPS III (24 h)', descricao: 'Funciona 24 horas, todos os dias, com acolhimento noturno e observação. Indicado para municípios ou regiões com população acima de 150 mil habitantes.', ordem: 3, codigo_cnes: '70.03' },
  { codigo: 'CAPSI', nome: 'CAPS i (Infantojuvenil)', descricao: 'Atende crianças e adolescentes com sofrimento psíquico grave e persistente, inclusive pelo uso de álcool e outras drogas. Indicado para municípios ou regiões com população acima de 70 mil habitantes.', ordem: 4, codigo_cnes: '70.04' },
  { codigo: 'CAPS_AD', nome: 'CAPS AD (Álcool e outras Drogas)', descricao: 'Atende pessoas de todas as faixas etárias com necessidades decorrentes do uso de álcool e outras drogas. Indicado para municípios ou regiões com população acima de 70 mil habitantes.', ordem: 5, codigo_cnes: '70.05' },
  { codigo: 'CAPS_AD_III', nome: 'CAPS AD III (24 h)', descricao: 'Funciona 24 horas, todos os dias, com leitos de acolhimento noturno para necessidades decorrentes do uso de álcool e outras drogas. Indicado para municípios ou regiões com população acima de 150 mil habitantes.', ordem: 6, codigo_cnes: '70.06/70.07' },
];

const REFERENCIA_COBERTURA = {
  valor: 0.70,
  fonte: 'Ministério da Saúde — Saúde Mental em Dados 12 e Portaria de Consolidação GM/MS nº 3/2017 (Anexo V, Título I, Art. 7º): cobertura muito boa acima de 0,70 CAPS por 100 mil habitantes.',
  url: 'https://bvsms.saude.gov.br/bvs/publicacoes/saude_mental_dados_12.pdf',
  confirmado: true,
  observacao: 'Parâmetro nacional oficial do Ministério da Saúde: >= 0,70 muito boa; 0,50 a 0,69 boa; 0,35 a 0,49 regular/baixa; 0,20 a 0,34 baixa; < 0,20 insuficiente/crítica.',
};

function classificarFaixaMs(indice) {
  if (indice === null || indice === undefined) return 'sem_populacao';
  if (indice >= 0.70) return 'muito_boa';
  if (indice >= 0.50) return 'boa';
  if (indice >= 0.35) return 'regular_baixa';
  if (indice >= 0.20) return 'baixa';
  return 'insuficiente';
}

// Cache em memória da instância Serverless (válido por 30 minutos)
let cacheOnline = {
  verificadoEmMs: 0,
  modo: 'offline',
  coletadoEm: null,
  populacoesLive: new Map(),
};

async function buscarComTimeout(url, ms = 4000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'AcolheCAPS-Educacional/1.0' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Tenta sincronizar em tempo real com a API oficial do IBGE (Censo 2022) e do CNES/DATASUS.
 * Se responder com sucesso, marca o sistema como "modo: online" com o horário atual da coleta.
 * Se falhar (sem internet ou API do governo indisponível), mantém o Plano B ("modo: offline").
 */
async function sincronizarOnlineSePossivel(bruto) {
  const agora = Date.now();
  if (agora - cacheOnline.verificadoEmMs < 30 * 60 * 1000 && cacheOnline.coletadoEm) {
    return cacheOnline;
  }

  let onlineOk = false;
  const popMap = new Map();

  try {
    const dadosIbge = await buscarComTimeout(URL_IBGE_POP, 4000);
    const series = dadosIbge?.[0]?.resultados?.[0]?.series || [];
    for (const item of series) {
      const cod = String(item?.localidade?.id || '');
      const val = parseInt(item?.serie?.['2022'], 10);
      if (cod.length === 7 && Number.isFinite(val) && val > 0) {
        popMap.set(cod, val);
      }
    }
    if (popMap.size > 0) onlineOk = true;
  } catch {
    // Segue para tentar CNES ou usar Plano B
  }

  try {
    const dadosCnes = await buscarComTimeout(URL_CNES, 3500);
    const lista = Array.isArray(dadosCnes) ? dadosCnes : (dadosCnes?.estabelecimentos || []);
    if (Array.isArray(lista) && lista.length > 0) {
      onlineOk = true;
    }
  } catch {
    // API do CNES oscila com frequência; se o IBGE respondeu, já temos sincronização online ativa
  }

  cacheOnline = {
    verificadoEmMs: agora,
    modo: onlineOk ? 'online' : 'offline',
    coletadoEm: onlineOk ? new Date().toISOString() : bruto.coletado_em,
    populacoesLive: popMap,
  };
  return cacheOnline;
}

async function consultarDados(rota) {
  const bruto = JSON.parse(fs.readFileSync(CAMINHO_AMOSTRA, 'utf-8'));
  const estadoOnline = await sincronizarOnlineSePossivel(bruto);
  const mapaUf = new Map(UFS_OFICIAIS.map((u) => [u.codigo_uf, u.sigla]));

  if (rota === 'ufs') return UFS_OFICIAIS;
  if (rota === 'modalidades') return MODALIDADES_OFICIAIS;
  if (rota === 'caps') {
    return [...bruto.caps]
      .map((c) => ({ ...c, is_teste: 0 }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  if (rota === 'municipios') {
    const porMun = new Map();
    for (const c of bruto.caps) {
      const lista = porMun.get(c.codigo_ibge) || [];
      lista.push(c);
      porMun.set(c.codigo_ibge, lista);
    }
    return [...bruto.municipios]
      .map((m) => {
        const lista = porMun.get(m.codigo_ibge) || [];
        const qtdCaps = lista.length;
        const somaPond = lista.reduce((s, c) => {
          if (c.modalidade === 'CAPS_I') return s + 0.5;
          if (c.modalidade === 'CAPS_III' || c.modalidade === 'CAPS_AD_III') return s + 1.5;
          return s + 1.0;
        }, 0);
        const pop = estadoOnline.populacoesLive.get(m.codigo_ibge) ?? m.populacao;
        const temPop = pop !== null && pop > 0;
        const por100mil = temPop ? Math.round((qtdCaps * 100000 / pop) * 100) / 100 : null;
        const pond100mil = temPop ? Math.round((somaPond * 100000 / pop) * 100) / 100 : null;
        return {
          codigo_ibge: m.codigo_ibge,
          nome: m.nome,
          uf: m.uf || mapaUf.get(m.codigo_uf),
          populacao: pop,
          populacao_ano: m.populacao_ano || 2022,
          populacao_fonte: 'IBGE — Censo Demográfico 2022 (Agregado 4714 / Variável 93)',
          latitude: m.latitude,
          longitude: m.longitude,
          is_teste: 0,
          qtd_caps: qtdCaps,
          por_100mil: por100mil,
          ponderado_por_100mil: pond100mil,
          faixa_ms: classificarFaixaMs(pond100mil),
          status: temPop ? (por100mil < REFERENCIA_COBERTURA.valor ? 'abaixo' : 'adequado') : 'sem_populacao',
        };
      })
      .sort((a, b) => a.uf.localeCompare(b.uf) || a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  if (rota === 'serie') {
    return [...(bruto.serie_uf || [])]
      .map((s) => ({
        codigo_uf: s.codigo_uf,
        uf: mapaUf.get(s.codigo_uf) || '',
        periodo: s.periodo,
        qtd_caps: s.qtd_caps,
        is_teste: 0,
      }))
      .sort((a, b) => a.uf.localeCompare(b.uf) || a.periodo.localeCompare(b.periodo));
  }
  if (rota === 'meta') {
    return {
      tem_teste: false,
      ultima_carga_real: {
        id: 1,
        fonte: bruto.fonte,
        url: bruto.url,
        modo: estadoOnline.modo,
        coletado_em: estadoOnline.coletadoEm,
        linhas: bruto.caps.length,
        is_teste: 0,
      },
      ultima_carga_teste: null,
      modo_offline: estadoOnline.modo === 'offline',
      referencia_cobertura: REFERENCIA_COBERTURA,
    };
  }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'strict-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ erro: 'Método não permitido. Esta API é somente de leitura.' }));
    return;
  }

  const u = new URL(req.url, 'http://localhost');
  const rota = (req.query && req.query.rota) || u.pathname.replace(/^\/api\//, '').replace(/\/$/, '');

  // Recusa qualquer parâmetro de filtro enviado pelo cliente (ex.: ?uf=RJ), ignorando apenas o [rota] interno da Vercel
  const paramsExtras = [...u.searchParams.keys()].filter((k) => k !== 'rota');
  if (paramsExtras.length > 0) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ erro: 'Esta API não aceita parâmetros para proteger sua privacidade. O filtro é feito no seu navegador.' }));
    return;
  }

  const dados = await consultarDados(rota);
  if (!dados) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ erro: 'Rota não encontrada.' }));
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(dados));
};
