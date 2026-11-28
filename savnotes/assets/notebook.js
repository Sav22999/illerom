/**
 * A notebook open: its sheets one under the other, all of the same size (the size of the notebook), on a column that
 * scrolls; on the side the small sheets to jump, add, move and remove them. Each sheet has three layers: its paper (an
 * SVG: colour and watermark), its typed text (an editable HTML layer, under) and what is drawn by hand (an SVG, over).
 *
 * Two ways of writing, chosen at the bottom:
 *   by hand    pen, pencil, highlighter, eraser, shapes and pictures on the sheet (the layer of the ink takes the pointer);
 *              with a stylus the finger only scrolls (palm rejection), otherwise two fingers scroll and zoom
 *   document   the keyboard writes on the sheet as in SavDocuments: titles, bold, lists, checklists, colours; on lined
 *              paper each line of text is a line of the paper. When a sheet is full the text goes on the next one.
 *
 * Coordinates of a sheet are units of the page (see model.js); the view has one zoom z: a unit is z pixels on screen.
 * Every change of the ink goes into the history (undo/redo) and into the next save, which sends only what changed.
 */
import { btn, colorPop, confirm, dialog, drop, fail, h, icon, iconBtn, K, keepCaret, mobile, put, tile, toast } from './ui.js';
import { getLang, t } from './i18n.js';
import { S, api } from './store.js';
import { commands, go, prefs, ownShortcuts, setPrefs, userMenu } from './account.js';
import { DEFS, NS, docCSS, itemSVG, paperSVG, sheetSVG } from './render.js';
import { bounds, cut, hits, moved, overlaps, scaled, union } from './ink.js';
import { BACKS, COVERS, FONTS, HIGHLIGHT, PAPERS, PATTERNS, SIZES, TEXT_INKS, TEXT_MARKS, cleanDoc, cleanItems, defaultPaper, docEmpty, freshIds, freshSheet, inkOn, inksFor, isDark, newSheet, pageSize, r2, uid } from './model.js';
import { printNotebook, readImage, saveSavnot, savePng } from './files.js';
import { keep as keepOff, take as takeOff, drop as dropOff } from '../../assets/savoffice/offline-keep.js';

const DEF = {
  pen: { c: '#1c1c1c', s: 3 }, pencil: { c: '#5f6660', s: 2.5 }, marker: { c: '#ffe14d', s: 18 }, eraser: { s: 24, mode: 'partial' },
  shape: { k: 'rect', c: '#1d4e89', s: 3, f: '', d: false },
};
const SIZES_T = { pen: [1.5, 3, 5, 8, 13], pencil: [1.2, 2.5, 4, 6], marker: [10, 18, 28, 42], shape: [1.5, 3, 5, 8], eraser: [12, 24, 48, 90] };
// the key of each tool: its letter with ⌥⇧ (Alt+Shift), never the letter alone
const TOOLS = [['select', 'mouse-pointer-2', 'Alt+Shift+V'], ['hand', 'hand', 'Alt+Shift+H'], ['pen', 'pen', 'Alt+Shift+P'], ['pencil', 'pencil', 'Alt+Shift+C'], ['marker', 'highlighter', 'Alt+Shift+M'], ['eraser', 'eraser', 'Alt+Shift+E'], ['shape', 'square', 'Alt+Shift+R'], ['image', 'image', 'Alt+Shift+I']];
const SHAPE_ICONS = { rect: 'square', ellipse: 'circle', diamond: 'diamond', triangle: 'triangle', line: 'line', arrow: 'move-up-right' };
const BLOCKS = [['p', 'b_p'], ['h1', 'b_h1'], ['h2', 'b_h2'], ['h3', 'b_h3'], ['blockquote', 'b_quote']];
const svgEl = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** The positions a move carries (browsers group fast moves); the move itself when there are none. */
const coalesced = (e) => { const l = e.getCoalescedEvents?.(); return l?.length ? l : [e]; };
const GAP = 28; // pixels between two sheets on screen

export async function notebookScreen(root, id) {
  const r = await api('nb.get', undefined, { id });
  const N = r.notebook;
  if (N.trashed) { const e = new Error('not_found'); e.code = 'not_found'; throw e; }
  // changes made here without a network and kept in this browser (offline-keep.js): the notebook opens as it was left,
  // and they leave as soon as they can (below, after the saving is ready)
  if (window.SavOffice) window.SavOffice.offlineEdit = true;
  const kept = await takeOff('savnotes', N.id), server = kept ? { list: N.list } : null;
  if (kept) Object.assign(N, { list: kept.list, title: kept.title, settings: kept.settings });
  let P = prefs();
  const opt = (k) => ({ ...DEF[k], ...(P.tools?.[k] || {}) });
  const setOpt = (k, patch) => { P = prefs(); setPrefs({ tools: { ...(P.tools || {}), [k]: { ...opt(k), ...patch } } }).catch(() => {}); P = prefs(); };

  // ---------------------------------------------------------------- state
  const settings = { ...N.settings };
  let title = N.title, version = N.version, [W, H] = pageSize(settings);
  let z = 1, mode = P.mode === 'doc' ? 'doc' : 'ink', gone = false;
  let tool = TOOLS.some((x) => x[0] === P.tool) ? P.tool : 'pen';
  /** sheet: {id, bg, pat, gap, pc, doc, items: Map, order: [ids], els: Map, dom} */
  let sheets = N.list.map(fromData);
  if (!sheets.length) sheets = [fromData(newSheet(settings.paper))];
  function fromData(s) { const items = new Map(); for (const i of s.items || []) items.set(i.id, i); return { id: s.id, bg: s.bg, pat: s.pat, gap: s.gap, pc: s.pc || '', doc: s.doc || '', items, order: (s.items || []).map((i) => i.id), els: new Map(), dom: null }; }
  const byId = (x) => sheets.find((s) => s.id === x);
  const idx = (sh) => sheets.indexOf(sh);
  const paperOf = (sh) => ({ bg: sh.bg, pat: sh.pat, gap: sh.gap, pc: sh.pc });
  const dataOf = (sh) => ({ id: sh.id, ...paperOf(sh), doc: sh.dom ? cleanDoc(sh.dom.doc.innerHTML) : sh.doc, items: sh.order.map((x) => sh.items.get(x)) });

  // ---------------------------------------------------------------- the stage: a column of sheets that scrolls
  const stack = h('div.col');
  const scroller = h('div.scroller', stack);
  const wrap = h('div.nb', scroller);
  /** How the sheets follow one another: one under the other ('v') or side by side, turned like the pages of a book ('h'). */
  const flowH = () => settings.flow === 'h';
  /** How scrolling stops: where the finger or the wheel leaves it ('free'), or on a whole sheet ('snap', CSS scroll snap). */
  const snapOn = () => settings.scroll === 'snap';
  const applyFlow = () => { wrap.classList.toggle('fh', flowH()); wrap.classList.toggle('snap', snapOn()); };
  applyFlow();
  // ---- by whole sheets: the scroll moves freely (finger, wheel, trackpad, its momentum) and, once it stops, glides to a sheet:
  // the next one in the direction it went if it went past a fifth of the way, back to the one it left otherwise. (CSS scroll
  // snap pulled the sheets at every pause of a trackpad or a finger: it stopped and started again.)
  let lastPos = 0, dir = 0, settleT = 0, glideUntil = 0, fingers = 0;
  const pos = () => (flowH() ? scroller.scrollLeft : scroller.scrollTop);
  function settleLater(ms = 220) { if (!snapOn()) return; clearTimeout(settleT); settleT = setTimeout(settle, ms); }
  function settle() {
    if (!snapOn()) return;
    if (gesture || action || fingers || pull.on) { settleLater(200); return; }
    if (performance.now() < glideUntil) { settleLater(glideUntil - performance.now() + 30); return; }
    if (!sheets.length || !sheets[0].dom) return;
    const hz = flowH(), p = pos(), view = hz ? scroller.clientWidth : scroller.clientHeight - (parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0);
    const marks = sheets.map((sh) => snapAt(sh.dom.box)), size = (sh) => (hz ? sh.dom.box.offsetWidth : sh.dom.box.offsetHeight) + 24;
    let k = 0;
    while (k < marks.length - 1 && marks[k + 1] <= p + 1) k++;
    // a sheet bigger than the window (zoomed in) is free inside: it only snaps past its end
    const lo = marks[k] + Math.max(0, size(sheets[k]) - view), hi = k + 1 < marks.length ? marks[k + 1] : null;
    if (p < marks[0]) { glide(marks[0]); return; }
    if (p <= lo + 1) return;
    if (hi === null) { glide(lo); return; }
    const f = (p - lo) / Math.max(1, hi - lo);
    glide(dir > 0 ? (f > .2 ? hi : lo) : f < .8 ? lo : hi);
  }
  function glide(to) {
    if (Math.abs(to - pos()) < 2) return;
    glideUntil = performance.now() + 650;
    scroller.scrollTo(flowH() ? { left: to, behavior: 'smooth' } : { top: to, behavior: 'smooth' });
  }
  scroller.addEventListener('scroll', () => {
    const p = pos();
    if (performance.now() >= glideUntil && p !== lastPos) dir = Math.sign(p - lastPos);
    lastPos = p;
    settleLater();
  }, { passive: true });
  if ('onscrollend' in window) scroller.addEventListener('scrollend', () => settleLater(120));
  scroller.addEventListener('touchstart', (e) => { fingers = e.touches.length; }, { passive: true });
  scroller.addEventListener('touchend', (e) => { fingers = e.touches.length; if (!fingers) settleLater(); }, { passive: true });
  scroller.addEventListener('touchcancel', (e) => { fingers = e.touches.length; if (!fingers) settleLater(); }, { passive: true });
  /** The scrolls done here (zoom, a finger panning with a stylus, the pinch): the sheet comes into place once they stop. */
  const freeScroll = () => settleLater(260);

  // ---- at the ends of the notebook: going on past the last sheet (or before the first) fills the tile of a new sheet; letting
  // go when it is full adds the sheet. Wheel and trackpad: it counts the scroll that has nowhere to go; a finger: its move.
  const PULL = 200; // pixels of pulling to fill the tile
  const pull = { on: false, end: 0, v: 0, t: 0 };
  const atEdge = (sign) => (sign > 0 ? pos() >= (flowH() ? scroller.scrollWidth - scroller.clientWidth : scroller.scrollHeight - scroller.clientHeight) - 2 : pos() <= 2);
  /** d: pixels of a scroll that had nowhere to go (+ towards the end). True when it pulled. */
  function pullBy(d) {
    const sign = Math.sign(d);
    if (!sign || !atEdge(sign) || (pull.on && pull.end !== sign)) { if (pull.on && Math.sign(d) !== pull.end) pullReset(); return false; }
    pull.on = true; pull.end = sign;
    pull.v = clamp(pull.v + Math.abs(d) / PULL, 0, 1);
    paintPull();
    return true;
  }
  function paintPull() {
    const on = pull.on ? (pull.end > 0 ? endTile : startTile) : null;
    for (const x of [endTile, startTile]) {
      x.style.setProperty('--pull', x === on ? pull.v : 0);
      x.classList.toggle('pulling', x === on);
      x.classList.toggle('ready', x === on && pull.v >= 1);
    }
    endTile.querySelector('span').textContent = on === endTile && pull.v >= 1 ? t('add_release') : t('add_sheet');
  }
  function pullRelease() {
    clearTimeout(pull.t);
    if (!pull.on) return;
    const full = pull.v >= 1, end = pull.end;
    pullReset();
    if (full) addSheet(end > 0 ? sheets.length : 0);
  }
  function pullReset() { clearTimeout(pull.t); pull.on = false; pull.v = 0; pull.end = 0; paintPull(); }
  /** Wheel and trackpad have no letting go: still for a moment is letting go. */
  // the momentum of a trackpad that reaches the end dies away step by step: only a scroll that is not fading counts (a notch
  // of a wheel, fingers still pushing), so a flick that lands at the end does not add a sheet by itself
  let wheelLast = 0, wheelAt = 0;
  const pullWheel = (d) => {
    const now = performance.now(), m = Math.abs(d), fresh = now - wheelAt > 120 || m >= wheelLast * .98;
    wheelLast = m; wheelAt = now;
    if (!atEdge(Math.sign(d))) { if (pull.on) pullReset(); return false; }
    if (!fresh) { if (pull.on) { clearTimeout(pull.t); pull.t = setTimeout(pullRelease, 280); } return true; }
    if (!pullBy(d)) return false;
    clearTimeout(pull.t); pull.t = setTimeout(pullRelease, 280);
    return true;
  };
  let touchAt = null;
  scroller.addEventListener('touchstart', (e) => { const p = e.touches[0]; touchAt = e.touches.length === 1 && !e.target.closest?.('.ink') ? [p.clientX, p.clientY] : null; }, { passive: true });
  scroller.addEventListener('touchmove', (e) => {
    if (!touchAt || e.touches.length !== 1) return;
    const p = e.touches[0], d = flowH() ? touchAt[0] - p.clientX : touchAt[1] - p.clientY;
    touchAt = [p.clientX, p.clientY];
    pullBy(d);
  }, { passive: true });
  scroller.addEventListener('touchend', () => { touchAt = null; pullRelease(); }, { passive: true });
  scroller.addEventListener('touchcancel', () => { touchAt = null; pullReset(); }, { passive: true });
  /** Where the window stops for a sheet: in the middle when side by side, at its top (under the bar) when one under the other. */
  const snapAt = (box) => (flowH() ? box.offsetLeft - Math.max(16, (scroller.clientWidth - box.offsetWidth) / 2) : box.offsetTop - (snapOn() ? (parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0) + 16 : 16));
  // at the ends of the notebook a new sheet: after the last one (below it, or beside it like a book) and, smaller, before the first
  const endTile = h('button.addend', { type: 'button', onclick: () => addSheet(sheets.length) }, icon('plus'), h('span', t('add_sheet')));
  const startTile = h('button.addend.first', { type: 'button', title: t('add_sheet_before'), 'aria-label': t('add_sheet_before'), onclick: () => addSheet(0) }, icon('plus'));
  const status = h('span.wstatus', { role: 'status' });
  const zoomLabel = h('sav-button.zl', { size: 'sm', appearance: 'ghost', variant: 'neutral', title: t('zoom_100') }, '100%');
  zoomLabel.addEventListener('click', () => zoomTo(1));
  const pageLabel = h('span.pgl');

  // ---------------------------------------------------------------- a sheet on screen
  function renderSheet(sh) {
    const el = h('div.sheet', { id: 's-' + sh.id, 'data-id': sh.id });
    const style = h('style'), paper = svgEl('svg', { class: 'ppr', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    const doc = h('div.doc', { spellcheck: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('sheet_n', { n: idx(sh) + 1 }) });
    doc.innerHTML = cleanDoc(sh.doc);
    const ink = svgEl('svg', { class: 'ink', viewBox: `0 0 ${W} ${H}` }), defs = svgEl('defs');
    defs.innerHTML = DEFS;
    const itemsG = svgEl('g', { style: 'isolation:isolate' }), liveG = svgEl('g'), over = svgEl('g', { class: 'over' });
    ink.append(defs, itemsG, over);
    // what changes at every frame while writing or erasing (the stroke being drawn, the circle of the eraser) is on a layer of
    // its own above the sheet: only that layer is painted again, not every stroke of the sheet (slow on a tablet)
    const cursor = svgEl('g', { class: 'over' }), live = svgEl('svg', { class: 'live', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    live.append(liveG, cursor);
    el.append(style, paper, doc, ink, live);
    const num = h('div.snum');
    const box = h('div.swrap', el, num);
    sh.dom = { box, el, style, paper, doc, ink, itemsG, liveG, over, cursor, num };
    sh.els = new Map();
    doc.contentEditable = mode === 'doc' ? 'true' : 'false';
    paintPaper(sh);
    redrawAll(sh);
    return box;
  }
  function paintPaper(sh) {
    const p = paperSVG('pp' + sh.id, sh, W, H, 1);
    sh.dom.paper.innerHTML = `<defs>${p.defs}</defs>${p.body}`;
    sh.dom.style.textContent = docCSS(`#s-${sh.id} .doc`, settings, sh);
    sh.dom.el.classList.toggle('dark', isDark(sh.bg));
  }
  function renderAll() {
    [W, H] = pageSize(settings);
    stack.style.setProperty('--W', W);
    stack.style.setProperty('--H', H);
    put(stack, startTile, sheets.map(renderSheet), endTile);
    numberSheets();
    buildSide();
  }
  function numberSheets() { sheets.forEach((sh, n) => { sh.dom.num.textContent = t('sheet_of', { n: n + 1, m: sheets.length }); sh.dom.doc.setAttribute('aria-label', t('sheet_n', { n: n + 1 })); }); cur = Math.min(cur, sheets.length - 1); pageLabel.textContent = `${cur + 1} / ${sheets.length}`; }

  // ---------------------------------------------------------------- items on screen
  function el(sh, i) { const g = svgEl('g', { 'data-id': i.id }); g.innerHTML = itemSVG(i, isDark(sh.bg)); return g; }
  function draw(sh, iid) {
    const i = sh.items.get(iid), old = sh.els.get(iid);
    if (!i) { old?.remove(); sh.els.delete(iid); return; }
    const n = el(sh, i);
    if (old) old.replaceWith(n); else sh.dom.itemsG.append(n);
    sh.els.set(iid, n);
  }
  function redrawAll(sh) { sh.els.clear(); sh.dom.itemsG.replaceChildren(...sh.order.map((x) => { const n = el(sh, sh.items.get(x)); sh.els.set(x, n); return n; })); }
  const restack = (sh) => { for (const x of sh.order) { const n = sh.els.get(x); if (n) sh.dom.itemsG.append(n); } };

  // ---------------------------------------------------------------- view: zoom and the sheet in front
  const fitZ = () => {
    const cs = getComputedStyle(scroller), w = (scroller.clientWidth || innerWidth) - (parseFloat(cs.paddingLeft) || 0), zw = (w - (mobile() ? 20 : 72)) / W;
    // side by side: the whole sheet in the height of the window as well (under the bar on top, above the tools at the bottom)
    const zh = flowH() ? ((scroller.clientHeight || innerHeight) - (parseFloat(cs.paddingTop) || 0) - (mobile() ? 175 : 160)) / H : Infinity;
    return clamp(Math.min(zw, zh), .15, mobile() ? 3 : 1.35);
  };
  function setZ(nz, ax = scroller.clientWidth / 2, ay = scroller.clientHeight / 2) {
    nz = clamp(nz, .15, 5);
    if (Math.abs(nz - z) < 1e-4) return;
    // the point under (ax, ay) stays where it is
    const sx = (scroller.scrollLeft + ax) / Math.max(1, stack.scrollWidth), sy = (scroller.scrollTop + ay) / Math.max(1, stack.scrollHeight);
    z = nz;
    freeScroll();
    stack.style.setProperty('--z', z);
    zoomLabel.textContent = Math.round(z * 100) + '%';
    scroller.scrollLeft = sx * stack.scrollWidth - ax;
    scroller.scrollTop = sy * stack.scrollHeight - ay;
    drawOverlay();
    viewLater();
  }
  const zoomTo = (nz) => setZ(nz);
  const fit = () => setZ(fitZ());
  let viewTimer = 0, viewDirty = false;
  const viewLater = () => { viewDirty = true; clearTimeout(viewTimer); viewTimer = setTimeout(() => queueSave(0), 2500); };
  /** The sheet in the middle of the window. */
  let cur = 0;
  function whichSheet() {
    const sb = scroller.getBoundingClientRect(), hz = flowH(), mid = hz ? sb.left + scroller.clientWidth * .5 : sb.top + scroller.clientHeight * .4;
    let best = 0, d = Infinity;
    sheets.forEach((sh, n) => { const b = sh.dom.el.getBoundingClientRect(), [lo, hi] = hz ? [b.left, b.right] : [b.top, b.bottom], dd = mid < lo ? lo - mid : mid > hi ? mid - hi : 0; if (dd < d) { d = dd; best = n; } });
    return best;
  }
  function onScroll() {
    const n = whichSheet();
    if (n !== cur) { cur = n; markSide(); viewLater(); }
    pageLabel.textContent = `${cur + 1} / ${sheets.length}`;
  }
  scroller.addEventListener('scroll', () => requestAnimationFrame(onScroll), { passive: true });
  function goSheet(n, smooth = true) {
    const sh = sheets[clamp(n, 0, sheets.length - 1)];
    if (!sh) return;
    const behavior = smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto';
    // side by side: the sheet in the middle of the window
    scroller.scrollTo(flowH() ? { left: snapAt(sh.dom.box), behavior } : { top: snapAt(sh.dom.box), behavior });
  }

  // ---------------------------------------------------------------- changes, history, saving
  const dirtyItems = new Map(), dirtyMeta = new Set(), dropped = new Set(), iorderDirty = new Set();
  let orderDirty = false, titleDirty = false, setDirty = false;
  const mark = (sid, iid) => { if (!dirtyItems.has(sid)) dirtyItems.set(sid, new Set()); dirtyItems.get(sid).add(iid); };
  let hist = [], fut = [];
  /** list: [[id, before | null, after | null]]; newOrder: the ids of the sheet in a new order. */
  function change(sh, list, newOrder = null, record = true) {
    list = list.filter(([, b, a]) => b || a);
    if (!list.length && !newOrder) return;
    const ob = sh.order.slice();
    for (const [iid, , a] of list) { if (a) { if (!sh.items.has(iid)) sh.order.push(iid); sh.items.set(iid, a); } else sh.items.delete(iid); mark(sh.id, iid); }
    if (list.some(([, , a]) => !a)) sh.order = sh.order.filter((x) => sh.items.has(x));
    if (newOrder) { sh.order = newOrder.filter((x) => sh.items.has(x)); iorderDirty.add(sh.id); }
    for (const [iid] of list) draw(sh, iid);
    if (newOrder) restack(sh);
    if (record) { hist.push({ sid: sh.id, list, ob, oa: sh.order.slice() }); if (hist.length > 300) hist.shift(); fut = []; }
    if (selSheet === sh) for (const x of [...sel]) if (!sh.items.has(x)) sel.delete(x);
    queueSave();
    thumbLater(sh);
    afterChange();
  }
  function travel(from, to, back) {
    let e;
    while ((e = from.pop()) && !byId(e.sid));
    if (!e) return;
    const sh = byId(e.sid);
    for (const [iid, b, a] of e.list) { const v = back ? b : a; if (v) sh.items.set(iid, v); else sh.items.delete(iid); mark(sh.id, iid); }
    sh.order = (back ? e.ob : e.oa).filter((x) => sh.items.has(x));
    for (const x of sh.items.keys()) if (!sh.order.includes(x)) sh.order.push(x);
    iorderDirty.add(sh.id);
    for (const [iid] of e.list) draw(sh, iid);
    restack(sh);
    to.push(e);
    select(sh, e.list.map(([iid]) => iid).filter((x) => sh.items.has(x)));
    queueSave();
    thumbLater(sh);
    afterChange();
  }
  /** In the document, the history of the browser (the text of each sheet); by hand, the history of the ink. */
  function undo() { if (mode === 'doc') { restoreCaret(); document.execCommand('undo'); } else travel(hist, fut, true); }
  function redo() { if (mode === 'doc') { restoreCaret(); document.execCommand('redo'); } else travel(fut, hist, false); }
  function afterChange() { if (mode === 'ink') { undoB.button.disabled = !hist.length; redoB.button.disabled = !fut.length; } drawOverlay(); buildProps(); }

  let saving = false, again = false, timer = 0, fails = 0;
  const pending = () => dirtyItems.size || dirtyMeta.size || dropped.size || iorderDirty.size || orderDirty || titleDirty || setDirty;
  const setStatus = (k) => { status.dataset.k = k; status.replaceChildren(icon({ saved: 'cloud-check', saving: 'cloud-upload', wait: 'cloud-upload', error: 'cloud-off', offline: 'cloud-off' }[k]), h('span.lbl', t({ saved: 'saved', saving: 'saving', wait: 'saving', error: 'not_saved', offline: 'offline_wait' }[k]))); status.title = t({ saved: 'saved', saving: 'saving', wait: 'saving', error: 'not_saved', offline: 'offline_wait' }[k]); };
  function queueSave(delay = 900) {
    if (pending()) setStatus('wait');
    clearTimeout(timer);
    timer = setTimeout(() => flush(), delay);
  }
  async function flush(leaving = false) {
    clearTimeout(timer);
    if (saving) { again = true; return; }
    if (!pending() && !viewDirty) { if (status.dataset.k !== 'error' && status.dataset.k !== 'offline') setStatus('saved'); return; }
    const body = { id: N.id, base: version, lang: getLang() };
    const put_ = [], del = [];
    for (const [sid, set] of dirtyItems) { const sh = byId(sid); if (!sh) continue; for (const iid of set) { const i = sh.items.get(iid); if (i) put_.push([sid, i]); else del.push([sid, iid]); } }
    const metas = [...dirtyMeta].map(byId).filter(Boolean).map((sh) => { sh.doc = cleanDoc(sh.dom.doc.innerHTML); return { id: sh.id, ...paperOf(sh), doc: sh.doc }; });
    if (metas.length) body.sheets = metas;
    if (dropped.size) body.drop = [...dropped];
    if (orderDirty) body.order = sheets.map((s) => s.id);
    if (put_.length) body.put = put_;
    if (del.length) body.del = del;
    if (iorderDirty.size) body.iorder = [...iorderDirty].map(byId).filter(Boolean).map((sh) => [sh.id, sh.order.slice()]);
    if (titleDirty) body.title = title;
    if (setDirty || viewDirty) body.settings = { ...settings, view: { z: r2(z / fitZ()), at: cur } };
    const sent = { items: new Map([...dirtyItems].map(([k, v]) => [k, new Set(v)])), meta: new Set(dirtyMeta), dropped: new Set(dropped), iorder: new Set(iorderDirty), orderDirty, titleDirty, setDirty, viewDirty };
    dirtyItems.clear(); dirtyMeta.clear(); dropped.clear(); iorderDirty.clear(); orderDirty = titleDirty = setDirty = viewDirty = false;
    saving = true;
    const real = put_.length || del.length || metas.length || sent.dropped.size || sent.orderDirty || sent.titleDirty || sent.setDirty || sent.iorder.size;
    if (real) setStatus('saving');
    try {
      const res = await api('nb.save', body);
      version = res.version;
      fails = 0;
      if (!pending()) dropOff('savnotes', N.id); // everything left: nothing to keep in this browser
      setStatus(pending() ? 'wait' : 'saved');
      const card = S.notebooks.find((b) => b.id === N.id);
      if (card) Object.assign(card, { title, version, sheets: sheets.length, cover: settings.cover, size: settings.size, orient: settings.orient, paper: settings.paper, updated: res.updated || card.updated });
      if (res.stale && !pending()) await refresh();
    } catch (e) {
      for (const [k, v] of sent.items) for (const x of v) mark(k, x);
      for (const x of sent.meta) dirtyMeta.add(x);
      for (const x of sent.dropped) dropped.add(x);
      for (const x of sent.iorder) iorderDirty.add(x);
      orderDirty ||= sent.orderDirty; titleDirty ||= sent.titleDirty; setDirty ||= sent.setDirty; viewDirty ||= sent.viewDirty;
      fails++;
      setStatus(e.code === 'network' ? 'offline' : 'error');
      if (e.code === 'network') keepHere(); // no network: a copy stays in this browser, even if the page is closed
      if (e.code === 'notebook_big' || e.code === 'not_found' || e.code === 'unauthenticated') { fail(e); if (e.code !== 'notebook_big') return; }
      if (!gone) timer = setTimeout(() => flush(), Math.min(30000, 1500 * 2 ** fails));
    } finally {
      saving = false;
      if (again) { again = false; flush(leaving); }
    }
  }
  /** The notebook as it is here, kept in this browser until it can be saved. */
  const keepHere = () => keepOff('savnotes', N.id, { title, settings: { ...settings }, list: sheets.map(dataOf) });
  /** Another window saved this notebook: its sheets come here (nothing is waiting to leave from this window). */
  async function refresh() {
    const x = await api('nb.get', undefined, { id: N.id, quiet: 1 });
    const b = x.notebook;
    version = b.version;
    if (JSON.stringify(b.list) === JSON.stringify(sheets.map(dataOf))) return;
    const top = scroller.scrollTop;
    sheets = b.list.map(fromData);
    Object.assign(settings, b.settings);
    title = b.title;
    titleIn.value = title;
    hist = []; fut = [];
    selSheet = null; sel.clear();
    renderAll();
    scroller.scrollTop = top;
    afterChange();
    toast(t('stale'), 'neutral');
  }

  // ---------------------------------------------------------------- sheets: add, move, remove
  function addSheet(at = sheets.length, data = null, scroll = true) {
    const sh = fromData(data || newSheet(settings.paper));
    sheets.splice(at, 0, sh);
    const box = renderSheet(sh);
    const next = sheets[at + 1];
    stack.insertBefore(box, next ? next.dom.box : endTile);
    dirtyMeta.add(sh.id);
    for (const x of sh.order) mark(sh.id, x);
    orderDirty = true;
    numberSheets();
    buildSide();
    queueSave();
    if (scroll) requestAnimationFrame(() => goSheet(at));
    return sh;
  }
  async function removeSheet(sh) {
    const empty = !sh.items.size && docEmpty(sh.dom.doc.innerHTML);
    if (!empty && !(await confirm(t('sheet_delete'), t('sheet_delete_t'), t('delete')))) return;
    const n = idx(sh);
    sheets.splice(n, 1);
    sh.dom.box.remove();
    dropped.add(sh.id);
    dirtyMeta.delete(sh.id); dirtyItems.delete(sh.id); iorderDirty.delete(sh.id);
    if (selSheet === sh) { selSheet = null; sel.clear(); }
    orderDirty = true;
    if (!sheets.length) addSheet(0, null, false);
    numberSheets();
    buildSide();
    queueSave();
    onScroll();
  }
  function moveSheet(sh, d) {
    const n = idx(sh), m = n + d;
    if (m < 0 || m >= sheets.length) return;
    sheets.splice(n, 1);
    sheets.splice(m, 0, sh);
    const next = sheets[m + 1];
    stack.insertBefore(sh.dom.box, next ? next.dom.box : endTile);
    orderDirty = true;
    numberSheets();
    buildSide();
    queueSave();
    requestAnimationFrame(() => goSheet(m, false));
  }
  const dupSheet = (sh) => addSheet(idx(sh) + 1, freshSheet(dataOf(sh)));
  function setPaper(sh, patch, all = false) {
    for (const s of all ? sheets : [sh]) { Object.assign(s, patch); paintPaper(s); if ('bg' in patch) redrawAll(s); dirtyMeta.add(s.id); thumbLater(s); reflowLater(s); }
    queueSave();
    buildProps();
  }

  // ---------------------------------------------------------------- the sheets on the side
  const side = h('aside.side', { 'aria-label': t('sheets') });
  const thumbs = new Map();
  let sideOpen = P.side ?? !mobile();
  function buildSide() {
    const list = h('div.thumbs');
    thumbs.clear();
    sheets.forEach((sh, n) => {
      const pic = h('div.tpic', { style: `aspect-ratio:${W}/${H}` });
      const menu = drop(h('sav-button.tmenu', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true }), () => [
        ['copy-plus', t('sheet_dup'), () => dupSheet(sh)], ['file-plus', t('add_sheet_after'), () => addSheet(idx(sh) + 1)],
        ['arrow-up', t('sheet_up'), () => moveSheet(sh, -1), { disabled: idx(sh) === 0 }], ['arrow-down', t('sheet_down'), () => moveSheet(sh, 1), { disabled: idx(sh) === sheets.length - 1 }],
        '-', ['trash', t('sheet_delete'), () => removeSheet(sh), { danger: true }],
      ], { placement: 'bottom-start', label: t('sheet_n', { n: idx(sh) + 1 }) });
      const tile = h('div.thumb', { 'data-id': sh.id, draggable: 'true', tabindex: '0', role: 'button', 'aria-label': t('sheet_n', { n: n + 1 }) }, pic, h('div.tfoot', h('span', String(n + 1)), menu));
      tile.addEventListener('click', (e) => { if (e.composedPath().some((x) => x.localName === 'sav-dropdown')) return; goSheet(idx(sh)); if (mobile()) toggleSide(false); });
      tile.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goSheet(idx(sh)); } });
      // dragging a small sheet over another moves it there
      tile.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-savnotes-sheet', sh.id); e.dataTransfer.effectAllowed = 'move'; tile.classList.add('dragging'); });
      tile.addEventListener('dragend', () => tile.classList.remove('dragging'));
      tile.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-savnotes-sheet')) { e.preventDefault(); tile.classList.add('over'); } });
      tile.addEventListener('dragleave', () => tile.classList.remove('over'));
      tile.addEventListener('drop', (e) => { const from = byId(e.dataTransfer.getData('text/x-savnotes-sheet')); tile.classList.remove('over'); if (!from || from === sh) return; e.preventDefault(); e.stopPropagation(); moveSheet(from, idx(sh) - idx(from)); });
      thumbs.set(sh.id, pic);
      paintThumb(sh);
      list.append(tile);
    });
    put(side, h('div.shead', h('b', t('sheets')), h('span.spacer'), h('small.muted', String(sheets.length))), list, btn(t('add_sheet'), { icon: 'plus', size: 'sm', appearance: 'outline', class: 'addsheet', onclick: () => addSheet(cur + 1) }));
    markSide();
  }
  function paintThumb(sh) { const pic = thumbs.get(sh.id); if (pic) pic.innerHTML = sheetSVG(settings, dataOf(sh), { id: 'th' + sh.id }).replace(/ width="\d+" height="\d+"/, ''); }
  const thumbTimers = new Map();
  // the small picture in the list of sheets: never while a pen or a finger is on the sheets (drawing it takes a moment on a tablet)
  const thumbLater = (sh) => { clearTimeout(thumbTimers.get(sh.id)); thumbTimers.set(sh.id, setTimeout(() => { if (gone) return; if (action || pointers.size) thumbLater(sh); else paintThumb(sh); }, 700)); };
  function markSide() {
    const sh = sheets[cur];
    side.querySelectorAll('.thumb').forEach((x) => { const on = x.dataset.id === sh?.id; x.classList.toggle('on', on); if (on) x.setAttribute('aria-current', 'true'); else x.removeAttribute('aria-current'); });
    side.querySelector('.thumb.on')?.scrollIntoView?.({ block: 'nearest' });
  }
  function toggleSide(v = !sideOpen) { const fitted = Math.abs(z - fitZ()) < .01; sideOpen = v; wrap.classList.toggle('sideopen', v); sideB.on(v); setPrefs({ side: v }).catch(() => {}); if (fitted && !mobile()) setTimeout(() => setZ(fitZ()), 220); }

  // ---------------------------------------------------------------- the typed text
  let lastDoc = null, lastRange = null;
  const docOf = (n) => n?.closest?.('.doc') || n?.parentElement?.closest?.('.doc');
  const sheetOfDoc = (d) => sheets.find((s) => s.dom.doc === d);
  function onSelection() {
    const s = getSelection();
    if (!s.rangeCount) return;
    const d = docOf(s.anchorNode);
    if (!d || !stack.contains(d)) return;
    lastDoc = d;
    lastRange = s.getRangeAt(0).cloneRange();
    if (mode === 'doc') syncFormat();
    const sh = sheetOfDoc(d), n = sh ? idx(sh) : -1;
    if (n >= 0 && n !== cur) { cur = n; markSide(); pageLabel.textContent = `${cur + 1} / ${sheets.length}`; }
  }
  /** The caret goes back where it was before a button of the bar was pressed. */
  function restoreCaret() {
    const d = lastDoc && stack.contains(lastDoc) ? lastDoc : sheets[cur]?.dom.doc;
    if (!d) return null;
    d.focus({ preventScroll: true });
    if (lastRange && d.contains(lastRange.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(lastRange); }
    return d;
  }
  function docInput(sh) {
    dirtyMeta.add(sh.id);
    queueSave();
    thumbLater(sh);
    reflowLater(sh);
  }
  /**
   * A sheet that is full: the paragraphs that do not fit go at the top of the next sheet (a new one when it is the last),
   * and the caret goes with them. A single paragraph longer than a sheet stays (it is cut at the bottom).
   */
  const reflowQ = new Set();
  let reflowRaf = 0;
  function reflowLater(sh) { reflowQ.add(sh); if (!reflowRaf) reflowRaf = requestAnimationFrame(() => { reflowRaf = 0; const l = [...reflowQ]; reflowQ.clear(); l.forEach((x) => sheets.includes(x) && reflow(x)); }); }
  function reflow(sh, depth = 0) {
    const d = sh.dom.doc;
    if (d.scrollHeight <= d.clientHeight + 1 || d.childNodes.length < 2 || depth > 40) { sh.dom.el.classList.toggle('full', d.scrollHeight > d.clientHeight + 1); return; }
    const sel = getSelection(), r0 = sel.rangeCount && d.contains(sel.anchorNode) ? sel.getRangeAt(0) : null;
    const keep = r0 ? [r0.startContainer, r0.startOffset] : null;
    // whole paragraphs go; a long list or quote is split between its items, the second part in a copy of it
    const out = [], CONT = ['ul', 'ol', 'blockquote'];
    let part = null, from = null;
    while (d.scrollHeight > d.clientHeight + 1) {
      const n = d.lastChild;
      if (n?.nodeType === 1 && CONT.includes(n.localName) && n.childNodes.length > 1) {
        if (from !== n) { part = n.cloneNode(false); from = n; out.unshift(part); }
        part.prepend(n.lastChild);
      } else if (d.childNodes.length > 1) { out.unshift(n); n.remove(); from = null; }
      else break;
    }
    // whitespace between blocks does not need to travel
    while (out.length && out[0].nodeType === 3 && !out[0].textContent.trim()) out.shift();
    sh.dom.el.classList.remove('full');
    if (!out.length) return;
    let next = sheets[idx(sh) + 1];
    if (!next) next = addSheet(idx(sh) + 1, { ...newSheet(paperOf(sh)) }, false);
    const nd = next.dom.doc;
    if (docEmpty(nd.innerHTML)) nd.replaceChildren();
    // the rest of a list that already goes on there joins it
    const tail = out[out.length - 1], head = nd.firstElementChild;
    if (tail?.nodeType === 1 && head && tail.localName === head.localName && CONT.includes(head.localName) && tail.className === head.className) { tail.append(...head.childNodes); head.remove(); }
    nd.prepend(...out);
    docInput(sh);
    docInput(next);
    if (keep && nd.contains(keep[0])) {
      nd.focus({ preventScroll: true });
      const rr = document.createRange();
      try { rr.setStart(keep[0], Math.min(keep[1], keep[0].nodeType === 3 ? keep[0].length : keep[0].childNodes.length)); rr.collapse(true); sel.removeAllRanges(); sel.addRange(rr); } catch { /* the node changed */ }
      const b = next.dom.el.getBoundingClientRect(), sb = scroller.getBoundingClientRect();
      if (b.top > sb.bottom - 120 || b.bottom < sb.top) scroller.scrollBy({ top: b.top - sb.top - 40, behavior: 'smooth' });
    }
    if (nd.scrollHeight > nd.clientHeight + 1) reflow(next, depth + 1);
  }
  /** Backspace at the very start of a sheet: its first paragraph joins the end of the sheet before, if it fits. */
  function joinBack(sh, e) {
    const n = idx(sh), prev = sheets[n - 1], s = getSelection();
    if (!prev || !s.isCollapsed || !s.rangeCount) return;
    const d = sh.dom.doc, r = s.getRangeAt(0), probe = document.createRange();
    probe.setStart(d, 0);
    probe.setEnd(r.startContainer, r.startOffset);
    if (probe.toString().length || probe.cloneContents().querySelector?.('br,hr,li')) return;
    e.preventDefault();
    const first = d.firstChild, pd = prev.dom.doc;
    if (!first) return;
    if (docEmpty(pd.innerHTML)) pd.replaceChildren();
    pd.append(first);
    pd.focus({ preventScroll: true });
    const rr = document.createRange();
    rr.setStart(first, 0); rr.collapse(true); s.removeAllRanges(); s.addRange(rr);
    if (!d.childNodes.length) d.innerHTML = '<p><br></p>';
    docInput(sh); docInput(prev);
  }
  /** Markdown at the start of a line: "- " a list, "1. " numbers, "[] " a checklist, "# " a title, "> " a quote. */
  function autoFormat(e) {
    if (e.inputType !== 'insertText' || e.data !== ' ') return;
    const s = getSelection();
    if (!s.rangeCount || !s.isCollapsed) return;
    const node = s.anchorNode;
    if (!node || node.nodeType !== 3) return;
    const block = node.parentElement.closest('p,div:not(.doc),h1,h2,h3,blockquote,li');
    if (!block || block.localName === 'li' || block.textContent !== node.textContent || s.anchorOffset !== node.textContent.length) return;
    const m = /^(-|\*|1\.|\[\]|\[ \]|#{1,3}|>)$/.exec(node.textContent.replace(/\u00a0/g, ' ').trim());
    if (!m) return;
    e.preventDefault();
    block.innerHTML = '<br>';
    const rr = document.createRange(); rr.setStart(block, 0); rr.collapse(true); s.removeAllRanges(); s.addRange(rr);
    const k = m[1];
    if (k === '-' || k === '*') document.execCommand('insertUnorderedList');
    else if (k === '1.') document.execCommand('insertOrderedList');
    else if (k.startsWith('[')) checklist(true);
    else if (k === '>') document.execCommand('formatBlock', false, '<blockquote>');
    else document.execCommand('formatBlock', false, '<h' + k.length + '>');
    const sh = sheetOfDoc(docOf(block) || lastDoc);
    if (sh) docInput(sh);
    syncFormat();
  }
  function checklist(on) {
    const s = getSelection(), li = docOf(s.anchorNode) && s.anchorNode?.parentElement?.closest('li');
    let ul = li?.closest('ul,ol');
    if (!ul || ul.localName === 'ol') { document.execCommand('insertUnorderedList'); ul = getSelection().anchorNode?.parentElement?.closest('ul') || (getSelection().anchorNode?.localName === 'ul' ? getSelection().anchorNode : null); if (!ul) { const n = getSelection().anchorNode; ul = (n?.nodeType === 1 ? n : n?.parentElement)?.closest('ul'); } }
    if (!ul) return;
    if (on === undefined) on = !ul.classList.contains('chk');
    ul.classList.toggle('chk', on);
    if (!on) { ul.removeAttribute('class'); ul.querySelectorAll(':scope>li').forEach((x) => x.removeAttribute('data-checked')); }
    else ul.querySelectorAll(':scope>li').forEach((x) => { if (!x.hasAttribute('data-checked')) x.setAttribute('data-checked', '0'); });
  }
  function onDocKey(e) {
    const d = e.currentTarget, sh = sheetOfDoc(d);
    if (!sh) return;
    if (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey && !e.altKey) joinBack(sh, e);
    if (e.key === 'Tab') {
      e.preventDefault();
      const li = getSelection().anchorNode?.parentElement?.closest('li');
      if (li) document.execCommand(e.shiftKey ? 'outdent' : 'indent');
      else if (!e.shiftKey) document.execCommand('insertText', false, '\t');
    }
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); flush(); }
      if (e.shiftKey && k === '7') { e.preventDefault(); document.execCommand('insertOrderedList'); }
      if (e.shiftKey && k === '8') { e.preventDefault(); document.execCommand('insertUnorderedList'); }
      if (e.shiftKey && k === '9') { e.preventDefault(); checklist(); docInput(sh); }
    }
    if (e.altKey && (e.metaKey || e.ctrlKey) && ['0', '1', '2', '3'].includes(e.key)) { e.preventDefault(); document.execCommand('formatBlock', false, e.key === '0' ? '<p>' : `<h${e.key}>`); }
  }
  function onDocClick(e) {
    // the box of a checklist: a click on the left of the line ticks it
    const li = e.target.closest?.('ul.chk>li');
    if (!li || mode !== 'doc') return;
    if (e.clientX < li.getBoundingClientRect().left) { e.preventDefault(); li.setAttribute('data-checked', li.getAttribute('data-checked') === '1' ? '0' : '1'); docInput(sheetOfDoc(e.currentTarget)); }
  }
  function onDocPaste(e) {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); const sh = sheetOfDoc(e.currentTarget); files.forEach((f) => addImage(f, sh)); return; }
    const html = e.clipboardData?.getData('text/html'), text = e.clipboardData?.getData('text/plain');
    e.preventDefault();
    if (html) document.execCommand('insertHTML', false, cleanDoc(html.replace(/<!--[\s\S]*?-->/g, '')) || '');
    else if (text) document.execCommand('insertText', false, text);
  }
  stack.addEventListener('beforeinput', (e) => { if (mode === 'doc' && docOf(e.target)) autoFormat(e); });
  stack.addEventListener('input', (e) => { const d = docOf(e.target); const sh = d && sheetOfDoc(d); if (sh) docInput(sh); });
  stack.addEventListener('keydown', (e) => { const d = docOf(e.target); if (d) onDocKey({ ...e, currentTarget: d, key: e.key, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, preventDefault: () => e.preventDefault() }); });
  stack.addEventListener('click', (e) => { const d = docOf(e.target); if (d) onDocClick({ target: e.target, clientX: e.clientX, currentTarget: d, preventDefault: () => e.preventDefault() }); });
  stack.addEventListener('paste', (e) => { const d = docOf(e.target); if (d && mode === 'doc') onDocPaste({ clipboardData: e.clipboardData, currentTarget: d, preventDefault: () => e.preventDefault() }); });
  stack.addEventListener('focusin', (e) => { const d = docOf(e.target); if (d && mode === 'doc' && !d.childNodes.length) { d.innerHTML = '<p><br></p>'; const rr = document.createRange(); rr.setStart(d.firstChild, 0); rr.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(rr); } });

  /** A command of the bar on the text where the caret was. */
  function cmd(name, value = null) {
    const d = restoreCaret();
    if (!d) return;
    document.execCommand('styleWithCSS', false, name === 'hiliteColor' || name === 'foreColor');
    document.execCommand(name, false, value);
    const sh = sheetOfDoc(d);
    if (sh) docInput(sh);
    syncFormat();
  }
  function block(tag) { cmd('formatBlock', `<${tag}>`); }

  // ---------------------------------------------------------------- selection of the ink (one sheet at a time)
  const sel = new Set();
  let selSheet = null, marquee = null, eraserAt = null;
  const overDrawn = new Set();
  const selItems = () => (selSheet ? [...sel].map((x) => selSheet.items.get(x)).filter(Boolean) : []);
  /** The size of the eraser just chosen: its circle for a moment in the middle of the sheet in view. */
  let flashT = 0;
  function showEraser() {
    const sh = sheets[cur], sb = scroller.getBoundingClientRect();
    if (!sh?.dom || action) return;
    const [x, y] = toPage(sh, sb.left + scroller.clientWidth / 2, sb.top + scroller.clientHeight / 2);
    const at = (eraserAt = { sh, x: clamp(x, 0, W), y: clamp(y, 0, H), flash: true });
    drawOverlay();
    clearTimeout(flashT);
    flashT = setTimeout(() => { if (eraserAt === at) { eraserAt = null; drawOverlay(); } }, 1100);
  }
  function drawOverlay() {
    for (const sh of overDrawn) { if (sh.dom?.over.firstChild) sh.dom.over.replaceChildren(); if (sh.dom?.cursor.firstChild) sh.dom.cursor.replaceChildren(); }
    overDrawn.clear();
    const k = 1 / z;
    if (marquee) {
      const { sh, x0, y0, x1, y1 } = marquee;
      sh.dom.over.append(svgEl('rect', { class: 'marq', x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) }));
      overDrawn.add(sh);
    }
    if (eraserAt && tool === 'eraser' && mode === 'ink' && eraserAt.sh.dom) {
      const { sh, x, y, touch } = eraserAt, r = opt('eraser').s / 2 * k, o = sh.dom.cursor;
      o.append(svgEl('circle', { class: 'ercur' + (eraserAt.flash ? ' flash' : ''), cx: x, cy: y, r }));
      // a finger covers the circle under it: the same circle again above the finger, joined to it, shows its size
      if (touch) { const gy = y - r * 2 - 56 * k; o.append(svgEl('line', { class: 'erlink', x1: x, y1: y - r, x2: x, y2: gy + r }), svgEl('circle', { class: 'ercur ghost', cx: x, cy: gy, r })); }
      overDrawn.add(sh);
    }
    const list = selItems();
    if (!list.length || mode !== 'ink') return;
    const o = selSheet.dom.over;
    overDrawn.add(selSheet);
    if (list.length === 1 && list[0].t === 'shape' && (list[0].k === 'line' || list[0].k === 'arrow')) {
      const i = list[0];
      o.append(svgEl('line', { class: 'selbox', x1: i.x, y1: i.y, x2: i.x + i.w, y2: i.y + i.h }), svgEl('circle', { class: 'hd', 'data-h': 'a', cx: i.x, cy: i.y, r: 6 * k }), svgEl('circle', { class: 'hd', 'data-h': 'b', cx: i.x + i.w, cy: i.y + i.h, r: 6 * k }));
      return;
    }
    const b = union(list), p = 4 * k, s = 12 * k, x0 = b.x - p, y0 = b.y - p, x1 = b.x + b.w + p, y1 = b.y + b.h + p;
    o.append(svgEl('rect', { class: 'selbox', x: x0, y: y0, width: x1 - x0, height: y1 - y0 }));
    for (const [hk, x, y] of [['nw', x0, y0], ['ne', x1, y0], ['se', x1, y1], ['sw', x0, y1]]) o.append(svgEl('rect', { class: 'hd', 'data-h': hk, x: x - s / 2, y: y - s / 2, width: s, height: s, rx: 3 * k }));
  }
  function select(sh, ids, add = false) {
    if (selSheet !== sh || !add) sel.clear();
    selSheet = ids.length || add ? sh : null;
    for (const x of ids) sel.add(x);
    drawOverlay();
    buildProps();
  }

  // ---------------------------------------------------------------- tools of the ink
  let action = null;
  const pointers = new Map();
  let gesture = null;
  const toPage = (sh, cx, cy) => { const b = sh.dom.el.getBoundingClientRect(); return [(cx - b.left) / z, (cy - b.top) / z]; };
  const topAt = (sh, x, y, tol) => { for (let k = sh.order.length - 1; k >= 0; k--) { const i = sh.items.get(sh.order[k]); if (i && hits(i, x, y, tol)) return i; } return null; };
  const tol = () => 6 / z;
  const smooth = () => clamp(P.smooth ?? .45, 0, .85);

  function strokeAction(sh, e, kind) {
    const o = opt(kind), item = { id: uid(), t: 'stroke', tool: kind, c: kind === 'marker' ? o.c : inkOn(o.c, sh.bg), s: r2(o.s / z), p: [] };
    const live = svgEl('g');
    sh.dom.liveG.append(live);
    let last = null, lastT = e.timeStamp, sim = .55, raf = 0, raw = null;
    const add = (ev) => {
      const [wx, wy] = toPage(sh, ev.clientX, ev.clientY);
      raw = [wx, wy];
      let pr = .5;
      if (kind !== 'marker') {
        if (ev.pointerType === 'pen' && P.pressure !== false && ev.pressure > 0) pr = clamp(ev.pressure, .05, 1);
        else if (last) { const d = Math.hypot(wx - last[0], wy - last[1]) * z, dt = Math.max(1, ev.timeStamp - lastT), v = d / dt; sim = sim * .75 + clamp(.78 - v * .16, .2, .8) * .25; pr = sim; }
        else pr = sim;
      }
      let x = wx, y = wy;
      if (last) {
        if (Math.hypot(wx - last[0], wy - last[1]) * z < 1.1) return;
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
    const piece = (a, b) => itemSVG({ ...item, p: item.p.slice(a * 3, b * 3), _ts: a > 0, _te: b < item.p.length / 3 }, isDark(sh.bg));
    const paint = () => {
      raf = 0;
      const n = item.p.length / 3;
      if (kind !== 'marker' && n - from > 120) { tail.innerHTML = piece(from, n); from = n - 2; tail = svgEl('g'); live.append(tail); }
      tail.innerHTML = itemSVG({ ...item, p: item.p.slice(from * 3), _ts: from > 0 }, isDark(sh.bg));
    };
    add(e);
    paint();
    return {
      id: e.pointerId,
      move(ev) { for (const c of coalesced(ev)) add(c); if (!raf) raf = requestAnimationFrame(paint); },
      up() {
        cancelAnimationFrame(raf);
        if (raw && last && Math.hypot(raw[0] - last[0], raw[1] - last[1]) * z > .6) item.p.push(r2(raw[0]), r2(raw[1]), item.p[item.p.length - 1]);
        live.remove();
        if (item.p.length) change(sh, [[item.id, null, item]]);
      },
      cancel() { cancelAnimationFrame(raf); live.remove(); },
    };
  }

  function eraserAction(sh, e) {
    // on a tablet or a phone the path is looked at a little less densely (a circle every radius instead of every half radius):
    // as precise to the eye, half the work
    const LIGHT = navigator.maxTouchPoints > 1 && matchMedia('(any-pointer: coarse)').matches ? 1 : .5;
    const o = opt('eraser'), r = o.s / 2 / z, before = new Map(), created = new Set();
    let last = null;
    // what the eraser changed is drawn once per frame (it may cut the same stroke many times between two frames)
    const redraw = new Set();
    let drawRaf = 0, reorder = false;
    const later = (x2) => { redraw.add(x2); if (!drawRaf) drawRaf = requestAnimationFrame(flush); };
    function flush() { cancelAnimationFrame(drawRaf); drawRaf = 0; for (const x2 of redraw) draw(sh, x2); redraw.clear(); if (reorder) { reorder = false; restack(sh); } }
    const at = (x, y) => {
      for (let k = sh.order.length - 1; k >= 0; k--) {
        const idk = sh.order[k], i = sh.items.get(idk);
        if (!i) continue;
        const b = bounds(i);
        if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) continue;
        if (i.t === 'stroke' && o.mode !== 'whole') {
          const runs = cut(i, x, y, r);
          if (!runs) continue;
          if (!before.has(idk) && !created.has(idk)) before.set(idk, i);
          const pieces = runs.filter((p) => p.length >= 3);
          if (pieces.length) sh.items.set(idk, { ...i, p: pieces[0] }); else sh.items.delete(idk);
          const extra = pieces.slice(1).map((p) => ({ ...i, id: uid(), p }));
          sh.order.splice(k + 1, 0, ...extra.map((x2) => x2.id));
          for (const x2 of extra) { sh.items.set(x2.id, x2); created.add(x2.id); }
          if (!pieces.length) sh.order.splice(k, 1);
          later(idk);
          for (const x2 of extra) later(x2.id);
          if (extra.length) reorder = true;
        } else if (hits(i, x, y, r)) {
          if (!before.has(idk) && !created.has(idk)) before.set(idk, i);
          sh.items.delete(idk); sh.order.splice(k, 1); later(idk);
        }
      }
    };
    const step = (ev) => {
      const [x, y] = toPage(sh, ev.clientX, ev.clientY);
      if (last) { const d = Math.hypot(x - last[0], y - last[1]), n = Math.ceil(d / (r * LIGHT)); for (let k = 1; k <= n; k++) at(last[0] + (x - last[0]) * k / n, last[1] + (y - last[1]) * k / n); } else at(x, y);
      last = [x, y];
      eraserAt = { sh, x, y, touch: ev.pointerType === 'touch' };
      drawOverlay();
    };
    step(e);
    return {
      id: e.pointerId,
      move(ev) { for (const c of coalesced(ev)) step(c); },
      up() {
        flush();
        const list = [...before].map(([k, b]) => [k, b, sh.items.get(k) || null]).concat([...created].map((k) => [k, null, sh.items.get(k) || null]));
        // what the eraser did is already on screen: it goes into the history and the save as one change
        const ord = sh.order.slice();
        for (const [k, b] of before) sh.items.set(k, b);
        for (const k of created) sh.items.delete(k);
        sh.order = sh.order.filter((x) => sh.items.has(x));
        for (const [k] of before) if (!sh.order.includes(k)) sh.order.push(k);
        change(sh, list, ord);
        // lifted: the circle stays a moment where the finger was, then goes (a mouse or a stylus keep it while hovering)
        if (eraserAt?.touch) { const was = eraserAt; setTimeout(() => { if (eraserAt === was && !action) { eraserAt = null; drawOverlay(); } }, 550); }
      },
      cancel() { this.up(); },
    };
  }

  function shapeAction(sh, e) {
    const o = opt('shape'), [x0, y0] = toPage(sh, e.clientX, e.clientY), live = svgEl('g');
    sh.dom.liveG.append(live);
    const item = { id: uid(), t: 'shape', k: o.k, x: r2(x0), y: r2(y0), w: 0, h: 0, c: inkOn(o.c, sh.bg), s: r2(o.s / z), f: o.f, d: !!o.d };
    const line = o.k === 'line' || o.k === 'arrow';
    let did = false;
    const upd = (ev) => {
      let [x, y] = toPage(sh, ev.clientX, ev.clientY), w = x - x0, hh = y - y0;
      if (Math.hypot(w, hh) * z > 4) did = true;
      if (ev.shiftKey) {
        if (line) { const a = Math.round(Math.atan2(hh, w) / (Math.PI / 4)) * (Math.PI / 4), L = Math.hypot(w, hh); w = Math.cos(a) * L; hh = Math.sin(a) * L; }
        else { const m = Math.max(Math.abs(w), Math.abs(hh)); w = Math.sign(w || 1) * m; hh = Math.sign(hh || 1) * m; }
      }
      if (line) Object.assign(item, { x: r2(x0), y: r2(y0), w: r2(w), h: r2(hh) });
      else Object.assign(item, { x: r2(Math.min(x0, x0 + w)), y: r2(Math.min(y0, y0 + hh)), w: r2(Math.abs(w)), h: r2(Math.abs(hh)) });
      live.innerHTML = itemSVG(item, isDark(sh.bg));
    };
    return {
      id: e.pointerId,
      move: upd,
      up() {
        live.remove();
        if (!did) { const w = 140 / z, hh = (line ? 0 : 96) / z; Object.assign(item, line ? { x: r2(x0 - w / 2), y: r2(y0), w: r2(w), h: 0 } : { x: r2(x0 - w / 2), y: r2(y0 - hh / 2), w: r2(w), h: r2(hh) }); }
        change(sh, [[item.id, null, item]]);
      },
      cancel() { live.remove(); },
    };
  }

  function selectAction(sh, e) {
    const [x, y] = toPage(sh, e.clientX, e.clientY), handle = e.target?.dataset?.h;
    if (handle && selSheet === sh) return resizeAction(sh, e, handle);
    const hit = topAt(sh, x, y, tol());
    if (!hit) {
      if (!e.shiftKey || selSheet !== sh) select(sh, []);
      marquee = { sh, x0: x, y0: y, x1: x, y1: y };
      const base = new Set(selSheet === sh ? sel : []);
      return {
        id: e.pointerId,
        move(ev) { const [a, b] = toPage(sh, ev.clientX, ev.clientY); marquee.x1 = a; marquee.y1 = b; const box = { x: Math.min(marquee.x0, a), y: Math.min(marquee.y0, b), w: Math.abs(a - marquee.x0), h: Math.abs(b - marquee.y0) }; sel.clear(); selSheet = sh; for (const k of base) sel.add(k); for (const k of sh.order) if (overlaps(bounds(sh.items.get(k)), box)) sel.add(k); drawOverlay(); },
        up() { marquee = null; if (!sel.size) selSheet = null; drawOverlay(); buildProps(); },
        cancel() { marquee = null; drawOverlay(); },
      };
    }
    const wasSel = selSheet === sh && sel.has(hit.id);
    if (e.shiftKey && selSheet === sh) { if (!wasSel) select(sh, [hit.id], true); } else if (!wasSel) select(sh, [hit.id]);
    const start = new Map(selItems().map((i) => [i.id, i]));
    let dx = 0, dy = 0, did = false;
    return {
      id: e.pointerId,
      move(ev) {
        const [a, b] = toPage(sh, ev.clientX, ev.clientY);
        dx = a - x; dy = b - y;
        if (!did && Math.hypot(dx, dy) * z < 3) return;
        did = true;
        for (const [k, i] of start) { sh.items.set(k, moved(i, dx, dy)); draw(sh, k); }
        drawOverlay();
      },
      up() {
        if (!did) { if (e.shiftKey && wasSel) { sel.delete(hit.id); drawOverlay(); buildProps(); } return; }
        change(sh, [...start].map(([k, i]) => [k, i, moved(i, dx, dy)]));
      },
      cancel() { for (const [k, i] of start) { sh.items.set(k, i); draw(sh, k); } drawOverlay(); },
    };
  }

  function resizeAction(sh, e, handle) {
    const list = selItems(), start = new Map(list.map((i) => [i.id, i]));
    if (handle === 'a' || handle === 'b') {
      const i = list[0];
      return {
        id: e.pointerId,
        move(ev) { const [x, y] = toPage(sh, ev.clientX, ev.clientY); const n = handle === 'a' ? { ...i, x: r2(x), y: r2(y), w: r2(i.x + i.w - x), h: r2(i.y + i.h - y) } : { ...i, w: r2(x - i.x), h: r2(y - i.y) }; sh.items.set(i.id, n); draw(sh, i.id); drawOverlay(); },
        up() { change(sh, [[i.id, i, sh.items.get(i.id)]]); },
        cancel() { sh.items.set(i.id, i); draw(sh, i.id); drawOverlay(); },
      };
    }
    const b = union(list), ox = handle.includes('w') ? b.x + b.w : b.x, oy = handle.includes('n') ? b.y + b.h : b.y;
    const keep = list.some((i) => i.t === 'image') || list.length > 1;
    let last = null;
    return {
      id: e.pointerId,
      move(ev) {
        const [x, y] = toPage(sh, ev.clientX, ev.clientY);
        let sx = Math.abs(x - ox) / Math.max(1e-6, b.w), sy = Math.abs(y - oy) / Math.max(1e-6, b.h);
        if (keep || ev.shiftKey) sx = sy = Math.max(sx, sy);
        sx = Math.max(sx, .02); sy = Math.max(sy, .02);
        last = [];
        for (const [k, i] of start) { const n = scaled(i, ox, oy, sx, sy); last.push([k, i, n]); sh.items.set(k, n); draw(sh, k); }
        drawOverlay();
      },
      up() { if (last) change(sh, last); },
      cancel() { for (const [k, i] of start) { sh.items.set(k, i); draw(sh, k); } drawOverlay(); },
    };
  }

  // ---------------------------------------------------------------- pointers on the ink
  const sheetAt = (target) => { const s = target?.closest?.('.sheet'); return s ? byId(s.dataset.id) : null; };
  function cancelAction() { action?.cancel(); action = null; }
  let penUp = -1e9;
  const penDown = () => [...pointers.values()].some((q) => q.type === 'pen');
  const touchList = () => [...pointers.values()].filter((p) => p.type === 'touch');
  function startPinch() {
    const [a, b] = touchList();
    gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, z0: z };
  }
  // a long press of a stylus or a finger is not a right click: browsers turn it into "contextmenu" and select the text
  // around (numbers of the sheets, thumbs), which picked the item under the pen and opened a menu while writing
  let lastType = 'mouse';
  const isField = (el) => (el?.nodeType === 3 ? el.parentElement : el)?.closest?.('input, textarea, [contenteditable="true"], sav-input, sav-textarea');
  function onDown(e) {
    lastType = e.pointerType || 'mouse';
    if (mode === 'ink' && e.pointerType === 'pen' && !isField(e.target)) e.preventDefault();
    if (mode !== 'ink' || e.button === 2 || !e.target.closest?.('.ink')) return;
    const sh = sheetAt(e.target);
    if (!sh) return;
    if (e.pointerType === 'pen' && !P.penOnly) { setPrefs({ penOnly: true }).catch(() => {}); P = prefs(); applyTouch(); toast(t('stylus_seen'), 'neutral'); }
    // writing: no text field keeps the focus, or the iPad would take the Pencil for handwriting into it (Scribble)
    if (e.pointerType !== 'touch' && isField(document.activeElement)) document.activeElement.blur();
    // palm rejection: while a pen writes (and just after), fingers and the palm are ignored, so they neither scroll nor stop
    // the stroke; a pen that lands while the palm is already down (the hand rested first) takes over instead of being dropped
    if (e.pointerType === 'touch' && (penDown() || performance.now() - penUp < 400)) { e.preventDefault(); return; }
    if (e.pointerType === 'pen' && gesture) { gesture = null; for (const [id, q] of pointers) if (q.type === 'touch') pointers.delete(id); wrap.classList.remove('panning'); }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    try { e.target.closest('.ink').setPointerCapture(e.pointerId); } catch { /* gone */ }
    if (e.pointerType === 'touch' && touchList().length >= 2) { cancelAction(); startPinch(); return; }
    // with a stylus a finger scrolls the sheets (done here: the surface keeps touch-action none, so that Safari never takes
    // the beginning of a stroke of the Pencil for a scroll and drops it)
    if (e.pointerType === 'touch' && P.penOnly) { e.preventDefault(); gesture = { kind: 'pan', id: e.pointerId, x: e.clientX, y: e.clientY }; return; }
    // the middle button, or the hand (Move): a press moves the sheets
    if (e.button === 1 || tool === 'hand') { e.preventDefault(); gesture = { kind: 'pan', id: e.pointerId, x: e.clientX, y: e.clientY }; wrap.classList.add('panning'); return; }
    if (gesture) return;
    e.preventDefault();
    if (tool === 'pen' || tool === 'pencil' || tool === 'marker') action = strokeAction(sh, e, tool);
    else if (tool === 'eraser') action = eraserAction(sh, e);
    else if (tool === 'shape') action = shapeAction(sh, e);
    else if (tool === 'select') action = selectAction(sh, e);
    else if (tool === 'image') pickImage(sh, toPage(sh, e.clientX, e.clientY));
  }
  function onMove(e) {
    if (mode !== 'ink') return;
    if (tool === 'eraser' && e.pointerType !== 'touch' && !action) { const sh = sheetAt(e.target); if (sh) { const [x, y] = toPage(sh, e.clientX, e.clientY); eraserAt = { sh, x, y }; drawOverlay(); } else if (eraserAt) { eraserAt = null; drawOverlay(); } }
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const px = p.x, py = p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (gesture?.kind === 'pinch') {
      const tl = touchList();
      if (tl.length < 2) return;
      const [a, b] = tl, d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, sb = scroller.getBoundingClientRect();
      freeScroll(); scroller.scrollLeft -= mx - gesture.mx; scroller.scrollTop -= my - gesture.my;
      gesture.mx = mx; gesture.my = my;
      setZ(gesture.z0 * d / gesture.d, mx - sb.left, my - sb.top);
      return;
    }
    if (gesture?.kind === 'pan' && gesture.id === e.pointerId) {
      freeScroll();
      const d = flowH() ? px - e.clientX : py - e.clientY;
      if (!pullBy(d)) { scroller.scrollLeft -= e.clientX - px; scroller.scrollTop -= e.clientY - py; }
      return;
    }
    if (action && action.id === e.pointerId) action.move(e);
  }
  function onUp(e) {
    if (!pointers.has(e.pointerId)) return;
    if (pointers.get(e.pointerId).type === 'pen') penUp = performance.now();
    pointers.delete(e.pointerId);
    if (gesture?.kind === 'pinch') { if (touchList().length < 2) gesture = null; return; }
    if (gesture?.kind === 'pan' && gesture.id === e.pointerId) { gesture = null; wrap.classList.remove('panning'); pullRelease(); return; }
    if (action && action.id === e.pointerId) { const a = action; action = null; if (e.type === 'pointercancel') a.cancel(); else a.up(e); }
  }
  stack.addEventListener('pointerdown', onDown);
  stack.addEventListener('selectstart', (e) => { if (mode === 'ink' && !isField(e.target)) e.preventDefault(); });
  stack.addEventListener('pointermove', onMove);
  stack.addEventListener('pointerup', onUp);
  stack.addEventListener('pointercancel', onUp);
  stack.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && eraserAt) { eraserAt = null; drawOverlay(); } });
  let turnAt = 0;
  scroller.addEventListener('wheel', (e) => {
    // side by side: the wheel of a mouse (up and down only) scrolls across; a trackpad already moves both ways
    // (with the snapping, a notch of the wheel turns a whole sheet)
    const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.clientHeight : 1;
    // past an end of the notebook: the tile of a new sheet fills
    if (!(e.ctrlKey || e.metaKey) && pullWheel((flowH() ? e.deltaX || (e.shiftKey ? 0 : e.deltaY) : e.deltaY) * px)) { if (flowH()) e.preventDefault(); return; }
    if (!(e.ctrlKey || e.metaKey) && flowH() && !e.shiftKey && !e.deltaX && e.deltaY) {
      e.preventDefault();
      if (!snapOn()) { scroller.scrollLeft += e.deltaY * px; return; }
      if (Math.abs(e.deltaY) < 4 || performance.now() - turnAt < 350) return;
      turnAt = performance.now();
      const n = clamp(whichSheet() + Math.sign(e.deltaY), 0, sheets.length - 1);
      if (n === sheets.length - 1 && e.deltaY > 0 && whichSheet() === n) scroller.scrollTo({ left: scroller.scrollWidth, behavior: 'smooth' }); else goSheet(n);
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const sb = scroller.getBoundingClientRect();
    setZ(z * Math.exp(-e.deltaY * (e.ctrlKey && Math.abs(e.deltaY) < 40 ? .012 : .0022)), e.clientX - sb.left, e.clientY - sb.top);
  }, { passive: false });
  let gs = 1; // Safari: the pinch of the trackpad
  scroller.addEventListener('gesturestart', (e) => { e.preventDefault(); gs = 1; });
  scroller.addEventListener('gesturechange', (e) => { e.preventDefault(); const sb = scroller.getBoundingClientRect(); setZ(z * e.scale / gs, e.clientX - sb.left, e.clientY - sb.top); gs = e.scale; });
  // the right click (or a long press) on a sheet: what the thing under it can do, in the menu of SavOffice (SavOffice.context);
  // with a finger that writes, the column says data-so-draw: a finger held still is a stroke, not a menu
  stack.soMenu = (e) => {
    if (mode !== 'ink' || !e || gesture) return null;
    // a long press with the select tool: the press held still is the menu, not a selection or a move
    if (action) { if (tool !== 'select') return null; cancelAction(); marquee = null; }
    const sh = sheetAt(e.target);
    if (!sh) return null;
    const [x, y] = toPage(sh, e.clientX, e.clientY), hit = topAt(sh, x, y, tol());
    if (hit && !(selSheet === sh && sel.has(hit.id))) select(sh, [hit.id]);
    const has = selSheet === sh && sel.size > 0;
    return has ? [
      ['copy', t('copy_sel'), () => copySel()], ['copy-plus', t('duplicate_sel'), () => duplicate()], '-', ['bring-to-front', t('front'), () => arrange(true)], ['send-to-back', t('back'), () => arrange(false)], '-', ['trash', t('delete_sel'), () => removeSel(), { danger: true }],
    ] : [['clipboard-paste', t('paste'), () => pasteFromMenu(sh, [x, y])], ['image', t('insert_image'), () => pickImage(sh, [x, y])], ['file-plus', t('add_sheet_after'), () => addSheet(idx(sh) + 1)]];
  };
  function markDraw() { stack.toggleAttribute('data-so-draw', mode === 'ink' && tool !== 'select' && tool !== 'hand' && !P.penOnly); }
  /** Fingers draw (touch-action none) or, with a stylus, scroll the column as usual. */
  function applyTouch() { wrap.classList.toggle('penonly', !!P.penOnly); markDraw(); }

  // ---------------------------------------------------------------- what the selection can do
  function removeSel() { const list = selItems(); if (!list.length) return; const sh = selSheet; change(sh, list.map((i) => [i.id, i, null])); sel.clear(); selSheet = null; drawOverlay(); buildProps(); }
  function duplicate(list = selItems(), off = 20 / z) {
    if (!list.length) return;
    const sh = selSheet, copies = freshIds(list).map((i) => moved(i, off, off));
    change(sh, copies.map((i) => [i.id, null, i]));
    select(sh, copies.map((i) => i.id));
  }
  function arrange(front) {
    const sh = selSheet;
    if (!sh) return;
    const ids = sh.order.filter((x) => sel.has(x)), rest = sh.order.filter((x) => !sel.has(x));
    if (ids.length) change(sh, [], front ? [...rest, ...ids] : [...ids, ...rest]);
  }
  function restyle(patch) {
    const list = selItems();
    if (!list.length) return;
    change(selSheet, list.map((i) => {
      const n = { ...i };
      if ('c' in patch && i.t !== 'image') n.c = patch.c;
      if ('f' in patch && i.t === 'shape') n.f = patch.f;
      if ('s' in patch && (i.t === 'stroke' || i.t === 'shape')) n.s = r2(patch.s / z);
      if ('d' in patch && i.t === 'shape') n.d = patch.d;
      return [i.id, i, n];
    }));
  }
  const CLIP = 'savnotes/items';
  function copySel(cutToo = false) {
    const list = selItems();
    if (!list.length) return false;
    const data = JSON.stringify({ [CLIP]: list });
    try { navigator.clipboard.writeText(data).catch(() => {}); } catch { /* not allowed */ }
    S.clip = list;
    if (cutToo) removeSel();
    return data;
  }
  const visibleMiddle = (sh) => { const b = sh.dom.el.getBoundingClientRect(), sb = scroller.getBoundingClientRect(); const top = Math.max(b.top, sb.top), bot = Math.min(b.bottom, sb.bottom); return [W / 2, clamp(((top + bot) / 2 - b.top) / z, 60, H - 60)]; };
  function pasteItems(sh, list, at) {
    if (!list.length) return;
    const b = union(list), [cx, cy] = at || visibleMiddle(sh);
    const copies = freshIds(list).map((i) => moved(i, r2(cx - b.x - b.w / 2), r2(cy - b.y - b.h / 2)));
    change(sh, copies.map((i) => [i.id, null, i]));
    setTool('select');
    select(sh, copies.map((i) => i.id));
  }
  async function pasteFromMenu(sh, at) {
    try { const s = await navigator.clipboard.readText(); const j = JSON.parse(s); if (j?.[CLIP]) return pasteItems(sh, cleanItems(j[CLIP]), at); } catch { /* no permission or no items */ }
    if (S.clip) pasteItems(sh, S.clip, at);
  }
  async function addImage(file, sh = sheets[cur], at) {
    try {
      const im = await readImage(file), [cx, cy] = at || visibleMiddle(sh);
      const k = Math.min(1, (W * .6) / im.w, (H * .5) / im.h), w = r2(im.w * k), hh = r2(im.h * k);
      const i = { id: uid(), t: 'image', x: r2(clamp(cx - w / 2, 0, W - w)), y: r2(clamp(cy - hh / 2, 0, H - hh)), w, h: hh, src: im.src };
      change(sh, [[i.id, null, i]]);
      if (mode !== 'ink') setMode('ink');
      setTool('select');
      select(sh, [i.id]);
    } catch (e) { fail(e); }
  }
  function pickImage(sh = sheets[cur], at) {
    const f = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif', multiple: true });
    f.addEventListener('change', () => { let n = 0; for (const x of f.files) addImage(x, sh, at && [at[0] + n * 24, at[1] + (n++) * 24]); });
    f.click();
  }

  // ---------------------------------------------------------------- the bars
  const tb = {};
  function setToolQuiet(k) { tool = k; for (const [n, b] of Object.entries(tb)) b.on(n === k); wrap.dataset.tool = k; markDraw(); }
  function setTool(k) {
    if (k === 'image') { pickImage(); return; }
    setToolQuiet(k);
    if (k !== 'select') { sel.clear(); selSheet = null; }
    eraserAt = null;
    drawOverlay();
    buildProps();
    setPrefs({ tool: k }).catch(() => {});
  }
  const tools = h('nav.tools', { 'aria-label': t('tools') });
  // every tool has its button; which ones the bars show and in what order is a choice of each person (⋮ → Customise the bars)
  for (const [k, ic, key] of TOOLS) tb[k] = iconBtn(k === 'shape' ? SHAPE_ICONS[opt('shape').k] : ic, t('tool_' + k), () => setTool(k), { place: 'top', kbd: key, size: 'md' });
  const TL_ITEMS = TOOLS.map(([k, ic]) => [k, ic, t('tool_' + k)]);
  const TL_DEF = TOOLS.flatMap(([k]) => (k === 'hand' ? [k, '|'] : [k]));
  /** A bar as each person chose it (kept with the account): its list, in order, with '|' a separator, '_' a fixed space and
   *  '~' an adaptive one (SavOffice.bars); what it has at first when nothing was chosen. */
  const BARS = window.SavOffice?.bars;
  const barPick = (id, def, items) => (BARS ? BARS.pick(prefs().bars?.[id], def, items) : def);
  const barList = (id, def, items) => { const l = barPick(id, def, items); return BARS ? BARS.layout(l) : l; };
  const barEl = (k, map) => (k === '|' ? h('span.tsep.so-sep') : k === '_' ? h('i.bgap') : k === '~' ? h('span.spacer') : map[k]);
  const layoutTools = () => put(tools, barList('tools', TL_DEF, TL_ITEMS).map((k) => barEl(k, tb)));
  layoutTools();

  // the bar of the document
  const fmt = {};
  const blockSel = h('sav-select', { 'sheet-on-mobile': true, size: 'sm', value: 'p', 'aria-label': t('b_style'), class: 'bsel' }, BLOCKS.map(([v, k]) => h('option', { value: v }, t(k))));
  blockSel.addEventListener('change', () => block(blockSel.value));
  const fbtn = (k, ic, label, run, kbd) => { const b = iconBtn(ic, label, run, { place: 'top', kbd, size: 'md' }); fmt[k] = b; return b; };
  const textColor = colorPop(t('text_color'), '', (c) => cmd('foreColor', c || '#1f1f22'), { list: TEXT_INKS, none: t('auto'), placement: 'top', trigger: h('sav-button', { size: 'sm', appearance: 'ghost', variant: 'neutral', square: true, icon: 'baseline', label: t('text_color') }) });
  const textMark = colorPop(t('text_mark'), '', (c) => cmd('hiliteColor', c || 'transparent'), { list: TEXT_MARKS, none: t('no_mark'), placement: 'top', trigger: h('sav-button', { size: 'sm', appearance: 'ghost', variant: 'neutral', square: true, icon: 'highlighter', label: t('text_mark') }) });
  const alignDrop = drop(h('sav-button', { icon: 'align-left', label: t('align'), title: t('align'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true }), [
    ['align-left', t('al_left'), () => cmd('justifyLeft')], ['align-center', t('al_center'), () => cmd('justifyCenter')], ['align-right', t('al_right'), () => cmd('justifyRight')],
  ], { placement: 'top', label: t('align') });
  const DB = { block: blockSel, bold: fbtn('bold', 'bold', t('bold'), () => cmd('bold'), 'Mod+B'), italic: fbtn('italic', 'italic', t('italic'), () => cmd('italic'), 'Mod+I'), underline: fbtn('underline', 'underline', t('underline'), () => cmd('underline'), 'Mod+U'), strike: fbtn('strike', 'strikethrough', t('strike'), () => cmd('strikeThrough')),
    color: textColor, mark: textMark, ul: fbtn('ul', 'list', t('list_bullet'), () => cmd('insertUnorderedList'), 'Mod+Shift+8'), ol: fbtn('ol', 'list-ordered', t('list_number'), () => cmd('insertOrderedList'), 'Mod+Shift+7'),
    chk: fbtn('chk', 'list-checks', t('list_check'), () => { restoreCaret(); checklist(); const sh = sheetOfDoc(lastDoc); if (sh) docInput(sh); syncFormat(); }, 'Mod+Shift+9'), align: alignDrop,
    clear: fbtn('clear', 'remove-formatting', t('clear_format'), () => { cmd('removeFormat'); block('p'); }), img: fbtn('img', 'image', t('insert_image'), () => pickImage()) };
  const DB_ITEMS = [['block', 'pilcrow', t('b_style')], ['bold', 'bold', t('bold')], ['italic', 'italic', t('italic')], ['underline', 'underline', t('underline')], ['strike', 'strikethrough', t('strike')], ['color', 'baseline', t('text_color')], ['mark', 'highlighter', t('text_mark')],
    ['ul', 'list', t('list_bullet')], ['ol', 'list-ordered', t('list_number')], ['chk', 'list-checks', t('list_check')], ['align', 'align-left', t('align')], ['clear', 'remove-formatting', t('clear_format')], ['img', 'image', t('insert_image')]];
  const DB_DEF = ['block', '|', 'bold', 'italic', 'underline', 'strike', 'color', 'mark', '|', 'ul', 'ol', 'chk', 'align', '|', 'clear', 'img'];
  const docbar = keepCaret(h('nav.tools.docbar', { 'aria-label': t('mode_doc') }));
  const layoutDoc = () => put(docbar, barList('format', DB_DEF, DB_ITEMS).map((k) => barEl(k, DB)));
  layoutDoc();
  /** The buttons of the bar show what the text under the caret has. */
  function syncFormat() {
    const s = getSelection();
    if (!s.rangeCount || !docOf(s.anchorNode)) return;
    const q = (c) => { try { return document.queryCommandState(c); } catch { return false; } };
    fmt.bold.on(q('bold')); fmt.italic.on(q('italic')); fmt.underline.on(q('underline')); fmt.strike.on(q('strikeThrough'));
    const n = s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement, b = n.closest('h1,h2,h3,blockquote,p,li'), ul = n.closest('ul,ol');
    const v = b && ['h1', 'h2', 'h3', 'blockquote'].includes(b.localName) ? b.localName : 'p';
    if (blockSel.value !== v) blockSel.value = v;
    fmt.ul.on(ul?.localName === 'ul' && !ul.classList.contains('chk')); fmt.ol.on(ul?.localName === 'ol'); fmt.chk.on(!!ul?.classList.contains('chk'));
  }

  const modeSel = h('sav-radio-group.modesel', { appearance: 'buttons', size: 'sm', value: mode, 'aria-label': t('mode') },
    h('sav-radio', { value: 'ink', title: t('mode_ink'), 'aria-label': t('mode_ink') }, icon('pen-line'), h('span.mlbl', t('mode_ink_s'))),
    h('sav-radio', { value: 'doc', title: t('mode_doc'), 'aria-label': t('mode_doc') }, icon('keyboard'), h('span.mlbl', t('mode_doc_s'))));
  modeSel.addEventListener('change', () => setMode(modeSel.value));
  function setMode(m) {
    mode = m === 'doc' ? 'doc' : 'ink';
    if (modeSel.value !== mode) modeSel.value = mode;
    wrap.dataset.mode = mode;
    markDraw();
    for (const sh of sheets) sh.dom.doc.contentEditable = mode === 'doc' ? 'true' : 'false';
    if (mode === 'doc') { cancelAction(); sel.clear(); selSheet = null; eraserAt = null; }
    tools.hidden = mode !== 'ink';
    docbar.hidden = mode !== 'doc';
    undoB.button.disabled = mode === 'ink' && !hist.length;
    redoB.button.disabled = mode === 'ink' && !fut.length;
    drawOverlay();
    buildProps();
    setPrefs({ mode }).catch(() => {});
    if (mode === 'doc') {
      // the caret goes on the sheet in front, at the end of its text
      const d = sheets[cur]?.dom.doc;
      if (d && document.activeElement !== d) { d.focus({ preventScroll: true }); const rr = document.createRange(); rr.selectNodeContents(d); rr.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(rr); }
    } else if (document.activeElement?.closest?.('.doc')) document.activeElement.blur();
  }

  const props = h('div.props');
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
  const seg = (label, value, opts, onpick) => { const g = h('sav-radio-group', { appearance: 'buttons', size: 'sm', value: String(value), 'aria-label': label }, opts.map(([v, ic, l]) => h('sav-radio', { value: String(v), title: l, 'aria-label': l }, icon(ic)))); g.addEventListener('change', () => onpick(g.value)); return g; };
  const sep = () => h('span.psep');
  const act = (ic, label, run, o = {}) => iconBtn(ic, label, run, { place: 'top', ...o });

  function buildProps() {
    const kids = [];
    if (mode === 'ink') {
      const bg = sheets[cur]?.bg || '#ffffff', inks = inksFor(bg), list = tool === 'select' ? selItems() : [];
      if (['pen', 'pencil', 'marker'].includes(tool)) {
        const o = opt(tool);
        kids.push(swatches(tool === 'marker' ? HIGHLIGHT : inks, tool === 'marker' ? o.c : inkOn(o.c, bg), (c) => { setOpt(tool, { c }); buildProps(); }), sep(), sizes(SIZES_T[tool], o.s, (s) => setOpt(tool, { s }), SIZES_T[tool].at(-1)));
      } else if (tool === 'eraser') {
        const o = opt('eraser');
        kids.push(seg(t('eraser_mode'), o.mode, [['partial', 'eraser', t('er_partial')], ['whole', 'trash', t('er_whole')]], (m) => setOpt('eraser', { mode: m })), sep(), sizes(SIZES_T.eraser, o.s, (s) => { setOpt('eraser', { s }); showEraser(); }, 90));
      } else if (tool === 'shape') {
        const o = opt('shape');
        kids.push(seg(t('tool_shape'), o.k, Object.entries(SHAPE_ICONS).map(([k, ic]) => [k, ic, t('s_' + k)]), (k) => { setOpt('shape', { k }); tb.shape.button.icon = SHAPE_ICONS[k]; buildProps(); }), sep(),
          swatches(inks, inkOn(o.c, bg), (c) => { setOpt('shape', { c }); buildProps(); }), sep(), sizes(SIZES_T.shape, o.s, (s) => setOpt('shape', { s }), 8),
          o.k !== 'line' && o.k !== 'arrow' ? colorPop(t('fill'), o.f, (f) => setOpt('shape', { f }), { list: [...PAPERS, ...inks.slice(0, 6)], none: t('no_fill'), placement: 'top', trigger: h('sav-button', { size: 'sm', appearance: 'ghost', variant: 'neutral', square: true, icon: 'fill', label: t('fill') }) }) : null);
        const dash = act('dash', t('dashed'), (b) => { setOpt('shape', { d: !opt('shape').d }); b.on(opt('shape').d); });
        kids.push(dash);
        requestAnimationFrame(() => dash.on(!!o.d));
      } else if (list.length) {
        const has = (f) => list.some(f), first = list[0];
        if (has((i) => i.t !== 'image')) kids.push(swatches(list.every((i) => i.t === 'stroke' && i.tool === 'marker') ? HIGHLIGHT : inks, first.c, (c) => restyle({ c })), sep());
        if (has((i) => i.t === 'stroke' || i.t === 'shape')) kids.push(sizes(SIZES_T.shape, Math.round((first.s || 3) * z * 2) / 2, (s) => restyle({ s }), 8), sep());
        if (has((i) => i.t === 'shape' && i.k !== 'line' && i.k !== 'arrow')) kids.push(colorPop(t('fill'), first.f || '', (f) => restyle({ f }), { list: [...PAPERS, ...inks.slice(0, 6)], none: t('no_fill'), placement: 'top', trigger: h('sav-button', { size: 'sm', appearance: 'ghost', variant: 'neutral', square: true, icon: 'fill', label: t('fill') }) }));
        kids.push(act('copy-plus', t('duplicate_sel'), () => duplicate(), { kbd: 'Mod+D' }), act('bring-to-front', t('front'), () => arrange(true), { kbd: ']' }), act('send-to-back', t('back'), () => arrange(false), { kbd: '[' }), act('trash', t('delete_sel'), () => removeSel(), { kbd: 'Del' }));
      }
    }
    put(props, kids);
    props.hidden = !kids.length;
  }

  // the paper of the sheet in front (and of the others)
  function paperPanel() {
    const box = h('div.look');
    const fill = () => {
      const sh = sheets[cur] || sheets[0], all = box.querySelector('.allp')?.checked ?? false;
      const set = (patch) => { setPaper(sh, patch, box.querySelector('.allp')?.checked); fill(); };
      const row = (list, more) => { const g = swatches(list, sh.bg, (bg) => set({ bg }), t('background')); if (!more) g.lastChild.remove(); return g; };
      const allSw = h('sav-switch.allp', { checked: all || null, size: 'sm' }, t('apply_all'));
      put(box,
        h('p.small.muted', t('paper_of', { n: idx(sh) + 1 })),
        h('span.flabel', t('background')), row(BACKS.slice(0, 5), false), row(BACKS.slice(5), true),
        h('span.flabel', t('pattern')), h('div.pats', PATTERNS.map((k) => tile(t('pat_' + k), () => set({ pat: k }), { class: 'patb' + (sh.pat === k ? ' on' : '') }, h('span.patp', { html: miniPaper(k, sh.bg) }), h('span.patn', t('pat_' + k))))),
        sh.pat !== 'none' ? [
          h('sav-range', { label: t('pattern_gap'), min: 12, max: 60, step: 1, value: sh.gap, 'show-value': true, onchange: (e) => set({ gap: +e.currentTarget.value }) }),
          h('div.prow', h('span.flabel.grow', t('pattern_color')), colorPop(t('pattern_color'), sh.pc, (pc) => set({ pc }), { none: t('auto'), list: ['#bcd0ea', '#c9c4bb', '#9aa29d', '#e58b8b', '#7cc4ff', '#ffd166', '#ffffff', '#1c1c1c'] })),
        ] : null,
        allSw,
        h('sav-divider'),
        btn(t('paper_default'), { size: 'sm', appearance: 'ghost', icon: 'check', onclick: () => { settings.paper = defaultPaper(paperOf(sh)); setDirty = true; queueSave(); toast(t('paper_default_ok'), 'success'); } }),
        btn(t('clear_sheet'), { icon: 'trash', size: 'sm', appearance: 'ghost', variant: 'danger', onclick: async () => { if (!sh.items.size && docEmpty(sh.dom.doc.innerHTML)) return; if (await confirm(t('clear_sheet'), t('clear_sheet_t'), t('clear'))) { change(sh, [...sh.items.values()].map((i) => [i.id, i, null])); sh.dom.doc.innerHTML = ''; docInput(sh); } } }));
    };
    fill();
    box.refresh = fill;
    return box;
  }
  const miniPaper = (pat, bg) => { const p = paperSVG('mp' + pat, { bg, pat, gap: 10, pc: '' }, 40, 30, .8); return `<svg viewBox="0 0 40 30"><defs>${p.defs}</defs>${p.body}</svg>`; };
  const paperB = iconBtn('notebook', t('sheet_paper'), null, { kbd: '' });
  const paperPop = h('sav-popover', { placement: 'bottom-end', 'sheet-on-mobile': true, heading: t('sheet_paper'), style: '--width:21rem' });
  paperB.slot = 'trigger';
  // the panel is there before it opens (the popover measures it to place it inside the window); it only shows the sheet in front again
  const paperBox = paperPanel();
  paperPop.append(paperB, paperBox);
  paperPop.addEventListener('sav-show', () => paperBox.refresh());

  /** The notebook itself: cover, size of the sheets, typeface of the text. */
  function notebookSettings() {
    const s = { ...settings };
    const covers = h('sav-radio-group.sws', { appearance: 'buttons', size: 'sm', value: s.cover, 'aria-label': t('cover') }, COVERS.map((c) => h('sav-radio', { value: c, title: c, 'aria-label': c }, h('span.sw', { style: `--c:${c}` }))));
    covers.addEventListener('change', () => { s.cover = covers.value; });
    const size = h('sav-select', { 'sheet-on-mobile': true, label: t('page_size'), value: s.size, size: 'sm' }, Object.keys(SIZES).map((k) => h('option', { value: k }, t('size_' + k))));
    size.addEventListener('change', () => { s.size = size.value; });
    const orient = h('sav-radio-group', { appearance: 'buttons', size: 'sm', value: s.orient, label: t('orient') }, h('sav-radio', { value: 'p' }, t('portrait')), h('sav-radio', { value: 'l' }, t('landscape')));
    orient.addEventListener('change', () => { s.orient = orient.value; });
    const font = h('sav-select', { 'sheet-on-mobile': true, label: t('text_font'), value: s.font, size: 'sm' }, Object.keys(FONTS).map((k) => h('option', { value: k, style: `font-family:${FONTS[k]}` }, t('f_' + k))));
    font.addEventListener('change', () => { s.font = font.value; });
    const ts = h('sav-radio-group', { appearance: 'buttons', size: 'sm', value: s.tsize, label: t('text_size') }, ['s', 'm', 'l'].map((k) => h('sav-radio', { value: k }, t('ts_' + k))));
    ts.addEventListener('change', () => { s.tsize = ts.value; });
    const flow = h('sav-radio-group', { appearance: 'buttons', size: 'sm', value: s.flow || 'v', label: t('flow') }, h('sav-radio', { value: 'v' }, icon('arrow-down-from-line'), t('flow_v')), h('sav-radio', { value: 'h' }, icon('book-open'), t('flow_h')));
    flow.addEventListener('change', () => { s.flow = flow.value; });
    const scroll = h('sav-radio-group', { appearance: 'buttons', size: 'sm', value: s.scroll || 'free', label: t('scrolling') }, h('sav-radio', { value: 'free' }, t('scroll_free')), h('sav-radio', { value: 'snap' }, t('scroll_snap')));
    scroll.addEventListener('change', () => { s.scroll = scroll.value; });
    dialog({ title: t('nb_settings'), width: '28rem', body: h('div.form', h('div', h('span.flabel', t('cover')), covers), h('div.grid2', size, orient), h('p.small.muted', t('page_size_t')), h('div.grid2', font, ts), flow, scroll, h('p.small.muted', t('scroll_t'))),
      actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: () => {
        const resize = s.size !== settings.size || s.orient !== settings.orient, retype = resize || s.font !== settings.font || s.tsize !== settings.tsize, reflowed = (s.flow || 'v') !== (settings.flow || 'v'), resnap = (s.scroll || 'free') !== (settings.scroll || 'free');
        Object.assign(settings, s);
        setDirty = true;
        // the other way of turning the sheets: the same sheet in front, at the zoom that fits it
        if (resnap && !reflowed) { applyFlow(); goSheet(cur); }
        if (reflowed) { const at = cur; applyFlow(); requestAnimationFrame(() => { z = 0; setZ(fitZ()); goSheet(at, false); }); }
        if (resize) { const top = scroller.scrollTop / Math.max(1, stack.scrollHeight); renderAll(); scroller.scrollTop = top * stack.scrollHeight; }
        else if (retype) sheets.forEach((sh) => { paintPaper(sh); thumbLater(sh); });
        if (retype) sheets.forEach((sh) => reflowLater(sh));
        queueSave();
      } }] });
  }

  const undoB = iconBtn('undo-2', t('undo'), () => undo(), { kbd: 'Mod+Z' }), redoB = iconBtn('redo-2', t('redo'), () => redo(), { kbd: 'Mod+Shift+Z' });
  const sideB = iconBtn('panel-left', t('toggle_sheets'), () => toggleSide(), { kbd: '' });
  const whole = () => ({ title, settings: { ...settings }, sheets: sheets.map(dataOf) });
  // SavDrive: the cloud next to the grid of the apps saves this notebook into the drive (../assets/savoffice/savoffice.js)
  window.SavOffice?.exporter?.({ key: id, make: async () => { const b = whole(), f = await import('./files.js'); return { blob: await f.makeSavnot(b), name: f.fileName(b.title, 'savnot') }; } });
  const exp = async (fn, ...a) => { try { await fn(whole(), ...a); } catch (e) { fail(e); } };
  const dlList = [
    ['file-down', t('save_savnot'), () => exp(saveSavnot)], '-', ['printer', t('save_pdf'), () => exp(printNotebook)], ['image', t('save_png'), () => exp(savePng, cur)],
  ];
  const downloadB = drop(h('sav-button', { icon: 'download', label: t('download_as'), title: t('download_as'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true }), dlList, { placement: 'bottom-end', label: t('download_as') });
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {});
  const moreList = () => [
    ['file-plus', t('add_sheet_after'), () => addSheet(cur + 1)], ['copy-plus', t('sheet_dup'), () => dupSheet(sheets[cur])],
    mobile() ? ['notebook', t('sheet_paper'), () => paperB.button.click()] : null,
    ['settings', t('nb_settings'), () => notebookSettings()],
    '-', mobile() ? ['file-down', t('save_savnot'), () => exp(saveSavnot)] : null, mobile() ? ['printer', t('save_pdf'), () => exp(printNotebook)] : null,
    ['scan', t('zoom_fit'), () => fit(), { kbd: 'Shift+1' }], document.documentElement.requestFullscreen ? ['maximize', t(document.fullscreenElement ? 'exit_full' : 'full_screen'), fullscreen] : null,
    '-', !mobile() && BARS ? ['settings-2', BARS.menuLabel(), () => barsDialog()] : null, ['info', t('shortcuts'), () => shortcuts()],
  ];
  const moreB = drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more_tools'), title: t('more_tools'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true }), moreList, { placement: 'bottom-end', label: t('more_tools') });

  const titleIn = h('sav-input.dtitle', { value: title, maxlength: 160, size: 'sm', 'aria-label': t('rename'), spellcheck: 'false' });
  titleIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') titleIn.blur(); });
  titleIn.addEventListener('change', () => { const v = titleIn.value.trim(); if (!v) { titleIn.value = title; return; } if (v === title) return; title = v; titleDirty = true; document.title = title + ' – SavNotes'; queueSave(300); });

  // the title bar: back, the logo, the sheets and the title on the left, ⋮ and the account on the right (always); between them the list
  const backB = iconBtn('arrow-left', t('back_home'), () => go('#/'), { kbd: '' }), brandA = h('a.wbrand.mhide', { href: '#/', title: 'SavNotes' }, h('img', { src: 'icons/favicon.svg', width: 26, height: 26, alt: '' })), titleEl = h('div.wtitle', titleIn), accountEl = h('span.mhide', userMenu());
  const T2 = { undo: undoB, redo: redoB, paper: h('span.mhide', paperPop), download: h('span.mhide', downloadB) };
  const TITLE_ITEMS = [['undo', 'undo-2', t('undo')], ['redo', 'redo-2', t('redo')], ['paper', 'notebook', t('sheet_paper')], ['download', 'download', t('download_as')]];
  const TITLE_DEF = ['~', 'undo', 'redo', '|', 'paper', 'download'];
  const top = h('header.wtop');
  const layoutTitle = () => put(top, backB, brandA, sideB, titleEl, status, barList('title', TITLE_DEF, TITLE_ITEMS).map((k) => barEl(k, T2)), moreB, h('span.tsep.mhide'), accountEl);
  layoutTitle();
  /** Customising the bars (⋮ → Customise the bars): the window shared by the apps of SavOffice, a tab for each bar. */
  function barsDialog() {
    if (!BARS) return;
    BARS.dialog({ bars: [{ id: 'title', items: TITLE_ITEMS, def: TITLE_DEF, before: [['arrow-left', t('back_home')], [null, title]], after: [['ellipsis-vertical', t('more_tools')], ['layout-grid', 'SavOffice'], ['user', t('account')]] }, { id: 'tools', items: TL_ITEMS, def: TL_DEF }, { id: 'format', items: DB_ITEMS, def: DB_DEF }],
      value: { title: barPick('title', TITLE_DEF, TITLE_ITEMS), tools: barPick('tools', TL_DEF, TL_ITEMS), format: barPick('format', DB_DEF, DB_ITEMS) },
      save: async (v) => { await setPrefs({ bars: { ...(prefs().bars || {}), ...v } }); layoutTitle(); layoutTools(); layoutDoc(); } });
  }
  // a right click (a long press) on a bar or on one of its buttons: «Customise…», the window of the bars on that bar
  BARS?.attach?.({ title: top, tools, format: docbar }, barsDialog);
  const zoom = h('div.zoom', pageLabel, h('span.tsep.mhide'), h('span.zbtns', iconBtn('zoom-out', t('zoom_out'), () => setZ(z / 1.2), { place: 'top', kbd: '-' }), zoomLabel, iconBtn('zoom-in', t('zoom_in'), () => setZ(z * 1.2), { place: 'top', kbd: '+' })), iconBtn('scan', t('zoom_fit'), () => fit(), { place: 'top', kbd: 'Shift+1' }));
  const dock = h('div.dock', props, h('div.dockrow', modeSel, tools, docbar));
  wrap.append(top, side, dock, zoom, h('div.sidescrim', { onclick: () => toggleSide(false) }));
  put(root, wrap);
  // the search of actions (⌘J / Ctrl+J): the tools, the menu and the downloads, as in the bar
  const asCmd = (list) => list.filter(Array.isArray).map(([ic, l, fn, o]) => [ic, l, fn, o?.kbd || null]);
  commands([t('tools'), TOOLS.map(([k, ic, key]) => [ic, t('tool_' + k), () => setTool(k), key])],
    [t('more_tools'), [['undo-2', t('undo'), () => undo(), 'Mod+Z'], ['redo-2', t('redo'), () => redo(), 'Mod+Shift+Z'], ['notebook', t('sheet_paper'), () => paperB.button.click()], ...asCmd(moreList())]],
    [t('download_as'), asCmd(dlList)]);
  document.title = title + ' – SavNotes';
  setStatus('saved');

  function shortcuts() {
    const row = (k, l) => h('div.kb', h('span', l), h('kbd', K(k)));
    dialog({ title: t('shortcuts'), width: '36rem', body: h('div', h('h3.kbh', t('mode_ink')), h('div.kbs', TOOLS.map(([k, , key]) => row(key, t('tool_' + k))), row('Mod+Z', t('undo')), row('Mod+Shift+Z', t('redo')), row('Mod+A', t('select_all')), row('Mod+D', t('duplicate_sel')), row('Del', t('delete_sel')), row(']', t('front')), row('[', t('back'))),
      h('h3.kbh', t('mode_doc')), h('div.kbs', row('Mod+B', t('bold')), row('Mod+I', t('italic')), row('Mod+U', t('underline')), row('Mod+Alt+1', t('b_h1')), row('Mod+Alt+2', t('b_h2')), row('Mod+Alt+0', t('b_p')), row('Mod+Shift+8', t('list_bullet')), row('Mod+Shift+7', t('list_number')), row('Mod+Shift+9', t('list_check')), h('p.muted.small', t('hint_md'))),
      h('h3.kbh', t('view')), h('div.kbs', row('Mod+Shift+M', t('switch_mode')), row('Mod+S', t('save')), row('+', t('zoom_in')), row('-', t('zoom_out')), row('Shift+1', t('zoom_fit')), row('Shift+0', t('zoom_100')), row('PageDown', t('next_sheet')), row('PageUp', t('prev_sheet')), h('p.muted.small', t('hint_pan')))) });
  }

  // ---------------------------------------------------------------- keyboard, clipboard, files dropped
  const typing = (e) => { const p = e.composedPath?.() || []; return p.some((x) => /^(input|textarea|select|sav-input|sav-select|sav-textarea|sav-number-input)$/.test(x.localName || '') || x.isContentEditable) || !!document.querySelector('sav-dialog[open]'); };
  const KEYS = Object.fromEntries(TOOLS.map(([k, , key]) => [key.slice(-1).toLowerCase(), k]));
  function onKey(e) {
    if (gone) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && e.shiftKey && k === 'm') { e.preventDefault(); setMode(mode === 'ink' ? 'doc' : 'ink'); return; }
    if (typing(e)) return;
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 's') { e.preventDefault(); flush(); return; }
    if (mod && (k === '=' || k === '+')) { e.preventDefault(); setZ(z * 1.2); return; }
    if (mod && k === '-') { e.preventDefault(); setZ(z / 1.2); return; }
    if (mod && k === '0') { e.preventDefault(); setZ(1); return; }
    if (e.key === 'PageDown' && !mod) { e.preventDefault(); goSheet(cur + 1); return; }
    if (e.key === 'PageUp' && !mod) { e.preventDefault(); goSheet(cur - 1); return; }
    if (mode !== 'ink') return;
    if (mod && k === 'a') { e.preventDefault(); setTool('select'); select(sheets[cur], sheets[cur].order); return; }
    if (mod && k === 'd') { e.preventDefault(); duplicate(); return; }
    if (mod) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { if (sel.size) { e.preventDefault(); removeSel(); } return; }
    if (e.key === 'Escape') { if (sel.size) select(selSheet, []); else if (tool !== 'select') setTool('select'); return; }
    if (e.key.startsWith('Arrow') && sel.size) {
      e.preventDefault();
      const d = (e.shiftKey ? 10 : 1) / z, dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
      change(selSheet, selItems().map((i) => [i.id, i, moved(i, dx, dy)]));
      return;
    }
    if (e.key === ']') return arrange(true);
    if (e.key === '[') return arrange(false);
    if (e.key === '+' || e.key === '=') return setZ(z * 1.2);
    if (e.key === '-' || e.key === '_') return setZ(z / 1.2);
    if (e.shiftKey && e.code === 'Digit1') return fit();
    if (e.shiftKey && e.code === 'Digit0') return setZ(1);
    // a letter is a shortcut only with ⌥⇧ (Alt+Shift), never alone (read from the key: on a Mac ⌥ changes the character)
    const L = e.altKey && e.shiftKey && /^Key[A-Z]$/.test(e.code) ? e.code[3].toLowerCase() : null;
    if (!L) return;
    e.preventDefault();
    if (L === 'o') { setOpt('shape', { k: 'ellipse' }); tb.shape.button.icon = 'circle'; return setTool('shape'); }
    if (L === 'a') { setOpt('shape', { k: 'arrow' }); tb.shape.button.icon = 'move-up-right'; return setTool('shape'); }
    if (L === 'r') { setOpt('shape', { k: 'rect' }); tb.shape.button.icon = 'square'; return setTool('shape'); }
    if (KEYS[L]) setTool(KEYS[L]);
  }
  const onCopy = (e) => { if (gone || mode !== 'ink' || typing(e) || !sel.size) return; const d = copySel(e.type === 'cut'); if (d) { e.clipboardData.setData('text/plain', d); e.preventDefault(); } };
  const onPaste = (e) => {
    if (gone || mode !== 'ink' || typing(e)) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); files.forEach((f) => addImage(f)); return; }
    const s = e.clipboardData?.getData('text/plain') || '';
    try { const j = JSON.parse(s); if (j?.[CLIP]) { e.preventDefault(); pasteItems(sheets[cur], cleanItems(j[CLIP])); } } catch { /* a text */ }
  };
  const onDrop = async (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    const sh = sheetAt(e.target) || sheets[cur], at = sheetAt(e.target) ? toPage(sh, e.clientX, e.clientY) : undefined;
    for (const f of files) await addImage(f, sh, at);
  };
  wrap.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
  wrap.addEventListener('drop', onDrop);
  const onResize = () => { drawOverlay(); onScroll(); };
  const onHide = () => { if (document.visibilityState === 'hidden') { if (pending()) keepHere(); flush(true); } };
  const onUnload = (e) => { if (pending()) { keepHere(); flush(true); e.preventDefault(); e.returnValue = ''; } };
  // what was kept offline goes now: every sheet and item as they are here, and what the server has more is taken away
  if (server) {
    const mine = new Map(sheets.map((x) => [x.id, x]));
    for (const sh of sheets) { dirtyMeta.add(sh.id); iorderDirty.add(sh.id); for (const iid of sh.items.keys()) mark(sh.id, iid); }
    for (const x of server.list) { const m = mine.get(x.id); if (!m) { dropped.add(x.id); continue; } for (const i of x.items || []) if (!m.items.has(i.id)) mark(x.id, i.id); }
    orderDirty = titleDirty = setDirty = true;
    toast(getLang() === 'it' ? 'Le modifiche fatte senza rete vengono salvate ora.' : 'The changes made without a network are being saved now.', 'neutral');
    queueSave(400);
  }
  addEventListener('keydown', onKey);
  ownShortcuts(shortcuts); // the menu of the account and ? show the keys of the editor
  document.addEventListener('copy', onCopy);
  document.addEventListener('cut', onCopy);
  document.addEventListener('paste', onPaste);
  document.addEventListener('selectionchange', onSelection);
  addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onHide);
  addEventListener('beforeunload', onUnload);

  // ---------------------------------------------------------------- start
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* old browser */ }
  stack.style.setProperty('--z', z);
  stack.style.setProperty('--gap', GAP + 'px');
  renderAll();
  applyTouch();
  setToolQuiet(tool);
  wrap.classList.toggle('sideopen', sideOpen);
  sideB.on(sideOpen);
  await customElements.whenDefined('sav-button');
  setMode(mode);
  if (mode === 'doc') document.activeElement?.blur?.();
  requestAnimationFrame(() => {
    // the zoom is kept as a part of the width of the window: the same on a phone and on a big screen
    z = 0; setZ(fitZ() * (settings.view?.z || 1));
    const at = clamp(settings.view?.at || 0, 0, sheets.length - 1);
    if (at) goSheet(at, false);
    cur = at;
    viewDirty = false; clearTimeout(viewTimer);
    onScroll();
    markSide();
    afterChange();
    sheets.forEach((sh) => reflowLater(sh));
  });

  return () => {
    window.SavOffice?.exporter?.(null);
    gone = true;
    flush(true);
    removeEventListener('keydown', onKey);
    ownShortcuts(null);
    document.removeEventListener('copy', onCopy);
    document.removeEventListener('cut', onCopy);
    document.removeEventListener('paste', onPaste);
    document.removeEventListener('selectionchange', onSelection);
    removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onHide);
    removeEventListener('beforeunload', onUnload);
    for (const x of thumbTimers.values()) clearTimeout(x);
    document.querySelector('.ctxm')?.remove();
  };
}
