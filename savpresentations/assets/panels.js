/** The side panel of the editor: elements to insert, properties, layouts, themes, pictures and videos. */
import { h, icon, btn, iconBtn, item, $, $$, clamp, oops, ok, userSetting, mobile } from './core.js';
import { t } from './i18n.js';
import { THEMES, FONTS, FORMATS, slideContext, styleOf, context, gradient } from './themes.js';
import { SHAPES, shapePath, toSvgPath } from './shapes.js';
import { LAYOUTS, makeSlide, relayout } from './layouts.js';
import { thumb, fluidThumb, mediaUrl, cssFill, sorted } from './render.js';
import { searchPanel, libraryPanel, pickPicture, pickVideo, uploadFiles } from './media.js';
import { formatPicker } from './home.js';

const TOKENS = ['@fg', '@muted', '@accent', '@accent2', '@surface', '@bg', '@onaccent'];
const PALETTE = ['#000000', '#374151', '#9ca3af', '#e5e7eb', '#ffffff', '#dc2626', '#ea580c', '#f59e0b', '#84cc16', '#16a34a', '#0d9488', '#0891b2', '#2563eb', '#4f46e5', '#9333ea', '#db2777'];

const sec = (title, ...kids) => h('section.psec', title && h('h3', title), ...kids);
const row = (...kids) => h('div.prow', ...kids);
const num = (label, value, onchange, attrs = {}) => h('label.nf', h('span', label), h('input', { type: 'number', value: Math.round(value * 100) / 100, step: 1, ...attrs, onchange: (e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onchange(v); }, onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); } }));
const seg = (value, opts, onpick) => h('div.seg', ...opts.map(([v, ic, label]) => h('button', { type: 'button', title: label, 'aria-label': label, 'aria-pressed': String(v === value), class: v === value ? 'on' : '', onclick: (e) => { $$('button', e.currentTarget.parentElement).forEach((x) => x.classList.toggle('on', x === e.currentTarget)); onpick(v); } }, ic.startsWith?.('=') ? ic.slice(1) : icon(ic))));
const toggle = (on, ic, label, onpick) => h('button.tgl', { type: 'button', title: label, 'aria-label': label, 'aria-pressed': String(!!on), class: on ? 'on' : '', onclick: (e) => { const v = !e.currentTarget.classList.contains('on'); e.currentTarget.classList.toggle('on', v); e.currentTarget.setAttribute('aria-pressed', v); onpick(v); } }, icon(ic));
const range = (label, value, min, max, step, oninput) => h('sav-range', { label, value, min, max, step, 'show-value': true, oninput: (e) => oninput(+e.target.value) });

/** A colour: the ones of the theme (they follow it when it changes), a palette, any colour; optionally none and gradients. */
export function colorField(label, value, sc, onpick, { none = false, grad = false } = {}) {
  const sw = h('button.cbtn', { type: 'button', slot: 'trigger', 'aria-label': label });
  const show = (v) => { const css = v ? cssFill(v, sc) : ''; sw.style.background = css.startsWith('linear') ? css : ''; sw.style.backgroundColor = css && !css.startsWith('linear') ? css : ''; sw.classList.toggle('none', !v); };
  show(value);
  let cur = value;
  const set = (v, close) => { cur = v; show(v); onpick(v); if (close) pop.hide(); };
  const grid = (list) => h('div.sws', ...list.map((c) => h('button.sw', { type: 'button', title: c[0] === '@' ? t('tok_' + c.slice(1)) : c, 'aria-label': c, style: `background:${sc.color(c)}`, onclick: () => set(c, true) })));
  const pop = h('sav-popover', { placement: 'bottom-end', 'sheet-on-mobile': true, heading: label, style: '--width:16rem' }, sw);
  pop.addEventListener('sav-show', () => {
    if (pop.dataset.built) return;
    pop.dataset.built = 1;
    const hex = cur && cur[0] === '#' ? cur : cur && cur[0] === '@' ? sc.color(cur) : '#3b82f6';
    const cp = h('sav-color-picker', { value: hex, alpha: true, picker: 'custom', size: 'sm', label: t('other_color') });
    cp.addEventListener('change', (e) => { const v = e.detail?.value ?? cp.value; if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)) set(v.toLowerCase()); });
    const g = gradient(cur);
    let a = g?.a || '@accent', b = g?.b || '@accent2', ang = g?.ang ?? 135;
    const gset = () => set(`g|${ang}|${a}|${b}`);
    pop.append(h('div.cpop', h('small', t('theme_colors')), grid(TOKENS), h('small', t('palette')), grid(PALETTE), cp,
      grad && h('div', h('small', t('gradient')), h('div.prow', mini(a, (v) => { a = v; gset(); }), mini(b, (v) => { b = v; gset(); }), num('°', ang, (v) => { ang = clamp(v, 0, 360); gset(); }, { min: 0, max: 360, step: 15 }))),
      none && btn(t('none'), () => set('', true), { size: 'sm', appearance: 'outline', variant: 'neutral', block: true })));
  });
  const mini = (v, f) => h('label.mini', { style: `background:${sc.color(v)}` }, h('input', { type: 'color', value: (sc.color(v) || '#000000').slice(0, 7), oninput: (e) => { e.target.parentElement.style.background = e.target.value; f(e.target.value); } }));
  return h('div.cf', h('span', label), pop);
}

export function fontField(label, value, onpick, themeOpt = true) {
  const s = h('sav-select', { label, value: value || '', size: 'sm', searchable: true, onchange: (e) => onpick(e.target.value) });
  if (themeOpt) s.append(h('option', { value: '@head' }, t('font_head')), h('option', { value: '@body' }, t('font_body')));
  else s.append(h('option', { value: '' }, t('theme_font')));
  for (const [k, label2] of [['sans-serif', 'f_sans'], ['serif', 'f_serif'], ['monospace', 'f_mono'], ['cursive', 'f_script']]) s.append(h('optgroup', { label: t(label2) }, ...Object.entries(FONTS).filter(([, f]) => f[1] === k).map(([id, f]) => h('option', { value: id, style: `font-family:"SP ${f[0]}"` }, f[0]))));
  return s;
}

// ------------------------------------------------------------------ elements to insert

export function elementsPanel(ed) {
  const drag = (what) => ({ draggable: true, ondragstart: (e) => { e.dataTransfer.setData('text/sp-insert', what); e.dataTransfer.effectAllowed = 'copy'; }, onclick: () => ed.insert(what) });
  const txt = (role, label) => h('button.ptext.p-' + role, { type: 'button', ...drag('text:' + role) }, label);
  const shape = (s) => {
    const ns = 'http://www.w3.org/2000/svg', v = document.createElementNS(ns, 'svg'), p = document.createElementNS(ns, 'path');
    v.setAttribute('viewBox', '-2 -2 44 34');
    const [w, hh] = /arrow|chevron|homeplate|speech|parallelogram|cloud|wave|half|trapezoid/.test(s) ? [40, 28] : s === 'rect' || s === 'round' ? [38, 28] : [30, 30];
    p.setAttribute('d', s === 'line' ? 'M0 26L38 4' : toSvgPath(shapePath(s, w, hh)));
    p.setAttribute('transform', `translate(${(40 - w) / 2} ${(30 - hh) / 2})`);
    p.setAttribute('fill-rule', 'evenodd');
    if (s === 'line') { p.removeAttribute('transform'); p.setAttribute('class', 'ln'); }
    v.append(p);
    return h('button.pshape', { type: 'button', title: t('sh_' + s), 'aria-label': t('sh_' + s), ...drag('shape:' + s) }, v);
  };
  return h('div', h('p.muted.hint', t(mobile() ? 'tap_insert' : 'drag_insert')),
    sec(t('text'), h('div.ptexts', txt('title', t('r_title')), txt('heading', t('r_heading')), txt('body', t('r_body')), txt('list', t('r_list')), txt('quote', t('r_quote')), txt('big', '123'), txt('caption', t('r_caption')))),
    sec(t('media'), h('div.pmedia', h('button.pbig', { type: 'button', ...drag('image'), onclick: () => ed.insert('image') }, icon('image'), t('image')), h('button.pbig', { type: 'button', ...drag('video') }, icon('film'), t('video')), h('button.pbig', { type: 'button', onclick: async () => { const { pickFile } = await import('./core.js'); await uploadFiles(await pickFile('image/*', true), (m) => ed.insertImage(m)); } }, icon('upload'), t('from_computer')))),
    sec(t('lines'), h('div.pshapes', ...['line', 'line:arrow', 'line:double'].map((s) => { const b = shape('line'); b.onclick = null; const c = h('button.pshape.pl', { type: 'button', title: t('sh_' + s.replace(':', '_')), 'aria-label': t('sh_' + s.replace(':', '_')), ...drag('shape:' + s) }, icon({ line: 'minus', 'line:arrow': 'move-right', 'line:double': 'move-horizontal' }[s])); return c; }))),
    sec(t('shapes'), h('div.pshapes', ...SHAPES.filter((s) => s !== 'line').map(shape))));
}

// ------------------------------------------------------------------ properties of the selection, or of the slide

export function propsPanel(ed) {
  const els = [...ed.sel].map((id) => [id, ed.deck.el(ed.sid, id)]).filter((x) => x[1]);
  return els.length ? elementProps(ed, els) : slideProps(ed);
}

function slideProps(ed) {
  const s = ed.deck.slide(ed.sid);
  if (!s) return h('div');
  const d = s.d, sc = slideContext(ed.ctx, d), set = (p) => ed.deck.do({ k: 'slide.set', s: ed.sid, p }, 'slide' + Object.keys(p));
  const b = sc.bg;
  const notes = h('sav-textarea', { label: t('speaker_notes'), rows: 5, value: d.notes || '', maxlength: 8000, help: t('speaker_notes_t'), oninput: (e) => { clearTimeout(notes.t); notes.t = setTimeout(() => set({ notes: notes.value }), 500); } });
  notes.addEventListener('keydown', (e) => e.stopPropagation());
  return h('div', sec(t('slide'),
    h('sav-select', { label: t('variant'), size: 'sm', value: d.variant || 'content', onchange: (e) => set({ variant: e.target.value }) }, ...['content', 'cover', 'section', 'plain'].map((v) => h('option', { value: v }, t('v_' + v)))),
    h('div.lbl', t('background')),
    row(colorField(t('color'), b.t === 'c' ? b.c : '', sc, (c) => set({ bg: c ? (c.startsWith('g|') ? (([, g, a, z]) => ({ t: 'g', a, b: z, ang: +g }))(c.split('|')) : { t: 'c', c }) : null }), { none: true, grad: true }),
      btn(t('image'), async () => { const m = await pickPicture(); if (m) set({ bg: { t: 'i', src: m.src, dim: .2, credit: m.credit || '', creditUrl: m.creditUrl || '' } }); }, { size: 'sm', appearance: 'outline', variant: 'neutral', icon: 'image' }), d.bg && iconBtn('rotate-ccw', t('reset'), () => set({ bg: null }), { size: 'sm' })),
    b.t === 'i' && range(t('dim'), Math.round((b.dim || 0) * 100), 0, 95, 5, (v) => set({ bg: { ...b, dim: v / 100 } })),
    d.bg && btn(t('bg_all'), () => ed.deck.do(ed.deck.order().map((x) => ({ k: 'slide.set', s: x.sid, p: { bg: structuredClone(d.bg) } }))), { size: 'sm', appearance: 'ghost', variant: 'neutral' })),
    sec(t('show'), h('sav-select', { label: t('transition'), size: 'sm', value: d.tr || '', onchange: (e) => set({ tr: e.target.value || null }) }, h('option', { value: '' }, t('tr_default')), ...['none', 'fade', 'slide', 'push', 'zoom'].map((v) => h('option', { value: v }, t('tr_' + v)))),
      h('sav-switch', { checked: !!d.hide, onchange: (e) => set({ hide: e.target.checked ? 1 : null }) }, t('hide_slide'))),
    sec('', notes));
}

function elementProps(ed, els) {
  const deck = ed.deck, sc = slideContext(ed.ctx, deck.slide(ed.sid).d), one = els.length === 1 ? els[0][1] : null, f = els[0][1];
  const all = (fn) => els.every((x) => fn(x[1]));
  const set = (p, only) => deck.do(els.filter((x) => !only || only(x[1])).map(([id]) => ({ k: 'el.set', s: ed.sid, e: id, p: { ...p } })), 'prop' + Object.keys(p));
  const hasText = all((e) => e.t === 'text' || (e.t === 'shape' && e.shape !== 'line')), isLine = all((e) => e.t === 'shape' && e.shape === 'line');
  const st = styleOf(f, sc), out = [];

  // arrange
  out.push(sec(one ? t({ text: 'text', image: 'image', video: 'video', shape: isLine ? 'line' : 'shape' }[f.t]) : t('n_selected', { n: els.length }),
    h('div.tools', iconBtn('copy', t('duplicate'), () => ed.duplicateSel()), iconBtn('bring-to-front', t('to_front'), () => ed.zorder('front')), iconBtn('send-to-back', t('to_back'), () => ed.zorder('back')), iconBtn('arrow-up', t('forward'), () => ed.zorder('up')), iconBtn('arrow-down', t('backward'), () => ed.zorder('down')), iconBtn(f.lock ? 'lock' : 'lock-open', f.lock ? t('unlock') : t('lock'), () => { set({ lock: f.lock ? null : 1 }); ed.refreshPanel(); }), iconBtn('trash', t('delete'), () => ed.deleteSel(), { variant: 'danger' })),
    h('div.tools', ...[['align-start-vertical', 'al_left'], ['align-center-vertical', 'al_center'], ['align-end-vertical', 'al_right'], ['align-start-horizontal', 'al_top'], ['align-center-horizontal', 'al_middle'], ['align-end-horizontal', 'al_bottom']].map(([ic, k]) => iconBtn(ic, t(k), () => ed.align(k.slice(3)))), els.length > 2 && iconBtn('align-horizontal-distribute-center', t('dist_h'), () => ed.align('dh')), els.length > 2 && iconBtn('align-vertical-distribute-center', t('dist_v'), () => ed.align('dv')))));

  // text
  if (hasText) {
    const setS = (p) => set(p);
    out.push(sec(f.t === 'text' ? t('style') : t('text'),
      f.t === 'text' && h('sav-select', { size: 'sm', label: t('role'), value: f.role || 'body', onchange: (e) => { set({ role: e.target.value, size: null, font: null, color: null, bold: null, lh: null, ls: null, align: null, italic: null, caps: null }); ed.refreshPanel(); } }, ...['title', 'subtitle', 'heading', 'body', 'caption', 'label', 'quote', 'big'].map((r) => h('option', { value: r }, t('r_' + r)))),
      fontField(t('typeface'), f.font || st.font, (v) => setS({ font: v })),
      row(num(t('size'), st.size, (v) => setS({ size: clamp(v, 4, 800) }), { min: 4, max: 800 }), colorField(t('color'), st.color, sc, (c) => setS({ color: c || null }))),
      row(toggle(st.bold, 'bold', t('bold'), (v) => setS({ bold: v ? 1 : 0 })), toggle(st.italic, 'italic', t('italic'), (v) => setS({ italic: v ? 1 : 0 })), toggle(st.under, 'underline', t('underline'), (v) => setS({ under: v ? 1 : 0 })), toggle(st.caps, 'case-upper', t('caps'), (v) => setS({ caps: v ? 1 : 0 }))),
      row(seg(st.align, [['left', 'text-align-start', t('al_left')], ['center', 'text-align-center', t('al_center')], ['right', 'text-align-end', t('al_right')], ['justify', 'text-align-justify', t('justify')]], (v) => setS({ align: v }))),
      row(seg(st.va, [['top', 'align-vertical-justify-start', t('al_top')], ['middle', 'align-vertical-justify-center', t('al_middle')], ['bottom', 'align-vertical-justify-end', t('al_bottom')]], (v) => setS({ va: v }))),
      row(num(t('line_height'), st.lh, (v) => setS({ lh: clamp(v, .6, 4) }), { step: .05 }), num(t('letter_space'), st.ls, (v) => setS({ ls: clamp(v, -20, 100) }), { step: .5 }), num(t('padding'), st.pad, (v) => setS({ pad: clamp(v, 0, 400) })))));
  }
  // picture
  if (one && (f.t === 'image')) {
    out.push(sec(t('image'), btn(f.src ? t('replace') : t('choose_picture'), async () => { const m = await pickPicture(); if (m) ed.setImage(els[0][0], m); }, { size: 'sm', icon: 'image', block: true }),
      seg(f.fit || 'cover', [['cover', '=' + t('fit_cover'), t('fit_cover')], ['contain', '=' + t('fit_contain'), t('fit_contain')]], (v) => set({ fit: v })),
      range('Zoom', Math.round((f.zoom || 1) * 100), 100, 400, 5, (v) => set({ zoom: v / 100 })), range(t('focus_x'), Math.round((f.fx ?? .5) * 100), 0, 100, 1, (v) => set({ fx: v / 100 })), range(t('focus_y'), Math.round((f.fy ?? .5) * 100), 0, 100, 1, (v) => set({ fy: v / 100 })),
      h('sav-select', { size: 'sm', label: t('mask'), value: f.mask || 'rect', onchange: (e) => set({ mask: e.target.value }) }, ...['rect', 'ellipse', 'triangle', 'diamond', 'hexagon', 'star', 'heart', 'blob', 'blob2', 'arch', 'drop', 'cloud', 'octagon', 'parallelogram', 'quarter', 'half'].map((s) => h('option', { value: s }, t('sh_' + s)))),
      row(h('sav-switch', { size: 'sm', checked: !!f.flip, onchange: (e) => set({ flip: e.target.checked ? 1 : 0 }) }, t('flip')), btn(t('as_background'), () => ed.asBackground(els[0][0]), { size: 'sm', appearance: 'ghost', variant: 'neutral' })),
      h('sav-input', { size: 'sm', label: t('alt'), help: t('alt_t'), value: f.alt || '', maxlength: 300, onchange: (e) => set({ alt: e.target.value }) }), f.credit && h('small.muted', f.credit)));
  }
  if (one && f.t === 'video') {
    out.push(sec(t('video'), btn(f.vid ? t('replace') : t('choose_video'), async () => { const v = await pickVideo(); if (v) set({ kind: v.kind, vid: v.vid, poster: v.poster || '', start: v.start || null, credit: v.credit || '', creditUrl: v.creditUrl || '' }); }, { size: 'sm', icon: 'film', block: true }),
      ...[['auto', 'v_auto'], ['loop', 'v_loop'], ['mute', 'v_mute']].map(([k, l]) => h('sav-switch', { size: 'sm', checked: !!f[k], onchange: (e) => set({ [k]: e.target.checked ? 1 : 0 }) }, t(l))), num(t('start_at'), f.start || 0, (v) => set({ start: Math.max(0, v) })), btn(t('poster'), async () => { const m = await pickPicture(); if (m) set({ poster: m.src }); }, { size: 'sm', appearance: 'outline', variant: 'neutral' }), f.credit && h('small.muted', f.credit)));
  }
  // look
  const look = [];
  if (isLine) look.push(row(colorField(t('color'), f.stroke || f.fill || '@fg', sc, (c) => set({ stroke: c })), num(t('thickness'), f.sw ?? 3, (v) => set({ sw: clamp(v, .5, 200) }), { min: .5, step: .5 })), h('sav-select', { size: 'sm', label: t('dash'), value: f.dash || '', onchange: (e) => set({ dash: e.target.value }) }, ...['', 'dash', 'dot'].map((v) => h('option', { value: v }, t('dash_' + (v || 'solid'))))), row(...['h1', 'h2'].map((k) => h('sav-select', { size: 'sm', label: t(k), value: f[k] || '', onchange: (e) => set({ [k]: e.target.value }) }, ...['', 'arrow', 'dot'].map((v) => h('option', { value: v }, t('head_' + (v || 'none'))))))));
  else {
    look.push(row(colorField(t('fill'), f.fill || '', sc, (c) => set({ fill: c }), { none: true, grad: true }), colorField(t('border'), f.stroke || '', sc, (c) => set({ stroke: c, ...(f.sw ? {} : { sw: 2 }) }), { none: true }), num(t('thickness'), f.sw || 0, (v) => set({ sw: clamp(v, 0, 200) }), { min: 0 })));
    if (f.t === 'shape') look.push(h('sav-select', { size: 'sm', label: t('shape'), value: f.shape || 'rect', onchange: (e) => set({ shape: e.target.value }) }, ...SHAPES.filter((s) => s !== 'line').map((s) => h('option', { value: s }, t('sh_' + s)))), h('sav-select', { size: 'sm', label: t('dash'), value: f.dash || '', onchange: (e) => set({ dash: e.target.value }) }, ...['', 'dash', 'dot'].map((v) => h('option', { value: v }, t('dash_' + (v || 'solid'))))));
    if (f.t !== 'shape' || f.shape === 'rect' || f.shape === 'round' || !f.shape) look.push(range(t('corners'), f.rad || 0, 0, Math.round(Math.min(f.w, f.h) / 2), 1, (v) => set({ rad: v })));
    look.push(h('div.lbl', t('shadow')), seg(f.shadow || 0, [[0, '=–', t('none')], [1, '=S', 'S'], [2, '=M', 'M'], [3, '=L', 'L']], (v) => set({ shadow: v })));
  }
  look.push(range(t('opacity'), Math.round((f.o ?? 1) * 100), 0, 100, 5, (v) => set({ o: v / 100 })));
  out.push(sec(t('look'), ...look));
  // place, animation, link
  if (one) {
    const id = els[0][0], live = deck.el(ed.sid, id);
    out.push(sec(t('position'), h('div.grid4', num('X', live.x, (v) => set({ x: v })), num('Y', live.y, (v) => set({ y: v })), num(t('w'), live.w, (v) => set({ w: Math.max(1, v) })), num(t('hh'), live.h, (v) => set({ h: Math.max(1, v) })), num('°', live.r || 0, (v) => set({ r: ((v + 180) % 360 + 360) % 360 - 180 })))));
  }
  out.push(sec(t('behaviour'), h('sav-select', { size: 'sm', label: t('appears'), value: f.anim || '', onchange: (e) => set({ anim: e.target.value }) }, ...['', 'fade', 'up', 'left', 'zoom'].map((v) => h('option', { value: v }, t('an_' + (v || 'none'))))),
    one && h('sav-input', { size: 'sm', label: t('link'), placeholder: 'https://…', value: f.link || '', onchange: (e) => { let v = e.target.value.trim(); if (v && !/^(https?:|mailto:|#s:)/i.test(v)) v = 'https://' + v; set({ link: v }); } }),
    one && h('sav-select', { size: 'sm', label: t('link_slide'), value: f.link?.startsWith('#s:') ? f.link : '', onchange: (e) => set({ link: e.target.value }) }, h('option', { value: '' }, t('none')), ...deck.order().map((s, i) => h('option', { value: '#s:' + s.sid }, t('slide') + ' ' + (i + 1))))));
  return h('div', ...out);
}

// ------------------------------------------------------------------ layouts

export function layoutsPanel(ed) {
  const add = h('sav-switch', { checked: !ed.relayout, onchange: (e) => { ed.relayout = !e.target.checked; } }, t('layout_new'));
  return h('div', sec(t('layouts'), add, h('div.lays', ...LAYOUTS.map((id) => h('button.lay', { type: 'button', title: t('lay_' + id), onclick: () => (ed.relayout ? ed.setLayout(id) : ed.addSlide(id)) }, fluidThumb(makeSlide(id, ed.ctx).d, ed.ctx, { mode: 'edit' }), h('span', t('lay_' + id)))))));
}

// ------------------------------------------------------------------ theme

export function themePanel(ed) {
  const deck = ed.deck, m = deck.meta, set = (p) => deck.do({ k: 'deck.set', p: { theme: { ...structuredClone(m.theme), ...p } } }, 'theme' + Object.keys(p));
  const first = deck.order()[0]?.d;
  const card = (id) => { const ctx = context({ ...m, theme: { id, colors: {}, fonts: {} } }); return h('button.lay', { type: 'button', class: m.theme.id === id ? 'on' : '', onclick: () => { set({ id, colors: {}, fonts: {} }); ed.refreshPanel(); } }, first && Object.keys(first.els).length < 14 ? fluidThumb({ ...first, bg: undefined }, ctx, { index: -1 }) : fluidThumb(makeSlide('cover', ctx, { title: THEMES[id].name, subtitle: 'Aa Bb Cc' }).d, ctx), h('span', THEMES[id].name)); };
  const base = THEMES[m.theme.id] || THEMES.paper, sc = slideContext(ed.ctx, { variant: 'content' });
  const colors = h('div.grid2', ...['bg', 'fg', 'muted', 'accent', 'accent2', 'surface'].map((k) => { const v = m.theme.colors[k] || base.colors[k]; const inp = h('label.tc', h('span', { style: `background:${v}` }), h('input', { type: 'color', value: v, oninput: (e) => { inp.firstChild.style.background = e.target.value; clearTimeout(inp.t); inp.t = setTimeout(() => set({ colors: { ...m.theme.colors, [k]: e.target.value } }), 200); } }), t('tok_' + k)); return inp; }));
  return h('div', ...['clean', 'classic', 'creative'].map((g) => sec(t('th_' + g), h('div.lays', ...Object.keys(THEMES).filter((k) => THEMES[k].group === g).map(card)))),
    sec(t('customize'), fontField(t('font_head'), m.theme.fonts.head || '', (v) => set({ fonts: clean({ ...m.theme.fonts, head: v }) }), false), fontField(t('font_body'), m.theme.fonts.body || '', (v) => set({ fonts: clean({ ...m.theme.fonts, body: v }) }), false), colors, (Object.keys(m.theme.colors).length || Object.keys(m.theme.fonts).length) ? btn(t('reset'), () => { set({ colors: {}, fonts: {} }); ed.refreshPanel(); }, { size: 'sm', appearance: 'ghost', variant: 'neutral', icon: 'rotate-ccw' }) : null));
}
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));

export function mediaPanel(ed) {
  const place = (m) => { const id = [...ed.sel][0], el = ed.sel.size === 1 && ed.deck.el(ed.sid, id); if (el?.t === 'image' && !m.video) ed.setImage(id, m); else if (m.video) ed.insertVideo({ kind: 'file', vid: m.video, poster: m.src, w: m.w, h: m.h, credit: m.credit, creditUrl: m.creditUrl }); else ed.insertImage(m); };
  return h('div.mediap', h('sav-tabs', { appearance: 'segmented' }, h('sav-tab', { label: t('images') }, searchPanel('image', place)), h('sav-tab', { label: t('videos') }, searchPanel('video', place)), h('sav-tab', { label: t('mine') }, libraryPanel(place))));
}

// ------------------------------------------------------------------ options of the presentation

export function optionsBody(ed) {
  const deck = ed.deck, o = deck.meta.opts, set = (p) => deck.do({ k: 'deck.set', p: { opts: p } });
  const sw = (k, label, help) => h('sav-switch', { checked: !!o[k], help, onchange: (e) => set({ [k]: e.target.checked }) }, label);
  const title = h('sav-input', { label: t('title'), value: deck.title, maxlength: 150, onchange: (e) => { if (e.target.value.trim()) deck.do({ k: 'deck.set', p: { title: e.target.value.trim() } }); } });
  let scale = true;
  const scaleSw = h('sav-switch', { checked: true, size: 'sm', onchange: (e) => { scale = e.target.checked; } }, t('fmt_scale'));
  const custom = h('div.prow', num(t('w'), deck.meta.format.w, (v) => ed.setFormat('custom', clamp(v, 200, 4000), deck.meta.format.h, scale)), num(t('hh'), deck.meta.format.h, (v) => ed.setFormat('custom', deck.meta.format.w, clamp(v, 200, 4000), scale)));
  return h('div.opts', sec('', title), sec(t('format'), formatPicker(deck.meta.format.id, (id) => { ed.setFormat(id, ...FORMATS[id], scale); }), scaleSw, h('div.lbl', t('fmt_custom')), custom),
    sec(t('on_slides'), sw('numbers', t('slide_numbers')), h('sav-input', { label: t('footer'), value: o.footer || '', maxlength: 120, onchange: (e) => set({ footer: e.target.value }) })),
    sec(t('show'), h('sav-select', { label: t('transition'), value: o.tr || 'none', onchange: (e) => set({ tr: e.target.value }) }, ...['none', 'fade', 'slide', 'push', 'zoom'].map((v) => h('option', { value: v }, t('tr_' + v)))), h('sav-number-input', { label: t('auto_advance'), value: o.auto || 0, min: 0, max: 600, unit: 's', help: t('auto_advance_t'), onchange: (e) => set({ auto: +e.target.value || 0 }) }), sw('loop', t('loop'))),
    sec(t('viewers'), sw('comments', t('opt_comments')), sw('download', t('opt_download')), sw('copy', t('opt_copy'))));
}
