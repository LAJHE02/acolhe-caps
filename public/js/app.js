// Ponto de entrada: roteador por "#/rota", menu mobile, avisos globais, carregando/erro e foco ao trocar de tela.
import { carregarDados } from './api.js';
import { h, fmtData, telaCarregando, telaErro } from './util.js';
import { destruirMapa } from './mapa.js';
import { paginaInicio, paginaBuscar, paginaServicos, paginaCobertura, paginaSobre } from './paginas.js';

const ROTAS = {
  '/': { titulo: 'Início', rotaCanonica: '/', pagina: paginaInicio },
  '/inicio': { titulo: 'Início', rotaCanonica: '/', pagina: paginaInicio },
  '/buscar': { titulo: 'Buscar serviço', rotaCanonica: '/buscar', pagina: paginaBuscar },
  '/servicos': { titulo: 'Entenda os serviços', rotaCanonica: '/servicos', pagina: paginaServicos },
  '/cobertura': { titulo: 'Cobertura', rotaCanonica: '/cobertura', pagina: paginaCobertura },
  '/sobre': { titulo: 'Sobre os dados', rotaCanonica: '/sobre', pagina: paginaSobre },
  '/dados': { titulo: 'Sobre os dados', rotaCanonica: '/sobre', pagina: paginaSobre },
};

const principal = document.getElementById('conteudo');
const avisos = document.getElementById('avisos');
const navPrincipal = document.getElementById('nav-principal');
const btnMenuMobile = document.getElementById('btn-menu-mobile');
let primeiraVez = true;

if (btnMenuMobile && navPrincipal) {
  btnMenuMobile.addEventListener('click', () => {
    const aberto = navPrincipal.classList.toggle('open');
    btnMenuMobile.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    btnMenuMobile.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
  });
}

/** Avisos obrigatórios: dados de teste e modo offline, em todas as telas. */
function atualizarAvisos(meta) {
  const itens = [];
  if (meta.tem_teste) itens.push(h('p', { class: 'aviso aviso-teste' }, 'Dados de teste, não são reais.'));
  if (meta.modo_offline && meta.ultima_carga_real) itens.push(h('p', { class: 'aviso' }, `Dados de ${fmtData(meta.ultima_carga_real.coletado_em)} (modo offline).`));
  avisos.replaceChildren(...itens);
}

async function mostrar() {
  const bruto = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  const chave = bruto.startsWith('/') ? bruto : `/${bruto}`;
  const def = ROTAS[chave] || ROTAS['/'];

  if (navPrincipal) {
    navPrincipal.classList.remove('open');
    if (btnMenuMobile) {
      btnMenuMobile.setAttribute('aria-expanded', 'false');
      btnMenuMobile.setAttribute('aria-label', 'Abrir menu');
    }
  }

  document.querySelectorAll('.menu a').forEach((a) => {
    if (a.getAttribute('data-rota') === def.rotaCanonica) {
      a.setAttribute('aria-current', 'page');
      a.classList.add('active');
    } else {
      a.removeAttribute('aria-current');
      a.classList.remove('active');
    }
  });

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
    principal.replaceChildren(h('div', { class: 'page' },
      h('h1', {}, def.titulo),
      telaErro(`Não foi possível carregar os dados agora. ${e.message || ''} Se precisar de ajuda neste momento, use os contatos no topo da página.`, mostrar)));
  } finally {
    principal.removeAttribute('aria-busy');
    if (!primeiraVez) principal.focus();
    primeiraVez = false;
  }
}

window.addEventListener('hashchange', mostrar);
mostrar();
