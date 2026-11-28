/** The windows of the grid: format of the cells, conditional formats, validation, charts, sorting, functions, workbook. */
import { btn, colorPop, dialog, empty, face, h, icon, iconBtn, INKS, PASTEL, put, select, toast } from './ui.js';
import { api } from './store.js';
import { t } from './i18n.js';
import { colName, FONT_STACK, key, newId, parseRange, rangeStr, validRange } from './model.js';
import { formatValue, LOCALES } from './format.js';
import { CATS, FN, desc } from './sigs.js';
import { FUNCTIONS } from './formula.js';
import { CHART_KINDS } from './model.js';
import { chartData, chartSVG, PALETTE } from './chart.js';

const field = (label, value, o = {}) => { const i = h('sav-input', { label, value: value ?? '', size: 'sm', ...o }); i.addEventListener('keydown', (e) => e.stopPropagation()); return i; };

// ------------------------------------------------------------------ format of the cells

export function formatDialog(x, tab = 'number') {
  const s0 = x.curStyle(), s = { ...s0 }, L = x.L;
  const sample = () => { const v = x.W.eng.value(x.sh, key(x.grid.sel.r, x.grid.sel.c)); return v === null || v === '' ? -1234.5678 : v; };
  // number
  const code = field(t('nf_code'), s.nf || 'General', { help: t('nf_code_t') }), prev = h('div.nfprev');
  const showPrev = () => { const v = sample(), f = formatValue(v, code.value.trim() || 'General', L); put(prev, h('span.muted', t('nf_preview') + ' '), h('b', { style: f.color ? `color:${f.color}` : null }, f.text)); };
  code.addEventListener('input', showPrev);
  const list = h('div.nflist', x.presets.map(([k, f]) => btn(h('span.nfi', h('span', t('nf_' + k)), h('small', k === 'general' ? '' : formatValue(k === 'text' ? 'abc' : /date|time|weekday|month/.test(k) ? 45351.6 : k === 'duration' ? 1.25 : -1234.567, f, L).text)), { size: 'sm', appearance: 'ghost', onclick: () => { code.value = f; showPrev(); } })));
  showPrev();
  // alignment
  const ha = select(t('align_h'), [['', t('automatic')], ['l', t('left')], ['c', t('center')], ['r', t('right')]], s.ha || '', null, { size: 'sm' });
  const va = select(t('align_v'), [['b', t('v_bottom')], ['m', t('v_middle')], ['t', t('v_top')]], s.va || 'b', null, { size: 'sm' });
  const wrap = h('sav-switch', { size: 'sm', checked: s.w ? true : null }, t('wrap'));
  const ind = h('sav-number-input', { label: t('indent'), value: s.ind || 0, min: 0, max: 10, step: 1, size: 'sm' }), rot = h('sav-number-input', { label: t('rotation') + ' (°)', value: s.rot || 0, min: -90, max: 90, step: 15, size: 'sm' });
  // font
  const ff = select(t('font'), [['', t('of_book')], ...Object.keys(FONT_STACK).map((k) => [k, t('ff_' + k), `font-family:${FONT_STACK[k]}`])], s.ff || '', null, { size: 'sm' });
  const fz = h('sav-number-input', { label: t('size'), value: s.fz || '', min: 6, max: 72, step: 1, size: 'sm', placeholder: String(x.book.settings.fontSize || 10) });
  const sw = (k, l) => h('sav-switch', { size: 'sm', checked: s[k] ? true : null, 'data-k': k }, l);
  const flags = [sw('b', t('bold')), sw('i', t('italic')), sw('u', t('underline')), sw('k', t('strike'))];
  let col = s.c || '', bg = s.bg || '';
  const colP = colorPop(t('color'), col, (v) => { col = v; }, { none: t('automatic'), list: INKS }), bgP = colorPop(t('fill'), bg, (v) => { bg = v; }, { none: t('none'), list: [...PASTEL, '#4d7c0f', '#1d4e89', '#b3261e', '#1c1c1c'] });
  const body = h('sav-tabs', { active: tab },
    h('sav-tab', { name: 'number', label: t('ft_number') }, h('div.form', code, prev, list)),
    h('sav-tab', { name: 'align', label: t('ft_align') }, h('div.form', h('div.grid2', ha, va), wrap, h('div.grid2', ind, rot))),
    h('sav-tab', { name: 'font', label: t('ft_font') }, h('div.form', h('div.grid2', ff, fz), h('div.grid2', ...flags), h('div.grid2', h('div', h('span.flabel', t('color')), colP), h('div', h('span.flabel', t('fill')), bgP)))));
  dialog({ title: t('format_cells'), width: '34rem', body, actions: [{ label: t('cancel') }, { label: t('apply'), primary: true, run: () => {
    const p = { nf: code.value.trim() && code.value.trim() !== 'General' ? code.value.trim() : null, ha: ha.value || null, va: va.value === 'b' ? null : va.value, w: wrap.checked ? 1 : null, ind: +ind.value || null, rot: +rot.value || null, ff: ff.value || null, fz: +fz.value || null, c: col || null, bg: bg || null };
    for (const f of flags) p[f.dataset.k] = f.checked ? 1 : null;
    // only what changed: the cells keep the rest of their own look
    const diff = Object.fromEntries(Object.entries(p).filter(([k, v]) => (v ?? null) !== (s0[k] ?? null)));
    if (Object.keys(diff).length) x.styleSel(diff);
  } }] });
}

// ------------------------------------------------------------------ conditional formats

const CF = ['gt', 'lt', 'ge', 'le', 'eq', 'ne', 'between', 'text', 'empty', 'filled', 'dup', 'top', 'formula', 'scale', 'bars'];
/** The look a new rule starts with: green for "more", red for "less", yellow for the rest. */
const CF_LOOK = { gt: { bg: '#d3f3d8', c: '#14532d' }, ge: { bg: '#d3f3d8', c: '#14532d' }, lt: { bg: '#ffc9c9', c: '#9f1239' }, le: { bg: '#ffc9c9', c: '#9f1239' } };
const cfLook = (k) => ({ ...(CF_LOOK[k] || { bg: '#fff3a3', c: '#854d0e' }) });
/** quick: a kind of rule to add to the selection straight away, without the list of the rules. */
export function cfDialog(x, quick) {
  let rules = structuredClone(x.sh.cf);
  const g = x.selOf(), box = h('div.stack.cfl');
  const commit = () => x.change([{ t: 'sheet', id: x.sh.id, p: { cf: rules } }]);
  if (quick && ['dup', 'scale', 'bars'].includes(quick)) {
    rules.push({ r: rangeStr(g), k: quick, a: '', b: '', s: quick === 'dup' ? cfLook('dup') : {}, ...(quick === 'scale' ? { c1: '#f8696b', c2: '#63be7b' } : quick === 'bars' ? { c1: '#7fb55c' } : {}) });
    commit();
    toast(t('cf_added', { r: rangeStr(g) }), 'success');
    return;
  }
  const draw = () => put(box, rules.length ? rules.map((r, i) => h('div.cfrow', h('span.cfs', { style: r.k === 'scale' ? `background:linear-gradient(90deg,${r.c1 || '#f8696b'},${r.c3 || r.c2 || '#63be7b'},${r.c2 || '#63be7b'})` : r.k === 'bars' ? `background:linear-gradient(90deg,${r.c1 || '#7fb55c'} 60%,transparent 60%)` : `background:${r.s?.bg || 'transparent'};color:${r.s?.c || 'inherit'};font-weight:${r.s?.b ? 700 : 400}` }, 'Aa'), h('div.grow', h('b', t('cf_' + (r.k === 'text' ? 'text_k' : r.k)) + (r.a ? ' ' + r.a : '') + (r.k === 'between' ? ' – ' + r.b : '')), h('small.muted', r.r)), iconBtn('pencil', t('edit'), () => edit(i)), iconBtn('trash', t('delete'), () => { rules.splice(i, 1); draw(); }))) : h('p.muted', t('cf_none')));
  function edit(i, k0, direct) {
    const r = i === undefined ? { r: rangeStr(g), k: k0 || 'gt', a: '', b: '', s: cfLook(k0 || 'gt') } : structuredClone(rules[i]);
    const rg = field(t('range'), r.r), kind = select(t('cf_rule'), CF.map((k) => [k, t('cf_' + (k === 'text' ? 'text_k' : k))]), r.k, () => paint(), { size: 'sm' });
    const a = field(t('value'), r.a), b = field(t('value_2'), r.b);
    let bg = r.s?.bg || '', c = r.s?.c || '', bold = !!r.s?.b, c1 = r.c1 || '', c2 = r.c2 || '', c3 = r.c3 || '';
    const style = h('div.grid3', h('div', h('span.flabel', t('fill')), colorPop(t('fill'), bg, (v) => { bg = v; }, { none: t('none'), list: ['#d3f3d8', '#ffc9c9', '#fff3a3', '#cdeaf7', '#e3dcfb', '#ffd9b8'] })), h('div', h('span.flabel', t('color')), colorPop(t('color'), c, (v) => { c = v; }, { none: t('automatic'), list: ['#14532d', '#9f1239', '#854d0e', '#1e3a8a', '#1c1c1c'] })), h('sav-switch', { size: 'sm', checked: bold || null, onchange: (e) => { bold = e.currentTarget.checked; } }, t('bold')));
    const scale = h('div.grid3', ...[['c1', t('cf_low'), () => c1, (v) => { c1 = v; }, '#f8696b'], ['c3', t('cf_mid'), () => c3, (v) => { c3 = v; }, ''], ['c2', t('cf_high'), () => c2, (v) => { c2 = v; }, '#63be7b']].map(([, l, get, set, def]) => h('div', h('span.flabel', l), colorPop(l, get() || def, set, { none: def ? null : t('none'), list: ['#f8696b', '#ffeb84', '#63be7b', '#5a8ac6', '#ffffff', '#7fb55c'] }))));
    const help = h('p.muted.small');
    const paint = () => {
      const k = kind.value;
      a.hidden = ['empty', 'filled', 'dup', 'scale', 'bars'].includes(k);
      b.hidden = k !== 'between';
      a.label = k === 'formula' ? t('cf_formula_l') : k === 'top' ? t('cf_top_n') : k === 'text' ? t('cf_text_l') : t('value');
      style.hidden = ['scale', 'bars'].includes(k);
      scale.hidden = !['scale', 'bars'].includes(k);
      scale.children[1].hidden = scale.children[2].hidden = k === 'bars';
      help.textContent = k === 'formula' ? t('cf_formula_t', { k: (parseRange(rg.value) ? rg.value.split(':')[0] : 'A1') }) : '';
    };
    paint();
    dialog({ title: t(i === undefined ? 'cf_add' : 'cf_edit'), width: '30rem', body: h('div.form', rg, kind, h('div.grid2', a, b), help, style, scale), actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: () => {
      const rr = rg.value.trim().toUpperCase().replace(/\$/g, '');
      if (!validRange(rr)) { toast(t('bad_ref'), 'warning'); return false; }
      const n = { r: rr, k: kind.value, a: a.value.trim().replace(/^=/, ''), b: b.value.trim(), s: { ...(bg ? { bg } : {}), ...(c ? { c } : {}), ...(bold ? { b: 1 } : {}) } };
      if (n.k === 'scale' || n.k === 'bars') Object.assign(n, { c1: c1 || (n.k === 'bars' ? '#7fb55c' : '#f8696b'), ...(n.k === 'scale' ? { c2: c2 || '#63be7b', ...(c3 ? { c3 } : {}) } : {}) });
      if (i === undefined) rules.push(n); else rules[i] = n;
      if (direct) commit(); else draw();
      return undefined;
    } }] });
  }
  if (quick) { edit(undefined, quick, true); return; }
  draw();
  dialog({ title: t('cond_format'), width: '32rem', body: h('div.form', h('p.muted', t('cf_text')), box, btn(t('cf_add'), { icon: 'plus', size: 'sm', onclick: () => edit() })), actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: commit }] });
}

// ------------------------------------------------------------------ data validation

/** k0: 'list' opens on a dropdown for just the selected cells; 'check' turns them into checkboxes at once. */
export function dvDialog(x, k0) {
  // the cells chosen, not the whole table around a single cell
  const g = x.selOf(), one = g.r1 === g.r2 && g.c1 === g.c2, ex = x.sh.dv.find((d) => { const q = parseRange(d.r); return q && q.r1 <= g.r1 && q.r2 >= g.r2 && q.c1 <= g.c1 && q.c2 >= g.c2; });
  const others = (r) => x.sh.dv.filter((d) => d !== ex && d.r !== r);
  const apply = (n) => {
    const ops = [{ t: 'sheet', id: x.sh.id, p: { dv: [...others(n.r), n] } }];
    // checkboxes start as FALSE
    if (n.k === 'check') { const q = parseRange(n.r), m = {}; for (let rr = q.r1; rr <= Math.min(q.r2, q.r1 + 2000); rr++) for (let c = q.c1; c <= q.c2; c++) { const k = key(rr, c), cell = x.sh.cells[k]; if (typeof cell?.v !== 'boolean') m[k] = { ...(cell || {}), v: false, f: undefined }; } for (const k in m) if (m[k].f === undefined) delete m[k].f; if (Object.keys(m).length) ops.push({ t: 'cells', s: x.sh.id, m }); }
    x.change(ops);
  };
  if (k0 === 'check' || k0 === 'check3') { apply({ r: rangeStr(g), k: 'check', list: [], a: '', b: '', strict: false, arrow: true, hover: true, sel: false, suggest: true, tri: k0 === 'check3' }); return; }
  const cellValues = () => { const vals = new Set(); for (let r = g.r1; r <= Math.min(g.r2, x.ext.r); r++) for (let c = g.c1; c <= Math.min(g.c2, x.ext.c); c++) { const v = x.shown(r, c); if (v) vals.add(v); } return [...vals]; };
  // the cells are already in a rule: that rule is the one changed
  const rg = field(t('range'), ex?.r || rangeStr(g), ex && ex.r !== rangeStr(g) ? { help: t('dv_in_rule', { r: ex.r }) } : {}), kind = select(t('dv_kind'), ['list', 'check', 'number', 'int', 'date', 'text'].map((k) => [k, t('dv_' + (k === 'text' ? 'text_k' : k))]), ex?.k || k0 || 'list', () => paint(), { size: 'sm' });
  // a new dropdown on cells that already hold values starts with those values
  const start = ex?.list?.length ? ex.list : k0 === 'list' && !one ? cellValues() : [];
  const items = h('sav-textarea', { label: t('dv_items'), value: start.join('\n'), rows: 5, size: 'sm', help: t('dv_items_t'), placeholder: t('dv_items_ph') }), a = field(t('dv_min'), ex?.a), b = field(t('dv_max'), ex?.b), strict = h('sav-switch', { size: 'sm', checked: ex?.strict ? true : null, help: t('dv_strict_t') }, t('dv_strict'));
  const tri = h('sav-switch', { size: 'sm', checked: ex?.tri || null, help: t('dv_tri_t') }, t('dv_tri'));
  const arrow = h('sav-switch', { size: 'sm', checked: ex?.arrow === false ? null : true }, t('dv_arrow')), hover = h('sav-switch', { size: 'sm', checked: ex?.hover === false ? null : true, class: 'subopt' }, t('dv_hover')), onSel = h('sav-switch', { size: 'sm', checked: ex?.sel ? true : null, class: 'subopt' }, t('dv_sel')), suggest = h('sav-switch', { size: 'sm', checked: ex?.suggest === false ? null : true }, t('dv_suggest'));
  items.addEventListener('keydown', (e) => e.stopPropagation());
  // "only on hover" makes sense only while the arrow is shown
  // "only when selected" is stricter than "on hover": with it, hovering does not count
  const hoverOk = () => { onSel.disabled = !arrow.checked; hover.disabled = !arrow.checked || !!onSel.checked; };
  arrow.addEventListener('change', hoverOk);
  onSel.addEventListener('change', hoverOk);
  hoverOk();
  const fromCells = btn(t('dv_from_sel'), { size: 'sm', appearance: 'ghost', icon: 'list', onclick: () => { items.value = cellValues().join('\n'); } });
  const paint = () => { const k = kind.value; items.hidden = fromCells.hidden = arrow.hidden = hover.hidden = onSel.hidden = suggest.hidden = k !== 'list'; a.hidden = b.hidden = ['list', 'check'].includes(k); strict.hidden = k === 'check'; tri.hidden = k !== 'check'; a.label = k === 'text' ? t('dv_min_len') : t('dv_min'); b.label = k === 'text' ? t('dv_max_len') : t('dv_max'); };
  paint();
  if (k0 === 'list') setTimeout(() => items.focus?.(), 120);
  dialog({ title: t(k0 === 'list' && !ex ? 'dv_dropdown' : 'validation'), width: '30rem', body: h('div.form', h('p.muted', t(k0 === 'list' && !ex ? 'dv_dropdown_t' : 'dv_text')), rg, kind, items, fromCells, h('div.grid2', a, b), arrow, hover, onSel, suggest, tri, strict), actions: [ex ? { label: t('dv_remove'), danger: true, run: () => x.change([{ t: 'sheet', id: x.sh.id, p: { dv: others(ex.r) } }]) } : null, { label: t('cancel') }, { label: t('save'), primary: true, run: () => {
    const r = rg.value.trim().toUpperCase().replace(/\$/g, '');
    if (!validRange(r)) { toast(t('bad_ref'), 'warning'); return false; }
    const n = { r, k: kind.value, list: kind.value === 'list' ? items.value.split(/\n|;/).map((s) => s.trim()).filter(Boolean).slice(0, 200) : [], a: a.value.trim(), b: b.value.trim(), strict: !!strict.checked, arrow: !!arrow.checked, hover: !!hover.checked, sel: !!onSel.checked, suggest: !!suggest.checked, tri: kind.value === 'check' && !!tri.checked };
    if (n.k === 'list' && !n.list.length) { toast(t('dv_no_items'), 'warning'); return false; }
    apply(n);
    return undefined;
  } }].filter(Boolean) });
}

// ------------------------------------------------------------------ charts

const CHART_ICON = { column: 'chart-column', bar: 'chart-bar', line: 'chart-line', area: 'chart-area', pie: 'chart-pie', donut: 'circle-dot', scatter: 'chart-scatter', stacked: 'chart-column-stacked' };
export function chartDialog(x, ch, done) {
  const g = x.rangeOf(), isNew = !ch;
  const c = ch ? structuredClone(ch) : { id: newId(), k: 'column', r: rangeStr(g), x: Math.round(x.grid.x(Math.min(g.c2, x.ext.c || g.c2) + 1) / x.W.zoom + 24), y: Math.round(x.grid.y(g.r1) / x.W.zoom), w: 480, h: 300, title: '', legend: true, head: true, rows: false };
  const preview = h('div.chprev');
  const kinds = h('sav-radio-group', { appearance: 'buttons', size: 'sm', value: c.k, 'aria-label': t('chart_kind'), class: 'chk' }, CHART_KINDS.map((k) => h('sav-radio', { value: k, title: t('ct_' + k), 'aria-label': t('ct_' + k) }, icon(CHART_ICON[k]))));
  const rg = field(t('range'), c.r), ti = field(t('chart_title'), c.title, { maxlength: 120 });
  const legend = h('sav-switch', { size: 'sm', checked: c.legend ? true : null }, t('chart_legend')), head = h('sav-switch', { size: 'sm', checked: c.head ? true : null }, t('chart_head')), rows = h('sav-switch', { size: 'sm', checked: c.rows ? true : null }, t('chart_rows'));
  const col = colorPop(t('chart_color'), c.color || PALETTE[0], (v) => { c.color = v || undefined; paint(); }, { list: PALETTE });
  const paint = () => {
    c.k = kinds.value; c.r = rg.value.trim().toUpperCase().replace(/\$/g, ''); c.title = ti.value; c.legend = !!legend.checked; c.head = !!head.checked; c.rows = !!rows.checked;
    if (!validRange(c.r)) { put(preview, h('p.muted', t('bad_ref'))); return; }
    const data = chartData(c, (r, cc) => x.W.eng.value(x.sh, key(r, cc)), (r, cc) => x.shown(r, cc));
    preview.innerHTML = chartSVG(c, data, 440, 260, {});
  };
  for (const el of [kinds, legend, head, rows]) el.addEventListener('change', paint);
  for (const el of [rg, ti]) el.addEventListener('input', paint);
  paint();
  dialog({ title: t(isNew ? 'insert_chart' : 'edit_chart'), width: '40rem', body: h('div.form', kinds, preview, h('div.grid2', rg, ti), h('div.grid3', legend, head, rows), h('div', h('span.flabel', t('chart_color')), col)), actions: [{ label: t('cancel') }, { label: t(isNew ? 'insert' : 'save'), primary: true, run: () => {
    paint();
    if (!validRange(c.r)) return false;
    x.change([{ t: 'sheet', id: x.sh.id, p: { charts: isNew ? [...x.sh.charts, c] : x.sh.charts.map((q) => (q.id === c.id ? c : q)) } }]);
    done?.(c.id);
    return undefined;
  } }] });
}

// ------------------------------------------------------------------ sorting on several columns

export function sortDialog(x) {
  const g = x.rangeOf(), cols = Array.from({ length: g.c2 - g.c1 + 1 }, (_, i) => g.c1 + i);
  const head = h('sav-switch', { size: 'sm' }, t('sort_head'));
  const name = (c) => (head.checked ? x.shown(g.r1, c) || t('column_n', { c: colName(c) }) : t('column_n', { c: colName(c) }));
  const keys = [{ c: x.grid.sel.c >= g.c1 && x.grid.sel.c <= g.c2 ? x.grid.sel.c : g.c1, desc: false }], box = h('div.stack');
  const draw = () => put(box, keys.map((k, i) => h('div.prow', h('span.muted', i ? t('then_by') : t('sort_by')), select(null, cols.map((c) => [String(c), name(c)]), String(k.c), (v) => { k.c = +v; }, { size: 'sm', 'aria-label': t('sort_by') }), select(null, [['0', t('sort_az')], ['1', t('sort_za')]], k.desc ? '1' : '0', (v) => { k.desc = v === '1'; }, { size: 'sm', 'aria-label': t('sort') }), i ? iconBtn('x', t('remove'), () => { keys.splice(i, 1); draw(); }) : null)));
  head.addEventListener('change', draw);
  draw();
  dialog({ title: t('sort_more'), width: '32rem', body: h('div.form', h('p.muted', t('sort_range', { r: rangeStr(g) })), head, box, btn(t('sort_add'), { size: 'sm', icon: 'plus', appearance: 'ghost', onclick: () => { if (keys.length < 4) { keys.push({ c: cols.find((c) => !keys.some((k) => k.c === c)) || g.c1, desc: false }); draw(); } } })), actions: [{ label: t('cancel') }, { label: t('sort'), primary: true, run: () => { x.grid.sel = { ranges: [g], r: g.r1, c: g.c1 }; x.sortSel(false, { head: !!head.checked, keys }); } }] });
}

// ------------------------------------------------------------------ functions

export function functionDialog(x, pick) {
  const q = field(t('search'), '', { clearable: true, placeholder: 'SUM, VLOOKUP…' }), list = h('div.fnlist');
  let cat = 'all';
  const cats = h('sav-chip-group', { value: 'all', required: true }, h('sav-chip', { value: 'all', selected: true }, t('all')), CATS.map((c) => h('sav-chip', { value: c }, t('fc_' + c))), h('sav-chip', { value: 'other' }, t('fc_other')));
  cats.addEventListener('change', (e) => { cat = e.detail?.value || cats.value || 'all'; draw(); });
  let d;
  const draw = () => {
    const s = (q.value || '').trim().toUpperCase();
    const names = FUNCTIONS.filter((n) => (!s || n.includes(s) || desc(n, x.ui).toUpperCase().includes(s)) && (cat === 'all' || (cat === 'other' ? !FN[n] : FN[n]?.cat === cat)));
    put(list, names.slice(0, 300).map((n) => h('button.fni', { onclick: () => { d.hide(); pick(n); } }, h('b', n), FN[n] ? h('code', `(${FN[n].args.join(', ')})`) : null, h('small', desc(n, x.ui)))));
  };
  q.addEventListener('input', draw);
  draw();
  d = dialog({ title: t('functions'), width: '40rem', body: h('div.form', h('p.muted', t('fn_english')), q, cats, list), actions: [{ label: t('close') }] });
}

// ------------------------------------------------------------------ the workbook

export function bookDialog(x) {
  const s = x.book.settings;
  const lang = select(t('book_lang'), Object.keys(LOCALES).map((k) => [k, t('loc_' + k)]), s.lang in LOCALES ? s.lang : 'en', null, { size: 'sm', help: t('book_lang_t') });
  const cur = select(t('currency'), ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CNY', 'INR', 'BRL', 'SEK', 'PLN'].map((k) => [k, k]), s.currency, null, { size: 'sm' });
  const ff = select(t('font'), Object.keys(FONT_STACK).map((k) => [k, t('ff_' + k), `font-family:${FONT_STACK[k]}`]), s.font, null, { size: 'sm' });
  const fz = h('sav-number-input', { label: t('size'), value: s.fontSize || 10, min: 7, max: 24, step: 1, size: 'sm' });
  const ex = h('div.nfprev');
  const show = () => { const L = LOCALES[lang.value] || LOCALES.en; put(ex, h('span.muted', t('nf_preview') + ' '), h('b', formatValue(1234567.891, '#,##0.00', L).text), ' · ', h('b', formatValue(46351, 'dddd d mmmm yyyy', L).text), ' · ', h('b', formatValue(true, '', L).text)); };
  lang.addEventListener('change', show);
  show();
  dialog({ title: t('book_settings'), width: '30rem', body: h('div.form', lang, ex, h('p.muted.small', t('book_formulas_t')), cur, h('div.grid2', ff, fz)), actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: () => x.change([{ t: 'settings', s: { ...s, lang: lang.value, currency: cur.value, font: ff.value, fontSize: +fz.value || 10 } }]) }] });
}

// ------------------------------------------------------------------ who can see and edit a sheet (the owner)

/** The people with access to the workbook (its sharing), for the rules of sheets and cells. */
const people = async (pid) => { const r = await api('share.get', undefined, { doc: pid }); return { owner: r.owner, list: r.people.filter((p) => p.email), link: r.visibility === 'link' ? r.linkRole : null }; };
const ROLE_LABEL = (r) => t({ editor: 'r_editor', commenter: 'r_commenter', viewer: 'r_viewer' }[r] || 'r_viewer');

/**
 * The rules of a sheet: for each person (and for everybody else) what they can do on it, when it differs from the
 * workbook. "Hidden": for them the sheet does not exist (the server never sends it, nor its comments).
 */
export async function permDialog(x, s) {
  const body = h('div.form', h('div.wait', h('sav-spinner')));
  const d = dialog({ title: t('perm_title', { name: s.name }), width: '36rem', body, actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: () => save() }] });
  let pp;
  try { pp = await people(x.W.pid); } catch (e) { put(body, h('sav-alert', { variant: 'danger' }, t('err_server'))); return; }
  const perm = { ...(s.perm || {}) };
  const opts = (book) => [['', t('perm_inherit', { r: book })], ['editor', t('r_editor')], ['commenter', t('r_commenter')], ['viewer', t('r_viewer')], ['none', t('perm_none')]];
  const row = (who, name, sub, book) => {
    const sel = select(null, opts(book), perm[who] || '', (v) => { if (v) perm[who] = v; else delete perm[who]; }, { size: 'sm', 'aria-label': name, class: 'permsel' });
    return h('div.person', who === '*' ? h('span.lic', icon('globe')) : face(name, null, 34), h('div.pinfo', h('b', name), h('small', sub)), sel);
  };
  put(body, h('p.muted', t('perm_text')),
    h('div.person', face(pp.owner.name, null, 34), h('div.pinfo', h('b', pp.owner.name), h('small', pp.owner.email)), h('span.muted', t('perm_owner'))),
    pp.list.length ? pp.list.map((p) => row(p.email, p.name || p.email, p.email + (p.pending ? ' · ' + t('pending') : ''), ROLE_LABEL(p.role))) : h('p.muted.small', t('perm_nobody')),
    row('*', t('perm_everyone'), t(pp.link ? 'perm_everyone_link' : 'perm_everyone_t'), pp.link ? ROLE_LABEL(pp.link) : t('r_viewer')));
  const save = () => { x.change([{ t: 'sheet', id: s.id, p: { perm } }]); toast(t('perm_saved'), 'success'); };
  void d;
}

/**
 * Protected cells: ranges of a sheet that only the owner and the people chosen may change; for everybody else they are
 * read only (and shown hatched).
 */
export async function protectDialog(x, s, preset, presetOut = false) {
  let list = structuredClone(s.protect || []), pp = null;
  const box = h('div.stack.cfl');
  const tn = (k, n) => t(n === 1 && t(k + '_1') !== k + '_1' ? k + '_1' : k, { n });
  // who it holds for: everybody but the editors, or only the users
  const whom = (p) => p.who === 'some' ? tn('protect_for_n', p.users.length) : p.editors.length ? t('protect_who_n', { n: p.editors.length }) : t('protect_only_owner');
  const draw = () => put(box, list.length ? list.map((p, i) => h('div.cfrow', h('span.cfs', icon(p.out ? 'lock-open' : 'lock')), h('div.grow', h('b', (p.out ? t('protect_all_but', { r: p.r }) : p.r) + (p.note ? ' · ' + p.note : '')), h('small.muted', whom(p))), iconBtn('pencil', t('edit'), () => edit(i)), iconBtn('trash', t('delete'), () => { list.splice(i, 1); draw(); }))) : h('p.muted', t('protect_none')));
  async function edit(i) {
    pp ||= await people(x.W.pid).catch(() => ({ list: [] }));
    const p = i === undefined ? { r: preset || 'A1:A1', out: presetOut, who: 'all', editors: [], users: [], note: '' } : structuredClone(list[i]);
    p.editors ||= []; p.users ||= [];
    const choice = (value, label, opts) => h('sav-radio-group', { appearance: 'buttons', size: 'sm', value, 'aria-label': label }, opts.map(([v, l]) => h('sav-radio', { value: v }, l)));
    const what = choice(p.out ? 'out' : 'in', t('protect_what'), [['in', t('protect_in')], ['out', t('protect_out')]]);
    const forWho = choice(p.who, t('protect_for'), [['all', t('protect_for_all')], ['some', t('protect_for_some')]]);
    const rg = field(t(p.out ? 'protect_range_out' : 'range'), p.r), note = field(t('protect_note'), p.note, { maxlength: 200 });
    // the same people, ticked from the list of the mode chosen: editors (who may anyway) or users (who may not)
    const whoLabel = h('span.flabel'), checks = pp.list.map((q) => h('sav-checkbox', { size: 'sm', 'data-e': q.email }, (q.name || q.email) + ' ', h('small.muted', q.email)));
    let mode = p.who;
    const fill = () => { const l = mode === 'some' ? p.users : p.editors; for (const c of checks) c.checked = l.includes(c.dataset.e); whoLabel.textContent = t(mode === 'some' ? 'protect_who_some' : 'protect_who'); };
    const keep = () => { const l = checks.filter((c) => c.checked).map((c) => c.dataset.e); if (mode === 'some') p.users = l; else p.editors = l; };
    forWho.addEventListener('change', () => { keep(); mode = forWho.value === 'some' ? 'some' : 'all'; fill(); });
    what.addEventListener('change', () => { rg.label = t(what.value === 'out' ? 'protect_range_out' : 'range'); });
    fill();
    dialog({ title: t(i === undefined ? 'protect_add' : 'protect_edit'), width: '32rem', body: h('div.form', h('div', h('span.flabel', t('protect_what')), what), rg, note, h('div', h('span.flabel', t('protect_for')), forWho), h('div', whoLabel, checks.length ? h('div.stack', checks) : h('p.muted.small', t('perm_nobody')))), actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: () => {
      const r = rg.value.trim().toUpperCase().replace(/\$/g, '');
      if (!validRange(r)) { toast(t('bad_ref'), 'warning'); return false; }
      keep();
      if (mode === 'some' && !p.users.length) { toast(t('protect_pick'), 'warning'); return false; }
      const n = { id: p.id || newId(), r: r.includes(':') ? r : r + ':' + r, out: what.value === 'out', who: mode, editors: mode === 'all' ? p.editors : [], users: mode === 'some' ? p.users : [], note: note.value.trim() };
      if (i === undefined) list.push(n); else list[i] = n;
      draw();
      return undefined;
    } }] });
  }
  draw();
  dialog({ title: t('protect_title', { name: s.name }), width: '32rem', body: h('div.form', h('p.muted', t('protect_text')), box, btn(t('protect_add'), { icon: 'plus', size: 'sm', onclick: () => edit() })), actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: () => { x.change([{ t: 'sheet', id: s.id, p: { protect: list } }]); toast(t('perm_saved'), 'success'); } }] });
  if (preset && !list.some((p) => p.r === preset && !!p.out === presetOut)) setTimeout(() => edit(), 250);
}
