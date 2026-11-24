// Mapa com Leaflet e alternativa interativa em SVG (funciona mesmo sem internet ou se o CDN do Leaflet falhar).
import { h } from './util.js';

let mapaAtual = null;
const NS = 'http://www.w3.org/2000/svg';

function elSvg(tag, attrs = {}, texto) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) e.setAttribute(k, String(v));
  }
  if (texto !== undefined) e.textContent = String(texto);
  return e;
}

/** Mapa esquemático interativo em SVG para modo offline / sem CDN externo. */
function desenharMapaSvg(container, comCoord, descricaoAcessivel) {
  container.classList.add('mapa-modo-svg');
  const W = 600;
  const H = 320;
  const pad = 38;

  const lats = comCoord.map((p) => Number(p.lat));
  const lons = comCoord.map((p) => Number(p.lon));
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLon = Math.min(...lons);
  let maxLon = Math.max(...lons);
  if (maxLat - minLat < 0.01) { minLat -= 0.01; maxLat += 0.01; }
  if (maxLon - minLon < 0.01) { minLon -= 0.01; maxLon += 0.01; }

  const projX = (lon) => pad + ((lon - minLon) / (maxLon - minLon)) * (W - 2 * pad);
  const projY = (lat) => H - pad - ((lat - minLat) / (maxLat - minLat)) * (H - 2 * pad);

  const svg = elSvg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'mapa-svg',
    role: 'group',
    'aria-label': `${descricaoAcessivel} (mapa esquemático offline)`,
  });

  // Grade suave de referência geográfica
  for (let i = 1; i <= 3; i++) {
    const gx = pad + ((W - 2 * pad) * i) / 4;
    const gy = pad + ((H - 2 * pad) * i) / 4;
    svg.append(
      elSvg('line', { x1: gx, y1: pad / 2, x2: gx, y2: H - pad / 2, stroke: '#d5e0e0', 'stroke-dasharray': '4 4' }),
      elSvg('line', { x1: pad / 2, y1: gy, x2: W - pad / 2, y2: gy, stroke: '#d5e0e0', 'stroke-dasharray': '4 4' }),
    );
  }
  svg.append(
    elSvg('text', { x: W / 2, y: 16, 'text-anchor': 'middle', 'font-size': 11, fill: '#3b4545', 'font-weight': '700' }, 'N ↑  Mapa esquemático por coordenadas (modo offline)'),
  );

  const painelDetalhe = h('div', { class: 'mapa-detalhe', 'aria-live': 'polite' },
    h('p', { class: 'dica' }, 'Toque ou pressione Enter em um ponto do mapa para ver os detalhes aqui. As mesmas informações estão na lista/tabela.'));

  const mostrarDetalhe = (p) => {
    painelDetalhe.replaceChildren();
    if (p.descricao instanceof Node) {
      painelDetalhe.append(p.descricao.cloneNode(true));
    } else {
      painelDetalhe.append(h('p', {}, String(p.descricao || p.texto)));
    }
  };

  comCoord.forEach((p, idx) => {
    const cx = Math.round(projX(Number(p.lon)) * 10) / 10;
    const cy = Math.round(projY(Number(p.lat)) * 10) / 10;
    const abaixo = p.classe === 'pino-abaixo';
    const sem = p.classe === 'pino-sem';
    const cor = abaixo ? '#8a1c1c' : sem ? '#555555' : '#0b5c5c';

    const g = elSvg('g', {
      class: 'pino-svg',
      tabindex: '0',
      role: 'button',
      'aria-label': p.texto,
      transform: `translate(${cx}, ${cy})`,
    });
    g.append(elSvg('title', {}, p.texto));

    if (abaixo) {
      // Losango para "abaixo da referência" (nunca usar só cor)
      g.append(elSvg('polygon', { points: '0,-15 15,0 0,15 -15,0', fill: cor, stroke: '#ffffff', 'stroke-width': 2 }));
    } else {
      g.append(elSvg('circle', {
        r: 13,
        fill: cor,
        stroke: '#ffffff',
        'stroke-width': 2,
        'stroke-dasharray': sem ? '3 2' : null,
      }));
    }
    g.append(elSvg('text', {
      x: 0,
      y: 4,
      'text-anchor': 'middle',
      fill: '#ffffff',
      'font-size': 11,
      'font-weight': '700',
    }, p.rotulo));

    g.addEventListener('click', () => mostrarDetalhe(p));
    g.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        mostrarDetalhe(p);
      }
    });
    svg.append(g);
    if (idx === 0) mostrarDetalhe(p);
  });

  container.append(svg, painelDetalhe);
}

/** Cria um mapa dentro de `container`. `pontos`: [{lat, lon, rotulo, classe, texto, descricao}] */
export function desenharMapa(container, pontos, descricaoAcessivel) {
  if (mapaAtual) { mapaAtual.remove(); mapaAtual = null; }
  container.replaceChildren();
  container.classList.remove('mapa-modo-svg');
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', descricaoAcessivel);

  const comCoord = pontos.filter((p) => p.lat !== null && p.lat !== undefined && p.lon !== null && p.lon !== undefined);
  if (comCoord.length === 0) {
    container.append(h('p', { class: 'vazio' }, 'Nenhum ponto com localização para mostrar no mapa.'));
    return;
  }

  if (typeof window.L === 'undefined') {
    desenharMapaSvg(container, comCoord, descricaoAcessivel);
    return;
  }

  const L = window.L;
  mapaAtual = L.map(container, { scrollWheelZoom: false }).setView([comCoord[0].lat, comCoord[0].lon], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapaAtual);

  for (const p of comCoord) {
    // O pino tem texto (número ou símbolo) e formato, não só cor.
    const icone = L.divIcon({ className: '', html: `<div class="pino ${p.classe || ''}"><span>${p.rotulo}</span></div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
    const marcador = L.marker([p.lat, p.lon], { icon: icone, title: p.texto, alt: p.texto, keyboard: true }).addTo(mapaAtual);
    marcador.bindPopup(p.descricao || p.texto);
  }
  if (comCoord.length > 1) mapaAtual.fitBounds(comCoord.map((p) => [p.lat, p.lon]), { padding: [30, 30], maxZoom: 14 });
}

export function destruirMapa() { if (mapaAtual) { mapaAtual.remove(); mapaAtual = null; } }
