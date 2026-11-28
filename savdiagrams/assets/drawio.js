/**
 * diagrams.net / draw.io files (.drawio, .xml, the XML inside a .drawio.png is not read): the first page becomes a
 * diagram. Shapes, their text and colours, connectors with their route, heads and labels, groups and containers (their
 * children are placed where they are on the page). What SavDiagrams does not have (images, tables, custom stencils) becomes
 * a rectangle with its text, so nothing is lost silently. The shapes of the libraries come in as theirs: UML classes (a
 * swimlane with its lines), lifelines and their messages, frames, components, packages, BPMN events and gateways, swimlanes,
 * network devices (Cisco and "networks" stencils), and the heads of UML (hollow triangle and diamond) and ER (crow's feet).
 *
 * A page is an <mxGraphModel>, inside the file as it is or compressed: base64 of the raw deflate of its URI-encoded XML.
 */
import { cleanItems, defaultSettings, uid } from './model.js';

const bad = (code) => Object.assign(new Error(code), { code });

async function inflate(b64) {
  const bytes = Uint8Array.from(atob(b64.replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  return decodeURIComponent(out);
}

/** The <mxGraphModel> of the first page. */
async function firstModel(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw bad('file_invalid');
  let model = doc.querySelector('mxGraphModel');
  const page = doc.querySelector('diagram');
  if (page && !page.querySelector('mxGraphModel')) {
    const raw = page.textContent.trim();
    if (!raw) throw bad('file_invalid');
    let inner;
    try { inner = await inflate(raw); } catch { throw bad('file_invalid'); }
    model = new DOMParser().parseFromString(inner, 'application/xml').querySelector('mxGraphModel');
  } else if (page) model = page.querySelector('mxGraphModel');
  if (!model) throw bad('file_invalid');
  return { model, title: page?.getAttribute('name') || '' };
}

const styleOf = (s) => {
  const o = {};
  for (const part of String(s || '').split(';')) { if (!part) continue; const k = part.indexOf('='); if (k < 0) o['_' + part] = true; else o[part.slice(0, k)] = part.slice(k + 1); }
  return o;
};
const hex = (v) => {
  if (!v || v === 'none' || v === 'default') return '';
  let m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) return '#' + [...m[1]].map((c) => c + c).join('').toLowerCase();
  m = /^#([0-9a-f]{6})$/i.exec(v);
  return m ? '#' + m[1].toLowerCase() : '';
};
/** The text of a cell: its value, HTML turned into plain lines. */
function plain(v, html) {
  if (!v) return '';
  if (!html && !/<[a-z][\s\S]*>/i.test(v)) return v;
  const withBreaks = v.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|h[1-6])>/gi, '\n');
  const doc = new DOMParser().parseFromString('<!doctype html><body>' + withBreaks, 'text/html');
  return (doc.body.textContent || '').replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
/** The kind of SavDiagrams that a style of draw.io becomes: its basic shapes, network icons, UML, BPMN, swimlanes. */
function kindOf(st) {
  const shape = st.shape || '', any = (re) => re.test(shape + ' ' + (st.resIcon || '') + ' ' + (st.prIcon || '')); // the icon of an AWS / Azure / GCP stencil names what it is
  if (any(/umlLifeline/)) return 'lifeline';
  if (any(/umlFrame/)) return 'frame';
  if (any(/startState/)) return 'start';
  if (any(/endState/)) return 'end';
  if (any(/^(component|module)$|umlComponent/)) return 'comp';
  if (any(/^cube$/)) return 'cube';
  if (any(/^folder$|umlPackage/)) return 'package';
  if (any(/bpmn/)) {
    const gw = st.gwType || st.symbol || '';
    if (/gateway|Gw$/i.test(shape + gw) || /rhombus/i.test(st.perimeter || '')) return /parallel/i.test(gw) ? 'gwp' : /inclusive/i.test(gw) ? 'gwo' : 'gwx';
    if (/event|shape$/i.test(shape)) { const o = (st.outline || '') + (st.eventType || ''); return /end/i.test(o) ? 'bend' : /throw|catch|boundInt|interm/i.test(o) ? 'binter' : 'bstart'; }
    return 'round';
  }
  // electric symbols, floor plans, wireframes, C4 and cloud stencils (before the network ones: a switch can be electric)
  if (any(/electrical|resistor|capacitor|inductor|battery|ground|diode|lamp/i)) {
    if (any(/resistor/i)) return 'res';
    if (any(/capacitor/i)) return 'cap';
    if (any(/inductor|coil/i)) return 'ind';
    if (any(/battery|cell/i)) return 'bat';
    if (any(/\bled|light_emitting/i)) return 'led';
    if (any(/diode/i)) return 'diode';
    if (any(/lamp|bulb/i)) return 'lamp';
    if (any(/ground|earth/i)) return 'gnd';
    if (any(/switch/i)) return 'eswitch';
  }
  if (any(/floorplan/i)) {
    if (any(/door/i)) return 'door';
    if (any(/window/i)) return 'window';
    if (any(/bed/i)) return 'bed';
    if (any(/sofa|couch/i)) return 'sofa';
    if (any(/stair/i)) return 'stairs';
    if (any(/table/i)) return 'dtable';
  }
  if (any(/c4.*person/i)) return 'c4person';
  if (any(/mockup.*(browser|window)/i)) return 'browser';
  if (any(/mockup.*(iphone|android|phone)/i)) return 'mobile';
  if (any(/mockup.*checkbox/i)) return 'check';
  if (any(/mockup.*(switch|toggle)/i)) return 'toggle';
  if (any(/mockup.*(combo|select)/i)) return 'select';
  if (any(/mockup.*image/i)) return 'imgph';
  if (any(/lambda|function/i)) return 'func';
  if (any(/sqs|queue/i)) return 'queue';
  if (any(/\bs3|bucket|blob/i)) return 'bucket';
  if (any(/cloudfront|\bcdn/i)) return 'cdn';
  if (any(/load_?balanc|\belb\b/i)) return 'lb';
  if (any(/api_?gateway/i)) return 'apigw';
  if (any(/dataStore|datastore/) && !/cylinder/.test(shape)) return 'store';
  if (any(/router/i)) return 'router';
  if (any(/switch|hub|bridge/i)) return 'switch';
  if (any(/firewall/i)) return 'firewall';
  if (any(/laptop|notebook/i)) return 'laptop';
  if (any(/mobile|phone|tablet/i)) return 'phone';
  if (any(/printer/i)) return 'printer';
  if (any(/access_?point|wireless|wifi|radio/i)) return 'ap';
  if (any(/server|mainframe|nas\b|storage/i)) return 'server';
  if (any(/\.(pc|workstation|terminal|desktop|monitor)/i)) return 'pc';
  if (any(/cloud/i)) return 'cloud';
  if (st._swimlane || shape === 'swimlane') return st.horizontal === '0' ? 'lane' : 'vlane';
  if (st._text || shape === 'text' || (st._label && !st.fillColor)) return 'text';
  if (st._ellipse || shape === 'ellipse' || st._doubleEllipse || shape === 'doubleEllipse') return 'ellipse';
  if (st._rhombus || shape === 'rhombus') return 'diamond';
  if (shape === 'parallelogram' || st._parallelogram) return 'para';
  if (/^(cylinder|cylinder3)$/.test(shape) || st._cylinder) return 'cyl';
  if (shape === 'document' || st._document) return 'doc';
  if (shape === 'note' || st._note || shape === 'card') return 'note';
  if (shape === 'umlActor' || st._umlActor || shape === 'actor') return 'person';
  if (shape === 'cloud' || st._cloud) return 'cloud';
  if (st.rounded === '1' || shape === 'process' && st.rounded === '1') return 'round';
  return 'rect';
}
const HEAD = { none: 'none', '': 'none', classic: 'arrow', classicThin: 'arrow', block: 'arrow', blockThin: 'arrow', open: 'open', openThin: 'open', openAsync: 'open', async: 'arrow', diamond: 'diamond', diamondThin: 'diamond', ERmandOne: 'er1', ERone: 'bar', ERzeroToOne: 'er01', ERoneToMany: 'ern', ERmany: 'ern', ERzeroToMany: 'er0n', dash: 'bar', oval: 'circle', circle: 'circle', circlePlus: 'circle', box: 'diamond' };
/** A head of draw.io: its kind, hollow when it is not filled (inheritance, aggregation, BPMN message flows). */
const headOf = (kind, fill) => { const k = HEAD[kind] || 'arrow'; if (fill !== '0') return k; return { arrow: /^block/.test(kind) ? 'tri' : 'open', diamond: 'odiamond', circle: 'ocircle' }[k] || k; };
/** The side of a node an end of draw.io leaves from, and where along it (o) when not in the middle. */
const side = (x, y) => {
  x = parseFloat(x); y = parseFloat(y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { p: '' };
  const p = y <= .05 ? 't' : y >= .95 ? 'b' : x <= .05 ? 'l' : x >= .95 ? 'r' : '', f = p === 't' || p === 'b' ? x : y;
  return p && Math.abs(f - .5) > .02 ? { p, o: Math.round(Math.max(0, Math.min(1, f)) * 1000) / 1000 } : { p };
};

export async function fromDrawio(xml, name = '') {
  const { model, title } = await firstModel(xml);
  // UserObject / object wrap their mxCell and carry its label and id
  const cells = [...model.querySelectorAll('mxCell')].map((c) => {
    const w = c.parentElement && /^(UserObject|object)$/.test(c.parentElement.localName) ? c.parentElement : null;
    return { el: c, id: w?.getAttribute('id') || c.getAttribute('id'), value: w ? w.getAttribute('label') || '' : c.getAttribute('value') || '' };
  });
  const byId = new Map(cells.map((c) => [c.id, c]));
  const geo = (c) => { const g = c.el.querySelector(':scope > mxGeometry'); return g ? { x: +g.getAttribute('x') || 0, y: +g.getAttribute('y') || 0, w: +g.getAttribute('width') || 0, h: +g.getAttribute('height') || 0, g } : null; };
  // the place of a cell on the page: inside a group or container its geometry is relative to the parent
  const offset = (c, seen = new Set()) => {
    const p = byId.get(c.el.getAttribute('parent'));
    if (!p || seen.has(p.id) || p.el.getAttribute('vertex') !== '1') return [0, 0];
    seen.add(p.id);
    const g = geo(p), [ox, oy] = offset(p, seen);
    return [ox + (g?.x || 0), oy + (g?.y || 0)];
  };
  const ids = new Map(), items = [], labels = new Map(), consumed = new Set();
  const groupOf = new Map();
  for (const c of cells) {
    const st = styleOf(c.el.getAttribute('style'));
    if (c.el.getAttribute('vertex') !== '1') continue;
    const g = geo(c);
    if (!g) continue;
    // a label on a connector: kept for its connector
    if (st._edgeLabel || st.edgeLabel !== undefined) { const p = c.el.getAttribute('parent'); labels.set(p, [labels.get(p), plain(c.value, st.html === '1')].filter(Boolean).join(' ')); continue; }
    const kids = cells.some((x) => x.el.getAttribute('parent') === c.id);
    if (consumed.has(c.id)) continue;
    if (st._group || (kids && !c.value && (st.fillColor === 'none' || !st.fillColor) && !st.strokeColor)) { groupOf.set(c.id, uid()); continue; } // a group: no shape of its own
    const [ox, oy] = offset(c), id = uid(), fs = +st.fontSize || 12, fstyle = +st.fontStyle || 0;
    let k = kindOf(st), text = plain(c.value, st.html === '1');
    // a UML class of draw.io is a swimlane whose children are its lines (a "line" between the parts): one class here
    if ((k === 'lane' || k === 'vlane') && st.childLayout === 'stackLayout') {
      const rows = cells.filter((x) => x.el.getAttribute('parent') === c.id && x.el.getAttribute('vertex') === '1').sort((a, b) => (geo(a)?.y || 0) - (geo(b)?.y || 0));
      const lines = [text];
      for (const r of rows) { consumed.add(r.id); const rs = styleOf(r.el.getAttribute('style')); if (rs._line || rs.shape === 'line') lines.push('--'); else { if (lines.length === 1) lines.push('--'); lines.push(plain(r.value, rs.html === '1')); } }
      k = 'class'; text = lines.join('\n');
    }
    ids.set(c.id, id);
    const fill = st.fillColor === undefined ? (k === 'text' ? '' : '#ffffff') : hex(st.fillColor);
    const stroke = st.strokeColor === undefined ? (k === 'text' ? '' : '#1c1c1c') : hex(st.strokeColor);
    items.push({ id, t: 'node', k, x: g.x + ox, y: g.y + oy, w: Math.max(4, g.w), h: Math.max(4, g.h), text, f: fill, c: stroke, s: stroke ? +st.strokeWidth || 1 : 0,
      d: st.dashed === '1' ? 'dash' : '', tc: hex(st.fontColor) || '#1c1c1c', fs: Math.max(6, Math.round(fs * 1.15)), ff: /mono|courier/i.test(st.fontFamily || '') ? 'mono' : /serif|times|georgia/i.test(st.fontFamily || '') && !/sans/i.test(st.fontFamily || '') ? 'serif' : 'sans',
      b: !!(fstyle & 1), i: !!(fstyle & 2), al: ['left', 'right'].includes(st.align) ? st.align : 'center', va: st.verticalAlign === 'top' ? 'top' : st.verticalAlign === 'bottom' ? 'bottom' : 'middle', _parent: c.el.getAttribute('parent') });
  }
  // groups: what was inside one group stays together
  for (const n of items) { const g = groupOf.get(n._parent); if (g) n.g = g; delete n._parent; }
  for (const c of cells) {
    if (c.el.getAttribute('edge') !== '1') continue;
    const st = styleOf(c.el.getAttribute('style')), g = c.el.querySelector(':scope > mxGeometry');
    const pt = (as) => { const p = g?.querySelector(`mxPoint[as="${as}"]`); return p ? { x: +p.getAttribute('x') || 0, y: +p.getAttribute('y') || 0 } : null; };
    const s = ids.get(c.el.getAttribute('source')), t = ids.get(c.el.getAttribute('target'));
    const a = s ? { n: s, ...side(st.exitX, st.exitY) } : pt('sourcePoint'), b = t ? { n: t, ...side(st.entryX, st.entryY) } : pt('targetPoint');
    if (!a || !b) continue;
    // a message of a sequence diagram: on a lifeline it keeps its height (draw.io gives it as exitY / entryY, or as a point)
    const byId = (id) => items.find((n) => n.id === id);
    const onLife = (end, other, fy, p) => {
      const n = end.n && byId(end.n);
      if (!n || n.k !== 'lifeline' || (end.p && end.p !== 'l' && end.p !== 'r')) return;
      const y = Number.isFinite(parseFloat(fy)) ? parseFloat(fy) : p ? (p.y - n.y) / n.h : NaN;
      if (!Number.isFinite(y) || y <= 0 || y >= 1) return;
      const o = other.n && byId(other.n), ox2 = o ? o.x + o.w / 2 : other.x;
      end.p = ox2 < n.x + n.w / 2 ? 'l' : 'r'; end.o = Math.round(y * 1000) / 1000;
    };
    onLife(a, b, st.exitY, pt('sourcePoint')); onLife(b, a, st.entryY, pt('targetPoint'));
    const [ox, oy] = offset(c);
    if (!a.n) { a.x += ox; a.y += oy; }
    if (!b.n) { b.x += ox; b.y += oy; }
    const stroke = hex(st.strokeColor) || '#1c1c1c';
    items.push({ id: uid(), t: 'edge', a, b, r: /orthogonal|elbow|entityRelation/i.test(st.edgeStyle || '') ? 'elbow' : st.curved === '1' ? 'curve' : 'straight', c: stroke, s: +st.strokeWidth || 1.5, d: st.dashed === '1' ? 'dash' : '',
      sa: headOf(st.startArrow ?? 'none', st.startFill), ea: headOf(st.endArrow ?? 'classic', st.endFill), text: [plain(c.value, st.html === '1'), labels.get(c.id)].filter(Boolean).join(' '), fs: Math.round((+st.fontSize || 11) * 1.15), tc: hex(st.fontColor) || '#1c1c1c' });
  }
  if (!items.length) throw bad('file_empty');
  return { title: (title && !/^Page-\d+$/i.test(title) ? title : name.replace(/\.(drawio|xml)$/i, '')).slice(0, 160), settings: defaultSettings(), items: cleanItems(items) };
}
