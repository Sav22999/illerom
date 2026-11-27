/**
 * Charts drawn from a range of cells, as SVG (the same drawing on screen, in print and in the exported files that keep
 * pictures). The first row holds the names of the series and the first column the categories, unless the chart says
 * otherwise (head: false; rows: true for series in rows).
 */
import { parseRange } from './model.js';

export const PALETTE = ['#4d7c0f', '#2563eb', '#ea580c', '#9333ea', '#0891b2', '#dc2626', '#ca8a04', '#db2777', '#475569', '#16a34a'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The data of a chart: {cats: [labels], series: [{name, values}]}. value(r, c) gives a cell; text(r, c) as shown. */
export function chartData(ch, value, text) {
  const g = parseRange(ch.r);
  if (!g) return { cats: [], series: [] };
  const R = g.r2 - g.r1 + 1, C = g.c2 - g.c1 + 1;
  const at = (i, j) => (ch.rows ? [g.r1 + j, g.c1 + i] : [g.r1 + i, g.c1 + j]); // i: along the categories, j: across the series
  const n = ch.rows ? C : R, m = ch.rows ? R : C;
  // a first column of texts (or dates) names the categories; a first row of texts names the series
  const firstIsCat = m > 1 && Array.from({ length: n }, (_, i) => value(...at(i, 0))).some((v) => typeof v === 'string') || (m > 1 && ch.k === 'scatter');
  const head = ch.head !== false && Array.from({ length: m }, (_, j) => value(...at(0, j))).some((v) => typeof v === 'string');
  const i0 = head ? 1 : 0, j0 = firstIsCat ? 1 : 0;
  const cats = [];
  for (let i = i0; i < n; i++) cats.push(firstIsCat ? text(...at(i, 0)) : String(i - i0 + 1));
  const series = [];
  for (let j = j0; j < m; j++) {
    const values = [];
    for (let i = i0; i < n; i++) { const v = value(...at(i, j)); values.push(typeof v === 'number' ? v : typeof v === 'boolean' ? +v : null); }
    series.push({ name: head ? text(...at(0, j)) : `${j - j0 + 1}`, values });
  }
  const xs = ch.k === 'scatter' && firstIsCat ? Array.from({ length: n - i0 }, (_, k) => { const v = value(...at(k + i0, 0)); return typeof v === 'number' ? v : k + 1; }) : null;
  return { cats, series: series.slice(0, 12), xs };
}

const nice = (lo, hi) => {
  if (lo === hi) { hi = lo + 1; if (lo > 0) lo = 0; }
  const span = hi - lo, step0 = 10 ** Math.floor(Math.log10(span / 5)), step = [1, 2, 2.5, 5, 10].map((k) => k * step0).find((s) => span / s <= 6) || step0 * 10;
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
};
const short = (n, fmt) => (fmt ? fmt(n) : Math.abs(n) >= 1e6 ? +(n / 1e6).toFixed(1) + 'M' : Math.abs(n) >= 1e4 ? +(n / 1e3).toFixed(1) + 'k' : String(+n.toFixed(4)));

/**
 * The SVG of a chart, w × h. o: {dark, fmt (number → text)}.
 */
export function chartSVG(ch, data, w, h, o = {}) {
  const ink = o.dark ? '#e6ebe0' : '#1f2a17', muted = o.dark ? '#9aa792' : '#66725c', line = o.dark ? '#33402c' : '#e3e8dc';
  const colors = ch.color ? [ch.color, ...PALETTE.filter((c) => c !== ch.color)] : PALETTE;
  const { cats, series } = data, out = [];
  const title = ch.title ? 28 : 8, legend = ch.legend !== false && (series.length > 1 || ['pie', 'donut'].includes(ch.k)) ? 26 : 0;
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Inter, system-ui, sans-serif" font-size="11">`);
  out.push(`<rect width="${w}" height="${h}" fill="${o.dark ? '#1a2016' : '#fff'}"/>`);
  if (ch.title) out.push(`<text x="${w / 2}" y="19" text-anchor="middle" font-size="14" font-weight="600" fill="${ink}">${esc(ch.title)}</text>`);
  if (!series.length || !cats.length) { out.push(`<text x="${w / 2}" y="${h / 2}" text-anchor="middle" fill="${muted}">—</text></svg>`); return out.join(''); }
  // the legend, below
  if (legend) {
    const names = ['pie', 'donut'].includes(ch.k) ? cats : series.map((s) => s.name);
    let x = 12;
    const items = names.slice(0, 12).map((n, i) => { const t = String(n).slice(0, 24), wd = 18 + t.length * 6.2; const s = `<rect x="${x}" y="${h - 18}" width="10" height="10" rx="2" fill="${colors[i % colors.length]}"/><text x="${x + 14}" y="${h - 9}" fill="${muted}">${esc(t)}</text>`; x += wd + 10; return s; });
    if (x > w) out.push(`<g transform="translate(${Math.max(0, (w - x) / 2)} 0)">${items.join('')}</g>`); else out.push(`<g transform="translate(${(w - x) / 2} 0)">${items.join('')}</g>`);
  }
  const top = title + 6, bottom = h - legend - 8;
  if (ch.k === 'pie' || ch.k === 'donut') {
    const vals = series[0].values.map((v) => Math.max(0, v || 0)), total = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = w / 2, cy = (top + bottom) / 2, r = Math.max(10, Math.min(w / 2 - 20, (bottom - top) / 2 - 4)), ri = ch.k === 'donut' ? r * 0.58 : 0;
    let a = -Math.PI / 2;
    vals.forEach((v, i) => {
      if (!v) return;
      const b = a + (v / total) * Math.PI * 2, large = b - a > Math.PI ? 1 : 0, p = (ang, rr) => `${cx + rr * Math.cos(ang)} ${cy + rr * Math.sin(ang)}`;
      const d = v === total ? `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0` + (ri ? `M${cx - ri} ${cy}a${ri} ${ri} 0 1 1 ${2 * ri} 0a${ri} ${ri} 0 1 1 ${-2 * ri} 0` : '') : ri ? `M${p(a, r)}A${r} ${r} 0 ${large} 1 ${p(b, r)}L${p(b, ri)}A${ri} ${ri} 0 ${large} 0 ${p(a, ri)}Z` : `M${cx} ${cy}L${p(a, r)}A${r} ${r} 0 ${large} 1 ${p(b, r)}Z`;
      out.push(`<path d="${d}" fill="${colors[i % colors.length]}" stroke="${o.dark ? '#1a2016' : '#fff'}" stroke-width="1.5" fill-rule="evenodd"><title>${esc(cats[i])}: ${esc(short(v, o.fmt))}</title></path>`);
      const mid = (a + b) / 2, pct = (v / total) * 100;
      if (pct >= 5) out.push(`<text x="${cx + (ri ? (r + ri) / 2 : r * 0.62) * Math.cos(mid)}" y="${cy + (ri ? (r + ri) / 2 : r * 0.62) * Math.sin(mid) + 4}" text-anchor="middle" fill="#fff" font-weight="600">${Math.round(pct)}%</text>`);
      a = b;
    });
    out.push('</svg>');
    return out.join('');
  }
  const stacked = ch.k === 'stacked', horiz = ch.k === 'bar';
  let lo = Infinity, hi = -Infinity;
  if (stacked) cats.forEach((_, i) => { let p = 0, n = 0; for (const s of series) { const v = s.values[i] || 0; if (v > 0) p += v; else n += v; } hi = Math.max(hi, p); lo = Math.min(lo, n); });
  else for (const s of series) for (const v of s.values) if (v !== null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
  if (ch.k !== 'line' && ch.k !== 'scatter') { lo = Math.min(0, lo); hi = Math.max(0, hi); }
  const sc = nice(lo, hi), labW = Math.min(110, 12 + Math.max(...[sc.lo, sc.hi].map((v) => short(v, o.fmt).length)) * 6.5);
  let xsMin = 0, xsMax = 1;
  if (ch.k === 'scatter' && data.xs) { const s2 = nice(Math.min(...data.xs), Math.max(...data.xs)); xsMin = s2.lo; xsMax = s2.hi; }
  const catW = horiz ? Math.min(140, 10 + Math.max(...cats.map((c) => String(c).length)) * 6.2) : 0;
  const L = horiz ? catW + 8 : labW, R = w - 14, T = top + 4, B = bottom - (horiz ? 18 : 22);
  const V = (v) => (horiz ? L + ((v - sc.lo) / (sc.hi - sc.lo)) * (R - L) : B - ((v - sc.lo) / (sc.hi - sc.lo)) * (B - T));
  // grid and scale
  for (let v = sc.lo; v <= sc.hi + sc.step / 2; v += sc.step) {
    const p = V(v);
    out.push(horiz ? `<line x1="${p}" x2="${p}" y1="${T}" y2="${B}" stroke="${line}"/><text x="${p}" y="${B + 14}" text-anchor="middle" fill="${muted}">${esc(short(v, o.fmt))}</text>` : `<line x1="${L}" x2="${R}" y1="${p}" y2="${p}" stroke="${line}"/><text x="${L - 6}" y="${p + 4}" text-anchor="end" fill="${muted}">${esc(short(v, o.fmt))}</text>`);
  }
  const n = cats.length, band = (horiz ? B - T : R - L) / n;
  const pos = (i) => (horiz ? T + band * (i + 0.5) : L + band * (i + 0.5));
  // category labels: as many as fit
  const every = Math.max(1, Math.ceil((n * (horiz ? 14 : 8 + Math.min(12, Math.max(...cats.map((c) => String(c).length))) * 6)) / (horiz ? B - T : R - L)));
  if (ch.k !== 'scatter') cats.forEach((c, i) => { if (i % every) return; out.push(horiz ? `<text x="${L - 6}" y="${pos(i) + 4}" text-anchor="end" fill="${muted}">${esc(String(c).slice(0, 22))}</text>` : `<text x="${pos(i)}" y="${B + 15}" text-anchor="middle" fill="${muted}">${esc(String(c).slice(0, 14))}</text>`); });
  const zero = V(Math.max(sc.lo, Math.min(sc.hi, 0)));
  if (ch.k === 'column' || ch.k === 'bar' || stacked) {
    const k = stacked ? 1 : series.length, bw = Math.max(1, (band * 0.72) / k);
    cats.forEach((cat, i) => {
      let pAcc = 0, nAcc = 0;
      series.forEach((s, j) => {
        const v = s.values[i];
        if (v === null) return;
        let a, b;
        if (stacked) { if (v >= 0) { a = V(pAcc); pAcc += v; b = V(pAcc); } else { a = V(nAcc); nAcc += v; b = V(nAcc); } } else { a = zero; b = V(v); }
        const off = stacked ? -bw / 2 : -band * 0.36 + j * bw, c = pos(i) + off;
        const rect = horiz ? `x="${Math.min(a, b)}" y="${c}" width="${Math.abs(b - a)}" height="${bw - 1}"` : `x="${c}" y="${Math.min(a, b)}" width="${bw - 1}" height="${Math.abs(b - a)}"`;
        out.push(`<rect ${rect} rx="2" fill="${colors[j % colors.length]}"><title>${esc(s.name)} · ${esc(cat)}: ${esc(short(v, o.fmt))}</title></rect>`);
      });
    });
  } else if (ch.k === 'scatter') {
    const X = (v) => L + ((v - xsMin) / (xsMax - xsMin || 1)) * (R - L), xs = data.xs || cats.map((_, i) => i + 1);
    const s2 = nice(xsMin, xsMax);
    for (let v = s2.lo; v <= s2.hi + s2.step / 2; v += s2.step) out.push(`<text x="${X(v)}" y="${B + 15}" text-anchor="middle" fill="${muted}">${esc(short(v, o.fmt))}</text>`);
    series.forEach((s, j) => s.values.forEach((v, i) => { if (v !== null) out.push(`<circle cx="${X(xs[i])}" cy="${V(v)}" r="3.6" fill="${colors[j % colors.length]}" fill-opacity=".85"><title>${esc(s.name)}: ${esc(short(xs[i], o.fmt))}, ${esc(short(v, o.fmt))}</title></circle>`); }));
  } else {
    series.forEach((s, j) => {
      const pts = s.values.map((v, i) => (v === null ? null : [pos(i), V(v)]));
      let d = '', started = false;
      for (const p of pts) { if (!p) { started = false; continue; } d += (started ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); started = true; }
      const col = colors[j % colors.length];
      if (ch.k === 'area') { const ok = pts.filter(Boolean); if (ok.length) out.push(`<path d="${d}L${ok.at(-1)[0]} ${zero}L${ok[0][0]} ${zero}Z" fill="${col}" fill-opacity=".22"/>`); }
      out.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`);
      if (n <= 40) pts.forEach((p, i) => { if (p) out.push(`<circle cx="${p[0]}" cy="${p[1]}" r="2.8" fill="${col}"><title>${esc(s.name)} · ${esc(cats[i])}: ${esc(short(s.values[i], o.fmt))}</title></circle>`); });
    });
  }
  out.push(horiz ? `<line x1="${zero}" x2="${zero}" y1="${T}" y2="${B}" stroke="${muted}"/>` : `<line x1="${L}" x2="${R}" y1="${zero}" y2="${zero}" stroke="${muted}"/>`);
  out.push('</svg>');
  return out.join('');
}
