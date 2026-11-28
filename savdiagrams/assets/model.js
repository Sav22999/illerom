/**
 * What a diagram is made of, the same list as lib/diagrams.php (keep them in step): settings {bg, grid, gs, snap, view}
 * and items, nodes (shapes with their text) and edges (connectors between two nodes or free points). The templates.
 */
export const SHAPES = ['rect', 'round', 'diamond', 'ellipse', 'para', 'cyl', 'doc', 'note', 'person', 'cloud', 'text',
  // network
  'router', 'switch', 'server', 'firewall', 'pc', 'laptop', 'phone', 'printer', 'ap',
  // UML
  'class', 'package', 'comp', 'cube', 'lifeline', 'frame', 'box', 'start', 'end',
  // org chart, timeline, database, BPMN, swimlanes
  'card', 'track', 'axis', 'mile', 'entity', 'subproc', 'bstart', 'binter', 'bend', 'gwx', 'gwp', 'gwo', 'lane', 'vlane'];
export const ROUTES = ['straight', 'elbow', 'curve'];
export const HEADS = ['none', 'arrow', 'open', 'diamond', 'circle', 'bar', 'tri', 'odiamond', 'ocircle', 'er1', 'er01', 'ern', 'er0n'];
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
/** An end on a node: its side, and (o) where along that side, 0…1 (a message on a lifeline); without o, the middle. */
const cleanEnd = (e) => {
  if (!(e && okId(e.n))) return { x: num(e?.x, -1e7, 1e7, 0), y: num(e?.y, -1e7, 1e7, 0) };
  const p = pick(e.p, SIDES, ''), o = p && e.o !== undefined && e.o !== null ? num(e.o, 0, 1, null) : null;
  return o === null ? { n: e.n, p } : { n: e.n, p, o: Math.round(o * 1000) / 1000 };
};
/** A small picture inside a node (the photo of an org chart card): a data: URL of a PNG, JPEG or WebP. */
export const MAX_IMG = 60000;
const cleanImg = (v) => (typeof v === 'string' && v.length <= MAX_IMG && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(v) ? v : '');

/** One item, cleaned as the server cleans it; null when it is not one. */
export function cleanItem(i) {
  if (!i || typeof i !== 'object' || !okId(i.id)) return null;
  const extra = {};
  if (okId(i.g)) extra.g = i.g;
  if (i.lk) extra.lk = true;
  if (i.t === 'node' && cleanImg(i.img)) extra.img = i.img;
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
export const SIZE = { rect: [140, 70], round: [140, 70], diamond: [140, 90], ellipse: [130, 80], para: [150, 70], cyl: [100, 110], doc: [140, 80], note: [140, 110], person: [50, 80], cloud: [160, 100], text: [140, 40],
  router: [64, 64], switch: [84, 48], server: [52, 72], firewall: [76, 60], pc: [72, 64], laptop: [80, 56], phone: [36, 64], printer: [72, 60], ap: [64, 56],
  class: [200, 120], package: [240, 160], comp: [160, 80], cube: [160, 100], lifeline: [130, 360], frame: [320, 200], box: [300, 260], start: [30, 30], end: [34, 34],
  card: [230, 76], track: [760, 100], axis: [620, 44], mile: [26, 26], entity: [220, 130], subproc: [150, 84], bstart: [40, 40], binter: [40, 40], bend: [40, 40],
  gwx: [52, 52], gwp: [52, 52], gwo: [52, 52], lane: [640, 160], vlane: [200, 420] };

// ------------------------------------------------------------------ kinds that behave on their own

/** The text goes under the shape (icons, events, gateways), as for a person. */
export const UNDER = new Set(['person', 'router', 'switch', 'server', 'firewall', 'pc', 'laptop', 'phone', 'printer', 'ap', 'start', 'end', 'mile', 'bstart', 'binter', 'bend', 'gwx', 'gwp', 'gwo']);
/** Containers: what lies inside them moves with them, and a new one goes behind what it covers. */
export const CONTAINERS = new Set(['lane', 'vlane', 'track', 'box', 'frame', 'package', 'cube', 'lifeline']);
/** Shapes in compartments (UML class, database table): lines "--" divide the text into parts, the first one is the name. */
export const COMPART = new Set(['class', 'entity']);
/** Connectors are attached anywhere along them, not only in the middle of a side. */
export const SLOTS = new Set(['lifeline']);
/** The parts of the text of a shape in compartments (a table: its name is the first line alone, then its columns). */
export function parts(s, k) {
  const out = String(s || '').split('\n').reduce((o, l) => { if (/^\s*-{2,}\s*$/.test(l)) o.push([]); else o[o.length - 1].push(l); return o; }, [[]]);
  if (k === 'entity' && out[0].length > 1) out.splice(0, 1, [out[0][0]], out[0].slice(1));
  return out;
}
/** The height that fits the text of a shape in compartments: the name, then every part (an empty one stays thin). */
export function compH(n) {
  const lh = n.fs * 1.25, ps = parts(n.text, n.k);
  return Math.round(ps.reduce((a, p, k) => a + (k === 0 ? Math.max(1, p.length) * lh + 14 : p.length ? p.length * lh + 10 : 12), 0));
}

// ------------------------------------------------------------------ the libraries of shapes

/**
 * The library: [key, entries]. A node entry is [id, kind, w, h, style, text ([en, it])]; an edge entry is [id, null, style]
 * (pressed, the connector tool draws the next connectors with that style). The label of an entry is s_<id>; the same entry
 * may be in more libraries.
 */
const B = { f: '#ffffff', c: '#1c1c1c' };
const NET = { f: '#e8eefc', c: '#1d4e89' };
export const LIBRARIES = [
  ['basic', [['rect', 'rect'], ['round', 'round'], ['diamond', 'diamond'], ['ellipse', 'ellipse'], ['para', 'para'], ['cyl', 'cyl'], ['doc', 'doc'], ['note', 'note'], ['person', 'person'], ['cloud', 'cloud'], ['text', 'text']]],
  ['network', [['internet', 'cloud', 160, 100, { f: '#eef3f8', c: '#1d4e89' }, ['Internet', 'Internet']], ['router', 'router', 64, 64, NET], ['switch', 'switch', 84, 48, NET], ['server', 'server', 52, 72, NET], ['firewall', 'firewall', 76, 60, { f: '#fbdada', c: '#b3261e' }],
    ['pc', 'pc', 72, 64, NET], ['laptop', 'laptop', 80, 56, NET], ['phone', 'phone', 36, 64, NET], ['printer', 'printer', 72, 60, NET], ['ap', 'ap', 64, 56, NET], ['netdb', 'cyl', 80, 90, { f: '#dcefe6', c: '#0f6e56' }, ['Database', 'Database']],
    ['zone', 'box', 360, 240, { f: '#f7f8fb', c: '#5f6660', d: 'dash', s: 1.5 }, ['LAN', 'LAN']], ['link', null, { r: 'straight', sa: 'none', ea: 'none', c: '#3a3f47' }], ['wireless', null, { r: 'straight', sa: 'none', ea: 'none', d: 'dash', c: '#3a3f47' }]]],
  ['uml_class', [['class', 'class', 200, 120, B, ['Class\n--\n- attribute: Type\n--\n+ method(): Type', 'Classe\n--\n- attributo: Tipo\n--\n+ metodo(): Tipo']],
    ['iface', 'class', 200, 90, { f: '#f7f8fb', c: '#1c1c1c' }, ['«interface»\nName\n--\n--\n+ method(): Type', '«interface»\nNome\n--\n--\n+ metodo(): Tipo']],
    ['enum', 'class', 180, 100, { f: '#fbf8f1', c: '#1c1c1c' }, ['«enumeration»\nColour\n--\nRED\nGREEN', '«enumeration»\nColore\n--\nROSSO\nVERDE']],
    ['package', 'package', 240, 160, { f: '#fbf8f1', c: '#1c1c1c' }, ['package', 'pacchetto']], ['unote', 'note', 160, 80, { f: '#fff3c4', c: '#b7791f', al: 'left', va: 'top', fs: 14 }],
    ['assoc', null, { r: 'straight', sa: 'none', ea: 'none' }], ['dir_assoc', null, { r: 'straight', sa: 'none', ea: 'open' }], ['inherit', null, { r: 'elbow', sa: 'none', ea: 'tri' }], ['realize', null, { r: 'elbow', sa: 'none', ea: 'tri', d: 'dash' }],
    ['depend', null, { r: 'straight', sa: 'none', ea: 'open', d: 'dash' }], ['aggr', null, { r: 'elbow', sa: 'odiamond', ea: 'none' }], ['compo', null, { r: 'elbow', sa: 'diamond', ea: 'none' }]]],
  ['uml_usecase', [['actor', 'person', 50, 80, B, ['Actor', 'Attore']], ['usecase', 'ellipse', 170, 70, { f: '#e8eefc', c: '#4352d6' }, ['Use case', 'Caso d’uso']], ['system', 'box', 320, 380, { f: '#ffffff', c: '#1c1c1c' }, ['System', 'Sistema']],
    ['assoc', null, { r: 'straight', sa: 'none', ea: 'none' }], ['include', null, { r: 'straight', sa: 'none', ea: 'open', d: 'dash', text: '«include»' }], ['extend', null, { r: 'straight', sa: 'none', ea: 'open', d: 'dash', text: '«extend»' }], ['inherit', null, { r: 'straight', sa: 'none', ea: 'tri' }]]],
  ['uml_sequence', [['lifeline', 'lifeline', 130, 360, { f: '#e8eefc', c: '#4352d6' }, [':Object', ':Oggetto']], ['activation', 'rect', 16, 80, { f: '#ffffff', c: '#4352d6', s: 1.5 }], ['frame', 'frame', 320, 160, { f: '', c: '#5f6660', s: 1.5, fs: 14 }, ['loop', 'loop']],
    ['msg', null, { r: 'straight', sa: 'none', ea: 'arrow' }], ['amsg', null, { r: 'straight', sa: 'none', ea: 'open' }], ['reply', null, { r: 'straight', sa: 'none', ea: 'open', d: 'dash' }]]],
  ['uml_activity', [['start', 'start', 30, 30, B], ['end', 'end', 34, 34, B], ['action', 'round', 160, 60, { f: '#e8eefc', c: '#4352d6' }, ['Action', 'Azione']], ['decision', 'diamond', 60, 60, { f: '#fff3c4', c: '#b7791f' }],
    ['fork', 'rect', 160, 8, { f: '#1c1c1c', c: '', s: 0 }], ['vlane', 'vlane', 220, 460, { f: '#ffffff', c: '#5f6660' }, ['Partition', 'Partizione']], ['flow', null, { r: 'elbow', sa: 'none', ea: 'arrow' }]]],
  ['uml_state', [['start', 'start', 30, 30, B], ['end', 'end', 34, 34, B], ['state', 'round', 150, 60, { f: '#efe3fb', c: '#5b4cf0' }, ['State', 'Stato']], ['choice', 'diamond', 44, 44, { f: '#ffffff', c: '#1c1c1c' }],
    ['trans', null, { r: 'curve', sa: 'none', ea: 'arrow' }]]],
  ['uml_component', [['comp', 'comp', 170, 80, { f: '#e8eefc', c: '#4352d6' }, ['Component', 'Componente']], ['cube', 'cube', 180, 110, { f: '#f7f8fb', c: '#1c1c1c' }, ['Node', 'Nodo']], ['package', 'package', 240, 160, { f: '#fbf8f1', c: '#1c1c1c' }, ['package', 'pacchetto']],
    ['artifact', 'note', 140, 70, { f: '#ffffff', c: '#1c1c1c', fs: 14 }, ['«artifact»\nfile.jar', '«artifact»\nfile.jar']], ['iface_ball', 'ellipse', 22, 22, { f: '#ffffff', c: '#1c1c1c' }], ['depend', null, { r: 'straight', sa: 'none', ea: 'open', d: 'dash' }], ['assoc', null, { r: 'straight', sa: 'none', ea: 'none' }]]],
  ['org', [['card', 'card', 230, 76, { f: '#ffffff', c: '#4352d6', al: 'left' }, ['Name Surname\nRole', 'Nome Cognome\nRuolo']], ['dept', 'round', 180, 56, { f: '#e8eefc', c: '#4352d6', b: true }, ['Department', 'Reparto']], ['team', 'box', 520, 220, { f: '#f7f8fb', c: '#9aa29d', d: 'dash', s: 1.5 }, ['Team', 'Squadra']],
    ['person', 'person'], ['orgline', null, { r: 'elbow', sa: 'none', ea: 'none', c: '#5f6660' }]]],
  ['timeline', [['track', 'track', 760, 100, { f: '#f7f8fb', c: '#4352d6' }, ['Lane', 'Corsia']], ['axis', 'axis', 620, 44, { f: '', c: '#5f6660', fs: 13 }, ['Jan\nFeb\nMar\nApr\nMay\nJun', 'Gen\nFeb\nMar\nApr\nMag\nGiu']],
    ['mile', 'mile', 26, 26, { f: '#4352d6', c: '#2f38a3', fs: 13 }, ['Milestone', 'Traguardo']], ['span', 'round', 200, 34, { f: '#dcefe6', c: '#0f6e56', fs: 14, al: 'left' }, ['Interval', 'Intervallo']], ['tlink', null, { r: 'elbow', sa: 'none', ea: 'arrow', d: 'dash', c: '#5f6660' }]]],
  ['er', [['entity', 'entity', 220, 130, { f: '#ffffff', c: '#1d4e89', fs: 14 }, ['table\nPK id\nname\nFK other_id', 'tabella\nPK id\nnome\nFK altro_id']], ['er_entity', 'rect', 140, 60, { f: '#e8eefc', c: '#1d4e89' }, ['Entity', 'Entità']],
    ['er_rel', 'diamond', 140, 80, { f: '#fff3c4', c: '#b7791f' }, ['Relation', 'Relazione']], ['er_attr', 'ellipse', 120, 50, { f: '#ffffff', c: '#1d4e89', fs: 14 }, ['attribute', 'attributo']],
    ['er_11', null, { r: 'elbow', sa: 'er1', ea: 'er1', c: '#1d4e89' }], ['er_1n', null, { r: 'elbow', sa: 'er1', ea: 'ern', c: '#1d4e89' }], ['er_0n', null, { r: 'elbow', sa: 'er1', ea: 'er0n', c: '#1d4e89' }], ['er_01', null, { r: 'elbow', sa: 'er1', ea: 'er01', c: '#1d4e89' }]]],
  ['bpmn', [['task', 'round', 140, 76, { f: '#ffffff', c: '#1c1c1c', fs: 15 }, ['Task', 'Attività']], ['subproc', 'subproc', 150, 84, { f: '#ffffff', c: '#1c1c1c', fs: 15 }, ['Sub-process', 'Sottoprocesso']],
    ['bstart', 'bstart', 40, 40, { f: '#dcefe6', c: '#0f6e56', fs: 13 }], ['binter', 'binter', 40, 40, { f: '#fff3c4', c: '#b7791f', fs: 13 }], ['bend', 'bend', 40, 40, { f: '#fbdada', c: '#b3261e', fs: 13 }],
    ['gwx', 'gwx', 52, 52, { f: '#fff3c4', c: '#b7791f', fs: 13 }], ['gwp', 'gwp', 52, 52, { f: '#fff3c4', c: '#b7791f', fs: 13 }], ['gwo', 'gwo', 52, 52, { f: '#fff3c4', c: '#b7791f', fs: 13 }],
    ['dataobj', 'note', 50, 64, { f: '#ffffff', c: '#1c1c1c', fs: 12 }], ['datastore', 'cyl', 70, 64, { f: '#ffffff', c: '#1c1c1c', fs: 12 }],
    ['pool', 'lane', 720, 300, { f: '#ffffff', c: '#1c1c1c' }, ['Pool', 'Partecipante']], ['lane', 'lane', 680, 150, { f: '#ffffff', c: '#5f6660' }, ['Lane', 'Corsia']],
    ['seqflow', null, { r: 'elbow', sa: 'none', ea: 'arrow' }], ['msgflow', null, { r: 'elbow', sa: 'ocircle', ea: 'tri', d: 'dash' }], ['bassoc', null, { r: 'straight', sa: 'none', ea: 'none', d: 'dot' }]]],
  ['swimlane', [['lane', 'lane', 680, 150, { f: '#ffffff', c: '#5f6660' }, ['Lane', 'Corsia']], ['vlane', 'vlane', 220, 460, { f: '#ffffff', c: '#5f6660' }, ['Lane', 'Corsia']], ['step', 'round', 140, 64, { f: '#e8eefc', c: '#4352d6' }, ['Step', 'Passo']],
    ['diamond', 'diamond'], ['flow', null, { r: 'elbow', sa: 'none', ea: 'arrow' }]]],
];
/** Every entry by its id: {id, k (null for a connector), w, h, st, tx}. */
export const PRESETS = new Map();
for (const [, list] of LIBRARIES) for (const [id, k, a, b, st, tx] of list) if (!PRESETS.has(id)) PRESETS.set(id, k ? { id, k, w: a || SIZE[k][0], h: b || SIZE[k][1], st: st || {}, tx } : { id, k: null, st: a || {} });
/** The connector styles of the library that a connector can take (its "relation"), in the order of the libraries. */
export const RELATIONS = [...PRESETS.values()].filter((p) => !p.k).map((p) => p.id);
/** The library of a kind of shape (its first one, the basic shapes aside). */
export const libOf = (k) => (LIBRARIES.find(([key, list]) => key !== 'basic' && list.some((e) => e[1] === k)) || LIBRARIES[0])[0];

// ------------------------------------------------------------------ templates

const at = (n) => ({ n: n.id, p: '' });
/** A shape in compartments as tall as its text. */
const fitted = (n) => ({ ...n, h: compH(n) });
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
    // cards with a name, a role and the initials (or a photo), laid out downwards by layout.js
    const card = (name, role, c, o = {}) => node('card', 0, 0, 230, 76, name + '\n' + role, { f: '#ffffff', c, al: 'left', ...o });
    const ceo = card('Anna Ferri', it ? 'Direttrice generale' : 'Chief executive', '#4352d6', { f: '#e8eefc', b: true });
    const depts = [
      [card('Marco Rossi', it ? 'Responsabile amministrazione' : 'Head of administration', '#0f6e56'), [['Giulia Marino', it ? 'Contabilità' : 'Accounting'], ['Luca Bruno', it ? 'Personale' : 'People']]],
      [card('Sara Conti', it ? 'Responsabile prodotto' : 'Head of product', '#c45a0c'), [['Paolo Greco', it ? 'Progettazione' : 'Design'], ['Elena Ricci', it ? 'Sviluppo' : 'Development'], ['Davide Costa', it ? 'Qualità' : 'Quality']]],
      [card('Chiara Gallo', it ? 'Responsabile vendite' : 'Head of sales', '#a1328c'), [['Marta Fontana', it ? 'Italia' : 'Italy'], ['Omar Haddad', it ? 'Estero' : 'Abroad']]],
    ];
    const items = [ceo], links = [];
    for (const [head, list] of depts) {
      items.push(head); links.push([ceo, head]);
      for (const [nm, role] of list) { const k = card(nm, role, head.c); items.push(k); links.push([head, k]); }
    }
    return { tree: { root: ceo.id, dir: 'down' }, items: [...items, ...links.map(([p, k]) => edge(at(p), at(k), { ea: 'none', c: '#9aa29d' }))] };
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
  ['network', 'network', (it) => {
    const N = { f: '#e8eefc', c: '#1d4e89', fs: 13 }, T = (x) => (it ? x[1] : x[0]);
    const lan = node('box', 0, 444, 820, 276, 'LAN', { f: '#f7f8fb', c: '#9aa29d', d: 'dash', s: 1.5, fs: 14, b: true });
    const dmz = node('box', 560, 196, 300, 190, 'DMZ', { f: '#fbf8f1', c: '#9aa29d', d: 'dash', s: 1.5, fs: 14, b: true });
    const net = node('cloud', 300, -20, 170, 100, 'Internet', { f: '#eef3f8', c: '#1d4e89' });
    const fw = node('firewall', 347, 150, 76, 60, 'Firewall', { f: '#fbdada', c: '#b3261e', fs: 13 });
    const rt = node('router', 353, 260, 64, 64, 'Router', N);
    const sw = node('switch', 343, 380, 84, 48, 'Switch', N);
    const web = node('server', 610, 252, 52, 72, T(['Web server', 'Server web']), N), mail = node('server', 750, 252, 52, 72, T(['Mail server', 'Server posta']), N);
    const pc1 = node('pc', 40, 540, 72, 64, 'PC 1', N), pc2 = node('pc', 170, 540, 72, 64, 'PC 2', N), pr = node('printer', 300, 542, 72, 60, T(['Printer', 'Stampante']), N);
    const nas = node('server', 445, 536, 52, 72, 'NAS', N), ap = node('ap', 575, 545, 64, 56, 'Wi-Fi', N);
    const lap = node('laptop', 710, 520, 80, 56, 'Laptop', N), ph = node('phone', 732, 625, 36, 64, T(['Phone', 'Telefono']), N);
    const L = (a, b, o = {}) => edge(a, b, { r: 'elbow', sa: 'none', ea: 'none', c: '#3a3f47', ...o });
    const S = (n, p) => ({ n: n.id, p });
    return { items: [lan, dmz, net, fw, rt, sw, web, mail, pc1, pc2, pr, nas, ap, lap, ph,
      L(S(net, 'b'), S(fw, 't'), { r: 'straight' }), L(S(fw, 'b'), S(rt, 't'), { r: 'straight' }), L(S(rt, 'b'), S(sw, 't'), { r: 'straight' }),
      L(S(fw, 'r'), S(web, 't')), L(S(fw, 'r'), S(mail, 't')),
      ...[pc1, pc2, pr, nas, ap].map((n) => L(S(sw, 'b'), S(n, 't'))),
      L(S(ap, 'r'), S(lap, 'l'), { d: 'dash' }), L(S(ap, 'r'), S(ph, 'l'), { d: 'dash' })] };
  }],
  ['uml_class', 'square-stack', (it) => {
    const T = (x) => (it ? x[1] : x[0]), C = (x, y, w, txt, o = {}) => fitted(node('class', x, y, w, 0, txt, { f: '#ffffff', c: '#1c1c1c', fs: 14, ...o }));
    const person = C(170, 0, 220, T(['Person\n--\n- name: String\n- email: String\n--\n+ contact(): void', 'Persona\n--\n- nome: String\n- email: String\n--\n+ contatta(): void']), { f: '#e8eefc', c: '#4352d6' });
    const cust = C(0, 230, 220, T(['Customer\n--\n- code: String\n--\n+ orders(): List', 'Cliente\n--\n- codice: String\n--\n+ ordini(): List']));
    const emp = C(340, 230, 220, T(['Employee\n--\n- role: String\n--\n+ salary(): Money', 'Dipendente\n--\n- ruolo: String\n--\n+ stipendio(): Money']));
    const order = C(0, 460, 220, T(['Order\n--\n- date: Date\n- total: Money\n--\n+ pay(): void', 'Ordine\n--\n- data: Date\n- totale: Money\n--\n+ paga(): void']));
    const line = C(340, 460, 200, T(['OrderLine\n--\n- quantity: int\n--', 'RigaOrdine\n--\n- quantità: int\n--']));
    const prod = C(660, 460, 200, T(['Product\n--\n- name: String\n- price: Money\n--', 'Prodotto\n--\n- nome: String\n- prezzo: Money\n--']));
    const pay = C(-320, 460, 200, T(['«interface»\nPayable\n--\n--\n+ pay(): void', '«interface»\nPagabile\n--\n--\n+ paga(): void']), { f: '#f7f8fb' });
    const S = (n, p) => ({ n: n.id, p }), E = (a, b, o) => edge(a, b, { c: '#1c1c1c', fs: 13, ...o });
    return { items: [person, cust, emp, order, line, prod, pay,
      E(S(cust, 't'), S(person, 'b'), { r: 'elbow', ea: 'tri' }), E(S(emp, 't'), S(person, 'b'), { r: 'elbow', ea: 'tri' }),
      E(S(cust, 'b'), S(order, 't'), { r: 'straight', ea: 'open', text: T(['places  1 … *', 'fa  1 … *']) }),
      E(S(order, 'r'), S(line, 'l'), { r: 'straight', sa: 'diamond', ea: 'none', text: '1 … *' }),
      E(S(line, 'r'), S(prod, 'l'), { r: 'straight', ea: 'open', text: '1' }),
      E(S(order, 'l'), S(pay, 'r'), { r: 'straight', ea: 'tri', d: 'dash' })] };
  }],
  ['sequence', 'sequence', (it) => {
    const T = (x) => (it ? x[1] : x[0]), H = 400, st = { f: '#e8eefc', c: '#4352d6', fs: 15 };
    const ll = [T([':Browser', ':Browser']), ':Server', ':Database'].map((x, k) => node('lifeline', k * 240, 0, 130, H, x, st));
    const act = (k, a, b) => node('rect', k * 240 + 57, a * H, 16, (b - a) * H, '', { f: '#ffffff', c: '#4352d6', s: 1.5 });
    const a1 = act(1, .2, .78), a2 = act(2, .36, .5);
    const S = (n, p, o) => ({ n: n.id, p, o }), M = (a, b, text, o = {}) => edge(a, b, { r: 'straight', c: '#1c1c1c', fs: 13, text, ...o });
    const frame = node('frame', -30, .62 * H, 540, 84, T(['opt  [remember me]', 'opt  [ricordami]']), { f: '', c: '#5f6660', s: 1.5, fs: 13 });
    const o1 = (y) => (y * H - a1.y) / a1.h, o2 = (y) => (y * H - a2.y) / a2.h;
    return { items: [...ll, a1, a2, frame,
      M(S(ll[0], 'r', .24), S(a1, 'l', o1(.24)), T(['login(user, password)', 'accedi(utente, password)'])),
      M(S(a1, 'r', o1(.4)), S(a2, 'l', o2(.4)), T(['find user', 'cerca utente'])),
      M(S(a2, 'l', o2(.47)), S(a1, 'r', o1(.47)), T(['user', 'utente']), { ea: 'open', d: 'dash' }),
      M(S(a1, 'l', o1(.56)), S(ll[0], 'r', .56), 'token', { ea: 'open', d: 'dash' }),
      M(S(a1, 'l', o1(.74)), S(ll[0], 'r', .74), T(['set cookie', 'salva cookie']), { ea: 'open' })] };
  }],
  ['usecase', 'person-standing', (it) => {
    const T = (x) => (it ? x[1] : x[0]), U = (y, x) => node('ellipse', 130, y, 190, 70, x, { f: '#e8eefc', c: '#4352d6', fs: 15 });
    const sys = node('box', 80, 0, 290, 470, T(['Online shop', 'Negozio online']), { f: '#ffffff', c: '#1c1c1c', b: true });
    const cust = node('person', -110, 170, 50, 80, T(['Customer', 'Cliente']), { f: '#ffffff', c: '#1c1c1c' });
    const bank = node('person', 500, 280, 50, 80, T(['Payment service', 'Servizio di pagamento']), { f: '#ffffff', c: '#1c1c1c' });
    const browse = U(60, T(['Browse products', 'Sfoglia i prodotti'])), order = U(170, T(['Place an order', 'Fai un ordine'])), pay = U(290, T(['Pay', 'Paga'])), track = U(380, T(['Track the order', 'Segui l’ordine']));
    const A = (a, b) => edge(at(a), at(b), { r: 'straight', sa: 'none', ea: 'none', c: '#1c1c1c' });
    return { items: [sys, cust, bank, browse, order, pay, track, A(cust, browse), A(cust, order), A(cust, track), A(bank, pay),
      edge({ n: order.id, p: 'b' }, { n: pay.id, p: 't' }, { r: 'straight', ea: 'open', d: 'dash', text: '«include»', c: '#1c1c1c', fs: 13 })] };
  }],
  ['activity', 'activity', (it) => {
    const T = (x) => (it ? x[1] : x[0]), A = (x, y, txt) => node('round', x, y, 170, 56, txt, { f: '#e8eefc', c: '#4352d6', fs: 15 });
    const start = node('start', 85, 0, 30, 30, '', { f: '#ffffff', c: '#1c1c1c' });
    const recv = A(15, 70, T(['Receive the order', 'Ricevi l’ordine']));
    const ask = node('diamond', 70, 170, 60, 60, '', { f: '#fff3c4', c: '#b7791f' });
    const buy = A(230, 172, T(['Order from the supplier', 'Ordina al fornitore']));
    const pack = A(15, 270, T(['Pack it', 'Prepara il pacco']));
    const fork = node('rect', -80, 370, 360, 8, '', { f: '#1c1c1c', c: '', s: 0 });
    const ship = A(-93, 420, T(['Ship it', 'Spedisci'])), bill = A(123, 420, T(['Send the invoice', 'Manda la fattura']));
    const join = node('rect', -80, 520, 360, 8, '', { f: '#1c1c1c', c: '', s: 0 });
    const end = node('end', 83, 570, 34, 34, '', { f: '#ffffff', c: '#1c1c1c' });
    const S = (n, p) => ({ n: n.id, p }), F = (a, b, o = {}) => edge(a, b, { r: 'elbow', c: '#1c1c1c', fs: 13, ...o });
    return { items: [start, recv, ask, buy, pack, fork, ship, bill, join, end,
      F(S(start, 'b'), S(recv, 't')), F(S(recv, 'b'), S(ask, 't')), F(S(ask, 'b'), S(pack, 't'), { text: T(['[in stock]', '[disponibile]']) }), F(S(ask, 'r'), S(buy, 'l'), { text: T(['[missing]', '[manca]']) }),
      F(S(buy, 'b'), S(pack, 'r')), F(S(pack, 'b'), S(fork, 't')), F({ n: fork.id, p: 'b', o: .2 }, S(ship, 't')), F({ n: fork.id, p: 'b', o: .8 }, S(bill, 't')),
      F(S(ship, 'b'), { n: join.id, p: 't', o: .2 }), F(S(bill, 'b'), { n: join.id, p: 't', o: .8 }), F(S(join, 'b'), S(end, 't'))] };
  }],
  ['state', 'state', (it) => {
    const T = (x) => (it ? x[1] : x[0]), St = (x, y, txt) => node('round', x, y, 150, 60, txt, { f: '#efe3fb', c: '#5b4cf0', fs: 15 });
    const start = node('start', 60, 15, 30, 30, '', { f: '#ffffff', c: '#1c1c1c' });
    const idle = St(150, 0, T(['Idle', 'In attesa'])), run = St(420, 0, T(['Running', 'In corso'])), pause = St(420, 190, T(['Paused', 'In pausa'])), done = St(150, 190, T(['Finished', 'Finito']));
    const end = node('end', 58, 203, 34, 34, '', { f: '#ffffff', c: '#1c1c1c' });
    const S = (n, p) => ({ n: n.id, p }), E = (a, b, text, o = {}) => edge(a, b, { r: 'curve', c: '#1c1c1c', fs: 13, text, ...o });
    return { items: [start, idle, run, pause, done, end, E(S(start, 'r'), S(idle, 'l'), '', { r: 'straight' }),
      E(S(idle, 'r'), S(run, 'l'), 'start', { r: 'straight' }), E({ n: run.id, p: 'b', o: .3 }, { n: pause.id, p: 't', o: .3 }, 'pause'), E({ n: pause.id, p: 't', o: .7 }, { n: run.id, p: 'b', o: .7 }, T(['resume', 'riprendi'])),
      E({ n: run.id, p: 'l', o: .8 }, { n: done.id, p: 't', o: .8 }, T(['end', 'fine']), { r: 'straight' }), E(S(pause, 'l'), S(done, 'r'), 'stop', { r: 'straight' }), E(S(done, 'l'), S(end, 'r'), '', { r: 'straight' })] };
  }],
  ['component', 'component', (it) => {
    const T = (x) => (it ? x[1] : x[0]), C = (x, y, txt) => node('comp', x, y, 170, 76, txt, { f: '#e8eefc', c: '#4352d6', fs: 15 });
    const srv = node('cube', 230, -40, 420, 330, T(['«device»\nCloud server', '«device»\nServer cloud']), { f: '#f7f8fb', c: '#1c1c1c', va: 'top', fs: 14 });
    const web = C(-110, 120, T(['Web app', 'App web'])), api = C(270, 60, 'API'), auth = C(270, 180, T(['Accounts', 'Account'])), store = node('cyl', 500, 90, 100, 110, 'Database', { f: '#dcefe6', c: '#0f6e56', fs: 15 });
    const ball = node('ellipse', 150, 147, 22, 22, '', { f: '#ffffff', c: '#1c1c1c' });
    const S = (n, p) => ({ n: n.id, p }), D = (a, b, o = {}) => edge(a, b, { r: 'elbow', c: '#1c1c1c', ea: 'open', d: 'dash', fs: 13, ...o });
    return { items: [srv, web, api, auth, store, ball, edge(S(web, 'r'), S(ball, 'l'), { r: 'straight', sa: 'none', ea: 'none', c: '#1c1c1c' }), D(S(ball, 'r'), S(api, 'l'), { text: 'REST' }), D(S(api, 'b'), S(auth, 't')), D(S(api, 'r'), S(store, 'l')), D(S(auth, 'r'), S(store, 'l'))] };
  }],
  ['database', 'database', (it) => {
    const T = (x) => (it ? x[1] : x[0]), E = (x, y, txt) => fitted(node('entity', x, y, 210, 0, txt, { f: '#ffffff', c: '#1d4e89', fs: 14 }));
    const users = E(0, 0, T(['users\nPK id\nname\nemail', 'utenti\nPK id\nnome\nemail']));
    const orders = E(320, 0, T(['orders\nPK id\nFK user_id\ndate\ntotal', 'ordini\nPK id\nFK utente_id\ndata\ntotale']));
    const lines = E(640, 0, T(['order_lines\nPK id\nFK order_id\nFK product_id\nquantity', 'righe_ordine\nPK id\nFK ordine_id\nFK prodotto_id\nquantità']));
    const prod = E(640, 240, T(['products\nPK id\nname\nprice', 'prodotti\nPK id\nnome\nprezzo']));
    const R = (a, b, ea = 'ern') => edge({ n: a.id, p: '' }, { n: b.id, p: '' }, { r: 'elbow', sa: 'er1', ea, c: '#1d4e89' });
    return { items: [users, orders, lines, prod, R(users, orders, 'er0n'), R(orders, lines), R(prod, lines, 'er0n')] };
  }],
  ['bpmn', 'bpmn', (it) => {
    const T = (x) => (it ? x[1] : x[0]), K = (x, y, txt) => node('round', x, y, 140, 70, txt, { f: '#ffffff', c: '#1c1c1c', fs: 14 });
    const pool = node('lane', 0, 0, 980, 340, T(['Shop', 'Negozio']), { f: '#ffffff', c: '#1c1c1c', b: true });
    const l1 = node('lane', 36, 0, 944, 170, T(['Sales', 'Vendite']), { f: '#ffffff', c: '#5f6660', fs: 14 }), l2 = node('lane', 36, 170, 944, 170, T(['Warehouse', 'Magazzino']), { f: '#ffffff', c: '#5f6660', fs: 14 });
    const s = node('bstart', 100, 65, 40, 40, T(['Order in', 'Ordine arrivato']), { f: '#dcefe6', c: '#0f6e56', fs: 12 });
    const recv = K(190, 50, T(['Check the order', 'Controlla l’ordine'])), gw = node('gwx', 390, 59, 52, 52, '', { f: '#fff3c4', c: '#b7791f', fs: 12 }), ask = node('text', 356, 24, 120, 28, T(['In stock?', 'Disponibile?']), { fs: 12, f: '', c: '', s: 0 });
    const tell = K(510, 50, T(['Tell the customer', 'Avvisa il cliente'])), e1 = node('bend', 720, 65, 40, 40, T(['Cancelled', 'Annullato']), { f: '#fbdada', c: '#b3261e', fs: 12 });
    const pack = K(510, 220, T(['Pack the goods', 'Prepara la merce'])), ship = K(700, 220, T(['Ship', 'Spedisci'])), e2 = node('bend', 890, 235, 40, 40, T(['Shipped', 'Spedito']), { f: '#fbdada', c: '#b3261e', fs: 12 });
    const S = (n, p) => ({ n: n.id, p }), F = (a, b, o = {}) => edge(a, b, { r: 'elbow', c: '#1c1c1c', fs: 12, ...o });
    return { items: [pool, l1, l2, s, recv, gw, ask, tell, e1, pack, ship, e2, F(S(s, 'r'), S(recv, 'l')), F(S(recv, 'r'), S(gw, 'l')), F(S(gw, 'r'), S(tell, 'l'), { text: 'no' }),
      F(S(tell, 'r'), S(e1, 'l')), F(S(gw, 'b'), S(pack, 'l'), { text: T(['yes', 'sì']) }), F(S(pack, 'r'), S(ship, 'l')), F(S(ship, 'r'), S(e2, 'l'))] };
  }],
  ['swimlane', 'swimlane', (it) => {
    const T = (x) => (it ? x[1] : x[0]), lanes = T([['Customer', 'Sales', 'Warehouse'], ['Cliente', 'Vendite', 'Magazzino']]);
    const L = lanes.map((x, k) => node('lane', 0, k * 140, 900, 140, x, { f: k % 2 ? '#f7f8fb' : '#ffffff', c: '#5f6660', b: true }));
    const P = (x, k, txt, o = {}) => node('round', x, k * 140 + 38, 140, 64, txt, { f: '#e8eefc', c: '#4352d6', fs: 14, ...o });
    const a = P(80, 0, T(['Ask for a quote', 'Chiede un preventivo'])), b = P(260, 1, T(['Prepare the quote', 'Prepara il preventivo'])), c = node('diamond', 460, 34, 120, 72, T(['Accepted?', 'Accettato?']), { f: '#fff3c4', c: '#b7791f', fs: 14 });
    const d = P(630, 1, T(['Confirm the order', 'Conferma l’ordine'])), e = P(630, 2, T(['Ship the goods', 'Spedisce la merce'])), f = P(740, 0, T(['Receives the goods', 'Riceve la merce']), { f: '#dcefe6', c: '#0f6e56' });
    const S = (n, p) => ({ n: n.id, p }), F = (x, y, o = {}) => edge(x, y, { r: 'elbow', c: '#3a3f47', fs: 12, ...o });
    return { items: [...L, a, b, c, d, e, f, F(S(a, 'r'), S(b, 't')), F(S(b, 'r'), S(c, 'b')), F(S(c, 'r'), S(d, 't'), { text: T(['yes', 'sì']) }), F(S(c, 'l'), S(a, 't'), { text: 'no' }), F(S(d, 'b'), S(e, 't')), F(S(e, 'r'), S(f, 'b'))] };
  }],
  ['ptimeline', 'gantt', (it) => {
    const T = (x) => (it ? x[1] : x[0]), months = T([['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu']]);
    const X = 130, W = 780, cw = W / months.length, H = 100;
    const axis = node('axis', X, -50, W, 44, months.join('\n'), { f: '', c: '#5f6660', fs: 13 });
    const tones = [['#e8eefc', '#4352d6'], ['#dcefe6', '#0f6e56'], ['#ffe1cc', '#c45a0c']];
    const names = T([['Design', 'Development', 'Marketing'], ['Progettazione', 'Sviluppo', 'Marketing']]);
    const tracks = names.map((x, k) => node('track', 0, k * H, X + W, H, x, { f: k % 2 ? '#ffffff' : '#f7f8fb', c: tones[k][1], b: true, fs: 15 }));
    const span = (k, from, to, txt, top = 0) => node('round', X + from * cw + 6, k * H + 18 + top, (to - from) * cw - 12, 34, txt, { f: tones[k][0], c: tones[k][1], fs: 14, al: 'left' });
    const mile = (k, at, txt) => node('mile', X + at * cw - 13, k * H + 22, 26, 26, txt, { f: tones[k][1], c: tones[k][1], fs: 12 });
    const s1 = span(0, 0, 2, T(['Research', 'Ricerca'])), s2 = span(0, 1.5, 3, T(['Prototype', 'Prototipo']), 40);
    const s3 = span(1, 2.5, 5, T(['Build the app', 'Sviluppo dell’app'])), m1 = mile(1, 5.5, T(['Release', 'Rilascio']));
    const s4 = span(2, 3.5, 5.5, T(['Campaign', 'Campagna'])), m2 = mile(2, 3, T(['Website', 'Sito web']));
    const S = (n, p) => ({ n: n.id, p });
    return { items: [axis, ...tracks, s1, s2, s3, s4, m1, m2, edge(S(s2, 'r'), S(s3, 't'), { r: 'elbow', ea: 'arrow', d: 'dash', c: '#5f6660' }), edge(S(s3, 'r'), S(m1, 'l'), { r: 'straight', ea: 'arrow', d: 'dash', c: '#5f6660' })] };
  }],
  ['process', 'arrow-right', (it) => {
    const names = it ? ['Idea', 'Progetto', 'Sviluppo', 'Prova', 'Rilascio'] : ['Idea', 'Design', 'Build', 'Test', 'Release'];
    const tones = ['#e8eefc', '#dcefe6', '#fff3c4', '#ffe1cc', '#efe3fb'];
    const nodes = names.map((x, k) => node('round', k * 200, 0, 150, 70, x, { f: tones[k], c: '#3a3f47', b: true }));
    return { items: [...nodes, ...nodes.slice(1).map((n, k) => edge(at(nodes[k]), at(n), { r: 'straight', c: '#3a3f47' }))] };
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
  ['swot', 'grid-2x2', (it) => {
    const box = (x, y, f, c, head, lines) => node('round', x, y, 300, 210, head + '\n\n' + lines.map((l) => '• ' + l).join('\n'), { f, c, al: 'left', va: 'top', fs: 15 });
    const L = it ? [['Punti di forza', ['Squadra esperta', 'Prodotto apprezzato', 'Costi bassi']], ['Debolezze', ['Poca visibilità', 'Pochi canali di vendita']], ['Opportunità', ['Mercato in crescita', 'Nuovi partner', 'Bandi pubblici']], ['Minacce', ['Concorrenti grandi', 'Prezzi in aumento']]]
      : [['Strengths', ['Skilled team', 'Well-liked product', 'Low costs']], ['Weaknesses', ['Little visibility', 'Few sales channels']], ['Opportunities', ['Growing market', 'New partners', 'Public grants']], ['Threats', ['Big competitors', 'Rising prices']]];
    const tone = [['#dcefe6', '#0f6e56'], ['#ffe1cc', '#c45a0c'], ['#e8eefc', '#4352d6'], ['#fbdada', '#b3261e']];
    const title = node('text', 0, -70, 620, 50, it ? 'Analisi SWOT' : 'SWOT analysis', { fs: 26, b: true });
    return { items: [title, ...L.map(([h, l], k) => box((k % 2) * 320, Math.floor(k / 2) * 230, tone[k][0], tone[k][1], h, l))] };
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
