/**
 * The board: an SVG as big as the window over a plane without edges. The view (x, y, z) says where the plane is: a point
 * of the board at (bx, by) is on screen at (bx·z + x, by·z + y). Sizes of the tools are chosen in pixels of the screen,
 * so a line drawn while zoomed in is finer on the board.
 *
 * Moving: two fingers (pinch to zoom), the middle button, the space bar, the hand, or the wheel (Ctrl/⌘ + wheel zooms).
 * With a stylus, fingers only move the board (palm rejection), switched on the first time a stylus touches it.
 * Every change goes into the history (undo/redo) and into the next save, which sends only what changed.
 */
import { btn, colorPop, confirm, dialog, drop, face, fail, h, icon, iconBtn, K, mobile, put, toast } from './ui.js';
import { getLang, t } from './i18n.js';
import { S, api } from './store.js';
import { commands, go, prefs, setPrefs, userMenu } from './account.js';
import { appsButton } from './office.js';
import { DEFS, NS, itemSVG, patternSVG } from './render.js';
import { LINE, bounds, cut, hits, layoutNote, measure, moved, overlaps, scaled, union } from './ink.js';
import { BACKS, FONTS, HIGHLIGHT, PAPERS, cleanItems, freshIds, inkOn, inksFor, isDark, r2, uid } from './model.js';
import { readSavwhi, savePdf, savePng, saveSavwhi, saveSvg, thumbnail, toServer } from './files.js';
import { pickPicture, uploadPicture } from './pictures.js';
import { keep as keepOff, take as takeOff, drop as dropOff } from '../../assets/savoffice/offline-keep.js';

const DEF = {
  pen: { c: '#1c1c1c', s: 4 }, pencil: { c: '#5f6660', s: 3 }, marker: { c: '#ffe14d', s: 24 }, eraser: { s: 28, mode: 'partial' },
  shape: { k: 'rect', c: '#1d4e89', s: 4, f: '', d: false }, text: { c: '#1c1c1c', fs: 32, ff: 'sans', b: false, al: 'left' }, note: { f: '#fff3a3' },
};
const SIZES = { pen: [2, 4, 7, 12, 20], pencil: [1.5, 3, 5, 8], marker: [12, 24, 36, 56], shape: [2, 4, 7, 12], eraser: [14, 28, 56, 100] };
const FS = [16, 24, 32, 48, 72, 120];
const TOOLS = [['select', 'mouse-pointer-2', 'V'], ['hand', 'hand', 'H'], ['pen', 'pen', 'P'], ['pencil', 'pencil', 'C'], ['marker', 'highlighter', 'M'], ['eraser', 'eraser', 'E'], ['laser', 'laser', 'L'], ['text', 'type', 'T'], ['note', 'sticky-note', 'N'], ['shape', 'square', 'R'], ['image', 'image', 'I']];
const SHAPE_ICONS = { rect: 'square', ellipse: 'circle', diamond: 'diamond', triangle: 'triangle', line: 'line', arrow: 'move-up-right' };
const svgEl = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** The positions a move carries (browsers group fast moves); the move itself when there are none. */
const coalesced = (e) => { const l = e.getCoalescedEvents?.(); return l?.length ? l : [e]; };

export async function boardScreen(root, id) {
  const r = await api('wb.get', undefined, { id });
  const B = r.board;
  if (B.trashed) { const e = new Error('not_found'); e.code = 'not_found'; throw e; }
  // changes made here without a network and kept in this browser (offline-keep.js): the board opens as it was left, and
  // they leave as soon as they can (below, after the saving is ready)
  if (window.SavOffice) window.SavOffice.offlineEdit = true;
  const kept = await takeOff('savwhiteboard', B.id), server = kept ? { list: B.list } : null;
  if (kept) Object.assign(B, { list: kept.list, title: kept.title, settings: kept.settings });
  let P = prefs();
  const opt = (k) => ({ ...DEF[k], ...(P.tools?.[k] || {}) });
  const setOpt = (k, patch) => { P = prefs(); setPrefs({ tools: { ...(P.tools || {}), [k]: { ...opt(k), ...patch } } }).catch(() => {}); P = prefs(); };

  // ---------------------------------------------------------------- state
  const items = new Map(), els = new Map();
  let order = [];
  for (const i of B.list) { items.set(i.id, i); order.push(i.id); }
  const settings = { ...B.settings };
  let title = B.title, version = B.version, dark = isDark(settings.bg);
  // a board shared with others: who may change it (owner, editor) or only look at it (viewer); the people on it now
  let role = B.role || 'owner', people = B.people || [], here = [];
  const canEdit = () => role !== 'viewer';
  const saved = settings.view ? { ...settings.view } : null; // kept around the centre of the window: it fits any size of screen
  let V = { x: 0, y: 0, z: 1 };
  let tool = TOOLS.some((x) => x[0] === P.tool) && P.tool !== 'laser' ? P.tool : 'pen';
  const sel = new Set();
  let hist = [], fut = [], editing = null, spaceDown = false, gone = false;

  // ---------------------------------------------------------------- the stage
  const svg = svgEl('svg', { class: 'stage', role: 'application', 'aria-label': title });
  const defs = svgEl('defs');
  defs.innerHTML = DEFS;
  const patHold = svgEl('g');
  defs.append(patHold);
  const bgRect = svgEl('rect', { width: '100%', height: '100%' }), patRect = svgEl('rect', { width: '100%', height: '100%', fill: 'url(#wbp)' });
  const world = svgEl('g'), itemsG = svgEl('g', { style: 'isolation:isolate' }), liveG = svgEl('g'), over = svgEl('g', { class: 'over' });
  world.append(itemsG, liveG);
  svg.append(defs, bgRect, patRect, world, over);

  const wrap = h('div.wb', svg);
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
    drawPattern();
    drawOverlay();
    placeEditor();
    zoomLabel.textContent = Math.round(V.z * 100) + '%';
    viewDirty = true;
    clearTimeout(viewTimer);
    viewTimer = setTimeout(() => queueSave(0), 2500);
  }
  function drawPattern() {
    patRect.style.display = settings.pat === 'none' ? 'none' : '';
    if (settings.pat === 'none') return;
    let k = 1;
    while (settings.gap * k * V.z < 11) k *= 2; // far away, one line in two (then four…): the watermark never turns into fog
    const sc = V.z * k, unit = clamp(Math.sqrt(V.z), .75, 1.35) / sc;
    patHold.innerHTML = patternSVG('wbp', settings, settings.gap, unit, `translate(${r2(V.x)} ${r2(V.y)}) scale(${sc})`);
  }
  function applyLook() {
    const was = dark;
    dark = isDark(settings.bg);
    bgRect.setAttribute('fill', settings.bg);
    wrap.classList.toggle('dark', dark);
    drawPattern();
    if (was !== dark) redrawAll();
    buildProps();
  }
  function zoomAt(cx, cy, factor) {
    const s = size(), z = clamp(V.z * factor, .05, 20), px = cx - s.l, py = cy - s.t;
    V = { x: px - (px - V.x) * (z / V.z), y: py - (py - V.y) * (z / V.z), z };
    applyView();
  }
  const zoomTo = (z) => { const s = size(); zoomAt(s.l + s.w / 2, s.t + s.h / 2, z / V.z); };
  function fit(box = union([...items.values()]), animate = true) {
    const s = size(), top = 70, bottom = mobile() ? 150 : 120;
    let to;
    if (!box) to = { x: s.w / 2, y: s.h / 2, z: 1 };
    else {
      const z = clamp(Math.min((s.w - 80) / Math.max(1, box.w), (s.h - top - bottom) / Math.max(1, box.h), 2), .05, 20);
      to = { x: s.w / 2 - (box.x + box.w / 2) * z, y: top + (s.h - top - bottom) / 2 - (box.y + box.h / 2) * z, z };
    }
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { V = to; return applyView(); }
    const from = { ...V }, t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / 260), e = 1 - (1 - k) ** 3; V = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: from.z * (to.z / from.z) ** e }; applyView(); if (k < 1 && !gone) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------- items on screen
  function el(i) { const g = svgEl('g', { 'data-id': i.id }); g.innerHTML = itemSVG(i, dark); if (editing?.id === i.id) g.style.visibility = 'hidden'; return g; }
  function draw(id) {
    const i = items.get(id), old = els.get(id);
    if (!i) { old?.remove(); els.delete(id); return; }
    const n = el(i);
    if (old) old.replaceWith(n); else itemsG.append(n);
    els.set(id, n);
  }
  function redrawAll() { els.clear(); itemsG.replaceChildren(...order.map((id) => { const n = el(items.get(id)); els.set(id, n); return n; })); }
  const restack = () => { for (const id of order) { const n = els.get(id); if (n) itemsG.append(n); } };

  // ---------------------------------------------------------------- changes, history, saving
  const dirty = new Set();
  let orderDirty = false, titleDirty = false, lookDirty = false;
  /** list: [[id, before | null, after | null]]; newOrder: the ids in a new order (front, back, pieces of the eraser). */
  function change(list, newOrder = null, record = true) {
    if (!canEdit()) return; // only to look at
    list = list.filter(([, b, a]) => b || a);
    if (!list.length && !newOrder) return;
    const ob = order.slice();
    for (const [id, , a] of list) { if (a) { if (!items.has(id)) order.push(id); items.set(id, a); } else items.delete(id); dirty.add(id); }
    if (list.some(([, , a]) => !a)) order = order.filter((x) => items.has(x));
    if (newOrder) { order = newOrder.filter((x) => items.has(x)); orderDirty = true; }
    for (const [id] of list) draw(id);
    if (newOrder) restack();
    if (record) { hist.push({ list, ob, oa: order.slice() }); if (hist.length > 300) hist.shift(); fut = []; }
    for (const x of [...sel]) if (!items.has(x)) sel.delete(x);
    queueSave();
    afterChange();
  }
  function travel(from, to, back) {
    const e = from.pop();
    if (!e) return;
    for (const [id, b, a] of e.list) { const v = back ? b : a; if (v) items.set(id, v); else items.delete(id); dirty.add(id); }
    order = (back ? e.ob : e.oa).filter((x) => items.has(x));
    for (const x of items.keys()) if (!order.includes(x)) order.push(x);
    orderDirty = true;
    for (const [id] of e.list) draw(id);
    restack();
    to.push(e);
    sel.clear();
    for (const [id] of e.list) if (items.has(id)) sel.add(id);
    queueSave();
    afterChange();
  }
  const undo = () => { finishEdit(); travel(hist, fut, true); };
  const redo = () => { finishEdit(); travel(fut, hist, false); };
  function afterChange() { undoB.button.disabled = !hist.length; redoB.button.disabled = !fut.length; drawOverlay(); buildProps(); }

  let saving = false, again = false, timer = 0, fails = 0, lastThumb = 0, thumbDirty = false;
  const setStatus = (k) => { status.dataset.k = k; status.replaceChildren(icon({ saved: 'cloud-check', saving: 'cloud-upload', wait: 'cloud-upload', error: 'cloud-off', offline: 'cloud-off' }[k]), h('span.lbl', t({ saved: 'saved', saving: 'saving', wait: 'saving', error: 'not_saved', offline: 'offline_wait' }[k]))); status.title = t({ saved: 'saved', saving: 'saving', wait: 'saving', error: 'not_saved', offline: 'offline_wait' }[k]); };
  function queueSave(delay = 900) {
    if (dirty.size || orderDirty || titleDirty || lookDirty) { thumbDirty = true; setStatus('wait'); }
    clearTimeout(timer);
    timer = setTimeout(() => flush(), delay);
  }
  async function flush(leaving = false) {
    clearTimeout(timer);
    if (saving) { again = true; return; }
    if (!dirty.size && !orderDirty && !titleDirty && !lookDirty && !viewDirty && !(leaving && thumbDirty)) { if (status.dataset.k !== 'error' && status.dataset.k !== 'offline') setStatus('saved'); return; }
    const put = [], del = [];
    for (const x of dirty) { const i = items.get(x); if (i) put.push(i); else del.push(x); }
    const body = { id: B.id, base: version, lang: getLang() };
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
      if (thumbDirty && (leaving || Date.now() - lastThumb > 15000)) { body.thumb = await thumbnail([...order.map((x) => items.get(x))], settings).catch(() => undefined); lastThumb = Date.now(); thumbDirty = false; }
      const res = await api('wb.save', body);
      version = res.version;
      fails = 0;
      if (!dirty.size && !orderDirty && !titleDirty && !lookDirty) dropOff('savwhiteboard', B.id); // everything left
      setStatus(dirty.size ? 'wait' : 'saved');
      const card = S.boards.find((b) => b.id === B.id);
      if (card) Object.assign(card, { title, version, items: items.size, bg: settings.bg, pat: settings.pat, updated: res.updated || card.updated }, body.thumb !== undefined ? { thumb: body.thumb } : {});
      if (res.stale && !dirty.size) await refresh();
    } catch (e) {
      for (const x of sent.dirty) dirty.add(x);
      orderDirty ||= sent.orderDirty; titleDirty ||= sent.titleDirty; lookDirty ||= sent.lookDirty; viewDirty ||= sent.viewDirty;
      if (body.thumb !== undefined) thumbDirty = true;
      fails++;
      setStatus(e.code === 'network' ? 'offline' : 'error');
      if (e.code === 'network') keepHere(); // no network: a copy stays in this browser, even if the page is closed
      if (e.code === 'board_big' || e.code === 'not_found' || e.code === 'unauthenticated') { fail(e); if (e.code !== 'board_big') return; }
      if (!gone) timer = setTimeout(() => flush(), Math.min(30000, 1500 * 2 ** fails));
    } finally {
      saving = false;
      if (again) { again = false; flush(leaving); }
    }
  }
  /** The board as it is here, kept in this browser until it can be saved. */
  const keepHere = () => keepOff('savwhiteboard', B.id, { title, settings: { ...settings }, list: order.map((x) => items.get(x)).filter(Boolean) });
  /** Someone else (or another window) saved this board: their items come here, and the ones changed here and not saved yet
   *  stay as they are (they leave with the next save; the server merges by item). quiet: from the news of the board. */
  async function refresh(quiet = false) {
    const r2_ = await api('wb.get', undefined, { id: B.id, quiet: 1 });
    const b = r2_.board, now = JSON.stringify(order.map((x) => items.get(x)));
    version = b.version;
    if (b.role) role = b.role;
    if (b.people) people = b.people;
    if (JSON.stringify(b.list) === now) return;
    const mine = new Map([...dirty].map((x) => [x, items.get(x)])), wasOrder = orderDirty ? order.slice() : null;
    items.clear(); order = [];
    for (const i of b.list) { items.set(i.id, i); order.push(i.id); }
    for (const [x, it] of mine) { if (it) { if (!items.has(x)) order.push(x); items.set(x, it); } else { items.delete(x); order = order.filter((y) => y !== x); } }
    if (wasOrder) order = [...wasOrder.filter((x) => items.has(x)), ...order.filter((x) => !wasOrder.includes(x))];
    for (const x of [...sel]) if (!items.has(x)) sel.delete(x);
    redrawAll(); afterChange();
    if (!quiet) toast(t('stale'), 'neutral');
  }
  /** The news of the board, every few seconds while it is on screen: when its version changed, the others' changes come in;
   *  and who is on it now (their faces in the title bar). Not while writing a text (it would move under the caret). */
  let pollT = 0, polling = false, windows = 1;
  // this window among the others open on the board (the same person on two devices counts twice)
  const client = uid().slice(0, 12);
  async function poll() {
    clearTimeout(pollT);
    if (gone) return;
    if (!document.hidden && !polling && S.user && navigator.onLine) {
      polling = true;
      try {
        const r = await api('wb.poll', { id: B.id, client }).catch(() => null);
        if (r) {
          here = r.here || []; windows = r.windows || 1; drawHere();
          if (r.role && r.role !== role) { role = r.role; applyRole(); }
          if (r.version !== version && !editing && !saving && !dirty.size && !orderDirty) await refresh(true);
        }
      } catch { /* the next time */ } finally { polling = false; }
    }
    // quicker while someone else, or this person on another device, has it open too
    pollT = setTimeout(poll, here.length > 1 || windows > 1 ? 2000 : people.length > 1 ? 3500 : 6000);
  }


  // ---------------------------------------------------------------- selection overlay
  const selItems = () => [...sel].map((x) => items.get(x)).filter(Boolean);
  /** The size of the eraser just chosen: its circle for a moment in the middle of the window. */
  let flashT = 0;
  function showEraser() {
    if (action) return;
    const s = size(), at = (eraserAt = Object.assign([s.w / 2, s.h / 2], { flash: true }));
    drawOverlay();
    clearTimeout(flashT);
    flashT = setTimeout(() => { if (eraserAt === at) { eraserAt = null; drawOverlay(); } }, 1100);
  }
  function drawOverlay() {
    over.replaceChildren();
    if (marquee) {
      const [x0, y0] = toScreen(marquee.x0, marquee.y0), [x1, y1] = toScreen(marquee.x1, marquee.y1);
      over.append(svgEl('rect', { class: 'marq', x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) }));
    }
    if (eraserAt && tool === 'eraser') {
      const [x, y] = eraserAt, r = opt('eraser').s / 2;
      over.append(svgEl('circle', { class: 'ercur' + (eraserAt.flash ? ' flash' : ''), cx: x, cy: y, r }));
      // a finger covers the circle under it: the same circle again above the finger, joined to it, shows its size
      if (eraserAt.touch) { const gy = y - r * 2 - 56; over.append(svgEl('line', { class: 'erlink', x1: x, y1: y - r, x2: x, y2: gy + r }), svgEl('circle', { class: 'ercur ghost', cx: x, cy: gy, r })); }
    }
    if (laser.length > 1) over.append(laserPath());
    const list = selItems();
    if (!list.length || (editing && list.length === 1 && list[0].id === editing.id)) return;
    if (list.length === 1 && list[0].t === 'shape' && (list[0].k === 'line' || list[0].k === 'arrow')) {
      const i = list[0], [ax, ay] = toScreen(i.x, i.y), [bx, by] = toScreen(i.x + i.w, i.y + i.h);
      over.append(svgEl('line', { class: 'selbox', x1: ax, y1: ay, x2: bx, y2: by }), svgEl('circle', { class: 'hd', 'data-h': 'a', cx: ax, cy: ay, r: 6 }), svgEl('circle', { class: 'hd', 'data-h': 'b', cx: bx, cy: by, r: 6 }));
      return;
    }
    const b = union(list), [x0, y0] = toScreen(b.x, b.y), [x1, y1] = toScreen(b.x + b.w, b.y + b.h);
    over.append(svgEl('rect', { class: 'selbox', x: x0 - 4, y: y0 - 4, width: x1 - x0 + 8, height: y1 - y0 + 8 }));
    for (const [k, x, y] of [['nw', x0 - 4, y0 - 4], ['ne', x1 + 4, y0 - 4], ['se', x1 + 4, y1 + 4], ['sw', x0 - 4, y1 + 4]]) over.append(svgEl('rect', { class: 'hd', 'data-h': k, x: x - 6, y: y - 6, width: 12, height: 12, rx: 3 }));
  }
  function select(ids, add = false) { if (!add) sel.clear(); for (const x of ids) sel.add(x); drawOverlay(); buildProps(); }

  // ---------------------------------------------------------------- laser
  let laser = [], laserRaf = 0;
  function laserPath() {
    const now = performance.now(), g = svgEl('g', { class: 'laser' });
    for (let k = 1; k < laser.length; k++) {
      const a = laser[k - 1], b = laser[k], age = (now - b.t) / 700;
      if (age >= 1) continue;
      g.append(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'stroke-width': 6 * (1 - age) + 2, opacity: 1 - age }));
    }
    const e = laser[laser.length - 1];
    if (now - e.t < 700) g.append(svgEl('circle', { cx: e.x, cy: e.y, r: 5 }));
    return g;
  }
  function laserTick() {
    const now = performance.now();
    laser = laser.filter((p) => now - p.t < 700);
    drawOverlay();
    laserRaf = laser.length && !gone ? requestAnimationFrame(laserTick) : 0;
  }
  const laserAdd = (cx, cy) => { const s = size(); laser.push({ x: cx - s.l, y: cy - s.t, t: performance.now() }); if (!laserRaf) laserRaf = requestAnimationFrame(laserTick); };

  // ---------------------------------------------------------------- tools
  let action = null, marquee = null, eraserAt = null;
  const pointers = new Map();
  let gesture = null;
  const topAt = (x, y, tol) => { for (let k = order.length - 1; k >= 0; k--) { const i = items.get(order[k]); if (i && hits(i, x, y, tol)) return i; } return null; };
  const tol = () => 6 / V.z;
  const smooth = () => clamp(P.smooth ?? .45, 0, .85);

  function strokeAction(e, kind) {
    const o = opt(kind), item = { id: uid(), t: 'stroke', tool: kind, c: kind === 'marker' ? o.c : inkOn(o.c, settings.bg), s: r2(o.s / V.z), p: [] };
    const live = svgEl('g');
    liveG.append(live);
    let last = null, lastT = e.timeStamp, sim = .55, raf = 0, raw = null;
    const add = (ev) => {
      const [wx, wy] = toWorld(ev.clientX, ev.clientY);
      raw = [wx, wy];
      let pr = .5;
      if (kind !== 'marker') {
        if (ev.pointerType === 'pen' && P.pressure !== false && ev.pressure > 0) pr = clamp(ev.pressure, .05, 1);
        else if (last) { const d = Math.hypot(wx - last[0], wy - last[1]) * V.z, dt = Math.max(1, ev.timeStamp - lastT), v = d / dt; sim = sim * .75 + clamp(.78 - v * .16, .2, .8) * .25; pr = sim; }
        else pr = sim;
      }
      let x = wx, y = wy;
      if (last) {
        if (Math.hypot(wx - last[0], wy - last[1]) * V.z < 1.1) return;
        const k = 1 - smooth() * .7; // follows the pointer a little behind: the hand trembles less
        x = last[0] + (wx - last[0]) * k; y = last[1] + (wy - last[1]) * k;
      }
      item.p.push(r2(x), r2(y), r2(pr));
      last = [x, y];
      lastT = ev.timeStamp;
    };
    // the stroke on screen while it is drawn, in pieces: only the last one is drawn again at every frame (a long stroke was
    // drawn whole sixty times a second, slower and slower); a full piece stays as it is and the next one starts on its end
    let tail = svgEl('g'), from = 0;
    live.append(tail);
    const piece = (a, b) => itemSVG({ ...item, p: item.p.slice(a * 3, b * 3), _ts: a > 0, _te: b < item.p.length / 3 }, dark);
    const paint = () => {
      raf = 0;
      const n = item.p.length / 3;
      if (kind !== 'marker' && n - from > 120) { tail.innerHTML = piece(from, n); from = n - 2; tail = svgEl('g'); live.append(tail); }
      tail.innerHTML = itemSVG({ ...item, p: item.p.slice(from * 3), _ts: from > 0 }, dark);
    };
    add(e);
    paint();
    return {
      id: e.pointerId,
      move(ev) { for (const c of coalesced(ev)) add(c); if (!raf) raf = requestAnimationFrame(paint); },
      up() {
        cancelAnimationFrame(raf);
        if (raw && last && Math.hypot(raw[0] - last[0], raw[1] - last[1]) * V.z > .6) item.p.push(r2(raw[0]), r2(raw[1]), item.p[item.p.length - 1]);
        live.remove();
        if (item.p.length) change([[item.id, null, item]]);
      },
      cancel() { cancelAnimationFrame(raf); live.remove(); },
    };
  }

  function eraserAction(e) {
    const o = opt('eraser'), r = o.s / 2 / V.z, before = new Map(), created = new Set();
    let last = null;
    // what the eraser changed is drawn once per frame (it may cut the same stroke many times between two frames)
    const redraw = new Set();
    let drawRaf = 0, reorder = false;
    const later = (x2) => { redraw.add(x2); if (!drawRaf) drawRaf = requestAnimationFrame(flush); };
    function flush() { cancelAnimationFrame(drawRaf); drawRaf = 0; for (const x2 of redraw) draw(x2); redraw.clear(); if (reorder) { reorder = false; restack(); } }
    const at = (x, y) => {
      for (let k = order.length - 1; k >= 0; k--) {
        const idk = order[k], i = items.get(idk);
        if (!i) continue;
        const b = bounds(i);
        if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) continue;
        if (i.t === 'stroke' && o.mode !== 'whole') {
          const runs = cut(i, x, y, r);
          if (!runs) continue;
          if (!before.has(idk) && !created.has(idk)) before.set(idk, i);
          const pieces = runs.filter((p) => p.length >= 3);
          if (pieces.length) items.set(idk, { ...i, p: pieces[0] }); else items.delete(idk);
          const extra = pieces.slice(1).map((p) => ({ ...i, id: uid(), p }));
          order.splice(k + 1, 0, ...extra.map((x2) => x2.id));
          for (const x2 of extra) { items.set(x2.id, x2); created.add(x2.id); }
          if (!pieces.length) order.splice(k, 1);
          later(idk);
          for (const x2 of extra) later(x2.id);
          if (extra.length) reorder = true;
        } else if (hits(i, x, y, r)) {
          if (!before.has(idk) && !created.has(idk)) before.set(idk, i);
          items.delete(idk); order.splice(k, 1); later(idk);
        }
      }
    };
    const step = (ev) => {
      const [x, y] = toWorld(ev.clientX, ev.clientY);
      if (last) { const d = Math.hypot(x - last[0], y - last[1]), n = Math.ceil(d / (r * .5)); for (let k = 1; k <= n; k++) at(last[0] + (x - last[0]) * k / n, last[1] + (y - last[1]) * k / n); } else at(x, y);
      last = [x, y];
    };
    step(e);
    { const sz = size(); eraserAt = Object.assign([e.clientX - sz.l, e.clientY - sz.t], { touch: e.pointerType === 'touch' }); drawOverlay(); }
    return {
      id: e.pointerId,
      move(ev) { for (const c of coalesced(ev)) step(c); },
      up() {
        flush();
        const list = [...before].map(([k, b]) => [k, b, items.get(k) || null]).concat([...created].map((k) => [k, null, items.get(k) || null]));
        // what the eraser did is already on screen: it goes into the history and the save as one change
        const ord = order.slice();
        for (const [k, b] of before) { items.set(k, b); }
        for (const k of created) items.delete(k);
        order = order.filter((x) => items.has(x));
        for (const [k] of before) if (!order.includes(k)) order.push(k);
        change(list, ord);
        // lifted: the circle stays a moment where the finger was, then goes (a mouse or a stylus keep it while hovering)
        if (eraserAt?.touch) { const was = eraserAt; setTimeout(() => { if (eraserAt === was && !action) { eraserAt = null; drawOverlay(); } }, 550); }
      },
      cancel() { this.up(); },
    };
  }

  function shapeAction(e) {
    const o = opt('shape'), [x0, y0] = toWorld(e.clientX, e.clientY), live = svgEl('g');
    liveG.append(live);
    const item = { id: uid(), t: 'shape', k: o.k, x: r2(x0), y: r2(y0), w: 0, h: 0, c: inkOn(o.c, settings.bg), s: r2(o.s / V.z), f: o.f, d: !!o.d };
    let moved_ = false;
    const upd = (ev) => {
      let [x, y] = toWorld(ev.clientX, ev.clientY), w = x - x0, hh = y - y0;
      if (Math.hypot(w, hh) * V.z > 4) moved_ = true;
      const line = o.k === 'line' || o.k === 'arrow';
      if (ev.shiftKey) {
        if (line) { const a = Math.round(Math.atan2(hh, w) / (Math.PI / 4)) * (Math.PI / 4), L = Math.hypot(w, hh); w = Math.cos(a) * L; hh = Math.sin(a) * L; }
        else { const m = Math.max(Math.abs(w), Math.abs(hh)); w = Math.sign(w || 1) * m; hh = Math.sign(hh || 1) * m; }
      }
      if (line) Object.assign(item, { x: r2(x0), y: r2(y0), w: r2(w), h: r2(hh) });
      else Object.assign(item, { x: r2(Math.min(x0, x0 + w)), y: r2(Math.min(y0, y0 + hh)), w: r2(Math.abs(w)), h: r2(Math.abs(hh)) });
      live.innerHTML = itemSVG(item, dark);
    };
    return {
      id: e.pointerId,
      move: upd,
      up() {
        live.remove();
        if (!moved_) { const w = 160 / V.z, hh = (o.k === 'line' || o.k === 'arrow' ? 0 : 110) / V.z; Object.assign(item, o.k === 'line' || o.k === 'arrow' ? { x: r2(x0 - w / 2), y: r2(y0), w: r2(w), h: 0 } : { x: r2(x0 - w / 2), y: r2(y0 - hh / 2), w: r2(w), h: r2(hh) }); }
        change([[item.id, null, item]]);
      },
      cancel() { live.remove(); },
    };
  }

  function selectAction(e) {
    const [x, y] = toWorld(e.clientX, e.clientY), handle = e.target?.dataset?.h;
    if (handle) return resizeAction(e, handle);
    const hit = topAt(x, y, tol());
    if (!hit) {
      if (!e.shiftKey) select([]);
      marquee = { x0: x, y0: y, x1: x, y1: y };
      const base = new Set(sel);
      return {
        id: e.pointerId,
        move(ev) { const [a, b] = toWorld(ev.clientX, ev.clientY); marquee.x1 = a; marquee.y1 = b; const box = { x: Math.min(marquee.x0, a), y: Math.min(marquee.y0, b), w: Math.abs(a - marquee.x0), h: Math.abs(b - marquee.y0) }; sel.clear(); for (const k of base) sel.add(k); for (const k of order) if (overlaps(bounds(items.get(k)), box)) sel.add(k); drawOverlay(); },
        up() { marquee = null; drawOverlay(); buildProps(); },
        cancel() { marquee = null; drawOverlay(); },
      };
    }
    const wasSel = sel.has(hit.id);
    if (e.shiftKey) { if (!wasSel) select([hit.id], true); } else if (!wasSel) select([hit.id]);
    const start = new Map(selItems().map((i) => [i.id, i]));
    let dx = 0, dy = 0, did = false;
    return {
      id: e.pointerId,
      move(ev) {
        const [a, b] = toWorld(ev.clientX, ev.clientY);
        dx = a - x; dy = b - y;
        if (!did && Math.hypot(dx, dy) * V.z < 3) return;
        did = true;
        for (const [k, i] of start) { items.set(k, moved(i, dx, dy)); draw(k); }
        drawOverlay();
      },
      up() {
        if (!did) { if (e.shiftKey && wasSel) { sel.delete(hit.id); drawOverlay(); buildProps(); } return; }
        change([...start].map(([k, i]) => [k, i, moved(i, dx, dy)]));
      },
      cancel() { for (const [k, i] of start) { items.set(k, i); draw(k); } drawOverlay(); },
    };
  }

  function resizeAction(e, handle) {
    const list = selItems(), start = new Map(list.map((i) => [i.id, i]));
    if (handle === 'a' || handle === 'b') {
      const i = list[0];
      return {
        id: e.pointerId,
        move(ev) { let [x, y] = toWorld(ev.clientX, ev.clientY); const n = handle === 'a' ? { ...i, x: r2(x), y: r2(y), w: r2(i.x + i.w - x), h: r2(i.y + i.h - y) } : { ...i, w: r2(x - i.x), h: r2(y - i.y) }; items.set(i.id, n); draw(i.id); drawOverlay(); },
        up() { change([[i.id, i, items.get(i.id)]]); },
        cancel() { items.set(i.id, i); draw(i.id); drawOverlay(); },
      };
    }
    const b = union(list), ox = handle.includes('w') ? b.x + b.w : b.x, oy = handle.includes('n') ? b.y + b.h : b.y;
    const keep = list.some((i) => i.t === 'image' || i.t === 'text') || list.length > 1;
    let last = null;
    return {
      id: e.pointerId,
      move(ev) {
        const [x, y] = toWorld(ev.clientX, ev.clientY);
        let sx = Math.abs(x - ox) / Math.max(1e-6, b.w), sy = Math.abs(y - oy) / Math.max(1e-6, b.h);
        if (keep || ev.shiftKey) sx = sy = Math.max(sx, sy);
        sx = Math.max(sx, .02); sy = Math.max(sy, .02);
        const fx = handle.includes('w') ? -1 : 1, fy = handle.includes('n') ? -1 : 1;
        last = [];
        for (const [k, i] of start) { const n = scaled(i, ox, oy, sx * (x - ox >= 0 ? 1 : -1) * fx * fx, sy * (y - oy >= 0 ? 1 : -1) * fy * fy); last.push([k, i, n]); items.set(k, n); draw(k); }
        drawOverlay();
      },
      up() { if (last) change(last); },
      cancel() { for (const [k, i] of start) { items.set(k, i); draw(k); } drawOverlay(); },
    };
  }

  function placeAction(e, kind) {
    // a press without moving: a text or a note where it was
    const [x, y] = toWorld(e.clientX, e.clientY), sx = e.clientX, sy = e.clientY;
    return {
      id: e.pointerId,
      move() {},
      up(ev) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) return;
        if (kind === 'text') {
          const hit = topAt(x, y, tol());
          if (hit && (hit.t === 'text' || hit.t === 'note')) return startEdit(hit);
          const o = opt('text'), fs = r2(o.fs / V.z);
          startEdit({ id: uid(), t: 'text', x: r2(x), y: r2(y - fs * .62), w: 0, text: '', c: inkOn(o.c, settings.bg), fs, ff: o.ff, al: o.al, b: !!o.b }, true);
        } else {
          const hit = topAt(x, y, tol());
          if (hit?.t === 'note') return startEdit(hit);
          const w = r2(220 / V.z);
          startEdit({ id: uid(), t: 'note', x: r2(x - w / 2), y: r2(y - w / 2), w, h: w, text: '', f: opt('note').f, c: '#1c1c1c', fs: r2(22 / V.z) }, true);
        }
      },
      cancel() {},
    };
  }

  // ---------------------------------------------------------------- typing on the board
  let editor = null;
  function startEdit(item, isNew = false) {
    finishEdit();
    setToolQuiet(item.t === 'note' ? 'note' : 'text');
    editing = { id: item.id, item, isNew };
    els.get(item.id)?.style.setProperty('visibility', 'hidden');
    sel.clear(); sel.add(item.id); drawOverlay();
    const ta = h('textarea.ted', { spellcheck: 'true', placeholder: t('type_here'), 'aria-label': t(item.t === 'note' ? 'tool_note' : 'tool_text') });
    ta.value = item.text;
    ta.classList.toggle('note', item.t === 'note');
    editor = ta;
    wrap.append(ta);
    placeEditor();
    ta.addEventListener('input', () => placeEditor());
    ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); finishEdit(); } });
    ta.addEventListener('blur', () => setTimeout(() => { if (editor === ta && document.activeElement !== ta) finishEdit(); }, 120));
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
    buildProps();
  }
  function placeEditor() {
    if (!editor || !editing) return;
    const i = { ...editing.item, text: editor.value }, s = editor.style, [x, y] = toScreen(i.x, i.y);
    s.left = x + 'px'; s.top = y + 'px';
    if (i.t === 'note') {
      const m = layoutNote(i);
      Object.assign(s, { width: i.w * V.z + 'px', height: i.h * V.z + 'px', padding: m.pad * V.z + 'px', font: `400 ${i.fs * V.z}px/${LINE} ${FONTS.sans}`, color: i.c, background: i.f });
    } else {
      Object.assign(s, { font: `${i.b ? 700 : 400} ${i.fs * V.z}px/${LINE} ${FONTS[i.ff]}`, color: i.c, textAlign: i.al, height: 'auto' });
      s.width = i.w ? i.w * V.z + 'px' : '2em';
      if (!i.w) { s.width = '0'; s.width = Math.max(i.fs * V.z * .8, editor.scrollWidth + 4) + 'px'; }
      s.height = '0'; s.height = editor.scrollHeight + 'px';
    }
  }
  function finishEdit() {
    if (!editing) return;
    const { id: eid, item, isNew } = editing, text = editor.value.replace(/\s+$/, '');
    editor.remove(); editor = null; editing = null;
    els.get(eid)?.style.removeProperty('visibility');
    if (!text && (item.t === 'text' || isNew)) { if (!isNew) change([[eid, item, null]]); else { sel.delete(eid); drawOverlay(); } }
    else if (isNew) change([[eid, null, { ...item, text }]]);
    else if (text !== item.text) change([[eid, item, { ...items.get(eid), text }]]);
    else drawOverlay();
    buildProps();
  }

  // ---------------------------------------------------------------- pointers
  function cancelAction() { action?.cancel(); action = null; }
  let penUp = -1e9;
  const penDown = () => [...pointers.values()].some((q) => q.type === 'pen');
  const touchList = () => [...pointers.values()].filter((p) => p.type === 'touch');
  function startPinch() {
    const [a, b] = touchList();
    gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, v: { ...V } };
  }
  // a long press of a stylus or a finger is not a right click: browsers turn it into "contextmenu" (and select text),
  // which picked the item under the pen and opened a menu while writing
  let lastType = 'mouse';
  const drawing = () => !['select', 'hand'].includes(tool);
  function onDown(e) {
    lastType = e.pointerType || 'mouse';
    if (e.button === 2) return;
    if (e.pointerType !== 'mouse' && drawing()) e.preventDefault();
    // drawing: no text field keeps the focus, or the iPad would take the Pencil for handwriting into it (Scribble)
    if (e.pointerType === 'pen' && drawing() && document.activeElement?.closest?.('input, textarea, [contenteditable="true"], sav-input, sav-textarea') && document.activeElement !== editor) document.activeElement.blur();
    if (editing && e.target !== editor) { finishEdit(); if (tool === 'text' || tool === 'note') return; } // that press only closed the writing
    // palm rejection: while a pen writes (and just after), fingers and the palm are ignored, so they neither scroll nor stop
    // the stroke; a pen that lands while the palm is already down (the hand rested first) takes over instead of being dropped
    if (e.pointerType === 'touch' && (penDown() || performance.now() - penUp < 400)) { e.preventDefault(); return; }
    if (e.pointerType === 'pen' && gesture) { gesture = null; for (const [id, q] of pointers) if (q.type === 'touch') pointers.delete(id); wrap.classList.remove('panning'); }
    try { svg.setPointerCapture(e.pointerId); } catch { /* gone */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (e.pointerType === 'pen' && !P.penOnly) { setPrefs({ penOnly: true }).catch(() => {}); P = prefs(); markDraw(); toast(t('stylus_seen'), 'neutral'); }
    if (e.pointerType === 'touch' && touchList().length >= 2) { cancelAction(); startPinch(); return; }
    if (e.pointerType === 'touch' && P.penOnly && tool !== 'select' && tool !== 'hand') { gesture = { kind: 'pan', id: e.pointerId, x: e.clientX, y: e.clientY }; return; }
    if (e.button === 1 || spaceDown || tool === 'hand') { e.preventDefault(); gesture = { kind: 'pan', id: e.pointerId, x: e.clientX, y: e.clientY }; wrap.classList.add('panning'); return; }
    if (gesture) return;
    if (tool === 'laser') { laserAdd(e.clientX, e.clientY); action = { id: e.pointerId, move(ev) { for (const c of coalesced(ev)) laserAdd(c.clientX, c.clientY); }, up() {}, cancel() {} }; return; }
    if (tool === 'pen' || tool === 'pencil' || tool === 'marker') action = strokeAction(e, tool);
    else if (tool === 'eraser') action = eraserAction(e);
    else if (tool === 'shape') action = shapeAction(e);
    else if (tool === 'text' || tool === 'note') action = placeAction(e, tool);
    else if (tool === 'select') action = selectAction(e);
    else if (tool === 'image') { pickImage(toWorld(e.clientX, e.clientY)); }
  }
  function onMove(e) {
    const p = pointers.get(e.pointerId);
    // the circle of the eraser follows the mouse and the stylus (hovering or erasing) and a finger while it erases
    if (tool === 'eraser' && (e.pointerType !== 'touch' || (action && action.id === e.pointerId))) { const s = size(); eraserAt = Object.assign([e.clientX - s.l, e.clientY - s.t], { touch: e.pointerType === 'touch' }); drawOverlay(); }
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (gesture?.kind === 'pinch') {
      const t2 = touchList();
      if (t2.length < 2) return;
      const [a, b] = t2, d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, s = size(), g = gesture;
      const z = clamp(g.v.z * d / g.d, .05, 20), px = g.mx - s.l, py = g.my - s.t;
      V = { z, x: mx - s.l - (px - g.v.x) * (z / g.v.z), y: my - s.t - (py - g.v.y) * (z / g.v.z) };
      applyView();
      return;
    }
    if (gesture?.kind === 'pan' && gesture.id === e.pointerId) { V = { ...V, x: V.x + e.clientX - gesture.x, y: V.y + e.clientY - gesture.y }; gesture.x = e.clientX; gesture.y = e.clientY; applyView(); return; }
    if (action && action.id === e.pointerId) action.move(e);
  }
  function onUp(e) {
    if (pointers.get(e.pointerId)?.type === 'pen') penUp = performance.now();
    pointers.delete(e.pointerId);
    if (gesture?.kind === 'pinch') { if (touchList().length < 2) gesture = null; return; }
    if (gesture?.kind === 'pan' && gesture.id === e.pointerId) { gesture = null; wrap.classList.remove('panning'); return; }
    if (action && action.id === e.pointerId) { const a = action; action = null; if (e.type === 'pointercancel') a.cancel(); else a.up(e); }
  }
  svg.addEventListener('pointerdown', onDown);
  wrap.addEventListener('selectstart', (e) => { const el = e.target?.nodeType === 3 ? e.target.parentElement : e.target; if (!el?.closest?.('textarea, input, [contenteditable]')) e.preventDefault(); });
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') { eraserAt = null; drawOverlay(); } });
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? size().h : 1, dx = e.deltaX * k, dy = e.deltaY * k;
    if (e.ctrlKey || e.metaKey || (P.wheel === 'zoom' && !e.shiftKey)) zoomAt(e.clientX, e.clientY, Math.exp(-dy * (e.ctrlKey && Math.abs(dy) < 40 ? .012 : .0022)));
    else { V = { ...V, x: V.x - (e.shiftKey && !dx ? dy : dx), y: V.y - (e.shiftKey && !dx ? 0 : dy) }; applyView(); }
  }, { passive: false });
  // Safari: the pinch of the trackpad
  let gs = 1;
  svg.addEventListener('gesturestart', (e) => { e.preventDefault(); gs = 1; });
  svg.addEventListener('gesturechange', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.scale / gs); gs = e.scale; });
  svg.addEventListener('dblclick', (e) => {
    if (tool !== 'select') return;
    const [x, y] = toWorld(e.clientX, e.clientY), hit = topAt(x, y, tol());
    if (hit && (hit.t === 'text' || hit.t === 'note')) startEdit(hit);
    else if (!hit) { const o = opt('text'), fs = r2(o.fs / V.z); startEdit({ id: uid(), t: 'text', x: r2(x), y: r2(y - fs * .62), w: 0, text: '', c: inkOn(o.c, settings.bg), fs, ff: o.ff, al: o.al, b: !!o.b }, true); }
  });
  // the right click (or a long press) on the board: what the thing under it can do, in the menu of SavOffice (SavOffice.context);
  // with a finger on a tool that draws, the board says data-so-draw: a finger held still is a stroke, not a menu
  svg.soMenu = (e) => {
    if (gesture || !e) return null;
    // a long press with the select tool: the press held still is the menu, not a selection or a move
    if (action) { if (tool !== 'select') return null; cancelAction(); marquee = null; }
    const [x, y] = toWorld(e.clientX, e.clientY), hit = topAt(x, y, tol());
    if (hit && !sel.has(hit.id)) select([hit.id]);
    const has = sel.size > 0;
    return has ? [
      ['copy', t('copy_sel'), () => copySel()], ['copy-plus', t('duplicate_sel'), () => duplicate()], '-', ['bring-to-front', t('front'), () => arrange(true)], ['send-to-back', t('back'), () => arrange(false)], '-', ['trash', t('delete_sel'), () => removeSel(), { danger: true }],
    ] : [['clipboard-paste', t('paste'), () => pasteFromMenu(x, y)], ['scan', t('zoom_fit'), () => fit()], ['palette', t('board_look'), () => lookB.button.click()]];
  };
  function markDraw() { svg.toggleAttribute('data-so-draw', drawing() && !P.penOnly); }

  // ---------------------------------------------------------------- what the selection can do
  function removeSel() { const list = selItems(); if (!list.length) return; change(list.map((i) => [i.id, i, null])); sel.clear(); drawOverlay(); buildProps(); }
  function duplicate(list = selItems(), off = 24 / V.z) {
    if (!list.length) return;
    const copies = freshIds(list).map((i) => moved(i, off, off));
    change(copies.map((i) => [i.id, null, i]));
    select(copies.map((i) => i.id));
  }
  function arrange(front) {
    const ids = order.filter((x) => sel.has(x)), rest = order.filter((x) => !sel.has(x));
    if (!ids.length) return;
    change([], front ? [...rest, ...ids] : [...ids, ...rest]);
  }
  function restyle(patch) {
    const list = selItems();
    if (!list.length) return;
    change(list.map((i) => {
      const n = { ...i };
      if ('c' in patch && i.t !== 'image') { if (i.t === 'note') n.c = patch.c; else n.c = patch.c; }
      if ('f' in patch && (i.t === 'shape' || i.t === 'note')) n.f = i.t === 'note' ? patch.f || i.f : patch.f;
      if ('s' in patch && (i.t === 'stroke' || i.t === 'shape')) n.s = r2(patch.s / V.z);
      if ('d' in patch && i.t === 'shape') n.d = patch.d;
      if (i.t === 'text') for (const k of ['ff', 'b', 'al']) if (k in patch) n[k] = patch[k];
      if ('fs' in patch && i.t === 'text') n.fs = r2(patch.fs / V.z);
      return [i.id, i, n];
    }));
  }
  const CLIP = 'savwhiteboard/items';
  function copySel(cutToo = false) {
    const list = selItems();
    if (!list.length) return false;
    const data = JSON.stringify({ [CLIP]: list });
    try { navigator.clipboard.writeText(data).catch(() => {}); } catch { /* not allowed */ }
    S.clip = list;
    if (cutToo) removeSel();
    return data;
  }
  function pasteItems(list, at) {
    if (!list.length) return;
    const b = union(list), [cx, cy] = at || toWorld(size().l + size().w / 2, size().t + size().h / 2);
    const copies = freshIds(list).map((i) => moved(i, r2(cx - b.x - b.w / 2), r2(cy - b.y - b.h / 2)));
    change(copies.map((i) => [i.id, null, i]));
    setTool('select');
    select(copies.map((i) => i.id));
  }
  async function pasteFromMenu(x, y) {
    try { const s = await navigator.clipboard.readText(); const j = JSON.parse(s); if (j?.[CLIP]) return pasteItems(cleanItems(j[CLIP]), [x, y]); } catch { /* no permission or no items */ }
    if (S.clip) pasteItems(S.clip, [x, y]);
  }
  function pasteText(text, at) {
    const o = opt('text'), [x, y] = at || toWorld(size().l + size().w / 2, size().t + size().h / 2), fs = r2(o.fs / V.z);
    const i = { id: uid(), t: 'text', x: r2(x), y: r2(y), w: 0, text: text.slice(0, 20000), c: inkOn(o.c, settings.bg), fs, ff: o.ff, al: o.al, b: !!o.b };
    change([[i.id, null, i]]);
    select([i.id]);
  }
  /** A picture of the account on the board: as big as 60% of the window at most, with its source under it when asked. */
  function placePicture(m, at) {
    const s = size(), [cx, cy] = at || toWorld(s.l + s.w / 2, s.t + s.h / 2);
    const k = Math.min(1, (s.w * .6) / m.w, (s.h * .6) / m.h) / V.z, w = r2(m.w * k), hh = r2(m.h * k);
    const i = { id: uid(), t: 'image', x: r2(cx - w / 2), y: r2(cy - hh / 2), w, h: hh, src: m.src }, list = [[i.id, null, i]];
    if (m.cite && m.credit) {
      const fs = r2(12 / V.z), c = { id: uid(), t: 'text', x: i.x, y: r2(i.y + hh + fs * .5), w: w, text: m.credit, c: isDark(settings.bg) ? '#b8bec6' : '#5f6660', fs, ff: 'sans', al: 'left', b: false };
      list.push([c.id, null, c]);
    }
    change(list);
    setTool('select');
    select(list.map((x) => x[0]));
  }
  /** A picture from the device (pasted, dropped): sent to the server first (15 MB at most). */
  async function addImage(file, at) {
    const note = toast(t('uploading'), 'neutral', { duration: 120000 });
    try { placePicture(await uploadPicture(file), at); } catch (e) { fail(e); } finally { note?.hide?.(); note?.remove?.(); }
  }
  /** The picture dialog, as in SavPresentations: search of free portals, own pictures, from the device. */
  async function pickImage(at) {
    finishEdit();
    const m = await pickPicture();
    if (m) placePicture(m, at);
  }

  // ---------------------------------------------------------------- the bars
  const tb = {};
  function setToolQuiet(k) { tool = k; for (const [n, b] of Object.entries(tb)) b.on(n === k); svg.dataset.tool = k; markDraw(); }
  function setTool(k) {
    finishEdit();
    if (k === 'image') { pickImage(); return; }
    setToolQuiet(k);
    if (k !== 'select') { sel.clear(); }
    eraserAt = null;
    drawOverlay();
    buildProps();
    if (k !== 'laser') setPrefs({ tool: k }).catch(() => {});
  }
  const tools = h('nav.tools', { 'aria-label': t('tool_select') });
  // every tool has its button; which ones the dock shows and in what order is a choice of each person (⋮ → Customise the bars)
  for (const [k, ic, key] of TOOLS) tb[k] = iconBtn(k === 'shape' ? SHAPE_ICONS[opt('shape').k] : ic, t('tool_' + k), () => setTool(k), { place: 'top', kbd: key, size: matchMedia('(max-width: 640px)').matches ? 'sm' : 'md' });
  const TL_ITEMS = TOOLS.map(([k, ic]) => [k, ic, t('tool_' + k)]);
  const TL_DEF = TOOLS.flatMap(([k]) => (k === 'hand' || k === 'laser' ? [k, '|'] : [k]));
  /** A bar as each person chose it (kept with the account): its list, in order, with '|' a separator, '_' a fixed space and
   *  '~' an adaptive one (SavOffice.bars); what it has at first when nothing was chosen. */
  const BARS = window.SavOffice?.bars;
  const barPick = (id, def, items) => (BARS ? BARS.pick(prefs().bars?.[id], def, items) : def);
  const barList = (id, def, items) => { const l = barPick(id, def, items); return BARS ? BARS.layout(l) : l; };
  const barEl = (k, map) => (k === '|' ? h('span.tsep.so-sep') : k === '_' ? h('i.bgap') : k === '~' ? h('span.spacer') : map[k]);
  const layoutTools = () => put(tools, barList('tools', TL_DEF, TL_ITEMS).map((k) => barEl(k, tb)));
  layoutTools();

  const props = h('div.props');
  /** Colours to tap: a few, and any other one. */
  function swatches(list, value, onpick, label = t('color')) {
    const g = h('sav-radio-group.sws', { appearance: 'buttons', size: 'sm', value: String(value || '').toLowerCase(), 'aria-label': label }, list.map((c) => h('sav-radio', { value: c, title: c, 'aria-label': c }, h('span.sw', { style: `--c:${c}` }))));
    g.addEventListener('change', () => onpick(g.value));
    const more = colorPop(label, value, (v) => { if (v) onpick(v); }, { list, placement: 'top', trigger: h('sav-button', { size: 'sm', appearance: 'ghost', variant: 'neutral', square: true, icon: 'palette', label: t('more') }) });
    return h('div.pgroup', g, more);
  }
  function sizes(list, value, onpick, max) {
    const g = h('sav-radio-group.szs', { appearance: 'buttons', size: 'sm', value: String(value), 'aria-label': t('size') }, list.map((s) => h('sav-radio', { value: String(s), title: String(s), 'aria-label': String(s) }, h('span.sz', { style: `--d:${Math.max(3, Math.min(20, (s / max) * 20))}px` }))));
    g.addEventListener('change', () => onpick(+g.value));
    return g;
  }
  const seg = (label, value, opts, onpick) => { const g = h('sav-radio-group', { appearance: 'buttons', size: 'sm', value: String(value), 'aria-label': label }, opts.map(([v, ic, l]) => h('sav-radio', { value: String(v), title: l, 'aria-label': l }, ic[0] === '=' ? ic.slice(1) : icon(ic)))); g.addEventListener('change', () => onpick(g.value)); return g; };
  const sep = () => h('span.psep');
  const act = (ic, label, run, o = {}) => iconBtn(ic, label, run, { place: 'top', ...o });

  function buildProps() {
    const list = tool === 'select' ? selItems() : [];
    const kids = [];
    const inks = inksFor(settings.bg);
    if (['pen', 'pencil', 'marker'].includes(tool)) {
      const o = opt(tool);
      kids.push(swatches(tool === 'marker' ? HIGHLIGHT : inks, tool === 'marker' ? o.c : inkOn(o.c, settings.bg), (c) => { setOpt(tool, { c }); buildProps(); }), sep(), sizes(SIZES[tool], o.s, (s) => setOpt(tool, { s }), SIZES[tool].at(-1)));
    } else if (tool === 'eraser') {
      const o = opt('eraser');
      kids.push(seg(t('eraser_mode'), o.mode, [['partial', 'eraser', t('er_partial')], ['whole', 'trash', t('er_whole')]], (mode) => setOpt('eraser', { mode })), sep(), sizes(SIZES.eraser, o.s, (s) => { setOpt('eraser', { s }); showEraser(); }, 100));
    } else if (tool === 'shape') {
      const o = opt('shape');
      kids.push(seg(t('tool_shape'), o.k, Object.entries(SHAPE_ICONS).map(([k, ic]) => [k, ic, t('s_' + k)]), (k) => { setOpt('shape', { k }); tb.shape.button.icon = SHAPE_ICONS[k]; buildProps(); }), sep(),
        swatches(inks, inkOn(o.c, settings.bg), (c) => { setOpt('shape', { c }); buildProps(); }), sep(), sizes(SIZES.shape, o.s, (s) => setOpt('shape', { s }), 12),
        o.k !== 'line' && o.k !== 'arrow' ? colorPop(t('fill'), o.f, (f) => { setOpt('shape', { f }); }, { list: [...PAPERS, ...inks.slice(0, 6)], none: t('no_fill'), placement: 'top', trigger: h('sav-button', { size: 'sm', appearance: 'ghost', variant: 'neutral', square: true, icon: 'fill', label: t('fill') }) }) : null,
        act('dash', t('dashed'), (b) => { setOpt('shape', { d: !opt('shape').d }); b.on(opt('shape').d); }));
      requestAnimationFrame(() => props.querySelectorAll('sav-tooltip').forEach((x) => { if (x.button?.getAttribute('icon') === 'dash') x.on(!!o.d); }));
    } else if (tool === 'text' || (editing && editing.item.t === 'text')) {
      const o = opt('text'), apply = (patch) => { setOpt('text', patch); if (editing && editing.item.t === 'text') { const p2 = { ...patch }; if ('fs' in p2) p2.fs = r2(p2.fs / V.z); editing.item = { ...editing.item, ...p2 }; placeEditor(); } };
      kids.push(swatches(inks, inkOn(o.c, settings.bg), (c) => { apply({ c }); buildProps(); }), sep(), textControls(o, apply));
    } else if (tool === 'note') {
      kids.push(swatches(PAPERS, opt('note').f, (f) => { setOpt('note', { f }); if (editing?.item.t === 'note') { editing.item = { ...editing.item, f }; placeEditor(); } }, t('paper')));
    } else if (list.length) {
      const has = (f) => list.some(f), first = list[0];
      if (has((i) => i.t !== 'image')) kids.push(swatches(has((i) => i.t === 'stroke' && i.tool === 'marker') && list.every((i) => i.t === 'stroke' && i.tool === 'marker') ? HIGHLIGHT : inks, first.c, (c) => restyle({ c })), sep());
      if (has((i) => i.t === 'stroke' || i.t === 'shape')) kids.push(sizes(SIZES.shape, Math.round((first.s || 4) * V.z), (s) => restyle({ s }), 12), sep());
      if (has((i) => i.t === 'note')) kids.push(colorPop(t('paper'), first.f, (f) => restyle({ f }), { list: PAPERS, placement: 'top', trigger: h('sav-button', { size: 'sm', appearance: 'ghost', variant: 'neutral', square: true, icon: 'sticky-note', label: t('paper') }) }));
      if (has((i) => i.t === 'shape' && i.k !== 'line' && i.k !== 'arrow')) kids.push(colorPop(t('fill'), first.f || '', (f) => restyle({ f }), { list: [...PAPERS, ...inks.slice(0, 6)], none: t('no_fill'), placement: 'top', trigger: h('sav-button', { size: 'sm', appearance: 'ghost', variant: 'neutral', square: true, icon: 'fill', label: t('fill') }) }));
      if (list.every((i) => i.t === 'text')) kids.push(textControls({ ...first, fs: Math.round(first.fs * V.z) }, (p) => restyle(p)));
      kids.push(sep(), act('copy-plus', t('duplicate_sel'), () => duplicate(), { kbd: 'Mod+D' }), act('bring-to-front', t('front'), () => arrange(true), { kbd: ']' }), act('send-to-back', t('back'), () => arrange(false), { kbd: '[' }), act('trash', t('delete_sel'), () => removeSel(), { kbd: 'Del' }));
    }
    put(props, kids);
    props.hidden = !kids.length;
  }
  function textControls(o, apply) {
    const font = h('sav-select', { size: 'sm', value: o.ff, 'aria-label': t('font'), class: 'fsel' }, Object.keys(FONTS).map((k) => h('option', { value: k, style: `font-family:${FONTS[k]}` }, t('f_' + k))));
    font.addEventListener('change', () => apply({ ff: font.value }));
    const near = FS.reduce((a, b) => (Math.abs(b - o.fs) < Math.abs(a - o.fs) ? b : a), FS[0]);
    const fsz = h('sav-select', { size: 'sm', value: String(near), 'aria-label': t('font_size'), class: 'fssel' }, FS.map((s) => h('option', { value: String(s) }, String(s))));
    fsz.addEventListener('change', () => apply({ fs: +fsz.value }));
    const bold = act('bold', t('bold'), (b) => { o.b = !o.b; b.on(o.b); apply({ b: o.b }); }, { kbd: 'Mod+B' });
    requestAnimationFrame(() => bold.on(!!o.b));
    return h('div.pgroup', font, fsz, bold, seg(t('align'), o.al, [['left', 'align-left', t('al_left')], ['center', 'align-center', t('al_center')], ['right', 'align-right', t('al_right')]], (al) => apply({ al })));
  }

  // the look of the board: background, watermark, spacing
  function lookPanel() {
    const box = h('div.look');
    const setBg = (bg) => { settings.bg = bg; lookDirty = true; applyLook(); queueSave(); fill(); };
    // light papers in one row, dark boards in the other (the last one also offers any other colour)
    const row = (list, more) => { const g = swatches(list, settings.bg, setBg, t('background')); if (!more) g.lastChild.remove(); return g; };
    // the staves and the graph paper want their own size: a new pattern starts from it
    const GAPS = { staff: 48, tab: 50, mm: 40, hex: 22 };
    const setPat = (pat) => { if (GAPS[pat] && settings.pat !== pat) settings.gap = GAPS[pat]; else if (GAPS[settings.pat] && !GAPS[pat]) settings.gap = 24; settings.pat = pat; lookDirty = true; applyLook(); queueSave(); fill(); };
    const fill = () => put(box,
      h('span.flabel', t('background')), row(BACKS.slice(0, 5), false), row(BACKS.slice(5), true),
      h('span.flabel', t('pattern')), seg(t('pattern'), settings.pat, [['none', 'blank', t('pat_none')], ['dots', 'dots', t('pat_dots')], ['grid', 'grid-3x3', t('pat_grid')], ['lines', 'lines', t('pat_lines')], ['iso', 'iso', t('pat_iso')]], setPat),
      seg(t('pattern'), settings.pat, [['staff', 'staff', t('pat_staff')], ['tab', 'tab', t('pat_tab')], ['mm', 'mm', t('pat_mm')], ['hex', 'hex', t('pat_hex')]], setPat),
      settings.pat !== 'none' ? [
        h('sav-range', { label: t('pattern_gap'), min: 8, max: 96, step: 2, value: settings.gap, 'show-value': true, oninput: (e) => { settings.gap = +e.currentTarget.value; lookDirty = true; drawPattern(); queueSave(); } }),
        h('div.prow', h('span.flabel.grow', t('pattern_color')), colorPop(t('pattern_color'), settings.pc, (pc) => { settings.pc = pc; lookDirty = true; drawPattern(); queueSave(); }, { none: t('auto'), list: ['#c9c4bb', '#9aa29d', '#5f6660', '#cfd8e6', '#7cc4ff', '#ffd166', '#ffffff', '#1c1c1c'] })),
      ] : null,
      h('sav-divider'), btn(t('clear_board'), { icon: 'trash', size: 'sm', appearance: 'ghost', variant: 'danger', onclick: async () => { if (!items.size) return; if (await confirm(t('clear_board'), t('clear_board_t'), t('clear'))) { change([...items.values()].map((i) => [i.id, i, null])); } } }));
    fill();
    box.refresh = fill;
    return box;
  }
  const lookB = iconBtn('palette', t('board_look'), null, { kbd: '' });
  const lookPop = h('sav-popover', { placement: 'bottom-end', 'sheet-on-mobile': true, heading: t('board_look'), style: '--width:20rem' });
  lookB.slot = 'trigger';
  // the panel is there from the start, so the popover measures its real size when it places itself; opening only refreshes it
  const look = lookPanel();
  lookPop.append(lookB, look);
  lookPop.addEventListener('sav-show', () => look.refresh());

  const undoB = iconBtn('undo-2', t('undo'), () => undo(), { kbd: 'Mod+Z' }), redoB = iconBtn('redo-2', t('redo'), () => redo(), { kbd: 'Mod+Shift+Z' });
  const whole = () => ({ title, settings, items: order.map((x) => items.get(x)) });
  // SavDrive: the cloud next to the grid of the apps saves this board into the drive (../assets/savoffice/savoffice.js)
  window.SavOffice?.exporter?.({ key: id, make: async () => { finishEdit(); const b = whole(), f = await import('./files.js'); return { blob: await f.makeSavwhi(b), name: f.fileName(b.title, 'savwhi') }; } });
  const exp = async (fn) => { finishEdit(); if (!items.size && fn !== saveSavwhi) return toast(t('export_empty'), 'neutral'); try { await fn(whole()); } catch (e) { fail(e); } };
  const dlList = [
    ['file-down', t('save_savwhi'), () => exp(saveSavwhi)], '-', ['image', t('save_png'), () => exp(savePng)], ['file-image', t('save_svg'), () => exp(saveSvg)], ['file-text', t('save_pdf'), () => exp(savePdf)],
  ];
  const downloadB = drop(h('sav-button', { icon: 'download', label: t('download_as'), title: t('download_as'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true }), dlList, { placement: 'bottom-end', label: t('download_as') });
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {});
  const moreList = () => [
    mobile() ? ['palette', t('board_look'), () => lookB.button.click()] : null,
    ['mouse-pointer-2', t('select_all'), () => { setTool('select'); select(order); }, { kbd: 'Mod+A' }],
    ['clipboard-paste', t('paste'), () => pasteFromMenu(...toWorld(size().l + size().w / 2, size().t + size().h / 2))],
    ['image', t('insert_image'), () => pickImage()],
    // from the sketch to the diagram: SavDiagrams (same account) reads this board and makes a diagram of its shapes, texts and arrows
    ['workflow', t('to_diagram'), async () => { await flush(); window.open('../savdiagrams/#/from-board/' + B.id, '_blank', 'noopener'); }],
    '-', ['scan', t('zoom_fit'), () => fit(), { kbd: 'Shift+1' }], document.documentElement.requestFullscreen ? ['maximize', t(document.fullscreenElement ? 'exit_full' : 'full_screen'), fullscreen] : null,
    role === 'owner' ? ['user-plus', t('share_board'), () => shareDialog()] : null,
    '-', !mobile() && BARS ? ['settings-2', BARS.menuLabel(), () => barsDialog()] : null, ['info', t('shortcuts'), () => shortcuts()],
  ];
  const moreB = drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more_tools'), title: t('more_tools'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true }), moreList, { placement: 'bottom-end', label: t('more_tools') });

  const titleIn = h('sav-input.dtitle', { value: title, maxlength: 160, size: 'sm', 'aria-label': t('rename'), spellcheck: 'false' });
  titleIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') titleIn.blur(); });
  // the field is as wide as its title (the status of the save comes right after it), up to a limit
  const titleBox = h('div.wtitle', titleIn);
  const fitTitle = () => { titleBox.style.width = Math.round(Math.min(352, Math.max(96, measure(titleIn.value || t('untitled'), '600 15.7px Inter, system-ui, sans-serif') + 30))) + 'px'; };
  titleIn.addEventListener('input', fitTitle);
  fitTitle();
  document.fonts?.ready.then(() => { if (!gone) fitTitle(); });
  titleIn.addEventListener('change', () => { const v = titleIn.value.trim(); if (!v) { titleIn.value = title; fitTitle(); return; } if (v === title) return; title = v; titleDirty = true; document.title = title + ' – SavWhiteboard'; svg.setAttribute('aria-label', title); queueSave(300); });

  // the title bar: back, the logo and the title on the left, ⋮ and the account on the right (always); between them the list
  const backB = iconBtn('arrow-left', t('back_home'), () => go('#/'), { kbd: '' }), brandA = h('a.wbrand', { href: '#/', title: 'SavWhiteboard' }, h('img', { src: 'icons/favicon.svg', width: 26, height: 26, alt: '' })), accountEl = h('span.mhide', userMenu());
  // the people on the board now (their faces), and sharing it (its owner)
  const hereEl = h('span.here', { 'aria-label': t('here_now') });
  function drawHere() {
    const others = here.filter((p) => p.id !== B.me);
    put(hereEl, others.slice(0, 5).map((p) => face(p.name, null, 26)), others.length > 5 ? h('small.more', '+' + (others.length - 5)) : null);
    hereEl.title = others.length ? t('here_now') + ': ' + others.map((p) => p.name).join(', ') : '';
  }
  const shareB = iconBtn('user-plus', t('share'), () => shareDialog());
  function shareDialog() {
    if (role !== 'owner') return;
    const email = h('sav-input', { type: 'email', label: t('share_email'), placeholder: 'nome@esempio.it', size: 'sm' }), roleSel = h('sav-select', { label: t('share_role'), value: 'editor', size: 'sm' }, h('option', { value: 'editor' }, t('role_editor')), h('option', { value: 'viewer' }, t('role_viewer')));
    email.addEventListener('keydown', (e) => e.stopPropagation());
    const list = h('div.people');
    const draw = () => put(list, people.map((p) => h('div.prow', face(p.name, null, 30), h('div.grow', h('b', p.name), h('small.muted', p.email)), p.role === 'owner' ? h('small.muted', t('role_owner'))
      : [h('small.muted', t(p.role === 'viewer' ? 'role_viewer' : 'role_editor')), iconBtn('x', t('share_remove'), async () => { people = (await api('wb.share', { id: B.id, user: p.id, remove: true })).people; draw(); })])));
    draw();
    dialog({ title: t('share_board'), width: '32rem', body: h('div.form', h('p.muted', t('share_t')), list, h('div.grid2', email, roleSel)), actions: [{ label: t('close') }, { label: t('share_add'), primary: true, run: async () => {
      try { people = (await api('wb.share', { id: B.id, email: email.value.trim(), role: roleSel.value })).people; email.value = ''; draw(); toast(t('share_done'), 'success'); } catch (e) { toast(t(e.code === 'no_account' ? 'share_no_account' : e.code === 'share_self' ? 'share_self' : 'error'), 'warning'); }
      return false; } }] });
  }
  const T2 = { undo: undoB, redo: redoB, look: h('span.lookw', lookPop), download: downloadB, share: shareB };
  const TITLE_ITEMS = [['undo', 'undo-2', t('undo')], ['redo', 'redo-2', t('redo')], ['look', 'palette', t('board_look')], ['download', 'download', t('download_as')], ['share', 'user-plus', t('share')]].filter(([k]) => k !== 'share' || role === 'owner');
  const TITLE_DEF = ['~', 'undo', 'redo', '|', 'look', 'download', 'share'];
  const top = h('header.wtop');
  const layoutTitle = () => put(top, backB, brandA, titleBox, status, hereEl, barList('title', TITLE_DEF, TITLE_ITEMS).map((k) => barEl(k, T2)), moreB, h('span.tsep.mhide'), accountEl);
  layoutTitle();
  /** Customising the bars (⋮ → Customise the bars): the window shared by the apps of SavOffice, a tab for each bar. */
  function barsDialog() {
    if (!BARS) return;
    BARS.dialog({ bars: [{ id: 'title', items: TITLE_ITEMS, def: TITLE_DEF, before: [['arrow-left', t('back_home')], [null, title]], after: [['ellipsis-vertical', t('more_tools')], ['layout-grid', 'SavOffice'], ['user', t('account')]] }, { id: 'tools', items: TL_ITEMS, def: TL_DEF }],
      value: { title: barPick('title', TITLE_DEF, TITLE_ITEMS), tools: barPick('tools', TL_DEF, TL_ITEMS) },
      save: async (v) => { await setPrefs({ bars: { ...(prefs().bars || {}), ...v } }); layoutTitle(); layoutTools(); } });
  }
  const zoom = h('div.zoom', iconBtn('zoom-out', t('zoom_out'), () => zoomTo(V.z / 1.25), { place: 'top', kbd: '-' }), zoomLabel, iconBtn('zoom-in', t('zoom_in'), () => zoomTo(V.z * 1.25), { place: 'top', kbd: '+' }), iconBtn('scan', t('zoom_fit'), () => fit(), { place: 'top', kbd: 'Shift+1' }));
  const dock = h('div.dock', props, tools);
  wrap.append(top, dock, zoom);
  /** Only to look at (a board shared to look at): no tools, no changes, the title stays as it is. */
  function applyRole() {
    const ro = !canEdit();
    dock.hidden = ro; titleIn.readonly = ro || null; undoB.hidden = ro; redoB.hidden = ro;
    wrap.classList.toggle('viewonly', ro);
    if (ro && tool !== 'hand') setTool('hand');
  }
  applyRole();
  put(root, wrap);
  // the search of actions (⌘J / Ctrl+J): the tools, the menu and the downloads, as in the bar
  const asCmd = (list) => list.filter(Array.isArray).map(([ic, l, fn, o]) => [ic, l, fn, o?.kbd || null]);
  commands([t('tools'), TOOLS.map(([k, ic, key]) => [ic, t('tool_' + k), () => setTool(k), key])],
    [t('more_tools'), [['undo-2', t('undo'), () => undo(), 'Mod+Z'], ['redo-2', t('redo'), () => redo(), 'Mod+Shift+Z'], ['palette', t('board_look'), () => lookB.button.click()], ...asCmd(moreList())]],
    [t('download_as'), asCmd(dlList)]);
  document.title = title + ' – SavWhiteboard';
  setStatus('saved');

  function shortcuts() {
    const row = (k, l) => h('div.kb', h('span', l), h('kbd', K(k)));
    dialog({ title: t('shortcuts'), width: '34rem', body: h('div.kbs', TOOLS.map(([k, , key]) => row(key, t('tool_' + k))), row('Mod+Z', t('undo')), row('Mod+Shift+Z', t('redo')), row('Mod+A', t('select_all')), row('Mod+D', t('duplicate_sel')), row('Mod+C', t('copy_sel')), row('Mod+V', t('paste')), row('Del', t('delete_sel')), row(']', t('front')), row('[', t('back')), row('+', t('zoom_in')), row('-', t('zoom_out')), row('Shift+1', t('zoom_fit')), row('Shift+0', t('zoom_100')), h('p.muted.small', t('hint_pan'))) });
  }

  // ---------------------------------------------------------------- keyboard, clipboard, files dropped
  const typing = (e) => { const p = e.composedPath?.() || []; return p.some((x) => /^(input|textarea|select|sav-input|sav-select|sav-textarea|sav-number-input)$/.test(x.localName || '') || x.isContentEditable) || !!document.querySelector('sav-dialog[open]'); };
  const KEYS = Object.fromEntries(TOOLS.map(([k, , key]) => [key.toLowerCase(), k]));
  function onKey(e) {
    if (gone || typing(e)) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (e.key === ' ' && !e.repeat) { spaceDown = true; wrap.classList.add('space'); e.preventDefault(); return; }
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 'a') { e.preventDefault(); setTool('select'); select(order); return; }
    if (mod && k === 'd') { e.preventDefault(); duplicate(); return; }
    if (mod && k === 's') { e.preventDefault(); flush(); return; }
    if (mod && (k === '0')) { e.preventDefault(); zoomTo(1); return; }
    if (mod && (k === '=' || k === '+')) { e.preventDefault(); zoomTo(V.z * 1.25); return; }
    if (mod && k === '-') { e.preventDefault(); zoomTo(V.z / 1.25); return; }
    if (mod) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { if (sel.size) { e.preventDefault(); removeSel(); } return; }
    if (e.key === 'Escape') { if (sel.size) select([]); else if (tool !== 'select') setTool('select'); return; }
    if (e.key.startsWith('Arrow') && sel.size) {
      e.preventDefault();
      const d = (e.shiftKey ? 10 : 1) / V.z, dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
      change(selItems().map((i) => [i.id, i, moved(i, dx, dy)]));
      return;
    }
    if (e.key === ']') return arrange(true);
    if (e.key === '[') return arrange(false);
    if (e.key === '+' || e.key === '=') return zoomTo(V.z * 1.25);
    if (e.key === '-' || e.key === '_') return zoomTo(V.z / 1.25);
    if (e.shiftKey && (e.code === 'Digit1')) return fit();
    if (e.shiftKey && (e.code === 'Digit0')) return zoomTo(1);
    if (e.key === 'o' || e.key === 'O') { setOpt('shape', { k: 'ellipse' }); tb.shape.button.icon = 'circle'; return setTool('shape'); }
    if (e.key === 'a' || e.key === 'A') { setOpt('shape', { k: 'arrow' }); tb.shape.button.icon = 'move-up-right'; return setTool('shape'); }
    if (k === 'r') { setOpt('shape', { k: 'rect' }); tb.shape.button.icon = 'square'; return setTool('shape'); }
    if (KEYS[k] && !e.altKey) setTool(KEYS[k]);
  }
  const onKeyUp = (e) => { if (e.key === ' ') { spaceDown = false; wrap.classList.remove('space'); } };
  const onCopy = (e) => { if (gone || typing(e) || !sel.size) return; const d = copySel(e.type === 'cut'); if (d) { e.clipboardData.setData('text/plain', d); e.preventDefault(); } };
  const onPaste = (e) => {
    if (gone || typing(e)) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); files.forEach((f) => addImage(f)); return; }
    const s = e.clipboardData?.getData('text/plain') || '';
    if (!s) return;
    e.preventDefault();
    try { const j = JSON.parse(s); if (j?.[CLIP]) return pasteItems(cleanItems(j[CLIP])); } catch { /* a text */ }
    pasteText(s);
  };
  const onDrop = async (e) => {
    e.preventDefault();
    const at = toWorld(e.clientX, e.clientY);
    for (const f of e.dataTransfer?.files || []) {
      if (f.type.startsWith('image/')) await addImage(f, at);
      else if (/\.savwhi$/i.test(f.name) || f.type === 'application/vnd.savwhiteboard.board+zip') { try { pasteItems(await toServer((await readSavwhi(f)).items), at); } catch (x) { fail(x); } }
    }
  };
  wrap.addEventListener('dragover', (e) => e.preventDefault());
  wrap.addEventListener('drop', onDrop);
  const onResize = () => { drawPattern(); drawOverlay(); };
  const busy = () => dirty.size || orderDirty || titleDirty || lookDirty;
  const onHide = () => { if (document.visibilityState === 'hidden') { if (busy()) keepHere(); flush(true); } };
  const onUnload = (e) => { if (busy()) { keepHere(); flush(true); e.preventDefault(); e.returnValue = ''; } };
  // what was kept offline goes now: every item as it is here, and what the server has more is taken away
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
  const onShow = () => { if (!document.hidden) poll(); };
  document.addEventListener('visibilitychange', onShow);
  poll();
  addEventListener('beforeunload', onUnload);

  // ---------------------------------------------------------------- start
  applyLook();
  redrawAll();
  setToolQuiet(tool);
  buildProps();
  afterChange();
  await customElements.whenDefined('sav-button');
  requestAnimationFrame(() => {
    const s = size();
    if (saved) { V = { x: saved.x + s.w / 2, y: saved.y + s.h / 2, z: saved.z }; applyView(); viewDirty = false; clearTimeout(viewTimer); }
    else { fit(undefined, false); viewDirty = false; clearTimeout(viewTimer); }
  });
  if (S.pendingImport) { const list = S.pendingImport; S.pendingImport = null; void list; }

  return () => {
    window.SavOffice?.exporter?.(null);
    finishEdit();
    gone = true;
    flush(true);
    removeEventListener('keydown', onKey);
    removeEventListener('keyup', onKeyUp);
    removeEventListener('blur', onKeyUp);
    document.removeEventListener('copy', onCopy);
    document.removeEventListener('cut', onCopy);
    document.removeEventListener('paste', onPaste);
    removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onHide);
    document.removeEventListener('visibilitychange', onShow); clearTimeout(pollT);
    removeEventListener('beforeunload', onUnload);
    cancelAnimationFrame(laserRaf);
    document.querySelector('.ctxm')?.remove();
  };
}
