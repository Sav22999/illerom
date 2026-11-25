/**
 * Objects of a document: charts, diagrams, shapes, lines, icons, QR codes, signatures. They are kept as data (data-o of a
 * figure) and drawn as SVG, so screen, print and files show the same thing. Same limits as lib/clean.php.
 */
import { shapePath, toSvgPath, SHAPES, lineHeads } from './shapes.js';
import { ICON_PATHS } from './icons-lib.js';
import { qr, QR_MAX } from './qr.js';

export { SHAPES };
export const ICON_NAMES = Object.keys(ICON_PATHS);
export const CHARTS = ['bar', 'stack', 'hbar', 'line', 'area', 'pie', 'donut', 'radar', 'scatter'];
export const CHART_ICONS = { bar: 'chart-column', stack: 'chart-column-stacked', hbar: 'chart-bar', line: 'chart-line', area: 'chart-area', pie: 'chart-pie', donut: 'circle-dot', radar: 'radar', scatter: 'chart-scatter' };
export const FLOWS = ['process', 'cycle', 'pyramid', 'timeline', 'steps', 'list'];
export const FLOW_ICONS = { process: 'arrow-right', cycle: 'refresh-cw', pyramid: 'triangle', timeline: 'milestone', steps: 'chart-no-axes-column-increasing', list: 'rows-3' };
export const RULES = ['', 'thick', 'dash', 'dots', 'dbl', 'short', 'orn'];
const SHAPE_SET = new Set([...SHAPES, 'line']);

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const str = (v, n) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/[\u0000-\u001f]/g, ' ').slice(0, n) : '');
const col = (v) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v.toLowerCase() : '');
const num = (v, a, b, d) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(Math.max(a, Math.min(b, n)) * 1000) / 1000 : d; };
const one = (v, list, d) => (list.includes(v) ? v : d);

/** Only known fields, within limits; null when it is not an object of a document. */
export function cleanObject(o) {
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch { return null; } }
  if (!o || typeof o !== 'object') return null;
  const r = num(o.r, 0.02, 3, 0.56);
  switch (o.k) {
    case 'chart': return { k: 'chart', t: one(o.t, CHARTS, 'bar'), l: (Array.isArray(o.l) ? o.l : []).slice(0, 40).map((x) => str(x, 60)), s: (Array.isArray(o.s) ? o.s : []).slice(0, 8).map((x) => ({ n: str(x?.n, 60), v: (Array.isArray(x?.v) ? x.v : []).slice(0, 40).map((y) => num(y, -1e12, 1e12, 0)) })), g: o.g === 0 ? 0 : 1, v: o.v === 1 ? 1 : 0, x: str(o.x, 120), c: col(o.c), r };
    case 'flow': return { k: 'flow', t: one(o.t, FLOWS, 'process'), i: (Array.isArray(o.i) ? o.i : []).slice(0, 10).map((x) => str(x, 120)), c: col(o.c), r };
    case 'shape': return { k: 'shape', s: SHAPE_SET.has(o.s) ? o.s : 'rect', f: o.f === 'none' ? 'none' : col(o.f), b: col(o.b), w: num(o.w, 0, 20, 0), d: o.d === 1 ? 1 : 0, x: str(o.x, 300), tc: col(o.tc), ts: num(o.ts, 6, 90, 14), h: one(o.h, ['', 'end', 'both'], ''), r };
    case 'icon': return { k: 'icon', n: ICON_PATHS[o.n] ? o.n : 'star', c: col(o.c), w: num(o.w, 0.5, 4, 2) };
    case 'qr': return { k: 'qr', x: str(o.x, QR_MAX), c: col(o.c) };
    case 'sign': return { k: 'sign', x: str(o.x, 120), d: str(o.d, 120) };
    default: return null;
  }
}

/** An object as new. */
export function newObject(kind, sub, L) {
  if (kind === 'chart') return cleanObject({ k: 'chart', t: sub, l: ['A', 'B', 'C', 'D'].map((x, i) => `${L.quarter}${i + 1}`), s: [{ n: L.series + ' A', v: [24, 38, 31, 52] }, ...(['pie', 'donut'].includes(sub) ? [] : [{ n: L.series + ' B', v: [18, 26, 40, 44] }])], r: ['pie', 'donut', 'radar'].includes(sub) ? 0.5 : 0.52 });
  if (kind === 'flow') return cleanObject({ k: 'flow', t: sub, i: [1, 2, 3, 4].map((n) => `${L.step} ${n}`), r: { process: 0.2, cycle: 0.62, pyramid: 0.55, timeline: 0.26, steps: 0.4, list: 0.42 }[sub] });
  if (kind === 'shape') return cleanObject({ k: 'shape', s: sub.replace(/-.*/, ''), h: sub === 'line-end' ? 'end' : sub === 'line-both' ? 'both' : '', w: sub.startsWith('line') ? 2 : 0, r: sub.startsWith('line') ? 0.06 : /^(rect|round|arrow|arrow2|chevron|homeplate|speech|parallelogram|cloud|wave|trapezoid|half)$/.test(sub) ? 0.5 : 1 });
  if (kind === 'icon') return cleanObject({ k: 'icon', n: sub });
  if (kind === 'qr') return cleanObject({ k: 'qr', x: sub || 'https://www.illerom.eu' });
  return cleanObject({ k: 'sign', x: L.signature });
}
export const objectWidth = (o) => (o.k === 'icon' ? 12 : o.k === 'qr' ? 22 : o.k === 'sign' ? 40 : o.k === 'shape' ? (o.s === 'line' ? 60 : o.r > 0.8 ? 25 : 40) : o.k === 'chart' && ['pie', 'donut', 'radar'].includes(o.t) ? 80 : 100);

// ------------------------------------------------------------------ colours and text

const hx = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
export const mix = (a, b, k) => '#' + hx(a).map((v, i) => Math.round(v * (1 - k) + hx(b)[i] * k).toString(16).padStart(2, '0')).join('');
const dark = (c) => { const [r, g, b] = hx(c); return r * 0.299 + g * 0.587 + b * 0.114 < 150; };
const on = (c) => (dark(c) ? '#ffffff' : '#1c1c1c');
export function palette(a, n) {
  const base = [a, '#d85a30', '#e0a526', '#3b7dbf', '#8a5fc7', '#5a8f7b', '#c2527f', '#6b7680'].filter((c, i) => !i || c !== a), out = [];
  for (let i = 0; i < n; i++) out.push(i < base.length ? base[i] : mix(base[i % base.length], '#ffffff', 0.4));
  return out;
}
let ctx2d = null;
const width = (t, size, font, bold) => { ctx2d ||= document.createElement('canvas').getContext('2d'); ctx2d.font = `${bold ? 700 : 400} ${size}px ${font}`; return ctx2d.measureText(t).width; };
/** Lines of a text in a box, with an ellipsis when it does not fit. */
function wrap(t, w, size, font, max = 6, bold) {
  const out = [];
  for (const par of String(t).split('\n')) {
    let line = '';
    for (const word of par.split(/\s+/)) { const next = line ? line + ' ' + word : word; if (line && width(next, size, font, bold) > w) { out.push(line); line = word; } else line = next; }
    out.push(line);
  }
  if (out.length > max) { out.length = max; out[max - 1] = out[max - 1].replace(/.?$/, '…'); }
  return out;
}
const text = (x, y, t, size, fill, o = {}) => `<text x="${f(x)}" y="${f(y)}" font-size="${f(size)}" fill="${fill}"${o.a ? ` text-anchor="${o.a}"` : ''}${o.b ? ' font-weight="700"' : ''}>${esc(t)}</text>`;
const para = (x, y, lines, size, fill, o = {}) => { const lh = size * 1.25, top = y - ((lines.length - 1) * lh) / 2 + size * 0.35; return lines.map((l, i) => text(x, top + i * lh, l, size, fill, { a: 'middle', ...o })).join(''); };
const f = (n) => Math.round(n * 100) / 100;
const pathEl = (cmds, fill, more = '') => `<path d="${toSvgPath(cmds)}" fill="${fill}"${more}/>`;
const fmt = (v) => (Math.abs(v) >= 1e6 ? +(v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e4 ? +(v / 1e3).toFixed(1) + 'k' : String(+v.toFixed(2)));

// ------------------------------------------------------------------ drawing

const W = 640;
/** The SVG of an object. c = {accent, ink, font}. */
export function drawObject(o, c) {
  const A = o.c || c.accent, H = o.k === 'icon' || o.k === 'qr' ? W : o.k === 'sign' ? W * 0.22 : W * (o.r || 0.5);
  const body = ({ chart, flow, shape, icon, qr: code, sign })[o.k](o, H, A, c);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${f(H)}" width="${W}" height="${f(H)}" font-family="${esc(c.font)}" role="img" aria-label="${esc(label(o))}">${body}</svg>`;
}
export const label = (o) => (o.k === 'chart' ? [o.x, ...o.s.map((s) => `${s.n}: ${s.v.map((v, i) => `${o.l[i] || i + 1} ${v}`).join(', ')}`)].filter(Boolean).join('. ') : o.k === 'flow' ? o.i.join(', ') : o.x || o.n || o.s || '').slice(0, 400);

function chart(o, H, A, c) {
  const s = 13, ink = c.ink, muted = mix(ink, '#ffffff', 0.4), grid = mix(ink, '#ffffff', 0.86), font = c.font;
  const series = o.s.filter((x) => x.v.length), round = o.t === 'pie' || o.t === 'donut';
  let out = '', top = 0;
  if (o.x) { out += text(W / 2, 17, o.x, 16, ink, { a: 'middle', b: 1 }); top = 30; }
  if (!series.length) return out;
  const cols = palette(A, round ? Math.max(o.l.length, series[0].v.length) : series.length), names = round ? o.l.map((l, i) => [l, cols[i]]) : series.map((x, i) => [x.n, cols[i]]);
  const legend = o.g && names.some((n) => n[0]) && (round || series.length > 1 || series[0].n);
  if (legend && !round) {
    let x = 0;
    for (const [n, k] of names) { const w = width(n, s, font) + 34; if (x + w > W && x) { x = 0; top += 20; } out += `<rect x="${f(x)}" y="${top + 2}" width="11" height="11" rx="3" fill="${k}"/>` + text(x + 17, top + 12, n, s, ink); x += w; }
    top += 26;
  }
  if (round) {
    const vals = series[0].v.map((v) => Math.max(0, v)), tot = vals.reduce((a, b) => a + b, 0) || 1, R = Math.max(20, Math.min((W - (legend ? 220 : 0)) / 2, (H - top) / 2) - 4), cx = legend ? R + 8 : W / 2, cy = top + (H - top) / 2, ir = o.t === 'donut' ? R * 0.58 : 0;
    let a = -Math.PI / 2;
    vals.forEach((v, i) => {
      if (!v) return;
      const b = a + (v / tot) * Math.PI * 2 * (v === tot ? 0.9999 : 1), L = b - a > Math.PI ? 1 : 0, P = (r, t) => `${f(cx + r * Math.cos(t))} ${f(cy + r * Math.sin(t))}`;
      out += `<path d="${ir ? `M${P(R, a)}A${f(R)} ${f(R)} 0 ${L} 1 ${P(R, b)}L${P(ir, b)}A${f(ir)} ${f(ir)} 0 ${L} 0 ${P(ir, a)}Z` : `M${f(cx)} ${f(cy)}L${P(R, a)}A${f(R)} ${f(R)} 0 ${L} 1 ${P(R, b)}Z`}" fill="${cols[i]}" stroke="#fff" stroke-width="2"/>`;
      if (v / tot > 0.045) { const m = (a + b) / 2, rr = ir ? (R + ir) / 2 : R * 0.68; out += text(cx + rr * Math.cos(m), cy + rr * Math.sin(m) + 5, o.v ? fmt(v) : Math.round((v / tot) * 100) + '%', s, on(cols[i]), { a: 'middle', b: 1 }); }
      a = b;
    });
    if (legend) names.slice(0, 16).forEach(([n, k], i) => { const y = cy - (Math.min(16, names.length) * 22) / 2 + i * 22; out += `<rect x="${f(cx + R + 26)}" y="${f(y + 3)}" width="11" height="11" rx="3" fill="${k}"/>` + text(cx + R + 44, y + 13, wrap(n, W - cx - R - 50, s, font, 1)[0], s, ink); });
    return out;
  }
  const all = series.flatMap((x) => x.v), n = Math.max(o.l.length, ...series.map((x) => x.v.length), 1);
  const sum = (i, sign) => series.reduce((t, x) => t + (sign * (x.v[i] || 0) > 0 ? x.v[i] || 0 : 0), 0);
  let hi = Math.max(0, ...(o.t === 'stack' ? Array.from({ length: n }, (_, i) => sum(i, 1)) : all)), lo = Math.min(0, ...(o.t === 'stack' ? Array.from({ length: n }, (_, i) => sum(i, -1)) : all));
  if (o.t === 'scatter') { hi = Math.max(0, ...series.slice(1).flatMap((x) => x.v), series.length < 2 ? Math.max(...all) : 0); lo = Math.min(0, ...series.slice(1).flatMap((x) => x.v)); }
  const span = hi - lo || 1, p = 10 ** Math.floor(Math.log10(span / 4)), step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= span / 4) || 1;
  const y1 = Math.ceil(hi / step - 1e-9) * step || (lo < 0 ? 0 : step), y0 = Math.floor(lo / step + 1e-9) * step, tk = [];
  for (let v = y0; v <= y1 + step / 2 && tk.length < 12; v += step) tk.push(Math.round(v * 1e6) / 1e6);
  if (o.t === 'radar') {
    const m = Math.max(3, n), R = Math.max(20, Math.min(W / 2 - 90, (H - top) / 2 - 26)), cx = W / 2, cy = top + (H - top) / 2, P = (i, k) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / m; return [cx + R * k * Math.cos(a), cy + R * k * Math.sin(a)]; };
    const ring = (k) => Array.from({ length: m }, (_, i) => P(i, k).map(f).join(',')).join(' ');
    for (const k of [0.25, 0.5, 0.75, 1]) out += `<polygon points="${ring(k)}" fill="none" stroke="${grid}"/>`;
    for (let i = 0; i < m; i++) { const [x, y] = P(i, 1), [lx, ly] = P(i, 1.12); out += `<line x1="${f(cx)}" y1="${f(cy)}" x2="${f(x)}" y2="${f(y)}" stroke="${grid}"/>` + text(lx, ly + 4, o.l[i] || '', s, muted, { a: Math.abs(lx - cx) < 8 ? 'middle' : lx < cx ? 'end' : 'start' }); }
    series.forEach((x, k) => { out += `<polygon points="${Array.from({ length: m }, (_, i) => P(i, Math.max(0, x.v[i] || 0) / (y1 || 1)).map(f).join(',')).join(' ')}" fill="${cols[k]}" fill-opacity=".18" stroke="${cols[k]}" stroke-width="2.5" stroke-linejoin="round"/>`; });
    return out;
  }
  if (o.t === 'hbar') {
    const lw = Math.min(W * 0.35, Math.max(...o.l.map((l) => width(l, s, font)), 10) + 12), X = (v) => lw + ((v - y0) / (y1 - y0)) * (W - lw - 24), bh = (H - top - 24) / n;
    for (const v of tk) out += `<line x1="${f(X(v))}" y1="${top}" x2="${f(X(v))}" y2="${f(H - 22)}" stroke="${v === 0 ? muted : grid}"/>` + text(X(v), H - 5, fmt(v), s - 1, muted, { a: 'middle' });
    for (let i = 0; i < n; i++) {
      out += text(lw - 8, top + bh * (i + 0.5) + 4, wrap(o.l[i] || '', lw - 8, s, font, 1)[0], s, ink, { a: 'end' });
      const t = (bh * 0.7) / series.length;
      series.forEach((x, k) => { const v = x.v[i] || 0, a = X(Math.min(0, v)), b = X(Math.max(0, v)), y = top + bh * (i + 0.15) + k * t; out += `<rect x="${f(a)}" y="${f(y)}" width="${f(Math.max(1, b - a))}" height="${f(Math.max(1, t - 2))}" rx="3" fill="${cols[k]}"/>`; if (o.v) out += text(b + 5, y + t / 2 + 4, fmt(v), s - 1, ink); });
    }
    return out;
  }
  const lw = Math.max(...tk.map((v) => width(fmt(v), s - 1, font))) + 10, bottom = H - 24, Y = (v) => bottom - ((v - y0) / (y1 - y0)) * (bottom - top - 8), cw = (W - lw) / n;
  for (const v of tk) out += `<line x1="${f(lw)}" y1="${f(Y(v))}" x2="${W}" y2="${f(Y(v))}" stroke="${v === 0 ? muted : grid}"/>` + text(lw - 7, Y(v) + 4, fmt(v), s - 1, muted, { a: 'end' });
  if (o.t === 'scatter') {
    const xs = series[0].v, x0 = Math.min(0, ...xs), x1 = Math.max(...xs, 1), X = (v) => lw + 8 + ((v - x0) / (x1 - x0 || 1)) * (W - lw - 20), rest = series.length > 1 ? series.slice(1) : series;
    for (let i = 0; i <= 4; i++) { const v = x0 + ((x1 - x0) * i) / 4; out += text(X(v), H - 5, fmt(v), s - 1, muted, { a: 'middle' }); }
    rest.forEach((q, k) => q.v.forEach((v, i) => { out += `<circle cx="${f(X(series.length > 1 ? xs[i] || 0 : i))}" cy="${f(Y(v))}" r="5.5" fill="${cols[series.length > 1 ? k + 1 : 0]}" fill-opacity=".8"/>`; }));
    return out;
  }
  const every = Math.max(1, Math.ceil(Math.max(...o.l.map((l) => width(l, s, font)), 1) / Math.max(cw - 4, 12) / 1.6));
  for (let i = 0; i < n; i++) if (i % every === 0) out += text(lw + cw * (i + 0.5), H - 5, wrap(o.l[i] || '', Math.max(cw * every, 30), s, font, 1)[0], s, muted, { a: 'middle' });
  if (o.t === 'line' || o.t === 'area') {
    series.forEach((x, k) => {
      const pts = x.v.map((v, i) => [lw + cw * (i + 0.5), Y(v)]);
      if (o.t === 'area' && pts.length) out += `<path d="M${f(pts[0][0])} ${f(Y(0))}${pts.map((q) => `L${f(q[0])} ${f(q[1])}`).join('')}L${f(pts.at(-1)[0])} ${f(Y(0))}Z" fill="${cols[k]}" fill-opacity=".22"/>`;
      out += `<polyline points="${pts.map((q) => q.map(f).join(',')).join(' ')}" fill="none" stroke="${cols[k]}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
      pts.forEach((q, i) => { out += `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="4" fill="#fff" stroke="${cols[k]}" stroke-width="2.5"/>`; if (o.v) out += text(q[0], q[1] - 9, fmt(x.v[i]), s - 1, ink, { a: 'middle' }); });
    });
    return out;
  }
  for (let i = 0; i < n; i++) {
    const x0b = lw + cw * (i + 0.14), bw = cw * 0.72;
    if (o.t === 'stack') { let up = 0, dn = 0; series.forEach((x, k) => { const v = x.v[i] || 0, a = v < 0 ? dn : up, b = a + v; if (v < 0) dn = b; else up = b; out += `<rect x="${f(x0b)}" y="${f(Y(Math.max(a, b)))}" width="${f(bw)}" height="${f(Math.abs(Y(a) - Y(b)))}" fill="${cols[k]}"/>`; if (o.v && Math.abs(Y(a) - Y(b)) > 14) out += text(x0b + bw / 2, (Y(a) + Y(b)) / 2 + 4, fmt(v), s - 1, on(cols[k]), { a: 'middle' }); }); } else { const t = bw / series.length; series.forEach((x, k) => { const v = x.v[i] || 0, y = Y(Math.max(0, v)), hh = Math.abs(Y(0) - Y(v)); out += `<rect x="${f(x0b + k * t)}" y="${f(y)}" width="${f(Math.max(1, t - 2))}" height="${f(Math.max(0.5, hh))}" rx="${Math.min(4, t / 4, hh / 2).toFixed(1)}" fill="${cols[k]}"/>`; if (o.v) out += text(x0b + (k + 0.5) * t, v < 0 ? y + hh + 14 : y - 5, fmt(v), s - 1, ink, { a: 'middle' }); }); }
  }
  return out;
}

function flow(o, H, A, c) {
  const it = o.i.length ? o.i : [''], n = it.length, cols = palette(A, n), font = c.font;
  let out = '';
  if (o.t === 'process') { const g = 4, w = (W - g * (n - 1)) / n; it.forEach((x, i) => { const cmds = shapePath(i ? 'chevron' : 'homeplate', w + (i ? 12 : 8), H).map(([k, ...v]) => [k, ...v.map((q, j) => q + (j % 2 ? 0 : i * (w + g) - (i ? 10 : 0)))]); const k = mix(A, '#ffffff', (i / Math.max(1, n - 1)) * 0.35); out += pathEl(cmds, k) + para(i * (w + g) + w / 2 + (i ? 4 : -3), H / 2, wrap(x, w - 44, 14, font, 4), 14, on(k)); }); } else if (o.t === 'cycle') {
    const R = H / 2 - 46, cx = W / 2, cy = H / 2;
    it.forEach((x, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n, px = cx + R * 1.5 * Math.cos(a), py = cy + R * Math.sin(a), b = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / n; if (n > 1) { const ax = cx + R * 1.5 * Math.cos(b), ay = cy + R * Math.sin(b), t = (Math.atan2(R * Math.cos(b), -R * 1.5 * Math.sin(b)) * 180) / Math.PI; out += `<path d="M-7-8L9 0L-7 8Z" transform="translate(${f(ax)} ${f(ay)}) rotate(${f(t)})" fill="${mix(A, '#ffffff', 0.45)}"/>`; } out += `<rect x="${f(px - 72)}" y="${f(py - 34)}" width="144" height="68" rx="14" fill="${cols[i]}"/>` + para(px, py, wrap(x, 128, 14, font, 3), 14, on(cols[i])); });
  } else if (o.t === 'pyramid') {
    const h = H / n;
    it.forEach((x, i) => { const a = (i / n) * (W * 0.42), b = ((i + 1) / n) * (W * 0.42), y = i * h, k = mix(A, '#ffffff', (i / Math.max(1, n)) * 0.55); out += `<path d="M${f(W / 2 - a)} ${f(y)}L${f(W / 2 + a)} ${f(y)}L${f(W / 2 + b)} ${f(y + h - 3)}L${f(W / 2 - b)} ${f(y + h - 3)}Z" fill="${k}"/>` + para(W / 2, y + h / 2 + (i ? 0 : h * 0.16), wrap(x, Math.max(60, a + b - 10), i ? 14 : 12, font, 2), i ? 14 : 12, on(k)); });
  } else if (o.t === 'timeline') {
    const y = H * 0.36, w = W / n;
    out += `<line x1="${f(w / 2)}" y1="${f(y)}" x2="${f(W - w / 2)}" y2="${f(y)}" stroke="${mix(A, '#ffffff', 0.5)}" stroke-width="4" stroke-linecap="round"/>`;
    it.forEach((x, i) => { const cx = w * (i + 0.5); out += `<circle cx="${f(cx)}" cy="${f(y)}" r="13" fill="${A}" stroke="#fff" stroke-width="4"/>` + text(cx, y - 24, String(i + 1), 15, A, { a: 'middle', b: 1 }); const L = wrap(x, w - 12, 13, font, 4); L.forEach((l, j) => { out += text(cx, y + 36 + j * 17, l, 13, c.ink, { a: 'middle' }); }); });
  } else if (o.t === 'steps') { const w = W / n; it.forEach((x, i) => { const h = H * (0.35 + (0.65 * (i + 1)) / n), k = mix(A, '#ffffff', 0.5 - (0.5 * i) / Math.max(1, n - 1)); out += `<rect x="${f(i * w + 3)}" y="${f(H - h)}" width="${f(w - 6)}" height="${f(h)}" rx="8" fill="${k}"/>`; wrap(x, w - 24, 14, font, 4).forEach((l, j) => { out += text(i * w + 14, H - h + 24 + j * 18, l, 14, on(k)); }); }); } else { const h = H / n; it.forEach((x, i) => { out += `<rect x="0" y="${f(i * h + 3)}" width="${W}" height="${f(h - 6)}" rx="10" fill="${mix(A, '#ffffff', 0.88)}"/><circle cx="32" cy="${f(i * h + h / 2)}" r="${f(Math.min(16, h / 2 - 6))}" fill="${A}"/>` + text(32, i * h + h / 2 + 5, String(i + 1), 14, on(A), { a: 'middle', b: 1 }) + wrap(x, W - 84, 15, font, 2).map((l, j, all) => text(62, i * h + h / 2 + 5 + (j - (all.length - 1) / 2) * 18, l, 15, c.ink)).join(''); }); }
  return out;
}

function shape(o, H, A, c) {
  if (o.s === 'line') {
    const sw = Math.max(1, o.w * 1.6 || 2), k = o.b || A, q = lineHeads({ h1: o.h === 'both' ? 'arrow' : '', h2: o.h ? 'arrow' : '' }, W - 4, H, sw);
    return `<g transform="translate(2 0)"><line x1="${f(q.x1)}" y1="${f(q.y)}" x2="${f(q.x2)}" y2="${f(q.y)}" stroke="${k}" stroke-width="${f(sw)}"${o.d ? ` stroke-dasharray="${f(sw * 4)} ${f(sw * 3)}"` : ''}/>${q.heads.map((z) => pathEl(z, k)).join('')}</g>`;
  }
  const sw = o.w * 1.6, fill = o.f === 'none' ? 'none' : o.f || A, p = sw / 2 + 1, cmds = shapePath(o.s, W - 2 * p, H - 2 * p, o.s === 'round' ? 34 : 0);
  return `<g transform="translate(${f(p)} ${f(p)})">${pathEl(cmds, fill, sw ? ` stroke="${o.b || c.ink}" stroke-width="${f(sw)}" stroke-linejoin="round"${o.d ? ` stroke-dasharray="${f(sw * 3)} ${f(sw * 2)}"` : ''}` : '')}</g>` + (o.x ? para(W / 2, H / 2, wrap(o.x, W * 0.78, o.ts * 2.2, c.font, 8), o.ts * 2.2, o.tc || (fill === 'none' ? c.ink : on(fill))) : '');
}
const icon = (o, H, A) => `<g transform="scale(${W / 24})" fill="none" stroke="${A}" stroke-width="${o.w}" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[o.n]}</g>`;
function code(o, H, A, c) {
  const m = qr(o.x || ' '), n = m.length, u = W / (n + 2);
  let d = '';
  m.forEach((r, y) => r.forEach((v, x) => { if (v) d += `M${f((x + 1) * u)} ${f((y + 1) * u)}h${f(u + 0.3)}v${f(u + 0.3)}h${f(-u - 0.3)}z`; }));
  return `<rect width="${W}" height="${W}" fill="#fff"/><path d="${d}" fill="${o.c || c.ink}"/>`;
}
const sign = (o, H, A, c) => `<line x1="10" y1="${f(H * 0.62)}" x2="${W - 10}" y2="${f(H * 0.62)}" stroke="${c.ink}" stroke-width="2"/>` + text(W / 2, H * 0.62 + 32, o.x, 26, c.ink, { a: 'middle' }) + (o.d ? text(W / 2, H * 0.62 + 62, o.d, 21, mix(c.ink, '#ffffff', 0.4), { a: 'middle' }) : '');

/** An object as a PNG, for the files that cannot hold SVG. */
export async function objectPng(o, c, scale = 2.5) {
  const svg = drawObject(o, { ...c, font: 'Arial, sans-serif' }), m = svg.match(/width="([\d.]+)" height="([\d.]+)"/), w = Math.round(+m[1] * scale), h = Math.round(+m[2] * scale);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(img, 0, 0, w, h);
  return { w: +m[1], h: +m[2], blob: await new Promise((r) => cv.toBlob(r, 'image/png')) };
}
