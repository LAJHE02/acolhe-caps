// Telas do app. Cada função recebe os dados já carregados e devolve um elemento de DOM.
import { h, fmtData, fmtNum, fmtDec, distanciaKm, telaVazia, linkTelefone, linkComoChegar } from './util.js';
import { desenharMapa } from './mapa.js';
import { INICIO, SERVICOS, TEXTOS_REVISADOS } from './textos.js';

const seloRevisao = () => (TEXTOS_REVISADOS ? null : h('span', { class: 'selo' }, 'Texto em revisão'));

/** "Fonte: <nome>, atualizado em <data>" — aparece em toda tela. */
function linhaFonte(meta, extra) {
  const linhas = [];
  const r = meta.ultima_carga_real;
  const t = meta.ultima_carga_teste;
  if (r) linhas.push(`Fonte: ${r.fonte}, atualizado em ${fmtData(r.coletado_em)}${r.modo === 'offline' ? ' (modo offline)' : ''}.`);
  if (t && meta.tem_teste) linhas.push(`Fonte: ${t.fonte}, gerado em ${fmtData(t.coletado_em)}. Dados de teste, não são reais.`);
  if (!linhas.length) linhas.push('Fonte: não informada.');
  if (extra) linhas.push(extra);
  return h('div', { class: 'fonte' }, linhas.map((l) => h('p', {}, l)));
}

const nomeModalidade = (d, cod) => (d.modalidades.find((m) => m.codigo === cod) || { nome: cod }).nome;
const descModalidade = (d, cod) => (d.modalidades.find((m) => m.codigo === cod) || { descricao: '' }).descricao;

/** Cartão de um serviço: modalidade com explicação, endereço, telefone e como chegar. */
function cartaoCaps(d, c, numero, municipio, distancia) {
  return h('li', { class: 'cartao' },
    h('h3', {}, h('span', { class: 'num', 'aria-hidden': 'true' }, numero), c.nome, c.is_teste ? h('span', { class: 'selo' }, 'Teste') : null),
    h('p', { class: 'modalidade' }, `${nomeModalidade(d, c.modalidade)} (CNES ${c.cnes})`),
    h('p', {}, descModalidade(d, c.modalidade)),
    h('p', {}, h('strong', {}, 'Endereço: '), c.endereco ? `${c.endereco}${c.bairro ? ` – ${c.bairro}` : ''}` : 'não informado na listagem resumida do CNES (consulte a Secretaria Municipal de Saúde)', municipio ? ` – ${municipio.nome}/${municipio.uf}` : ''),
    h('p', {}, h('strong', {}, 'Telefone: '), c.telefone ? linkTelefone(c.telefone) : 'não informado'),
    distancia !== undefined ? h('p', {}, h('strong', {}, 'Distância aproximada: '), `${fmtNum(Math.round(distancia))} km (em linha reta, a partir do centro da cidade)`) : null,
    h('p', {}, linkComoChegar(c)));
}

/** Conteúdo do popup do mapa: elemento de DOM (nunca HTML em texto). */
const popup = (c, d) => h('div', {}, h('strong', {}, c.nome), h('br'), `${nomeModalidade(d, c.modalidade)} (CNES ${c.cnes})`, h('br'), c.endereco || 'Endereço não informado', h('br'), c.telefone || 'Telefone não informado');

// ---------- Início ----------
export function paginaInicio(d) {
  return h('div', {},
    h('h1', {}, INICIO.titulo, seloRevisao()),
    INICIO.paragrafos.map((p) => h('p', {}, p)),
    h('div', { class: 'botoes' },
      h('a', { class: 'botao', href: '#/buscar' }, 'Buscar um serviço perto de mim'),
      h('a', { class: 'botao botao-sec', href: '#/servicos' }, 'Entender cada serviço')),
    h('section', { class: 'caixa-ajuda', 'aria-labelledby': 'h-ajuda' },
      h('h2', { id: 'h-ajuda' }, INICIO.ajudaAgoraTitulo),
      INICIO.ajudaAgora.map((p) => h('p', {}, p))),
    linhaFonte(d.meta));
}

// ---------- Busca por município ----------
export function paginaBuscar(d) {
  const ufsComMunicipio = d.ufs.filter((u) => d.municipios.some((m) => m.uf === u.sigla));
  const selUf = h('select', { id: 'uf', 'aria-describedby': 'dica-busca' },
    h('option', { value: '' }, 'Escolha o estado'),
    ufsComMunicipio.map((u) => h('option', { value: u.sigla }, `${u.sigla} – ${u.nome}`)));
  const selMun = h('select', { id: 'municipio', disabled: true }, h('option', { value: '' }, 'Escolha primeiro o estado'));
  const resultado = h('div', { id: 'resultado', 'aria-live': 'polite' });
  const mapaEl = h('div', { class: 'mapa', hidden: true });

  selUf.addEventListener('change', () => {
    const lista = d.municipios.filter((m) => m.uf === selUf.value);
    selMun.replaceChildren(h('option', { value: '' }, lista.length ? 'Escolha o município' : 'Escolha primeiro o estado'),
      ...lista.map((m) => h('option', { value: m.codigo_ibge }, m.nome)));
    selMun.disabled = lista.length === 0;
    resultado.replaceChildren();
    mapaEl.hidden = true;
  });
  selMun.addEventListener('change', () => mostrar(selMun.value));

  function mostrar(codigo) {
    resultado.replaceChildren();
    mapaEl.hidden = true;
    const mun = d.municipios.find((m) => m.codigo_ibge === codigo);
    if (!mun) return;
    const caps = d.caps.filter((c) => c.codigo_ibge === codigo);
    const titulo = h('h2', { tabindex: '-1' }, `Serviços em ${mun.nome}/${mun.uf}`);
    if (caps.length) {
      resultado.append(titulo, h('p', {}, `${caps.length} ${caps.length === 1 ? 'serviço encontrado' : 'serviços encontrados'}. A mesma informação está no mapa e na lista.`),
        h('ol', { class: 'lista' }, caps.map((c, i) => cartaoCaps(d, c, i + 1, null))));
      mapaEl.hidden = false;
      desenharMapa(mapaEl, caps.map((c, i) => ({ lat: c.latitude, lon: c.longitude, rotulo: i + 1, texto: `${i + 1}. ${c.nome}`, descricao: popup(c, d) })),
        `Mapa com ${caps.length} serviços em ${mun.nome}. A lista acima traz as mesmas informações em texto.`);
    } else {
      resultado.append(titulo, telaVazia(`Não encontramos CAPS cadastrado em ${mun.nome}. Isso é comum em cidades pequenas, que usam serviços de cidades da região. Procure a UBS do seu bairro ou a Secretaria Municipal de Saúde para ser orientado.`));
      if (mun.latitude !== null && mun.longitude !== null) {
        const proximos = d.caps.filter((c) => c.latitude !== null && c.longitude !== null)
          .map((c) => ({ c, km: distanciaKm(mun.latitude, mun.longitude, c.latitude, c.longitude) }))
          .sort((a, b) => a.km - b.km).slice(0, 5);
        if (proximos.length) {
          resultado.append(h('h3', {}, 'Serviços mais próximos'),
            h('ol', { class: 'lista' }, proximos.map(({ c, km }, i) => cartaoCaps(d, c, i + 1, d.municipios.find((m) => m.codigo_ibge === c.codigo_ibge), km))));
          mapaEl.hidden = false;
          desenharMapa(mapaEl, proximos.map(({ c }, i) => ({ lat: c.latitude, lon: c.longitude, rotulo: i + 1, texto: `${i + 1}. ${c.nome}`, descricao: popup(c, d) })),
            `Mapa com os ${proximos.length} serviços mais próximos de ${mun.nome}. A lista acima traz as mesmas informações em texto.`);
        }
      } else {
        resultado.append(h('p', {}, 'Não temos a localização desta cidade para calcular os serviços mais próximos.'));
      }
    }
  }

  return h('div', {},
    h('h1', {}, 'Buscar serviço por município'),
    h('p', {}, 'Escolha o estado e o município. A escolha fica só no seu aparelho e não é enviada nem guardada.'),
    h('p', { id: 'dica-busca', class: 'dica' }, 'Não há campo para digitar: você escolhe nas listas.'),
    h('label', { for: 'uf' }, 'Estado'), selUf,
    h('label', { for: 'municipio' }, 'Município'), selMun,
    resultado, mapaEl,
    linhaFonte(d.meta));
}

// ---------- O que é cada serviço ----------
export function paginaServicos(d) {
  return h('div', {},
    h('h1', {}, SERVICOS.titulo, seloRevisao()),
    h('p', {}, SERVICOS.intro),
    h('h2', {}, 'CAPS por modalidade (Tipo de unidade CNES 70)'),
    h('dl', {}, d.modalidades.flatMap((m) => [
      h('dt', {}, h('strong', {}, m.nome), m.codigo_cnes ? h('span', { class: 'selo' }, `CNES ${m.codigo_cnes}`) : null),
      h('dd', {}, m.descricao),
    ])),
    h('h2', {}, SERVICOS.ubsTitulo), h('p', {}, SERVICOS.ubs),
    h('h2', {}, SERVICOS.encaminhamentoTitulo),
    h('ul', {}, SERVICOS.encaminhamento.map((t) => h('li', {}, t))),
    h('p', {}, h('a', { href: 'https://www.gov.br/saude/pt-br/composicao/saes/desmad/raps/caps', target: '_blank', rel: 'noopener noreferrer' }, 'Saiba mais no site do Ministério da Saúde (abre em outra aba)')),
    h('p', { class: 'fonte' }, 'Fonte das explicações: Ministério da Saúde, página “Centros de Atenção Psicossocial” (gov.br/saude), Portaria GM/MS nº 3.088/2011 e Tabela de Tipos e Subtipos de Estabelecimento SCNES (Tipo 70), consultadas em 24/11/2026.'),
    linhaFonte(d.meta));
}

// ---------- Cobertura ----------
const ROTULO_STATUS = { abaixo: 'Abaixo da referência', adequado: 'Na referência ou acima', sem_populacao: 'Sem população informada' };

export function paginaCobertura(d) {
  const ref = d.meta.referencia_cobertura;
  const selUf = h('select', { id: 'uf-cob' }, h('option', { value: '' }, 'Todos os estados'),
    d.ufs.filter((u) => d.municipios.some((m) => m.uf === u.sigla)).map((u) => h('option', { value: u.sigla }, `${u.sigla} – ${u.nome}`)));
  const area = h('div', { 'aria-live': 'polite' });
  const mapaEl = h('div', { class: 'mapa' });
  const graficoEl = h('div', {});

  const render = () => {
    const uf = selUf.value;
    const lista = d.municipios.filter((m) => !uf || m.uf === uf);
    if (!lista.length) { area.replaceChildren(telaVazia('Nenhum município para mostrar.')); return; }
    // Ordem: primeiro os abaixo da referência (menor cobertura primeiro), depois os demais.
    const peso = { abaixo: 0, adequado: 1, sem_populacao: 2 };
    const ord = [...lista].sort((a, b) => peso[a.status] - peso[b.status] || (a.por_100mil ?? 0) - (b.por_100mil ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
    const comPop = lista.filter((m) => m.status !== 'sem_populacao');
    const abaixo = lista.filter((m) => m.status === 'abaixo');
    const resumo = ref
      ? `${abaixo.length} de ${comPop.length} municípios com população informada estão abaixo da referência de ${fmtDec(ref.valor)} CAPS por 100 mil habitantes.`
      : 'A referência de cobertura não está cadastrada.';
    area.replaceChildren(
      h('p', {}, h('strong', {}, resumo)),
      h('div', { class: 'tabela-rolagem' }, h('table', {},
        h('caption', {}, `Cobertura de CAPS por município${uf ? ` – ${uf}` : ''}`),
        h('thead', {}, h('tr', {}, ['Município', 'UF', 'População', 'CAPS', 'CAPS por 100 mil', 'Índice ponderado MS', 'Situação'].map((t, i) => h('th', { scope: 'col', class: i >= 2 && i <= 5 ? 'n' : null }, t)))),
        h('tbody', {}, ord.map((m) => h('tr', {},
          h('th', { scope: 'row' }, m.nome), h('td', {}, m.uf), h('td', { class: 'n' }, fmtNum(m.populacao)), h('td', { class: 'n' }, fmtNum(m.qtd_caps)),
          h('td', { class: 'n' }, fmtDec(m.por_100mil)),
          h('td', { class: 'n' }, fmtDec(m.ponderado_por_100mil)),
          h('td', { class: m.status === 'abaixo' ? 'situacao-abaixo' : null }, `${m.status === 'abaixo' ? '▼ ' : m.status === 'adequado' ? '✓ ' : '? '}${ROTULO_STATUS[m.status]}`)))))));
    desenharMapa(mapaEl, lista.map((m) => ({
      lat: m.latitude, lon: m.longitude,
      rotulo: m.status === 'abaixo' ? '!' : m.status === 'adequado' ? '✓' : '?',
      classe: m.status === 'abaixo' ? 'pino-abaixo' : m.status === 'adequado' ? 'pino-ok' : 'pino-sem',
      texto: `${m.nome}/${m.uf}: ${ROTULO_STATUS[m.status]} (${fmtDec(m.por_100mil)} por 100 mil)`,
      descricao: h('div', {}, h('strong', {}, `${m.nome}/${m.uf}`), h('br'), `${fmtNum(m.qtd_caps)} CAPS (${fmtDec(m.por_100mil)} por 100 mil; ponderado MS: ${fmtDec(m.ponderado_por_100mil)})`, h('br'), ROTULO_STATUS[m.status]),
    })), `Mapa dos municípios: ${abaixo.length} abaixo da referência, marcados com losango e o símbolo “!”. A tabela acima traz as mesmas informações em texto.`);
    graficoEl.replaceChildren(graficoSerie(d, uf));
  };
  selUf.addEventListener('change', render);

  const pagina = h('div', {},
    h('h1', {}, 'Cobertura de CAPS por 100 mil habitantes'),
    h('p', {}, 'Compara quantos CAPS existem em cada município, em relação ao número de habitantes, com o parâmetro de referência da política nacional de saúde mental.'),
    ref && h('div', { class: 'caixa-ajuda' },
      h('p', {}, h('strong', {}, `Referência usada: ${fmtDec(ref.valor)} CAPS por 100 mil habitantes (cobertura muito boa).`),
        ref.confirmado ? h('span', { class: 'selo' }, 'Referência oficial MS') : h('span', { class: 'selo' }, 'Valor a confirmar')),
      h('p', {}, `Fonte da referência: ${ref.fonte}.`),
      ref.observacao && h('p', { class: 'dica' }, ref.observacao)),
    h('p', { class: 'dica' }, 'A tabela exibe tanto a taxa simples (total de CAPS ÷ população × 100 mil) quanto o índice ponderado oficial do Ministério da Saúde (CAPS I pesa 0,5; CAPS II, CAPS i e CAPS AD pesam 1,0; CAPS III e CAPS AD III pesam 1,5). Municípios com menos de 15 mil habitantes costumam ser atendidos por pactuação regional.'),
    h('label', { for: 'uf-cob' }, 'Filtrar por estado'), selUf,
    area, mapaEl,
    h('h2', {}, 'Evolução do número de CAPS'), graficoEl,
    linhaFonte(d.meta, `População: ${[...new Set(d.municipios.map((m) => m.populacao_fonte).filter(Boolean))].join('; ') || 'não informada'}.`));
  // O mapa só pode ser desenhado depois que a página entra no DOM (o app.js chama este gancho).
  pagina.aoMostrar = render;
  return pagina;
}

/** Gráfico de linha em SVG com tabela equivalente (alternativa em texto). */
function graficoSerie(d, uf) {
  if (!uf) return h('p', { class: 'dica' }, 'Escolha um estado para ver a evolução mês a mês.');
  const linhas = d.serie.filter((s) => s.uf === uf);
  if (!linhas.length) return telaVazia('Ainda não há série histórica para este estado.');
  const periodos = [...new Set(d.serie.map((s) => s.periodo))].sort();
  const porPeriodo = new Map(linhas.map((s) => [s.periodo, s.qtd_caps]));
  const max = Math.max(1, ...linhas.map((s) => s.qtd_caps));
  const W = 600, H = 260, ml = 40, mb = 40, mt = 15, mr = 15;
  const x = (i) => ml + (periodos.length === 1 ? 0 : (i * (W - ml - mr)) / (periodos.length - 1));
  const y = (v) => mt + (H - mt - mb) * (1 - v / max);
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs, txt) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (txt !== undefined) e.textContent = txt; return e; };
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'grafico', role: 'img', 'aria-label': `Número de CAPS em ${uf} por mês, de ${periodos[0]} a ${periodos[periodos.length - 1]}. Os valores estão na tabela abaixo.` });
  svg.append(s('line', { x1: ml, y1: H - mb, x2: W - mr, y2: H - mb, stroke: '#333' }), s('line', { x1: ml, y1: mt, x2: ml, y2: H - mb, stroke: '#333' }),
    s('text', { x: 4, y: mt + 8, 'font-size': 12 }, String(max)), s('text', { x: 4, y: H - mb, 'font-size': 12 }, '0'));
  let trecho = [];
  const fecha = () => { if (trecho.length > 1) svg.append(s('polyline', { points: trecho.join(' '), fill: 'none', stroke: '#0b5c5c', 'stroke-width': 3 })); trecho = []; };
  periodos.forEach((p, i) => {
    if (i % 2 === 0 || i === periodos.length - 1) svg.append(s('text', { x: x(i), y: H - 18, 'font-size': 11, 'text-anchor': 'middle' }, p.slice(2)));
    if (porPeriodo.has(p)) { trecho.push(`${x(i)},${y(porPeriodo.get(p))}`); svg.append(s('circle', { cx: x(i), cy: y(porPeriodo.get(p)), r: 4, fill: '#0b5c5c', stroke: '#fff' })); } else fecha(); // mês sem dado interrompe a linha
  });
  fecha();
  return h('div', {}, svg,
    h('div', { class: 'tabela-rolagem' }, h('table', {}, h('caption', {}, `Dados do gráfico – ${uf}`),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Mês'), h('th', { scope: 'col', class: 'n' }, 'CAPS'))),
      h('tbody', {}, periodos.map((p) => h('tr', {}, h('th', { scope: 'row' }, p), h('td', { class: 'n' }, porPeriodo.has(p) ? fmtNum(porPeriodo.get(p)) : 'sem dados')))))));
}

// ---------- Sobre os dados ----------
export function paginaSobre(d) {
  const r = d.meta.ultima_carga_real;
  return h('div', {},
    h('h1', {}, 'Sobre os dados'),
    h('h2', {}, 'De onde vêm as informações'),
    h('ul', {},
      h('li', {}, 'Serviços CAPS: Cadastro Nacional de Estabelecimentos de Saúde (CNES/DATASUS), Ministério da Saúde — Tipo de Estabelecimento 70 (CENTRO DE ATENÇÃO PSICOSSOCIAL) e Subtipos 70.01 (CAPS I), 70.02 (CAPS II), 70.03 (CAPS III), 70.04 (CAPS i), 70.05 (CAPS AD), 70.06 e 70.07 (CAPS AD III Municipal e Regional) — dados abertos (nível C), complementados com cartas de serviços oficiais das Secretarias de Saúde (SES-DF, PBH-MG, SMS-POA, SESA-ES).'),
      h('li', {}, 'Municípios e população residente: IBGE, Censo Demográfico 2022 — Tabela SIDRA 4714 (nível A: API REST aberta, sem cadastro).'),
      h('li', {}, 'Explicações dos serviços e parâmetro de cobertura (0,70 CAPS por 100 mil habitantes): Ministério da Saúde (gov.br/saude/pt-br/composicao/saes/desmad/raps/caps), Saúde Mental em Dados 12 e Portaria GM/MS nº 3.088/2011 (Portaria de Consolidação GM/MS nº 3/2017, Anexo V, Título I, Art. 7º).')),
    r ? h('p', {}, `Última carga de dados reais: ${fmtData(r.coletado_em)} (${r.modo === 'offline' ? 'modo offline / Plano B, a partir de amostra real verificada' : 'direto da fonte online'}).`)
      : h('p', { class: 'aviso' }, 'No momento o banco está carregado apenas com dados de teste fictícios. Para carregar a amostra real verificada (Plano B), execute: python3 scripts/carga_real.py carregar-amostra'),
    h('h2', {}, 'Limitações conhecidas'),
    h('ul', {},
      h('li', {}, 'O cadastro do CNES é atualizado pelos gestores locais e pode ter endereço, telefone ou localização desatualizados. Sempre que possível, confirme por telefone antes de se deslocar.'),
      h('li', {}, 'Na amostra offline do CnesWeb (Plano B), os estabelecimentos de Brasília (DF), Belo Horizonte (MG) e Porto Alegre (RS) trazem endereço completo e telefone cruzados com as cartas de serviço oficiais; nos demais municípios da listagem resumida do CnesWeb, endereço e telefone ficam sinalizados como “não informado” para nunca inventar dados.'),
      h('li', {}, 'A localização geográfica no modo offline usa coordenadas aproximadas do bairro ou do centro do município; as distâncias são calculadas em linha reta (fórmula de Haversine).'),
      h('li', {}, 'Municípios com menos de 15 mil habitantes costumam compartilhar CAPS por pactuação regional de saúde; por isso, ter 0 CAPS próprio não significa ausência de atendimento na região.'),
      h('li', {}, 'Quando há conexão à internet, o mapa carrega o Leaflet (unpkg.com) e blocos do OpenStreetMap; quando offline, o sistema desenha automaticamente um mapa esquemático interativo em SVG no próprio navegador.')),
    h('h2', {}, 'Privacidade (LGPD)'),
    h('p', {}, 'O Acolhe CAPS não tem questionário de triagem, cadastro, login, cookies de rastreio nem analytics. Não há campos de texto livre e nada do que você escolhe nas listas é enviado ao servidor: a filtragem por estado e município acontece inteiramente na memória do seu navegador. O banco de dados guarda exclusivamente dados públicos e agregados.'),
    h('h2', {}, 'Avisos importantes'),
    h('p', {}, 'Informativo. Não substitui atendimento de saúde. Em emergência, ligue para o SAMU 192. Para apoio emocional gratuito 24 horas, ligue para o CVV 188.'),
    linhaFonte(d.meta));
}
