/**
 * Printing and PDF: the sheet as a table with the look of its cells, in a part of the page shown only when printing.
 * The window of the browser prints it, or saves it as PDF. What is printed: the selection (when there is one), the
 * sheet, or the whole workbook.
 */
import { dialog, h, select } from './ui.js';
import { t } from './i18n.js';
import { colName, FONT_STACK, key, parseRange, extent, styleAt } from './model.js';
import { formatValue, loc } from './format.js';
import { chartData, chartSVG } from './chart.js';
import { pageArea, pagePrefs, PAPERS, setPagePrefs } from './tools.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/\n/g, '<br>');

/** The cells of a sheet (or of a part of it) as an HTML table. */
export function sheetTable(b, s, g, o = {}) {
  const L = loc(b.settings.lang), ext = extent(s);
  g ||= { r1: 1, c1: 1, r2: Math.max(1, ext.r), c2: Math.max(1, ext.c) };
  const covered = new Set(), span = new Map();
  for (const m of s.merges) { const q = parseRange(m); if (!q) continue; span.set(key(q.r1, q.c1), [Math.min(q.r2, g.r2) - q.r1 + 1, Math.min(q.c2, g.c2) - q.c1 + 1]); for (let r = q.r1; r <= q.r2; r++) for (let c = q.c1; c <= q.c2; c++) if (r !== q.r1 || c !== q.c1) covered.add(key(r, c)); }
  const cols = [];
  for (let c = g.c1; c <= g.c2; c++) if (!s.cols[colName(c)]?.x) cols.push(c);
  let html = `<table class="ptable${s.grid === false || o.noGrid ? ' nogrid' : ''}"><colgroup>${cols.map((c) => `<col style="width:${s.cols[colName(c)]?.w || 100}px">`).join('')}</colgroup>`;
  for (let r = g.r1; r <= g.r2; r++) {
    if (s.rows[r]?.x) continue;
    html += `<tr style="height:${s.rows[r]?.h || 24}px">`;
    for (const c of cols) {
      const k = key(r, c);
      if (covered.has(k)) continue;
      const cell = s.cells[k], st = styleAt(s, r, c, cell), v = b.value(s, k), f = v === null ? { text: '' } : formatValue(v, st.nf, L), sp = span.get(k);
      const bd = ['bt', 'br', 'bb', 'bl'].filter((x) => st[x]).map((x) => { const [kind, col] = st[x].split(' '); return `border-${{ bt: 'top', br: 'right', bb: 'bottom', bl: 'left' }[x]}:${kind === 'medium' ? 2 : kind === 'thick' || kind === 'double' ? 3 : 1}px ${kind === 'dashed' ? 'dashed' : kind === 'dotted' ? 'dotted' : kind === 'double' ? 'double' : 'solid'} ${col}`; });
      const css = [st.b ? 'font-weight:700' : '', st.i ? 'font-style:italic' : '', st.u || st.k ? `text-decoration:${st.u ? 'underline' : ''} ${st.k ? 'line-through' : ''}` : '', f.color || st.c ? `color:${f.color || st.c}` : '', st.bg ? `background:${st.bg}` : '', `text-align:${st.ha === 'c' ? 'center' : st.ha === 'r' || (!st.ha && (typeof v === 'number')) ? 'right' : st.ha === 'l' ? 'left' : typeof v === 'boolean' ? 'center' : 'left'}`, `vertical-align:${st.va === 't' ? 'top' : st.va === 'm' ? 'middle' : 'bottom'}`, st.fz ? `font-size:${st.fz}pt` : '', st.ff ? `font-family:${FONT_STACK[st.ff]}` : '', st.w ? 'white-space:pre-wrap' : 'white-space:pre', ...bd].filter(Boolean).join(';');
      html += `<td${sp ? ` rowspan="${sp[0]}" colspan="${sp[1]}"` : ''} style="${css}">${esc(f.text)}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  if (o.charts !== false) for (const ch of s.charts) html += `<div class="pchart">${chartSVG(ch, chartData(ch, (r, c) => b.value(s, key(r, c)), (r, c) => b.text(s, r, c)), ch.w, ch.h)}</div>`;
  return html;
}

/** onPrefs: told when the page chosen changes (the guides on the sheet follow it). */
export function printBook(b, sh, sel, onPrefs) {
  const pp = pagePrefs();
  const one = sel && (sel.r1 !== sel.r2 || sel.c1 !== sel.c2) && sel.r2 < 100000 && sel.c2 < 702;
  const what = select(t('print_what'), [...(one ? [['sel', t('print_sel')]] : []), ['sheet', t('print_sheet')], ['all', t('print_all')]], one ? 'sel' : 'sheet', null, { size: 'sm' });
  const keep = () => { setPagePrefs({ paper: paper.value, orient: orient.value, fit: fit.value, guides: !!guides.checked }); onPrefs?.(); };
  const paper = select(t('paper'), Object.keys(PAPERS).map((k) => [k, t('paper_' + k.toLowerCase())]), pp.paper, keep, { size: 'sm' });
  const orient = select(t('o_orient'), [['portrait', t('portrait')], ['landscape', t('landscape')]], pp.orient, keep, { size: 'sm' });
  const fit = select(t('print_fit'), [['width', t('fit_width')], ['none', t('fit_none')]], pp.fit, keep, { size: 'sm' });
  const grid = h('sav-switch', { size: 'sm', checked: true }, t('print_grid'));
  const guides = h('sav-switch', { size: 'sm', checked: pp.guides || null, help: t('page_guides_t') }, t('page_guides'));
  guides.addEventListener('change', keep);
  dialog({ title: t('print'), width: '26rem', body: h('div.form', what, paper, h('div.grid2', orient, fit), grid, guides, h('p.muted.small', t('pdf_hint'))), actions: [{ label: t('cancel') }, { label: t('print'), primary: true, icon: 'printer', run: () => {
    keep();
    const sheets = what.value === 'all' ? b.sheets.filter((s) => !s.hidden) : [sh];
    const box = h('div.printing-area', { html: sheets.map((s) => `<section class="psheet">${sheets.length > 1 ? `<h2>${esc(s.name)}</h2>` : ''}${sheetTable(b, s, what.value === 'sel' ? sel : null, { noGrid: !grid.checked })}</section>`).join('') });
    if (fit.value === 'width') box.classList.add('fitw');
    const st = h('style', `@page { size: ${paper.value} ${orient.value}; margin: 12mm; }`);
    document.head.append(st);
    document.body.append(box);
    document.body.classList.add('printing');
    // as wide as the page
    if (fit.value === 'width') { const pw = pageArea({ paper: paper.value, orient: orient.value }).w; for (const t2 of box.querySelectorAll('.ptable')) { const w = t2.scrollWidth; if (w > pw) t2.style.zoom = pw / w; } }
    const done = () => { box.remove(); st.remove(); document.body.classList.remove('printing'); removeEventListener('afterprint', done); };
    addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  } }] });
}
