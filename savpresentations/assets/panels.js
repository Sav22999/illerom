/** The side panel of the editor: elements to insert, properties, layouts, themes, pictures and videos. SavComponents only. */
import { h, icon, btn, iconBtn, item, tile, segmented, dialog, $, $$, clamp, oops, ok, userSetting, mobile, pickFile } from './core.js';
import { t } from './i18n.js';
import { THEMES, FONTS, FORMATS, slideContext, styleOf, context, gradient } from './themes.js';
import { addDeckFont, fontDialog } from './fonts.js';
import { SHAPES, shapePath, toSvgPath } from './shapes.js';
import { LAYOUTS, makeSlide, sampleFill } from './layouts.js';
import { fluidThumb, cssFill } from './render.js';
import { searchPanel, libraryPanel, pickPicture, pickVideo, uploadFiles } from './media.js';
import { CHARTS, CHART_ICONS, ICON_NAMES, iconCmds } from './parts.js';
import { formatPicker } from './home.js';

const TOKENS = ['@fg', '@muted', '@accent', '@accent2', '@surface', '@bg', '@onaccent'];
const PALETTE = ['#000000', '#374151', '#9ca3af', '#e5e7eb', '#ffffff', '#dc2626', '#ea580c', '#f59e0b', '#84cc16', '#16a34a', '#0d9488', '#0891b2', '#2563eb', '#4f46e5', '#9333ea', '#db2777'];

const sec = (title, ...kids) => h('section.psec', title && h('sav-label', { appearance: 'plain', case: 'normal', variant: 'neutral' }, title), ...kids);
/** A section that opens and closes. */
const fold = (title, open, ...kids) => h('sav-details.psec2', { summary: title, open, appearance: 'plain' }, h('div.stack', ...kids));
const row = (...kids) => h('div.prow', ...kids);
const num = (label, value, onchange, attrs = {}) => { const n = h('sav-number-input', { label, size: 'sm', buttons: 'none', limits: 'never', step: attrs.step || 1, ...attrs, value: Math.round(value * 100) / 100, onchange: () => { const v = parseFloat(n.value); if (Number.isFinite(v)) onchange(v); } }); n.addEventListener('keydown', (e) => e.stopPropagation()); return n; };
const toggle = (on, ic, label, onpick) => { const b = h('sav-button', { icon: ic, label, title: label, size: 'sm', square: true, variant: on ? 'primary' : 'neutral', appearance: on ? 'soft' : 'outline', 'aria-pressed': String(!!on), onclick: () => { const v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', v); b.variant = v ? 'primary' : 'neutral'; b.appearance = v ? 'soft' : 'outline'; onpick(v); } }); return b; };
const range = (label, value, min, max, step, oninput, unit = '') => h('sav-range', { label, value, min, max, step, unit, 'show-value': true, oninput: (e) => oninput(+e.target.value) });
const pick = (label, value, options, onpick) => h('sav-select', { label, size: 'sm', value, placeholder: options.find((o) => o[0] === '')?.[1] || null, onchange: (e) => onpick(e.target.value) }, ...options.map(([v, l]) => h('option', { value: v }, l)));
const onOff = (label, on, onpick) => h('sav-switch', { size: 'sm', checked: !!on, onchange: (e) => onpick(e.target.checked) }, label);
const small = { size: 'sm', appearance: 'outline', variant: 'neutral' };

/** A colour: the ones of the theme (they follow it when it changes), a palette, any colour; optionally none and gradients. */
export function colorField(label, value, sc, onpick, { none = false, grad = false } = {}) {
  const sw = h('sav-button.cbtn', { slot: 'trigger', size: 'sm', appearance: 'outline', variant: 'neutral', label });
  const show = (v) => { sw.style.setProperty('--c', v ? cssFill(v, sc) : 'transparent'); sw.classList.toggle('none', !v); };
  show(value);
  let cur = value;
  const set = (v, close) => { cur = v; show(v); onpick(v); if (close) pop.hide(); };
  const grid = (list) => h('div.sws', ...list.map((c) => h('sav-button.sw', { circle: true, size: 'sm', label: c[0] === '@' ? t('tok_' + c.slice(1)) : c, title: c[0] === '@' ? t('tok_' + c.slice(1)) : c, style: `--c:${sc.color(c)}`, onclick: () => set(c, true) })));
  const mini = (lab, v, f) => { const c = h('sav-color-picker', { compact: true, size: 'sm', picker: 'custom', 'aria-label': lab, value: (sc.color(v) || '#000000').slice(0, 7) }); c.addEventListener('change', (e) => { const x = e.detail?.value ?? c.value; if (/^#[0-9a-f]{6}$/i.test(x)) f(x.toLowerCase()); }); return c; };
  const pop = h('sav-popover', { placement: 'bottom-end', 'sheet-on-mobile': true, heading: label, style: '--width:18rem' }, sw);
  const part = (title, ...kids) => h('div.cpart', h('span.flabel', title), ...kids);
  pop.addEventListener('sav-show', () => {
    if (pop.dataset.built) return;
    pop.dataset.built = 1;
    const hex = cur && cur[0] === '#' ? cur : cur && cur[0] === '@' ? sc.color(cur) : '#6d3bef';
    // the same look for every part: a small label, then the choices; "none" is the first of the colours of the theme
    const cp = h('sav-color-picker', { value: hex, alpha: true, picker: 'custom', size: 'sm', 'aria-label': t('other_color') });
    cp.addEventListener('change', (e) => { const v = e.detail?.value ?? cp.value; if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)) set(v.toLowerCase()); });
    const g = gradient(cur);
    let a = g?.a || '@accent', b = g?.b || '@accent2', ang = g?.ang ?? 135;
    const bar = h('div.gbar');
    const paint = () => bar.style.setProperty('background', cssFill(`g|${ang}|${a}|${b}`, sc));
    const gset = () => { paint(); set(`g|${ang}|${a}|${b}`); };
    paint();
    const angle = h('sav-range', { min: 0, max: 360, step: 15, value: ang, unit: '°', 'show-value': true, 'aria-label': t('angle'), oninput: (e) => { ang = +e.target.value; gset(); } });
    const noneB = none && h('sav-button.sw.swnone', { circle: true, size: 'sm', label: t('none'), title: t('none'), onclick: () => set('', true) });
    const themeRow = grid(TOKENS);
    if (noneB) themeRow.prepend(noneB);
    pop.append(h('div.cpop', part(t('theme_colors'), themeRow), part(t('palette'), grid(PALETTE)), part(t('other_color'), cp),
      grad && part(t('gradient'), bar, h('div.grow2', h('label.gpick', mini(t('gradient') + ' A', a, (v) => { a = v; gset(); }), h('small', t('from'))), h('label.gpick', mini(t('gradient') + ' B', b, (v) => { b = v; gset(); }), h('small', t('to'))), angle))));
  });
  return h('div.cf', h('span.flabel', label), pop);
}

/** A typeface: the included ones by kind; with the editor (ed) also those of the presentation and "More typefaces…" (Bunny Fonts, from file). */
export function fontField(label, value, onpick, themeOpt = true, ed = null) {
  let cur = value || '';
  const s = h('sav-select', { label, value: cur, placeholder: t('theme_font'), size: 'sm', searchable: true, 'search-placeholder': t('search'), clearable: !themeOpt, onchange: (e) => {
    const v = e.target.value;
    if (v !== '__more') { cur = v; return onpick(v); }
    s.value = cur;
    fontDialog({ current: cur, used: ed.deck.meta.fonts || [] }).then((f) => { if (!f) return; addDeckFont(ed.deck, f); cur = f.id; onpick(f.id); });
  } });
  if (themeOpt) s.append(h('option', { value: '@head' }, t('font_head')), h('option', { value: '@body' }, t('font_body')));
  const extra = ed ? (ed.deck.meta.fonts || []) : [];
  if (extra.length) s.append(h('optgroup', { label: t('fonts_deck') }, ...extra.map((f) => h('option', { value: f.id, style: `font-family:"${f.n}"` }, f.n))));
  for (const [k, label2] of [['sans-serif', 'f_sans'], ['serif', 'f_serif'], ['monospace', 'f_mono'], ['cursive', 'f_script']]) s.append(h('optgroup', { label: t(label2) }, ...Object.entries(FONTS).filter(([, f]) => f[1] === k).map(([id, f]) => h('option', { value: id, style: `font-family:"SP ${f[0]}"` }, f[0]))));
  if (ed?.deck.canEdit) s.append(h('option', { value: '__more', style: 'font-weight:600' }, t('more_fonts')));
  return s;
}

// ------------------------------------------------------------------ elements to insert

const NS = 'http://www.w3.org/2000/svg';
function drawing(cmds, box, stroke) {
  const v = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
  v.setAttribute('viewBox', box);
  p.setAttribute('d', toSvgPath(cmds));
  p.setAttribute('fill-rule', 'evenodd');
  v.setAttribute('class', stroke ? 'draw line' : 'draw');
  v.append(p);
  return v;
}
export function elementsPanel(ed) {
  const drag = (what) => ({ draggable: true, ondragstart: (e) => { e.dataTransfer.setData('text/sp-insert', what); e.dataTransfer.effectAllowed = 'copy'; } });
  const add = (what, label, body, cls = '') => tile(label, () => ed.insert(what), { ...drag(what), title: label, class: 'ins-t ' + cls }, body);
  const txt = (role, label) => add('text:' + role, label, label, 'p-' + role);
  const shape = (s) => { const [w, hh] = /arrow|chevron|homeplate|speech|parallelogram|cloud|wave|half|trapezoid/.test(s) ? [40, 28] : s === 'rect' || s === 'round' ? [38, 28] : [30, 30]; return add('shape:' + s, t('sh_' + s), drawing(shapePath(s, w, hh), `${(w - 40) / 2 - 2} ${(hh - 34) / 2 - 2} 44 38`), 'sq'); };
  const big = (what, ic, label, fn) => tile(label, fn || (() => ed.insert(what)), { ...(fn ? {} : drag(what)), class: 'ins-t big' }, icon(ic), h('span', label));
  let q = '';
  const icons = h('div.pgrid'), search = h('sav-input', { size: 'sm', type: 'search', placeholder: t('search_icons'), clearable: true });
  const drawIcons = () => icons.replaceChildren(...ICON_NAMES.filter((n) => !q || n.includes(q)).slice(0, q ? 60 : 36).map((n) => add('icon:' + n, n, drawing(iconCmds(n), '-1 -1 26 26', true), 'sq')));
  search.addEventListener('input', () => { q = search.value.trim().toLowerCase().replace(/\s+/g, '-'); drawIcons(); });
  search.addEventListener('sav-clear', () => { q = ''; drawIcons(); });
  search.addEventListener('keydown', (e) => e.stopPropagation());
  drawIcons();
  return h('div', h('p.muted.hint', t(mobile() ? 'tap_insert' : 'drag_insert')),
    sec(t('text'), h('div.ptexts', txt('title', t('r_title')), txt('heading', t('r_heading')), txt('body', t('r_body')), txt('list', t('r_list')), txt('quote', t('r_quote')), txt('big', '123'), txt('caption', t('r_caption')))),
    sec(t('media'), h('div.pmedia', big('image', 'image', t('image')), big('video', 'film', t('video')), big('', 'upload', t('from_computer'), async () => uploadFiles(await pickFile('image/*,video/*', true), (m) => ed.insertImage(m), (v) => ed.insertVideo(v))))),
    sec(t('data'), h('div.pmedia', ...CHARTS.map((c) => big('chart:' + c, CHART_ICONS[c], t('ct_' + c))), big('table', 'table', t('table')))),
    sec(t('lines'), h('div.pgrid', ...[['line', 'minus'], ['line:arrow', 'move-right'], ['line:double', 'move-horizontal']].map(([s, ic]) => add('shape:' + s, t('sh_' + s.replace(':', '_')), icon(ic), 'sq')))),
    sec(t('shapes'), h('div.pgrid', ...SHAPES.filter((s) => s !== 'line').map(shape))),
    sec(t('icons'), search, icons, h('p.muted.hint', t('icons_hint'))));
}

// ------------------------------------------------------------------ properties of the selection, or of the slide

export function propsPanel(ed) {
  const els = [...ed.sel].map((id) => [id, ed.deck.el(ed.sid, id)]).filter((x) => x[1]);
  return els.length ? elementProps(ed, els) : h('sav-empty-state', { icon: 'mouse-pointer-2', heading: t('nothing_selected'), text: t('nothing_selected_t') }, btn(t('page_settings'), () => ed.setTab('page'), { ...small, icon: 'panel-top' }));
}

/** The page itself: its name, its background, how it comes in. */
export function pagePanel(ed) {
  const s = ed.deck.slide(ed.sid);
  if (!s) return h('div');
  const d = s.d, sc = slideContext(ed.ctx, d), set = (p) => ed.deck.do({ k: 'slide.set', s: ed.sid, p }, 'slide' + Object.keys(p)), b = sc.bg;
  const name = h('sav-input', { size: 'sm', label: t('page_name'), value: d.name || '', placeholder: t('page') + ' ' + (ed.deck.index(ed.sid) + 1), maxlength: 60, onchange: (e) => set({ name: e.target.value.trim() || null }) });
  name.addEventListener('keydown', (e) => e.stopPropagation());
  return h('div', sec('', name, onOff(t('hide_slide'), d.hide, (v) => set({ hide: v ? 1 : null })), h('p.muted.hint', t('hide_t'))),
    sec(t('background'), pick(t('variant'), d.variant || 'content', ['content', 'cover', 'section', 'plain'].map((v) => [v, t('v_' + v)]), (v) => set({ variant: v })),
      row(colorField(t('color'), b.t === 'c' ? b.c : b.t === 'g' ? `g|${b.ang ?? 135}|${b.a}|${b.b}` : '', sc, (c) => set({ bg: c ? (c.startsWith('g|') ? (([, g, a, z]) => ({ t: 'g', a, b: z, ang: +g }))(c.split('|')) : { t: 'c', c }) : null }), { none: true, grad: true }),
        btn(t('image'), async () => { const m = await pickPicture(); if (m) set({ bg: { t: 'i', src: m.src, dim: .2, credit: m.credit || '', creditUrl: m.creditUrl || '' } }); }, { ...small, icon: 'image' }), d.bg && iconBtn('rotate-ccw', t('reset'), () => set({ bg: null }), { size: 'sm' })),
      b.t === 'i' && range(t('dim'), Math.round((b.dim || 0) * 100), 0, 95, 5, (v) => set({ bg: { ...b, dim: v / 100 } }), '%'),
      d.bg && btn(t('bg_all'), () => ed.deck.do(ed.deck.order().map((x) => ({ k: 'slide.set', s: x.sid, p: { bg: structuredClone(d.bg) } }))), { size: 'sm', appearance: 'ghost' })),
    sec(t('transition'), pick(t('transition_in'), d.tr || '', [['', t('tr_default')], ...['none', 'fade', 'slide', 'push', 'zoom'].map((v) => [v, t('tr_' + v)])], (v) => set({ tr: v || null })), h('p.muted.hint', t('transition_t'))));
}

/** Asks for an icon to put on the page. Resolves with its name, or null. */
export function pickIcon() {
  let dlg, res = null;
  const grid = h('div.pgrid.wideicons'), q = h('sav-input', { type: 'search', placeholder: t('search_icons'), clearable: true, autofocus: true });
  const draw = () => { const w = q.value.trim().toLowerCase().replace(/\s+/g, '-'); grid.replaceChildren(...ICON_NAMES.filter((n) => !w || n.includes(w)).map((n) => tile(n, () => { res = n; dlg.close(n); }, { title: n, class: 'ins-t sq' }, drawing(iconCmds(n), '-1 -1 26 26', true)))); };
  q.addEventListener('input', draw); q.addEventListener('sav-clear', draw); q.addEventListener('keydown', (e) => e.stopPropagation());
  draw();
  return dialog(t('icon'), h('div.stack', q, grid, h('p.muted.hint', t('icons_hint'))), [], { width: '40rem', ref: (d) => (dlg = d) }).then((v) => v || res);
}

/** The data of a chart or the cells of a table, as a grid of fields; a block copied from a spreadsheet can be pasted. */
function dataGrid(rows, onchange, { head = true, max = [41, 9] } = {}) {
  const box = h('div.dgrid');
  const commit = () => onchange(rows.map((r) => [...r]));
  const draw = () => {
    const nc = Math.max(...rows.map((r) => r.length));
    box.style.setProperty('--n', nc);
    box.replaceChildren(...rows.flatMap((r, y) => Array.from({ length: nc }, (_, x) => {
      const f = h('sav-input', { size: 'sm', value: r[x] ?? '', maxlength: 300, 'aria-label': `${y + 1}, ${x + 1}`, class: head && !y ? 'th' : '' });
      f.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { const n = box.children[(y + 1) * nc + x]; if (n) n.focus(); else f.blur(); } });
      f.addEventListener('change', () => { rows[y][x] = f.value; commit(); });
      f.addEventListener('paste', (e) => {
        const txt = e.clipboardData?.getData('text/plain') || '';
        if (!/\t|\n./.test(txt.trim())) return;
        e.preventDefault(); e.stopPropagation();
        txt.replace(/\r/g, '').replace(/\n$/, '').split('\n').forEach((line, i) => line.split('\t').forEach((v, j) => { if (y + i >= max[0] || x + j >= max[1]) return; (rows[y + i] ||= []); for (let k = rows[y + i].length; k < x + j; k++) rows[y + i][k] = ''; rows[y + i][x + j] = v.trim(); }));
        commit(); draw();
      });
      return f;
    })));
  };
  draw();
  const nc = () => Math.max(...rows.map((r) => r.length));
  return h('div.stack', box, h('div.tools', btn(t('row'), () => { if (rows.length < max[0]) { rows.push(Array(nc()).fill('')); commit(); draw(); } }, { ...small, icon: 'plus' }), btn(t('column'), () => { if (nc() < max[1]) { rows.forEach((r) => r.push('')); commit(); draw(); } }, { ...small, icon: 'plus' }), btn(t('row'), () => { if (rows.length > 2) { rows.pop(); commit(); draw(); } }, { ...small, icon: 'minus' }), btn(t('column'), () => { if (nc() > 2 || (!head && nc() > 1)) { rows.forEach((r) => r.splice(nc() - 1 || 1)); rows.forEach((r) => { while (r.length > nc()) r.pop(); }); commit(); draw(); } }, { ...small, icon: 'minus' })), btn(t('import_csv'), async () => { const [f] = await pickFile('.csv,.tsv,text/csv,text/plain'); if (!f || f.size > 500000) return; const txt = (await f.text()).replace(/^\uFEFF/, '').replace(/\r/g, '').trim(), sep = ['\t', ';', ','].sort((a, b) => txt.split(b).length - txt.split(a).length)[0]; const cells = txt.split('\n').slice(0, max[0]).map((l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.slice(0, max[1]).map((x) => x.trim()); }); if (!cells.length) return; rows.splice(0, rows.length, ...cells); commit(); draw(); }, { ...small, icon: 'file-up' }), h('p.muted.hint', t('paste_hint')));
}
const n2 = (v) => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

function elementProps(ed, els) {
  const deck = ed.deck, sc = slideContext(ed.ctx, deck.slide(ed.sid).d), one = els.length === 1 ? els[0][1] : null, f = els[0][1], id0 = els[0][0];
  const all = (fn) => els.every((x) => fn(x[1]));
  const set = (p, only) => deck.do(els.filter((x) => !only || only(x[1])).map(([id]) => ({ k: 'el.set', s: ed.sid, e: id, p: { ...p } })), 'prop' + Object.keys(p));
  const again = (p) => { set(p); ed.refreshPanel(); };
  const hasText = all((e) => e.t === 'text' || (e.t === 'shape' && e.shape !== 'line')), isLine = all((e) => e.t === 'shape' && e.shape === 'line'), compound = all((e) => ['chart', 'table', 'icon'].includes(e.t));
  const st = styleOf(f, sc), out = [];
  // who made the picture or video and where it comes from, written on the page or only kept for the credits slide
  const sourceOf = () => sec(t('source'), h('sav-input', { size: 'sm', label: t('source_who'), placeholder: t('source_ph'), value: f.credit || '', maxlength: 300, onchange: (e) => { const v = e.target.value.trim(); again({ credit: v, ...(v && !f.credit && !f.cite ? { cite: 'in' } : {}) }); } }), h('sav-input', { size: 'sm', label: t('source_url'), placeholder: 'https://…', value: f.creditUrl || '', maxlength: 1000, onchange: (e) => { let v = e.target.value.trim(); if (v && !/^https?:/i.test(v)) v = 'https://' + v; again({ creditUrl: v }); } }), f.credit ? segmented(t('cite'), f.cite || '', [['', '=' + t('cite_no'), t('cite_no')], ['in', '=' + t('cite_in'), t('cite_in')], ['below', '=' + t('cite_below'), t('cite_below')]], (v) => set({ cite: v || null }), { show: true }) : h('p.muted.hint', t('source_t')));
  const grouped = els.some((x) => x[1].g);

  out.push(sec(one ? t({ text: 'text', image: 'image', video: 'video', shape: isLine ? 'line' : 'shape', chart: 'chart', table: 'table', icon: 'icon' }[f.t]) : t('n_selected', { n: els.length }),
    h('div.tools', iconBtn('copy', t('duplicate'), () => ed.duplicateSel(), { size: 'sm' }), iconBtn('paintbrush', t('copy_style'), () => ed.copyStyle(), { size: 'sm' }), iconBtn('paint-roller', t('paste_style'), () => ed.pasteStyle(), { size: 'sm', disabled: !ed.styleClip }), els.length > 1 && !ed.simple && iconBtn('group', t('group'), () => ed.group(), { size: 'sm' }), grouped && !ed.simple && iconBtn('ungroup', t('ungroup'), () => ed.ungroup(), { size: 'sm' }), iconBtn(f.lock ? 'lock' : 'lock-open', f.lock ? t('unlock') : t('lock'), () => again({ lock: f.lock ? null : 1 }), { size: 'sm' }), iconBtn('trash', t('delete'), () => ed.deleteSel(), { variant: 'danger', size: 'sm' })),
    ed.simple ? null : h('div.tools', ...[['align-start-vertical', 'al_left'], ['align-center-vertical', 'al_center'], ['align-end-vertical', 'al_right'], ['align-start-horizontal', 'al_top'], ['align-center-horizontal', 'al_middle'], ['align-end-horizontal', 'al_bottom']].map(([ic, k]) => iconBtn(ic, t(k), () => ed.align(k.slice(3)), { size: 'sm' })), els.length > 2 && iconBtn('align-horizontal-distribute-center', t('dist_h'), () => ed.align('dh'), { size: 'sm' }), els.length > 2 && iconBtn('align-vertical-distribute-center', t('dist_v'), () => ed.align('dv'), { size: 'sm' })),
    ed.simple ? null : h('div.tools', iconBtn('bring-to-front', t('to_front'), () => ed.zorder('front'), { size: 'sm' }), iconBtn('arrow-up', t('forward'), () => ed.zorder('up'), { size: 'sm' }), iconBtn('arrow-down', t('backward'), () => ed.zorder('down'), { size: 'sm' }), iconBtn('send-to-back', t('to_back'), () => ed.zorder('back'), { size: 'sm' }))));

  if (one && f.t === 'chart') {
    const d = f.chart || { labels: [], series: [] }, rows = [['', ...d.series.map((s) => s.name)], ...d.labels.map((l, i) => [l, ...d.series.map((s) => String(s.values[i] ?? ''))])];
    out.push(sec(t('chart'), pick(t('kind'), f.ct || 'bar', CHARTS.map((c) => [c, t('ct_' + c)]), (v) => again({ ct: v })), f.ct === 'scatter' ? h('p.muted.hint', t('scatter_t')) : null,
      dataGrid(rows, (r) => set({ chart: { labels: r.slice(1).map((x) => x[0] ?? ''), series: r[0].slice(1).map((name, i) => ({ name: name || '', values: r.slice(1).map((x) => n2(x[i + 1])) })) } })),
      onOff(t('legend'), f.legend !== 0, (v) => set({ legend: v ? 1 : 0 })), onOff(t('show_values'), f.vals === undefined ? f.ct === 'pie' || f.ct === 'donut' : f.vals, (v) => set({ vals: v ? 1 : 0 })), row(num(t('size'), f.size || 15 * sc.s, (v) => set({ size: clamp(v, 4, 200) })), colorField(t('text'), f.color || '@muted', sc, (c) => set({ color: c || null })))));
  }
  if (one && f.t === 'table') out.push(sec(t('table'), dataGrid((f.cells || [['']]).map((r) => [...r]), (r) => set({ cells: r }), { head: f.hd !== 0, max: [30, 12] }), onOff(t('header_row'), f.hd !== 0, (v) => set({ hd: v ? 1 : 0 })), onOff(t('zebra'), f.zebra !== 0, (v) => set({ zebra: v ? 1 : 0 })), row(num(t('size'), f.size || 17 * sc.s, (v) => set({ size: clamp(v, 4, 200) })), colorField(t('text'), f.color || '@fg', sc, (c) => set({ color: c || null })), colorField(t('fill'), f.fill || '@surface', sc, (c) => set({ fill: c || null })))));
  if (all((e) => e.t === 'icon')) out.push(sec(t('icon'), row(colorField(t('color'), f.color || '@accent', sc, (c) => set({ color: c || null })), num(t('thickness'), f.sw || 2, (v) => set({ sw: clamp(v, .5, 8) }), { min: .5, max: 8, step: .25 }))));

  if (hasText) out.push(sec(f.t === 'text' ? t('style') : t('text'),
    f.t === 'text' && pick(t('role'), f.role || 'body', ['title', 'subtitle', 'heading', 'body', 'caption', 'label', 'quote', 'big'].map((r) => [r, t('r_' + r)]), (v) => again({ role: v, size: null, font: null, color: null, bold: null, lh: null, ls: null, align: null, italic: null, caps: null })),
    fontField(t('typeface'), f.font || st.font, (v) => set({ font: v }), true, ed),
    row(num(t('size'), st.size, (v) => set({ size: clamp(v, 4, 800) }), { min: 4, max: 800, buttons: 'end' }), colorField(t('color'), st.color, sc, (c) => set({ color: c || null }))),
    row(toggle(st.bold, 'bold', t('bold'), (v) => set({ bold: v ? 1 : 0 })), toggle(st.italic, 'italic', t('italic'), (v) => set({ italic: v ? 1 : 0 })), toggle(st.under, 'underline', t('underline'), (v) => set({ under: v ? 1 : 0 })), toggle(st.caps, 'case-upper', t('caps'), (v) => set({ caps: v ? 1 : 0 }))),
    segmented(t('align'), st.align, [['left', 'text-align-start', t('al_left')], ['center', 'text-align-center', t('al_center')], ['right', 'text-align-end', t('al_right')], ['justify', 'text-align-justify', t('justify')]], (v) => set({ align: v })),
    segmented(t('valign'), st.va, [['top', 'align-vertical-justify-start', t('al_top')], ['middle', 'align-vertical-justify-center', t('al_middle')], ['bottom', 'align-vertical-justify-end', t('al_bottom')]], (v) => set({ va: v })),
    ed.simple ? null : h('div.grid3', num(t('line_height'), st.lh, (v) => set({ lh: clamp(v, .6, 4) }), { step: .05 }), num(t('letter_space'), st.ls, (v) => set({ ls: clamp(v, -20, 100) }), { step: .5 }), num(t('padding'), st.pad, (v) => set({ pad: clamp(v, 0, 400) })))));

  if (one && f.t === 'image') out.push(sec(t('image'), btn(f.src ? t('replace') : t('choose_picture'), async () => { const m = await pickPicture(); if (m) ed.setImage(id0, m); }, { size: 'sm', icon: 'image', block: true }),
    segmented(t('fit_l'), f.fit || 'cover', [['cover', '=' + t('fit_cover'), t('fit_cover')], ['contain', '=' + t('fit_contain'), t('fit_contain')]], (v) => set({ fit: v })),
    range('Zoom', Math.round((f.zoom || 1) * 100), 100, 400, 5, (v) => set({ zoom: v / 100 }), '%'), range(t('focus_x'), Math.round((f.fx ?? .5) * 100), 0, 100, 1, (v) => set({ fx: v / 100 }), '%'), range(t('focus_y'), Math.round((f.fy ?? .5) * 100), 0, 100, 1, (v) => set({ fy: v / 100 }), '%'),
    pick(t('mask'), f.mask || 'rect', ['rect', 'ellipse', 'triangle', 'diamond', 'hexagon', 'star', 'heart', 'blob', 'blob2', 'arch', 'drop', 'cloud', 'octagon', 'parallelogram', 'quarter', 'half'].map((s) => [s, t('sh_' + s)]), (v) => set({ mask: v })),
    row(onOff(t('flip'), f.flip, (v) => set({ flip: v ? 1 : 0 })), btn(t('as_background'), () => ed.asBackground(id0), { size: 'sm', appearance: 'ghost' })),
    h('sav-input', { size: 'sm', label: t('alt'), help: t('alt_t'), value: f.alt || '', maxlength: 300, onchange: (e) => set({ alt: e.target.value }) })), sourceOf());
  if (one && f.t === 'video') out.push(sec(t('video'), btn(f.vid ? t('replace') : t('choose_video'), async () => { const v = await pickVideo(); if (v) set({ kind: v.kind, vid: v.vid, poster: v.poster || '', start: v.start || null, credit: v.credit || '', creditUrl: v.creditUrl || '', cite: v.cite || null }); }, { size: 'sm', icon: 'film', block: true }),
    ...[['auto', 'v_auto'], ['loop', 'v_loop'], ['mute', 'v_mute']].map(([k, l]) => onOff(t(l), f[k], (v) => set({ [k]: v ? 1 : 0 }))), num(t('start_at'), f.start || 0, (v) => set({ start: Math.max(0, v) })), btn(t('poster'), async () => { const m = await pickPicture(); if (m) set({ poster: m.src }); }, small)), sourceOf());

  // look
  const look = [];
  if (isLine) look.push(row(colorField(t('color'), f.stroke || f.fill || '@fg', sc, (c) => set({ stroke: c })), num(t('thickness'), f.sw ?? 3, (v) => set({ sw: clamp(v, .5, 200) }), { min: .5, step: .5 })), pick(t('dash'), f.dash || '', ['', 'dash', 'dot'].map((v) => [v, t('dash_' + (v || 'solid'))]), (v) => set({ dash: v })), h('div.grid2', ...['h1', 'h2'].map((k) => pick(t(k), f[k] || '', ['', 'arrow', 'dot'].map((v) => [v, t('head_' + (v || 'none'))]), (v) => set({ [k]: v })))));
  else if (!compound) {
    look.push(row(colorField(t('fill'), f.fill || '', sc, (c) => set({ fill: c }), { none: true, grad: true }), colorField(t('border'), f.stroke || '', sc, (c) => set({ stroke: c, ...(f.sw ? {} : { sw: 2 }) }), { none: true }), num(t('thickness'), f.sw || 0, (v) => set({ sw: clamp(v, 0, 200) }), { min: 0 })));
    if (f.t === 'shape') look.push(pick(t('shape'), f.shape || 'rect', SHAPES.filter((s) => s !== 'line').map((s) => [s, t('sh_' + s)]), (v) => set({ shape: v })), pick(t('dash'), f.dash || '', ['', 'dash', 'dot'].map((v) => [v, t('dash_' + (v || 'solid'))]), (v) => set({ dash: v })));
    if (f.t !== 'shape' || f.shape === 'rect' || f.shape === 'round' || !f.shape) look.push(range(t('corners'), f.rad || 0, 0, Math.round(Math.min(f.w, f.h) / 2), 1, (v) => set({ rad: v })));
    look.push(segmented(t('shadow'), f.shadow || 0, [[0, '=–', t('none')], [1, '=S', 'S'], [2, '=M', 'M'], [3, '=L', 'L']], (v) => set({ shadow: +v }), { show: true }));
  }
  look.push(range(t('opacity'), Math.round((f.o ?? 1) * 100), 0, 100, 5, (v) => set({ o: v / 100 }), '%'));
  out.push(sec(t('look'), ...look));
  if (one && !ed.simple) out.push(fold(t('position'), false, h('div.grid3', num('X', f.x, (v) => set({ x: v, cell: null, cr: null })), num('Y', f.y, (v) => set({ y: v, cell: null, cr: null })), num('°', f.r || 0, (v) => set({ r: ((v + 180) % 360 + 360) % 360 - 180 })), num(t('w'), f.w, (v) => set({ w: Math.max(1, v) })), num(t('hh'), f.h, (v) => set({ h: Math.max(1, v) })))));
  out.push(fold(t('behaviour'), !!(f.anim || f.link), pick(t('appears'), f.anim || '', ['', 'fade', 'up', 'left', 'zoom'].map((v) => [v, t('an_' + (v || 'none'))]), (v) => set({ anim: v })),
    one && h('sav-input', { size: 'sm', label: t('link'), placeholder: 'https://…', value: f.link?.startsWith('#') ? '' : f.link || '', onchange: (e) => { let v = e.target.value.trim(); if (v && !/^(https?:|mailto:|#s:)/i.test(v)) v = 'https://' + v; set({ link: v }); } }),
    one && pick(t('link_slide'), f.link?.startsWith('#s:') ? f.link : '', [['', t('none')], ...deck.order().map((s, i) => ['#s:' + s.sid, t('slide') + ' ' + (i + 1)])], (v) => set({ link: v }))));
  return h('div', ...out);
}

// ------------------------------------------------------------------ layouts

export function layoutsPanel(ed) {
  return h('div', segmented(t('layout_mode'), ed.relayout ? 'change' : 'new', [['new', '=' + t('layout_new'), t('layout_new')], ['change', '=' + t('layout_change'), t('layout_change')]], (v) => { ed.relayout = v === 'change'; }),
    h('div.lays', ...LAYOUTS.map((id) => tile(t('lay_' + id), () => (ed.relayout ? ed.setLayout(id) : ed.addSlide(id)), { class: 'lay' }, fluidThumb(makeSlide(id, ed.ctx, sampleFill(id)).d, ed.ctx, { mode: 'edit' }), h('span', t('lay_' + id))))));
}

// ------------------------------------------------------------------ theme

const tidy = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));
export function themePanel(ed) {
  const deck = ed.deck, m = deck.meta, set = (p) => deck.do({ k: 'deck.set', p: { theme: { ...structuredClone(m.theme), ...p } } }, 'theme' + Object.keys(p));
  const first = deck.order()[0]?.d;
  const card = (id) => { const ctx = context({ ...m, theme: { id, colors: {}, fonts: {} } }); return tile(THEMES[id].name, () => { set({ id, colors: {}, fonts: {} }); ed.refreshPanel(); }, { class: 'lay' + (m.theme.id === id ? ' on' : ''), 'data-theme': id }, first && Object.keys(first.els).length < 14 ? fluidThumb({ ...first, bg: undefined }, ctx, { index: -1 }) : fluidThumb(makeSlide('cover', ctx, { title: THEMES[id].name, subtitle: 'Aa Bb Cc' }).d, ctx), h('span', THEMES[id].name)); };
  const base = THEMES[m.theme.id] || THEMES.paper;
  const colors = h('div.grid2', ...['bg', 'fg', 'muted', 'accent', 'accent2', 'surface'].map((k) => { const c = h('sav-color-picker', { compact: true, size: 'sm', picker: 'custom', label: t('tok_' + k), value: m.theme.colors[k] || base.colors[k] }); c.addEventListener('change', (e) => { const v = e.detail?.value ?? c.value; if (/^#[0-9a-f]{6}$/i.test(v)) set({ colors: { ...m.theme.colors, [k]: v.toLowerCase() } }); }); return c; }));
  return h('div', fold(t('customize'), false, fontField(t('font_head'), m.theme.fonts.head || '', (v) => set({ fonts: tidy({ ...m.theme.fonts, head: v }) }), false, ed), fontField(t('font_body'), m.theme.fonts.body || '', (v) => set({ fonts: tidy({ ...m.theme.fonts, body: v }) }), false, ed), colors, btn(t('reset'), () => { set({ colors: {}, fonts: {} }); ed.refreshPanel(); }, { size: 'sm', appearance: 'ghost', icon: 'rotate-ccw' })),
    ...['clean', 'classic', 'creative'].map((g) => sec(t('th_' + g), h('div.lays', ...Object.keys(THEMES).filter((k) => THEMES[k].group === g).map(card)))));
}

export function mediaPanel(ed) {
  const place = (m) => { const id = [...ed.sel][0], el = ed.sel.size === 1 && ed.deck.el(ed.sid, id); if (m.isVideo) ed.insertVideo(m); else if (el?.t === 'image' && !m.video) ed.setImage(id, m); else if (m.video) ed.insertVideo({ kind: 'file', vid: m.video, poster: m.src, w: m.w, h: m.h, credit: m.credit, creditUrl: m.creditUrl, cite: m.cite }); else ed.insertImage(m); };
  return h('div.mediap', h('sav-tabs', { appearance: 'segmented' }, h('sav-tab', { label: t('images') }, searchPanel('image', place)), h('sav-tab', { label: t('videos') }, searchPanel('video', place)), h('sav-tab', { label: t('mine') }, libraryPanel(place))));
}

// ------------------------------------------------------------------ options of the presentation

export function optionsBody(ed) {
  const deck = ed.deck, o = deck.meta.opts, set = (p) => deck.do({ k: 'deck.set', p: { opts: p } });
  const sw = (k, label, help) => h('sav-switch', { checked: !!o[k], help, onchange: (e) => set({ [k]: e.target.checked }) }, label);
  const title = h('sav-input', { label: t('title'), value: deck.title, maxlength: 150, onchange: (e) => { if (e.target.value.trim()) deck.do({ k: 'deck.set', p: { title: e.target.value.trim() } }); } });
  let scale = true;
  const custom = row(num(t('w') + ' px', deck.meta.format.w, (v) => ed.setFormat('custom', clamp(v, 200, 4000), deck.meta.format.h, scale)), num(t('hh') + ' px', deck.meta.format.h, (v) => ed.setFormat('custom', deck.meta.format.w, clamp(v, 200, 4000), scale)));
  return h('sav-tabs', h('sav-tab', { label: t('general'), icon: 'settings' }, h('div.stack.pad', title, formatPicker(deck.meta.format.id, (id) => { ed.setFormat(id, ...FORMATS[id], scale); }), custom, h('sav-switch', { checked: true, size: 'sm', onchange: (e) => { scale = e.target.checked; } }, t('fmt_scale')))),
    h('sav-tab', { label: t('on_slides'), icon: 'layers' }, h('div.stack.pad', sw('numbers', t('slide_numbers')), h('sav-input', { label: t('footer'), value: o.footer || '', maxlength: 120, onchange: (e) => set({ footer: e.target.value }) }))),
    h('sav-tab', { label: t('show'), icon: 'play' }, h('div.stack.pad', pick(t('transition'), o.tr || 'none', ['none', 'fade', 'slide', 'push', 'zoom'].map((v) => [v, t('tr_' + v)]), (v) => set({ tr: v })), h('sav-number-input', { label: t('auto_advance'), value: o.auto || 0, min: 0, max: 600, unit: 's', help: t('auto_advance_t'), onchange: (e) => set({ auto: +e.target.value || 0 }) }), sw('loop', t('loop')))));
}
