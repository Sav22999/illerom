/** The side panel of the editor: elements to insert, format of what is selected, page, style, images. */
import { btn, colorField, dialog, fail, field, h, icon, iconBtn, mobile, num, PASTEL, put, range, row, sec, segmented, select, tile, toggle } from './ui.js';
import { t } from './i18n.js';
import { api } from './store.js';
import { FONTS, fontStack, LOOKS, SIZES } from './settings.js';
import { fontDialog, fontOptions, withFont } from './fonts.js';
import { cleanObject, CHARTS, CHART_ICONS, FLOWS, FLOW_ICONS, ICON_NAMES, RULES, SHAPES } from './objects.js';
import { ICON_PATHS } from './icons-lib.js';
import { shapePath, toSvgPath } from './shapes.js';
import { pickFile } from './actions.js';

const NS = 'http://www.w3.org/2000/svg';
function svgOf(inner, box, stroke) { const v = document.createElementNS(NS, 'svg'); v.setAttribute('viewBox', box); v.setAttribute('class', stroke ? 'drawn line' : 'drawn'); v.innerHTML = inner; return v; }
const shapeSvg = (s) => { const [w, hh] = /arrow|chevron|homeplate|speech|parallelogram|cloud|wave|half|trapezoid/.test(s) ? [40, 28] : s === 'rect' || s === 'round' ? [38, 28] : [30, 30]; return svgOf(`<path d="${toSvgPath(shapePath(s, w, hh, s === 'round' ? 8 : 0))}" fill-rule="evenodd"/>`, `${(w - 40) / 2 - 2} ${(hh - 34) / 2 - 2} 44 38`); };
const iconSvg = (n) => svgOf(ICON_PATHS[n], '-1 -1 26 26', true);

// ------------------------------------------------------------------ elements

export function elementsPanel(W) {
  const drag = (what) => ({ draggable: 'true', ondragstart: (e) => { e.dataTransfer.setData('text/sd-insert', what); e.dataTransfer.effectAllowed = 'copy'; } });
  const add = (what, label, body, cls = '') => tile(label, () => W.insert(what), { ...drag(what), class: 'ins-t ' + cls }, body);
  const big = (what, ic, label) => add(what, label, h('span.bigt', icon(ic), h('span', label)), 'big');
  const search = h('sav-input', { size: 'sm', type: 'search', placeholder: t('search_icons'), clearable: true });
  search.addEventListener('keydown', (e) => e.stopPropagation());
  const icons = h('div.pgrid'), drawIcons = () => { const q = search.value.trim().toLowerCase().replace(/\s+/g, '-'); put(icons, ICON_NAMES.filter((n) => !q || n.includes(q)).slice(0, q ? 60 : 24).map((n) => add('icon:' + n, n, iconSvg(n), 'sq'))); };
  search.addEventListener('input', drawIcons);
  search.addEventListener('sav-clear', drawIcons);
  drawIcons();
  return h('div', h('p.muted.hint', t(mobile() ? 'tap_insert' : 'drag_insert')),
    sec(t('p_media'), h('div.pmedia', big('image', 'image', t('i_image')), big('search', 'images', t('img_free')), big('drawing', 'pen-line', t('i_drawing')))),
    sec(t('p_tables'), h('div.pmedia', big('table', 'table', t('i_table')), big('cols:2', 'columns-2', t('i_cols2')), big('cols:3', 'columns-3', t('i_cols3')))),
    sec(t('p_charts'), h('div.pmedia', CHARTS.map((c) => big('chart:' + c, CHART_ICONS[c], t('ct_' + c))))),
    sec(t('p_flows'), h('div.pmedia', FLOWS.map((c) => big('flow:' + c, FLOW_ICONS[c], t('fl_' + c))))),
    sec(t('p_rules'), h('div.prules', RULES.map((r) => add('hr:' + r, t('hr_' + (r || 'thin')), h('div.doc.rulep', h('hr' + (r ? '.' + r : ''))), 'rule')))),
    sec(t('p_index'), h('div.pmedia', big('toc', 'list-tree', t('i_toc')), big('tocf', 'captions', t('i_tocf')), big('note', 'footprints', t('i_note')), big('link', 'link', t('i_link')), big('date', 'calendar', t('i_date')), big('pb', 'separator-horizontal', t('i_pb')))),
    sec(t('p_boxes'), h('div.pmedia', big('callout:info', 'info', t('call_info')), big('callout:tip', 'lightbulb', t('call_tip')), big('callout:warn', 'triangle-alert', t('call_warn')), big('quote', 'quote', t('s_blockquote')), big('code', 'square-code', t('s_pre')), big('math', 'sigma', t('i_math')), big('qr', 'qr-code', t('i_qr')), big('sign', 'signature', t('i_sign')), big('chars', 'omega', t('i_chars')))),
    sec(t('p_lines'), h('div.pgrid', [['line', 'minus'], ['line-end', 'move-right'], ['line-both', 'move-horizontal']].map(([s, ic]) => add('shape:' + s, t('sh_' + s), icon(ic), 'sq')))),
    sec(t('p_shapes'), h('div.pgrid', SHAPES.filter((s) => s !== 'line').map((s) => add('shape:' + s, s, shapeSvg(s), 'sq')))),
    sec(t('p_icons'), search, icons));
}

// ------------------------------------------------------------------ format

/** Cells of a chart as fields; a block copied from a spreadsheet can be pasted. */
function dataGrid(rows, onchange) {
  const box = h('div.dgrid');
  const draw_ = () => {
    const nc = Math.max(...rows.map((r) => r.length));
    box.style.setProperty('--n', nc);
    put(box, rows.flatMap((r, y) => Array.from({ length: nc }, (_, x) => {
      const f = h('sav-input' + (!y ? '.th' : ''), { size: 'sm', value: r[x] ?? '', maxlength: 60, 'aria-label': `${y + 1}, ${x + 1}` });
      f.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') box.children[(y + 1) * nc + x]?.focus?.(); });
      f.addEventListener('input', () => { rows[y][x] = f.value; onchange(rows); });
      f.addEventListener('paste', (e) => {
        const txt = e.clipboardData?.getData('text/plain') || '';
        if (!/\t|\n./.test(txt.trim())) return;
        e.preventDefault(); e.stopPropagation();
        txt.trim().split(/\r?\n/).forEach((l, i) => l.split('\t').forEach((v, k) => { const yy = y + i, xx = x + k; if (yy > 40 || xx > 8) return; while (rows.length <= yy) rows.push(Array(nc).fill('')); rows[yy][xx] = v.trim(); }));
        const w = Math.min(9, Math.max(...rows.map((q) => q.length)));
        rows.forEach((q) => { while (q.length < w) q.push(''); });
        draw_(); onchange(rows);
      });
      return f;
    })));
  };
  draw_();
  const sm = { size: 'sm' };
  const csv = async () => { const [file] = await pickFile('.csv,.tsv,.txt'); if (!file) return; const txt = (await file.text()).replace(/^﻿/, '').trim(), sep = ['\t', ';', ','].find((x) => txt.split('\n')[0].includes(x)) || ','; rows.splice(0, rows.length, ...txt.split(/\r?\n/).slice(0, 41).map((l) => l.split(sep).slice(0, 9).map((x) => x.trim().replace(/^"|"$/g, '')))); const w = Math.max(...rows.map((q) => q.length)); rows.forEach((q) => { while (q.length < w) q.push(''); }); draw_(); onchange(rows); };
  return h('div.stack', box, h('div.prow.wrap', btn(t('row'), { ...sm, icon: 'plus', onclick: () => { if (rows.length > 40) return; rows.push(rows[0].map(() => '')); draw_(); onchange(rows); } }), btn(t('column'), { ...sm, icon: 'plus', onclick: () => { if (rows[0].length > 8) return; rows.forEach((r) => r.push('')); draw_(); onchange(rows); } }), btn(t('row'), { ...sm, icon: 'minus', onclick: () => { if (rows.length < 3) return; rows.pop(); draw_(); onchange(rows); } }), btn(t('column'), { ...sm, icon: 'minus', onclick: () => { if (rows[0].length < 3) return; rows.forEach((r) => r.pop()); draw_(); onchange(rows); } })), btn(t('csv'), { ...sm, icon: 'file-up', block: true, onclick: csv }), h('p.muted.hint', t('paste_cells')));
}
const numOf = (v) => { const x = String(v ?? '').replace(/\s/g, ''); return parseFloat(/,\d+$/.test(x) ? x.replace(/\./g, '').replace(',', '.') : x) || 0; };

/** Width, place and caption of a picture or an object. */
function placeFields(W, f) {
  const { ed } = W, box = f.closest('.beside');
  const set = (fn) => { fn(); ed.quiet(() => ed.decorate()); ed.dirty.add(ed.topOf(f)); ed.later(); ed.soon(250); };
  return sec(t('position'),
    range(t('width'), +f.dataset.w || 100, 5, box ? 70 : 100, 1, (v) => set(() => { f.dataset.w = v; }), '%'),
    box ? null : segmented(t('align'), f.dataset.a || 'c', [['l', 'text-align-start', t('left')], ['c', 'text-align-center', t('center')], ['r', 'text-align-end', t('right')]], (v) => set(() => { f.dataset.a = v; })),
    select(t('text_around'), [['', t('img_alone')], ['l', t('img_beside_l')], ['r', t('img_beside_r')]], box ? box.dataset.k : '', (v) => { ed.besideFigure(f, v || null); ed.select(f.isConnected ? f : null); }),
    btn(t('delete'), { size: 'sm', icon: 'trash', variant: 'danger', onclick: () => ed.removeSelected() }));
}

function objectFields(W, f) {
  const { ed } = W;
  let o = cleanObject(f.dataset.o);
  const set = (p) => { o = cleanObject({ ...o, ...p }); ed.setObject(f, o); }, accent = ed.settings.accent;
  const color = (label = t('color_one')) => colorField(label, o.c || accent, (v) => set({ c: v }), { none: t('accent_doc') });
  const height = (a, b) => range(t('height'), Math.round(o.r * 100), a, b, 1, (v) => set({ r: v / 100 }), '%');
  if (o.k === 'chart') {
    const rows = [['', ...o.s.map((s) => s.n)], ...Array.from({ length: Math.max(o.l.length, ...o.s.map((s) => s.v.length), 1) }, (_, i) => [o.l[i] ?? '', ...o.s.map((s) => String(s.v[i] ?? ''))])];
    const commit = (r) => set({ l: r.slice(1).map((x) => x[0]), s: r[0].slice(1).map((n, k) => ({ n, v: r.slice(1).map((x) => numOf(x[k + 1])) })) });
    return [sec(t('chart'), select(t('kind'), CHARTS.map((c) => [c, t('ct_' + c)]), o.t, (v) => set({ t: v })), field(t('chart_title'), o.x, (v) => set({ x: v }), { live: true, maxlength: 120 })), sec(t('data'), dataGrid(rows, commit)), sec(t('look'), toggle(t('legend'), o.g, (v) => set({ g: v ? 1 : 0 })), toggle(t('values'), o.v, (v) => set({ v: v ? 1 : 0 })), color(), height(15, 120))];
  }
  if (o.k === 'flow') {
    const list = h('div.stack'), items = [...o.i];
    const paint = () => put(list, items.map((x, i) => h('div.prow', field(null, x, (v) => { items[i] = v; set({ i: items }); }, { live: true, maxlength: 120, 'aria-label': `${t('step')} ${i + 1}`, class: 'grow' }), iconBtn('x', t('remove'), () => { if (items.length < 2) return; items.splice(i, 1); set({ i: items }); paint(); }))), items.length < 10 ? btn(t('add'), { size: 'sm', icon: 'plus', onclick: () => { items.push(`${t('step')} ${items.length + 1}`); set({ i: items }); paint(); } }) : null);
    paint();
    return [sec(t('diagram'), select(t('kind'), FLOWS.map((c) => [c, t('fl_' + c)]), o.t, (v) => set({ t: v, r: { process: 0.2, cycle: 0.62, pyramid: 0.55, timeline: 0.26, steps: 0.4, list: 0.42 }[v] }))), sec(t('steps'), list), sec(t('look'), color(), height(8, 120))];
  }
  if (o.k === 'shape') {
    const line = o.s === 'line';
    return [sec(line ? t('line') : t('shape'), line ? select(t('ends'), [['', t('none')], ['end', t('sh_line-end')], ['both', t('sh_line-both')]], o.h, (v) => set({ h: v })) : h('div.pgrid', SHAPES.filter((s) => s !== 'line').map((s) => tile(s, () => set({ s }), { class: 'ins-t sq' }, shapeSvg(s))))),
      line ? null : sec(t('text'), h('sav-textarea', { label: t('text'), rows: 2, size: 'sm', value: o.x, maxlength: 300, oninput: (e) => set({ x: e.currentTarget.value }), onkeydown: (e) => e.stopPropagation() }), row(num(t('size'), o.ts, (v) => set({ ts: v }), { min: 6, max: 90 }), colorField(t('color'), o.tc, (v) => set({ tc: v }), { none: t('automatic') }))),
      sec(t('look'), row(line ? null : colorField(t('fill'), o.f === 'none' ? '' : o.f || accent, (v) => set({ f: v || 'none' }), { none: t('none') }), colorField(t('border'), o.b, (v) => set({ b: v }), { none: t('automatic') })), num(t('thickness'), o.w, (v) => set({ w: v }), { min: 0, max: 20 }), toggle(t('dashed'), o.d, (v) => set({ d: v ? 1 : 0 })), height(line ? 2 : 10, line ? 30 : 160))];
  }
  if (o.k === 'icon') {
    const q = h('sav-input', { size: 'sm', type: 'search', placeholder: t('search_icons'), clearable: true, onkeydown: (e) => e.stopPropagation() }), g = h('div.pgrid'), paint = () => { const w = q.value.trim().toLowerCase(); put(g, ICON_NAMES.filter((n) => !w || n.includes(w)).slice(0, 30).map((n) => tile(n, () => set({ n }), { class: 'ins-t sq' }, iconSvg(n)))); };
    q.addEventListener('input', paint); paint();
    return [sec(t('icon'), q, g), sec(t('look'), color(), num(t('thickness'), o.w, (v) => set({ w: v }), { min: 0.5, max: 4, step: 0.25 }))];
  }
  if (o.k === 'qr') return [sec(t('i_qr'), h('sav-textarea', { label: t('qr_text'), rows: 3, size: 'sm', value: o.x, maxlength: 350, oninput: (e) => set({ x: e.currentTarget.value }), onkeydown: (e) => e.stopPropagation() }), colorField(t('color'), o.c || ed.settings.color, (v) => set({ c: v }), { none: t('automatic') }))];
  return [sec(t('i_sign'), field(t('name'), o.x, (v) => set({ x: v }), { live: true, maxlength: 120 }), field(t('under_name'), o.d, (v) => set({ d: v }), { live: true, maxlength: 120 }))];
}

export function formatPanel(W) {
  const { ed } = W, st = ed.state(), f = st.sel;
  if (f?.matches('figure')) {
    if (f.dataset.o) return h('div', objectFields(W, f), placeFields(W, f));
    const img = f.querySelector('img');
    return h('div', sec(t('i_image'), field(t('img_alt'), img.alt, (v) => { img.alt = v; ed.dirty.add(ed.topOf(f)); ed.scan(); }, { maxlength: 500 }), btn(t('img_replace'), { size: 'sm', icon: 'replace', block: true, onclick: () => W.replaceImage(f) })), placeFields(W, f));
  }
  if (f?.matches('hr')) return h('div', sec(t('p_rules'), h('div.prules', RULES.map((r) => tile(t('hr_' + (r || 'thin')), () => { f.className = (r ? r + ' ' : '') + 'sel'; ed.dirty.add(f); ed.scan(); }, { class: 'ins-t rule' }, h('div.doc.rulep', h('hr' + (r ? '.' + r : '')))))), btn(t('delete'), { size: 'sm', icon: 'trash', variant: 'danger', onclick: () => ed.removeSelected() })));
  if (f?.matches('.toc')) return h('div', sec(t('i_toc'), select(t('kind'), [['', t('toc_heads')], ['f', t('i_tocf')]], f.dataset.k || '', (v) => { if (v) f.dataset.k = v; else f.removeAttribute('data-k'); ed.dirty.add(f); ed.scan(); ed.quiet(() => ed.decorate()); }), f.dataset.k ? null : segmented(t('levels'), f.dataset.l || '3', [['1', '=1', '1'], ['2', '=2', '2'], ['3', '=3', '3']], (v) => { f.dataset.l = v; ed.dirty.add(f); ed.scan(); ed.quiet(() => ed.decorate()); ed.later(); }, { show: true }), btn(t('delete'), { size: 'sm', icon: 'trash', variant: 'danger', onclick: () => ed.removeSelected() })));
  if (f) return h('div', sec('', btn(t('delete'), { size: 'sm', icon: 'trash', variant: 'danger', onclick: () => ed.removeSelected() })));
  const b = st.block, kids = [];
  if (st.cell) {
    const tb = st.cell.closest('table'), c = (k, ic) => iconBtn(ic, t('t_' + k), () => W.act(() => ed.table(k)), { appearance: 'outline' });
    kids.push(sec(t('i_table'), select(t('t_style'), [['', t('t_grid')], ['plain', t('t_plain')], ['striped', t('t_striped')], ['bare', t('t_bare')]], (tb.className.match(/plain|striped|bare/) || [''])[0], (v) => W.act(() => ed.table('style', v))),
      row(toggle(t('t_header'), [...tb.querySelector('tr').children].every((x) => x.localName === 'th'), () => W.act(() => ed.table('header')))), row(toggle(t('t_headcol'), tb.matches('.headcol'), () => W.act(() => ed.table('headcol')))),
      h('span.flabel', t('t_rows')), h('div.prow', c('rowAbove', 'arrow-up'), c('rowBelow', 'arrow-down'), c('delRow', 'trash')), h('span.flabel', t('t_cols')), h('div.prow', c('colLeft', 'arrow-left'), c('colRight', 'arrow-right'), c('even', 'ruler'), c('delCol', 'trash')),
      h('span.flabel', t('t_cells')), h('div.prow', c('merge', 'merge'), c('split', 'split'), iconBtn('arrow-down-a-z', t('sort_az'), () => W.act(() => ed.sort(1)), { appearance: 'outline' }), iconBtn('arrow-up-a-z', t('sort_za'), () => W.act(() => ed.sort(-1)), { appearance: 'outline' }), iconBtn('sigma', t('t_sum'), () => W.act(() => ed.sumColumn()), { appearance: 'outline' })),
      row(colorField(t('t_fill'), st.cell.style.backgroundColor, (v) => W.act(() => ed.table('fill', v)), { list: PASTEL, none: t('none') }), select(t('t_valign'), [['', t('automatic')], ['top', t('top')], ['middle', t('center')], ['bottom', t('bottom')]], st.cell.style.verticalAlign, (v) => W.act(() => ed.table('valign', v)))),
      btn(t('t_drop'), { size: 'sm', icon: 'trash', variant: 'danger', onclick: () => W.act(() => ed.table('drop')) })));
  }
  const s = b?.style || {}, para = (k) => (v) => W.act(() => ed.paragraph({ [k]: v }));
  kids.push(sec(t('paragraph_l'), segmented(t('align'), st.align, [['left', 'text-align-start', t('left')], ['center', 'text-align-center', t('center')], ['right', 'text-align-end', t('right')], ['justify', 'text-align-justify', t('justify')]], (v) => W.act(() => ed.align(v))),
    row(num(t('line_height'), s.lineHeight || '', (v) => para('line-height')(v === '' ? '' : Math.min(5, v)), { step: 0.05, min: 0.8, max: 5, empty: true, placeholder: String(ed.settings.line) }), num(t('first_line'), parseFloat(s.textIndent) || '', (v) => para('text-indent')(v ? Math.min(100, v) + 'pt' : ''), { min: 0, max: 100, unit: 'pt', empty: true, placeholder: '0' })),
    row(num(t('before'), s.marginTop ? parseFloat(s.marginTop) : '', (v) => para('margin-top')(v === '' ? '' : Math.min(200, v) + 'pt'), { min: 0, max: 200, unit: 'pt', empty: true, placeholder: '–' }), num(t('after'), s.marginBottom ? parseFloat(s.marginBottom) : '', (v) => para('margin-bottom')(v === '' ? '' : Math.min(200, v) + 'pt'), { min: 0, max: 200, unit: 'pt', empty: true, placeholder: String(ed.settings.gap) })),
    row(colorField(t('background'), s.backgroundColor, (v) => para('background-color')(v), { list: PASTEL, none: t('none') }), h('div.cf', h('span.flabel', t('s_drop')), toggle('', b?.matches('.drop'), () => W.act(() => ed.block('drop')))))),
  sec(t('text'), select(t('spacing_l'), [['', t('normal')], ['-0.5pt', t('tight')], ['0.5pt', t('wide1')], ['1pt', t('wide2')], ['2pt', t('wide3')]], '', (v) => W.act(() => ed.textStyle('letter-spacing', v))),
    h('div.prow.wrap', iconBtn('case-upper', t('case_upper'), () => W.act(() => ed.changeCase('upper')), { appearance: 'outline' }), iconBtn('case-lower', t('case_lower'), () => W.act(() => ed.changeCase('lower')), { appearance: 'outline' }), iconBtn('case-sensitive', t('case_title'), () => W.act(() => ed.changeCase('title')), { appearance: 'outline' }), iconBtn('letter-text', t('case_sentence'), () => W.act(() => ed.changeCase('sentence')), { appearance: 'outline' }), iconBtn('a-large-small', t('small_caps'), () => W.act(() => ed.textStyle('font-variant', 'small-caps')), { appearance: 'outline' }), iconBtn('superscript', t('sup'), () => W.act(() => ed.inline('superscript')), { appearance: 'outline' }), iconBtn('subscript', t('sub'), () => W.act(() => ed.inline('subscript')), { appearance: 'outline' }), iconBtn('code', t('code'), () => W.act(() => ed.inline('code')), { appearance: 'outline' })),
    h('p.muted.hint', t('select_first'))),
  sec(t('tools'), h('div.prow.wrap', btn(t('sort_az'), { size: 'sm', icon: 'arrow-down-a-z', onclick: () => W.act(() => ed.sort(1)) }), btn(t('to_table'), { size: 'sm', icon: 'table', onclick: () => W.act(() => ed.toTable()) }))));
  return h('div', kids);
}

// ------------------------------------------------------------------ page and style: used for a document and for the defaults of new ones

export function pageForm(s, up) {
  const custom = h('div', row(num(t('width'), s.w, (v) => up({ w: v }), { min: 50, max: 600, unit: 'mm' }), num(t('height'), s.h, (v) => up({ h: v }), { min: 50, max: 600, unit: 'mm' })));
  custom.hidden = s.size !== 'custom';
  const m = { mt: num(t('top'), s.mt, (v) => up({ mt: v }), { min: 0, max: 100, unit: 'mm', step: 0.5 }), mb: num(t('bottom'), s.mb, (v) => up({ mb: v }), { min: 0, max: 100, unit: 'mm', step: 0.5 }), ml: num(t('left'), s.ml, (v) => up({ ml: v }), { min: 0, max: 100, unit: 'mm', step: 0.5 }), mr: num(t('right'), s.mr, (v) => up({ mr: v }), { min: 0, max: 100, unit: 'mm', step: 0.5 }) };
  const preset = (a, b) => { up({ mt: a, mb: a, ml: b, mr: b }); for (const k in m) m[k].value = k === 'mt' || k === 'mb' ? a : b; };
  let last = null;
  const band = (kind) => h('div.stack', h('span.flabel', t('band_' + kind)), ['l', 'c', 'r'].map((z) => { const x = field(null, s[kind][z], (v) => { up({ [kind]: { ...s[kind], [z]: v } }); }, { live: true, maxlength: 120, placeholder: t({ l: 'left', c: 'center', r: 'right' }[z]), 'aria-label': `${t('band_' + kind)} ${t({ l: 'left', c: 'center', r: 'right' }[z])}`, 'data-band': kind + '-' + z }); x.addEventListener('focusin', () => { last = [x, kind, z]; }); return x; }));
  const box = h('div', sec(t('o_page'), select(t('o_size'), [...Object.entries(SIZES).map(([k, [a, b]]) => [k, `${k} · ${a} × ${b} mm`]), ['custom', t('custom')]], s.size, (v) => { custom.hidden = v !== 'custom'; up({ size: v }); }), custom,
    segmented(t('o_orient'), s.landscape ? '1' : '0', [['0', '=' + t('portrait'), t('portrait')], ['1', '=' + t('landscape'), t('landscape')]], (v) => up({ landscape: v === '1' }), { show: true })),
  sec(t('margins'), h('div.prow.wrap', btn(t('m_normal'), { size: 'sm', onclick: () => preset(25, 25) }), btn(t('m_narrow'), { size: 'sm', onclick: () => preset(13, 13) }), btn(t('m_wide'), { size: 'sm', onclick: () => preset(25, 50) })), row(m.mt, m.mb), row(m.ml, m.mr), h('p.muted.hint', t('margins_hint'))),
  sec(t('background'), row(colorField(t('page_color'), s.bg === '#ffffff' ? '' : s.bg, (v) => up({ bg: v || '#ffffff' }), { list: ['#ffffff', '#fdf8ef', '#fffafc', '#f5f9ff', '#f3faf5', '#fffdf0', '#f4f4f4', '#f7f2ff'], none: t('white') }), colorField(t('border'), s.borderColor, (v) => up({ borderColor: v || s.accent }))), select(t('page_border'), [['', t('none')], ['thin', t('b_thin')], ['thick', t('b_thick')], ['double', t('b_double')], ['dashed', t('dashed')]], s.border, (v) => up({ border: v })), field(t('watermark'), s.mark, (v) => up({ mark: v }), { live: true, maxlength: 40, placeholder: t('watermark_ph') })),
  Object.assign(sec(t('o_bands'), h('p.muted.hint', t('band_dbl')), band('header'), band('footer'), h('div.prow.wrap', ['page', 'pages', 'title', 'date'].map((k) => btn(t('f_' + k), { size: 'sm', icon: 'plus', onclick: () => { const [x, kind, z] = last || [null, 'footer', 'c']; const v = (s[kind][z] + (s[kind][z] && !s[kind][z].endsWith(' ') ? ' ' : '') + `{${k}}`).slice(0, 120); up({ [kind]: { ...s[kind], [z]: v } }); if (x) x.value = v; } }))), toggle(t('first_page'), s.firstPage, (v) => up({ firstPage: v })), toggle(t('band_line'), s.bandLine, (v) => up({ bandLine: v })), num(t('start_page'), s.startPage, (v) => up({ startPage: Math.round(v) }), { min: 0, max: 9999 })), { className: 'psec bands' }));
  // the rulers change the margins too
  box.refresh = (n) => { for (const k in m) if (+m[k].value !== n[k]) m[k].value = n[k]; };
  return box;
}

export function styleForm(s, up) {
  const box = h('div');
  // "More typefaces…" opens the typefaces (included, Bunny Fonts, from file); the chosen one goes into the list of the document
  const fontSel = (label, k) => select(label, fontOptions(s.fonts), s[k], (v) => { if (v !== '__more') return up({ [k]: v }); paint(); fontDialog({ current: s[k], used: s.fonts, onpick: (f) => { up({ [k]: f.n, fonts: withFont(s.fonts, f) }); paint(); } }); }, { searchable: true });
  const paint = () => put(box,
    sec(t('look'), h('div.looks', Object.entries(LOOKS).map(([k, l]) => tile(t('look_' + k), () => { up({ ...l }); paint(); }, { class: 'lookt', style: `--lbg:${l.bg}` }, h('b', { style: `font-family:${fontStack(l.headFont)};color:${l.headColor}` }, 'Aa'), h('i', { style: `background:${l.accent}` }), h('span', { style: `font-family:${fontStack(l.font)};color:${l.color}` }, t('look_' + k)))))),
    sec(t('fonts'), fontSel(t('body_font'), 'font'), fontSel(t('head_font'), 'headFont'), row(num(t('size'), s.fontSize, (v) => up({ fontSize: v }), { min: 6, max: 40, step: 0.5, unit: 'pt' }), num(t('line_height'), s.line, (v) => up({ line: v }), { min: 1, max: 3, step: 0.05 })), num(t('gap'), s.gap, (v) => up({ gap: v }), { min: 0, max: 40, unit: 'pt' })),
    sec(t('colors'), row(colorField(t('color'), s.color, (v) => up({ color: v || '#1c1c1c' })), colorField(t('head_color'), s.headColor, (v) => up({ headColor: v || '#1c1c1c' })), colorField(t('accent'), s.accent, (v) => up({ accent: v || '#0f6e56' }))), h('p.muted.hint', t('accent_hint'))),
    sec(t('text'), toggle(t('justify_all'), s.justify, (v) => up({ justify: v })), toggle(t('numbered'), s.numbered, (v) => up({ numbered: v })), toggle(t('cap_num'), s.capNum, (v) => up({ capNum: v })), select(t('doc_lang'), [['it', 'Italiano'], ['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español'], ['pt', 'Português'], ['nl', 'Nederlands'], ['pl', 'Polski'], ['ro', 'Română']], s.lang, (v) => up({ lang: v }))));
  paint();
  return box;
}

// ------------------------------------------------------------------ images

/** Search of free pictures: onpick(id of the picture, now in the document, title, credit). */
function searchPictures(W, onpick) {
  const q = h('sav-input', { placeholder: t('img_q'), type: 'search', size: 'sm', clearable: true, autofocus: true }, icon('search', { slot: 'prefix' })), res = h('div.imgs'), credit = h('sav-checkbox', { checked: true }, t('img_credit')), more = h('div');
  let page = 1, busy = false;
  const find = async (next) => {
    if (busy || q.value.trim().length < 2) return;
    busy = true;
    page = next ? page + 1 : 1;
    if (!next) put(res, h('sav-spinner'));
    try {
      const r = await api('img.search', undefined, { q: q.value.trim(), page });
      if (!next) put(res, r.images.length ? null : h('p.muted', t('no_match')));
      for (const x of r.images) {
        const card = tile(`${x.title} — ${x.author} (${x.license})`, async () => {
          if (card.classList.contains('busy')) return;
          card.classList.add('busy');
          try { onpick(await W.store.importImage(x.src), x.title, credit.checked ? `${x.title}${x.author ? ', ' + x.author : ''} (${x.license}, ${x.from})` : ''); } catch (e) { fail(e); } finally { card.classList.remove('busy'); }
        }, { class: 'imgt' }, h('img', { src: x.thumb, loading: 'lazy', alt: x.title, referrerpolicy: 'no-referrer', onerror: (e) => e.currentTarget.closest('sav-card').remove() }), h('small', x.license));
        res.append(card);
      }
      put(more, r.images.length ? btn(t('load_more'), { size: 'sm', block: true, onclick: () => find(true) }) : null);
    } catch (e) { put(res, h('p.muted', t('err_network'))); fail(e); } finally { busy = false; }
  };
  q.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') find(); });
  let deb = 0;
  q.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => find(), 650); });
  return h('div.stack', h('div.prow', h('div.grow', q), iconBtn('search', t('search'), () => find(), { appearance: 'outline' })), credit, res, more, h('p.muted.hint', t('img_from')));
}

/** The pictures of my documents, to use one again: onpick(id of the copy in this document). */
function myPictures(W, onpick) {
  const grid = h('div.imgs.mine', h('sav-spinner'));
  api('img.mine').then((r) => {
    put(grid, r.images.length ? r.images.map((x) => { const card = tile(x.doc, async () => { if (card.classList.contains('busy')) return; card.classList.add('busy'); try { onpick(await W.store.copyImage(x.id)); } catch (e) { fail(e); } finally { card.classList.remove('busy'); } }, { class: 'imgt', title: x.doc }, h('img', { src: W.store.imageUrl(x.id), loading: 'lazy', alt: '', onerror: (e) => e.currentTarget.closest('sav-card').remove() }), h('small', x.doc)); return card; }) : h('sav-empty-state', { icon: 'images', heading: t('img_mine_none'), text: t('img_mine_none_t') }));
  }).catch((e) => { put(grid, h('p.muted', t('err_network'))); fail(e); });
  return grid;
}

/** The picture shortcut, as in SavPresentations: search, my pictures, from this device. */
export function imageDialog(W) {
  let d = null;
  const put1 = (id, alt = '', credit = '') => { d?.hide(); W.act(() => W.ed.insertImage(id, alt, credit)); };
  const body = W.store.remote ? h('sav-tabs.imgtabs', { appearance: 'segmented' }, h('sav-tab', { label: t('img_web'), icon: 'search' }, searchPictures(W, put1)), h('sav-tab', { label: t('img_mine'), icon: 'images' }, myPictures(W, (id) => put1(id)))) : h('p.muted', t('img_account'));
  d = dialog({ title: t('img_choose'), width: '46rem', body: [body, h('p.muted.hint', t('img_note'))], actions: [{ label: t('img_upload'), icon: 'upload', run: async () => { const f = await pickFile('image/*', true); if (!f?.length) return false; W.addFiles(f); return undefined; } }] });
  return d;
}

export function imagesPanel(W) {
  const drop = h('sav-dropzone', { label: t('img_drop'), accept: 'image/*', multiple: true });
  drop.addEventListener('change', () => { const list = [...(drop.files || [])].filter((f) => f.type.startsWith('image/')); if (list.length) { W.addFiles(list); drop.clear?.(); } });
  if (!W.store.remote) return h('div', sec(t('img_upload'), drop), h('p.muted.hint', t('img_account')), h('p.muted.hint', t('img_note')));
  const at = (id, alt, credit) => W.act(() => W.ed.insertImage(id, alt, credit));
  return h('div', sec(t('img_upload'), drop), sec(t('img_search'), searchPictures(W, at)), sec(t('img_mine'), myPictures(W, (id) => at(id, '', ''))), h('p.muted.hint', t('img_note')));
}
