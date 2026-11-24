// Utilitários de DOM e formatação. Nunca usamos innerHTML com dados: tudo entra por textContent (evita XSS).

/** Cria um elemento: h('p', {class: 'x'}, 'texto', outroElemento). */
export function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}

export const fmtData = (iso) => {
  if (!iso) return 'data desconhecida';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'data desconhecida' : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};
export const fmtNum = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('pt-BR'));
export const fmtDec = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** Distância em km entre dois pontos (fórmula de haversine). */
export function distanciaKm(lat1, lon1, lat2, lon2) {
  const r = (g) => (g * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** Estados de tela: carregando, erro (com botão de tentar de novo) e vazio. */
export const telaCarregando = (msg = 'Carregando…') => h('p', { class: 'carregando', role: 'status' }, msg);
export const telaErro = (msg, aoTentar) => h('div', { class: 'aviso aviso-erro', role: 'alert' },
  h('p', {}, msg), aoTentar && h('button', { type: 'button', class: 'botao', onclick: aoTentar }, 'Tentar de novo'));
export const telaVazia = (msg) => h('div', { class: 'vazio', role: 'status' }, h('p', {}, msg));

/** Link de telefone: só dígitos no href. */
export function linkTelefone(tel) {
  const digitos = String(tel).replace(/\D/g, '');
  return h('a', { href: `tel:${digitos}` }, tel);
}

/** "Como chegar": abre o app de mapas só quando a pessoa clica. Nada é enviado antes do clique. */
export function linkComoChegar(c) {
  let destino = null;
  if (c.latitude !== null && c.longitude !== null) destino = `${c.latitude},${c.longitude}`;
  else if (c.endereco) destino = c.endereco;
  if (!destino) return h('span', {}, 'Como chegar: endereço não informado.');
  return h('a', { href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}`, target: '_blank', rel: 'noopener noreferrer' },
    'Como chegar (abre o mapa em outra aba)');
}
