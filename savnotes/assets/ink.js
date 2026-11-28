/**
 * Geometry of a sheet, without the screen: the outline of a line drawn by hand (its width follows the pressure), the path
 * of the highlighter, the box of each item and what a point or a box touches (the same of SavWhiteboard).
 */
import { r2 } from './model.js';

const pts = (p) => { const o = []; for (let i = 0; i + 2 < p.length; i += 3) o.push([p[i], p[i + 1], p[i + 2]]); return o; };
const f = (n) => Math.round(n * 100) / 100;

/** How wide a pen is at a pressure (0–1): from 40% to 160% of its size. */
export const widthAt = (tool, s, pr) => (tool === 'pencil' ? s * (.55 + pr * .9) : s * (.4 + pr * 1.2));

/**
 * The outline of a stroke of pen or pencil, as a filled SVG path: the two sides of the line, with round ends. Short
 * curves join the points (the middle of each pair is on the curve), so the edge stays smooth.
 */
export function outline(item) {
  const P = pts(item.p);
  if (!P.length) return '';
  const w = P.map((q) => widthAt(item.tool, item.s, q[2]) / 2);
  if (P.length === 1 || P.every((q) => Math.abs(q[0] - P[0][0]) < .01 && Math.abs(q[1] - P[0][1]) < .01)) {
    const r = Math.max(.3, w[0]), [x, y] = P[0];
    return `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
  }
  // the ends get thinner a little, as a real pen that lands and leaves
  const n = P.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    // (a piece of a stroke still being drawn, _ts / _te: that end goes on in the next piece, so it is not thinner)
    const taper = item.tool === 'pencil' ? 1 : Math.min(1, .55 + .45 * Math.min(item._ts ? 3 : i, item._te ? 3 : n - 1 - i) / 3);
    const r = w[i] * taper;
    L.push([P[i][0] - dy * r, P[i][1] + dx * r]);
    R.push([P[i][0] + dy * r, P[i][1] - dx * r]);
  }
  const curve = (side) => { let d = ''; for (let i = 1; i < side.length - 1; i++) { const m = [(side[i][0] + side[i + 1][0]) / 2, (side[i][1] + side[i + 1][1]) / 2]; d += `Q${f(side[i][0])} ${f(side[i][1])} ${f(m[0])} ${f(m[1])}`; } const e = side[side.length - 1]; return d + `L${f(e[0])} ${f(e[1])}`; };
  const rEnd = Math.max(.3, w[n - 1] * (item.tool === 'pencil' || item._te ? 1 : .55)), rStart = Math.max(.3, w[0] * (item.tool === 'pencil' || item._ts ? 1 : .55));
  const Rr = R.slice().reverse();
  return `M${f(L[0][0])} ${f(L[0][1])}${curve(L)}A${f(rEnd)} ${f(rEnd)} 0 0 1 ${f(Rr[0][0])} ${f(Rr[0][1])}${curve(Rr)}A${f(rStart)} ${f(rStart)} 0 0 1 ${f(L[0][0])} ${f(L[0][1])}Z`;
}

/** The middle line of a stroke (the highlighter is a wide line of the same width all along). */
export function centerline(item) {
  const P = pts(item.p);
  if (!P.length) return '';
  if (P.length === 1) return `M${f(P[0][0])} ${f(P[0][1])}l.01 0`;
  let d = `M${f(P[0][0])} ${f(P[0][1])}`;
  for (let i = 1; i < P.length - 1; i++) d += `Q${f(P[i][0])} ${f(P[i][1])} ${f((P[i][0] + P[i + 1][0]) / 2)} ${f((P[i][1] + P[i + 1][1]) / 2)}`;
  const e = P[P.length - 1];
  return d + `L${f(e[0])} ${f(e[1])}`;
}

// ------------------------------------------------------------------ boxes and touches

const boxCache = new WeakMap();
/** The box of an item on the sheet: {x, y, w, h}. */
export function bounds(i) {
  let b = boxCache.get(i);
  if (b) return b;
  if (i.t === 'stroke') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k < i.p.length; k += 3) { const x = i.p[k], y = i.p[k + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const r = widthAt(i.tool, i.s, 1) / 2;
    b = { x: x0 - r, y: y0 - r, w: x1 - x0 + 2 * r, h: y1 - y0 + 2 * r };
  } else if (i.t === 'shape') {
    const x = Math.min(i.x, i.x + i.w), y = Math.min(i.y, i.y + i.h), pad = i.s / 2 + (i.k === 'arrow' ? i.s * 2.5 : 0);
    b = { x: x - pad, y: y - pad, w: Math.abs(i.w) + 2 * pad, h: Math.abs(i.h) + 2 * pad };
  } else b = { x: i.x, y: i.y, w: i.w, h: i.h };
  boxCache.set(i, b);
  return b;
}
export function union(list) {
  if (!list.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of list) { const b = bounds(i); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
export const overlaps = (a, b) => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;

export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
const polyDist = (x, y, P, closed) => { let d = Infinity; for (let k = 0; k < P.length - (closed ? 0 : 1); k++) { const a = P[k], b = P[(k + 1) % P.length]; d = Math.min(d, segDist(x, y, a[0], a[1], b[0], b[1])); } return d; };
const inside = (x, y, P) => { let c = false; for (let a = 0, b = P.length - 1; a < P.length; b = a++) if ((P[a][1] > y) !== (P[b][1] > y) && x < ((P[b][0] - P[a][0]) * (y - P[a][1])) / (P[b][1] - P[a][1]) + P[a][0]) c = !c; return c; };
export function shapePoints(i) {
  const { x, y, w, h } = i;
  if (i.k === 'diamond') return [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]];
  if (i.k === 'triangle') return [[x + w / 2, y], [x + w, y + h], [x, y + h]];
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

/** Does the point (x, y) touch the item, within tol units of the page? */
export function hits(i, x, y, tol) {
  const b = bounds(i);
  if (x < b.x - tol || x > b.x + b.w + tol || y < b.y - tol || y > b.y + b.h + tol) return false;
  if (i.t === 'stroke') {
    const p = i.p, half = (i.tool === 'marker' ? i.s : widthAt(i.tool, i.s, .7)) / 2 + tol;
    if (p.length === 3) return Math.hypot(x - p[0], y - p[1]) <= half;
    for (let k = 3; k < p.length; k += 3) if (segDist(x, y, p[k - 3], p[k - 2], p[k], p[k + 1]) <= half) return true;
    return false;
  }
  if (i.t === 'shape') {
    const half = i.s / 2 + tol;
    if (i.k === 'line' || i.k === 'arrow') return segDist(x, y, i.x, i.y, i.x + i.w, i.y + i.h) <= half;
    if (i.k === 'ellipse') {
      const rx = i.w / 2, ry = i.h / 2, cx = i.x + rx, cy = i.y + ry, nx = (x - cx) / (rx || 1), ny = (y - cy) / (ry || 1), r = Math.hypot(nx, ny);
      return (i.f && r <= 1) || Math.abs(r - 1) * Math.min(rx, ry) <= half;
    }
    const P = shapePoints(i);
    return (i.f && inside(x, y, P)) || polyDist(x, y, P, true) <= half;
  }
  return true; // pictures: their whole box
}

/** Does the circle (x, y, r) touch the item? (the eraser) */
export const touches = (i, x, y, r) => hits(i, x, y, r);

/**
 * The pieces of a stroke left by the eraser (a circle at x, y of radius r): null when it does not touch it. Precise: every
 * stretch between two points is cut exactly where it enters and leaves the circle (the pressure follows), so only the ink under
 * the eraser goes — not the whole stretch up to the next recorded point, which may be far when the line was drawn fast.
 */
export function cut(i, x, y, r) {
  const p = i.p, n = p.length / 3, runs = [];
  if (!n) return null;
  const rad = (pr) => r + (i.tool === 'marker' ? i.s / 2 : widthAt(i.tool, i.s, pr) / 2) * .35;
  const R = (v) => Math.round(v * 100) / 100;
  const at = (k, t) => [p[k] + (p[k + 3] - p[k]) * t, p[k + 1] + (p[k + 4] - p[k + 1]) * t, p[k + 2] + (p[k + 5] - p[k + 2]) * t];
  const inside = (q) => Math.hypot(q[0] - x, q[1] - y) <= rad(q[2]);
  let cur = [], changed = false;
  const add = (q) => { const l = cur.length; if (l && cur[l - 3] === R(q[0]) && cur[l - 2] === R(q[1])) return; cur.push(R(q[0]), R(q[1]), Math.round(q[2] * 1000) / 1000); };
  const end = () => { if (cur.length) runs.push(cur); cur = []; };
  if (n === 1) { const q = [p[0], p[1], p[2]]; return inside(q) ? [] : null; }
  if (!inside([p[0], p[1], p[2]])) add([p[0], p[1], p[2]]); else changed = true;
  for (let k = 0; k + 3 < p.length; k += 3) {
    // where the stretch crosses the circle: |A + t(B − A) − C| = radius, for t between 0 and 1
    const ax = p[k] - x, ay = p[k + 1] - y, dx = p[k + 3] - p[k], dy = p[k + 4] - p[k + 1], rr = rad((p[k + 2] + p[k + 5]) / 2);
    const a = dx * dx + dy * dy, b = 2 * (ax * dx + ay * dy), c = ax * ax + ay * ay - rr * rr, ts = [0];
    if (a > 0) { const d = b * b - 4 * a * c; if (d > 0) { const s = Math.sqrt(d); for (const t of [(-b - s) / (2 * a), (-b + s) / (2 * a)]) if (t > 0 && t < 1) ts.push(t); } }
    ts.push(1);
    for (let j = 0; j + 1 < ts.length; j++) {
      const mid = at(k, (ts[j] + ts[j + 1]) / 2);
      if (Math.hypot(mid[0] - x, mid[1] - y) <= rr) { changed = true; end(); continue; }
      add(at(k, ts[j])); add(at(k, ts[j + 1]));
    }
  }
  end();
  // a piece too short to be seen (a sliver at the edge of the eraser) goes too
  return changed ? runs.filter((q) => q.length >= 6 || i.p.length === 3) : null;
}

/** An item moved by (dx, dy). */
export function moved(i, dx, dy) {
  if (i.t === 'stroke') return { ...i, p: i.p.map((v, n) => (n % 3 === 0 ? r2(v + dx) : n % 3 === 1 ? r2(v + dy) : v)) };
  return { ...i, x: r2(i.x + dx), y: r2(i.y + dy) };
}

/** An item scaled around (ox, oy) by (sx, sy), as it was at the start of the drag. */
export function scaled(i, ox, oy, sx, sy) {
  const X = (v) => r2(ox + (v - ox) * sx), Y = (v) => r2(oy + (v - oy) * sy), k = Math.sqrt(Math.abs(sx * sy)) || 1;
  if (i.t === 'stroke') return { ...i, s: r2(Math.max(.5, i.s * k)), p: i.p.map((v, n) => (n % 3 === 0 ? X(v) : n % 3 === 1 ? Y(v) : v)) };
  if (i.t === 'shape' && (i.k === 'line' || i.k === 'arrow')) { const x2 = X(i.x + i.w), y2 = Y(i.y + i.h), x = X(i.x), y = Y(i.y); return { ...i, x, y, w: r2(x2 - x), h: r2(y2 - y) }; }
  const x = X(i.x), y = Y(i.y), x2 = X(i.x + i.w), y2 = Y(i.y + i.h);
  return { ...i, x: Math.min(x, x2), y: Math.min(y, y2), w: r2(Math.max(1, Math.abs(x2 - x))), h: r2(Math.max(1, Math.abs(y2 - y))) };
}
