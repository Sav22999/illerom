/**
 * The geometry and the look of a diagram: every node and connector as SVG markup (the same in the editor, the small
 * picture of the home, PNG, SVG and PDF), where the ends of a connector are, the route it takes (straight, elbow, curve),
 * its heads, and the hit tests of the editor. No DOM here except a canvas to measure text.
 */
import { FONTS, isDark } from './model.js';

export const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const R = (v) => Math.round(v * 100) / 100;
const DASHES = { dash: (s) => `${R(s * 4 + 2)} ${R(s * 3 + 2)}`, dot: (s) => `${R(Math.max(.6, s * .6))} ${R(s * 2 + 2)}` };

// ------------------------------------------------------------------ text

let ctx2d = null;
export const fontOf = (i, fs = i.fs) => `${i.i ? 'italic ' : ''}${i.b ? 700 : 400} ${fs}px ${FONTS[i.ff] || FONTS.sans}`;
export function measure(s, font) {
  ctx2d ||= document.createElement('canvas').getContext('2d');
  ctx2d.font = font;
  return ctx2d.measureText(s).width;
}
/** The lines of a text wrapped at a width (words first, then letters when one word alone is too long). */
export function wrap(s, font, width) {
  const out = [];
  for (const para of String(s || '').split('\n')) {
    if (width <= 0) { out.push(para); continue; }
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      if (!word) continue;
      const next = line + word;
      if (!line || measure(next.trimEnd(), font) <= width) { line = next; continue; }
      out.push(line.trimEnd());
      line = word.trimStart();
      while (line && measure(line, font) > width) { // a very long word: cut it
        let k = line.length;
        while (k > 1 && measure(line.slice(0, k), font) > width) k--;
        out.push(line.slice(0, k));
        line = line.slice(k);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

// ------------------------------------------------------------------ nodes

/** Where the text of a node goes (inside the shape, or under it for a person). */
export function textBox(n) {
  const { x, y, w, h } = n;
  switch (n.k) {
    case 'diamond': return { x: x + w * .18, y: y + h * .2, w: w * .64, h: h * .6 };
    case 'para': { const sk = Math.min(w * .2, h * .6); return { x: x + sk * .8, y, w: w - sk * 1.6, h }; }
    case 'cyl': { const ry = Math.min(h * .15, w * .25); return { x, y: y + ry * 2, w, h: h - ry * 2.6 }; }
    case 'doc': return { x, y, w, h: h * .86 };
    case 'note': return { x, y, w: w - Math.min(w, h) * .12, h };
    case 'ellipse': return { x: x + w * .12, y: y + h * .12, w: w * .76, h: h * .76 };
    case 'cloud': return { x: x + w * .16, y: y + h * .2, w: w * .68, h: h * .62 };
    case 'person': return { x: x - 50, y: y + h + 4, w: w + 100, h: 0, under: true };
    default: return { x, y, w, h };
  }
}
/** The text of a node, wrapped: [lines, line height, top]. */
export function textLines(n) {
  const b = textBox(n), font = fontOf(n), pad = n.k === 'text' ? 2 : 8, lh = n.fs * 1.25;
  const lines = n.text ? wrap(n.text, font, b.w - pad * 2) : [];
  const th = lines.length * lh;
  const top = b.under ? b.y : n.va === 'top' ? b.y + pad : n.va === 'bottom' ? b.y + b.h - pad - th : b.y + (b.h - th) / 2;
  return { lines, lh, top, box: b, pad, font };
}
function textSVG(n, lines, lh, top, b, pad) {
  if (!lines.length) return '';
  const al = n.k === 'person' ? 'center' : n.al, x = al === 'left' ? b.x + pad : al === 'right' ? b.x + b.w - pad : b.x + b.w / 2;
  const anchor = al === 'left' ? 'start' : al === 'right' ? 'end' : 'middle';
  const spans = lines.map((l, k) => `<tspan x="${R(x)}" y="${R(top + lh * k + n.fs * .92)}">${esc(l) || ' '}</tspan>`).join('');
  return `<text font-family="${esc(FONTS[n.ff] || FONTS.sans)}" font-size="${n.fs}" font-weight="${n.b ? 700 : 400}"${n.i ? ' font-style="italic"' : ''} fill="${n.tc}" text-anchor="${anchor}" xml:space="preserve">${spans}</text>`;
}

/** The outline of a shape, as SVG elements. paint: fill, stroke, width, dash attributes. */
export function shapeSVG(k, x, y, w, h, paint) {
  const P = (pts) => `<polygon points="${pts.map((p) => p.map(R).join(',')).join(' ')}" ${paint}/>`;
  switch (k) {
    case 'rect': return `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" ${paint}/>`;
    case 'round': { const r = Math.min(18, Math.min(w, h) * .25); return `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" rx="${R(r)}" ${paint}/>`; }
    case 'diamond': return P([[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]]);
    case 'ellipse': return `<ellipse cx="${R(x + w / 2)}" cy="${R(y + h / 2)}" rx="${R(w / 2)}" ry="${R(h / 2)}" ${paint}/>`;
    case 'para': { const sk = Math.min(w * .2, h * .6); return P([[x + sk, y], [x + w, y], [x + w - sk, y + h], [x, y + h]]); }
    case 'cyl': {
      const ry = Math.min(h * .15, w * .25), rx = w / 2;
      return `<path d="M${R(x)} ${R(y + ry)}V${R(y + h - ry)}A${R(rx)} ${R(ry)} 0 0 0 ${R(x + w)} ${R(y + h - ry)}V${R(y + ry)}A${R(rx)} ${R(ry)} 0 0 0 ${R(x)} ${R(y + ry)}Z" ${paint}/>`
        + `<ellipse cx="${R(x + rx)}" cy="${R(y + ry)}" rx="${R(rx)}" ry="${R(ry)}" ${paint}/>`;
    }
    case 'doc': { const v = h * .1; return `<path d="M${R(x)} ${R(y)}H${R(x + w)}V${R(y + h - v)}Q${R(x + w * .75)} ${R(y + h - v * 3)} ${R(x + w / 2)} ${R(y + h - v)}T${R(x)} ${R(y + h - v)}Z" ${paint}/>`; }
    case 'note': {
      const f = Math.min(w, h) * .2;
      return `<path d="M${R(x)} ${R(y)}H${R(x + w - f)}L${R(x + w)} ${R(y + f)}V${R(y + h)}H${R(x)}Z" ${paint}/><path d="M${R(x + w - f)} ${R(y)}V${R(y + f)}H${R(x + w)}" ${paint.replace(/fill="[^"]*"/, 'fill="#000" fill-opacity=".08"')}/>`;
    }
    case 'person': {
      const r = Math.min(w * .28, h * .15), cx = x + w / 2, neck = y + r * 2, hip = y + h * .62;
      const line = paint.replace(/fill="[^"]*"/, 'fill="none"');
      return `<circle cx="${R(cx)}" cy="${R(y + r)}" r="${R(r)}" ${paint}/><path d="M${R(cx)} ${R(neck)}V${R(hip)}M${R(x)} ${R(y + h * .38)}H${R(x + w)}M${R(cx)} ${R(hip)}L${R(x + w * .08)} ${R(y + h)}M${R(cx)} ${R(hip)}L${R(x + w * .92)} ${R(y + h)}" stroke-linecap="round" ${line}/>`;
    }
    case 'cloud': {
      const p = (u, v) => `${R(x + u * w)} ${R(y + v * h)}`;
      return `<path d="M${p(.25, .27)}C${p(.06, .26)} ${p(0, .52)} ${p(.15, .6)}C${p(0, .68)} ${p(.04, .92)} ${p(.3, .86)}C${p(.4, 1.02)} ${p(.68, 1.02)} ${p(.78, .86)}C${p(1, .88)} ${p(1.02, .6)} ${p(.88, .52)}C${p(1, .3)} ${p(.82, .08)} ${p(.66, .18)}C${p(.56, .02)} ${p(.3, .02)} ${p(.25, .27)}Z" ${paint}/>`;
    }
    default: return `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" ${paint}/>`;
  }
}
const paintOf = (n) => `fill="${n.f || 'none'}" stroke="${n.c && n.s ? n.c : 'none'}" stroke-width="${n.s || 0}"${n.d && n.s ? ` stroke-dasharray="${DASHES[n.d](n.s)}"` : ''} stroke-linejoin="round"`;
export function nodeSVG(n) {
  const t = textLines(n);
  return (n.k === 'text' ? '' : shapeSVG(n.k, n.x, n.y, n.w, n.h, paintOf(n))) + textSVG(n, t.lines, t.lh, t.top, t.box, t.pad);
}

// ------------------------------------------------------------------ the ends of a connector

const DIR = { t: [0, -1], r: [1, 0], b: [0, 1], l: [-1, 0] };
export const sidePoint = (n, p) => (p === 't' ? [n.x + n.w / 2, n.y] : p === 'r' ? [n.x + n.w, n.y + n.h / 2] : p === 'b' ? [n.x + n.w / 2, n.y + n.h] : [n.x, n.y + n.h / 2]);
const center = (n) => [n.x + n.w / 2, n.y + n.h / 2];
/** Where the line from the centre of a node toward (px, py) leaves its outline. */
export function boundary(n, px, py) {
  const [cx, cy] = center(n), dx = px - cx, dy = py - cy, a = n.w / 2, b = n.h / 2;
  if (!dx && !dy) return [cx, cy];
  let k;
  if (n.k === 'ellipse' || n.k === 'cloud') k = 1 / Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b));
  else if (n.k === 'diamond') k = 1 / (Math.abs(dx) / a + Math.abs(dy) / b);
  else k = Math.min(dx ? a / Math.abs(dx) : Infinity, dy ? b / Math.abs(dy) : Infinity);
  return [cx + dx * k, cy + dy * k];
}
/** The side of a node that faces a point. */
export function facing(n, px, py) {
  const [cx, cy] = center(n), dx = (px - cx) / Math.max(1, n.w), dy = (py - cy) / Math.max(1, n.h);
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'r' : 'l') : dy >= 0 ? 'b' : 't';
}
const endRef = (e, get) => (e?.n ? get(e.n) : null);
const endCenter = (e, get) => { const n = endRef(e, get); return n ? center(n) : [e.x, e.y]; };

/**
 * The route of a connector: {pts, d, curve, tip: [[x,y],[ux,uy]] at both ends (u points into the end), mid (the place of the
 * label)}; null when one of its nodes is gone.
 */
export function route(e, get) {
  const na = endRef(e.a, get), nb = endRef(e.b, get);
  if ((e.a?.n && !na) || (e.b?.n && !nb)) return null;
  const ca = endCenter(e.a, get), cb = endCenter(e.b, get);
  let sa = na ? e.a.p || '' : '', sb = nb ? e.b.p || '' : '';
  let pa, pb;
  if (e.r === 'straight') {
    pa = na ? (sa ? sidePoint(na, sa) : boundary(na, ...(nb && sb ? sidePoint(nb, sb) : cb))) : ca;
    pb = nb ? (sb ? sidePoint(nb, sb) : boundary(nb, ...(na && sa ? sidePoint(na, sa) : ca))) : cb;
    return finish(e, [pa, pb], false);
  }
  // elbow and curve leave a node from the middle of a side
  if (na && !sa) sa = nb && sb ? facing(na, ...sidePoint(nb, sb)) : facing(na, ...cb);
  if (nb && !sb) sb = facing(nb, ...(na ? sidePoint(na, sa) : ca));
  pa = na ? sidePoint(na, sa) : ca;
  pb = nb ? sidePoint(nb, sb) : cb;
  // a free end goes the way of the other end
  const da = sa ? DIR[sa] : axis(pb[0] - pa[0], pb[1] - pa[1]), db = sb ? DIR[sb] : axis(pa[0] - pb[0], pa[1] - pb[1]);
  if (e.r === 'curve') {
    const dist = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), k = Math.max(30, Math.min(220, dist * .45));
    return finish(e, [pa, [pa[0] + da[0] * k, pa[1] + da[1] * k], [pb[0] + db[0] * k, pb[1] + db[1] * k], pb], true);
  }
  return finish(e, elbow(pa, da, pb, db), false);
}
const axis = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1]);
/** An orthogonal path from a (leaving along da) to b (arriving against db), with few bends. */
function elbow(a, da, b, db) {
  const G = 22, h1 = da[0] !== 0, h2 = db[0] !== 0;
  const a1 = [a[0] + da[0] * G, a[1] + da[1] * G], b1 = [b[0] + db[0] * G, b[1] + db[1] * G];
  let mid;
  if (h1 && h2) {
    const mx = (a[0] + b[0]) / 2;
    if ((mx - a[0]) * da[0] >= G * .5 && (mx - b[0]) * db[0] >= G * .5) mid = [[mx, a[1]], [mx, b[1]]];
    else if (da[0] === -db[0] || (a1[0] - b1[0]) * da[0] < 0) { const my = (a[1] + b[1]) / 2; mid = [a1, [a1[0], my], [b1[0], my], b1]; }
    else { const x = da[0] > 0 ? Math.max(a1[0], b1[0]) : Math.min(a1[0], b1[0]); mid = [[x, a[1]], [x, b[1]]]; }
  } else if (!h1 && !h2) {
    const my = (a[1] + b[1]) / 2;
    if ((my - a[1]) * da[1] >= G * .5 && (my - b[1]) * db[1] >= G * .5) mid = [[a[0], my], [b[0], my]];
    else if (da[1] === -db[1] || (a1[1] - b1[1]) * da[1] < 0) { const mx = (a[0] + b[0]) / 2; mid = [a1, [mx, a1[1]], [mx, b1[1]], b1]; }
    else { const y = da[1] > 0 ? Math.max(a1[1], b1[1]) : Math.min(a1[1], b1[1]); mid = [[a[0], y], [b[0], y]]; }
  } else if (h1) {
    const c = [b[0], a[1]];
    mid = (c[0] - a[0]) * da[0] > 0 && (c[1] - b[1]) * db[1] > 0 ? [c] : [a1, [a1[0], b1[1]], b1];
  } else {
    const c = [a[0], b[1]];
    mid = (c[1] - a[1]) * da[1] > 0 && (c[0] - b[0]) * db[0] > 0 ? [c] : [a1, [b1[0], a1[1]], b1];
  }
  // without repeated or straight-through points
  const pts = [a, ...mid, b], out = [pts[0]];
  for (let k = 1; k < pts.length; k++) {
    const p = pts[k], q = out[out.length - 1];
    if (Math.abs(p[0] - q[0]) < .01 && Math.abs(p[1] - q[1]) < .01) continue;
    if (out.length >= 2) { const o = out[out.length - 2]; if ((Math.abs(o[0] - q[0]) < .01 && Math.abs(q[0] - p[0]) < .01) || (Math.abs(o[1] - q[1]) < .01 && Math.abs(q[1] - p[1]) < .01)) out.pop(); }
    out.push(p);
  }
  return out;
}
const unit = (dx, dy) => { const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
function finish(e, pts, curve) {
  const n = pts.length, A = pts[0], B = pts[n - 1];
  // the direction into each end: from the point before it (a curve whose handle sits on its end looks at the other end)
  const near = (k, step) => { for (let j = k + step; j >= 0 && j < n; j += step) if (Math.hypot(pts[j][0] - pts[k][0], pts[j][1] - pts[k][1]) > .5) return pts[j]; return pts[k]; };
  const ua = unit(A[0] - near(0, 1)[0], A[1] - near(0, 1)[1]), ub = unit(B[0] - near(n - 1, -1)[0], B[1] - near(n - 1, -1)[1]);
  // the line stops where a filled head starts
  const cut = (kind) => (['arrow', 'diamond', 'circle'].includes(kind) ? headLen(e) * (kind === 'arrow' ? .85 : 1) : kind === 'open' ? e.s * .5 : 0);
  const draw = pts.map((p) => p.slice());
  const ka = cut(e.sa), kb = cut(e.ea);
  draw[0] = [A[0] - ua[0] * ka, A[1] - ua[1] * ka];
  draw[n - 1] = [B[0] - ub[0] * kb, B[1] - ub[1] * kb];
  let d, mid;
  if (curve) {
    d = `M${draw[0].map(R).join(' ')}C${draw[1].map(R).join(' ')} ${draw[2].map(R).join(' ')} ${draw[3].map(R).join(' ')}`;
    mid = bez(pts, .5);
  } else {
    d = 'M' + draw.map((p) => p.map(R).join(' ')).join('L');
    mid = along(pts, .5);
  }
  return { pts, d, curve, tipA: [A, ua], tipB: [B, ub], mid };
}
const bez = (p, t) => { const u = 1 - t; return [0, 1].map((k) => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]); };
/** The point at a fraction of the length of a polyline. */
function along(pts, f) {
  let total = 0;
  for (let k = 1; k < pts.length; k++) total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  let left = total * f;
  for (let k = 1; k < pts.length; k++) {
    const l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    if (left <= l && l > 0) return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * (left / l), pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * (left / l)];
    left -= l;
  }
  return pts[pts.length - 1];
}
export const sample = (g) => (g.curve ? Array.from({ length: 25 }, (_, k) => bez(g.pts, k / 24)) : g.pts);

const headLen = (e) => 6 + e.s * 3.2;
function headSVG(kind, [tip, u], e) {
  if (kind === 'none') return '';
  const L = headLen(e), n = [-u[1], u[0]], P = (a, b) => [tip[0] - u[0] * a + n[0] * b, tip[1] - u[1] * a + n[1] * b], pts = (l) => l.map((p) => p.map(R).join(',')).join(' ');
  const fill = `fill="${e.c}"`, line = `fill="none" stroke="${e.c}" stroke-width="${e.s}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (kind) {
    case 'arrow': return `<polygon points="${pts([tip, P(L, L * .42), P(L, -L * .42)])}" ${fill} stroke="${e.c}" stroke-width="${Math.min(e.s, 1.5)}" stroke-linejoin="round"/>`;
    case 'open': return `<polyline points="${pts([P(L, L * .5), tip, P(L, -L * .5)])}" ${line}/>`;
    case 'diamond': return `<polygon points="${pts([tip, P(L / 2, L * .36), P(L, 0), P(L / 2, -L * .36)])}" ${fill}/>`;
    case 'circle': { const c = P(L / 2, 0); return `<circle cx="${R(c[0])}" cy="${R(c[1])}" r="${R(L * .42)}" ${fill}/>`; }
    case 'bar': return `<polyline points="${pts([P(e.s, L * .5), P(e.s, -L * .5)])}" ${line}/>`;
  }
  return '';
}
/** A connector: its line, its heads and its label on a patch of the background. */
export function edgeSVG(e, get, bg = '#ffffff') {
  const g = route(e, get);
  if (!g) return '';
  let out = `<path d="${g.d}" fill="none" stroke="${e.c}" stroke-width="${e.s}"${e.d ? ` stroke-dasharray="${DASHES[e.d](e.s)}"` : ''} stroke-linecap="round" stroke-linejoin="round"/>` + headSVG(e.sa, g.tipA, e) + headSVG(e.ea, g.tipB, e);
  if (e.text) {
    const font = fontOf({ ...e, ff: 'sans' }), lines = wrap(e.text, font, 220), lh = e.fs * 1.25, w = Math.max(...lines.map((l) => measure(l, font))) + 10, h = lines.length * lh + 4;
    const [mx, my] = g.mid;
    out += `<rect x="${R(mx - w / 2)}" y="${R(my - h / 2)}" width="${R(w)}" height="${R(h)}" rx="4" fill="${bg}"/>`;
    out += `<text font-family="${esc(FONTS.sans)}" font-size="${e.fs}" fill="${e.tc}" text-anchor="middle" xml:space="preserve">${lines.map((l, k) => `<tspan x="${R(mx)}" y="${R(my - h / 2 + 2 + lh * k + e.fs * .92)}">${esc(l) || ' '}</tspan>`).join('')}</text>`;
  }
  return out;
}
export const itemSVG = (i, get, bg) => (i.t === 'node' ? nodeSVG(i) : edgeSVG(i, get, bg));

// ------------------------------------------------------------------ boxes and hit tests

/** The box of an item on the diagram {x, y, w, h}, or null. */
export function bounds(i, get) {
  if (i.t === 'node') {
    if (i.k === 'person' && i.text) { const t = textLines(i), th = t.lines.length * t.lh; const tw = Math.max(i.w, ...t.lines.map((l) => measure(l, t.font) + 4)); return { x: Math.min(i.x, i.x + i.w / 2 - tw / 2), y: i.y, w: Math.max(i.w, tw), h: i.h + 4 + th }; }
    return { x: i.x, y: i.y, w: i.w, h: i.h };
  }
  const g = route(i, get);
  if (!g) return null;
  const pts = sample(g), xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
export function union(list, get) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const i of list) { const q = bounds(i, get); if (!q) continue; a = Math.min(a, q.x); b = Math.min(b, q.y); c = Math.max(c, q.x + q.w); d = Math.max(d, q.y + q.h); }
  return a === Infinity ? null : { x: a, y: b, w: c - a, h: d - b };
}
const segDist = (px, py, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l)) : 0; return Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t); };
/** Whether (x, y) touches the item, with a tolerance in units of the diagram. */
export function hits(i, x, y, tol, get) {
  if (i.t === 'node') { const b = bounds(i, get); return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol; }
  const g = route(i, get);
  if (!g) return false;
  const pts = sample(g);
  for (let k = 1; k < pts.length; k++) if (segDist(x, y, pts[k - 1], pts[k]) <= tol + i.s / 2) return true;
  if (i.text) { const [mx, my] = g.mid; if (Math.abs(x - mx) < 40 && Math.abs(y - my) < i.fs) return true; }
  return false;
}
export const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ------------------------------------------------------------------ the whole diagram

/** The background grid as an SVG pattern (id given), with a dot at every crossing. */
export function gridPattern(id, gs, bg, z = 1) {
  const c = isDark(bg) ? '#3a4150' : '#cfd5df', s = gs * z;
  if (s < 6) return '';
  return `<pattern id="${id}" width="${R(s)}" height="${R(s)}" patternUnits="userSpaceOnUse"><circle cx="${R(s / 2)}" cy="${R(s / 2)}" r="${s > 14 ? 1.1 : .8}" fill="${c}"/></pattern>`;
}

/** The diagram as a standalone SVG document, as big as what is drawn (pad around), fonts embedded when given. */
export function diagramSVG(items, settings, { pad = 32, box, fonts = '', grid = false } = {}) {
  const map = new Map(items.filter((i) => i.t === 'node').map((i) => [i.id, i])), get = (id) => map.get(id);
  const b = box || union(items, get) || { x: 0, y: 0, w: 400, h: 240 };
  const x = b.x - pad, y = b.y - pad, w = Math.ceil(b.w + pad * 2), h = Math.ceil(b.h + pad * 2);
  const style = fonts ? `<style>${fonts}</style>` : '';
  const gp = grid && settings.grid ? gridPattern('g', settings.gs, settings.bg) : '';
  const body = items.map((i) => itemSVG(i, get, settings.bg)).join('');
  return `<svg xmlns="${NS}" width="${w}" height="${h}" viewBox="${R(x)} ${R(y)} ${w} ${h}">${style}${gp ? `<defs>${gp}</defs>` : ''}<rect x="${R(x)}" y="${R(y)}" width="${w}" height="${h}" fill="${settings.bg}"/>${gp ? `<rect x="${R(x)}" y="${R(y)}" width="${w}" height="${h}" fill="url(#g)"/>` : ''}${body}</svg>`;
}
