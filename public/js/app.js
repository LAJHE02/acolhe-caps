// Ponto de entrada: roteador por "#/rota", avisos globais, carregando/erro e foco ao trocar de tela.
import { carregarDados } from './api.js';
import { h, fmtData, telaCarregando, telaErro } from './util.js';
import { destruirMapa } from './mapa.js';
import { paginaInicio, paginaBuscar, paginaServicos, paginaCobertura, paginaSobre } from './paginas.js';

const ROTAS = {
  '/': { titulo: 'Início', pagina: paginaInicio },
  '/buscar': { titulo: 'Buscar serviço', pagina: paginaBuscar },
  '/servicos': { titulo: 'O que é cada serviço', pagina: paginaServicos },
  '/cobertura': { titulo: 'Cobertura', pagina: paginaCobertura },
  '/sobre': { titulo: 'Sobre os dados', pagina: paginaSobre },
};

const principal = document.getElementById('conteudo');
const avisos = document.getElementById('avisos');
let primeiraVez = true;

/** Avisos obrigatórios: dados de teste e modo offline, em todas as telas. */
function atualizarAvisos(meta) {
  const itens = [];
  if (meta.tem_teste) itens.push(h('p', { class: 'aviso aviso-teste' }, 'Dados de teste, não são reais.'));
  if (meta.modo_offline && meta.ultima_carga_real) itens.push(h('p', { class: 'aviso' }, `Dados de ${fmtData(meta.ultima_carga_real.coletado_em)} (modo offline).`));
  avisos.replaceChildren(...itens);
}

async function mostrar() {
  const rota = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  const def = ROTAS[rota] || ROTAS['/'];
  document.querySelectorAll('.menu a').forEach((a) => (a.getAttribute('data-rota') === (ROTAS[rota] ? rota : '/') ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  document.title = `${def.titulo} – Acolhe CAPS`;
  destruirMapa();
  principal.setAttribute('aria-busy', 'true');
  principal.replaceChildren(telaCarregando());
  try {
    const dados = await carregarDados();
    atualizarAvisos(dados.meta);
    const pagina = def.pagina(dados);
    principal.replaceChildren(pagina);
    if (pagina.aoMostrar) pagina.aoMostrar();
  } catch (e) {
    avisos.replaceChildren();
    principal.replaceChildren(h('h1', {}, def.titulo),
      telaErro(`Não foi possível carregar os dados agora. ${e.message || ''} Se precisar de ajuda neste momento, use os contatos no topo da página.`, mostrar));
  } finally {
    principal.removeAttribute('aria-busy');
    // Leva o foco para o conteúdo ao trocar de tela (leitores de tela e teclado), exceto na primeira carga.
    if (!primeiraVez) principal.focus();
    primeiraVez = false;
  }
}

window.addEventListener('hashchange', mostrar);
mostrar();
