// Acesso à API do próprio site. Baixa os dados agregados UMA vez e guarda só na memória da página.
// Nenhuma escolha da pessoa (UF, município) é enviada: o filtro acontece no navegador.
let cache = null;

async function buscar(rota) {
  const ctl = new AbortController();
  const tempo = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(`/api/${rota}`, { signal: ctl.signal, credentials: 'omit', cache: 'no-store' });
    if (!r.ok) {
      let msg = `Falha ao carregar (${r.status}).`;
      try { msg = (await r.json()).erro || msg; } catch { /* corpo não era JSON */ }
      throw new Error(msg);
    }
    return await r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('O servidor demorou demais para responder.');
    throw e;
  } finally { clearTimeout(tempo); }
}

/** Carrega tudo de uma vez. Em caso de erro, não guarda nada para permitir "Tentar de novo". */
export async function carregarDados() {
  if (cache) return cache;
  const [meta, ufs, modalidades, municipios, caps, serie] = await Promise.all(
    ['meta', 'ufs', 'modalidades', 'municipios', 'caps', 'serie'].map(buscar));
  cache = { meta, ufs, modalidades, municipios, caps, serie };
  return cache;
}
