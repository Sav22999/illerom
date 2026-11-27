/**
 * From the sketch to the diagram: a board of SavWhiteboard (from the account, or a .savwhi file) becomes a diagram. Its
 * shapes become nodes (rectangle, ellipse, diamond), the texts written inside a shape become its text and the others
 * free texts, sticky notes become notes, and arrows and lines become connectors attached to the shapes their ends touch.
 * Strokes drawn by hand are looked at too: a closed one becomes a rectangle, an ellipse or a diamond, an open one that
 * goes from a shape to another a connector. What is left (scribbles, pictures) does not come along.
 */
import { cleanItems, defaultSettings, edge, node } from './model.js';

const near = (n, x, y, tol) => x >= n.x - tol && x <= n.x + n.w + tol && y >= n.y - tol && y <= n.y + n.h + tol;
const inside = (n, b) => b.x >= n.x - 4 && b.y >= n.y - 4 && b.x + b.w <= n.x + n.w + 4 && b.y + b.h <= n.y + n.h + 4;

/** What a stroke drawn by hand looks like: {kind: rect | ellipse | diamond, box} when closed, {line: [a, b]} when open, or null. */
export function recognise(p) {
  const pts = [];
  for (let k = 0; k + 1 < p.length; k += 3) pts.push([p[k], p[k + 1]]);
  if (pts.length < 4) return null;
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]), x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
  if (w < 12 && h < 12) return null;
  const [a, b] = [pts[0], pts[pts.length - 1]], gap = Math.hypot(a[0] - b[0], a[1] - b[1]);
  let len = 0;
  for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  if (gap > Math.max(w, h) * .3) return len < Math.hypot(w, h) * 1.6 ? { line: [a, b] } : null; // open: a line if it is not a scribble
  // closed: how much of the box it fills, and where its points sit, tell the shapes apart
  const cx = x + w / 2, cy = y + h / 2;
  let area = 0;
  for (let k = 0; k < pts.length; k++) { const [x1, y1] = pts[k], [x2, y2] = pts[(k + 1) % pts.length]; area += x1 * y2 - x2 * y1; }
  const fill = Math.abs(area / 2) / Math.max(1, w * h);
  const corners = pts.filter(([px, py]) => Math.abs(px - cx) > w * .38 && Math.abs(py - cy) > h * .38).length / pts.length;
  const box = { x, y, w, h };
  if (fill < .62 && corners < .04) return { kind: 'diamond', box };
  if (corners > .08 || fill > .86) return { kind: 'rect', box };
  return { kind: 'ellipse', box };
}

/** {title, settings, items} from a board {title, settings, items} (a .savwhi, or wb.get of SavWhiteboard: list). */
export function fromBoard(b, name = '') {
  const list = Array.isArray(b.items) ? b.items : Array.isArray(b.list) ? b.list : [];
  const ink = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) && c.toLowerCase() !== '#ffffff' ? c.toLowerCase() : '#1c1c1c');
  const nodes = [], lines = [], texts = [];
  for (const i of list) {
    if (i.t === 'shape' && ['rect', 'ellipse', 'diamond', 'triangle'].includes(i.k)) {
      const x = Math.min(i.x, i.x + i.w), y = Math.min(i.y, i.y + i.h);
      nodes.push(node(i.k === 'triangle' ? 'diamond' : i.k === 'rect' ? 'round' : i.k, x, y, Math.max(20, Math.abs(i.w)), Math.max(20, Math.abs(i.h)), '', { c: ink(i.c), f: i.f || '#ffffff', s: Math.min(6, Math.max(1, i.s / 2)), d: i.d ? 'dash' : '' }));
    } else if (i.t === 'shape' && (i.k === 'arrow' || i.k === 'line')) lines.push({ a: [i.x, i.y], b: [i.x + i.w, i.y + i.h], arrow: i.k === 'arrow', c: ink(i.c), d: i.d });
    else if (i.t === 'note') nodes.push(node('note', i.x, i.y, i.w, i.h, i.text || '', { f: i.f || '#fff3c4', tc: ink(i.c), al: 'left', va: 'top', fs: Math.max(10, Math.round((i.fs || 22) * .8)) }));
    else if (i.t === 'text' && i.text?.trim()) texts.push(i);
    else if (i.t === 'stroke' && i.tool !== 'marker') {
      const r = recognise(i.p || []);
      if (r?.kind) nodes.push(node(r.kind === 'rect' ? 'round' : r.kind, r.box.x, r.box.y, r.box.w, r.box.h, '', { c: ink(i.c), s: 2 }));
      else if (r?.line) lines.push({ a: r.line[0], b: r.line[1], arrow: true, c: ink(i.c), hand: true });
    }
  }
  // texts written inside a shape are its text; the others stay as free texts
  for (const tx of texts) {
    const fs = Math.max(10, Math.round((tx.fs || 28) * .7)), lines2 = tx.text.split('\n'), w = tx.w || Math.max(...lines2.map((l) => l.length)) * fs * .6, h = lines2.length * fs * 1.3;
    const b = { x: tx.x, y: tx.y, w, h }, host = nodes.filter((n) => n.k !== 'note' && inside(n, b)).sort((p, q) => p.w * p.h - q.w * q.h)[0];
    if (host) host.text = (host.text ? host.text + '\n' : '') + tx.text.trim();
    else nodes.push(node('text', tx.x, tx.y, Math.max(40, w), Math.max(20, h), tx.text.trim(), { tc: ink(tx.c), fs, ff: tx.ff === 'hand' ? 'hand' : 'sans', al: tx.al || 'left' }));
  }
  // lines become connectors: their ends attach to the shape they touch (else a free point)
  const shapes = nodes.filter((n) => n.k !== 'text');
  const end = ([x, y]) => { const n = shapes.filter((s) => near(s, x, y, 26)).sort((p, q) => p.w * p.h - q.w * q.h)[0]; return n ? { n: n.id, p: '' } : { x, y }; };
  const edges = [];
  for (const l of lines) {
    const a = end(l.a), b = end(l.b);
    if (l.hand && !(a.n && b.n)) continue; // a stroke by hand counts only between two shapes
    if (a.n && a.n === b.n) continue;
    edges.push(edge(a, b, { r: 'straight', c: l.c, d: l.d ? 'dash' : '', ea: l.arrow ? 'arrow' : 'none' }));
  }
  const items = cleanItems([...nodes, ...edges]);
  if (!items.length) throw Object.assign(new Error('sketch_empty'), { code: 'sketch_empty' });

  return { title: String(b.title || name.replace(/\.savwhi$/i, '') || '').slice(0, 160), settings: defaultSettings(), items };
}
