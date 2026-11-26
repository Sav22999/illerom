/**
 * Simple mode: a page is a grid and every element sits in a cell. A cell is [x, y, w, h] on a board of 12 × 12; the
 * elements keep their real position and size too, so who uses the advanced mode, the show and the files need to know
 * nothing about grids. An element moved by hand in the advanced mode leaves its cell.
 */
import {$, $$, btn, clamp, dialog, h, icon, iconBtn, ok, oops, tile, toast, uid} from './core.js';
import {t} from './i18n.js';
import {slideContext, styleOf} from './themes.js';
import {isEmpty} from './richtext.js';

const row = (y, hh, widths) => {
    const tot = widths.reduce((a, b) => a + b, 0);
    let x = 0;
    return widths.map((w) => {
        const c = [x, y, 12 * w / tot, hh];
        x += 12 * w / tot;
        return c.map((v) => Math.round(v * 1e4) / 1e4);
    });
};

/** Rows from top to bottom: [height, [width of each column]] to cells. */
export function fromRows(rows) {
    const tot = rows.reduce((a, r) => a + r[0], 0);
    let y = 0;
    return rows.flatMap(([hh, w]) => {
        const v = 12 * hh / tot, out = row(y, v, w);
        y += v;
        return out;
    }).map((c) => c.map((v) => Math.round(v * 1e4) / 1e4));
}

const T = [2, [1]]; // the row of the title
export const GRIDS = [
    ['one', [[1, [1]]]], ['t-one', [T, [10, [1]]]], ['two', [[1, [1, 1]]]], ['t-two', [T, [10, [1, 1]]]], ['t-13', [T, [10, [1, 2]]]], ['t-31', [T, [10, [2, 1]]]], ['t-three', [T, [10, [1, 1, 1]]]], ['t-four', [T, [10, [1, 1, 1, 1]]]],
    ['rows', [[1, [1]], [1, [1]]]], ['21', [[1, [1, 1]], [1, [1]]]], ['12', [[1, [1]], [1, [1, 1]]]], ['31', [[1, [1, 1, 1]], [1, [1]]]], ['13r', [[1, [1]], [1, [1, 1, 1]]]], ['t-21', [T, [5, [1, 1]], [5, [1]]]], ['t-22', [T, [5, [1, 1]], [5, [1, 1]]]], ['t-33', [T, [5, [1, 1, 1]], [5, [1, 1, 1]]]], ['22', [[1, [1, 1]], [1, [1, 1]]]],
].map(([id, rows]) => ({id, rows, c: fromRows(rows)})).concat([
    {id: 'l-2', c: [[0, 0, 6, 12], [6, 0, 6, 6], [6, 6, 6, 6]]}, {
        id: 'r-2',
        c: [[0, 0, 6, 6], [0, 6, 6, 6], [6, 0, 6, 12]]
    },
    {id: 't-l2', c: [[0, 0, 12, 2], [0, 2, 6, 10], [6, 2, 6, 5], [6, 7, 6, 5]]}, {
        id: 't-r2',
        c: [[0, 0, 12, 2], [0, 2, 6, 5], [0, 7, 6, 5], [6, 2, 6, 10]]
    },
    {id: 'side', c: [[0, 0, 5, 2.4], [0, 2.4, 5, 9.6], [5, 0, 7, 12]]}, {
        id: 'big',
        c: [[0, 0, 8, 12], [8, 0, 4, 4], [8, 4, 4, 4], [8, 8, 4, 4]]
    },
]);

/** The place of a cell on the page. A grid read from a page (m = 0) has the whole page as board and no gap. */
export function cellRect(grid, i, ctx) {
  const c = grid.c[i];
  if (!c) return null;
  const { W, H, s } = ctx, free = grid.m === 0, g = free ? 0 : (grid.g ?? 24) * s, mx = free ? 0 : Math.max(0, W * .06 - g / 2), my = free ? 0 : Math.max(0, H * .075 - g / 2), bw = W - 2 * mx, bh = H - 2 * my;
  return { x: mx + c[0] / 12 * bw + g / 2, y: my + c[1] / 12 * bh + g / 2, w: Math.max(.5, c[2] / 12 * bw - g), h: Math.max(.5, c[3] / 12 * bh - g) };
}
/** The cell at a point; where two are one over the other, the smaller. */
export function cellAt(grid, p, ctx) {
  let best = -1, area = Infinity;
  grid.c.forEach((_, i) => { const r = cellRect(grid, i, ctx), m = grid.m === 0 ? 4 : (grid.g ?? 24) * ctx.s / 2; if (p.x >= r.x - m && p.x <= r.x + r.w + m && p.y >= r.y - m && p.y <= r.y + r.h + m && r.w * r.h < area) { best = i; area = r.w * r.h; } });
  return best;
}
export const inCell = (els, i) => Object.entries(els).filter(([, e]) => e.cell === i).sort((a, b) => (a[1].z || 0) - (b[1].z || 0));
export const firstFree = (grid, els) => grid.c.findIndex((_, i) => !inCell(els, i).length);

const r1 = (v) => Math.round(v * 10) / 10;

/** Where the elements of a cell go: at their place inside it (cr, fractions of the cell), or one under the other. */
function stack(rect, list, ctx) {
  const g = 12 * ctx.s, rel = (c) => ({ x: rect.x + c[0] * rect.w, y: rect.y + c[1] * rect.h, w: Math.max(.5, c[2] * rect.w), h: Math.max(.5, c[3] * rect.h) });
  const loose = list.filter(([, e]) => !e.cr), n = loose.length, hh = (rect.h - g * (n - 1)) / Math.max(1, n);
  return list.map(([id, e]) => {
    if (e.cr) {
      const b = rel(e.cr), c = e.cr;
      if (e.w && e.h && c[2] * c[3] < .8 && (e.t === 'icon' || (e.t === 'shape' && !/^(rect|round|line|speech|wave|frame)$/.test(e.shape || 'rect') && isEmpty(e.html)))) {
        // circles stay circles: the whole block is scaled the same way in both directions for them
        const W0 = e.w / c[2], H0 = e.h / c[3], u = Math.min(rect.w / W0, rect.h / H0), w = e.w * u, h2 = e.h * u, mid = Math.abs(c[0] + c[2] / 2 - .5) < .06;
        return [id, { x: mid ? b.x + (b.w - w) / 2 : rect.x + c[0] * W0 * u, y: b.y + (b.h - h2) / 2, w, h: h2 }];
      }
      return [id, b];
    }
    const b = { x: rect.x, y: rect.y + loose.findIndex((x) => x[0] === id) * (hh + g), w: rect.w, h: Math.max(8, hh) };
    if (e.t === 'icon') { const d = Math.min(b.w, b.h, 190 * ctx.s); return [id, { x: b.x + (b.w - d) / 2, y: b.y + (b.h - d) / 2, w: d, h: d }]; }
    if (e.t === 'shape' && e.shape === 'line') return [id, { x: b.x, y: b.y + b.h / 2 - 12, w: b.w, h: 24 }];
    if (e.t === 'shape' && !/^(rect|round|speech|wave|frame)$/.test(e.shape || 'rect') && isEmpty(e.html)) { const d = Math.min(b.w, b.h); return [id, { x: b.x + (b.w - d) / 2, y: b.y, w: d, h: d }]; }
    return [id, b];
  });
}
const sameRect = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
/** The changes that put every element of the page in its cell. els can hold cells different from the current ones. */
export function arrange(sid, grid, els, ctx, before = els) {
  const ops = [];
  grid.c.forEach((_, i) => {
    const list = inCell(els, i);
    if (!list.length) return;
    for (const [id, b] of stack(cellRect(grid, i, ctx), list, ctx)) {
      const now = before[id], p = {}, cr = els[id].cr;
      if (!now) continue;
      for (const k of ['x', 'y', 'w', 'h']) if (Math.abs((now[k] ?? 0) - b[k]) > .06) p[k] = r1(b[k]);
      if (now.r && !cr) p.r = null;
      if (now.cell !== i) p.cell = i;
      if (!sameRect(now.cr, cr)) p.cr = cr || null;
      if (Object.keys(p).length) ops.push({ k: 'el.set', s: sid, e: id, p });
    }
  });
  for (const [id, e] of Object.entries(els)) if (e.cell == null && before[id] && (before[id].cell != null || before[id].cr)) ops.push({ k: 'el.set', s: sid, e: id, p: { cell: null, cr: null } });
  return ops;
}
/** A place for one more element in a cell: those already there shrink upwards. els is changed. */
export function makeRoom(els, i, id) {
  const list = inCell(els, i).filter(([x]) => x !== id);
  if (!list.some(([, e]) => e.cr)) return;
  const under = list.filter(([, e]) => decoration(e) && e.cr && e.cr[2] > .9 && e.cr[3] > .9), rest = list.filter((x) => !under.includes(x)), k = rest.length ? rest.length / (rest.length + 1) : 0, pad = under.length ? .08 : 0;
  for (const [, e] of rest) if (e.cr) e.cr = [e.cr[0], e.cr[1] * k, e.cr[2], e.cr[3] * k].map(r4);
  els[id].cr = [pad, r4(Math.max(pad, k)), 1 - 2 * pad, r4(1 - Math.max(pad, k) - pad)];
}

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const decoration = (e) => e.t === 'shape' && isEmpty(e.html) && !e.link;
const aabb = (e) => { if (!e.r) return { x: e.x, y: e.y, w: e.w, h: e.h }; const a = e.r * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)), w = e.w * c + e.h * s, h2 = e.w * s + e.h * c; return { x: e.x + e.w / 2 - w / 2, y: e.y + e.h / 2 - h2 / 2, w, h: h2 }; };
const cross = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const join = (a, b) => { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; };
const away = (a, b) => Math.hypot(Math.max(0, a.x - b.x - b.w, b.x - a.x - a.w), Math.max(0, a.y - b.y - b.h, b.y - a.y - a.h));

/**
 * What goes together on a page drawn freely: a card with what is on it, a group, a picture with its label, a small mark
 * beside a title. Backgrounds (nearly as big as the page) are left out. [{ids, b: box, deco: only decorations}]
 */
export function units(els, ctx) {
  const page = { x: 0, y: 0, w: ctx.W, h: ctx.H }, all = Object.entries(els).map(([id, e]) => ({ id, e, b: aabb(e) })).filter((x) => cross(x.b, page) > 0 && !(x.b.w * x.b.h > ctx.W * ctx.H * .8 && (decoration(x.e) || x.e.t === 'image' || x.e.t === 'video') && Object.keys(els).length > 1));
  const up = all.map((_, i) => i), top = (i) => (up[i] === i ? i : (up[i] = top(up[i])));
  for (let i = 0; i < all.length; i++) for (let k = i + 1; k < all.length; k++) {
    const a = all[i], b = all[k], s = Math.min(a.b.w * a.b.h, b.b.w * b.b.h);
    if ((a.e.g && a.e.g === b.e.g) || cross(a.b, b.b) > s * .35) up[top(i)] = top(k);
  }
  const map = new Map();
  all.forEach((x, i) => { const k = top(i); if (!map.has(k)) map.set(k, []); map.get(k).push(x); });
  let out = [...map.values()].map((l) => ({ ids: l.map((x) => x.id), b: l.map((x) => x.b).reduce(join), deco: l.every((x) => decoration(x.e)) }));
  // a line or a small mark belongs to what is next to it
  for (const u of out.filter((x) => x.deco && x.b.w * x.b.h < ctx.W * ctx.H * .02)) {
    const near = out.filter((x) => !x.deco).map((x) => [away(x.b, u.b), x]).sort((a, b) => a[0] - b[0])[0];
    if (near && near[0] < 36 * ctx.s && u.b.w <= near[1].b.w * 1.1) { near[1].ids.push(...u.ids); near[1].b = join(near[1].b, u.b); out = out.filter((x) => x !== u); }
  }
  // icon, title and text of a column, a picture with its caption: one under the other, on the same side, close
  const narrow = (u) => u.b.w < ctx.W * .55 && !u.ids.some((id) => els[id].role === 'title' || els[id].role === 'subtitle');
  for (let again = true; again;) {
    again = false;
    for (let i = 0; i < out.length && !again; i++) for (let k = 0; k < out.length && !again; k++) {
      const a = out[i], b = out[k], gap = b.b.y - a.b.y - a.b.h;
      if (i === k || a.deco || b.deco || !narrow(a) || !narrow(b) || Math.abs(a.b.x - b.b.x) > 14 * ctx.s || gap < -14 * ctx.s || gap > 26 * ctx.s) continue;
      if (a.b.w > b.b.w * 1.6 && a.ids.some((id) => els[id].t === 'text')) continue;
      out[i] = { ids: [...a.ids, ...b.ids], b: join(a.b, b.b), deco: false }; out.splice(k, 1); again = true;
    }
  }
  while (out.length > 24) { let best = null; for (let i = 0; i < out.length; i++) for (let k = i + 1; k < out.length; k++) { const d = away(out[i].b, out[k].b); if (!best || d < best[0]) best = [d, i, k]; } const [, i, k] = best; out[i] = { ids: [...out[i].ids, ...out[k].ids], b: join(out[i].b, out[k].b), deco: out[i].deco && out[k].deco }; out.splice(k, 1); }
  const head = (u) => u.ids.some((id) => /^(title|heading)$/.test(els[id].role || ''));
  return out.sort((a, b) => Math.round((a.b.y - b.b.y) / (40 * ctx.s)) || a.b.x - b.b.x || head(b) - head(a));
}

/** The biggest free rectangle inside the margins, in cells of a board of 12 x 12 of the whole page. */
function freeRect(cells, min) {
  const N = 24, used = Array.from({ length: N }, () => Array(N).fill(false)), lo = 2, hi = N - 2;
  for (const c of cells) for (let y = Math.max(0, Math.floor(c[1] * 2 + .2)); y < Math.min(N, Math.ceil((c[1] + c[3]) * 2 - .2)); y++) for (let x = Math.max(0, Math.floor(c[0] * 2 + .2)); x < Math.min(N, Math.ceil((c[0] + c[2]) * 2 - .2)); x++) used[y][x] = true;
  let best = null;
  for (let y = lo; y < hi; y++) for (let x = lo; x < hi; x++) {
    let w = hi - x;
    for (let y2 = y; y2 < hi && w > 0; y2++) { let k = 0; while (k < w && !used[y2][x + k]) k++; w = k; const a = w * (y2 - y + 1); if (w >= 6 && y2 - y >= 3 && (!best || a > best[0])) best = [a, [x, y, w, y2 - y + 1]]; }
  }
  if (!best || best[0] < N * N * min) return null;
  const [x, y, w, hh] = best[1], g = .12; // a little air around
  return [x / 2 + g, y / 2 + g, w / 2 - 2 * g, hh / 2 - 2 * g].map(r4);
}

/**
 * The grid a freely drawn page already has: nothing moves, every block becomes a cell, the big empty places too.
 * Returns the changes (none when the page has a grid or is empty).
 */
export function readGrid(slide, ctx) {
  const els = slide.d.els, list = units(els, ctx);
  if (slide.d.grid || !list.length) return [];
  const { W, H } = ctx, c = list.map((u) => { const x = Math.max(0, u.b.x), y = Math.max(0, u.b.y), w = Math.min(W, u.b.x + u.b.w) - x, hh = Math.min(H, u.b.y + u.b.h) - y; return [x / W * 12, y / H * 12, Math.max(.1, w / W * 12), Math.max(.1, hh / H * 12)].map(r4).map((v, i, a) => (i === 2 ? Math.min(v, 12 - a[0]) : i === 3 ? Math.min(v, 12 - a[1]) : v)); });
  for (let n = 0; n < 2 && c.length < 24; n++) { const f = freeRect(c, .13); if (!f) break; c.push(f); }
  const grid = { c, g: 0, m: 0 }, ops = [{ k: 'slide.set', s: slide.sid, p: { grid } }];
  list.forEach((u, i) => { const r = cellRect(grid, i, ctx); for (const id of u.ids) { const e = els[id]; ops.push({ k: 'el.set', s: slide.sid, e: id, p: { cell: i, cr: [(e.x - r.x) / r.w, (e.y - r.y) / r.h, e.w / r.w, e.h / r.h].map((v) => Math.max(-2, Math.min(3, Math.round(v * 1e5) / 1e5))) } }); } });
  return ops;
}
/** Every page that can be changed gets its grid (entering the simple mode); one step of undo. */
export function readAll(ed, only = null) {
  const ops = ed.deck.order().filter((s) => (!only || s.sid === only) && ed.deck.canEditPage(s.sid)).flatMap((s) => readGrid(s, ed.ctx));
  if (ops.length) ed.deck.do(ops);
  return ops.filter((o) => o.k === 'slide.set').length;
}
/** Room for something new on a page whose grid was read: the biggest empty place becomes a cell. Returns the grid, or null. */
export function growGrid(grid) {
  const f = grid.m === 0 && grid.c.length < 24 && freeRect(grid.c, .06);
  return f ? { ...grid, c: [...grid.c, f] } : null;
}

/** No room left on a page: the tidy grid for its blocks and one more. */
export function nextGrid(els, ctx) {
  const list = Object.values(els).some((e) => e.cell != null) ? [...new Set(Object.values(els).map((e) => e.cell).filter((c) => c != null))].map((c) => ({ ids: inCell(els, c).map((x) => x[0]) })) : units(els, ctx);
  const head = list.some((u) => u.ids.some((id) => /^(title|heading)$/.test(els[id].role || ''))), n = list.length + 1, id = head ? ['t-one', 't-one', 't-one', 't-two', 't-three', 't-22', 't-33', 't-33'][n] : ['one', 'one', 'two', '21', '22', null, null, null][n];
  return GRIDS.find((g) => g.id === id) || null;
}

/** Chooses the cell of every block of a page: titles first, then in reading order. Blocks of one element fill their cell. */
export function assign(grid, els, ctx) {
  const out = structuredClone(els), seen = new Map();
  let list;
  if (Object.values(els).some((e) => e.cell != null)) {
    for (const [id, e] of Object.entries(els)) if (e.cell != null) { if (!seen.has(e.cell)) seen.set(e.cell, []); seen.get(e.cell).push(id); }
    list = [...seen.values()].map((ids) => ({ ids, b: ids.map((id) => aabb(els[id])).reduce(join), deco: ids.every((id) => decoration(els[id])) }));
  } else list = units(els, ctx);
  for (const e of Object.values(out)) { delete e.cell; }
  const head = (u) => u.ids.some((id) => /^(title|heading|big)$/.test(els[id].role || ''));
  list = list.filter((u) => !u.deco).sort((a, b) => head(b) - head(a) || Math.round((a.b.y - b.b.y) / 60) || a.b.x - b.b.x);
  list.forEach((u, n) => {
    const cell = Math.min(n, grid.c.length - 1), alone = n < grid.c.length - 1 || list.length <= grid.c.length;
    for (const id of u.ids) { const e = out[id], b = els[id]; e.cell = cell; if (u.ids.length === 1 || !alone) delete e.cr; else e.cr = [(b.x - u.b.x) / u.b.w, (b.y - u.b.y) / u.b.h, b.w / u.b.w, b.h / u.b.h].map(r4); }
    if (!alone) for (const id of u.ids) if (decoration(out[id])) delete out[id].cell;
  });
  for (const e of Object.values(out)) if (e.cell == null) delete e.cr;
  return out;
}

/** Gives a page a grid. Lines and shapes that were only decorations of the old layout can go (they would end up anywhere). */
export async function applyGrid(ed, grid) {
  const s = ed.deck.slide(ed.sid);
  if (!s) return ed.addSlide();
  const els = assign(grid, s.d.els, ed.ctx), deco = Object.entries(s.d.els).filter(([id, e]) => els[id].cell == null && decoration(e) && e.w * e.h < ed.ctx.W * ed.ctx.H * .8);
  let drop = false;
  if (deco.length) { const a = await dialog(t('grid_deco'), h('p', t('grid_deco_t', { n: deco.length })), [[t('keep'), 'keep', { appearance: 'outline', variant: 'neutral' }], [t('remove'), 'drop']], { width: '28rem' }); if (!a) return; drop = a === 'drop'; }
  if (drop) for (const [id] of deco) delete els[id];
  ed.deck.do([{ k: 'slide.set', s: ed.sid, p: { grid: { c: grid.c, g: grid.g ?? (s.d.grid?.m === 0 ? 24 : s.d.grid?.g) ?? 24 } } }, ...(drop ? deco.map(([e]) => ({ k: 'el.del', s: ed.sid, e })) : []), ...arrange(ed.sid, grid, els, ed.ctx, s.d.els)]);
  ed.sel.clear(); ed.select([]); ed.refreshPanel();
}

export const gridOf = (ed) => ed.deck.slide(ed.sid)?.d.grid || null;

/** The elements of the page again in their cells (after adding, deleting or moving one). */
export function settle(ed, els = ed.deck.slide(ed.sid).d.els) {
    const g = gridOf(ed);
    return g ? arrange(ed.sid, g, els, ed.ctx, ed.deck.slide(ed.sid).d.els) : [];
}

// ------------------------------------------------------------------ panel

const preview = (g) => h('div.gprev', ...g.c.map((c) => h('i', {style: `left:${c[0] / .12}%;top:${c[1] / .12}%;width:${c[2] / .12}%;height:${c[3] / .12}%`})));
const same = (a, b) => a && b && JSON.stringify(a.c) === JSON.stringify(b.c);

/**
 * A grid of one's own: a board of squares (columns x rows); dragging across squares joins them into one box, so a box can
 * span rows or columns. Squares not part of any box become boxes on their own.
 */
function ownGrid(ed) {
    let cols = 3, rows = 2, boxes = [], from = null, over = null;
    const board = h('div.gboard', {role: 'application', 'aria-label': t('grid_board')}), out = h('div.stack');
    const cells = () => {
        const used = new Set();
        for (const [x, y, w, hh] of boxes) for (let a = x; a < x + w; a++) for (let b = y; b < y + hh; b++) used.add(a + ',' + b);
        const all = [...boxes];
        for (let b = 0; b < rows; b++) for (let a = 0; a < cols; a++) if (!used.has(a + ',' + b)) all.push([a, b, 1, 1]);
        all.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
        return all.map(([x, y, w, hh]) => [x * 12 / cols, y * 12 / rows, w * 12 / cols, hh * 12 / rows].map((v) => Math.round(v * 1e4) / 1e4));
    };
    const rect = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]) + 1, Math.abs(a[1] - b[1]) + 1];
    const hits = (p, q) => p[0] < q[0] + q[2] && q[0] < p[0] + p[2] && p[1] < q[1] + q[3] && q[1] < p[1] + p[3];
    const draw = () => {
        board.style.setProperty('--c', cols); board.style.setProperty('--r', rows);
        const sel = from && over ? rect(from, over) : null;
        board.replaceChildren(...Array.from({length: cols * rows}, (_, n) => { const a = n % cols, b = n / cols | 0; return h('i.gsq', {'data-a': a, 'data-b': b, class: sel && hits([a, b, 1, 1], sel) ? 'on' : ''}); }),
            ...cells().map((c, n) => h('span.gbox', {style: `left:${c[0] / .12}%;top:${c[1] / .12}%;width:${c[2] / .12}%;height:${c[3] / .12}%`}, String(n + 1))));
    };
    const at = (e) => { const r = board.getBoundingClientRect(); return [Math.max(0, Math.min(cols - 1, Math.floor((e.clientX - r.left) / r.width * cols))), Math.max(0, Math.min(rows - 1, Math.floor((e.clientY - r.top) / r.height * rows)))]; };
    board.addEventListener('pointerdown', (e) => { e.preventDefault(); board.setPointerCapture(e.pointerId); from = over = at(e); draw(); });
    board.addEventListener('pointermove', (e) => { if (!from) return; const p = at(e); if (p + '' !== over + '') { over = p; draw(); } });
    board.addEventListener('pointerup', () => { if (!from) return; const r = rect(from, over); boxes = boxes.filter((x) => !hits(x, r)); if (r[2] * r[3] > 1) boxes.push(r); from = over = null; draw(); });
    const size = (label, v, max, f) => { const n = h('sav-number-input', {size: 'sm', label, value: v, min: 1, max, limits: 'never', onchange: () => { f(clamp(+n.value || 1, 1, max)); boxes = boxes.filter(([x, y, w, hh]) => x + w <= cols && y + hh <= rows); draw(); }}); return n; };
    draw();
    out.append(h('p.muted.hint', t('grid_own_t')), h('div.prow', size(t('grid_cols'), cols, 6, (v) => { cols = v; }), size(t('grid_rows'), rows, 4, (v) => { rows = v; })), board,
        h('div.prow', btn(t('grid_clear'), () => { boxes = []; draw(); }, {size: 'sm', appearance: 'ghost', variant: 'neutral', icon: 'rotate-ccw'}), h('div.spacer'), btn(t('use'), () => applyGrid(ed, {c: cells()}), {size: 'sm'})));
    return out;
}

export function gridPanel(ed) {
    const cur = gridOf(ed);
    const box = ownGrid(ed);
    return h('div', !cur && h('sav-alert', {variant: 'primary'}, t('grid_pick')),
        h('div.grids', ...GRIDS.map((g) => tile(t('grid'), () => applyGrid(ed, g), {class: 'lay' + (same(cur, g) ? ' on' : '')}, preview(g)))),
        h('sav-details.psec2', {summary: t('grid_own'), appearance: 'plain', open: true}, box),
        cur && h('section.psec', cur.m === 0 ? h('p.muted.hint', t('grid_read_t')) : h('sav-range', {
                label: t('grid_gap'),
                value: cur.g ?? 24,
                min: 0,
                max: 80,
                step: 2,
                'show-value': true,
                onchange: (e) => {
                    const g = {...cur, g: +e.target.value};
                    ed.deck.do([{
                        k: 'slide.set',
                        s: ed.sid,
                        p: {grid: g}
                    }, ...arrange(ed.sid, g, ed.deck.slide(ed.sid).d.els, ed.ctx)]);
                    ed.refreshPanel();
                }
            }),
            btn(t('grid_none'), () => {
                const els = ed.deck.slide(ed.sid).d.els;
                ed.deck.do([{
                    k: 'slide.set',
                    s: ed.sid,
                    p: {grid: null}
                }, ...Object.entries(els).filter(([, e]) => e.cell != null).map(([e]) => ({
                    k: 'el.set',
                    s: ed.sid,
                    e,
                    p: {cell: null, cr: null}
                }))]);
                ed.refreshPanel();
            }, {size: 'sm', appearance: 'ghost', variant: 'neutral'})));
}

// ------------------------------------------------------------------ on the page

const THINGS = [['text:heading', 'heading-1', 'r_heading'], ['text:body', 'type', 'r_body'], ['text:list', 'list', 'r_list'], ['image', 'image', 'image'], ['chart:bar', 'chart-column', 'chart'], ['table', 'table', 'table'], ['video', 'film', 'video'], ['text:quote', 'quote', 'r_quote'], ['text:big', 'hash', 'r_big']];

/** Draws the cells over the page; the empty ones have a button to fill them. */
export function drawCells(ed, overlay, k) {
    const g = gridOf(ed);
    if (!g) return;
    const els = ed.deck.slide(ed.sid).d.els;
    g.c.forEach((_, i) => {
        const r = cellRect(g, i, ed.ctx), list = inCell(els, i), box = h('div.gcell', {
            class: (list.length ? 'full' : 'free') + (ed.overCell === i ? ' over' : ''),
            'data-cell': i,
            style: `left:${r.x * k}px;top:${r.y * k}px;width:${r.w * k}px;height:${r.h * k}px`
        });
        const d = h('sav-dropdown.gadd', {
            placement: 'bottom',
            'sheet-on-mobile': true,
            label: t('insert')
        }, h('sav-button', {
            slot: 'trigger',
            icon: 'plus',
            circle: true,
            size: 'sm',
            appearance: 'solid',
            label: t('insert')
        }), ...THINGS.map(([v, ic, l]) => h('sav-menu-item', {value: v}, icon(ic, {slot: 'prefix'}), t(l))));
        d.addEventListener('sav-select', (e) => {
            e.stopPropagation();
            ed.insert(e.detail.value, null, i);
        });
        // a cell with something in it can take more when it is the one being worked on
        if (!list.length || list.some(([id]) => ed.sel.has(id))) box.append(d);
        overlay.append(box);
    });
}

/** Text in a cell gets smaller until it fits; with room again, back to the size of its style. */
export function fitText(ed, id, rt) {
    const el = ed.deck.el(ed.sid, id);
    if (!el || el.t !== 'text') return null;
    const sc = slideContext(ed.ctx, ed.deck.slide(ed.sid).d), base = styleOf({...el, size: undefined}, sc).size,
        pad = styleOf(el, sc).pad * 2, was = rt.style.fontSize;
    let size = base;
    rt.style.fontSize = size + 'px';
    while (rt.scrollHeight + pad > el.h + 1 && size > 9) {
        size *= .95;
        rt.style.fontSize = size + 'px';
    }
    rt.style.fontSize = was;
    size = Math.round(size * 10) / 10;
    return Math.abs(size - base) < .2 ? null : size;
}

void uid;
void oops;
void ok;
void toast;
void $;
void $$;
