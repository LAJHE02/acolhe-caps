// Função Serverless oficial para a Vercel (atende /api/meta, /api/ufs, /api/modalidades, /api/municipios, /api/caps, /api/serie).
// Funciona tanto com o banco SQLite (Node 22+) quanto lendo diretamente a amostra oficial do Plano B
// (data/amostras/amostra_real_cnes_ibge.json) em ambientes serverless onde o disco é somente leitura ou Node 20.
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const CAMINHO_AMOSTRA = path.join(RAIZ, 'data', 'amostras', 'amostra_real_cnes_ibge.json');

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

function consultarAmostra(rota) {
  const bruto = JSON.parse(fs.readFileSync(CAMINHO_AMOSTRA, 'utf-8'));
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
        const temPop = m.populacao !== null && m.populacao > 0;
        const por100mil = temPop ? Math.round((qtdCaps * 100000 / m.populacao) * 100) / 100 : null;
        const pond100mil = temPop ? Math.round((somaPond * 100000 / m.populacao) * 100) / 100 : null;
        return {
          codigo_ibge: m.codigo_ibge,
          nome: m.nome,
          uf: m.uf || mapaUf.get(m.codigo_uf),
          populacao: m.populacao,
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
        modo: 'offline',
        coletado_em: bruto.coletado_em,
        linhas: bruto.caps.length,
        is_teste: 0,
      },
      ultima_carga_teste: null,
      modo_offline: true,
      referencia_cobertura: REFERENCIA_COBERTURA,
    };
  }
  return null;
}

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
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

  const dados = consultarAmostra(rota);
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
