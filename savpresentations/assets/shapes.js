/**
 * Shapes: every shape is a list of path commands (M, L, C, Z) in a box w × h. The same commands draw the slide (SVG),
 * the PDF, the PPTX and the ODP, so a shape is identical everywhere.
 */
const K = 0.5522847498;

export const SHAPES = ['rect', 'round', 'ellipse', 'triangle', 'rtriangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'parallelogram', 'trapezoid', 'star', 'star4', 'burst', 'arrow', 'arrow2', 'chevron', 'homeplate', 'plus', 'heart', 'cloud', 'speech', 'ring', 'half', 'quarter', 'arch', 'drop', 'blob', 'blob2', 'wave', 'moon', 'frame', 'line'];

const poly = (pts) => [...pts.map((p, i) => [i ? 'L' : 'M', p[0], p[1]]), ['Z']];
const ellipse = (x, y, w, h, rev) => {
  const rx = w / 2, ry = h / 2, cx = x + rx, cy = y + ry, kx = rx * K, ky = ry * K;
  return rev
    ? [['M', cx + rx, cy], ['C', cx + rx, cy - ky, cx + kx, cy - ry, cx, cy - ry], ['C', cx - kx, cy - ry, cx - rx, cy - ky, cx - rx, cy], ['C', cx - rx, cy + ky, cx - kx, cy + ry, cx, cy + ry], ['C', cx + kx, cy + ry, cx + rx, cy + ky, cx + rx, cy], ['Z']]
    : [['M', cx + rx, cy], ['C', cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry], ['C', cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy], ['C', cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry], ['C', cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy], ['Z']];
};
const round = (w, h, r) => {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!r) return poly([[0, 0], [w, 0], [w, h], [0, h]]);
  const k = r * (1 - K);
  return [['M', r, 0], ['L', w - r, 0], ['C', w - k, 0, w, k, w, r], ['L', w, h - r], ['C', w, h - k, w - k, h, w - r, h], ['L', r, h], ['C', k, h, 0, h - k, 0, h - r], ['L', 0, r], ['C', 0, k, k, 0, r, 0], ['Z']];
};
const regular = (n, w, h, a0 = -90) => poly(Array.from({ length: n }, (_, i) => { const a = (a0 + i * 360 / n) * Math.PI / 180; return [w / 2 + Math.cos(a) * w / 2, h / 2 + Math.sin(a) * h / 2]; }));
const star = (n, w, h, inner) => poly(Array.from({ length: n * 2 }, (_, i) => { const a = (-90 + i * 180 / n) * Math.PI / 180, k = i % 2 ? inner : 1; return [w / 2 + Math.cos(a) * w / 2 * k, h / 2 + Math.sin(a) * h / 2 * k]; }));
// curves written on a 100 × 100 box
const box = (w, h, cmds) => cmds.map(([c, ...n]) => [c, ...n.map((v, i) => v / 100 * (i % 2 ? h : w))]);

/** The commands of a shape. rad is used by rect and round. */
export function shapePath(shape, w, h, rad = 0) {
  const m = Math.min(w, h);
  switch (shape) {
    case 'round': return round(w, h, rad || m * 0.16);
    case 'ellipse': return ellipse(0, 0, w, h);
    case 'triangle': return poly([[w / 2, 0], [w, h], [0, h]]);
    case 'rtriangle': return poly([[0, 0], [w, h], [0, h]]);
    case 'diamond': return poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
    case 'pentagon': return regular(5, w, h);
    case 'hexagon': return poly([[w * .25, 0], [w * .75, 0], [w, h / 2], [w * .75, h], [w * .25, h], [0, h / 2]]);
    case 'octagon': return poly([[w * .29, 0], [w * .71, 0], [w, h * .29], [w, h * .71], [w * .71, h], [w * .29, h], [0, h * .71], [0, h * .29]]);
    case 'parallelogram': { const d = Math.min(w * .25, h * .6); return poly([[d, 0], [w, 0], [w - d, h], [0, h]]); }
    case 'trapezoid': return poly([[w * .2, 0], [w * .8, 0], [w, h], [0, h]]);
    case 'star': return star(5, w, h, .42);
    case 'star4': return star(4, w, h, .34);
    case 'burst': return star(14, w, h, .8);
    case 'arrow': { const d = Math.min(w * .45, h * .75); return poly([[0, h * .28], [w - d, h * .28], [w - d, 0], [w, h / 2], [w - d, h], [w - d, h * .72], [0, h * .72]]); }
    case 'arrow2': { const d = Math.min(w * .3, h * .7); return poly([[0, h / 2], [d, 0], [d, h * .28], [w - d, h * .28], [w - d, 0], [w, h / 2], [w - d, h], [w - d, h * .72], [d, h * .72], [d, h]]); }
    case 'chevron': { const d = Math.min(w * .4, h * .5); return poly([[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h], [d, h / 2]]); }
    case 'homeplate': { const d = Math.min(w * .4, h * .5); return poly([[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h]]); }
    case 'plus': { const x = w / 3, y = h / 3; return poly([[x, 0], [2 * x, 0], [2 * x, y], [w, y], [w, 2 * y], [2 * x, 2 * y], [2 * x, h], [x, h], [x, 2 * y], [0, 2 * y], [0, y], [x, y]]); }
    case 'heart': return box(w, h, [['M', 50, 97], ['C', 18, 70, 0, 52, 0, 29], ['C', 0, 11, 13, 1, 27, 1], ['C', 37, 1, 46, 7, 50, 16], ['C', 54, 7, 63, 1, 73, 1], ['C', 87, 1, 100, 11, 100, 29], ['C', 100, 52, 82, 70, 50, 97], ['Z']]);
    case 'cloud': return box(w, h, [['M', 25, 92], ['C', 8, 92, 0, 79, 0, 66], ['C', 0, 53, 8, 43, 19, 42], ['C', 17, 22, 30, 6, 47, 6], ['C', 60, 6, 70, 15, 74, 29], ['C', 89, 28, 100, 43, 100, 60], ['C', 100, 78, 90, 92, 76, 92], ['Z']]);
    case 'speech': { const r = Math.min(w, h) * .16, b = h * .8, k = r * (1 - K); return [['M', r, 0], ['L', w - r, 0], ['C', w - k, 0, w, k, w, r], ['L', w, b - r], ['C', w, b - k, w - k, b, w - r, b], ['L', w * .42, b], ['L', w * .2, h], ['L', w * .24, b], ['L', r, b], ['C', k, b, 0, b - k, 0, b - r], ['L', 0, r], ['C', 0, k, k, 0, r, 0], ['Z']]; }
    case 'ring': { const t = m * .18; return [...ellipse(0, 0, w, h), ...ellipse(t, t, w - 2 * t, h - 2 * t, true)]; }
    case 'frame': { const t = m * .1; return [...poly([[0, 0], [w, 0], [w, h], [0, h]]), ...poly([[t, t], [t, h - t], [w - t, h - t], [w - t, t]])]; }
    case 'half': return [['M', 0, h], ['C', 0, h * (1 - K), w / 2 * (1 - K), 0, w / 2, 0], ['C', w / 2 * (1 + K), 0, w, h * (1 - K), w, h], ['Z']];
    case 'quarter': return [['M', 0, 0], ['C', w * K, 0, w, h * (1 - K), w, h], ['L', 0, h], ['Z']];
    case 'arch': { const r = Math.min(w / 2, h), k = r * K; return [['M', 0, h], ['L', 0, r], ['C', 0, r - k, w / 2 - w / 2 * K, 0, w / 2, 0], ['C', w / 2 + w / 2 * K, 0, w, r - k, w, r], ['L', w, h], ['Z']]; }
    case 'drop': return [['M', w / 2, 0], ['L', w, 0], ['L', w, h / 2], ['C', w, h * (.5 + K / 2), w * (.5 + K / 2), h, w / 2, h], ['C', w * (.5 - K / 2), h, 0, h * (.5 + K / 2), 0, h / 2], ['C', 0, h * (.5 - K / 2), w * (.5 - K / 2), 0, w / 2, 0], ['Z']];
    case 'blob': return box(w, h, [['M', 52, 2], ['C', 76, 0, 98, 18, 99, 43], ['C', 100, 66, 90, 79, 76, 91], ['C', 61, 103, 36, 101, 20, 88], ['C', 4, 75, -3, 55, 3, 37], ['C', 9, 19, 28, 4, 52, 2], ['Z']]);
    case 'blob2': return box(w, h, [['M', 33, 6], ['C', 52, -5, 72, 4, 84, 18], ['C', 96, 32, 104, 52, 95, 69], ['C', 87, 85, 66, 84, 50, 94], ['C', 34, 104, 12, 98, 4, 79], ['C', -4, 60, 6, 48, 10, 34], ['C', 14, 22, 20, 13, 33, 6], ['Z']]);
    case 'wave': return box(w, h, [['M', 0, 30], ['C', 18, -8, 34, -8, 52, 22], ['C', 70, 52, 84, 50, 100, 18], ['L', 100, 100], ['L', 0, 100], ['Z']]);
    case 'moon': return box(w, h, [['M', 62, 0], ['C', 28, 4, 4, 26, 4, 52], ['C', 4, 80, 32, 100, 64, 100], ['C', 78, 100, 90, 96, 98, 88], ['C', 62, 88, 40, 70, 40, 46], ['C', 40, 26, 48, 10, 62, 0], ['Z']]);
    default: return round(w, h, rad);
  }
}

const n = (v) => Math.round(v * 100) / 100;
export const toSvgPath = (cmds) => cmds.map(([c, ...v]) => c + v.map(n).join(' ')).join('');

/** A line runs through the middle of its box; the heads are drawn as filled shapes. */
export function lineHeads(el, w, h, sw) {
  const out = [], y = h / 2, a = Math.max(10, sw * 3.2), b = a * .62;
  const head = (x, dir, kind) => {
    if (kind === 'arrow') out.push(poly([[x, y], [x - dir * a, y - b], [x - dir * a, y + b]]));
    if (kind === 'dot') out.push(ellipse(x - a / 2.4, y - a / 2.4, a / 1.2, a / 1.2));
  };
  if (el.h1) head(0, -1, el.h1);
  if (el.h2) head(w, 1, el.h2);
  return { heads: out, x1: el.h1 === 'arrow' ? a * .8 : 0, x2: w - (el.h2 === 'arrow' ? a * .8 : 0), y };
}
