// Telas do Acolhe CAPS com o layout oficial do Figma conectado ao banco de dados real (CNES/DATASUS + IBGE).
import { h, fmtData, fmtNum, fmtDec, distanciaKm, telaVazia, linkTelefone, linkComoChegar } from './util.js';
import { desenharMapa } from './mapa.js';
import { INICIO, SERVICOS, TEXTOS_REVISADOS } from './textos.js';

const SVG_URI = 'http://www.w3.org/2000/svg';

function elSvgIcon(tag, attrs = {}) {
  const el = document.createElementNS(SVG_URI, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Ícones vetoriais do design Figma (heart, search, book, chart, info, phone, arrow, shield, map, clock, check, chevron, external, users, building). */
function icone(nome, tamanho = 20) {
  const svg = elSvgIcon('svg', {
    'aria-hidden': 'true',
    class: 'icon',
    width: tamanho,
    height: tamanho,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.8',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });

  const defs = {
    heart: [['path', { d: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z' }]],
    search: [['circle', { cx: 11, cy: 11, r: 7 }], ['path', { d: 'm20 20-4-4' }]],
    book: [['path', { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' }], ['path', { d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z' }]],
    chart: [['path', { d: 'M4 19V9M10 19V5M16 19v-7M22 19H2' }]],
    info: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 11v5M12 8h.01' }]],
    phone: [['path', { d: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.7 19.7 0 0 1-8.6-3.1 19.3 19.3 0 0 1-6-6A19.7 19.7 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7 12.8 12.8 0 0 0 .7 2.8 2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5 12.8 12.8 0 0 0 2.8.7 2 2 0 0 1 1.8 2.1Z' }]],
    arrow: [['path', { d: 'M5 12h14M13 6l6 6-6 6' }]],
    shield: [['path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z' }], ['path', { d: 'm9 12 2 2 4-4' }]],
    map: [['path', { d: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z' }], ['path', { d: 'M9 3v15M15 6v15' }]],
    clock: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 7v5l3 2' }]],
    check: [['path', { d: 'm5 12 4 4L19 6' }]],
    chevron: [['path', { d: 'm9 18 6-6-6-6' }]],
    external: [['path', { d: 'M14 3h7v7M10 14 21 3' }], ['path', { d: 'M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5' }]],
    users: [['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }], ['circle', { cx: 9, cy: 7, r: 4 }], ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8' }]],
    building: [['path', { d: 'M3 21h18M6 21V4h12v17M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-5h4v5' }]],
  };
  for (const [t, a] of defs[nome] || defs.info) svg.append(elSvgIcon(t, a));
  return svg;
}

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

/** Cartão de um serviço no estilo Figma (.place-card.cartao) com modalidade explicada, endereço, telefone e como chegar. */
function cartaoCaps(d, c, numero, municipio, distancia) {
  const endTexto = c.endereco
    ? `${c.endereco}${c.bairro ? ` – ${c.bairro}` : ''}`
    : 'não informado na listagem resumida do CNES (consulte a Secretaria Municipal de Saúde)';
  const sufixoMun = municipio ? ` – ${municipio.nome}/${municipio.uf}` : '';

  return h('li', { class: 'place-card cartao' },
    h('div', { class: 'place-number num', 'aria-hidden': 'true' }, String(numero).padStart(2, '0')),
    h('div', { class: 'place-content' },
      h('span', { class: 'service-tag modalidade' }, `${nomeModalidade(d, c.modalidade)} · CNES ${c.cnes}`),
      h('h3', {}, c.nome, c.is_teste ? h('span', { class: 'selo' }, 'Teste') : null),
      h('p', {}, descModalidade(d, c.modalidade)),
      h('p', {}, icone('map', 16), h('span', {}, h('strong', {}, 'Endereço: '), `${endTexto}${sufixoMun}`)),
      h('p', {}, icone('phone', 16), h('span', {}, h('strong', {}, 'Telefone: '), c.telefone ? linkTelefone(c.telefone) : 'não informado')),
      distancia !== undefined
        ? h('p', {}, icone('clock', 16), h('span', {}, h('strong', {}, 'Distância aproximada: '), `${fmtNum(Math.round(distancia))} km (em linha reta, a partir do centro da cidade)`))
        : null,
      h('div', { class: 'place-actions' },
        c.telefone ? linkTelefone(c.telefone) : h('span', { class: 'dica' }, 'Telefone não informado'),
        linkComoChegar(c))));
}

/** Conteúdo do popup do mapa: elemento de DOM (nunca HTML em texto). */
const popup = (c, d) => h('div', {},
  h('strong', {}, c.nome), h('br'),
  `${nomeModalidade(d, c.modalidade)} (CNES ${c.cnes})`, h('br'),
  c.endereco || 'Endereço não informado', h('br'),
  c.telefone || 'Telefone não informado');

// ---------- TELA 1: INÍCIO ----------
export function paginaInicio(d) {
  return h('div', {},
    h('section', { class: 'hero' },
      h('div', { class: 'hero-copy' },
        h('div', { class: 'eyebrow' }, h('span', {}), ' Saúde mental é parte da sua saúde', seloRevisao()),
        h('h1', {}, 'Você não precisa', h('br'), 'passar por isso ', h('em', {}, 'sozinho.')),
        h('p', {}, INICIO.paragrafos[0]),
        h('div', { class: 'hero-actions botoes' },
          h('a', { class: 'button primary botao', href: '#/buscar' }, icone('search'), ' Encontrar um CAPS ', icone('arrow', 18)),
          h('a', { class: 'button ghost botao-sec', href: '#/servicos' }, 'Entender os serviços')),
        h('div', { class: 'privacy' },
          icone('shield'),
          h('p', {},
            h('strong', {}, 'Sua privacidade importa'),
            h('span', {}, 'Sem cadastro, perguntas pessoais ou histórico de busca.')))),
      h('div', { class: 'hero-art', 'aria-label': 'Ilustração de acolhimento e cuidado' },
        h('div', { class: 'orb orb-one' }),
        h('div', { class: 'orb orb-two' }),
        h('div', { class: 'art-card' },
          h('div', { class: 'art-heart' }, icone('heart', 48)),
          h('div', { class: 'art-lines' }, h('span', {}), h('span', {}), h('span', {})),
          h('div', { class: 'art-people' }, h('i', {}), h('i', {}), h('i', {})),
          h('p', {}, 'O primeiro passo pode ser só conversar.')),
        h('div', { class: 'floating-note note-one' },
          icone('map'),
          h('span', {}, h('b', {}, 'Perto de você'), `${fmtNum(d.caps.length)} CAPS na base`)),
        h('div', { class: 'floating-note note-two' },
          icone('clock'),
          h('span', {}, h('b', {}, 'Porta aberta'), 'Você pode ir diretamente')))),

    h('section', { class: 'how' },
      h('div', { class: 'section-title' },
        h('span', {}, 'COMO FUNCIONA'),
        h('h2', {}, 'Ajuda gratuita, perto de você'),
        h('p', {}, INICIO.paragrafos[1])),
      h('div', { class: 'steps' },
        h('article', {},
          h('span', { class: 'step-num' }, '01'),
          h('div', { class: 'step-icon' }, icone('search')),
          h('h3', {}, 'Encontre o serviço'),
          h('p', {}, 'Busque por estado, município e bairro. Não guardamos a sua localização.'),
          h('a', { class: 'step-link', href: '#/buscar' }, 'Buscar agora ', icone('arrow', 17))),
        h('article', {},
          h('span', { class: 'step-num' }, '02'),
          h('div', { class: 'step-icon' }, icone('map')),
          h('h3', {}, 'Vá diretamente'),
          h('p', {}, 'O primeiro acolhimento é de porta aberta: não exige consulta marcada nem encaminhamento.'),
          h('a', { class: 'step-link', href: '#/servicos' }, 'Saiba como funciona ', icone('arrow', 17))),
        h('article', {},
          h('span', { class: 'step-num' }, '03'),
          h('div', { class: 'step-icon' }, icone('users')),
          h('h3', {}, 'Seja acolhido'),
          h('p', {}, 'Uma equipe multiprofissional vai ouvir e construir o cuidado com você e sua família.'),
          h('a', { class: 'step-link', href: '#/servicos' }, 'Conheça as equipes ', icone('arrow', 17))))),

    h('section', { class: 'help-banner', 'aria-labelledby': 'h-ajuda' },
      h('div', {},
        h('span', { class: 'help-icon' }, icone('heart', 30)),
        h('div', {},
          h('small', {}, 'SE VOCÊ PRECISA CONVERSAR AGORA'),
          h('h2', { id: 'h-ajuda' }, 'Há alguém pronto para ouvir você.'),
          h('p', {}, INICIO.ajudaAgora[0]))),
      h('a', { href: 'tel:188' },
        icone('phone'),
        h('span', {}, h('small', {}, 'Ligue gratuitamente'), h('strong', {}, '188')),
        icone('arrow'))),

    linhaFonte(d.meta));
}

// ---------- TELA 2: BUSCAR SERVIÇO ----------
export function paginaBuscar(d) {
  const ufsComMunicipio = d.ufs.filter((u) => d.municipios.some((m) => m.uf === u.sigla));
  const selUf = h('select', { id: 'uf', 'aria-describedby': 'dica-busca' },
    h('option', { value: '' }, 'Selecione o estado'),
    ufsComMunicipio.map((u) => h('option', { value: u.sigla }, `${u.sigla} — ${u.nome}`)));
  const selMun = h('select', { id: 'municipio', disabled: true }, h('option', { value: '' }, 'Escolha primeiro o estado'));
  const selBairro = h('select', { id: 'bairro', disabled: true }, h('option', { value: '' }, 'Todos os bairros do município'));
  const resultado = h('div', { id: 'resultado', 'aria-live': 'polite' });
  const miniMapaEl = h('div', { class: 'mini-map', 'aria-hidden': 'true' },
    h('span', { class: 'road r1' }),
    h('span', { class: 'road r2' }),
    h('span', { class: 'road r3' }),
    h('i', { class: 'pin p1' }, icone('heart', 18)),
    h('i', { class: 'pin p2' }),
    h('i', { class: 'pin p3' }));
  const mapaEl = h('div', { class: 'mapa', hidden: true });

  const estadoInicialVazio = () => h('section', { class: 'empty-search' },
    icone('building', 36),
    h('h2', {}, 'Os serviços aparecerão aqui'),
    h('p', {}, 'Escolha um estado e um município para começar.'));

  resultado.append(estadoInicialVazio());

  const restaurarMiniMapa = () => {
    mapaEl.hidden = true;
    miniMapaEl.hidden = false;
  };

  const limparBusca = () => {
    selUf.value = '';
    selMun.replaceChildren(h('option', { value: '' }, 'Escolha primeiro o estado'));
    selMun.disabled = true;
    selBairro.replaceChildren(h('option', { value: '' }, 'Todos os bairros do município'));
    selBairro.disabled = true;
    resultado.replaceChildren(estadoInicialVazio());
    restaurarMiniMapa();
  };

  selUf.addEventListener('change', () => {
    const lista = d.municipios.filter((m) => m.uf === selUf.value);
    selMun.replaceChildren(
      h('option', { value: '' }, lista.length ? 'Selecione o município' : 'Escolha primeiro o estado'),
      ...lista.map((m) => h('option', { value: m.codigo_ibge }, m.nome)),
    );
    selMun.disabled = lista.length === 0;
    selBairro.replaceChildren(h('option', { value: '' }, 'Todos os bairros do município'));
    selBairro.disabled = true;
    resultado.replaceChildren(estadoInicialVazio());
    restaurarMiniMapa();
  });

  selMun.addEventListener('change', () => {
    const codigo = selMun.value;
    const bairros = [...new Set(d.caps.filter((c) => c.codigo_ibge === codigo && c.bairro).map((c) => c.bairro))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    selBairro.replaceChildren(
      h('option', { value: '' }, bairros.length ? `Todos os bairros (${bairros.length} com CAPS)` : 'Todos os bairros do município'),
      ...bairros.map((b) => h('option', { value: b }, b)),
    );
    selBairro.disabled = bairros.length === 0;
    mostrar(codigo, '');
  });

  selBairro.addEventListener('change', () => mostrar(selMun.value, selBairro.value));

  function mostrar(codigo, bairroFiltro = '') {
    resultado.replaceChildren();
    restaurarMiniMapa();
    const mun = d.municipios.find((m) => m.codigo_ibge === codigo);
    if (!mun) {
      resultado.append(estadoInicialVazio());
      return;
    }
    const todosCapsMun = d.caps.filter((c) => c.codigo_ibge === codigo);
    const caps = bairroFiltro ? todosCapsMun.filter((c) => c.bairro === bairroFiltro) : todosCapsMun;
    const sufixoBairro = bairroFiltro ? ` – bairro ${bairroFiltro}` : '';

    if (caps.length) {
      const secao = h('section', { class: 'results' },
        h('div', { class: 'results-head' },
          h('div', {},
            h('span', {}, `${caps.length} ${caps.length === 1 ? 'SERVIÇO ENCONTRADO' : 'SERVIÇOS ENCONTRADOS'}`),
            h('h2', { tabindex: '-1' }, `CAPS em ${mun.nome}/${mun.uf}${sufixoBairro}`)),
          h('button', { type: 'button', onClick: limparBusca }, 'Limpar busca')),
        h('ol', { class: 'result-grid lista' }, caps.map((c, i) => cartaoCaps(d, c, i + 1, null))),
        h('p', { class: 'data-note' }, icone('info', 16), ' Confirme telefone e horário antes de se deslocar. A mesma informação está no mapa ao lado e na lista abaixo.'));
      resultado.append(secao);
      miniMapaEl.hidden = true;
      mapaEl.hidden = false;
      desenharMapa(mapaEl, caps.map((c, i) => ({ lat: c.latitude, lon: c.longitude, rotulo: i + 1, texto: `${i + 1}. ${c.nome}`, descricao: popup(c, d) })),
        `Mapa com ${caps.length} serviços em ${mun.nome}${sufixoBairro}. A lista abaixo traz as mesmas informações em texto.`);
    } else {
      const secao = h('section', { class: 'results' },
        h('div', { class: 'results-head' },
          h('div', {},
            h('span', {}, 'NENHUM CAPS PRÓPRIO CADASTRADO'),
            h('h2', { tabindex: '-1' }, `Serviços em ${mun.nome}/${mun.uf}`)),
          h('button', { type: 'button', onClick: limparBusca }, 'Limpar busca')),
        telaVazia(`Não encontramos CAPS cadastrado em ${mun.nome}. Isso é comum em cidades pequenas, que usam serviços de cidades da região. Procure a UBS do seu bairro ou a Secretaria Municipal de Saúde para ser orientado.`));

      if (mun.latitude !== null && mun.longitude !== null) {
        const proximos = d.caps.filter((c) => c.latitude !== null && c.longitude !== null)
          .map((c) => ({ c, km: distanciaKm(mun.latitude, mun.longitude, c.latitude, c.longitude) }))
          .sort((a, b) => a.km - b.km).slice(0, 5);
        if (proximos.length) {
          secao.append(
            h('h3', { style: 'margin: 28px 0 16px; font-family: Manrope, sans-serif;' }, 'Serviços mais próximos na região'),
            h('ol', { class: 'result-grid lista' }, proximos.map(({ c, km }, i) => cartaoCaps(d, c, i + 1, d.municipios.find((m) => m.codigo_ibge === c.codigo_ibge), km))),
          );
          miniMapaEl.hidden = true;
          mapaEl.hidden = false;
          desenharMapa(mapaEl, proximos.map(({ c }, i) => ({ lat: c.latitude, lon: c.longitude, rotulo: i + 1, texto: `${i + 1}. ${c.nome}`, descricao: popup(c, d) })),
            `Mapa com os ${proximos.length} serviços mais próximos de ${mun.nome}. A lista abaixo traz as mesmas informações em texto.`);
        }
      } else {
        secao.append(h('p', { class: 'dica' }, 'Não temos a localização desta cidade para calcular os serviços mais próximos.'));
      }
      resultado.append(secao);
    }
  }

  return h('div', { class: 'page' },
    h('div', { class: 'page-intro' },
      h('div', { class: 'eyebrow' }, h('span', {}), ' BUSCA DE SERVIÇOS'),
      h('h1', {}, 'Encontre acolhimento', h('br'), h('em', {}, 'perto de você')),
      h('p', {}, 'Selecione seu estado, município e bairro para ver os CAPS disponíveis. Sua busca acontece apenas neste aparelho.')),

    h('section', { class: 'search-panel' },
      h('div', { class: 'search-form' },
        h('div', { class: 'field' },
          h('label', { for: 'uf' }, '1. Qual é o seu estado?'),
          h('div', { class: 'select-wrap' }, selUf, icone('chevron'))),
        h('div', { class: 'field' },
          h('label', { for: 'municipio' }, '2. Em qual município?'),
          h('div', { class: 'select-wrap' }, selMun, icone('chevron'))),
        h('div', { class: 'field' },
          h('label', { for: 'bairro' }, '3. Bairro (opcional)'),
          h('div', { class: 'select-wrap' }, selBairro, icone('chevron'))),
        h('div', { id: 'dica-busca', class: 'search-safe' },
          icone('shield'),
          h('span', {},
            h('strong', {}, 'Busca privada e segura'),
            'Não há campo de texto livre, não usamos GPS nem armazenamos sua escolha.'))),
      h('div', { class: 'search-visual' },
        miniMapaEl,
        mapaEl,
        h('p', {}, icone('map', 16), ' Dados públicos do Cadastro Nacional de Estabelecimentos de Saúde (CNES/SUS)'))),

    resultado,
    linhaFonte(d.meta));
}

// ---------- TELA 3: ENTENDA OS SERVIÇOS ----------
const ESTILO_MODALIDADES = {
  CAPS_I: { cor: 'mint', titulo: 'Cuidado para todas as idades', nota: 'Regiões acima de 15 mil habitantes', icone: 'building' },
  CAPS_II: { cor: 'blue', titulo: 'Cuidado intensivo para adultos', nota: 'Regiões acima de 70 mil habitantes', icone: 'building' },
  CAPS_III: { cor: 'violet', titulo: 'Acolhimento 24 horas', nota: 'Regiões acima de 150 mil habitantes', icone: 'clock' },
  CAPSI: { cor: 'orange', titulo: 'Crianças e adolescentes', nota: 'Atendimento infantojuvenil (acima de 70 mil hab.)', icone: 'users' },
  CAPS_AD: { cor: 'rose', titulo: 'Álcool e outras drogas', nota: 'Cuidado sem julgamento (acima de 70 mil hab.)', icone: 'building' },
  CAPS_AD_III: { cor: 'navy', titulo: 'Álcool e drogas — 24 horas', nota: 'Atendimento 24 horas (acima de 150 mil hab.)', icone: 'clock' },
};

export function paginaServicos(d) {
  return h('div', { class: 'page' },
    h('div', { class: 'page-intro centered' },
      h('div', { class: 'eyebrow' }, h('span', {}), ' CONHEÇA A REDE', seloRevisao()),
      h('h1', {}, 'Qual serviço pode', h('br'), h('em', {}, 'acolher você?')),
      h('p', {}, SERVICOS.intro)),

    h('section', { class: 'service-grid', 'aria-label': 'Modalidades de CAPS (Tipo CNES 70)' },
      d.modalidades.map((m, i) => {
        const est = ESTILO_MODALIDADES[m.codigo] || { cor: 'mint', titulo: m.nome, nota: 'Rede de Atenção Psicossocial', icone: 'building' };
        return h('article', { class: `service-card ${est.cor}` },
          h('div', { class: 'service-card-top' },
            h('span', {}, `${m.nome}${m.codigo_cnes ? ` · CNES ${m.codigo_cnes}` : ''}`),
            h('i', {}, String(i + 1).padStart(2, '0'))),
          h('h2', {}, est.titulo),
          h('p', {}, m.descricao),
          h('div', {}, icone(est.icone, 16), h('span', {}, est.nota)));
      })),

    h('section', { class: 'access-card' },
      h('div', {},
        h('span', { class: 'access-icon' }, icone('arrow')),
        h('small', {}, 'PORTA ABERTA'),
        h('h2', {}, SERVICOS.encaminhamentoTitulo),
        h('p', {}, SERVICOS.encaminhamento[0])),
      h('ol', {},
        h('li', {},
          h('span', {}, icone('check', 16)),
          h('p', {}, h('strong', {}, 'Procura direta'), 'Vá diretamente ao CAPS da sua região e peça o primeiro acolhimento.')),
        h('li', {},
          h('span', {}, icone('check', 16)),
          h('p', {}, h('strong', {}, 'Pela rede do SUS'), SERVICOS.encaminhamento[1])),
        h('li', {},
          h('span', {}, icone('check', 16)),
          h('p', {}, h('strong', {}, 'Sem CAPS na cidade?'), SERVICOS.encaminhamento[2])))),

    h('section', { class: 'ubs' },
      h('div', { class: 'ubs-icon' }, icone('building', 32)),
      h('div', {},
        h('small', {}, 'OUTRA PORTA DE ENTRADA'),
        h('h2', {}, SERVICOS.ubsTitulo),
        h('p', {}, SERVICOS.ubs)),
      h('a', { class: 'button ghost', href: '#/buscar' }, 'Encontrar um serviço ', icone('arrow', 18))),

    h('p', { class: 'data-note' },
      icone('external', 16),
      h('a', { href: 'https://www.gov.br/saude/pt-br/composicao/saes/desmad/raps/caps', target: '_blank', rel: 'noopener noreferrer' },
        'Saiba mais na página oficial da RAPS no site do Ministério da Saúde (abre em nova aba)')),
    linhaFonte(d.meta));
}

// ---------- TELA 4: COBERTURA ----------
const ROTULO_STATUS = {
  abaixo: 'Abaixo da referência',
  adequado: 'Na referência ou acima',
  sem_populacao: 'Sem população informada',
};

export function paginaCobertura(d) {
  const ref = d.meta.referencia_cobertura;
  const ufsPresentes = d.ufs.filter((u) => d.municipios.some((m) => m.uf === u.sigla));

  const selUf = h('select', { id: 'uf-cob', class: 'select-uf-cob', 'aria-label': 'Filtrar por estado' },
    h('option', { value: '' }, 'Todos os estados'),
    ufsPresentes.map((u) => h('option', { value: u.sigla }, `${u.sigla} – ${u.nome}`)));

  const barraBotoesUf = h('div', { class: 'filter', role: 'group', 'aria-label': 'Atalhos de estado' });
  const areaTabela = h('div', { 'aria-live': 'polite' });
  const areaResumo = h('div', { class: 'coverage-summary' });
  const mapaEl = h('div', { class: 'mapa' });
  const graficoEl = h('div', {});

  const atualizarBotoes = (ufAtual) => {
    barraBotoesUf.replaceChildren(
      h('button', {
        type: 'button',
        class: ufAtual === '' ? 'active' : '',
        onClick: () => { selUf.value = ''; render(); },
      }, 'Todos'),
      ...ufsPresentes.map((u) => h('button', {
        type: 'button',
        class: ufAtual === u.sigla ? 'active' : '',
        onClick: () => { selUf.value = u.sigla; render(); },
      }, u.sigla)),
    );
  };

  const render = () => {
    const uf = selUf.value;
    atualizarBotoes(uf);
    const lista = d.municipios.filter((m) => !uf || m.uf === uf);
    if (!lista.length) {
      areaTabela.replaceChildren(telaVazia('Nenhum município para mostrar.'));
      return;
    }

    const peso = { abaixo: 0, adequado: 1, sem_populacao: 2 };
    const ord = [...lista].sort((a, b) => peso[a.status] - peso[b.status] || (a.por_100mil ?? 0) - (b.por_100mil ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
    const comPop = lista.filter((m) => m.status !== 'sem_populacao');
    const abaixo = lista.filter((m) => m.status === 'abaixo');
    const adequados = lista.filter((m) => m.status === 'adequado');
    const pctAdequado = comPop.length ? Math.round((adequados.length / comPop.length) * 100) : 0;

    const resumoTexto = ref
      ? `${abaixo.length} de ${comPop.length} municípios com população informada estão abaixo da referência de ${fmtDec(ref.valor)} CAPS por 100 mil habitantes.`
      : 'A referência de cobertura não está cadastrada.';

    areaResumo.replaceChildren(
      h('div', { class: 'donut', style: `--pct: ${pctAdequado}%` },
        h('div', {}, h('strong', {}, `${pctAdequado}%`), h('small', {}, 'na referência'))),
      h('h3', {}, `${adequados.length} de ${comPop.length} municípios`),
      h('p', {}, resumoTexto),
      ref
        ? h('div', { class: 'benchmark' },
            h('span', {}, h('i', {}), ' Referência oficial MS'),
            h('strong', {}, `${fmtDec(ref.valor)} / 100 mil hab.`))
        : null,
    );

    areaTabela.replaceChildren(
      h('div', { class: 'table-wrap tabela-rolagem' },
        h('table', {},
          h('caption', {}, `Cobertura de CAPS por município${uf ? ` – ${uf}` : ''} (${resumoTexto})`),
          h('thead', {},
            h('tr', {},
              ['Município', 'UF', 'População', 'CAPS', 'CAPS por 100 mil', 'Índice ponderado MS', 'Situação'].map((t, i) =>
                h('th', { scope: 'col', class: i >= 2 && i <= 5 ? 'n' : null }, t)))),
          h('tbody', {},
            ord.map((m) => h('tr', {},
              h('th', { scope: 'row' }, m.nome),
              h('td', {}, m.uf),
              h('td', { class: 'n' }, fmtNum(m.populacao)),
              h('td', { class: 'n' }, fmtNum(m.qtd_caps)),
              h('td', { class: 'n' }, h('strong', {}, fmtDec(m.por_100mil))),
              h('td', { class: 'n' }, fmtDec(m.ponderado_por_100mil)),
              h('td', {},
                h('span', { class: `status ${m.status} ${m.status === 'abaixo' ? 'situacao-abaixo' : ''}` },
                  m.status === 'adequado' ? icone('check', 14) : h('i', {}),
                  `${m.status === 'abaixo' ? '▼ ' : m.status === 'adequado' ? '✓ ' : '? '}${ROTULO_STATUS[m.status]}`))))))));

    desenharMapa(mapaEl, lista.map((m) => ({
      lat: m.latitude,
      lon: m.longitude,
      rotulo: m.status === 'abaixo' ? '!' : m.status === 'adequado' ? '✓' : '?',
      classe: m.status === 'abaixo' ? 'pino-abaixo' : m.status === 'adequado' ? 'pino-ok' : 'pino-sem',
      texto: `${m.nome}/${m.uf}: ${ROTULO_STATUS[m.status]} (${fmtDec(m.por_100mil)} por 100 mil)`,
      descricao: h('div', {},
        h('strong', {}, `${m.nome}/${m.uf}`), h('br'),
        `${fmtNum(m.qtd_caps)} CAPS (${fmtDec(m.por_100mil)} por 100 mil; ponderado MS: ${fmtDec(m.ponderado_por_100mil)})`, h('br'),
        ROTULO_STATUS[m.status]),
    })), `Mapa dos municípios: ${abaixo.length} abaixo da referência, marcados com losango e o símbolo “!”. A tabela abaixo traz as mesmas informações em texto.`);

    graficoEl.replaceChildren(graficoSerie(d, uf));
  };

  selUf.addEventListener('change', render);

  const pagina = h('div', { class: 'page' },
    h('div', { class: 'page-intro split-intro' },
      h('div', {},
        h('div', { class: 'eyebrow' }, h('span', {}), ' REDE DE CUIDADO'),
        h('h1', {}, 'Cobertura de CAPS', h('br'), h('em', {}, 'no Brasil'))),
      h('p', {}, 'Veja a proporção de serviços por 100 mil habitantes e acompanhe onde a rede pública precisa ser ampliada.')),

    h('section', { class: 'metric-grid', 'aria-label': 'Indicadores gerais da rede' },
      h('article', {},
        h('span', {}, icone('building')),
        h('small', {}, 'SERVIÇOS NA BASE'),
        h('strong', {}, fmtNum(d.caps.length)),
        h('p', {}, 'CAPS cadastrados')),
      h('article', {},
        h('span', {}, icone('map')),
        h('small', {}, 'MUNICÍPIOS ANALISADOS'),
        h('strong', {}, fmtNum(d.municipios.length)),
        h('p', {}, `em ${ufsPresentes.length} unidades federativas`)),
      h('article', {},
        h('span', {}, icone('chart')),
        h('small', {}, 'REFERÊNCIA NACIONAL'),
        h('strong', {}, ref ? fmtDec(ref.valor) : '0,70'),
        h('p', {}, 'CAPS por 100 mil habitantes ',
          ref && ref.confirmado ? h('span', { class: 'selo' }, 'Referência oficial MS') : null))),

    h('section', { class: 'coverage-card' },
      h('div', { class: 'coverage-head' },
        h('div', {},
          h('span', {}, 'VISÃO GERAL'),
          h('h2', {}, 'Cobertura por município')),
        h('div', { class: 'coverage-controls' },
          barraBotoesUf,
          h('label', { for: 'uf-cob', class: 'pular' }, 'Filtrar por estado'),
          selUf)),
      h('div', { class: 'coverage-layout' }, mapaEl, areaResumo),
      areaTabela),

    h('section', { class: 'coverage-card' },
      h('div', { class: 'coverage-head' },
        h('div', {},
          h('span', {}, 'SÉRIE HISTÓRICA (12 PERÍODOS)'),
          h('h2', {}, 'Evolução do número de CAPS por estado'))),
      h('div', { class: 'grafico-box' }, graficoEl)),

    h('div', { class: 'method-note' },
      icone('info'),
      h('p', {},
        h('strong', {}, 'Como calculamos?'),
        h('span', {}, `Taxa simples: quantidade de CAPS ÷ população × 100 mil. Índice ponderado oficial do Ministério da Saúde: (0,5 × CAPS I + 1,0 × [CAPS II + CAPS i + CAPS AD] + 1,5 × [CAPS III + CAPS AD III]) ÷ população × 100 mil. ${ref ? `Fonte: ${ref.fonte}` : ''}`))),

    linhaFonte(d.meta, `População: ${[...new Set(d.municipios.map((m) => m.populacao_fonte).filter(Boolean))].join('; ') || 'não informada'}.`));

  pagina.aoMostrar = render;
  return pagina;
}

/** Gráfico de linha em SVG com tabela equivalente (alternativa em texto). */
function graficoSerie(d, uf) {
  if (!uf) return h('p', { class: 'dica' }, 'Escolha um estado nos botões acima para ver o gráfico de evolução mês a mês.');
  const linhas = d.serie.filter((s) => s.uf === uf);
  if (!linhas.length) return telaVazia('Ainda não há série histórica para este estado.');
  const periodos = [...new Set(d.serie.map((s) => s.periodo))].sort();
  const porPeriodo = new Map(linhas.map((s) => [s.periodo, s.qtd_caps]));
  const max = Math.max(1, ...linhas.map((s) => s.qtd_caps));
  const W = 600, H = 250, ml = 42, mb = 38, mt = 16, mr = 16;
  const x = (i) => ml + (periodos.length === 1 ? 0 : (i * (W - ml - mr)) / (periodos.length - 1));
  const y = (v) => mt + (H - mt - mb) * (1 - v / max);
  const s = (tag, attrs, txt) => {
    const e = document.createElementNS(SVG_URI, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (txt !== undefined) e.textContent = txt;
    return e;
  };
  const svg = s('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'grafico',
    role: 'img',
    'aria-label': `Número de CAPS em ${uf} por mês, de ${periodos[0]} a ${periodos[periodos.length - 1]}. Os valores estão na tabela abaixo.`,
  });
  svg.append(
    s('line', { x1: ml, y1: H - mb, x2: W - mr, y2: H - mb, stroke: '#bdd0cc' }),
    s('line', { x1: ml, y1: mt, x2: ml, y2: H - mb, stroke: '#bdd0cc' }),
    s('text', { x: 6, y: mt + 8, 'font-size': 11, fill: '#526867' }, String(max)),
    s('text', { x: 6, y: H - mb, 'font-size': 11, fill: '#526867' }, '0'),
  );
  let trecho = [];
  const fecha = () => {
    if (trecho.length > 1) svg.append(s('polyline', { points: trecho.join(' '), fill: 'none', stroke: '#087b70', 'stroke-width': 3 }));
    trecho = [];
  };
  periodos.forEach((p, i) => {
    if (i % 2 === 0 || i === periodos.length - 1) {
      svg.append(s('text', { x: x(i), y: H - 14, 'font-size': 11, 'text-anchor': 'middle', fill: '#526867' }, p.slice(2)));
    }
    if (porPeriodo.has(p)) {
      trecho.push(`${x(i)},${y(porPeriodo.get(p))}`);
      svg.append(s('circle', { cx: x(i), cy: y(porPeriodo.get(p)), r: 4.5, fill: '#087b70', stroke: '#fff', 'stroke-width': 1.5 }));
    } else {
      fecha();
    }
  });
  fecha();
  return h('div', {},
    svg,
    h('div', { class: 'table-wrap tabela-rolagem', style: 'margin-top: 16px;' },
      h('table', {},
        h('caption', {}, `Dados do gráfico – ${uf}`),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Mês'), h('th', { scope: 'col', class: 'n' }, 'CAPS'))),
        h('tbody', {}, periodos.map((p) => h('tr', {},
          h('th', { scope: 'row' }, p),
          h('td', { class: 'n' }, porPeriodo.has(p) ? fmtNum(porPeriodo.get(p)) : 'sem dados')))))));
}

// ---------- TELA 5: SOBRE OS DADOS ----------
export function paginaSobre(d) {
  const r = d.meta.ultima_carga_real;
  return h('div', { class: 'page data-page' },
    h('div', { class: 'page-intro' },
      h('div', { class: 'eyebrow' }, h('span', {}), ' TRANSPARÊNCIA'),
      h('h1', {}, 'Sobre os dados', h('br'), h('em', {}, 'e sua privacidade')),
      h('p', {}, 'Informação pública, método aberto e nenhum dado pessoal coletado.')),

    h('section', { class: 'trust-strip' },
      h('article', {},
        icone('shield'),
        h('div', {}, h('strong', {}, 'Privacidade por princípio'), h('p', {}, 'Sem login, cookies ou rastreamento.'))),
      h('article', {},
        icone('building'),
        h('div', {}, h('strong', {}, 'Fontes oficiais'), h('p', {}, 'CNES/DATASUS, IBGE e Ministério da Saúde.'))),
      h('article', {},
        icone('clock'),
        h('div', {},
          h('strong', {}, r ? `Modo: ${r.modo}` : 'Base verificada'),
          h('p', {}, r ? `Atualizado em ${fmtData(r.coletado_em)}` : 'Dados de teste ativos')))),

    h('div', { class: 'data-layout' },
      h('section', { class: 'data-content' },
        h('article', {},
          h('span', { class: 'article-num' }, '01'),
          h('div', {},
            h('h2', {}, 'De onde vêm as informações'),
            h('p', {}, 'Os serviços CAPS são obtidos no Cadastro Nacional de Estabelecimentos de Saúde (CNES/DATASUS — Tipo de Estabelecimento 70 e Subtipos 70.01 a 70.07, nível C) e complementados por cartas de serviços das Secretarias de Saúde (SMS-Rio, FeSaúde Niterói, SES-DF, PBH-MG, SMS-POA e SESA-ES).'),
            h('ul', {},
              h('li', {}, icone('check', 16), ' Serviços e modalidades: CNES/DATASUS, Tipo 70 (70.01 a 70.07)'),
              h('li', {}, icone('check', 16), ' Municípios e população residente: IBGE, Censo Demográfico 2022 (SIDRA 4714, nível A)'),
              h('li', {}, icone('check', 16), ' Referência de cobertura (0,70 CAPS / 100 mil hab.): Ministério da Saúde — Saúde Mental em Dados 12 e Portaria de Consolidação GM/MS nº 3/2017')))),
        h('article', {},
          h('span', { class: 'article-num' }, '02'),
          h('div', {},
            h('h2', {}, 'Limitações conhecidas'),
            h('p', {}, 'O cadastro do CNES é atualizado pelos gestores locais e pode ter endereço, telefone ou localização desatualizados. Sempre que possível, confirme as informações por telefone antes de se deslocar.'),
            h('p', {}, 'Na amostra offline do CnesWeb (Plano B), os estabelecimentos do Rio de Janeiro (RJ), Niterói (RJ), Brasília (DF), Belo Horizonte (MG) e Porto Alegre (RS) trazem endereço completo e telefone cruzados com as cartas de serviço oficiais; nos demais municípios da listagem resumida do CnesWeb, endereço e telefone ficam sinalizados como “não informado” para nunca inventar dados.'),
            h('p', {}, 'Municípios com menos de 15 mil habitantes costumam compartilhar CAPS por pactuação regional; não ter unidade própria não significa ausência de atendimento na região.'))),
        h('article', {},
          h('span', { class: 'article-num' }, '03'),
          h('div', {},
            h('h2', {}, 'Privacidade e LGPD'),
            h('p', {}, 'Não temos questionário de triagem, cadastro, login, cookies de rastreio, analytics nem campos de texto livre. As escolhas feitas nas listas são filtradas exclusivamente na memória do seu navegador e nenhuma escolha é enviada ao servidor. O banco de dados guarda apenas dados públicos e agregados.')))),

      h('aside', { class: 'source-card' },
        h('span', {}, 'FONTES PRIMÁRIAS'),
        h('h2', {}, 'Dados que você pode verificar'),
        h('a', { href: 'https://cnes.datasus.gov.br/', target: '_blank', rel: 'noopener noreferrer' },
          h('div', {}, icone('building'), h('p', {}, h('strong', {}, 'CNES / DATASUS'), h('small', {}, 'Cadastro Nacional de Estabelecimentos'))),
          icone('external', 16)),
        h('a', { href: 'https://www.ibge.gov.br/', target: '_blank', rel: 'noopener noreferrer' },
          h('div', {}, icone('chart'), h('p', {}, h('strong', {}, 'IBGE — Censo 2022'), h('small', {}, 'População residente dos municípios'))),
          icone('external', 16)),
        h('a', { href: 'https://www.gov.br/saude/pt-br/composicao/saes/desmad/raps/caps', target: '_blank', rel: 'noopener noreferrer' },
          h('div', {}, icone('heart'), h('p', {}, h('strong', {}, 'Ministério da Saúde'), h('small', {}, 'Rede de Atenção Psicossocial (RAPS)'))),
          icone('external', 16)),
        h('div', { class: 'open-data' },
          icone('shield'),
          h('p', {},
            h('strong', {}, 'Compromisso com dados abertos'),
            h('span', {}, 'Este projeto usa exclusivamente informações públicas e agregadas em conformidade com a LGPD.'))))),

    h('section', { class: 'important' },
      icone('info'),
      h('div', {},
        h('h2', {}, 'Avisos importantes'),
        h('p', {}, 'Informativo. Não substitui atendimento de saúde. Em emergência, ligue para o SAMU 192. Para apoio emocional gratuito 24 horas, ligue para o CVV 188.'))),

    linhaFonte(d.meta));
}
