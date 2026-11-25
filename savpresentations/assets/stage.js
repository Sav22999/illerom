/** The canvas: drawing the current slide, selecting, moving, resizing, rotating, snapping, dropping things on it. */
import { h, $, $$, clamp, uid, oops, mobile, userSetting, toast, icon } from './core.js';
import { t } from './i18n.js';
import { slideNode, elementNode, sorted, applyBg } from './render.js';
import { context, slideContext, styleOf } from './themes.js';
import { openText } from './textedit.js';
import { uploadFiles } from './media.js';
import { okLink } from './richtext.js';
import { drawCells, cellAt, inCell, gridOf, cellRect, arrange, makeRoom } from './grid.js';

const DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const rad = (d) => d * Math.PI / 180;

export function createStage(ed) {
  const deck = ed.deck;
  const scroller = h('div.scroller', { tabindex: 0, 'aria-label': t('slide') }), holder = h('div.holder'), overlay = h('div.overlay');
  scroller.append(holder);
  let node = null, zoom = 0, k = 1; // zoom 0 = fit
  const st = { scroller, holder, overlay, get k() { return k; }, get node() { return node; } };
  const cur = () => deck.slide(ed.sid);
  const sc = () => slideContext(ed.ctx, cur().d);

  function fitScale() {
    const pad = mobile() ? 20 : 64, w = scroller.clientWidth - pad, hh = scroller.clientHeight - pad;
    return Math.max(.05, Math.min(w / ed.ctx.W, hh / ed.ctx.H));
  }
  function layout() {
    if (!node) return;
    k = zoom || fitScale();
    node.style.transform = `scale(${k})`;
    holder.style.width = overlay.style.width = ed.ctx.W * k + 'px';
    holder.style.height = overlay.style.height = ed.ctx.H * k + 'px';
    ed.onZoom?.(Math.round(k * 100));
    drawOverlay();
  }
  st.setZoom = (v) => {
    // the middle of the view stays in the middle
    const cx = (scroller.scrollLeft + scroller.clientWidth / 2) / k, cy = (scroller.scrollTop + scroller.clientHeight / 2) / k;
    zoom = v ? clamp(v, .1, 5) : 0; layout();
    if (zoom) { scroller.scrollLeft = cx * k - scroller.clientWidth / 2; scroller.scrollTop = cy * k - scroller.clientHeight / 2; }
  };
  const ro = new ResizeObserver(layout);
  ro.observe(scroller);

  st.draw = () => {
    const s = cur();
    holder.textContent = '';
    if (!s) return;
    node = slideNode(s.d, ed.ctx, { mode: ed.edit ? 'edit' : 'view', index: deck.index(ed.sid), count: deck.slides.size });
    node.style.transformOrigin = '0 0';
    holder.append(node, overlay);
    layout();
  };
  /** Redraws only one element (or removes it); the order on the page follows z. */
  st.drawEl = (id) => {
    const el = deck.el(ed.sid, id), old = node?.querySelector(`.el[data-id="${CSS.escape(id)}"]`);
    if (!el) { old?.remove(); return; }
    if (ed.editing?.id === id) { // being written: only its box changes
      Object.assign(old.style, { left: el.x + 'px', top: el.y + 'px', width: el.w + 'px', height: el.h + 'px', transform: el.r ? `rotate(${el.r}deg)` : '' });
      return;
    }
    const n = elementNode({ id, ...el }, sc(), ed.edit ? 'edit' : 'view');
    if (old) old.replaceWith(n); else node.append(n);
    st.reorder();
  };
  st.reorder = () => {
    const els = sorted(cur().d), nodes = $$('.el[data-id]', node);
    if (nodes.length === els.length && nodes.every((x, i) => x.dataset.id === els[i].id)) return;
    const after = [...node.children].filter((x) => x.classList.contains('decor') && nodes.length && (nodes[0].compareDocumentPosition(x) & 4));
    const before = after[0] || null;
    for (const e of els) { const n = nodes.find((x) => x.dataset.id === e.id); if (n) node.insertBefore(n, before); }
  };

  // ------------------------------------------------------------------ overlay: selection, people, guides

  let guides = [];
  const box = (el, cls, ...kids) => h('div.' + cls, { style: `left:${el.x * k}px;top:${el.y * k}px;width:${el.w * k}px;height:${el.h * k}px;${el.r ? `transform:rotate(${el.r}deg)` : ''}` }, ...kids);
  function drawOverlay() {
    overlay.textContent = '';
    if (!cur()) return;
    const els = [...ed.sel].map((id) => [id, deck.el(ed.sid, id)]).filter((x) => x[1]), simple = ed.simple && ed.edit;
    if (simple && !ed.editing) drawCells(ed, overlay, k);
    for (const p of deck.people) if (p.st?.s === ed.sid) {
      for (const id of p.st.sel || []) {
        const el = deck.el(ed.sid, id);
        if (!el) continue;
        const b = box(el, 'psel', h('span', { style: `background:${p.color}` }, p.name || t('guest')));
        b.style.setProperty('--pc', p.color);
        overlay.append(b);
      }
      if (p.st.x != null && p.st.y != null && !p.st.sel?.length) overlay.append(h('div.pcur', { style: `left:${p.st.x * k}px;top:${p.st.y * k}px;--pc:${p.color}` }, h('i'), h('span', p.name || t('guest'))));
    }
    if (ed.edit && !ed.editing) for (const [id, el] of els) {
      const b = box(el, 'sel');
      b.dataset.id = id;
      if (els.length === 1 && !el.lock && !simple) {
        if (el.t === 'shape' && el.shape === 'line') b.append(h('i.hd.end', { 'data-h': 'p1' }), h('i.hd.end.b', { 'data-h': 'p2' }));
        else {
          for (const d of DIRS) if ((el.w * k > 40 || d.length === 2) && (el.h * k > 40 || d.length === 2)) b.append(h('i.hd.' + d, { 'data-h': d }));
          b.append(h('i.hd.rot', { 'data-h': 'rot', title: t('rotate') }));
        }
      }
      if (el.lock) b.append(h('span.lk', icon('lock')));
      overlay.append(b);
    }
    if (ed.edit && els.length > 1) { const r = bounds(els.map((x) => x[1])); overlay.append(box(r, 'selall')); }
    for (const g of guides) overlay.append(h('div.guide', { style: g.v ? `left:${g.p * k}px;top:0;height:100%;width:1px` : `top:${g.p * k}px;left:0;width:100%;height:1px` }));
    ed.drawPins?.(overlay, k);
  }
  st.overlayNow = drawOverlay;
  const bounds = (els) => { let x = 1e9, y = 1e9, X = -1e9, Y = -1e9; for (const e of els) { const b = aabb(e); x = Math.min(x, b.x); y = Math.min(y, b.y); X = Math.max(X, b.x + b.w); Y = Math.max(Y, b.y + b.h); } return { x, y, w: X - x, h: Y - y }; };
  st.bounds = bounds;
  function aabb(e) {
    if (!e.r) return e;
    const c = Math.abs(Math.cos(rad(e.r))), s = Math.abs(Math.sin(rad(e.r))), w = e.w * c + e.h * s, hh = e.w * s + e.h * c;
    return { x: e.x + e.w / 2 - w / 2, y: e.y + e.h / 2 - hh / 2, w, h: hh };
  }

  // ------------------------------------------------------------------ snapping

  function snapLines(skip) {
    const { W, H } = ed.ctx, v = [0, W / 2, W, W * .075, W * .925], hl = [0, H / 2, H, H * .1, H * .9];
    for (const [id, e] of Object.entries(cur().d.els)) if (!skip.has(id)) { const b = aabb(e); v.push(b.x, b.x + b.w / 2, b.x + b.w); hl.push(b.y, b.y + b.h / 2, b.y + b.h); }
    return { v, h: hl };
  }
  function snapBox(b, lines, edges = { x: [0, .5, 1], y: [0, .5, 1] }) {
    const tol = 6 / k, out = { dx: 0, dy: 0 }, g = [];
    const best = (vals, pts) => { let r = null; for (const p of pts) for (const l of vals) { const d = l - p; if (Math.abs(d) <= tol && (!r || Math.abs(d) < Math.abs(r.d))) r = { d, l }; } return r; };
    const bx = best(lines.v, edges.x.map((f) => b.x + b.w * f)), by = best(lines.h, edges.y.map((f) => b.y + b.h * f));
    if (bx) { out.dx = bx.d; g.push({ v: 1, p: bx.l }); }
    if (by) { out.dy = by.d; g.push({ v: 0, p: by.l }); }
    if (userSetting('grid', false)) { const s = 10; if (!bx) out.dx = Math.round(b.x / s) * s - b.x; if (!by) out.dy = Math.round(b.y / s) * s - b.y; }
    out.g = g;
    return out;
  }

  // ------------------------------------------------------------------ pointer

  const pos = (e) => { const r = holder.getBoundingClientRect(); return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }; };
  st.pos = pos;
  const hit = (e) => { const n = e.target.closest?.('.el[data-id]'); if (n && node?.contains(n)) return n.dataset.id; const b = e.target.closest?.('.sel'); return b ? b.dataset.id : null; };
  const pointers = new Map();
  let pinch = null;

  scroller.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, e);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), k }; return; }
    if (e.button || e.target.closest('.pin, .ftb, .pop, .gadd')) return;
    if (ed.picking) return ed.pickAt(e, pos(e), hit(e));
    const id = hit(e);
    if (ed.editing) { if (id === ed.editing.id && !e.target.closest('.sel')) return; ed.closeText(); }
    if (!ed.edit) return;
    const handle = e.target.dataset?.h;
    if (handle) return drag(e, resizer(handle, e));
    if (id) {
      const el = deck.el(ed.sid, id);
      const mates = e.altKey && e.shiftKey ? [id] : ed.groupOf(id);
      if (e.shiftKey) { const has = ed.sel.has(id); for (const m of mates) has ? ed.sel.delete(m) : ed.sel.add(m); ed.select([...ed.sel]); return; }
      const was = ed.sel.has(id);
      if (!was) ed.select(mates);
      if (el.lock) return;
      return drag(e, ed.simple ? celler(e, id, was) : mover(e, id, was));
    }
    if (e.target.closest('.sl') || e.target === overlay || e.target === scroller || e.target === holder) drag(e, marquee(e));
  });
  scroller.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e);
    if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; st.setZoom(pinch.k * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch.d); e.preventDefault(); return; }
    if (deck.people.length && e.pointerType === 'mouse') { const p = pos(e); if (p.x > -50 && p.y > -50 && p.x < ed.ctx.W + 50 && p.y < ed.ctx.H + 50) { clearTimeout(st.curT); st.curT = setTimeout(() => deck.setState({ x: Math.round(p.x), y: Math.round(p.y) }), 120); } }
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) scroller.addEventListener(ev, (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; });
  scroller.addEventListener('dblclick', (e) => { if (!ed.edit || ed.picking) return; const id = hit(e); if (id) ed.enter(id); else if (e.target.closest('.sl, .overlay')) { const p = pos(e); if (ed.simple) { const g = gridOf(ed), c = g ? cellAt(g, p, ed.ctx) : -1; if (c >= 0 && !inCell(deck.slide(ed.sid).d.els, c).length) ed.insert('text:body', null, c); } else ed.insertText('body', p.x, p.y, true); } });
  scroller.addEventListener('wheel', (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); st.setZoom(k * Math.exp(-e.deltaY * .004)); }, { passive: false });
  scroller.addEventListener('contextmenu', (e) => { if (!ed.edit || ed.editing) return; const id = hit(e); if (id && !ed.sel.has(id)) ed.select([id]); e.preventDefault(); ed.contextMenu(e.clientX, e.clientY); });
  scroller.addEventListener('click', (e) => {
    if (ed.edit || ed.picking) return;
    const a = e.target.closest('a'), id = hit(e), link = a ? a.getAttribute('href') : id && deck.el(ed.sid, id)?.link;
    if (link && okLink(link)) { e.preventDefault(); ed.follow(link); } else if (id && deck.el(ed.sid, id)?.t === 'video') ed.playVideo(id);
  });
  // links do not open while editing
  holder.addEventListener('click', (e) => { if (ed.edit && e.target.closest('a')) e.preventDefault(); });

  function drag(e, d) {
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false;
    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      if (pinch) return up(ev);
      const lim = e.pointerType === 'touch' ? 8 : 3;
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < lim) return;
      if (!moved) { moved = true; ed.dragging = true; d.start?.(); }
      d.move((ev.clientX - x0) / k, (ev.clientY - y0) / k, ev);
    };
    const up = (ev) => {
      if (ev.pointerId !== undefined && ev.pointerId !== e.pointerId) return;
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      ed.dragging = false;
      guides = [];
      d.end?.(moved, ev);
      drawOverlay();
      if (moved) ed.refreshPanel();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }

  function mover(e, id, was) {
    const key = 'move' + uid(); let ids, start, lines, copied = false;
    return {
      start() {
        if (e.altKey) { ed.duplicateHere(); copied = true; }
        ids = [...ed.sel].filter((i) => !deck.el(ed.sid, i)?.lock);
        start = Object.fromEntries(ids.map((i) => [i, { ...deck.el(ed.sid, i) }]));
        lines = snapLines(new Set(ids));
      },
      move(dx, dy, ev) {
        if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        guides = [];
        if (userSetting('snap', true) && !ev.ctrlKey && !ev.metaKey) { const b = bounds(Object.values(start)), s = snapBox({ ...b, x: b.x + dx, y: b.y + dy }, lines); dx += s.dx; dy += s.dy; if (userSetting('guides', true)) guides = s.g; }
        deck.do(ids.map((i) => ({ k: 'el.set', s: ed.sid, e: i, p: { x: r1(start[i].x + dx), y: r1(start[i].y + dy), ...(start[i].cell != null ? { cell: null, cr: null } : {}) } })), copied ? '' : key);
      },
      end(moved) {
        if (moved) return;
        // a press on something already selected: open it for writing (touch) or keep only it (several selected)
        if (was && ed.sel.size > 1) ed.select(ed.groupOf(id).length === ed.sel.size ? [id] : ed.groupOf(id));
        else if (was && e.pointerType === 'touch') ed.enter(id);
      },
    };
  }
  const r1 = (v) => Math.round(v * 10) / 10;

  /**
   * Simple mode: a block (what is in a cell) goes to another cell; with something already there, they change places. Alt: only
   * this element, together with what is there. On a page whose grid was read, dropped on an empty place it takes its cell there.
   */
  function celler(e, id, was) {
    const g = gridOf(ed), el = { ...deck.el(ed.sid, id) }, own = el.cell != null && g ? cellRect(g, el.cell, ed.ctx) : el;
    let ghost, to = -1, by = [0, 0];
    return {
      start() { if (!g) return; ghost = h('div.gghost', { style: `width:${own.w * k}px;height:${own.h * k}px` }); overlay.append(ghost); },
      move(dx, dy, ev) {
        if (!g) return;
        to = cellAt(g, pos(ev), ed.ctx); by = [dx, dy];
        ghost.style.left = (own.x + dx) * k + 'px'; ghost.style.top = (own.y + dy) * k + 'px';
        $$('.gcell', overlay).forEach((c) => c.classList.toggle('over', +c.dataset.cell === to));
      },
      end(moved, ev) {
        ghost?.remove();
        if (!moved) { if (was && e.pointerType === 'touch') ed.enter(id); return; }
        if (!g) return toast(t('grid_first'));
        const els = structuredClone(deck.slide(ed.sid).d.els);
        if (to < 0 && g.m === 0 && el.cell != null) {
          const c = g.c.map((x) => [...x]), m = c[el.cell], snap = (v, max) => Math.max(0, Math.min(max, Math.round(v * 4) / 4));
          m[0] = snap(m[0] + by[0] / ed.ctx.W * 12, 12 - m[2]); m[1] = snap(m[1] + by[1] / ed.ctx.H * 12, 12 - m[3]);
          const ng = { ...g, c };
          return deck.do([{ k: 'slide.set', s: ed.sid, p: { grid: ng } }, ...arrange(ed.sid, ng, els, ed.ctx, deck.slide(ed.sid).d.els)]);
        }
        if (to < 0 || to === el.cell) return;
        if (ev.altKey || el.cell == null) { els[id].cell = to; delete els[id].cr; makeRoom(els, to, id); } else {
          const mine = inCell(els, el.cell), there = inCell(els, to);
          for (const [x] of mine) els[x].cell = to;
          for (const [x] of there) els[x].cell = el.cell;
        }
        deck.do(arrange(ed.sid, g, els, ed.ctx, deck.slide(ed.sid).d.els));
      },
    };
  }

  function resizer(hd, e) {
    const id = [...ed.sel][0], o = { ...deck.el(ed.sid, id) }, key = 'size' + uid(), a = rad(o.r || 0), cos = Math.cos(a), sin = Math.sin(a), c = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
    const set = (p) => deck.do({ k: 'el.set', s: ed.sid, e: id, p: o.cell != null ? { ...p, cell: null, cr: null } : p }, key);
    if (hd === 'rot') return { move(dx, dy, ev) { const p = pos(ev); let d = Math.round(Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI + 90); d = ((d + 180) % 360 + 360) % 360 - 180; if (ev.shiftKey) d = Math.round(d / 15) * 15; else for (const q of [-180, -90, 0, 90, 180]) if (Math.abs(d - q) < 4) d = q; set({ r: d === -180 ? 180 : d }); } };
    if (hd === 'p1' || hd === 'p2') {
      const end = (s) => ({ x: c.x + s * o.w / 2 * cos, y: c.y + s * o.w / 2 * sin }), fix = end(hd === 'p1' ? 1 : -1);
      return { move(dx, dy, ev) {
        const p = pos(ev); let vx = p.x - fix.x, vy = p.y - fix.y;
        if (ev.shiftKey) { const an = Math.round(Math.atan2(vy, vx) / (Math.PI / 12)) * (Math.PI / 12), l = Math.hypot(vx, vy); vx = Math.cos(an) * l; vy = Math.sin(an) * l; }
        const w = Math.max(4, Math.hypot(vx, vy)), an = Math.atan2(hd === 'p1' ? -vy : vy, hd === 'p1' ? -vx : vx), cx = fix.x + vx / 2, cy = fix.y + vy / 2;
        set({ w: r1(w), x: r1(cx - w / 2), y: r1(cy - o.h / 2), r: r1(an * 180 / Math.PI) });
      } };
    }
    const left = hd.includes('w'), right = hd.includes('e'), top = hd.includes('n'), bottom = hd.includes('s'), corner = hd.length === 2;
    const lines = snapLines(new Set([id])), keep = o.t === 'image' || o.t === 'video';
    const size0 = o.t === 'text' ? styleOf(o, sc()).size : 0;
    return { move(dx, dy, ev) {
      if (!o.r && userSetting('snap', true) && !ev.ctrlKey && !ev.metaKey) {
        const b = { x: o.x + (left ? dx : 0), y: o.y + (top ? dy : 0), w: o.w + (right ? dx : left ? -dx : 0), h: o.h + (bottom ? dy : top ? -dy : 0) };
        const s = snapBox(b, lines, { x: left ? [0] : right ? [1] : [], y: top ? [0] : bottom ? [1] : [] });
        dx += s.dx; dy += s.dy; guides = userSetting('guides', true) ? s.g : [];
      }
      let lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
      let w = Math.max(8, o.w + (right ? lx : left ? -lx : 0)), hh = Math.max(4, o.h + (bottom ? ly : top ? -ly : 0));
      const scaleText = o.t === 'text' && corner && ev.altKey;
      if (corner && (keep !== ev.shiftKey || scaleText)) { const f = Math.max(w / o.w, hh / o.h); w = o.w * f; hh = o.h * f; }
      // the opposite side stays where it is, also when the element is rotated
      const sx = right ? 1 : left ? -1 : 0, sy = bottom ? 1 : top ? -1 : 0, ox = (w - o.w) / 2 * sx, oy = (hh - o.h) / 2 * sy;
      const nc = { x: c.x + ox * cos - oy * sin, y: c.y + ox * sin + oy * cos };
      const p = { x: r1(nc.x - w / 2), y: r1(nc.y - hh / 2), w: r1(w), h: r1(hh) };
      if (scaleText) p.size = r1(size0 * w / o.w);
      set(p);
    } };
  }

  function marquee(e) {
    const s = pos(e), add = e.shiftKey ? [...ed.sel] : [], m = h('div.marquee');
    if (!add.length && ed.sel.size) ed.select([]);
    return {
      start() { overlay.append(m); },
      move(dx, dy) {
        const b = { x: Math.min(s.x, s.x + dx), y: Math.min(s.y, s.y + dy), w: Math.abs(dx), h: Math.abs(dy) };
        const ids = sorted(cur().d).filter((el) => { const q = aabb(el); return !el.lock && q.x < b.x + b.w && q.x + q.w > b.x && q.y < b.y + b.h && q.y + q.h > b.y; }).map((x) => x.id);
        ed.select([...new Set([...add, ...ids])], true);
        Object.assign(m.style, { left: b.x * k + 'px', top: b.y * k + 'px', width: b.w * k + 'px', height: b.h * k + 'px' });
        overlay.append(m);
      },
      end() { m.remove(); ed.select([...ed.sel]); },
    };
  }

  // ------------------------------------------------------------------ drops: palette, files

  scroller.addEventListener('dragover', (e) => { if (!ed.edit) return; const ty = e.dataTransfer.types; if (ty.includes('text/sp-insert') || ty.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; scroller.classList.add('drop'); } });
  scroller.addEventListener('dragleave', (e) => { if (!scroller.contains(e.relatedTarget)) scroller.classList.remove('drop'); });
  scroller.addEventListener('drop', async (e) => {
    scroller.classList.remove('drop');
    if (!ed.edit) return;
    const p = pos(e), what = e.dataTransfer.getData('text/sp-insert');
    if (what) { e.preventDefault(); const g = ed.simple && gridOf(ed), c = g ? cellAt(g, p, ed.ctx) : -1; return ed.insert(what, p, c >= 0 ? c : undefined); }
    if (e.dataTransfer.files.length) { e.preventDefault(); const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.el-image'); await uploadFiles(e.dataTransfer.files, (m) => { if (over && deck.el(ed.sid, over.dataset.id) && !deck.el(ed.sid, over.dataset.id).src) ed.setImage(over.dataset.id, m); else ed.insertImage(m, p); }, (v) => ed.insertVideo(v, p)); }
  });

  st.leave = () => ro.disconnect();
  st.applyBg = () => st.draw();
  st.startEdit = (id, caret) => openText(ed, st, id, caret);
  return st;
}
