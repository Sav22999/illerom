/** Small pictures of a sheet: the top left corner of its first sheet, for the cards of the home, templates and versions. */
import { h } from './ui.js';
import { colName, FONT_STACK, key, parseRange } from './model.js';
import { formatValue, loc } from './format.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * A sheet as a small table. s: a sheet, or a preview from the server ({cells, cols, merges, grid, settings}).
 * o: {rows, cols, value(k) (computed values, else the kept ones), big (with headers, for versions)}
 */
export function miniSheet(s, o = {}) {
  const R = o.rows || 14, C = o.cols || 7, L = loc(s.settings?.lang || o.lang || 'en'), cells = s.cells || {}, covered = new Set(), span = new Map();
  for (const m of s.merges || []) { const g = parseRange(m); if (!g || g.r1 > R || g.c1 > C) continue; span.set(key(g.r1, g.c1), [Math.min(g.r2, R) - g.r1 + 1, Math.min(g.c2, C) - g.c1 + 1]); for (let r = g.r1; r <= Math.min(g.r2, R); r++) for (let c = g.c1; c <= Math.min(g.c2, C); c++) if (r !== g.r1 || c !== g.c1) covered.add(key(r, c)); }
  const widths = Array.from({ length: C }, (_, i) => Math.round((s.cols?.[colName(i + 1)]?.w || 100) * (o.big ? 1 : 0.62)));
  let html = `<table class="mini${s.grid === false ? ' nogrid' : ''}${o.big ? ' big' : ''}"><colgroup>${o.big ? '<col style="width:34px">' : ''}${widths.map((w) => `<col style="width:${w}px">`).join('')}</colgroup>`;
  if (o.big) html += `<tr><th></th>${widths.map((_, i) => `<th>${colName(i + 1)}</th>`).join('')}</tr>`;
  for (let r = 1; r <= R; r++) {
    html += '<tr>' + (o.big ? `<th>${r}</th>` : '');
    for (let c = 1; c <= C; c++) {
      const k = key(r, c);
      if (covered.has(k)) continue;
      const cell = cells[k], st = { ...(s.cols?.[colName(c)]?.s || {}), ...(s.rows?.[r]?.s || {}), ...(cell?.s || {}) }, v = o.value ? o.value(k) : cell?.v ?? null;
      const f = v === null || v === undefined ? { text: '' } : formatValue(v, st.nf, L), sp = span.get(k);
      const css = [st.b ? 'font-weight:700' : '', st.i ? 'font-style:italic' : '', st.c || f.color ? `color:${f.color || st.c}` : '', st.bg ? `background:${st.bg}` : '', `text-align:${st.ha === 'c' ? 'center' : st.ha === 'r' || (typeof v === 'number' && !st.ha) ? 'right' : 'left'}`, st.fz ? `font-size:${Math.min(2, st.fz / 10)}em` : '', st.ff ? `font-family:${FONT_STACK[st.ff]}` : '', st.bb ? `border-bottom:${st.bb.startsWith('thick') || st.bb.startsWith('medium') ? 2 : 1}px solid ${st.bb.split(' ')[1]}` : ''].filter(Boolean).join(';');
      html += `<td${sp ? ` rowspan="${sp[0]}" colspan="${sp[1]}"` : ''} style="${css}">${esc(f.text)}</td>`;
    }
    html += '</tr>';
  }
  return h('div.mini-wrap' + (o.big ? '.mbig' : ''), { html: html + '</table>' });
}
