/**
 * What a diagram is made of, the same list as lib/diagrams.php (keep them in step): settings {bg, grid, gs, snap, view}
 * and items, nodes (shapes with their text) and edges (connectors between two nodes or free points). The templates.
 */
export const SHAPES = ['rect', 'round', 'diamond', 'ellipse', 'para', 'cyl', 'doc', 'note', 'person', 'cloud', 'text'];
export const ROUTES = ['straight', 'elbow', 'curve'];
export const HEADS = ['none', 'arrow', 'open', 'diamond', 'circle', 'bar'];
export const SIDES = ['', 't', 'r', 'b', 'l'];
export const DASH = ['', 'dash', 'dot'];
export const FONTS = { sans: 'Inter, system-ui, sans-serif', serif: '"IBM Plex Serif", Georgia, serif', mono: '"IBM Plex Mono", ui-monospace, monospace', hand: 'Caveat, "Comic Sans MS", cursive' };
export const ALIGN = ['left', 'center', 'right'];
export const VALIGN = ['top', 'middle', 'bottom'];

/** Fills and inks of the panels: soft fills that keep black text readable, and strong colours for borders and lines. */
export const FILLS = ['#ffffff', '#e8eefc', '#dcefe6', '#fff3c4', '#ffe1cc', '#fbdada', '#efe3fb', '#e4e7e5', '#4352d6', '#0f6e56', '#c45a0c', '#1c1c1c'];
export const INKS = ['#1c1c1c', '#5f6660', '#9aa29d', '#ffffff', '#4352d6', '#1d4e89', '#0f6e56', '#b7791f', '#c45a0c', '#b3261e', '#a1328c', '#5b4cf0'];
export const BACKS = ['#ffffff', '#f7f8fb', '#fbf8f1', '#eef3f8', '#1d2026', '#16213a'];

export const r2 = (v) => Math.round(v * 100) / 100;
export const uid = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 8);
export const isDark = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return false; const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (r * 299 + g * 587 + b * 114) / 1000 < 128; };
const color = (v, d = '') => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d);
const num = (v, min, max, d) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? r2(Math.max(min, Math.min(max, n))) : d; };
const pick = (v, list, d) => (list.includes(v) ? v : d);
const text = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max) : '');
const okId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(v);

export const defaultSettings = (p = {}) => ({ bg: color(p.bg, '#ffffff'), grid: p.grid !== false, gs: num(p.gs, 5, 100, 20), snap: p.snap !== false });
export function cleanSettings(s = {}) {
  const out = defaultSettings(s);
  if (s.view && typeof s.view === 'object') out.view = { x: num(s.view.x, -1e7, 1e7, 0), y: num(s.view.y, -1e7, 1e7, 0), z: num(s.view.z, .05, 20, 1) };
  return out;
}
const cleanEnd = (e) => (e && okId(e.n) ? { n: e.n, p: pick(e.p, SIDES, '') } : { x: num(e?.x, -1e7, 1e7, 0), y: num(e?.y, -1e7, 1e7, 0) });

/** One item, cleaned as the server cleans it; null when it is not one. */
export function cleanItem(i) {
  if (!i || typeof i !== 'object' || !okId(i.id)) return null;
  const extra = {};
  if (okId(i.g)) extra.g = i.g;
  if (i.lk) extra.lk = true;
  if (i.t === 'node') return { id: i.id, t: 'node', k: pick(i.k, SHAPES, 'rect'), x: num(i.x, -1e7, 1e7, 0), y: num(i.y, -1e7, 1e7, 0), w: num(i.w, 4, 1e5, 120), h: num(i.h, 4, 1e5, 60),
    text: text(i.text, 5000), f: color(i.f), c: color(i.c), s: num(i.s, 0, 24, 2), d: pick(i.d, DASH, ''), tc: color(i.tc, '#1c1c1c'), fs: num(i.fs, 6, 400, 16),
    ff: pick(i.ff, Object.keys(FONTS), 'sans'), b: !!i.b, i: !!i.i, al: pick(i.al, ALIGN, 'center'), va: pick(i.va, VALIGN, 'middle'), ...extra };
  if (i.t === 'edge') return { id: i.id, t: 'edge', a: cleanEnd(i.a), b: cleanEnd(i.b), r: pick(i.r, ROUTES, 'elbow'), c: color(i.c, '#1c1c1c'), s: num(i.s, .5, 24, 2), d: pick(i.d, DASH, ''),
    sa: pick(i.sa, HEADS, 'none'), ea: pick(i.ea, HEADS, 'arrow'), text: text(i.text, 1000), fs: num(i.fs, 6, 200, 14), tc: color(i.tc, '#1c1c1c'), ...extra };
  return null;
}
export function cleanItems(list) {
  const out = [], seen = new Set();
  for (const i of Array.isArray(list) ? list : []) { const c = cleanItem(i); if (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); } }
  return out;
}

/** New ids for items that arrive (paste, duplicate, templates): the connectors keep pointing at the right nodes. */
export function freshIds(list) {
  const map = new Map(), groups = new Map();
  for (const i of list) map.set(i.id, uid());
  const end = (e) => (e?.n ? (map.has(e.n) ? { ...e, n: map.get(e.n) } : null) : e);
  return list.map((i) => {
    const o = { ...i, id: map.get(i.id) };
    if (i.g) { if (!groups.has(i.g)) groups.set(i.g, uid()); o.g = groups.get(i.g); }
    if (i.t === 'edge') {
      // an end on a node that did not come along becomes a free point where it was
      o.a = end(i.a) || { x: i._ax ?? 0, y: i._ay ?? 0 };
      o.b = end(i.b) || { x: i._bx ?? 0, y: i._by ?? 0 };
    }
    delete o._ax; delete o._ay; delete o._bx; delete o._by;
    return o;
  });
}

/** A node with the style of the app (or of the last one used). */
export const node = (k, x, y, w, h, textValue = '', st = {}) => ({ id: uid(), t: 'node', k, x, y, w, h, text: textValue, f: k === 'text' ? '' : k === 'note' ? '#fff3c4' : '#ffffff', c: k === 'text' ? '' : '#1c1c1c', s: 2, d: '', tc: '#1c1c1c', fs: 16, ff: 'sans', b: false, i: false, al: 'center', va: 'middle', ...st });
export const edge = (a, b, st = {}) => ({ id: uid(), t: 'edge', a, b, r: 'elbow', c: '#1c1c1c', s: 2, d: '', sa: 'none', ea: 'arrow', text: '', fs: 14, tc: '#1c1c1c', ...st });
/** The usual size of a new shape. */
export const SIZE = { rect: [140, 70], round: [140, 70], diamond: [140, 90], ellipse: [130, 80], para: [150, 70], cyl: [100, 110], doc: [140, 80], note: [140, 110], person: [50, 80], cloud: [160, 100], text: [140, 40] };

// ------------------------------------------------------------------ templates

const at = (n) => ({ n: n.id, p: '' });
/** [key, icon, make(it)]: make returns {settings, items}; it = Italian. The mind map and the org chart are laid out by layout.js. */
export const TEMPLATES = [
  ['blank', 'square', () => ({ items: [] })],
  ['flowchart', 'workflow', (it) => {
    const B = '#e8eefc', st = { f: B, c: '#4352d6', s: 2 };
    const start = node('ellipse', 0, 0, 150, 64, it ? 'Inizio' : 'Start', { ...st, f: '#dcefe6', c: '#0f6e56' });
    const read = node('para', -10, 120, 170, 70, it ? 'Leggi i dati' : 'Read the data', st);
    const ask = node('diamond', -5, 250, 160, 100, it ? 'Sono validi?' : 'Are they valid?', { ...st, f: '#fff3c4', c: '#b7791f' });
    const work = node('rect', -5, 410, 160, 70, it ? 'Elaborali' : 'Process them', st);
    const save = node('cyl', 15, 540, 120, 100, it ? 'Archivio' : 'Archive', st);
    const fix = node('round', 260, 265, 150, 70, it ? 'Chiedi di correggerli' : 'Ask to fix them', { ...st, f: '#ffe1cc', c: '#c45a0c' });
    const end = node('ellipse', 0, 700, 150, 64, it ? 'Fine' : 'End', { ...st, f: '#dcefe6', c: '#0f6e56' });
    const e = (a, b, o = {}) => edge(at(a), at(b), { c: '#3a3f47', ...o });
    return { items: [start, read, ask, work, save, fix, end, e(start, read), e(read, ask), e(ask, work, { text: it ? 'sì' : 'yes' }), e(ask, fix, { text: 'no', a: { n: ask.id, p: 'r' }, b: { n: fix.id, p: 'l' } }),
      e(fix, read, { a: { n: fix.id, p: 't' }, b: { n: read.id, p: 'r' } }), e(work, save), e(save, end)] };
  }],
  ['orgchart', 'network', (it) => {
    const st = { k: 'round', f: '#e8eefc', c: '#4352d6' }, n = (txt, o = {}) => node('round', 0, 0, 170, 64, txt, { ...st, ...o });
    const ceo = n(it ? 'Direzione\nAnna Neri' : 'Director\nAnna Black', { f: '#4352d6', c: '#2f38a3', tc: '#ffffff', b: true });
    const a = n(it ? 'Amministrazione' : 'Administration'), b = n(it ? 'Prodotto' : 'Product'), c = n(it ? 'Vendite' : 'Sales');
    const kids = [[a, [it ? 'Contabilità' : 'Accounting', it ? 'Personale' : 'People']], [b, [it ? 'Progetto' : 'Design', it ? 'Sviluppo' : 'Development', 'QA']], [c, [it ? 'Italia' : 'Italy', it ? 'Estero' : 'Abroad']]];
    const items = [ceo, a, b, c], links = [[ceo, a], [ceo, b], [ceo, c]];
    for (const [p, list] of kids) for (const x of list) { const k = n(x, { f: '#ffffff' }); items.push(k); links.push([p, k]); }
    return { tree: { root: ceo.id, dir: 'down' }, items: [...items, ...links.map(([p, k]) => edge(at(p), at(k), { ea: 'none', c: '#5f6660' }))] };
  }],
  ['mindmap', 'brain', (it) => {
    const root = node('ellipse', 0, 0, 190, 80, it ? 'Idea centrale' : 'Main idea', { f: '#4352d6', c: '#2f38a3', tc: '#ffffff', fs: 20, b: true });
    const tones = [['#dcefe6', '#0f6e56'], ['#fff3c4', '#b7791f'], ['#ffe1cc', '#c45a0c'], ['#efe3fb', '#5b4cf0']];
    const branches = it ? [['Obiettivi', ['Breve termine', 'Lungo termine']], ['Persone', ['Squadra', 'Clienti']], ['Risorse', ['Tempo', 'Budget', 'Strumenti']], ['Rischi', ['Ritardi']]]
      : [['Goals', ['Short term', 'Long term']], ['People', ['Team', 'Customers']], ['Resources', ['Time', 'Budget', 'Tools']], ['Risks', ['Delays']]];
    const items = [root], links = [];
    branches.forEach(([name, leaves], k) => {
      const [f, c] = tones[k % tones.length], b = node('round', 0, 0, 150, 56, name, { f, c, b: true });
      items.push(b); links.push(edge(at(root), at(b), { r: 'curve', ea: 'none', c, s: 3 }));
      for (const l of leaves) { const x = node('round', 0, 0, 140, 44, l, { f: '#ffffff', c, fs: 15 }); items.push(x); links.push(edge(at(b), at(x), { r: 'curve', ea: 'none', c, s: 2 })); }
    });
    return { tree: { root: root.id, dir: 'both' }, items: [...items, ...links] };
  }],
  ['process', 'arrow-right', (it) => {
    const names = it ? ['Idea', 'Progetto', 'Sviluppo', 'Prova', 'Rilascio'] : ['Idea', 'Design', 'Build', 'Test', 'Release'];
    const tones = ['#e8eefc', '#dcefe6', '#fff3c4', '#ffe1cc', '#efe3fb'];
    const nodes = names.map((x, k) => node('round', k * 200, 0, 150, 70, x, { f: tones[k], c: '#3a3f47', b: true }));
    return { items: [...nodes, ...nodes.slice(1).map((n, k) => edge(at(nodes[k]), at(n), { r: 'straight', c: '#3a3f47' }))] };
  }],
  ['network', 'cloud', (it) => {
    const cloud = node('cloud', 160, -10, 180, 110, 'Internet', { f: '#eef3f8', c: '#1d4e89' });
    const fw = node('rect', 180, 170, 140, 60, 'Firewall', { f: '#fbdada', c: '#b3261e' });
    const web = node('rect', 20, 300, 140, 64, it ? 'Server web' : 'Web server', { f: '#e8eefc', c: '#4352d6' });
    const app = node('rect', 340, 300, 140, 64, it ? 'Server app' : 'App server', { f: '#e8eefc', c: '#4352d6' });
    const db = node('cyl', 205, 430, 90, 100, 'Database', { f: '#dcefe6', c: '#0f6e56' });
    const user = node('person', 0, 10, 46, 76, it ? 'Utente' : 'User', { f: '#ffffff', c: '#1c1c1c' });
    const e = (a, b, o = {}) => edge(at(a), at(b), { c: '#3a3f47', ...o });
    return { items: [cloud, fw, web, app, db, user, e(user, cloud, { r: 'straight', sa: 'arrow' }), e(cloud, fw), e(fw, web), e(fw, app), e(web, db, { d: 'dash' }), e(app, db)] };
  }],
  ['swot', 'grid-2x2', (it) => {
    const box = (x, y, f, c, head, lines) => node('round', x, y, 300, 210, head + '\n\n' + lines.map((l) => '• ' + l).join('\n'), { f, c, al: 'left', va: 'top', fs: 15 });
    const L = it ? [['Punti di forza', ['Squadra esperta', 'Prodotto apprezzato', 'Costi bassi']], ['Debolezze', ['Poca visibilità', 'Pochi canali di vendita']], ['Opportunità', ['Mercato in crescita', 'Nuovi partner', 'Bandi pubblici']], ['Minacce', ['Concorrenti grandi', 'Prezzi in aumento']]]
      : [['Strengths', ['Skilled team', 'Well-liked product', 'Low costs']], ['Weaknesses', ['Little visibility', 'Few sales channels']], ['Opportunities', ['Growing market', 'New partners', 'Public grants']], ['Threats', ['Big competitors', 'Rising prices']]];
    const tone = [['#dcefe6', '#0f6e56'], ['#ffe1cc', '#c45a0c'], ['#e8eefc', '#4352d6'], ['#fbdada', '#b3261e']];
    const title = node('text', 0, -70, 620, 50, it ? 'Analisi SWOT' : 'SWOT analysis', { fs: 26, b: true });
    return { items: [title, ...L.map(([h, l], k) => box((k % 2) * 320, Math.floor(k / 2) * 230, tone[k][0], tone[k][1], h, l))] };
  }],
  ['timeline', 'milestone', (it) => {
    const steps = it ? [['Gen', 'Idea'], ['Mar', 'Prototipo'], ['Giu', 'Prove con gli utenti'], ['Set', 'Lancio'], ['Dic', 'Bilancio']] : [['Jan', 'Idea'], ['Mar', 'Prototype'], ['Jun', 'User tests'], ['Sep', 'Launch'], ['Dec', 'Review']];
    const tones = ['#4352d6', '#0f6e56', '#b7791f', '#c45a0c', '#a1328c'], items = [], dots = [];
    steps.forEach(([when, what], k) => {
      const d = node('ellipse', k * 190, 0, 44, 44, String(k + 1), { f: tones[k], c: tones[k], tc: '#ffffff', b: true });
      dots.push(d);
      items.push(d, node('text', k * 190 - 58, k % 2 ? 52 : -38, 160, 30, when, { fs: 14, tc: '#5f6660', b: true }), node('round', k * 190 - 58, k % 2 ? 86 : -88, 160, 44, what, { f: '#ffffff', c: tones[k], fs: 15 }));
    });
    return { items: [...items, ...dots.slice(1).map((n, k) => edge(at(dots[k]), at(n), { r: 'straight', ea: 'none', c: '#9aa0a6', s: 3 }))] };
  }],
  ['database', 'database', (it) => {
    const table = (x, y, name, cols) => node('rect', x, y, 210, 40 + cols.length * 24, name + '\n' + cols.join('\n'), { f: '#ffffff', c: '#1d4e89', al: 'left', va: 'top', fs: 14, ff: 'mono' });
    const users = table(0, 0, it ? 'utenti' : 'users', ['🔑 id', 'name', 'email']);
    const orders = table(320, 0, it ? 'ordini' : 'orders', ['🔑 id', (it ? 'utente_id' : 'user_id'), (it ? 'data' : 'date'), (it ? 'totale' : 'total')]);
    const lines = table(640, 0, it ? 'righe' : 'lines', ['🔑 id', (it ? 'ordine_id' : 'order_id'), (it ? 'prodotto_id' : 'product_id'), (it ? 'quantità' : 'quantity')]);
    const prod = table(640, 200, it ? 'prodotti' : 'products', ['🔑 id', (it ? 'nome' : 'name'), (it ? 'prezzo' : 'price')]);
    const e = (a, b) => edge(at(a), at(b), { text: '1 : n', c: '#1d4e89', ea: 'none' });
    return { items: [users, orders, lines, prod, e(users, orders), e(orders, lines), e(prod, lines)] };
  }],
  ['decision', 'git-fork', (it) => {
    const q = (x, y, txt) => node('diamond', x, y, 190, 110, txt, { f: '#fff3c4', c: '#b7791f' });
    const a = (x, y, txt, ok) => node('round', x, y, 170, 60, txt, { f: ok ? '#dcefe6' : '#fbdada', c: ok ? '#0f6e56' : '#b3261e', b: true });
    const q1 = q(190, 0, it ? 'Serve davvero?' : 'Is it really needed?'), q2 = q(0, 180, it ? 'Rientra nel budget?' : 'Is it in the budget?'), q3 = q(380, 180, it ? 'Si può rimandare?' : 'Can it wait?');
    const r1 = a(100, 360, it ? 'Compra' : 'Buy it', true), r2 = a(-100, 360, it ? 'Cerca un’alternativa' : 'Look for another way', false), r3 = a(300, 360, it ? 'Rimanda' : 'Wait', false), r4 = a(500, 360, it ? 'Rinuncia' : 'Let it go', false);
    const yes = it ? 'sì' : 'yes', e = (x, y, text) => edge(at(x), at(y), { text, c: '#3a3f47' });
    return { items: [q1, q2, q3, r1, r2, r3, r4, e(q1, q2, yes), e(q1, q3, 'no'), e(q2, r1, yes), e(q2, r2, 'no'), e(q3, r3, yes), e(q3, r4, 'no')] };
  }],
];
