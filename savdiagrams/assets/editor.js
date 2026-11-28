/**
 * The editor of a diagram: an SVG as big as the window over a plane without edges, as in SavWhiteboard. The view (x, y, z)
 * says where the plane is: a point of the diagram at (dx, dy) is on screen at (dx·z + x, dy·z + y).
 *
 * Shapes are placed from the library (click, drag on the page, or drag out of the library), connectors are drawn with the
 * connector tool or from the four dots around a shape (dropped on empty space they make a new shape, already connected)
 * and stay attached when the shapes move. Grid and snap, alignment guides, groups, order, locking, automatic layout of
 * trees. Moving: two fingers (pinch to zoom), the middle button, the space bar, the hand, or the wheel. Every change goes
 * into the history (undo/redo) and into the next save, which sends only what changed.
 */
import { btn, colorPop, confirm, ctxAt, dialog, drop, fail, h, icon, iconBtn, K, menuAt, mobile, put, toast } from './ui.js';
import { both, getLang, t } from './i18n.js';
import { S, api } from './store.js';
import { commands, go, prefs, setPrefs, userMenu } from './account.js';
import { BACKS, COMPART, CONTAINERS, UNDER, FILLS, FONTS, INKS, LIBRARIES, MAX_IMG, PRESETS, RELATIONS, SHAPES, SLOTS, cleanItems, compH, edge as newEdge, freshIds, isDark, libOf, node as newNode, r2, uid } from './model.js';
import { NS, bounds, facing, gridPattern, hits, itemSVG, measure, overlaps, route, sample, shapeSVG, sidePoint, textLines, union } from './shapes.js';
import { layoutTree, rootOf } from './layout.js';
import { keep as keepOff, take as takeOff, drop as dropOff } from '../../assets/savoffice/offline-keep.js';

const R2 = (v) => Math.round(v * 100) / 100;
const svgEl = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const CLIP = 'savdiagrams';
const NODE_DEF = { f: '#ffffff', c: '#1c1c1c', s: 2, d: '', tc: '#1c1c1c', fs: 16, ff: 'sans', b: false, i: false, al: 'center', va: 'middle' };
const EDGE_DEF = { r: 'elbow', c: '#1c1c1c', s: 2, d: '', sa: 'none', ea: 'arrow', fs: 14, tc: '#1c1c1c' };
const SHAPE_ICON = { rect: 'square', round: 'rounded', diamond: 'diamond', ellipse: 'circle', para: 'para', cyl: 'database', doc: 'doc-shape', note: 'sticky-note', person: 'person', cloud: 'cloud', text: 'type' };
const QUICK = ['rect', 'round', 'diamond', 'ellipse'];
const BASIC = LIBRARIES[0][1].map((e) => e[0]);
const presetOf = (id) => PRESETS.get(id) || PRESETS.get('rect');
const WIDTHS = [1, 2, 3, 5, 8];
const FS = [12, 14, 16, 20, 24, 32, 48];

export async function editorScreen(root, id) {
  const r = await api('dg.get', undefined, { id });
  const D = r.diagram;
  if (D.trashed) { const e = new Error('not_found'); e.code = 'not_found'; throw e; }
  // changes made here without a network and kept in this browser (offline-keep.js): the diagram opens as it was left
  if (window.SavOffice) window.SavOffice.offlineEdit = true;
  const kept = await takeOff('savdiagrams', D.id), server = kept ? { list: D.list } : null;
  if (kept) Object.assign(D, { list: kept.list, title: kept.title, settings: kept.settings });
  let P = prefs();
  const nodeStyle = () => ({ ...NODE_DEF, ...(P.node || {}) }), edgeStyle = () => ({ ...EDGE_DEF, ...(P.edge || {}) });
  /** A new node of an entry of the library: the basic shapes take the last style used, the others their own look. */
  function makeNode(id, x, y, w, hh) {
    const p = presetOf(id), st = nodeStyle(), k = p.k;
    let n;
    if (p.tx || Object.keys(p.st).length) n = newNode(k, x, y, w, hh, p.tx ? p.tx[getLang() === 'it' ? 1 : 0] : '', { ...NODE_DEF, ff: st.ff, ...p.st });
    else n = newNode(k, x, y, w, hh, '', k === 'text' ? { ...st, f: '', c: '', s: 0 } : k === 'note' ? { ...st, f: '#fff3c4', al: 'left', va: 'top' } : st);
    if (COMPART.has(k)) n.h = Math.max(n.h, compH(n));
    return n;
  }
  /** Where a new node goes in the order: on top, or (a container) just behind the first thing it covers. */
  function orderFor(n) {
    if (!CONTAINERS.has(n.k)) return null;
    const k = order.findIndex((x) => { const i = items.get(x); return i?.t === 'node' && i.x >= n.x && i.y >= n.y && i.x + i.w <= n.x + n.w && i.y + i.h <= n.y + n.h; });
    if (k < 0) return null;
    return [...order.slice(0, k), n.id, ...order.slice(k)];
  }
  /** One end of a connector dropped on a node at (x, y): a side (its middle) or the nearest; on a lifeline, the height. */
  function endAt(n, x, y) {
    if (SLOTS.has(n.k) && y > n.y + Math.min(n.h, Math.max(30, n.fs * 2.6))) return { n: n.id, p: x < n.x + n.w / 2 ? 'l' : 'r', o: r2(clamp((y - n.y) / n.h, 0, 1)) };
    return { n: n.id, p: sideNear(n, x, y) };
  }

  // ---------------------------------------------------------------- state
  const items = new Map(), els = new Map();
  let order = [];
  for (const i of cleanItems(D.list)) { items.set(i.id, i); order.push(i.id); }
  const settings = { ...D.settings };
  let title = D.title, version = D.version, dark = isDark(settings.bg);
  const saved = settings.view ? { ...settings.view } : null;
  let V = { x: 0, y: 0, z: 1 };
  // shapeKind: the entry of the library the shape tool places (a kind of shape with its size, style and text); edgeKind:
  // the style of a connector picked in the library (a UML relation, an ER cardinality…), for the connector tool
  let tool = 'select', shapeKind = PRESETS.get(P.shape)?.k ? P.shape : 'rect', edgeKind = null;
  const sel = new Set();
  let hist = [], fut = [], editing = null, spaceDown = false, gone = false, hover = null, guides = [], marquee = null, target = null, showMap = P.map !== false;
  const get = (k) => { const i = items.get(k); return i && i.t === 'node' ? i : undefined; };
  const all = () => order.map((k) => items.get(k)).filter(Boolean);

  // ---------------------------------------------------------------- the stage
  const svg = svgEl('svg', { class: 'stage', role: 'application', 'aria-label': title });
  const defs = svgEl('defs'), bgRect = svgEl('rect', { width: '100%', height: '100%' }), gridRect = svgEl('rect', { width: '100%', height: '100%', fill: 'url(#dgg)' });
  const world = svgEl('g'), itemsG = svgEl('g'), liveG = svgEl('g', { class: 'live' }), over = svgEl('g', { class: 'over' });
  world.append(itemsG, liveG);
  svg.append(defs, bgRect, gridRect, world, over);
  const wrap = h('div.wb.dg', svg);
  const status = h('span.wstatus', { role: 'status' });
  const zoomLabel = h('sav-button.zl', { size: 'sm', appearance: 'ghost', variant: 'neutral', title: t('zoom_100') }, '100%');
  zoomLabel.addEventListener('click', () => zoomTo(1));

  // ---------------------------------------------------------------- view
  const size = () => { const b = svg.getBoundingClientRect(); return { w: b.width || innerWidth, h: b.height || innerHeight, l: b.left, t: b.top }; };
  const toWorld = (cx, cy) => { const s = size(); return [(cx - s.l - V.x) / V.z, (cy - s.t - V.y) / V.z]; };
  const toScreen = (x, y) => [x * V.z + V.x, y * V.z + V.y];
  let viewTimer = 0, viewDirty = false;
  function applyView() {
    world.setAttribute('transform', `matrix(${V.z} 0 0 ${V.z} ${V.x} ${V.y})`);
    drawGrid();
    drawOverlay();
    placeEditor();
    zoomLabel.textContent = Math.round(V.z * 100) + '%';
    drawMap();
    viewDirty = true;
    clearTimeout(viewTimer);
    viewTimer = setTimeout(() => queueSave(0), 2500);
  }
  function drawGrid() {
    gridRect.style.display = settings.grid ? '' : 'none';
    if (!settings.grid) return;
    let k = 1;
    while (settings.gs * k * V.z < 10) k *= 2; // far away, one dot in two: the grid never turns into fog
    defs.innerHTML = gridPattern('dgg', settings.gs * k, settings.bg, V.z);
    const p = defs.firstChild, s = settings.gs * k * V.z;
    p?.setAttribute('patternTransform', `translate(${r2(V.x - s / 2)} ${r2(V.y - s / 2)})`);
  }
  function applyLook() {
    dark = isDark(settings.bg);
    bgRect.setAttribute('fill', settings.bg);
    wrap.classList.toggle('dark', dark);
    drawGrid();
    redrawAll();
  }
  function zoomAt(cx, cy, factor) {
    const s = size(), z = clamp(V.z * factor, .05, 20), px = cx - s.l, py = cy - s.t;
    V = { x: px - (px - V.x) * (z / V.z), y: py - (py - V.y) * (z / V.z), z };
    applyView();
  }
  const zoomTo = (z) => { const s = size(); zoomAt(s.l + s.w / 2, s.t + s.h / 2, z / V.z); };
  function fit(box = union(all(), get), animate = true) {
    const s = size(), top = 70, bottom = mobile() ? 150 : 110;
    let to;
    if (!box) to = { x: s.w / 2, y: s.h / 2, z: 1 };
    else {
      const z = clamp(Math.min((s.w - 80) / Math.max(1, box.w), (s.h - top - bottom) / Math.max(1, box.h), 1.6), .05, 20);
      to = { x: s.w / 2 - (box.x + box.w / 2) * z, y: top + (s.h - top - bottom) / 2 - (box.y + box.h / 2) * z, z };
    }
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { V = to; return applyView(); }
    const from = { ...V }, t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / 260), e = 1 - (1 - k) ** 3; V = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: from.z * (to.z / from.z) ** e }; applyView(); if (k < 1 && !gone) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------- items on screen
  function el(i) { const g = svgEl('g', { 'data-id': i.id }); g.innerHTML = itemSVG(i, get, settings.bg); if (editing?.id === i.id) g.classList.add('editing'); if (i.lk) g.classList.add('locked'); return g; }
  function draw(k) {
    const i = items.get(k), old = els.get(k);
    if (!i) { old?.remove(); els.delete(k); return; }
    const n = el(i);
    if (old) old.replaceWith(n); else itemsG.append(n);
    els.set(k, n);
  }
  /** Draws these items again, and every connector attached to a node among them. */
  function drawMany(ids) {
    const set = new Set(ids);
    for (const k of set) draw(k);
    for (const k of order) { const e = items.get(k); if (e?.t === 'edge' && !set.has(k) && ((e.a.n && set.has(e.a.n)) || (e.b.n && set.has(e.b.n)))) draw(k); }
  }
  function redrawAll() { els.clear(); itemsG.replaceChildren(...order.map((k) => { const n = el(items.get(k)); els.set(k, n); return n; })); }
  const restack = () => { for (const k of order) { const n = els.get(k); if (n) itemsG.append(n); } };

  // ---------------------------------------------------------------- changes, history, saving
  const dirty = new Set();
  let orderDirty = false, titleDirty = false, lookDirty = false;
  /** list: [[id, before | null, after | null]]; newOrder: the ids in a new order. */
  function change(list, newOrder = null, record = true) {
    list = list.filter(([, b, a]) => b || a);
    // a node that goes takes its connectors with it
    const goneIds = new Set(list.filter(([, , a]) => !a).map(([k]) => k));
    if (goneIds.size) for (const k of order) { const e = items.get(k); if (e?.t === 'edge' && !goneIds.has(k) && ((e.a.n && goneIds.has(e.a.n)) || (e.b.n && goneIds.has(e.b.n))) && !list.some(([x, , a]) => x === k && a)) { list.push([k, e, null]); goneIds.add(k); } }
    if (!list.length && !newOrder) return;
    const ob = order.slice();
    for (const [k, , a] of list) { if (a) { if (!items.has(k)) order.push(k); items.set(k, a); } else items.delete(k); dirty.add(k); }
    if (list.some(([, , a]) => !a)) order = order.filter((x) => items.has(x));
    if (newOrder) { order = newOrder.filter((x) => items.has(x)); orderDirty = true; }
    drawMany(list.map(([k]) => k));
    if (newOrder) restack();
    if (record) { hist.push({ list, ob, oa: order.slice() }); if (hist.length > 300) hist.shift(); fut = []; }
    for (const x of [...sel]) if (!items.has(x)) sel.delete(x);
    queueSave();
    afterChange();
  }
  function travel(from, to, back) {
    const e = from.pop();
    if (!e) return;
    for (const [k, b, a] of e.list) { const v = back ? b : a; if (v) items.set(k, v); else items.delete(k); dirty.add(k); }
    order = (back ? e.ob : e.oa).filter((x) => items.has(x));
    for (const x of items.keys()) if (!order.includes(x)) order.push(x);
    orderDirty = true;
    redrawAll();
    to.push(e);
    sel.clear();
    for (const [k] of e.list) if (items.has(k)) sel.add(k);
    queueSave();
    afterChange();
  }
  const undo = () => { finishEdit(); travel(hist, fut, true); };
  const redo = () => { finishEdit(); travel(fut, hist, false); };
  function afterChange() { undoB.button.disabled = !hist.length; redoB.button.disabled = !fut.length; drawOverlay(); buildProps(); drawMap(); }

  let saving = false, again = false, timer = 0, fails = 0, lastThumb = 0, thumbDirty = false;
  const STATUS = { saved: ['cloud-check', 'saved'], saving: ['cloud-upload', 'saving'], wait: ['cloud-upload', 'saving'], error: ['cloud-off', 'not_saved'], offline: ['cloud-off', 'offline_wait'] };
  const setStatus = (k) => { status.dataset.k = k; status.replaceChildren(icon(STATUS[k][0]), h('span.lbl', t(STATUS[k][1]))); status.title = t(STATUS[k][1]); };
  const busy = () => dirty.size || orderDirty || titleDirty || lookDirty;
  function queueSave(delay = 900) {
    if (busy()) { thumbDirty = true; setStatus('wait'); }
    clearTimeout(timer);
    timer = setTimeout(() => flush(), delay);
  }
  async function flush(leaving = false) {
    clearTimeout(timer);
    if (saving) { again = true; return; }
    if (!busy() && !viewDirty && !(leaving && thumbDirty)) { if (status.dataset.k !== 'error' && status.dataset.k !== 'offline') setStatus('saved'); return; }
    const put = [], del = [];
    for (const x of dirty) { const i = items.get(x); if (i) put.push(i); else del.push(x); }
    const body = { id: D.id, base: version, lang: getLang() };
    if (put.length) body.put = put;
    if (del.length) body.del = del;
    if (orderDirty) body.order = order.slice();
    if (titleDirty) body.title = title;
    if (lookDirty || viewDirty) body.settings = { ...settings, view: { x: r2(V.x - size().w / 2), y: r2(V.y - size().h / 2), z: r2(V.z) } };
    const sent = { dirty: new Set(dirty), orderDirty, titleDirty, lookDirty, viewDirty };
    dirty.clear(); orderDirty = titleDirty = lookDirty = viewDirty = false;
    saving = true;
    if (put.length || del.length || sent.orderDirty || sent.titleDirty || sent.lookDirty) setStatus('saving');
    try {
      if (thumbDirty && (leaving || Date.now() - lastThumb > 12000)) { const { thumbnail } = await import('./files.js'); body.thumb = await thumbnail(all(), settings).catch(() => undefined); lastThumb = Date.now(); thumbDirty = false; }
      const res = await api('dg.save', body);
      version = res.version;
      fails = 0;
      if (!busy()) dropOff('savdiagrams', D.id); // everything left
      setStatus(dirty.size ? 'wait' : 'saved');
      const card = S.diagrams.find((b) => b.id === D.id);
      if (card) Object.assign(card, { title, version, items: items.size, bg: settings.bg, updated: res.updated || card.updated }, body.thumb !== undefined ? { thumb: body.thumb } : {});
      if (res.stale && !dirty.size) await refresh();
    } catch (e) {
      for (const x of sent.dirty) dirty.add(x);
      orderDirty ||= sent.orderDirty; titleDirty ||= sent.titleDirty; lookDirty ||= sent.lookDirty; viewDirty ||= sent.viewDirty;
      if (body.thumb !== undefined) thumbDirty = true;
      fails++;
      setStatus(e.code === 'network' ? 'offline' : 'error');
      if (e.code === 'network') keepHere(); // no network: a copy stays in this browser, even if the page is closed
      if (e.code === 'diagram_big' || e.code === 'not_found' || e.code === 'unauthenticated') { fail(e); if (e.code !== 'diagram_big') return; }
      if (!gone) timer = setTimeout(() => flush(), Math.min(30000, 1500 * 2 ** fails));
    } finally {
      saving = false;
      if (again) { again = false; flush(leaving); }
    }
  }
  const keepHere = () => keepOff('savdiagrams', D.id, { title, settings: { ...settings }, list: all() });
  /** Another window saved this diagram: its items come here (nothing is waiting to leave from this window). */
  async function refresh() {
    const x = (await api('dg.get', undefined, { id: D.id, quiet: 1 })).diagram;
    version = x.version;
    if (JSON.stringify(x.list) === JSON.stringify(all())) return;
    items.clear(); order = [];
    for (const i of cleanItems(x.list)) { items.set(i.id, i); order.push(i.id); }
    for (const k of [...sel]) if (!items.has(k)) sel.delete(k);
    redrawAll(); afterChange();
    toast(t('stale'), 'neutral');
  }

  // ---------------------------------------------------------------- selection and the overlay
  const selItems = () => [...sel].map((x) => items.get(x)).filter(Boolean);
  const selNodes = () => selItems().filter((i) => i.t === 'node');
  /** A click on a member of a group selects the whole group. */
  const withGroups = (ids) => { const gs = new Set(ids.map((k) => items.get(k)?.g).filter(Boolean)); return gs.size ? [...new Set([...ids, ...order.filter((k) => gs.has(items.get(k)?.g))])] : ids; };
  function select(ids, add = false) { if (!add) sel.clear(); for (const x of withGroups(ids)) sel.add(x); drawOverlay(); buildProps(); }
  const PORT_R = () => (matchMedia('(pointer: coarse)').matches ? 9 : 5.5);
  function drawOverlay() {
    const parts = [], list = selItems(), sc = (x, y) => toScreen(x, y).map(r2);
    for (const i of list) {
      if (i.t === 'node') { const b = bounds(i, get), [x, y] = sc(b.x, b.y); parts.push(`<rect class="selbox${i.lk ? ' lk' : ''}" x="${x - 3}" y="${y - 3}" width="${r2(b.w * V.z + 6)}" height="${r2(b.h * V.z + 6)}" rx="3"/>`); }
      else { const g = route(i, get); if (!g) continue; const pts = sample(g).map((p) => sc(...p).join(',')).join(' '); parts.push(`<polyline class="seledge" points="${pts}"/>`); }
    }
    const one = list.length === 1 ? list[0] : null;
    if (one && one.t === 'node' && !one.lk && !editing) {
      const [x, y] = sc(one.x, one.y), w = one.w * V.z, hh = one.h * V.z, r = matchMedia('(pointer: coarse)').matches ? 7 : 4.5;
      for (const [k, hx, hy] of [['nw', x, y], ['n', x + w / 2, y], ['ne', x + w, y], ['e', x + w, y + hh / 2], ['se', x + w, y + hh], ['s', x + w / 2, y + hh], ['sw', x, y + hh], ['w', x, y + hh / 2]]) {
        if ((k === 'n' || k === 's') && w < 40) continue;
        if ((k === 'e' || k === 'w') && hh < 40) continue;
        parts.push(`<rect class="hd" data-h="${k}" x="${r2(hx - r)}" y="${r2(hy - r)}" width="${r * 2}" height="${r * 2}" rx="2"/>`);
      }
    }
    if (one && one.t === 'edge' && !one.lk) {
      const g = route(one, get);
      if (g) for (const [k, p] of [['a', g.tipA[0]], ['b', g.tipB[0]]]) { const [x, y] = sc(...p), isN = one[k].n; parts.push(`<circle class="hd end${isN ? ' on' : ''}" data-end="${k}" cx="${x}" cy="${y}" r="${matchMedia('(pointer: coarse)').matches ? 9 : 6}"/>`); }
    }
    // the four dots to draw a connector out of a shape: on the shape under the pointer, or the one selected
    const portNode = (tool === 'select' || tool === 'connect') && !editing && !action ? (hover && items.get(hover)?.t === 'node' ? items.get(hover) : one?.t === 'node' ? one : null) : null;
    if (portNode && portNode.k !== 'text' && !portNode.lk && Math.min(portNode.w, portNode.h) * V.z > 22) for (const p of ['t', 'r', 'b', 'l']) { const [x, y] = sc(...sidePoint(portNode, p)), o = { t: [0, -1], r: [1, 0], b: [0, 1], l: [-1, 0] }[p], d = 14; parts.push(`<circle class="port" data-port="${p}" data-node="${portNode.id}" cx="${r2(x + o[0] * d)}" cy="${r2(y + o[1] * d)}" r="${PORT_R()}"/>`); }
    if (target) { const n = items.get(target.n); if (n) { const b = bounds(n, get), [x, y] = sc(b.x, b.y); parts.push(`<rect class="tgt" x="${x - 4}" y="${y - 4}" width="${r2(b.w * V.z + 8)}" height="${r2(b.h * V.z + 8)}" rx="5"/>`); if (target.p) { const [px, py] = sc(...sidePoint(n, target.p)); parts.push(`<circle class="tgtp" cx="${px}" cy="${py}" r="5"/>`); } } }
    for (const g of guides) { const [x1, y1] = sc(g[0], g[1]), [x2, y2] = sc(g[2], g[3]); parts.push(`<line class="guide" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`); }
    if (marquee) { const [x1, y1] = sc(Math.min(marquee.x0, marquee.x1), Math.min(marquee.y0, marquee.y1)); parts.push(`<rect class="marq" x="${x1}" y="${y1}" width="${r2(Math.abs(marquee.x1 - marquee.x0) * V.z)}" height="${r2(Math.abs(marquee.y1 - marquee.y0) * V.z)}"/>`); }
    over.innerHTML = parts.join('');
  }

  // ---------------------------------------------------------------- actions of the pointer
  const pointers = new Map();
  let action = null, gesture = null;
  const tol = () => (matchMedia('(pointer: coarse)').matches ? 10 : 5) / V.z;
  const topAt = (x, y, tl = tol(), only) => { for (let k = order.length - 1; k >= 0; k--) { const i = items.get(order[k]); if (i && (!only || only(i)) && hits(i, x, y, tl, get)) return i; } return null; };
  const nodeAt = (x, y, skip) => topAt(x, y, 2 / V.z, (i) => i.t === 'node' && i.id !== skip && i.k !== 'text');
  const snapV = (v, alt) => (settings.snap && !alt ? Math.round(v / settings.gs) * settings.gs : r2(v));
  /** The side of a node near a point (within a few pixels of its middle), or '' for "the nearest". */
  const sideNear = (n, x, y) => { let best = '', d = 16 / V.z; for (const p of ['t', 'r', 'b', 'l']) { const [px, py] = sidePoint(n, p), q = Math.hypot(px - x, py - y); if (q < d) { d = q; best = p; } } return best; };
  const moveNode = (i, dx, dy) => ({ ...i, x: r2(i.x + dx), y: r2(i.y + dy) });
  const movedEdge = (e, dx, dy, ids) => ({ ...e, a: e.a.n ? e.a : { x: r2(e.a.x + dx), y: r2(e.a.y + dy) }, b: e.b.n ? e.b : { x: r2(e.b.x + dx), y: r2(e.b.y + dy) }, _: ids });

  function moveAction(e, x, y, hit) {
    const wasSel = sel.has(hit.id);
    if (e.shiftKey) { if (!wasSel) select([hit.id], true); } else if (!wasSel) select([hit.id]);
    const list = selItems().filter((i) => !i.lk);
    // a container (lane, pool, frame, package…) takes along what lies inside it and is drawn over it
    for (let q = 0; q < list.length; q++) {
      const c = list[q];
      if (c.t !== 'node' || !CONTAINERS.has(c.k)) continue;
      const at = order.indexOf(c.id);
      for (const k of order.slice(at + 1)) { const i = items.get(k); if (i?.t === 'node' && !i.lk && !list.includes(i) && i.x >= c.x - .5 && i.y >= c.y - .5 && i.x + i.w <= c.x + c.w + .5 && i.y + i.h <= c.y + c.h + .5) list.push(i); }
    }
    const start = new Map(list.map((i) => [i.id, i]));
    const box = union(list.filter((i) => i.t === 'node'), get) || union(list, get);
    const others = order.map((k) => items.get(k)).filter((i) => i && i.t === 'node' && !start.has(i.id)).map((i) => bounds(i, get));
    let dx = 0, dy = 0, did = false;
    return {
      id: e.pointerId,
      move(ev) {
        const [a, b] = toWorld(ev.clientX, ev.clientY);
        dx = a - x; dy = b - y;
        if (!did && Math.hypot(dx, dy) * V.z < 4) return;
        did = true;
        guides = [];
        if (box && !ev.altKey) {
          // the grid first, then the edges and middles of the other shapes, which win when they are near
          let nx = box.x + dx, ny = box.y + dy;
          if (settings.snap) { nx = snapV(nx); ny = snapV(ny); }
          const lim = 6 / V.z, xs = [[box.x + dx, 0], [box.x + dx + box.w / 2, box.w / 2], [box.x + dx + box.w, box.w]], ys = [[box.y + dy, 0], [box.y + dy + box.h / 2, box.h / 2], [box.y + dy + box.h, box.h]];
          let bx = null, by = null;
          for (const o of others) {
            for (const [v, off] of xs) for (const w of [o.x, o.x + o.w / 2, o.x + o.w]) if (Math.abs(v - w) < lim && (!bx || Math.abs(v - w) < bx.d)) bx = { d: Math.abs(v - w), x: w - off, at: w, o };
            for (const [v, off] of ys) for (const w of [o.y, o.y + o.h / 2, o.y + o.h]) if (Math.abs(v - w) < lim && (!by || Math.abs(v - w) < by.d)) by = { d: Math.abs(v - w), y: w - off, at: w, o };
          }
          if (bx) nx = bx.x;
          if (by) ny = by.y;
          dx = nx - box.x; dy = ny - box.y;
          if (bx) { const y1 = Math.min(bx.o.y, box.y + dy), y2 = Math.max(bx.o.y + bx.o.h, box.y + dy + box.h); guides.push([bx.at, y1 - 10, bx.at, y2 + 10]); }
          if (by) { const x1 = Math.min(by.o.x, box.x + dx), x2 = Math.max(by.o.x + by.o.w, box.x + dx + box.w); guides.push([x1 - 10, by.at, x2 + 10, by.at]); }
        }
        for (const [k, i] of start) items.set(k, i.t === 'node' ? moveNode(i, dx, dy) : movedEdge(i, dx, dy));
        drawMany([...start.keys()]);
        drawOverlay();
      },
      up() {
        guides = [];
        if (!did) { if (e.shiftKey && wasSel) { sel.delete(hit.id); drawOverlay(); buildProps(); } return; }
        change([...start].map(([k, i]) => { const v = items.get(k); delete v._; return [k, i, v]; }));
      },
      cancel() { guides = []; for (const [k, i] of start) items.set(k, i); drawMany([...start.keys()]); drawOverlay(); },
    };
  }
  function marqueeAction(e, x, y) {
    if (!e.shiftKey) select([]);
    marquee = { x0: x, y0: y, x1: x, y1: y };
    const base = new Set(sel);
    return {
      id: e.pointerId,
      move(ev) {
        const [a, b] = toWorld(ev.clientX, ev.clientY);
        marquee.x1 = a; marquee.y1 = b;
        const box = { x: Math.min(marquee.x0, a), y: Math.min(marquee.y0, b), w: Math.abs(a - marquee.x0), h: Math.abs(b - marquee.y0) };
        sel.clear();
        for (const k of base) sel.add(k);
        for (const k of withGroups(order.filter((k) => { const q = bounds(items.get(k), get); return q && overlaps(q, box) && (items.get(k).t === 'node' ? q.x >= box.x && q.y >= box.y && q.x + q.w <= box.x + box.w && q.y + q.h <= box.y + box.h : true); }))) sel.add(k);
        drawOverlay();
      },
      up() { marquee = null; drawOverlay(); buildProps(); },
      cancel() { marquee = null; drawOverlay(); },
    };
  }
  function resizeAction(e, handle) {
    const n = selItems()[0], [x0, y0] = toWorld(e.clientX, e.clientY);
    return {
      id: e.pointerId,
      move(ev) {
        const [x, y] = toWorld(ev.clientX, ev.clientY), dx = x - x0, dy = y - y0;
        let L = n.x, T = n.y, Rr = n.x + n.w, B = n.y + n.h;
        if (handle.includes('w')) L = snapV(n.x + dx, ev.altKey);
        if (handle.includes('e')) Rr = snapV(n.x + n.w + dx, ev.altKey);
        if (handle.includes('n')) T = snapV(n.y + dy, ev.altKey);
        if (handle.includes('s')) B = snapV(n.y + n.h + dy, ev.altKey);
        if (ev.shiftKey && handle.length === 2) { const k = Math.max((Rr - L) / n.w, (B - T) / n.h); if (handle.includes('w')) L = Rr - n.w * k; else Rr = L + n.w * k; if (handle.includes('n')) T = B - n.h * k; else B = T + n.h * k; }
        const w = Math.max(10, Rr - L), hh = Math.max(10, B - T);
        items.set(n.id, { ...n, x: r2(handle.includes('w') ? Rr - w : L), y: r2(handle.includes('n') ? B - hh : T), w: r2(w), h: r2(hh) });
        drawMany([n.id]);
        drawOverlay();
      },
      up() { const v = items.get(n.id); if (v !== n) change([[n.id, n, v]]); },
      cancel() { items.set(n.id, n); drawMany([n.id]); drawOverlay(); },
    };
  }
  /** Drags one end of a connector to another shape, side or free point. */
  function endAction(e, which) {
    const ed = selItems()[0];
    return {
      id: e.pointerId,
      move(ev) {
        const [x, y] = toWorld(ev.clientX, ev.clientY), other = ed[which === 'a' ? 'b' : 'a'], n = nodeAt(x, y);
        target = n ? endAt(n, x, y) : null;
        items.set(ed.id, { ...ed, [which]: target ? { ...target } : { x: snapV(x, ev.altKey), y: snapV(y, ev.altKey) } });
        void other;
        drawMany([ed.id]);
        drawOverlay();
      },
      up() { target = null; const v = items.get(ed.id); if (v !== ed) change([[ed.id, ed, v]]); else drawOverlay(); },
      cancel() { target = null; items.set(ed.id, ed); drawMany([ed.id]); drawOverlay(); },
    };
  }
  /**
   * A new connector: from a node (and its side) or a free point. Dropped on a node it attaches to it; dropped on empty
   * space from a dot of a shape it makes a copy of that shape there, already connected.
   */
  function connectAction(e, from, x0, y0, makeNode) {
    const st = edgeKind ? { ...EDGE_DEF, ...edgeKind.st } : edgeStyle(), a = from ? { n: from.id, p: from.p || '', ...(from.o !== undefined ? { o: from.o } : {}) } : { x: snapV(x0), y: snapV(y0) };
    let cur = null, did = false;
    const preview = (x, y, alt) => {
      const n = nodeAt(x, y, from?.id);
      target = n ? endAt(n, x, y) : null;
      cur = { ...newEdge(a, target ? { ...target } : { x: snapV(x, alt), y: snapV(y, alt) }, st), id: '_live' };
      liveG.innerHTML = itemSVG(cur, get, settings.bg);
    };
    return {
      id: e.pointerId,
      move(ev) { const [x, y] = toWorld(ev.clientX, ev.clientY); if (!did && Math.hypot(x - x0, y - y0) * V.z < 6) return; did = true; hover = null; preview(x, y, ev.altKey); drawOverlay(); },
      up(ev) {
        liveG.innerHTML = '';
        const tg = target;
        target = null;
        if (!did || !cur) { drawOverlay(); return; }
        const [x, y] = toWorld(ev.clientX, ev.clientY);
        if (!tg && makeNode && from) {
          // a copy of the shape it comes from, placed so that its facing side sits where the pointer let go
          const src = get(from.id), side = from.p || facing(src, x, y), opp = { t: 'b', b: 't', l: 'r', r: 'l' }[side];
          const w = src.w, hh = src.h, nx = side === 'r' ? x : side === 'l' ? x - w : x - w / 2, ny = side === 'b' ? y : side === 't' ? y - hh : y - hh / 2;
          const n = { ...src, id: uid(), x: snapV(nx), y: snapV(ny), text: '', g: undefined, lk: undefined };
          delete n.g; delete n.lk; delete n.img;
          const ed = { ...cur, id: uid(), a: { n: src.id, p: from.p || '' }, b: { n: n.id, p: from.p ? opp : '' } };
          change([[n.id, null, n], [ed.id, null, ed]]);
          select([n.id]);
          if (!matchMedia('(pointer: coarse)').matches) startEdit(n);
          return;
        }
        if (!tg && !from && Math.hypot(x - x0, y - y0) * V.z < 12) { drawOverlay(); return; }
        const ed = { ...cur, id: uid() };
        change([[ed.id, null, ed]]);
        select([ed.id]);
        if (tool === 'connect' && !P.keepTool) setTool('select');
      },
      cancel() { liveG.innerHTML = ''; target = null; drawOverlay(); },
    };
  }
  /** A new shape: a click places it at its usual size, a drag gives it the size of the drag. */
  function shapeAction(e, kind) {
    const [x0, y0] = toWorld(e.clientX, e.clientY);
    let n = null;
    const make = (x1, y1, alt) => {
      const pr = presetOf(kind), w0 = pr.w, h0 = pr.h, drag = Math.hypot(x1 - x0, y1 - y0) * V.z > 8;
      const L = drag ? snapV(Math.min(x0, x1), alt) : snapV(x0 - w0 / 2, alt), T = drag ? snapV(Math.min(y0, y1), alt) : snapV(y0 - h0 / 2, alt);
      const w = drag ? Math.max(10, snapV(Math.max(x0, x1), alt) - L) : w0, hh = drag ? Math.max(10, snapV(Math.max(y0, y1), alt) - T) : h0;
      n = makeNode(kind, L, T, w, hh);
      liveG.innerHTML = itemSVG(n, get, settings.bg);
    };
    make(x0, y0, false);
    liveG.innerHTML = '';
    return {
      id: e.pointerId,
      move(ev) { const [x, y] = toWorld(ev.clientX, ev.clientY); make(x, y, ev.altKey); },
      up() { liveG.innerHTML = ''; change([[n.id, null, n]], orderFor(n)); if (!P.keepTool) setTool('select'); select([n.id]); if (kind === 'text') startEdit(n); },
      cancel() { liveG.innerHTML = ''; },
    };
  }

  // ---------------------------------------------------------------- typing inside shapes and on connectors
  let editor = null;
  function startEdit(item, typed) {
    finishEdit();
    if (!item || item.lk) return;
    editing = { id: item.id, item };
    els.get(item.id)?.classList.add('editing');
    sel.clear(); sel.add(item.id); drawOverlay();
    const ta = h('textarea.ted', { spellcheck: 'true', placeholder: COMPART.has(item.k) ? t('ph_' + item.k) : t('type_here'), 'aria-label': t('edit_text') });
    ta.value = typed ?? item.text;
    editor = ta;
    wrap.append(ta);
    placeEditor();
    ta.addEventListener('input', () => placeEditor());
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); finishEdit(); }
      else if (e.key === 'Tab' && item.t === 'node') { e.preventDefault(); finishEdit(); addChild(items.get(item.id)); }
    });
    ta.addEventListener('blur', () => setTimeout(() => { if (editor === ta && document.activeElement !== ta) finishEdit(); }, 120));
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
    buildProps();
  }
  function placeEditor() {
    if (!editor || !editing) return;
    const i = items.get(editing.id) || editing.item, s = editor.style;
    if (i.t === 'node') {
      const tl = textLines({ ...i, text: editor.value || ' ' }), b = tl.box, [x, y] = toScreen(b.x, b.y), w = b.w * V.z;
      const lines = Math.max(1, tl.lines.length), th = lines * tl.lh * V.z + 4;
      const top = b.under ? y : tl.va === 'top' ? y + tl.pad * V.z : tl.va === 'bottom' ? y + b.h * V.z - tl.pad * V.z - th : y + (b.h * V.z - th) / 2;
      // shapes whose text is drawn in parts (class, table, card, axis) are edited as plain lines on the background
      const plain = COMPART.has(i.k) || i.k === 'card' || i.k === 'axis';
      Object.assign(s, { left: x + tl.pad * V.z + 'px', top: top + 'px', width: Math.max(30, w - tl.pad * 2 * V.z) + 'px', height: th + 'px', font: `${i.i ? 'italic ' : ''}${i.b ? 700 : 400} ${i.fs * V.z}px/1.25 ${FONTS[i.ff]}`, color: plain ? (dark ? '#f2f2f2' : '#1c1c1c') : i.tc, textAlign: tl.al, background: plain ? settings.bg : 'transparent',
        transform: b.rot ? 'rotate(-90deg)' : '', transformOrigin: b.rot ? `${r2(b.rot[0] * V.z + V.x - x - tl.pad * V.z)}px ${r2(b.rot[1] * V.z + V.y - top)}px` : '' });
    } else {
      const g = route(i, get);
      if (!g) return;
      const [x, y] = toScreen(...g.mid), fs = i.fs * V.z, w = Math.max(80, Math.min(260 * V.z, measure(editor.value || 'MMMM', `400 ${fs}px Inter`) + 24));
      const lines = Math.max(1, (editor.value.match(/\n/g) || []).length + 1);
      Object.assign(s, { left: x - w / 2 + 'px', top: y - (lines * fs * 1.25) / 2 - 3 + 'px', width: w + 'px', height: lines * fs * 1.25 + 6 + 'px', font: `400 ${fs}px/1.25 ${FONTS.sans}`, color: i.tc, textAlign: 'center', background: settings.bg });
    }
  }
  function finishEdit() {
    if (!editing) return;
    const { id: eid, item } = editing, value = editor.value.replace(/\s+$/, '');
    editor.remove(); editor = null; editing = null;
    els.get(eid)?.classList.remove('editing');
    const now = items.get(eid);
    if (!now) return;
    if (!value && now.t === 'node' && now.k === 'text') change([[eid, now, null]]);
    else if (value !== now.text) {
      const o = { ...now, text: value };
      // a class or a table grows with its text: as tall as its parts, as wide as its longest line
      if (COMPART.has(o.k)) { o.h = compH(o); o.w = Math.max(o.w, Math.ceil(Math.max(...value.split('\n').map((l) => measure(l, `700 ${o.fs}px ${FONTS[o.ff]}`))) + 30)); }
      change([[eid, now, o]]);
    }
    else { draw(eid); drawOverlay(); }
    void item;
    buildProps();
  }

  // ---------------------------------------------------------------- pointers
  function cancelAction() { action?.cancel(); action = null; }
  const touchList = () => [...pointers.values()].filter((p) => p.type === 'touch');
  function startPinch() { const [a, b] = touchList(); gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, v: { ...V } }; }
  let press = 0, lastTap = { t: 0, id: '' };
  function onDown(e) {
    if (e.button === 2) return;
    if (editing && e.target !== editor) finishEdit();
    try { svg.setPointerCapture(e.pointerId); } catch { /* gone */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    clearTimeout(press);
    if (e.pointerType === 'touch' && touchList().length >= 2) { cancelAction(); startPinch(); return; }
    if (e.button === 1 || spaceDown || tool === 'hand') { e.preventDefault(); gesture = { kind: 'pan', id: e.pointerId, x: e.clientX, y: e.clientY }; wrap.classList.add('panning'); return; }
    if (gesture) return;
    const [x, y] = toWorld(e.clientX, e.clientY), d = e.target?.dataset || {};
    if (d.h) { action = resizeAction(e, d.h); return; }
    if (d.end) { action = endAction(e, d.end); return; }
    if (d.port) { action = connectAction(e, { id: d.node, p: d.port }, x, y, true); return; }
    if (tool === 'shape') { action = shapeAction(e, shapeKind); return; }
    if (tool === 'text') { action = shapeAction(e, 'text'); return; }
    if (tool === 'connect') { const n = nodeAt(x, y), end = n ? endAt(n, x, y) : null; action = connectAction(e, n ? { id: n.id, p: end.p, o: end.o } : null, x, y, false); return; }
    const hit = topAt(x, y);
    // a double tap edits the text (touch has no double click)
    if (e.pointerType === 'touch' && hit && lastTap.id === hit.id && performance.now() - lastTap.t < 350) { lastTap = { t: 0, id: '' }; startEdit(hit); return; }
    lastTap = { t: performance.now(), id: hit?.id || '' };
    // a long press of a finger opens the menu of what is under it
    if (e.pointerType === 'touch') press = setTimeout(() => { if (!action?.moved) { cancelAction(); context(e.clientX, e.clientY, hit); } }, 550);
    if (hit) action = moveAction(e, x, y, hit);
    else if (e.pointerType === 'touch') { select([]); gesture = { kind: 'pan', id: e.pointerId, x: e.clientX, y: e.clientY }; }
    else action = marqueeAction(e, x, y);
  }
  function onMove(e) {
    const p = pointers.get(e.pointerId);
    if (!p) {
      // hovering with a mouse or a stylus: the dots of the shape under it
      if (e.pointerType !== 'touch' && (tool === 'select' || tool === 'connect') && !editing) {
        const [x, y] = toWorld(e.clientX, e.clientY), d = e.target?.dataset || {};
        const nh = d.port ? d.node : topAt(x, y, 14 / V.z, (i) => i.t === 'node')?.id || null;
        if (nh !== hover) { hover = nh; drawOverlay(); }
      }
      return;
    }
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) clearTimeout(press);
    p.x = e.clientX; p.y = e.clientY;
    if (gesture?.kind === 'pinch') {
      const t2 = touchList();
      if (t2.length < 2) return;
      const [a, b] = t2, dd = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, s = size(), g = gesture;
      const z = clamp(g.v.z * dd / g.d, .05, 20), px = g.mx - s.l, py = g.my - s.t;
      V = { z, x: mx - s.l - (px - g.v.x) * (z / g.v.z), y: my - s.t - (py - g.v.y) * (z / g.v.z) };
      applyView();
      return;
    }
    if (gesture?.kind === 'pan' && gesture.id === e.pointerId) { V = { ...V, x: V.x + e.clientX - gesture.x, y: V.y + e.clientY - gesture.y }; gesture.x = e.clientX; gesture.y = e.clientY; applyView(); return; }
    if (action && action.id === e.pointerId) action.move(e);
  }
  function onUp(e) {
    pointers.delete(e.pointerId);
    clearTimeout(press);
    if (gesture?.kind === 'pinch') { if (touchList().length < 2) gesture = null; return; }
    if (gesture?.kind === 'pan' && gesture.id === e.pointerId) { gesture = null; wrap.classList.remove('panning'); return; }
    if (action && action.id === e.pointerId) { const a = action; action = null; if (e.type === 'pointercancel') a.cancel(); else a.up(e); }
  }
  svg.addEventListener('pointerdown', onDown);
  wrap.addEventListener('selectstart', (e) => { const x = e.target?.nodeType === 3 ? e.target.parentElement : e.target; if (!x?.closest?.('textarea, input, [contenteditable]')) e.preventDefault(); });
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && hover && !action) { hover = null; drawOverlay(); } });
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? size().h : 1, dx = e.deltaX * k, dy = e.deltaY * k;
    if (e.ctrlKey || e.metaKey || (P.wheel === 'zoom' && !e.shiftKey)) zoomAt(e.clientX, e.clientY, Math.exp(-dy * (e.ctrlKey && Math.abs(dy) < 40 ? .012 : .0022)));
    else { V = { ...V, x: V.x - (e.shiftKey && !dx ? dy : dx), y: V.y - (e.shiftKey && !dx ? 0 : dy) }; applyView(); }
  }, { passive: false });
  let gsc = 1;
  svg.addEventListener('gesturestart', (e) => { e.preventDefault(); gsc = 1; });
  svg.addEventListener('gesturechange', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.scale / gsc); gsc = e.scale; });
  svg.addEventListener('dblclick', (e) => {
    if (tool !== 'select') return;
    const [x, y] = toWorld(e.clientX, e.clientY), hit = topAt(x, y);
    if (hit) return startEdit(hit);
    // on empty space: a new shape of the last kind, ready for its text
    const pr = presetOf(shapeKind), n = makeNode(shapeKind, snapV(x - pr.w / 2), snapV(y - pr.h / 2), pr.w, pr.h);
    change([[n.id, null, n]], orderFor(n));
    startEdit(n);
  });
  svg.addEventListener('contextmenu', (e) => { e.preventDefault(); if (action || gesture) return; const [x, y] = toWorld(e.clientX, e.clientY); context(e.clientX, e.clientY, topAt(x, y)); });
  function context(cx, cy, hit) {
    if (hit && !sel.has(hit.id)) select([hit.id]);
    const [x, y] = toWorld(cx, cy), list = selItems(), one = list.length === 1 ? list[0] : null;
    ctxAt(cx, cy, list.length ? [
      one ? ['type', t('edit_text'), () => startEdit(one), { kbd: 'Enter' }] : null,
      one?.t === 'node' ? ['git-branch-plus', t('add_child'), () => addChild(one), { kbd: 'Tab' }] : null,
      '-', ['scissors', t('cut_sel'), () => copySel(true), { kbd: 'Mod+X' }], ['copy', t('copy_sel'), () => copySel(), { kbd: 'Mod+C' }], ['copy-plus', t('duplicate_sel'), () => duplicate(), { kbd: 'Mod+D' }],
      '-', ['bring-to-front', t('front'), () => arrange('front'), { kbd: ']' }], ['send-to-back', t('back'), () => arrange('back'), { kbd: '[' }],
      list.length > 1 ? ['group', t('group'), () => group(true), { kbd: 'Mod+G' }] : null, list.some((i) => i.g) ? ['ungroup', t('ungroup'), () => group(false), { kbd: 'Mod+Shift+G' }] : null,
      [list.every((i) => i.lk) ? 'lock-open' : 'lock', t(list.every((i) => i.lk) ? 'unlock' : 'lock'), () => lock(!list.every((i) => i.lk))],
      one?.t === 'node' ? ['network', t('layout_tree'), () => autoLayout('down', one.id)] : null,
      '-', ['trash', t('delete_sel'), () => removeSel(), { danger: true, kbd: 'Del' }],
    ] : [['clipboard-paste', t('paste'), () => pasteFromMenu(x, y), { kbd: 'Mod+V' }], ['mouse-pointer-2', t('select_all'), () => select(order), { kbd: 'Mod+A' }], ['scan', t('zoom_fit'), () => fit(), { kbd: 'Shift+1' }]]);
  }

  // ---------------------------------------------------------------- what the selection can do
  function removeSel() { const list = selItems().filter((i) => !i.lk); if (!list.length) return; change(list.map((i) => [i.id, i, null])); sel.clear(); drawOverlay(); buildProps(); }
  /** The selection ready to be copied: the connectors between selected nodes come along, the others keep their free ends. */
  function clipOf(list) {
    const ids = new Set(list.map((i) => i.id));
    const extra = order.map((k) => items.get(k)).filter((e) => e?.t === 'edge' && !ids.has(e.id) && e.a.n && e.b.n && ids.has(e.a.n) && ids.has(e.b.n));
    return [...list, ...extra].map((i) => {
      if (i.t !== 'edge') return i;
      const g = route(i, get), o = { ...i };
      if (g) { o._ax = g.tipA[0][0]; o._ay = g.tipA[0][1]; o._bx = g.tipB[0][0]; o._by = g.tipB[0][1]; }
      if (o.a.n && !ids.has(o.a.n)) o.a = { x: r2(o._ax ?? 0), y: r2(o._ay ?? 0) };
      if (o.b.n && !ids.has(o.b.n)) o.b = { x: r2(o._bx ?? 0), y: r2(o._by ?? 0) };
      return o;
    });
  }
  const shift = (list, dx, dy) => list.map((i) => (i.t === 'node' ? moveNode(i, dx, dy) : movedEdge(i, dx, dy))).map((i) => { delete i._; return i; });
  function duplicate(list = selItems(), off = settings.snap ? settings.gs : 20) {
    if (!list.length) return;
    const copies = shift(freshIds(clipOf(list)), off, off);
    change(copies.map((i) => [i.id, null, i]));
    select(copies.map((i) => i.id));
  }
  function arrange(where) {
    if (!sel.size) return;
    const ids = order.filter((x) => sel.has(x)), rest = order.filter((x) => !sel.has(x));
    let next;
    if (where === 'front') next = [...rest, ...ids];
    else if (where === 'back') next = [...ids, ...rest];
    else {
      next = order.slice();
      const step = where === 'up' ? 1 : -1, idx = next.map((x, k) => (sel.has(x) ? k : -1)).filter((k) => k >= 0);
      for (const k of step > 0 ? idx.reverse() : idx) { const j = k + step; if (j >= 0 && j < next.length && !sel.has(next[j])) [next[k], next[j]] = [next[j], next[k]]; }
    }
    change([], next);
  }
  function restyle(patch, filter = () => true) {
    const list = selItems().filter((i) => filter(i) && !i.lk);
    if (!list.length) return;
    change(list.map((i) => [i.id, i, { ...i, ...Object.fromEntries(Object.entries(patch).filter(([k]) => k in i || ['g'].includes(k) || (i.t === 'node' ? k in NODE_DEF || k === 'k' || k === 'img' || k === 'h' : k in EDGE_DEF))) }]));
    // the style chosen is the one of the next shapes and connectors
    const nk = Object.fromEntries(Object.entries(patch).filter(([k]) => k in NODE_DEF)), ek = Object.fromEntries(Object.entries(patch).filter(([k]) => k in EDGE_DEF));
    if (list.some((i) => i.t === 'node') && Object.keys(nk).length) savePref({ node: { ...(P.node || {}), ...nk } });
    if (list.some((i) => i.t === 'edge') && Object.keys(ek).length) savePref({ edge: { ...(P.edge || {}), ...ek } });
  }
  const savePref = (x) => { setPrefs(x).catch(() => {}); P = prefs(); };
  function group(on) {
    const list = selItems();
    if (on && list.length < 2) return;
    const g = uid();
    change(list.map((i) => { const o = { ...i }; if (on) o.g = g; else delete o.g; return [i.id, i, o]; }));
  }
  function lock(on) { change(selItems().map((i) => { const o = { ...i }; if (on) o.lk = true; else delete o.lk; return [i.id, i, o]; })); }
  function alignSel(how) {
    const list = selNodes().filter((i) => !i.lk);
    if (list.length < 2) return;
    const b = union(list, get);
    change(list.map((i) => {
      const o = { ...i };
      if (how === 'left') o.x = b.x; else if (how === 'right') o.x = r2(b.x + b.w - i.w); else if (how === 'center') o.x = r2(b.x + b.w / 2 - i.w / 2);
      else if (how === 'top') o.y = b.y; else if (how === 'bottom') o.y = r2(b.y + b.h - i.h); else if (how === 'middle') o.y = r2(b.y + b.h / 2 - i.h / 2);
      return [i.id, i, o];
    }));
  }
  function distribute(axis) {
    const list = selNodes().filter((i) => !i.lk);
    if (list.length < 3) return;
    const k = axis === 'h' ? 'x' : 'y', s = axis === 'h' ? 'w' : 'h', sorted = list.slice().sort((a, b) => a[k] - b[k]);
    const first = sorted[0], last = sorted[sorted.length - 1], free = last[k] + last[s] - first[k] - sorted.reduce((a, i) => a + i[s], 0), gap = free / (sorted.length - 1);
    let at = first[k] + first[s] + gap;
    change(sorted.slice(1, -1).map((i) => { const o = { ...i, [k]: r2(at) }; at += i[s] + gap; return [i.id, i, o]; }));
  }
  /** Lays out the tree a node belongs to (or the whole diagram from its first root). */
  function autoLayout(dir, from) {
    finishEdit();
    const list = all(), nodes = list.filter((i) => i.t === 'node');
    if (!nodes.length) return;
    let rootId = from || selNodes()[0]?.id;
    if (rootId) rootId = rootOf(list, rootId);
    else { const incoming = new Set(list.filter((i) => i.t === 'edge' && i.b.n).map((i) => i.b.n)); rootId = (nodes.find((n) => !incoming.has(n.id) && list.some((e) => e.t === 'edge' && e.a.n === n.id)) || nodes[0]).id; }
    const { moves, ends } = layoutTree(list, rootId, dir), ch = [];
    for (const [k, p] of moves) { const i = items.get(k); if (i && !i.lk && (i.x !== r2(p.x) || i.y !== r2(p.y))) ch.push([k, i, { ...i, x: r2(p.x), y: r2(p.y) }]); }
    for (const [k, e2] of ends) { const i = items.get(k); if (i) ch.push([k, i, { ...i, ...e2, r: dir === 'both' ? 'curve' : i.r }]); }
    if (!ch.length) return toast(t('layout_none'), 'neutral');
    change(ch);
    savePref({ tree: dir });
    requestAnimationFrame(() => fit());
  }
  /** A new node attached to this one: after its last child, or on its right (below in an org chart). */
  function addChild(parent) {
    if (!parent || parent.t !== 'node') return;
    const kids = all().filter((e) => e.t === 'edge' && e.a.n === parent.id && get(e.b.n)).map((e) => [e, get(e.b.n)]);
    const down = (kids[0]?.[0].a.p || (P.tree === 'down' ? 'b' : '')) === 'b';
    const last = kids.map((x) => x[1]).sort((a, b) => (down ? a.x - b.x : a.y - b.y)).pop();
    const proto = last || parent, w = proto.w, hh = proto.h, gap = settings.gs * 2;
    const x = last ? (down ? last.x + last.w + gap / 2 : last.x) : down ? parent.x + parent.w / 2 - w / 2 : parent.x + parent.w + gap * 2;
    const y = last ? (down ? last.y : last.y + last.h + gap / 2) : down ? parent.y + parent.h + gap * 2 : parent.y + parent.h / 2 - hh / 2;
    const n = { ...proto, id: uid(), x: snapV(x), y: snapV(y), text: '' };
    delete n.g; delete n.lk; delete n.img;
    const st = kids[0]?.[0] || { ...edgeStyle(), a: { p: '' }, b: { p: '' } };
    const ed = { ...newEdge({ n: parent.id, p: st.a.p || (down ? 'b' : 'r') }, { n: n.id, p: st.b.p || (down ? 't' : 'l') }, edgeStyle()), r: st.r || 'elbow', c: st.c, s: st.s, d: st.d, sa: st.sa, ea: st.ea };
    change([[n.id, null, n], [ed.id, null, ed]]);
    select([n.id]);
    startEdit(n);
  }
  function addSibling(n) {
    const pe = all().find((e) => e.t === 'edge' && e.b.n === n.id && get(e.a.n));
    if (pe) addChild(get(pe.a.n));
    else { const m = { ...n, id: uid(), y: snapV(n.y + n.h + settings.gs * 2), text: '' }; delete m.g; delete m.lk; delete m.img; change([[m.id, null, m]]); select([m.id]); startEdit(m); }
  }
  function copySel(cutToo = false) {
    const list = selItems();
    if (!list.length) return '';
    const data = JSON.stringify({ [CLIP]: clipOf(list) });
    navigator.clipboard?.writeText(data).catch(() => {});
    S.clip = data;
    if (cutToo) removeSel();
    return data;
  }
  function pasteItems(list, at) {
    if (!list.length) return;
    const fresh = freshIds(list), b = union(fresh, (k) => fresh.find((i) => i.id === k && i.t === 'node'));
    const [cx, cy] = at || toWorld(size().l + size().w / 2, size().t + size().h / 2);
    const copies = b ? shift(fresh, snapV(cx - b.x - b.w / 2), snapV(cy - b.y - b.h / 2)) : fresh;
    change(copies.map((i) => [i.id, null, i]));
    setTool('select');
    select(copies.map((i) => i.id));
  }
  async function pasteFromMenu(x, y) {
    let s = '';
    try { s = await navigator.clipboard.readText(); } catch { s = S.clip || ''; }
    pasteData(s || S.clip || '', [x, y]);
  }
  function pasteData(s, at) {
    try { const j = JSON.parse(s); if (j?.[CLIP]) return pasteItems(cleanItems(j[CLIP]).map((i, k) => ({ ...i, ...(['_ax', '_ay', '_bx', '_by'].reduce((o, p) => (j[CLIP][k]?.[p] !== undefined ? { ...o, [p]: j[CLIP][k][p] } : o), {})) })), at); } catch { /* a text */ }
    if (!s.trim()) return;
    // plain text: one shape per line (a quick way to start a list of steps)
    const lines = s.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 60), st = nodeStyle(), w = 140, hh = 70;
    const nodes = lines.map((l, k) => newNode('round', 0, k * (hh + settings.gs * 2), w, hh, l, st));
    const edges = nodes.slice(1).map((n, k) => newEdge({ n: nodes[k].id, p: '' }, { n: n.id, p: '' }, edgeStyle()));
    pasteItems([...nodes, ...edges], at);
  }
  function setTool(k, kind) {
    finishEdit();
    if (kind) { shapeKind = kind; savePref({ shape: kind }); }
    if (k !== 'connect') edgeKind = null;
    tool = k;
    for (const [n, b] of Object.entries(tb)) b.on(n === (k === 'shape' ? 'shape:' + shapeKind : k));
    moreShapes.button.icon = SHAPE_ICON[!QUICK.includes(shapeKind) && k === 'shape' ? shapeKind : 'more'] || 'shapes';
    moreShapes.on((k === 'shape' && !QUICK.includes(shapeKind)) || (k === 'connect' && !!edgeKind));
    svg.dataset.tool = k;
    hover = null;
    drawOverlay();
  }

  // ---------------------------------------------------------------- the library and the tools
  const tb = {};
  const tools = h('nav.tools', { 'aria-label': t('tools') });
  // every tool has its button; which ones the dock shows and in what order is a choice of each person (⋮ → Customise the bars)
  const TL = {}, TL_ITEMS = [];
  const addTool = (k, ic, label, kbd, run) => { const b = iconBtn(ic, label, run, { place: 'top', kbd, size: matchMedia('(max-width: 640px)').matches ? 'sm' : 'md' }); tb[k] = b; TL[k] = b; TL_ITEMS.push([k, ic, label]); return b; };
  // the key of each tool: its letter with ⌥⇧ (Alt+Shift), never the letter alone
  addTool('select', 'mouse-pointer-2', t('tool_select'), 'Alt+Shift+V', () => setTool('select'));
  addTool('hand', 'hand', t('tool_hand'), 'Alt+Shift+H', () => setTool('hand'));
  for (const k of QUICK) addTool('shape:' + k, SHAPE_ICON[k], t('s_' + k), 'Alt+Shift+' + { rect: 'R', round: 'U', diamond: 'D', ellipse: 'O' }[k], () => setTool('shape', k));
  // the whole library: the shapes of every kind of diagram, in sections, with a search; a shape is pressed (then placed with
  // a click on the page) or dragged onto the page; a connector style (UML relation, cardinality, flow…) is pressed, then drawn
  const lib = h('div.lib');
  const libPop = h('sav-popover', { placement: 'top', 'sheet-on-mobile': true, heading: t('shapes'), style: '--width:21rem' });
  const moreShapes = iconBtn('shapes', t('shapes'), null, { place: 'top' });
  moreShapes.slot = 'trigger';
  const libQ = h('sav-input', { size: 'sm', type: 'search', placeholder: t('search_shapes'), clearable: true, 'aria-label': t('search_shapes'), class: 'libq' }, icon('search', { slot: 'prefix' }));
  libQ.addEventListener('keydown', (e) => e.stopPropagation());
  // on a touch screen the search is not focused when the sheet opens (the keyboard would cover the shapes)
  moreShapes.addEventListener('click', () => { if (matchMedia('(pointer: coarse)').matches) for (const ms of [30, 200, 450]) setTimeout(() => { if (libQ.matches(':focus-within') && !libQ.value) libQ.blur(); }, ms); });
  const libBody = h('div.libs');
  libPop.append(moreShapes, h('div.libw', libQ, libBody));
  // the sections start folded, but the basic shapes and the ones of the kinds this diagram already has
  const used = new Set([...items.values()].filter((i) => i.t === 'node' && !BASIC.includes(i.k)).map((i) => libOf(i.k)));
  const fold = new Set(P.libFold || LIBRARIES.slice(1).map((x) => x[0]).filter((k) => !used.has(k)));
  /** The small picture of an entry: its shape at its proportions (or a connector with its heads). */
  const libPic = (p) => {
    if (!p.k) {
      const e = { ...EDGE_DEF, ...p.st, id: 'x', t: 'edge', a: { x: 4, y: 20 }, b: { x: 60, y: 20 }, r: 'straight', c: 'currentColor', s: 2, text: '' };
      return h('span.libpic', { html: `<svg viewBox="-4 -4 72 52" width="56" height="40">${itemSVG(e, () => null, 'none')}</svg>` });
    }
    const k = p.k, ar = k === 'text' ? 140 / 40 : p.w / p.h, W = 60, H = 36, w = ar > W / H ? W : Math.max(10, H * ar), hh = ar > W / H ? Math.max(6, W / ar) : H;
    const under = UNDER.has(k) && !['start', 'end', 'mile'].includes(k) ? .85 : 1;
    const ww = w * under, h2 = hh * under, x = 2 + (W - ww) / 2, y = 6 + (H - h2) / 2;
    const paint = k === 'text' ? 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3"' : `fill="var(--libfill)" stroke="currentColor" stroke-width="2" stroke-linejoin="round"${p.st.d ? ' stroke-dasharray="4 3"' : ''}`;
    const body = p.id === 'fork' ? `<rect x="2" y="${R2(6 + H / 2 - 3)}" width="60" height="6" fill="currentColor"/>` : shapeSVG(k === 'text' ? 'rect' : k, x, y, ww, h2, paint);
    return h('span.libpic', { html: `<svg viewBox="-4 -4 72 52" width="56" height="40">${body}${k === 'text' ? '<text x="32" y="27" text-anchor="middle" font-size="14" fill="currentColor" font-family="Inter, sans-serif">Aa</text>' : ''}</svg>` });
  };
  const libEntry = (p) => {
    const pic = libPic(p), label = t('s_' + p.id);
    const b = h('button.libb' + (p.k ? '' : '.libe'), { type: 'button', title: label, 'aria-label': label, draggable: 'false' }, pic, h('small', label));
    if (!p.k) { b.addEventListener('click', () => { edgeKind = p; setTool('connect'); edgeKind = p; moreShapes.on(true); libPop.hide(); toast(t('hint_relation', { r: label }), 'neutral', { duration: 3000 }); }); return b; }
    b.addEventListener('click', () => { setTool('shape', p.id); libPop.hide(); });
    // dragging a shape out of the library onto the page
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const x0 = e.clientX, y0 = e.clientY, ghost = h('div.ghost', { html: pic.innerHTML });
      let out = false;
      const mv = (ev) => {
        if (!out && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 10) { out = true; document.body.append(ghost); libPop.hide(); }
        if (out) Object.assign(ghost.style, { left: ev.clientX - 28 + 'px', top: ev.clientY - 20 + 'px' });
      };
      const up = (ev) => {
        removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
        ghost.remove();
        if (!out) return;
        const s = size();
        if (ev.clientX < s.l || ev.clientY < s.t || ev.clientX > s.l + s.w || ev.clientY > s.t + s.h) return;
        const [x, y] = toWorld(ev.clientX, ev.clientY), n = makeNode(p.id, snapV(x - p.w / 2), snapV(y - p.h / 2), p.w, p.h);
        change([[n.id, null, n]], orderFor(n));
        setTool('select');
        select([n.id]);
      };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    return b;
  };
  // the words an entry is found by: its name in both languages, its library, its kind
  const words = (id, key) => [both('s_' + id), both('lib_' + key), id].join(' ').toLowerCase();
  function drawLib() {
    const q = libQ.value.trim().toLowerCase();
    if (q) {
      const seen = new Set(), found = [];
      for (const [key, list] of LIBRARIES) for (const [id] of list) if (!seen.has(id) && q.split(/\s+/).every((w) => words(id, key).includes(w))) { seen.add(id); found.push(PRESETS.get(id)); }
      return put(libBody, found.length ? h('div.lib', found.map(libEntry)) : h('p.muted.libnone', t('nothing_found')));
    }
    put(libBody, LIBRARIES.map(([key, list]) => {
      const d = h('details.libsec', { open: !fold.has(key) || null }, h('summary', t('lib_' + key)), h('div.lib', list.map(([id]) => libEntry(PRESETS.get(id)))));
      d.addEventListener('toggle', () => { if (d.open) fold.delete(key); else fold.add(key); savePref({ libFold: [...fold] }); });
      return d;
    }));
  }
  libQ.addEventListener('input', drawLib);
  libQ.addEventListener('sav-clear', () => { libQ.value = ''; drawLib(); });
  drawLib();
  TL.lib = libPop; TL_ITEMS.push(['lib', 'shapes', t('shapes')]);
  addTool('connect', 'connector', t('tool_connect'), 'Alt+Shift+C', () => setTool('connect'));
  addTool('text', 'type', t('tool_text'), 'Alt+Shift+T', () => setTool('text'));
  // the other shapes of the library, each can have its own button in the dock too
  for (const k of BASIC) if (!QUICK.includes(k) && k !== 'text') addTool('shape:' + k, SHAPE_ICON[k], t('s_' + k), '', () => setTool('shape', k));
  const TL_DEF = ['select', 'hand', '|', ...QUICK.map((k) => 'shape:' + k), 'lib', '|', 'connect', 'text'];
  /** A bar as each person chose it (kept with the account): its list, in order, with '|' a separator, '_' a fixed space and
   *  '~' an adaptive one (SavOffice.bars); what it has at first when nothing was chosen. */
  const BARS = window.SavOffice?.bars;
  const barPick = (id, def, items) => (BARS ? BARS.pick(prefs().bars?.[id], def, items) : def);
  const barList = (id, def, items) => { const l = barPick(id, def, items); return BARS ? BARS.layout(l) : l; };
  const barEl = (k, map) => (k === '|' ? h('span.tsep.so-sep') : k === '_' ? h('i.bgap') : k === '~' ? h('span.spacer') : map[k]);
  const layoutTools = () => put(tools, barList('tools', TL_DEF, TL_ITEMS).map((k) => barEl(k, TL)));
  layoutTools();

  // ---------------------------------------------------------------- the panel of the selection
  const props = h('div.props');
  const sep = () => h('span.psep');
  const act = (ic, label, run, o = {}) => iconBtn(ic, label, run, { place: 'top', ...o });
  const seg = (label, value, opts, onpick) => { const g = h('sav-radio-group', { appearance: 'buttons', size: 'sm', value: String(value), 'aria-label': label }, opts.map(([v, ic, l]) => h('sav-radio', { value: String(v), title: l, 'aria-label': l }, ic[0] === '=' ? ic.slice(1) : icon(ic)))); g.addEventListener('change', () => onpick(g.value)); return g; };
  const colorBtn = (ic, label, value, onpick, list, none) => colorPop(label, value, onpick, { list, none, placement: 'top', trigger: h('sav-button.cbtn2', { size: 'sm', appearance: 'ghost', variant: 'neutral', square: true, icon: ic, label, style: `--c:${value || 'transparent'}` }) });
  const pop = (ic, label, body) => { const b = h('sav-button', { slot: 'trigger', size: 'sm', appearance: 'ghost', variant: 'neutral', square: true, icon: ic, label, title: label }); return h('sav-popover', { placement: 'top', 'sheet-on-mobile': true, heading: label, style: '--width:18rem' }, b, h('div.look', body)); };
  const sel1 = (label, value, opts, onpick, cls = '') => { const s = h('sav-select', { 'sheet-on-mobile': true, size: 'sm', value: String(value), 'aria-label': label, class: cls }, opts.map(([v, l]) => h('option', { value: String(v) }, l))); s.addEventListener('change', () => onpick(s.value)); return s; };
  const widths = (value, onpick) => { const g = h('sav-radio-group.szs', { appearance: 'buttons', size: 'sm', value: String(value), 'aria-label': t('width') }, WIDTHS.map((s) => h('sav-radio', { value: String(s), title: String(s), 'aria-label': String(s) }, h('span.lw', { style: `--w:${Math.max(1, Math.min(7, s))}px` })))); g.addEventListener('change', () => onpick(+g.value)); return g; };
  const HEAD_ICON = { none: 'minus', arrow: 'head-arrow', open: 'head-open', diamond: 'head-diamond', circle: 'head-circle', bar: 'head-bar', tri: 'head-tri', odiamond: 'head-odiamond', ocircle: 'head-ocircle', er1: 'head-er1', er01: 'head-er01', ern: 'head-ern', er0n: 'head-er0n' };
  /** The relation of the library a connector looks like (its heads, dash and route), or ''. */
  const relationOf = (e) => RELATIONS.find((id) => { const st = PRESETS.get(id).st; return (st.sa || 'none') === e.sa && (st.ea || 'arrow') === e.ea && (st.d || '') === e.d; }) || '';
  /** A photo for an org chart card: cut square, small enough to live in the diagram. */
  function pickPhoto(n) {
    const f = h('input', { type: 'file', accept: 'image/*' });
    f.addEventListener('change', async () => {
      const file = f.files[0];
      if (!file) return;
      try {
        const img = await createImageBitmap(file), q = Math.min(img.width, img.height), c = document.createElement('canvas');
        let url = '';
        for (const [px, k] of [[128, .82], [96, .7], [72, .6]]) {
          c.width = c.height = px;
          c.getContext('2d').drawImage(img, (img.width - q) / 2, (img.height - q) / 2, q, q, 0, 0, px, px);
          url = c.toDataURL('image/jpeg', k);
          if (url.length <= MAX_IMG) break;
        }
        const now = items.get(n.id);
        if (now && url.length <= MAX_IMG) change([[n.id, now, { ...now, img: url }]]);
      } catch { toast(t('err_photo'), 'danger'); }
    });
    f.click();
  }

  function textPanel(o, apply) {
    const bold = act('bold', t('bold'), (b) => { o.b = !o.b; b.on(o.b); apply({ b: o.b }); }, { kbd: 'Mod+B' }), ital = act('italic', t('italic'), (b) => { o.i = !o.i; b.on(o.i); apply({ i: o.i }); }, { kbd: 'Mod+I' });
    requestAnimationFrame(() => { bold.on(!!o.b); ital.on(!!o.i); });
    const near = FS.reduce((a, b) => (Math.abs(b - o.fs) < Math.abs(a - o.fs) ? b : a), FS[0]);
    return [h('span.flabel', t('font')), h('div.prow', sel1(t('font'), o.ff, Object.keys(FONTS).map((k) => [k, t('f_' + k)]), (ff) => apply({ ff }), 'grow'), sel1(t('font_size'), near, FS.map((s) => [s, String(s)]), (fs) => apply({ fs: +fs }))),
      h('div.prow', bold, ital, h('span.grow'), colorBtn('baseline', t('text_color'), o.tc, (tc) => tc && apply({ tc }), INKS)),
      o.al ? h('div.prow', seg(t('align'), o.al, [['left', 'align-left', t('al_left')], ['center', 'align-center', t('al_center')], ['right', 'align-right', t('al_right')]], (al) => apply({ al })), seg(t('valign'), o.va, [['top', 'align-top', t('va_top')], ['middle', 'align-middle', t('va_middle')], ['bottom', 'align-bottom', t('va_bottom')]], (va) => apply({ va }))) : null];
  }
  function arrangePanel(list) {
    const nodes = list.filter((i) => i.t === 'node');
    return [
      nodes.length > 1 ? [h('span.flabel', t('align_l')), h('div.prow', act('align-start-vertical', t('a_left'), () => alignSel('left')), act('align-center-vertical', t('a_center'), () => alignSel('center')), act('align-end-vertical', t('a_right'), () => alignSel('right')), act('align-start-horizontal', t('a_top'), () => alignSel('top')), act('align-center-horizontal', t('a_middle'), () => alignSel('middle')), act('align-end-horizontal', t('a_bottom'), () => alignSel('bottom')))] : null,
      nodes.length > 2 ? h('div.prow', btn(t('dist_h'), { size: 'sm', icon: 'distribute-h', onclick: () => distribute('h') }), btn(t('dist_v'), { size: 'sm', icon: 'distribute-v', onclick: () => distribute('v') })) : null,
      h('span.flabel', t('order')), h('div.prow', act('bring-to-front', t('front'), () => arrange('front'), { kbd: ']' }), act('arrow-up', t('forward'), () => arrange('up'), { kbd: 'Mod+]' }), act('arrow-down', t('backward'), () => arrange('down'), { kbd: 'Mod+[' }), act('send-to-back', t('back'), () => arrange('back'), { kbd: '[' })),
      h('div.prow', list.length > 1 ? btn(t('group'), { size: 'sm', icon: 'group', onclick: () => group(true) }) : null, list.some((i) => i.g) ? btn(t('ungroup'), { size: 'sm', icon: 'ungroup', onclick: () => group(false) }) : null,
        btn(t(list.every((i) => i.lk) ? 'unlock' : 'lock'), { size: 'sm', icon: list.every((i) => i.lk) ? 'lock-open' : 'lock', onclick: () => lock(!list.every((i) => i.lk)) })),
    ];
  }
  function buildProps() {
    const list = selItems(), kids = [];
    const nodes = list.filter((i) => i.t === 'node'), edges = list.filter((i) => i.t === 'edge');
    if (editing) {
      const i = items.get(editing.id);
      if (i) kids.push(...textPanel(i.t === 'node' ? { ...i } : { ...i, ff: 'sans', al: null }, (p) => { restyle(p); placeEditor(); }).filter(Boolean).map((x) => (Array.isArray(x) ? x : [x])).flat().filter((x) => x.localName !== 'span' || !x.classList.contains('flabel')));
    } else if (list.length) {
      if (nodes.length) {
        const n = nodes[0];
        // the shape can become another basic one, or one of the same library
        const kinds = [...new Set([...BASIC, ...(LIBRARIES.find((l) => l[0] === libOf(n.k))?.[1] || []).map((e) => e[1]).filter(Boolean), n.k])].filter((k) => SHAPES.includes(k));
        kids.push(sel1(t('shape'), n.k, kinds.map((k) => [k, t('s_' + k)]), (k) => restyle({ k }, (i) => i.t === 'node'), 'shsel'),
          colorBtn('fill', t('fill'), n.f, (f) => restyle({ f }, (i) => i.t === 'node'), FILLS, t('no_fill')),
          colorBtn('square-dashed', t('border'), n.c, (c) => restyle({ c, s: c && !n.s ? 2 : n.s }, (i) => i.t === 'node'), INKS, t('no_border')),
          pop('text-style', t('text_style'), textPanel({ ...n }, (p) => restyle(p, (i) => i.t === 'node'))),
          pop('line-style', t('line_style'), [h('span.flabel', t('width')), widths(n.s || 2, (s) => restyle({ s }, (i) => i.t === 'node')), h('span.flabel', t('dash')), seg(t('dash'), n.d || 'solid', [['solid', 'minus', t('d_solid')], ['dash', 'dash', t('d_dash')], ['dot', 'dot-line', t('d_dot')]], (d) => restyle({ d: d === 'solid' ? '' : d }, (i) => i.t === 'node'))]));
        // an org chart card: its photo (the initials when there is none)
        if (nodes.length === 1 && n.k === 'card') kids.push(n.img ? act('image-off', t('photo_remove'), () => restyle({ img: undefined }, (i) => i.t === 'node')) : act('image', t('photo_add'), () => pickPhoto(n)));
        if (nodes.length === 1 && COMPART.has(n.k)) kids.push(act('fit', t('fit_text'), () => restyle({ h: compH(n) }, (i) => i.id === n.id)));
      }
      if (edges.length) {
        const e = edges[0];
        if (nodes.length) kids.push(sep());
        kids.push(seg(t('route'), e.r, [['straight', 'route-straight', t('r_straight')], ['elbow', 'route-elbow', t('r_elbow')], ['curve', 'route-curve', t('r_curve')]], (r) => restyle({ r }, (i) => i.t === 'edge')),
          pop(HEAD_ICON[e.ea] || 'head-arrow', t('heads'), [h('span.flabel', t('relation')), sel1(t('relation'), relationOf(e), [['', t('rel_custom')], ...RELATIONS.map((id) => [id, t('s_' + id)])], (id) => { const pr = PRESETS.get(id); if (pr) restyle({ ...EDGE_DEF, c: e.c, s: e.s, ...pr.st, text: pr.st.text ?? e.text }, (i) => i.t === 'edge'); }),
            h('span.flabel', t('head_start')), seg(t('head_start'), e.sa, Object.entries(HEAD_ICON).map(([k, ic]) => [k, ic, t('h_' + k)]), (sa) => restyle({ sa }, (i) => i.t === 'edge')),
            h('span.flabel', t('head_end')), seg(t('head_end'), e.ea, Object.entries(HEAD_ICON).map(([k, ic]) => [k, ic, t('h_' + k)]), (ea) => restyle({ ea }, (i) => i.t === 'edge')),
            btn(t('swap'), { size: 'sm', icon: 'arrow-left-right', onclick: () => change(selItems().filter((i) => i.t === 'edge').map((i) => [i.id, i, { ...i, a: i.b, b: i.a, sa: i.ea, ea: i.sa }])) })]),
          colorBtn('palette', t('line_color'), e.c, (c) => c && restyle({ c }, (i) => i.t === 'edge'), INKS),
          pop('line-style', t('line_style'), [h('span.flabel', t('width')), widths(e.s, (s) => restyle({ s }, (i) => i.t === 'edge')), h('span.flabel', t('dash')), seg(t('dash'), e.d || 'solid', [['solid', 'minus', t('d_solid')], ['dash', 'dash', t('d_dash')], ['dot', 'dot-line', t('d_dot')]], (d) => restyle({ d: d === 'solid' ? '' : d }, (i) => i.t === 'edge')),
            h('span.flabel', t('label_size')), sel1(t('label_size'), FS.reduce((a, b) => (Math.abs(b - e.fs) < Math.abs(a - e.fs) ? b : a), FS[0]), FS.map((s) => [s, String(s)]), (fs) => restyle({ fs: +fs }, (i) => i.t === 'edge'))]));
      }
      kids.push(sep(), pop('layers', t('arrange'), arrangePanel(list)), act('copy-plus', t('duplicate_sel'), () => duplicate(), { kbd: 'Mod+D' }), act('trash', t('delete_sel'), () => removeSel(), { kbd: 'Del' }));
    } else if (tool === 'shape' || tool === 'text' || tool === 'connect') {
      kids.push(h('span.phint', t(tool === 'connect' ? 'hint_connect' : 'hint_shape')));
    }
    put(props, kids);
    props.hidden = !kids.length;
  }

  // ---------------------------------------------------------------- the look of the diagram
  function lookPanel() {
    const box = h('div.look');
    const set = (patch) => { Object.assign(settings, patch); lookDirty = true; applyLook(); queueSave(); fill(); };
    const fill = () => put(box,
      h('span.flabel', t('background')),
      (() => { const g = h('sav-radio-group.sws', { appearance: 'buttons', size: 'sm', value: settings.bg, 'aria-label': t('background') }, BACKS.map((c) => h('sav-radio', { value: c, title: c, 'aria-label': c }, h('span.sw', { style: `--c:${c}` })))); g.addEventListener('change', () => set({ bg: g.value })); return h('div.pgroup', g, colorPop(t('background'), settings.bg, (v) => v && set({ bg: v }), { list: BACKS, trigger: h('sav-button', { size: 'sm', appearance: 'ghost', variant: 'neutral', square: true, icon: 'palette', label: t('more') }) })); })(),
      h('div.prow', h('sav-switch', { checked: settings.grid || null, size: 'sm', onchange: (e) => set({ grid: e.currentTarget.checked }) }, t('grid'))),
      h('div.prow', h('sav-switch', { checked: settings.snap || null, size: 'sm', onchange: (e) => set({ snap: e.currentTarget.checked }) }, t('snap'))),
      h('sav-range', { label: t('grid_size'), min: 5, max: 60, step: 5, value: settings.gs, 'show-value': true, onchange: (e) => set({ gs: +e.currentTarget.value }) }),
      h('sav-divider'), btn(t('clear_diagram'), { icon: 'trash', size: 'sm', appearance: 'ghost', variant: 'danger', onclick: async () => { if (!items.size) return; if (await confirm(t('clear_diagram'), t('clear_diagram_t'), t('clear'))) change(all().map((i) => [i.id, i, null])); } }));
    fill();
    box.refresh = fill;
    return box;
  }
  const lookB = iconBtn('palette', t('diagram_look'), null, { kbd: '' });
  const lookPop = h('sav-popover', { placement: 'bottom-end', 'sheet-on-mobile': true, heading: t('diagram_look'), style: '--width:19rem' });
  lookB.slot = 'trigger';
  const look = lookPanel();
  lookPop.append(lookB, look);
  lookPop.addEventListener('sav-show', () => look.refresh());

  // ---------------------------------------------------------------- the minimap
  const map = h('div.minimap', { 'aria-label': t('minimap'), role: 'img' }), mapSvg = svgEl('svg', { width: '100%', height: '100%' });
  map.append(mapSvg);
  let mapRaf = 0, mapBox = null;
  function drawMap() {
    if (!showMap || mapRaf) return;
    mapRaf = requestAnimationFrame(() => {
      mapRaf = 0;
      map.hidden = !showMap || !items.size;
      if (map.hidden) return;
      const s = size(), [vx, vy] = toWorld(s.l, s.t), vw = s.w / V.z, vh = s.h / V.z, b = union(all(), get) || { x: vx, y: vy, w: vw, h: vh };
      const x = Math.min(b.x, vx), y = Math.min(b.y, vy), w = Math.max(b.x + b.w, vx + vw) - x, hh = Math.max(b.y + b.h, vy + vh) - y, pad = Math.max(w, hh) * .04;
      mapBox = { x: x - pad, y: y - pad, w: w + pad * 2, h: hh + pad * 2 };
      mapSvg.setAttribute('viewBox', `${r2(mapBox.x)} ${r2(mapBox.y)} ${r2(mapBox.w)} ${r2(mapBox.h)}`);
      mapSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      const sw = mapBox.w / 160;
      mapSvg.innerHTML = all().map((i) => { if (i.t === 'node') return `<rect x="${i.x}" y="${i.y}" width="${i.w}" height="${i.h}" rx="${sw * 2}" fill="${i.f || 'transparent'}" stroke="${i.c || (dark ? '#888' : '#999')}" stroke-width="${sw}"/>`; const g = route(i, get); return g ? `<polyline points="${sample(g).map((p) => p.map(r2).join(',')).join(' ')}" fill="none" stroke="${i.c}" stroke-width="${sw}"/>` : ''; }).join('')
        + `<rect class="mview" x="${r2(vx)}" y="${r2(vy)}" width="${r2(vw)}" height="${r2(vh)}" stroke-width="${sw * 1.5}"/>`;
    });
  }
  const mapGo = (e) => {
    if (!mapBox) return;
    const r = map.getBoundingClientRect(), k = Math.max(mapBox.w / r.width, mapBox.h / r.height), ox = (r.width - mapBox.w / k) / 2, oy = (r.height - mapBox.h / k) / 2;
    const wx = mapBox.x + (e.clientX - r.left - ox) * k, wy = mapBox.y + (e.clientY - r.top - oy) * k, s = size();
    V = { ...V, x: s.w / 2 - wx * V.z, y: s.h / 2 - wy * V.z };
    applyView();
  };
  map.addEventListener('pointerdown', (e) => { e.preventDefault(); map.setPointerCapture(e.pointerId); mapGo(e); const mv = (ev) => mapGo(ev), up = () => { map.removeEventListener('pointermove', mv); map.removeEventListener('pointerup', up); }; map.addEventListener('pointermove', mv); map.addEventListener('pointerup', up); });
  const toggleMap = () => { showMap = !showMap; savePref({ map: showMap }); map.hidden = !showMap; drawMap(); };

  // ---------------------------------------------------------------- the bar on top
  const undoB = iconBtn('undo-2', t('undo'), () => undo(), { kbd: 'Mod+Z' }), redoB = iconBtn('redo-2', t('redo'), () => redo(), { kbd: 'Mod+Shift+Z' });
  const whole = () => ({ title, settings, items: all() });
  // SavDrive: the cloud next to the grid of the apps saves this diagram into the drive (../assets/savoffice/savoffice.js)
  window.SavOffice?.exporter?.({ key: id, make: async () => { finishEdit(); const d = whole(), f = await import('./files.js'); return { blob: await f.makeSavdia(d), name: f.fileName(d.title, 'savdia') }; } });
  const exp = async (name) => { finishEdit(); const f = await import('./files.js'); if (!items.size && name !== 'saveSavdia') return toast(t('export_empty'), 'neutral'); try { await f[name](whole()); } catch (e) { fail(e); } };
  const dlList = [['file-down', t('save_savdia'), () => exp('saveSavdia')], '-', ['image', t('save_png'), () => exp('savePng')], ['file-image', t('save_svg'), () => exp('saveSvg')], ['file-text', t('save_pdf'), () => exp('savePdf')]];
  const downloadB = drop(h('sav-button', { icon: 'download', label: t('download_as'), title: t('download_as'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true }), dlList, { placement: 'bottom-end', label: t('download_as') });
  const layoutList = [['network', t('layout_down'), () => autoLayout('down')], ['git-fork', t('layout_right'), () => autoLayout('right')], ['brain', t('layout_both'), () => autoLayout('both')]];
  const layoutB = drop(h('sav-button', { icon: 'network', label: t('layout'), title: t('layout'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true }), layoutList, { placement: 'bottom-end', label: t('layout') });
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {});
  const insertFile = () => { const f = h('input', { type: 'file', accept: '.savdia,.drawio,.xml,.savwhi' }); f.addEventListener('change', async () => { if (!f.files[0]) return; try { const { readDiagramFile } = await import('./files.js'); pasteItems((await readDiagramFile(f.files[0])).items); } catch (e) { fail(e); } }); f.click(); };
  const moreList = () => [
    mobile() ? ['palette', t('diagram_look'), () => lookB.button.click()] : null,
    mobile() ? ['network', t('layout'), () => layoutB.querySelector('sav-button')?.click()] : null,
    ['mouse-pointer-2', t('select_all'), () => { setTool('select'); select(order); }, { kbd: 'Mod+A' }],
    ['clipboard-paste', t('paste'), () => pasteFromMenu(...toWorld(size().l + size().w / 2, size().t + size().h / 2)), { kbd: 'Mod+V' }],
    ['whiteboard', t('from_board'), async () => { const { pickBoard } = await import('./home.js'); const d = await pickBoard(); if (d) pasteItems(d.items); }],
    ['file-up', t('insert_file'), () => insertFile()],
    '-', ['map', t(showMap ? 'hide_map' : 'show_map'), () => toggleMap()], ['scan', t('zoom_fit'), () => fit(), { kbd: 'Shift+1' }], document.documentElement.requestFullscreen ? ['maximize', t(document.fullscreenElement ? 'exit_full' : 'full_screen'), fullscreen] : null,
    '-', !mobile() && BARS ? ['settings-2', BARS.menuLabel(), () => barsDialog()] : null, ['info', t('shortcuts'), () => shortcuts()],
  ];
  const moreB = drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more_tools'), title: t('more_tools'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true }), moreList, { placement: 'bottom-end', label: t('more_tools') });

  const titleIn = h('sav-input.dtitle', { value: title, maxlength: 160, size: 'sm', 'aria-label': t('rename'), spellcheck: 'false' });
  titleIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') titleIn.blur(); });
  const titleBox = h('div.wtitle', titleIn);
  const fitTitle = () => { titleBox.style.width = Math.round(Math.min(352, Math.max(96, measure(titleIn.value || t('untitled'), '600 15.7px Inter, system-ui, sans-serif') + 30))) + 'px'; };
  titleIn.addEventListener('input', fitTitle);
  fitTitle();
  document.fonts?.ready.then(() => { if (!gone) { fitTitle(); redrawAll(); drawOverlay(); } });
  titleIn.addEventListener('change', () => { const v = titleIn.value.trim(); if (!v) { titleIn.value = title; fitTitle(); return; } if (v === title) return; title = v; titleDirty = true; document.title = title + ' – SavDiagrams'; svg.setAttribute('aria-label', title); queueSave(300); });

  // the title bar: back, the logo and the title on the left, ⋮ and the account on the right (always); between them the list
  const backB = iconBtn('arrow-left', t('back_home'), () => go('#/')), brandA = h('a.wbrand', { href: '#/', title: 'SavDiagrams' }, h('img', { src: 'icons/favicon.svg', width: 26, height: 26, alt: '' })), accountEl = h('span.mhide', userMenu());
  const T2 = { undo: undoB, redo: redoB, look: h('span.lookw', lookPop), layout: h('span.lookw', layoutB), download: downloadB };
  const TITLE_ITEMS = [['undo', 'undo-2', t('undo')], ['redo', 'redo-2', t('redo')], ['look', 'palette', t('diagram_look')], ['layout', 'network', t('layout')], ['download', 'download', t('download_as')]];
  const TITLE_DEF = ['~', 'undo', 'redo', '|', 'look', 'layout', 'download'];
  const top = h('header.wtop');
  const layoutTitle = () => put(top, backB, brandA, titleBox, status, barList('title', TITLE_DEF, TITLE_ITEMS).map((k) => barEl(k, T2)), moreB, h('span.tsep.mhide'), accountEl);
  layoutTitle();
  /** Customising the bars (⋮ → Customise the bars): the window shared by the apps of SavOffice, a tab for each bar. */
  function barsDialog() {
    if (!BARS) return;
    BARS.dialog({ bars: [{ id: 'title', items: TITLE_ITEMS, def: TITLE_DEF, before: [['arrow-left', t('back_home')], [null, title]], after: [['ellipsis-vertical', t('more_tools')], ['layout-grid', 'SavOffice'], ['user', t('account')]] }, { id: 'tools', items: TL_ITEMS, def: TL_DEF }],
      value: { title: barPick('title', TITLE_DEF, TITLE_ITEMS), tools: barPick('tools', TL_DEF, TL_ITEMS) },
      save: async (v) => { await setPrefs({ bars: { ...(prefs().bars || {}), ...v } }); layoutTitle(); layoutTools(); } });
  }
  const zoom = h('div.zoom', iconBtn('zoom-out', t('zoom_out'), () => zoomTo(V.z / 1.25), { place: 'top', kbd: '-' }), zoomLabel, iconBtn('zoom-in', t('zoom_in'), () => zoomTo(V.z * 1.25), { place: 'top', kbd: '+' }), iconBtn('scan', t('zoom_fit'), () => fit(), { place: 'top', kbd: 'Shift+1' }));
  wrap.append(top, h('div.dock', props, tools), zoom, map);
  put(root, wrap);
  const asCmd = (list) => list.filter(Array.isArray).map(([ic, l, fn, o]) => [ic, l, fn, o?.kbd || null]);
  commands([t('tools'), [['mouse-pointer-2', t('tool_select'), () => setTool('select'), 'Alt+Shift+V'], ['hand', t('tool_hand'), () => setTool('hand'), 'Alt+Shift+H'], ['connector', t('tool_connect'), () => setTool('connect'), 'Alt+Shift+C'], ['type', t('tool_text'), () => setTool('text'), 'Alt+Shift+T'], ...[...PRESETS.values()].filter((p) => p.k && p.k !== 'text').map((p) => [SHAPE_ICON[p.id] || SHAPE_ICON[p.k] || 'shapes', t('s_' + p.id), () => setTool('shape', p.id)]), ...RELATIONS.map((id) => ['connector', t('s_' + id), () => { edgeKind = PRESETS.get(id); setTool('connect'); edgeKind = PRESETS.get(id); }])]],
    [t('more_tools'), [['undo-2', t('undo'), () => undo(), 'Mod+Z'], ['redo-2', t('redo'), () => redo(), 'Mod+Shift+Z'], ['palette', t('diagram_look'), () => lookB.button.click()], ...asCmd(layoutList), ...asCmd(moreList())]],
    [t('download_as'), asCmd(dlList)]);
  document.title = title + ' – SavDiagrams';
  setStatus('saved');

  function shortcuts() {
    const row = (k, l) => h('div.kb', h('span', l), h('kbd', K(k)));
    dialog({ title: t('shortcuts'), width: '36rem', body: h('div.kbs', row('Alt+Shift+V', t('tool_select')), row('Alt+Shift+H', t('tool_hand')), row('Alt+Shift+R', t('s_rect')), row('Alt+Shift+U', t('s_round')), row('Alt+Shift+D', t('s_diamond')), row('Alt+Shift+O', t('s_ellipse')), row('Alt+Shift+C', t('tool_connect')), row('Alt+Shift+T', t('tool_text')),
      row('Enter', t('edit_text')), row('Tab', t('add_child')), row('Mod+Enter', t('add_sibling')), row('Mod+Z', t('undo')), row('Mod+Shift+Z', t('redo')), row('Mod+A', t('select_all')), row('Mod+C', t('copy_sel')), row('Mod+X', t('cut_sel')), row('Mod+V', t('paste')), row('Mod+D', t('duplicate_sel')),
      row('Mod+G', t('group')), row('Mod+Shift+G', t('ungroup')), row('Mod+L', t('lock')), row(']', t('front')), row('[', t('back')), row('Del', t('delete_sel')), row('Shift+1', t('zoom_fit')), row('Shift+0', t('zoom_100')), row('+', t('zoom_in')), row('-', t('zoom_out')),
      h('p.muted.small', t('hint_pan'))) });
  }

  // ---------------------------------------------------------------- keyboard, clipboard, files dropped
  const typing = (e) => { const p = e.composedPath?.() || []; return p.some((x) => /^(input|textarea|select|sav-input|sav-select|sav-textarea|sav-number-input)$/.test(x.localName || '') || x.isContentEditable) || !!document.querySelector('sav-dialog[open]'); };
  const KEYS = { v: ['select'], h: ['hand'], c: ['connect'], t: ['text'], r: ['shape', 'rect'], u: ['shape', 'round'], d: ['shape', 'diamond'], o: ['shape', 'ellipse'] };
  function onKey(e) {
    if (gone || typing(e)) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (e.key === ' ' && !e.repeat) { spaceDown = true; wrap.classList.add('space'); e.preventDefault(); return; }
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 'a') { e.preventDefault(); setTool('select'); select(order); return; }
    if (mod && k === 'd') { e.preventDefault(); duplicate(); return; }
    if (mod && k === 'g') { e.preventDefault(); group(!e.shiftKey); return; }
    if (mod && k === 'l') { e.preventDefault(); lock(!selItems().every((i) => i.lk)); return; }
    if (mod && k === 's') { e.preventDefault(); flush(); return; }
    if (mod && k === '0') { e.preventDefault(); zoomTo(1); return; }
    if (mod && (k === '=' || k === '+')) { e.preventDefault(); zoomTo(V.z * 1.25); return; }
    if (mod && k === '-') { e.preventDefault(); zoomTo(V.z / 1.25); return; }
    if (mod && e.key === ']') { e.preventDefault(); arrange('up'); return; }
    if (mod && e.key === '[') { e.preventDefault(); arrange('down'); return; }
    if (mod && e.key === 'Enter') { const n = selNodes()[0]; if (n) { e.preventDefault(); addSibling(n); } return; }
    if (mod && (k === 'b' || k === 'i')) { const list = selNodes(); if (list.length) { e.preventDefault(); restyle({ [k]: !list[0][k] }, (i) => i.t === 'node'); } return; }
    if (mod) return;
    const one = sel.size === 1 ? selItems()[0] : null;
    if (e.key === 'Delete' || e.key === 'Backspace') { if (sel.size) { e.preventDefault(); removeSel(); } return; }
    if (e.key === 'Escape') { if (sel.size) select([]); else if (tool !== 'select') setTool('select'); return; }
    if ((e.key === 'Enter' || e.key === 'F2') && one) { e.preventDefault(); startEdit(one); return; }
    if (e.key === 'Tab' && one?.t === 'node') { e.preventDefault(); addChild(one); return; }
    if (e.key.startsWith('Arrow') && sel.size) {
      e.preventDefault();
      const d = e.shiftKey ? settings.gs : 1, dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
      change(selItems().filter((i) => !i.lk).map((i) => [i.id, i, i.t === 'node' ? moveNode(i, dx, dy) : shift([i], dx, dy)[0]]));
      return;
    }
    if (e.key === ']') return arrange('front');
    if (e.key === '[') return arrange('back');
    if (e.key === '+' || e.key === '=') return zoomTo(V.z * 1.25);
    if (e.key === '-' || e.key === '_') return zoomTo(V.z / 1.25);
    if (e.shiftKey && e.code === 'Digit1') return fit();
    if (e.shiftKey && e.code === 'Digit0') return zoomTo(1);
    // a tool: its letter with ⌥⇧ (Alt+Shift), never alone (read from the key: on a Mac ⌥ changes the character)
    const L = e.altKey && e.shiftKey && /^Key[A-Z]$/.test(e.code) ? e.code[3].toLowerCase() : null;
    if (L) { if (KEYS[L]) { e.preventDefault(); setTool(...KEYS[L]); } return; }
    // a letter typed on a selected shape starts writing its text
    if (one && e.key.length === 1 && !e.altKey) { e.preventDefault(); startEdit(one, e.key); return; }
  }
  const onKeyUp = (e) => { if (e.key === ' ') { spaceDown = false; wrap.classList.remove('space'); } };
  const onCopy = (e) => { if (gone || typing(e) || !sel.size) return; const d = copySel(e.type === 'cut'); if (d) { e.clipboardData.setData('text/plain', d); e.preventDefault(); } };
  const onPaste = (e) => { if (gone || typing(e)) return; const s = e.clipboardData?.getData('text/plain') || ''; if (!s) return; e.preventDefault(); pasteData(s); };
  const onDrop = async (e) => {
    e.preventDefault();
    const at = toWorld(e.clientX, e.clientY);
    for (const f of e.dataTransfer?.files || []) {
      if (/\.(savdia|drawio|xml|savwhi)$/i.test(f.name)) { try { const { readDiagramFile } = await import('./files.js'); pasteItems((await readDiagramFile(f)).items, at); } catch (x) { fail(x); } }
    }
  };
  wrap.addEventListener('dragover', (e) => e.preventDefault());
  wrap.addEventListener('drop', onDrop);
  const onResize = () => { drawGrid(); drawOverlay(); drawMap(); };
  const onHide = () => { if (document.visibilityState === 'hidden') { if (busy()) keepHere(); flush(true); } };
  const onUnload = (e) => { if (busy()) { keepHere(); flush(true); e.preventDefault(); e.returnValue = ''; } };
  if (server) {
    for (const x of items.keys()) dirty.add(x);
    for (const i of server.list) if (!items.has(i.id)) dirty.add(i.id);
    orderDirty = titleDirty = lookDirty = true;
    toast(getLang() === 'it' ? 'Le modifiche fatte senza rete vengono salvate ora.' : 'The changes made without a network are being saved now.', 'neutral');
    queueSave(400);
  }
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', onKeyUp);
  document.addEventListener('copy', onCopy);
  document.addEventListener('cut', onCopy);
  document.addEventListener('paste', onPaste);
  addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onHide);
  addEventListener('beforeunload', onUnload);

  // ---------------------------------------------------------------- start
  applyLook();
  setTool('select');
  buildProps();
  afterChange();
  map.hidden = !showMap;
  await customElements.whenDefined('sav-button');
  requestAnimationFrame(() => {
    const s = size();
    if (saved) { V = { x: saved.x + s.w / 2, y: saved.y + s.h / 2, z: saved.z }; applyView(); }
    else fit(undefined, false);
    viewDirty = false; clearTimeout(viewTimer);
    // a diagram made from a template, a file or a sketch has no small picture yet for the home: it gets one now
    if (!D.thumb && items.size) { thumbDirty = true; viewDirty = true; queueSave(1500); }
  });

  // a test hook for the browser checks, and for whoever wants to drive the editor from the console
  window.__savdia = { items, order, sel, change, select, autoLayout, addChild, startEdit, finishEdit, setTool, fit, get V() { return V; }, toScreen };

  return () => {
    window.SavOffice?.exporter?.(null);
    finishEdit();
    gone = true;
    flush(true);
    delete window.__savdia;
    removeEventListener('keydown', onKey);
    removeEventListener('keyup', onKeyUp);
    removeEventListener('blur', onKeyUp);
    document.removeEventListener('copy', onCopy);
    document.removeEventListener('cut', onCopy);
    document.removeEventListener('paste', onPaste);
    removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onHide);
    removeEventListener('beforeunload', onUnload);
    document.querySelector('.ctxm')?.remove();
  };
}
