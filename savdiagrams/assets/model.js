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
  'card', 'track', 'axis', 'mile', 'entity', 'subproc', 'bstart', 'binter', 'bend', 'gwx', 'gwp', 'gwo', 'lane', 'vlane',
  // business canvases, journeys and story maps, wireframes
  'panel', 'chevron', 'smile', 'meh', 'frown', 'divider', 'browser', 'mobile', 'imgph', 'check', 'toggle', 'lorem', 'select',
  // DFD, C4, cloud architecture
  'store', 'c4person', 'func', 'queue', 'bucket', 'cdn', 'lb', 'apigw',
  // electric and electronic symbols, floor plans
  'res', 'cap', 'ind', 'bat', 'eswitch', 'lamp', 'diode', 'led', 'gnd', 'door', 'window', 'bed', 'sofa', 'dtable', 'stairs'];
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
  gwx: [52, 52], gwp: [52, 52], gwo: [52, 52], lane: [640, 160], vlane: [200, 420],
  panel: [200, 150], chevron: [170, 56], smile: [40, 40], meh: [40, 40], frown: [40, 40], divider: [600, 30], browser: [640, 420], mobile: [220, 420], imgph: [200, 130],
  check: [160, 24], toggle: [160, 26], lorem: [240, 50], select: [200, 36], store: [180, 50], c4person: [170, 170], func: [56, 56], queue: [84, 40], bucket: [56, 60],
  cdn: [56, 56], lb: [56, 56], apigw: [60, 56], res: [80, 28], cap: [60, 40], ind: [80, 28], bat: [60, 44], eswitch: [80, 36], lamp: [60, 40], diode: [60, 36], led: [60, 48],
  gnd: [40, 40], door: [80, 80], window: [120, 12], bed: [160, 200], sofa: [200, 80], dtable: [140, 140], stairs: [100, 220] };

// ------------------------------------------------------------------ kinds that behave on their own

/** The text goes under the shape (icons, events, gateways), as for a person. */
export const UNDER = new Set(['person', 'router', 'switch', 'server', 'firewall', 'pc', 'laptop', 'phone', 'printer', 'ap', 'start', 'end', 'mile', 'bstart', 'binter', 'bend', 'gwx', 'gwp', 'gwo',
  'smile', 'meh', 'frown', 'func', 'queue', 'bucket', 'cdn', 'lb', 'apigw', 'res', 'cap', 'ind', 'bat', 'eswitch', 'lamp', 'diode', 'led', 'gnd']);
/** Containers: what lies inside them moves with them, and a new one goes behind what it covers. */
export const CONTAINERS = new Set(['lane', 'vlane', 'track', 'box', 'frame', 'package', 'cube', 'lifeline', 'browser', 'mobile']);
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
  ['business', [['bm_block', 'panel', 210, 180, { f: '#ffffff', c: '#4352d6', fs: 15, al: 'left' }, ['Key partners\n• Suppliers\n• Allies', 'Partner chiave\n• Fornitori\n• Alleati']],
    ['sticky', 'note', 140, 110, { f: '#fff3c4', c: '#b7791f', fs: 14, al: 'left', va: 'top' }, ['Idea', 'Idea']], ['bm_title', 'text', 400, 44, { fs: 24, b: true, al: 'left', f: '', c: '', s: 0 }, ['Business Model Canvas', 'Business Model Canvas']]]],
  ['journey', [['stage', 'chevron', 180, 56, { f: '#4352d6', c: '#2f38a3', tc: '#ffffff', b: true, fs: 15 }, ['Stage', 'Fase']], ['jrow', 'track', 1090, 130, { f: '#ffffff', c: '#4352d6', b: true, fs: 14 }, ['Actions', 'Azioni']],
    ['jcell', 'panel', 170, 106, { f: '#ffffff', c: '#4352d6', fs: 14, al: 'left' }, ['Action\nWhat the person does', 'Azione\nCosa fa la persona']], ['touch', 'round', 170, 40, { f: '#dcefe6', c: '#0f6e56', fs: 14 }, ['Touchpoint', 'Punto di contatto']],
    ['smile', 'smile', 36, 36, { f: '#dcefe6', c: '#0f6e56', fs: 12 }], ['meh', 'meh', 36, 36, { f: '#fff3c4', c: '#b7791f', fs: 12 }], ['frown', 'frown', 36, 36, { f: '#fbdada', c: '#b3261e', fs: 12 }],
    ['sticky', 'note'], ['moodline', null, { r: 'curve', sa: 'none', ea: 'none', d: 'dash', c: '#9aa29d' }]]],
  ['storymap', [['sm_act', 'round', 340, 56, { f: '#4352d6', c: '#2f38a3', tc: '#ffffff', b: true, fs: 15 }, ['Activity', 'Attività']], ['sm_step', 'rect', 160, 50, { f: '#e8eefc', c: '#4352d6', fs: 14 }, ['Step', 'Passo']],
    ['story', 'note', 160, 84, { f: '#fff3c4', c: '#b7791f', fs: 13, al: 'left', va: 'top' }, ['As a user I want…', 'Come utente voglio…']], ['release', 'divider', 1060, 30, { c: '#c45a0c', tc: '#c45a0c', fs: 13, b: true }, ['Release 1', 'Rilascio 1']]]],
  ['wireframe', [['browser', 'browser', 640, 420, { f: '#ffffff', c: '#9aa29d', s: 1.5, fs: 12, tc: '#5f6660' }, ['www.example.com', 'www.example.com']], ['mobile', 'mobile', 240, 480, { f: '#ffffff', c: '#3a3f47', s: 2 }],
    ['w_nav', 'rect', 600, 44, { f: '#3a3f47', c: '', s: 0, tc: '#ffffff', fs: 13, al: 'left' }, ['LOGO      Home      About      Contact', 'LOGO      Home      Chi siamo      Contatti']],
    ['w_title', 'text', 300, 40, { fs: 24, b: true, al: 'left', f: '', c: '', s: 0 }, ['Heading', 'Titolo']], ['lorem', 'lorem', 240, 50, { c: '#5f6660' }], ['imgph', 'imgph', 200, 130, { f: '#f7f8fb', c: '#9aa29d', s: 1.5 }],
    ['w_button', 'round', 140, 42, { f: '#4352d6', c: '', s: 0, tc: '#ffffff', fs: 15, b: true }, ['Button', 'Pulsante']], ['w_input', 'rect', 240, 38, { f: '#ffffff', c: '#9aa29d', s: 1.5, tc: '#9aa29d', fs: 14, al: 'left' }, ['Placeholder…', 'Segnaposto…']],
    ['select', 'select', 200, 38, { f: '#ffffff', c: '#9aa29d', s: 1.5, fs: 14, tc: '#5f6660', al: 'left' }, ['Choose…', 'Scegli…']], ['check', 'check', 160, 24, { f: '#ffffff', c: '#4352d6', fs: 14, tc: '#5f6660' }, ['Option', 'Opzione']],
    ['toggle', 'toggle', 160, 26, { f: '#ffffff', c: '#4352d6', fs: 14, tc: '#5f6660' }, ['Setting', 'Impostazione']], ['w_avatar', 'ellipse', 48, 48, { f: '#e4e7e5', c: '#9aa29d', s: 1.5 }],
    ['w_card', 'round', 240, 160, { f: '#ffffff', c: '#cfd5df', s: 1.5, al: 'left', va: 'top', fs: 15, b: true }, ['Card', 'Scheda']]]],
  ['dfd', [['dfd_proc', 'ellipse', 160, 100, { f: '#e8eefc', c: '#4352d6', fs: 15 }, ['1.0\nProcess', '1.0\nProcesso']], ['dfd_ext', 'rect', 150, 70, { f: '#f7f8fb', c: '#1c1c1c', fs: 15, b: true }, ['External entity', 'Entità esterna']],
    ['store', 'store', 200, 50, { f: '#fff3c4', c: '#b7791f', fs: 15 }, ['D1 Data store', 'D1 Archivio dati']], ['dfd_flow', null, { r: 'curve', sa: 'none', ea: 'arrow', c: '#3a3f47' }]]],
  ['c4', [['c4person', 'c4person', 190, 180, { f: '#08427b', c: '#073b6f', tc: '#ffffff', fs: 14 }, ['Person\n[Person]\nWho uses the system', 'Persona\n[Persona]\nChi usa il sistema']],
    ['c4sys', 'round', 250, 140, { f: '#1168bd', c: '#0b4884', tc: '#ffffff', fs: 14 }, ['Software system\n[Software system]\nWhat it does', 'Sistema software\n[Sistema software]\nCosa fa']],
    ['c4ext', 'round', 250, 140, { f: '#8a8a8a', c: '#6b6b6b', tc: '#ffffff', fs: 14 }, ['External system\n[External system]\nWhat it does', 'Sistema esterno\n[Sistema esterno]\nCosa fa']],
    ['c4cont', 'round', 230, 130, { f: '#438dd5', c: '#3c7fc0', tc: '#ffffff', fs: 14 }, ['Container\n[Container: technology]\nWhat it does', 'Container\n[Container: tecnologia]\nCosa fa']],
    ['c4db', 'cyl', 200, 130, { f: '#438dd5', c: '#3c7fc0', tc: '#ffffff', fs: 14 }, ['Database\n[Container: SQL]', 'Database\n[Container: SQL]']],
    ['c4comp', 'round', 220, 110, { f: '#85bbf0', c: '#78a8d8', tc: '#1c1c1c', fs: 14 }, ['Component\n[Component: technology]', 'Componente\n[Componente: tecnologia]']],
    ['c4bound', 'box', 560, 360, { f: '', c: '#444444', d: 'dash', s: 1.5, al: 'left', fs: 14, b: true }, ['System boundary', 'Confine del sistema']], ['c4rel', null, { r: 'straight', sa: 'none', ea: 'arrow', d: 'dash', c: '#707070', s: 1.5 }]]],
  ['cloud', [['person', 'person'], ['internet', 'cloud'], ['cdn', 'cdn', 56, 56, { f: '#efe3fb', c: '#5b4cf0', fs: 13 }, ['CDN', 'CDN']], ['lb', 'lb', 56, 56, { f: '#efe3fb', c: '#5b4cf0', fs: 13 }, ['Load balancer', 'Bilanciatore']],
    ['apigw', 'apigw', 60, 56, { f: '#efe3fb', c: '#5b4cf0', fs: 13 }, ['API gateway', 'API gateway']], ['vm', 'server', 52, 72, { f: '#efe3fb', c: '#5b4cf0', fs: 13 }, ['Server', 'Server']],
    ['func', 'func', 56, 56, { f: '#efe3fb', c: '#5b4cf0', fs: 13 }, ['Function', 'Funzione']], ['queue', 'queue', 84, 40, { f: '#efe3fb', c: '#5b4cf0', fs: 13 }, ['Queue', 'Coda']],
    ['bucket', 'bucket', 56, 60, { f: '#efe3fb', c: '#5b4cf0', fs: 13 }, ['Storage', 'Archivio file']], ['netdb', 'cyl'],
    ['vpc', 'box', 420, 300, { f: '#f7f8fb', c: '#5b4cf0', d: 'dash', s: 1.5, al: 'left', fs: 14, b: true }, ['Private network', 'Rete privata']], ['region', 'box', 560, 380, { f: '', c: '#0f6e56', d: 'dash', s: 1.5, al: 'left', fs: 14, b: true }, ['Region', 'Regione']],
    ['flow', null]]],
  ['electric', [['res', 'res', 80, 28, { f: '#ffffff', c: '#1c1c1c', fs: 13 }], ['cap', 'cap', 60, 40, { f: '#ffffff', c: '#1c1c1c', fs: 13 }], ['ind', 'ind', 80, 28, { f: '#ffffff', c: '#1c1c1c', fs: 13 }],
    ['bat', 'bat', 60, 44, { f: '#ffffff', c: '#1c1c1c', fs: 13 }], ['eswitch', 'eswitch', 80, 36, { f: '#ffffff', c: '#1c1c1c', fs: 13 }], ['lamp', 'lamp', 60, 40, { f: '#ffffff', c: '#1c1c1c', fs: 13 }],
    ['diode', 'diode', 60, 36, { f: '#ffffff', c: '#1c1c1c', fs: 13 }], ['led', 'led', 60, 48, { f: '#ffffff', c: '#b3261e', fs: 13 }], ['gnd', 'gnd', 40, 40, { f: '#ffffff', c: '#1c1c1c', fs: 13 }],
    ['junction', 'start', 10, 10, { c: '#1c1c1c' }], ['wire', null, { r: 'elbow', sa: 'none', ea: 'none', c: '#1c1c1c', s: 2 }]]],
  ['floor', [['room', 'box', 300, 240, { f: '#fbf8f1', c: '#3a3f47', s: 4, fs: 14, b: true }, ['Room', 'Stanza']], ['wall', 'rect', 240, 12, { f: '#3a3f47', c: '', s: 0 }],
    ['door', 'door', 80, 80, { f: '#fbf8f1', c: '#3a3f47', s: 2 }], ['window', 'window', 120, 12, { f: '#eef3f8', c: '#3a3f47', s: 1.5 }], ['bed', 'bed', 160, 200, { f: '#ffffff', c: '#5f6660', s: 1.5 }],
    ['sofa', 'sofa', 200, 80, { f: '#ffffff', c: '#5f6660', s: 1.5 }], ['dtable', 'dtable', 140, 140, { f: '#ffffff', c: '#5f6660', s: 1.5 }], ['stairs', 'stairs', 100, 220, { f: '#ffffff', c: '#5f6660', s: 1.5 }],
    ['f_table', 'rect', 120, 70, { f: '#ffffff', c: '#5f6660', s: 1.5, fs: 12 }, ['Table', 'Tavolo']]]],
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
/** A canvas (Business Model, Lean): blocks on a grid of 5 columns, [name, lines, column, row, columns, rows], names in [en, it]. */
function canvasTpl(it, title, blocks) {
  const W = 210, H = 190, tones = ['#4352d6', '#0f6e56', '#c45a0c', '#a1328c', '#b7791f', '#1d4e89', '#5b4cf0', '#3a3f47', '#b3261e'];
  const items = [node('text', 0, -60, W * 5, 44, title, { fs: 24, b: true, al: 'left', f: '', c: '', s: 0 })];
  blocks.forEach(([name, list, c, r, cs, rs], k) => items.push(node('panel', c * W, r * H, cs * W - 8, rs * H - 8, (it ? name[1] : name[0]) + '\n' + list.map((x) => '• ' + (it ? x[1] : x[0])).join('\n'), { f: '#ffffff', c: tones[k % tones.length], fs: 15, al: 'left' })));
  return { items };
}
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
    const lan = node('box', 0, 456, 820, 264, 'LAN', { f: '#f7f8fb', c: '#9aa29d', d: 'dash', s: 1.5, fs: 14, b: true, al: 'left' });
    const dmz = node('box', 560, 196, 300, 190, 'DMZ', { f: '#fbf8f1', c: '#9aa29d', d: 'dash', s: 1.5, fs: 14, b: true, al: 'left' });
    const net = node('cloud', 300, -20, 170, 100, 'Internet', { f: '#eef3f8', c: '#1d4e89' });
    const fw = node('firewall', 347, 150, 76, 60, 'Firewall', { f: '#fbdada', c: '#b3261e', fs: 13 });
    const rt = node('router', 353, 260, 64, 64, 'Router', N);
    const sw = node('switch', 343, 370, 84, 48, 'Switch', N);
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
  ['cloud', 'cloud-arch', (it) => {
    const T = (x) => (it ? x[1] : x[0]), C = { f: '#efe3fb', c: '#5b4cf0', fs: 13 };
    const vpc = node('box', 220, 20, 620, 420, T(['Private network', 'Rete privata']), { f: '#f7f8fb', c: '#5b4cf0', d: 'dash', s: 1.5, fs: 14, b: true, al: 'left' });
    const users = node('person', 0, 186, 50, 80, T(['Users', 'Utenti']), { f: '#ffffff', c: '#1c1c1c', fs: 13 });
    const cdn = node('cdn', 100, 198, 56, 56, 'CDN', C), lb = node('lb', 260, 198, 56, 56, T(['Load balancer', 'Bilanciatore']), C);
    const s1 = node('server', 420, 80, 52, 72, 'App 1', C), s2 = node('server', 420, 300, 52, 72, 'App 2', C);
    const db = node('cyl', 600, 76, 70, 80, 'Database', { f: '#dcefe6', c: '#0f6e56', fs: 13 });
    const q = node('queue', 570, 316, 84, 40, T(['Queue', 'Coda']), C), fn = node('func', 740, 308, 56, 56, T(['Function', 'Funzione']), C);
    const bk = node('bucket', 740, 120, 56, 60, T(['Storage', 'Archivio file']), C);
    const S = (n, p) => ({ n: n.id, p }), F = (a, b, o = {}) => edge(a, b, { r: 'elbow', c: '#3a3f47', ...o });
    return { items: [vpc, users, cdn, lb, s1, s2, db, q, fn, bk, F(S(users, 'r'), S(cdn, 'l')), F(S(cdn, 'r'), S(lb, 'l')), F(S(lb, 'r'), S(s1, 'l')), F(S(lb, 'r'), S(s2, 'l')),
      F(S(s1, 'r'), S(db, 'l')), F(S(s2, 'r'), S(q, 'l')), F(S(q, 'r'), S(fn, 'l')), F(S(fn, 't'), S(bk, 'b'))] };
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
  ['c4', 'c4', (it) => {
    const T = (x) => (it ? x[1] : x[0]);
    const title = node('text', -20, -70, 620, 40, T(['System context: the online shop', 'Contesto del sistema: il negozio online']), { fs: 20, b: true, al: 'left', f: '', c: '', s: 0 });
    const per = node('c4person', 30, 0, 190, 180, T(['Customer\n[Person]\nBuys products online', 'Cliente\n[Persona]\nCompra prodotti online']), { f: '#08427b', c: '#073b6f', tc: '#ffffff', fs: 14 });
    const sys = node('round', 0, 300, 250, 140, T(['Online shop\n[Software system]\nLets customers browse and buy', 'Negozio online\n[Sistema software]\nPermette di sfogliare e comprare']), { f: '#1168bd', c: '#0b4884', tc: '#ffffff', fs: 14 });
    const pay = node('round', 520, 300, 250, 140, T(['Payment provider\n[External system]\nCharges the cards', 'Servizio di pagamento\n[Sistema esterno]\nAddebita le carte']), { f: '#8a8a8a', c: '#6b6b6b', tc: '#ffffff', fs: 14 });
    const mail = node('round', 520, 20, 250, 140, T(['E-mail system\n[External system]\nSends the messages', 'Sistema di posta\n[Sistema esterno]\nInvia i messaggi']), { f: '#8a8a8a', c: '#6b6b6b', tc: '#ffffff', fs: 14 });
    const S = (n, p) => ({ n: n.id, p }), Rl = (a, b, text) => edge(a, b, { r: 'straight', c: '#707070', d: 'dash', s: 1.5, fs: 13, text, tc: '#3a3f47' });
    return { items: [title, per, sys, pay, mail, Rl(S(per, 'b'), S(sys, 't'), T(['Browses and buys using', 'Sfoglia e compra con'])), Rl(S(sys, 'r'), S(pay, 'l'), T(['Charges payments using', 'Addebita i pagamenti con'])),
      Rl(S(sys, ''), S(mail, ''), T(['Sends e-mails using', 'Invia e-mail con'])), Rl(S(mail, 'l'), S(per, 'r'), T(['Sends e-mails to', 'Invia e-mail a']))] };
  }],
  ['dfd', 'dfd', (it) => {
    const T = (x) => (it ? x[1] : x[0]);
    const cust = node('rect', 0, 110, 150, 70, T(['Customer', 'Cliente']), { f: '#f7f8fb', c: '#1c1c1c', fs: 15, b: true });
    const p1 = node('ellipse', 260, 90, 170, 110, T(['1.0\nTake the order', '1.0\nRicevi l’ordine']), { f: '#e8eefc', c: '#4352d6', fs: 15 });
    const d1 = node('store', 250, 300, 200, 50, T(['D1 Orders', 'D1 Ordini']), { f: '#fff3c4', c: '#b7791f', fs: 15 });
    const p2 = node('ellipse', 600, 270, 170, 110, T(['2.0\nPrepare the shipment', '2.0\nPrepara la spedizione']), { f: '#e8eefc', c: '#4352d6', fs: 15 });
    const wh = node('rect', 820, 110, 150, 70, T(['Warehouse', 'Magazzino']), { f: '#f7f8fb', c: '#1c1c1c', fs: 15, b: true });
    const S = (n, p) => ({ n: n.id, p }), F = (a, b, text, o = {}) => edge(a, b, { r: 'curve', c: '#3a3f47', fs: 13, text, ...o });
    return { items: [cust, p1, d1, p2, wh, F(S(cust, 'r'), S(p1, 'l'), T(['order', 'ordine'])), F(S(p1, 'b'), S(d1, 't'), T(['order details', 'dati dell’ordine'])),
      F(S(d1, 'r'), S(p2, 'l'), T(['orders to ship', 'ordini da spedire'])), F(S(p2, 't'), S(wh, 'b'), T(['pick list', 'lista di prelievo'])), F(S(p1, 't'), S(cust, 't'), T(['confirmation', 'conferma']))] };
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
  ['journey', 'journey', (it) => {
    const T = (x) => (it ? x[1] : x[0]), X = 140, CW = 190;
    const stages = T([['Discover', 'Consider', 'Buy', 'Use', 'Recommend'], ['Scoperta', 'Valutazione', 'Acquisto', 'Uso', 'Consiglio']]);
    const rows = T([['Actions', 'Touchpoints', 'Feelings', 'Opportunities'], ['Azioni', 'Punti di contatto', 'Emozioni', 'Opportunità']]), H = [130, 76, 130, 130];
    const items = [], tones = [['#ffffff', '#4352d6'], ['#f7f8fb', '#0f6e56'], ['#ffffff', '#c45a0c'], ['#f7f8fb', '#a1328c']];
    let y = 76;
    const top = [];
    rows.forEach((r, k) => { items.push(node('track', 0, y, X + CW * stages.length, H[k], r, { f: tones[k][0], c: tones[k][1], b: true, fs: 14 })); top.push(y); y += H[k]; });
    stages.forEach((s, j) => items.push(node('chevron', X + CW * j + 4, 0, CW - 8, 56, s, { f: '#4352d6', c: '#2f38a3', tc: '#ffffff', b: true, fs: 15 })));
    const acts = T([[['Sees an ad', 'Asks friends'], ['Compares prices', 'Reads reviews'], ['Signs up', 'Pays by card'], ['Gets the order', 'Cooks it'], ['Writes a review', 'Shares a code']], [['Vede una pubblicità', 'Chiede agli amici'], ['Confronta i prezzi', 'Legge le recensioni'], ['Si iscrive', 'Paga con la carta'], ['Riceve l’ordine', 'Lo cucina'], ['Scrive una recensione', 'Condivide un codice']]]);
    acts.forEach(([a, b], j) => items.push(node('panel', X + CW * j + 10, top[0] + 12, CW - 20, H[0] - 24, a + '\n' + b, { f: '#ffffff', c: '#4352d6', fs: 14, al: 'left' })));
    T([['Social media', 'Website', 'App', 'Delivery', 'E-mail'], ['Social', 'Sito web', 'App', 'Consegna', 'E-mail']]).forEach((p, j) => items.push(node('round', X + CW * j + 10, top[1] + 18, CW - 20, 40, p, { f: '#dcefe6', c: '#0f6e56', fs: 14 })));
    const moods = [['meh', .5, T(['Curious', 'Curioso'])], ['frown', .78, T(['Confused', 'Confuso'])], ['smile', .3, T(['Relieved', 'Sollevato'])], ['smile', .12, T(['Happy', 'Contento'])], ['meh', .45, T(['Neutral', 'Neutro'])]];
    const tone = { smile: ['#dcefe6', '#0f6e56'], meh: ['#fff3c4', '#b7791f'], frown: ['#fbdada', '#b3261e'] };
    const faces = moods.map(([k, f, l], j) => node(k, X + CW * j + CW / 2 - 18, top[2] + 8 + f * (H[2] - 60), 36, 36, l, { f: tone[k][0], c: tone[k][1], fs: 12 }));
    items.push(...faces);
    T([['Clearer ads', 'Show prices sooner', 'Pay with one tap', 'Recipe cards', 'Rewards for sharing'], ['Pubblicità più chiare', 'Prezzi subito visibili', 'Pagare con un tocco', 'Schede con le ricette', 'Premi per chi condivide']]).forEach((o, j) => items.push(node('note', X + CW * j + 20, top[3] + 14, CW - 40, H[3] - 28, o, { f: '#fff3c4', c: '#b7791f', fs: 14, al: 'left', va: 'top' })));
    return { items: [...items, ...faces.slice(1).map((f, j) => edge({ n: faces[j].id, p: 'r' }, { n: f.id, p: 'l' }, { r: 'curve', sa: 'none', ea: 'none', c: '#9aa29d', s: 2, d: 'dash' }))] };
  }],
  ['storymap', 'storymap', (it) => {
    const T = (x) => (it ? x[1] : x[0]), CW = 180;
    const acts = T([['Find a product', 'Buy it', 'Receive it'], ['Trovare un prodotto', 'Comprarlo', 'Riceverlo']]);
    const steps = T([['Search', 'Browse categories', 'Add to the cart', 'Pay', 'Track the order', 'Return it'], ['Cercare', 'Sfogliare le categorie', 'Aggiungere al carrello', 'Pagare', 'Seguire l’ordine', 'Restituirlo']]);
    const stories = T([[['Search by name', 'Filters by price'], ['Category pages', 'Best sellers'], ['Cart with totals', 'Save for later'], ['Pay by card', 'Pay later'], ['E-mail with status', 'Live map'], ['Return form', 'Free pick-up']],
      [['Cerca per nome', 'Filtri per prezzo'], ['Pagine delle categorie', 'Più venduti'], ['Carrello con i totali', 'Salva per dopo'], ['Paga con la carta', 'Paga dopo'], ['E-mail con lo stato', 'Mappa in tempo reale'], ['Modulo di reso', 'Ritiro gratuito']]]);
    const items = acts.map((a, j) => node('round', j * CW * 2, 0, CW * 2 - 20, 56, a, { f: '#4352d6', c: '#2f38a3', tc: '#ffffff', b: true, fs: 15 }));
    steps.forEach((s, j) => items.push(node('rect', j * CW, 80, CW - 20, 50, s, { f: '#e8eefc', c: '#4352d6', fs: 14 })));
    const W = CW * steps.length - 20;
    items.push(node('divider', 0, 152, W, 30, T(['Release 1 · first version', 'Rilascio 1 · prima versione']), { c: '#c45a0c', tc: '#c45a0c', fs: 13, b: true }));
    items.push(node('divider', 0, 300, W, 30, T(['Release 2', 'Rilascio 2']), { c: '#c45a0c', tc: '#c45a0c', fs: 13, b: true }));
    stories.forEach(([a, b], j) => { items.push(node('note', j * CW, 196, CW - 20, 84, a, { f: '#fff3c4', c: '#b7791f', fs: 13, al: 'left', va: 'top' }), node('note', j * CW, 344, CW - 20, 84, b, { f: '#fff3c4', c: '#b7791f', fs: 13, al: 'left', va: 'top' })); });
    return { items };
  }],
  ['bmc', 'canvas', (it) => canvasTpl(it, it ? 'Business Model Canvas' : 'Business Model Canvas', [
    [['Key partners', 'Partner chiave'], [['Suppliers', 'Fornitori'], ['Couriers', 'Corrieri'], ['Banks', 'Banche']], 0, 0, 1, 2],
    [['Key activities', 'Attività chiave'], [['Product design', 'Progettazione'], ['Marketing', 'Marketing']], 1, 0, 1, 1],
    [['Key resources', 'Risorse chiave'], [['Team', 'Squadra'], ['Brand', 'Marchio'], ['Platform', 'Piattaforma']], 1, 1, 1, 1],
    [['Value propositions', 'Proposte di valore'], [['Fresh food at home in 30 minutes', 'Cibo fresco a casa in 30 minuti'], ['No subscription', 'Nessun abbonamento']], 2, 0, 1, 2],
    [['Customer relationships', 'Relazioni con i clienti'], [['Self-service app', 'App fai da te'], ['Support chat', 'Chat di assistenza']], 3, 0, 1, 1],
    [['Channels', 'Canali'], [['App', 'App'], ['Website', 'Sito web'], ['Social media', 'Social']], 3, 1, 1, 1],
    [['Customer segments', 'Segmenti di clienti'], [['Busy families', 'Famiglie impegnate'], ['Students', 'Studenti']], 4, 0, 1, 2],
    [['Cost structure', 'Struttura dei costi'], [['Couriers', 'Corrieri'], ['Servers', 'Server'], ['Advertising', 'Pubblicità']], 0, 2, 2.5, 1],
    [['Revenue streams', 'Flussi di ricavi'], [['Delivery fee', 'Costo di consegna'], ['Partner commissions', 'Commissioni dei partner']], 2.5, 2, 2.5, 1],
  ])],
  ['lean', 'canvas', (it) => canvasTpl(it, 'Lean Canvas', [
    [['Problem', 'Problema'], [['Cooking takes time', 'Cucinare richiede tempo'], ['Deliveries are slow', 'Le consegne sono lente']], 0, 0, 1, 2],
    [['Solution', 'Soluzione'], [['Fresh meals in 30 minutes', 'Pasti freschi in 30 minuti']], 1, 0, 1, 1],
    [['Key metrics', 'Metriche chiave'], [['Orders a week', 'Ordini a settimana'], ['Returning customers', 'Clienti che tornano']], 1, 1, 1, 1],
    [['Unique value proposition', 'Proposta di valore unica'], [['Home-made taste, without cooking', 'Il gusto di casa, senza cucinare']], 2, 0, 1, 2],
    [['Unfair advantage', 'Vantaggio competitivo'], [['Local cooks', 'Cuochi del quartiere']], 3, 0, 1, 1],
    [['Channels', 'Canali'], [['App', 'App'], ['Word of mouth', 'Passaparola']], 3, 1, 1, 1],
    [['Customer segments', 'Segmenti di clienti'], [['Busy families', 'Famiglie impegnate'], ['Early adopters: students', 'Primi clienti: studenti']], 4, 0, 1, 2],
    [['Cost structure', 'Struttura dei costi'], [['Cooks', 'Cuochi'], ['Couriers', 'Corrieri']], 0, 2, 2.5, 1],
    [['Revenue streams', 'Flussi di ricavi'], [['Price of the meals', 'Prezzo dei pasti']], 2.5, 2, 2.5, 1],
  ])],
  ['wireframe', 'wireframe', (it) => {
    const T = (x) => (it ? x[1] : x[0]), G = '#5f6660';
    const br = node('browser', 0, 0, 760, 540, 'www.example.com', { f: '#ffffff', c: '#9aa29d', s: 1.5, fs: 12, tc: G });
    const nav = node('rect', 1, 30, 758, 44, T(['LOGO      Home      Products      About      Contact', 'LOGO      Home      Prodotti      Chi siamo      Contatti']), { f: '#3a3f47', c: '', s: 0, tc: '#ffffff', fs: 13, al: 'left' });
    const h1 = node('text', 30, 100, 330, 40, T(['Fresh food at home', 'Cibo fresco a casa']), { fs: 26, b: true, al: 'left', f: '', c: '', s: 0 });
    const lo = node('lorem', 30, 152, 330, 50, '', { c: G });
    const bt = node('round', 30, 222, 150, 42, T(['Sign up', 'Iscriviti']), { f: '#4352d6', c: '', s: 0, tc: '#ffffff', fs: 15, b: true });
    const hero = node('imgph', 400, 100, 330, 190, '', { f: '#f7f8fb', c: '#9aa29d', s: 1.5 });
    const cards = [0, 1, 2].flatMap((j) => { const x = 30 + j * 240; return [node('round', x, 320, 220, 190, T(['Card title', 'Titolo della scheda']), { f: '#ffffff', c: '#cfd5df', s: 1.5, al: 'left', va: 'top', fs: 15, b: true }), node('imgph', x + 12, 352, 196, 90, '', { f: '#f7f8fb', c: '#cfd5df', s: 1 }), node('lorem', x + 12, 454, 196, 36, '', { c: G })]; });
    const ph = node('mobile', 820, 0, 250, 520, '', { f: '#ffffff', c: '#3a3f47', s: 2 });
    const mt = node('text', 845, 50, 200, 40, T(['Sign in', 'Accedi']), { fs: 22, b: true, al: 'left', f: '', c: '', s: 0 });
    const in1 = node('rect', 845, 104, 200, 38, 'E-mail', { f: '#ffffff', c: '#9aa29d', s: 1.5, tc: '#9aa29d', fs: 14, al: 'left' }), in2 = node('rect', 845, 152, 200, 38, 'Password', { f: '#ffffff', c: '#9aa29d', s: 1.5, tc: '#9aa29d', fs: 14, al: 'left' });
    const ck = node('check', 845, 204, 200, 24, T(['Remember me', 'Ricordami']), { f: '#ffffff', c: '#4352d6', fs: 14, tc: G });
    const tg = node('toggle', 845, 240, 200, 26, T(['Notifications', 'Notifiche']), { f: '#ffffff', c: '#4352d6', fs: 14, tc: G });
    const sl = node('select', 845, 282, 200, 38, T(['Language', 'Lingua']), { f: '#ffffff', c: '#9aa29d', s: 1.5, fs: 14, tc: G, al: 'left' });
    const b2 = node('round', 845, 340, 200, 42, T(['Sign in', 'Accedi']), { f: '#4352d6', c: '', s: 0, tc: '#ffffff', fs: 15, b: true });
    const lk = node('text', 845, 392, 200, 30, T(['Forgot the password?', 'Password dimenticata?']), { fs: 13, tc: '#4352d6', f: '', c: '', s: 0 });
    return { items: [br, nav, h1, lo, bt, hero, ...cards, ph, mt, in1, in2, ck, tg, sl, b2, lk] };
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
  ['circuit', 'circuit', (it) => {
    const T = (x) => (it ? x[1] : x[0]), E = { f: '#ffffff', c: '#1c1c1c', fs: 13 };
    const bat = node('bat', 0, 0, 60, 44, '9 V', E), sw = node('eswitch', 140, 4, 80, 36, T(['Switch', 'Interruttore']), E), res = node('res', 300, 8, 80, 28, 'R1 · 330 Ω', E);
    const led = node('led', 460, -2, 60, 48, 'LED', { ...E, c: '#b3261e' }), lamp = node('lamp', 280, 102, 60, 40, T(['Lamp', 'Lampada']), E);
    const j1 = node('start', 600, 117, 10, 10, '', { c: '#1c1c1c' }), j2 = node('start', -60, 117, 10, 10, '', { c: '#1c1c1c' }), gnd = node('gnd', -75, 180, 40, 40, '', E);
    const S = (n, p) => ({ n: n.id, p }), W = (a, b) => edge(a, b, { r: 'elbow', sa: 'none', ea: 'none', c: '#1c1c1c', s: 2 });
    return { items: [bat, sw, res, led, lamp, j1, j2, gnd, W(S(bat, 'r'), S(sw, 'l')), W(S(sw, 'r'), S(res, 'l')), W(S(res, 'r'), S(led, 'l')), W(S(led, 'r'), S(j1, 't')),
      W(S(j1, 'l'), S(lamp, 'r')), W(S(lamp, 'l'), S(j2, 'r')), W(S(j2, 't'), S(bat, 'l')), W(S(j2, 'b'), S(gnd, 't'))] };
  }],
  ['floorplan', 'floorplan', (it) => {
    const T = (x) => (it ? x[1] : x[0]), Rm = { f: '#fbf8f1', c: '#3a3f47', s: 4, fs: 14, b: true }, F = { f: '#ffffff', c: '#5f6660', s: 1.5, fs: 12 };
    const rooms = [[0, 0, 420, 300, T(['Living room', 'Soggiorno'])], [420, 0, 260, 300, T(['Kitchen', 'Cucina'])], [0, 300, 340, 260, T(['Bedroom', 'Camera'])], [340, 300, 180, 260, T(['Bathroom', 'Bagno'])], [520, 300, 160, 260, T(['Hall', 'Ingresso'])]].map(([x, y, w, h, l]) => node('box', x, y, w, h, l, Rm));
    const sofa = node('sofa', 30, 196, 190, 80, '', F), tv = node('rect', 120, 40, 120, 14, 'TV', { ...F, fs: 10 });
    const counter = node('rect', 430, 44, 240, 50, T(['Counter', 'Piano di lavoro']), F), table = node('dtable', 470, 110, 140, 130, '', F);
    const bed = node('bed', 40, 340, 160, 200, '', F), wardrobe = node('rect', 250, 340, 70, 180, T(['Wardrobe', 'Armadio']), F);
    const shower = node('rect', 430, 470, 80, 80, T(['Shower', 'Doccia']), F), sink = node('ellipse', 360, 360, 60, 40, '', F);
    const doors = [[234, 230, 70], [590, 230, 70], [352, 250, 50], [580, 490, 70]].map(([x, y, s]) => node('door', x, y, s, s, '', { f: '#fbf8f1', c: '#3a3f47', s: 2 }));
    const wins = [[120, -6, 160, 12], [480, -6, 140, 12], [60, 554, 140, 12], [-6, 80, 12, 120]].map(([x, y, w, h]) => node('window', x, y, w, h, '', { f: '#eef3f8', c: '#3a3f47', s: 1.5 }));
    return { items: [...rooms, sofa, tv, counter, table, bed, wardrobe, shower, sink, ...doors, ...wins] };
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
