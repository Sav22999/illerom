/** The screen of a presentation: editing for who can, looking (with comments and personal notes) for the others. */
import { state, api, get, h, icon, btn, iconBtn, item, $, $$, clamp, uid, go, oops, ok, toast, errText, mobile, isMac, userSetting, dialog, confirmBox, promptBox, uploadPicture, copyText } from './core.js';
import { t } from './i18n.js';
import { brand, logo } from './auth.js';
import { userMenu } from './home.js';
import { Deck, fixSlide } from './model.js';
import { context, slideContext, styleOf, FORMATS } from './themes.js';
import { slideNode, thumb, sorted } from './render.js';
import { makeSlide, relayout } from './layouts.js';
import { createStage } from './stage.js';
import { elementsPanel, propsPanel, layoutsPanel, themePanel, mediaPanel, optionsBody } from './panels.js';
import { createMarks } from './marks.js';
import { startShow, videoNode } from './present.js';
import { shareDialog, reportDialog, deckUrl } from './share.js';
import { pickPicture, pickVideo, uploadFiles } from './media.js';
import { downloadMenu } from './files.js';
import { plain, textToHtml, fragment, serialize, okLink } from './richtext.js';

export async function deckScreen(app, deckId, q) {
  document.body.classList.add('ed');
  app.append(h('div.center', h('sav-spinner', { style: 'font-size:2rem' })));
  let data;
  try { data = await get('deck.get', { d: deckId }); } catch (e) {
    const signIn = e.status === 401;
    app.replaceChildren(h('header.htop', brand(), h('div.spacer'), state.user && userMenu()), h('div.center', h('sav-empty-state', { heading: signIn ? t('need_sign_in') : t('cant_open'), text: e.network ? t('err_network') : errText(e), icon: signIn ? 'lock' : 'presentation' }, signIn ? btn(t('sign_in'), () => { sessionStorage.setItem('sp-back', location.pathname + location.search); go('?signin=login'); }) : btn(t('home'), () => go('./')))));
    return;
  }
  app.textContent = '';
  const deck = new Deck(data.deck, data.role);
  const ed = { deck, user: state.user, sel: new Set(), sid: deck.order()[0]?.sid || '', tab: '', editing: null, closeText() {}, root: app, edit: deck.canEdit, relayout: false };
  ed.ctx = context(deck.meta);
  document.title = deck.title + ' — SavPresentations';
  if (q.get('slide') && deck.slide(q.get('slide'))) ed.sid = q.get('slide');

  // ------------------------------------------------------------------ frame
  const stage = ed.stage = createStage(ed), marks = ed.marks = createMarks(ed);
  ed.drawPins = marks.pins;
  const title = h('input.dtitle', { value: deck.title, maxlength: 150, readonly: !ed.edit, 'aria-label': t('title'), onchange: () => { const v = title.value.trim(); if (v) deck.do({ k: 'deck.set', p: { title: v } }); else title.value = deck.title; }, onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') title.blur(); } });
  const status = h('span.status'), people = h('div.people-now'), undoB = iconBtn('undo-2', t('undo'), () => deck.undo()), redoB = iconBtn('redo-2', t('redo'), () => deck.redo());
  const zoomEl = h('sav-zoom', { value: 100, min: 10, max: 500, step: 10, size: 'sm', appearance: 'plain' });
  let zoomSet = false;
  zoomEl.addEventListener('change', (e) => { if (!zoomSet) stage.setZoom((e.detail?.value ?? zoomEl.value) / 100); });
  ed.onZoom = (v) => { zoomSet = true; zoomEl.value = v; zoomSet = false; };
  const menu = h('sav-dropdown', { placement: 'bottom-end', 'sheet-on-mobile': true, label: deck.title }, h('sav-button', { slot: 'trigger', icon: 'ellipsis-vertical', appearance: 'ghost', variant: 'neutral', square: true, label: t('more') }));
  const fillMenu = () => { const e = ed.edit; menu.querySelectorAll(':not([slot="trigger"])').forEach((x) => { if (x.parentElement === menu) x.remove(); }); menu.append(...[e && item('options', 'settings', t('deck_options')), (e || deck.meta.opts.download !== false) && item('dl', 'download', t('download')), state.user && (e || deck.meta.opts.copy !== false) && item('copy', 'copy', t('make_copy')), e && item('credits', 'copyright', t('credits_slide')), item('link', 'link', t('copy_link')), item('keys', 'keyboard', t('shortcuts')), deck.role !== 'owner' && item('report', 'flag', t('report'), { variant: 'danger' })].filter(Boolean)); };
  fillMenu();
  menu.addEventListener('sav-select', async (e) => {
    try {
      switch (e.detail.value) {
        case 'options': return void dialog(t('deck_options'), optionsBody(ed), [[t('done'), true]], { width: '38rem' });
        case 'dl': return void downloadMenu(ed);
        case 'copy': { const r = await api('deck.duplicate', { d: deck.uid, title: t('copy_of', { title: deck.title }) }); return go('?d=' + r.uid); }
        case 'credits': return ed.creditsSlide();
        case 'link': return copyText(deckUrl(deck.uid));
        case 'keys': return void shortcuts();
        case 'report': return void reportDialog(deck.uid);
      }
    } catch (x) { oops(x); }
  });
  const ins = h('div.ins', ...[['type', 'text', () => ed.insert('text:body')], ['image', 'image', () => ed.insert('image')], ['film', 'video', () => ed.insert('video')], ['shapes', 'shapes', () => setTab('elements')], ['layout-template', 'layouts', () => setTab('layouts')], ['palette', 'theme', () => setTab('theme')]].map(([ic, k, fn]) => h('sav-button', { icon: ic, appearance: 'ghost', variant: 'neutral', size: 'sm', onclick: fn, label: t(k) }, h('span.insl', t(k)))));
  const present = h('sav-button', { icon: 'play', onclick: () => show() , class: 'presentb' }, h('span.insl', t('present')));
  const shareB = h('sav-button', { icon: 'user-plus', appearance: 'soft', onclick: () => shareDialog(deck.uid, deck.title) }, h('span.insl', t('share')));
  const top = h('header.etop', h('a.ehome', { href: './', 'data-go': true, title: t('home'), 'aria-label': t('home') }, logo(30)), h('div.etitle', title, status), ed.edit && h('div.hist', undoB, redoB), ins, h('div.spacer'), people, (deck.role === 'owner' || deck.role === 'editor') && shareB, present, menu, !mobile() && (state.user ? userMenu() : btn(t('sign_in'), () => { sessionStorage.setItem('sp-back', location.pathname + location.search); go('?signin=login'); }, { appearance: 'outline', variant: 'neutral' })));
  const strip = h('div.strip', { role: 'listbox', 'aria-label': t('slides'), tabindex: 0 }), addB = h('sav-button', { icon: 'plus', appearance: 'outline', variant: 'neutral', block: true, size: 'sm', onclick: () => ed.addSlide() }, t('new_slide'));
  const left = h('aside.eleft', strip, ed.edit && addB), panel = h('aside.epanel'), rail = h('nav.rail', { 'aria-label': t('panels') });
  const center = h('section.ecenter', stage.scroller, h('div.ebottom', h('span.sn'), h('div.spacer'), iconBtn('maximize', t('fit'), () => stage.setZoom(0), { size: 'sm', place: 'top' }), zoomEl));
  app.append(top, h('div.emain', left, center, panel, rail));

  // ------------------------------------------------------------------ strip of slides
  const thumbs = new Map();
  let stripW = 0;
  function drawStrip() {
    const list = deck.order(), w = stripW = mobile() ? 92 : 150;
    strip.replaceChildren(...list.map((s, i) => {
      const b = h('div.st', { role: 'option', 'data-sid': s.sid, draggable: ed.edit && !mobile(), onclick: () => ed.goto(s.sid) }, h('span.stn', String(i + 1)), h('div.stt'), h('div.stp'));
      thumbs.set(s.sid, b);
      fillThumb(s.sid, w);
      return b;
    }));
    for (const id of [...thumbs.keys()]) if (!deck.slide(id)) thumbs.delete(id);
    markStrip();
  }
  function fillThumb(sid, w = stripW) {
    const s = deck.slide(sid), b = thumbs.get(sid);
    if (!s || !b) return;
    b.querySelector('.stt').replaceChildren(thumb(s.d, ed.ctx, w, { index: deck.index(sid), count: deck.slides.size }));
    b.classList.toggle('hid', !!s.d.hide);
  }
  const dirty = new Set();
  let dirtyT;
  const touch = (sid) => { dirty.add(sid); clearTimeout(dirtyT); dirtyT = setTimeout(() => { for (const d of dirty) fillThumb(d); dirty.clear(); }, 180); };
  function markStrip() {
    for (const [id, b] of thumbs) { b.classList.toggle('on', id === ed.sid); b.setAttribute('aria-selected', id === ed.sid); b.querySelector('.stp').replaceChildren(...deck.people.filter((p) => p.st?.s === id).slice(0, 4).map((p) => h('i', { style: `background:${p.color}`, title: p.name || t('guest') }))); }
    $('.sn', center).textContent = t('slide_of', { a: deck.index(ed.sid) + 1, b: deck.slides.size });
  }
  let dragSid = null;
  strip.addEventListener('dragstart', (e) => { const s = e.target.closest?.('.st'); if (!s) return; dragSid = s.dataset.sid; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/sp-slide', dragSid); s.classList.add('drag'); });
  strip.addEventListener('dragend', () => { dragSid = null; $$('.drag,.before,.after', strip).forEach((x) => x.classList.remove('drag', 'before', 'after')); });
  const place = (e) => { const s = e.target.closest?.('.st'); if (!s) return null; const r = s.getBoundingClientRect(), hor = mobile(); return { s, after: hor ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2 }; };
  strip.addEventListener('dragover', (e) => { if (!dragSid) return; e.preventDefault(); const p = place(e); $$('.before,.after', strip).forEach((x) => x.classList.remove('before', 'after')); p?.s.classList.add(p.after ? 'after' : 'before'); });
  strip.addEventListener('drop', (e) => { if (!dragSid) return; e.preventDefault(); const p = place(e); if (!p || p.s.dataset.sid === dragSid) return; const rest = deck.order().filter((x) => x.sid !== dragSid), i = rest.findIndex((x) => x.sid === p.s.dataset.sid) + (p.after ? 1 : 0); moveTo(dragSid, i); });
  function moveTo(sid, i) {
    const pos = deck.posAt(i, sid);
    deck.do({ k: 'slide.move', s: sid, pos });
  }
  strip.addEventListener('contextmenu', (e) => { const s = e.target.closest('.st'); if (!s || !ed.edit) return; e.preventDefault(); ed.goto(s.dataset.sid); slideMenu(e.clientX, e.clientY); });
  strip.addEventListener('dblclick', () => setTab('props'));

  // ------------------------------------------------------------------ actions
  ed.goto = (sid) => {
    if (!deck.slide(sid)) return;
    if (sid === ed.sid) { markStrip(); return; }
    ed.closeText(); ed.sid = sid; ed.sel.clear();
    history.replaceState(null, '', `?d=${deck.uid}&slide=${sid}`);
    stage.draw(); markStrip(); ed.refreshPanel();
    thumbs.get(sid)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    deck.setState({ s: sid, sel: [], x: null, y: null });
  };
  ed.select = (ids, quiet) => {
    const before = [...ed.sel].join();
    ed.sel = new Set(ids);
    stage.overlayNow();
    if (quiet) return;
    deck.setState({ s: ed.sid, sel: [...ed.sel].slice(0, 12) });
    if (ids.length && !['comments', 'notes'].includes(ed.tab) && !mobile() && before !== ids.join()) setTab('props');
    else if (before !== ids.join()) ed.refreshPanel();
  };
  const put = (el, sel = true) => {
    const id = uid(), top = Math.max(0, ...Object.values(deck.slide(ed.sid).d.els).map((e) => e.z || 0));
    for (const k of ['x', 'y', 'w', 'h']) el[k] = Math.round(el[k] * 10) / 10;
    deck.do({ k: 'el.add', s: ed.sid, e: id, el: { ...el, z: top + 1 } });
    if (sel) ed.select([id]);
    return id;
  };
  const centered = (w, hh, p) => ({ x: (p ? p.x : ed.ctx.W / 2) - w / 2, y: (p ? p.y : ed.ctx.H / 2) - hh / 2, w, h: hh });
  const needSlide = () => { if (!deck.slide(ed.sid)) ed.addSlide('blank'); };
  ed.insertText = (role, x, y, write) => {
    needSlide();
    const s = ed.ctx.s, [w, hh] = { title: [860, 110], heading: [760, 70], body: [560, 46], list: [560, 130], quote: [760, 130], big: [420, 170], caption: [420, 30], subtitle: [640, 50] }[role] || [560, 46];
    const b = centered(Math.min(w * s, ed.ctx.W * .85), hh * s, x != null ? { x, y } : null);
    const html = role === 'list' ? `<ul><li>${t('ph_item')}</li><li>${t('ph_item')}</li></ul>` : write ? '' : textToHtml(t({ title: 'ph_title', heading: 'ph_title', quote: 'ph_quote', big: 'ph_number', caption: 'ph_caption' }[role] || 'ph_text'));
    const id = put({ t: 'text', role: role === 'list' ? 'body' : role, ...b, html });
    requestAnimationFrame(() => stage.startEdit(id, 'all'));
  };
  ed.insertImage = (m, p) => { needSlide(); const k = Math.min(1, ed.ctx.W * .5 / m.w, ed.ctx.H * .6 / m.h), K = Math.max(k, Math.min(ed.ctx.W * .25 / m.w, 1)); return put({ t: 'image', src: m.src, ...centered(m.w * (m.w * k < ed.ctx.W * .2 ? K : k), m.h * (m.w * k < ed.ctx.W * .2 ? K : k), p), alt: m.name || '', credit: m.credit || '', creditUrl: okLink(m.creditUrl) ? m.creditUrl : '' }); };
  ed.insertVideo = (v, p) => { needSlide(); const w = ed.ctx.W * .55, hh = w * Math.min(1.6, (v.h || 720) / (v.w || 1280)); return put({ t: 'video', kind: v.kind, vid: v.vid, poster: v.poster || '', ...(v.start ? { start: v.start } : {}), ...centered(w, hh, p), credit: v.credit || '', creditUrl: okLink(v.creditUrl) ? v.creditUrl : '', rad: 10 }); };
  ed.setImage = (id, m) => deck.do({ k: 'el.set', s: ed.sid, e: id, p: { src: m.src, credit: m.credit || '', creditUrl: okLink(m.creditUrl) ? m.creditUrl : '', alt: m.name || '', fx: null, fy: null, zoom: null } });
  ed.insert = async (what, p) => {
    if (!ed.edit) return;
    ed.closeText(); needSlide();
    const [kind, a, b] = what.split(':'), s = ed.ctx.s;
    if (kind === 'text') return ed.insertText(a, p?.x, p?.y);
    if (kind === 'image') { const m = await pickPicture(); if (m) ed.insertImage(m, p); return; }
    if (kind === 'video') { const v = await pickVideo(); if (v) ed.insertVideo(v, p); return; }
    if (kind === 'shape' && a === 'line') return put({ t: 'shape', shape: 'line', ...centered(320 * s, 24 * s, p), stroke: '@fg', sw: 3 * s, ...(b === 'arrow' ? { h2: 'arrow' } : b === 'double' ? { h1: 'arrow', h2: 'arrow' } : {}) });
    if (kind === 'shape') { const wide = /^(arrow|arrow2|chevron|homeplate|speech|rect|round|parallelogram|cloud|wave|half|trapezoid)$/.test(a); put({ t: 'shape', shape: a, ...centered((wide ? 260 : 200) * s, (wide ? 160 : 200) * s, p), fill: '@accent' }); }
  };
  ed.enter = (id) => {
    const el = deck.el(ed.sid, id);
    if (!el || el.lock) return;
    ed.select([id]);
    if (el.t === 'text' || (el.t === 'shape' && el.shape !== 'line')) stage.startEdit(id);
    else if (el.t === 'image') pickPicture().then((m) => m && ed.setImage(id, m));
    else if (el.t === 'video') { if (el.vid) ed.playVideo(id); else pickVideo().then((v) => v && deck.do({ k: 'el.set', s: ed.sid, e: id, p: { kind: v.kind, vid: v.vid, poster: v.poster || '' } })); }
  };
  ed.playVideo = (id) => { const el = deck.el(ed.sid, id), v = el?.vid && videoNode(el, true); if (v) dialog(t('video'), h('div.vbox', v), [], { width: '60rem' }); };
  ed.follow = (link) => { if (link.startsWith('#s:')) ed.goto(link.slice(3)); else window.open(link, '_blank', 'noopener,noreferrer'); };
  const selEls = () => [...ed.sel].map((id) => ({ id, el: deck.el(ed.sid, id) })).filter((x) => x.el);
  ed.deleteSel = () => { const ops = selEls().filter((x) => !x.el.lock).map((x) => ({ k: 'el.del', s: ed.sid, e: x.id })); ed.sel.clear(); deck.do(ops); ed.select([]); ed.refreshPanel(); };
  const cloneInto = (list, dx, dy) => { const top = Math.max(0, ...Object.values(deck.slide(ed.sid).d.els).map((e) => e.z || 0)), ids = []; deck.do(list.map((el, i) => { const id = uid(); ids.push(id); return { k: 'el.add', s: ed.sid, e: id, el: { ...structuredClone(el), x: el.x + dx, y: el.y + dy, z: top + 1 + i } }; })); ed.select(ids); };
  ed.duplicateSel = () => { const l = selEls(); if (l.length) cloneInto(l.map((x) => x.el), 20, 20); };
  ed.duplicateHere = () => { const l = selEls(); if (l.length) cloneInto(l.map((x) => x.el), 0, 0); };
  ed.zorder = (how) => {
    const all = sorted(deck.slide(ed.sid).d), sel = all.filter((x) => ed.sel.has(x.id)), rest = all.filter((x) => !ed.sel.has(x.id));
    let next;
    if (how === 'front') next = [...rest, ...sel]; else if (how === 'back') next = [...sel, ...rest];
    else { next = [...all]; const idx = sel.map((x) => next.indexOf(x)); if (how === 'up') for (const i of idx.reverse()) { if (i < next.length - 1 && !ed.sel.has(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]]; } else for (const i of idx) if (i > 0 && !ed.sel.has(next[i - 1].id)) [next[i], next[i - 1]] = [next[i - 1], next[i]]; }
    deck.do(next.map((x, i) => (x.z !== i + 1 ? { k: 'el.set', s: ed.sid, e: x.id, p: { z: i + 1 } } : null)));
  };
  ed.align = (how) => {
    const l = selEls().filter((x) => !x.el.lock);
    const b = l.length > 1 ? stage.bounds(l.map((x) => x.el)) : { x: 0, y: 0, w: ed.ctx.W, h: ed.ctx.H };
    if (how === 'dh' || how === 'dv') {
      const [p, sz] = how === 'dh' ? ['x', 'w'] : ['y', 'h'], s = [...l].sort((a, c) => a.el[p] - c.el[p]), tot = s.reduce((a, x) => a + x.el[sz], 0), gap = (b[sz] - tot) / (s.length - 1);
      let at = b[p];
      return deck.do(s.map((x) => { const op = { k: 'el.set', s: ed.sid, e: x.id, p: { [p]: Math.round(at * 10) / 10 } }; at += x.el[sz] + gap; return op; }));
    }
    const f = { left: (e) => ({ x: b.x }), center: (e) => ({ x: b.x + (b.w - e.w) / 2 }), right: (e) => ({ x: b.x + b.w - e.w }), top: (e) => ({ y: b.y }), middle: (e) => ({ y: b.y + (b.h - e.h) / 2 }), bottom: (e) => ({ y: b.y + b.h - e.h }) }[how];
    deck.do(l.map((x) => ({ k: 'el.set', s: ed.sid, e: x.id, p: f(x.el) })));
  };
  ed.asBackground = (id) => { const el = deck.el(ed.sid, id); if (!el?.src) return; ed.sel.clear(); deck.do([{ k: 'slide.set', s: ed.sid, p: { bg: { t: 'i', src: el.src, dim: 0, credit: el.credit || '', creditUrl: el.creditUrl || '' } } }, { k: 'el.del', s: ed.sid, e: id }]); ed.select([]); };
  // slides
  ed.addSlide = (layout) => {
    const i = deck.index(ed.sid), cur = deck.slide(ed.sid);
    const id = layout || (!cur ? 'cover' : cur.d.layout === 'cover' || cur.d.layout === 'section' ? 'title-body' : cur.d.layout || 'title-body');
    const { sid, d } = makeSlide(id === 'closing' ? 'title-body' : id, ed.ctx);
    if (layout === 'closing') Object.assign(d, makeSlide('closing', ed.ctx).d);
    deck.do({ k: 'slide.add', s: sid, pos: deck.posAt(i + 1), d });
    ed.goto(sid);
  };
  ed.setLayout = (id) => { const s = deck.slide(ed.sid); if (!s) return ed.addSlide(id); const d = relayout(s.d, id, ed.ctx), ops = [{ k: 'slide.set', s: s.sid, p: { layout: id, variant: d.variant } }]; for (const e of Object.keys(s.d.els)) if (!d.els[e]) ops.push({ k: 'el.del', s: s.sid, e }); for (const [e, el] of Object.entries(d.els)) ops.push({ k: 'el.add', s: s.sid, e, el }); ed.sel.clear(); deck.do(ops); ed.select([]); };
  ed.duplicateSlide = () => { const s = deck.slide(ed.sid); if (!s) return; const d = structuredClone(s.d), els = {}; for (const el of Object.values(d.els)) els[uid()] = el; d.els = els; const sid = uid(); deck.do({ k: 'slide.add', s: sid, pos: deck.posAt(deck.index(ed.sid) + 1), d }); ed.goto(sid); };
  ed.deleteSlide = () => { const l = deck.order(), i = deck.index(ed.sid); if (l.length < 2) return toast(t('last_slide')); const next = l[i + 1] || l[i - 1], sid = ed.sid; ed.goto(next.sid); deck.do({ k: 'slide.del', s: sid }); };
  ed.setFormat = (id, w, hh, scale) => {
    const o = deck.meta.format, ops = [{ k: 'deck.set', p: { format: { id, w: Math.round(w), h: Math.round(hh) } } }];
    if (scale && (o.w !== w || o.h !== hh)) {
      const f = Math.min(w / o.w, hh / o.h), dx = (w - o.w * f) / 2, dy = (hh - o.h * f) / 2, r = (v) => Math.round(v * 10) / 10;
      const s0 = context(deck.meta).s, s1 = context({ ...deck.meta, format: { w, h: hh } }).s;
      for (const s of deck.slides.values()) for (const [e, el] of Object.entries(s.d.els)) {
        const full = el.x <= 1 && el.y <= 1 && el.w >= o.w - 2 && el.h >= o.h - 2;
        const p = full ? { x: 0, y: 0, w, h: hh } : { x: r(el.x * f + dx), y: r(el.y * f + dy), w: Math.max(1, r(el.w * f)), h: Math.max(1, r(el.h * f)) };
        for (const k of ['rad', 'sw', 'pad', 'ls']) if (el[k]) p[k] = r(el[k] * f);
        // texts without their own size follow the format: an explicit one is needed only when the box shrinks more
        if (el.size) p.size = r(el.size * f); else if ((el.t === 'text' || el.html) && Math.abs(s1 / s0 - f) > .02) p.size = r(styleOf(el, slideContext(context(deck.meta), s.d)).size * f);
        ops.push({ k: 'el.set', s: s.sid, e, p });
      }
    }
    deck.do(ops);
  };
  ed.creditsSlide = () => {
    const seen = new Map();
    for (const s of deck.order()) { for (const el of Object.values(s.d.els)) if (el.credit) seen.set(el.credit, el.creditUrl); if (s.d.bg?.credit) seen.set(s.d.bg.credit, s.d.bg.creditUrl); }
    if (!seen.size) return toast(t('no_credits'));
    const { sid, d } = makeSlide('title-body', ed.ctx, { title: t('credits'), body: '' });
    const esc = (x) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const body = Object.values(d.els).find((e) => e.role === 'body');
    body.html = '<ul>' + [...seen].map(([c, u]) => `<li>${okLink(u) ? `<a href="${esc(u)}">${esc(c)}</a>` : esc(c)}</li>`).join('') + '</ul>'; body.size = 15 * ed.ctx.s;
    deck.do({ k: 'slide.add', s: sid, pos: deck.posAt(deck.slides.size), d });
    ed.goto(sid);
  };

  // menus at the pointer
  function menuAt(x, y, items) {
    $('.ctx')?.remove();
    const m = h('div.ctx', { role: 'menu', style: `left:${x}px;top:${y}px` }, ...items.filter(Boolean).map((i) => (i === '-' ? h('hr') : h('button', { type: 'button', role: 'menuitem', class: i[3] || '', onclick: () => { m.remove(); i[2](); } }, icon(i[0]), h('span', i[1]), i[4] && h('kbd', i[4])))));
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = clamp(x, 6, innerWidth - r.width - 6) + 'px'; m.style.top = clamp(y, 6, innerHeight - r.height - 6) + 'px';
    const off = (e) => { if (!m.contains(e.target)) { m.remove(); removeEventListener('pointerdown', off, true); removeEventListener('keydown', esc, true); } }, esc = (e) => { if (e.key === 'Escape') { m.remove(); removeEventListener('keydown', esc, true); } };
    addEventListener('pointerdown', off, true); addEventListener('keydown', esc, true);
    m.querySelector('button')?.focus();
  }
  const C = isMac ? '⌘' : 'Ctrl+';
  ed.contextMenu = (x, y) => { const s = ed.sel.size, one = s === 1 && deck.el(ed.sid, [...ed.sel][0]); menuAt(x, y, s ? [['copy', t('copy'), () => document.execCommand('copy'), '', C + 'C'], ['copy-plus', t('duplicate'), ed.duplicateSel, '', C + 'D'], '-', ['bring-to-front', t('to_front'), () => ed.zorder('front')], ['send-to-back', t('to_back'), () => ed.zorder('back')], one?.t === 'image' && one.src && ['image', t('as_background'), () => ed.asBackground([...ed.sel][0])], ['message-square', t('comment'), () => setTab('comments')], ['sticky-note', t('my_note'), () => setTab('notes')], '-', ['trash', t('delete'), ed.deleteSel, 'danger']] : [['type', t('text'), () => ed.insert('text:body')], ['image', t('image'), () => ed.insert('image')], ['shapes', t('shapes'), () => setTab('elements')], '-', ['palette', t('theme'), () => setTab('theme')], ['settings', t('slide'), () => setTab('props')]]); };
  const slideMenu = (x, y) => menuAt(x, y, [['plus', t('new_slide'), () => ed.addSlide(), '', 'Ctrl+M'], ['copy-plus', t('duplicate'), ed.duplicateSlide], [deck.slide(ed.sid)?.d.hide ? 'eye' : 'eye-off', deck.slide(ed.sid)?.d.hide ? t('show_slide') : t('hide_slide'), () => deck.do({ k: 'slide.set', s: ed.sid, p: { hide: deck.slide(ed.sid).d.hide ? null : 1 } })], ['arrow-up', t('move_up'), () => moveTo(ed.sid, deck.index(ed.sid) - 1)], ['arrow-down', t('move_down'), () => moveTo(ed.sid, deck.index(ed.sid) + 1)], '-', ['trash', t('delete'), ed.deleteSlide, 'danger']]);
  if (mobile() && ed.edit) { const b = iconBtn('ellipsis', t('slide'), (e) => { const r = e.currentTarget.getBoundingClientRect(); slideMenu(r.left, r.top - 260); }, { size: 'sm', place: 'top' }); $('.ebottom', center).prepend(b, iconBtn('plus', t('new_slide'), () => ed.addSlide(), { size: 'sm', place: 'top' })); }

  // ------------------------------------------------------------------ side panel
  const TABS = [...(ed.edit ? [['elements', 'shapes', 'elements'], ['props', 'sliders-horizontal', 'design'], ['layouts', 'layout-template', 'layouts'], ['theme', 'palette', 'theme'], ['media', 'images', 'media']] : []), ['comments', 'message-square', 'comments'], ['notes', 'sticky-note', 'notes']];
  function drawRail() { rail.replaceChildren(...TABS.map(([k, ic, l]) => { const n = k === 'comments' || k === 'notes' ? marks.count(k) : 0; return h('button.rb', { type: 'button', class: ed.tab === k ? 'on' : '', 'aria-pressed': String(ed.tab === k), onclick: () => setTab(ed.tab === k ? '' : k) }, icon(ic), h('span', t(l)), n ? h('em', n) : null); })); }
  function setTab(k) {
    ed.tab = k;
    app.classList.toggle('has-panel', !!k);
    drawRail(); drawPanel(true); stage.overlayNow();
  }
  ed.setTab = setTab;
  function drawPanel(fresh) {
    if (!ed.tab) { panel.replaceChildren(); return; }
    const y = fresh ? 0 : panel.querySelector('.pbody')?.scrollTop || 0;
    const body = { elements: elementsPanel, props: propsPanel, layouts: layoutsPanel, theme: themePanel, media: mediaPanel, comments: marks.commentsPanel, notes: marks.notesPanel }[ed.tab](ed);
    panel.replaceChildren(h('div.phead', h('h2', t(TABS.find((x) => x[0] === ed.tab)[2])), iconBtn('x', t('close'), () => setTab(''), { size: 'sm' })), h('div.pbody', body));
    panel.querySelector('.pbody').scrollTop = y;
  }
  const typing = () => { const a = deepActive(); return a && panel.contains(a.getRootNode().host || a) && /^(INPUT|TEXTAREA)$/.test(a.tagName); };
  const deepActive = () => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a; };
  let panelT;
  /** The properties follow what is selected; never while one is being typed or a list is open. */
  ed.refreshPanel = () => { clearTimeout(panelT); panelT = setTimeout(() => { if (ed.tab === 'props' && !ed.dragging && !typing() && !panel.querySelector('sav-popover[open], sav-select[open]')) drawPanel(); if (ed.tab === 'comments' || ed.tab === 'notes') drawPanel(); }, 40); };
  ed.refreshMarks = () => { drawRail(); if ((ed.tab === 'comments' || ed.tab === 'notes') && !typing()) drawPanel(); stage.overlayNow(); };

  // pointing at something for a comment or a note
  ed.startPick = (hint) => { ed.picking = true; app.classList.add('picking'); toast(hint); if (mobile()) app.classList.remove('has-panel'); };
  ed.pickAt = (e, p, id) => {
    e.preventDefault();
    const box = h('div.marquee'); stage.overlay.append(box);
    const mv = (ev) => { const n = stage.pos(ev); Object.assign(box.style, { left: Math.min(p.x, n.x) * stage.k + 'px', top: Math.min(p.y, n.y) * stage.k + 'px', width: Math.abs(n.x - p.x) * stage.k + 'px', height: Math.abs(n.y - p.y) * stage.k + 'px' }); };
    const up = (ev) => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      box.remove(); ed.picking = false; app.classList.remove('picking'); if (ed.tab) app.classList.add('has-panel');
      const n = stage.pos(ev), w = Math.abs(n.x - p.x), hh = Math.abs(n.y - p.y);
      ed.onPicked?.(w > 12 && hh > 12 ? { x: Math.min(p.x, n.x), y: Math.min(p.y, n.y), w, h: hh } : id ? { e: id } : { x: p.x, y: p.y, w: 0, h: 0 });
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  };

  // ------------------------------------------------------------------ changes
  deck.addEventListener('change', (e) => {
    const { ops, local } = e.detail;
    let redraw = false, all = false, stripAll = false;
    const els = new Set(), bgs = new Set();
    for (const op of ops) {
      if (op.k === 'deck.set') {
        if (op.p.title !== undefined) { title.value = deck.title; document.title = deck.title + ' — SavPresentations'; }
        if (op.p.theme || op.p.format || op.p.opts) { ed.ctx = context(deck.meta); all = true; fillMenu(); }
      } else if (op.k === 'slide.add' || op.k === 'slide.del' || op.k === 'slide.move') { stripAll = true; if (op.s === ed.sid) redraw = true; } else {
        touch(op.s);
        if (op.s !== ed.sid) continue;
        if (op.k === 'slide.set') { if (Object.keys(op.p).some((f) => f !== 'notes')) bgs.add(1); } else els.add(op.e);
      }
    }
    if (!deck.slide(ed.sid)) { const l = deck.order(); ed.closeText(); ed.sel.clear(); ed.sid = l[0]?.sid || ''; redraw = true; }
    for (const id of [...ed.sel]) if (!deck.el(ed.sid, id)) ed.sel.delete(id);
    if (ed.editing && !deck.el(ed.editing.sid, ed.editing.id)) { ed.closeText(); }
    if ((all || redraw || bgs.size) && ed.editing) ed.closeText();
    if (all || redraw || bgs.size) stage.draw();
    else if (els.size) { for (const id of els) stage.drawEl(id); stage.overlayNow(); }
    if (all || stripAll) { drawStrip(); }
    if (!ed.dragging && (!local || e.detail.undo || els.size || bgs.size || redraw)) ed.refreshPanel();
    if (all && ed.tab === 'layouts' ) drawPanel();
    buttons();
  });
  const buttons = () => { undoB.firstChild.disabled = !deck.undoStack.length; redoB.firstChild.disabled = !deck.redoStack.length; };
  const setStatus = () => { const off = deck.failed, s = !ed.edit ? t('view_only') : off ? t('offline_saved') : deck.saved ? t('saved_all') : t('saving'); status.replaceChildren(icon(!ed.edit ? 'eye' : off ? 'cloud-off' : deck.saved ? 'cloud-check' : 'refresh-cw'), h('span', s)); status.classList.toggle('off', !!off); };
  deck.addEventListener('status', setStatus);
  deck.addEventListener('people', () => { drawPeople(); markStrip(); stage.overlayNow(); });
  deck.addEventListener('comments', () => marks.load('comments'));
  deck.addEventListener('role', () => { toast(t('role_changed')); dispatchEvent(new PopStateEvent('popstate')); });
  deck.addEventListener('reload', () => { deck.alive = false; dispatchEvent(new PopStateEvent('popstate')); });
  deck.addEventListener('refused', (e) => toast(errText({ code: e.detail }), 'danger'));
  deck.addEventListener('lost', (e) => dialog(t('cant_open'), h('p', t('err_' + e.detail) ), [[t('home'), () => go('./')], [t('try_again'), () => location.reload(), { appearance: 'outline' }]], { persistent: true }));
  function drawPeople() {
    const seen = new Map();
    for (const p of deck.people) if (!seen.has(p.u || p.c)) seen.set(p.u || p.c, p);
    const list = [...seen.values()];
    people.replaceChildren(...list.slice(0, 4).map((p) => h('sav-tooltip', { content: p.name || t('guest'), placement: 'bottom' }, h('sav-avatar', { 'auto-text': true, label: p.name || t('guest'), button: true, style: `--size:30px;background:${p.color};color:#fff;border-radius:50%;--ring:0 0 0 2px ${p.color}`, onclick: () => { if (p.st?.s) ed.goto(p.st.s); } }))), list.length > 4 ? h('span.more', '+' + (list.length - 4)) : '');
  }

  // ------------------------------------------------------------------ keyboard and clipboard
  let clip = null;
  const busyField = () => { const a = deepActive(); return ed.editing || (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) || $('sav-dialog[open]') || document.body.classList.contains('showing'); };
  const onKey = (e) => {
    if (e.defaultPrevented || document.body.classList.contains('showing')) return;
    const m = e.ctrlKey || e.metaKey, k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'F5') { e.preventDefault(); return show(e.shiftKey ? ed.sid : deck.order()[0]?.sid); }
    if (ed.picking && k === 'Escape') { ed.picking = false; app.classList.remove('picking'); ed.onPicked?.(null); return; }
    if (busyField()) return;
    const act = (fn) => { e.preventDefault(); fn(); };
    if (k === 'PageDown' || (!ed.sel.size && (k === 'ArrowDown' || k === 'ArrowRight'))) return act(() => { const l = deck.order(); ed.goto(l[Math.min(l.length - 1, deck.index(ed.sid) + 1)]?.sid); });
    if (k === 'PageUp' || (!ed.sel.size && (k === 'ArrowUp' || k === 'ArrowLeft'))) return act(() => ed.goto(deck.order()[Math.max(0, deck.index(ed.sid) - 1)]?.sid));
    if (!ed.edit) return;
    if (m && k === 'z') return act(() => (e.shiftKey ? deck.redo() : deck.undo()));
    if (m && k === 'y') return act(() => deck.redo());
    if (m && k === 'd') return act(() => (ed.sel.size ? ed.duplicateSel() : ed.duplicateSlide()));
    if (m && k === 'a') return act(() => ed.select(sorted(deck.slide(ed.sid).d).filter((x) => !x.lock).map((x) => x.id)));
    if (e.ctrlKey && k === 'm') return act(() => ed.addSlide());
    if (m && (k === 'b' || k === 'i' || k === 'u') && ed.sel.size) return act(() => { const f = { b: 'bold', i: 'italic', u: 'under' }[k], l = selEls().filter((x) => x.el.t !== 'image' && x.el.t !== 'video'), sc = slideContext(ed.ctx, deck.slide(ed.sid).d), on = l.some((x) => !styleOf(x.el, sc)[f]); deck.do(l.map((x) => ({ k: 'el.set', s: ed.sid, e: x.id, p: { [f]: on ? 1 : 0 } }))); });
    if (m && (k === ']' || k === '[')) return act(() => ed.zorder(k === ']' ? (e.shiftKey ? 'front' : 'up') : e.shiftKey ? 'back' : 'down'));
    if (m) return;
    if (k === 'Delete' || k === 'Backspace') return act(() => (ed.sel.size ? ed.deleteSel() : strip.contains(document.activeElement) && ed.deleteSlide()));
    if (k === 'Escape') return act(() => ed.select([]));
    if (k === 'Enter' && ed.sel.size === 1) return act(() => ed.enter([...ed.sel][0]));
    if (k === 'Tab' && stage.scroller.contains(document.activeElement)) { const l = sorted(deck.slide(ed.sid).d).filter((x) => !x.lock); if (l.length) return act(() => { const i = l.findIndex((x) => ed.sel.has(x.id)); ed.select([l[(i + (e.shiftKey ? -1 : 1) + l.length) % l.length].id]); }); }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if (d && ed.sel.size) return act(() => { const s = e.shiftKey ? 10 : 1; deck.do(selEls().filter((x) => !x.el.lock).map((x) => ({ k: 'el.set', s: ed.sid, e: x.id, p: { x: x.el.x + d[0] * s, y: x.el.y + d[1] * s } })), 'nudge'); });
    if (k === 't') act(() => ed.insert('text:body'));
  };
  const onCopy = (e) => {
    if (busyField() || !ed.edit) return;
    const l = selEls().map((x) => x.el), s = deck.slide(ed.sid);
    const pack = l.length ? { els: l } : document.activeElement === strip || strip.contains(document.activeElement) ? { slide: s.d } : null;
    if (!pack) return;
    e.preventDefault();
    clip = JSON.stringify(pack);
    e.clipboardData.setData('application/x-savpre', clip);
    e.clipboardData.setData('text/plain', l.map((x) => plain(x.html)).filter(Boolean).join('\n') || t('slide'));
    if (e.type === 'cut') { if (l.length) ed.deleteSel(); else ed.deleteSlide(); }
  };
  const onPaste = async (e) => {
    if (busyField() || !ed.edit) return;
    const c = e.clipboardData, files = [...c.files].filter((f) => f.type.startsWith('image/')), raw = c.getData('application/x-savpre');
    if (raw) {
      e.preventDefault();
      try { const p = JSON.parse(raw); if (p.els) cloneInto(p.els, 24, 24); else if (p.slide) { const d = fixSlide(p.slide), els = {}; for (const el of Object.values(d.els)) els[uid()] = el; const sid = uid(); deck.do({ k: 'slide.add', s: sid, pos: deck.posAt(deck.index(ed.sid) + 1), d: { ...d, els } }); ed.goto(sid); } } catch { /* not ours */ }
      return;
    }
    if (files.length) { e.preventDefault(); return uploadFiles(files, (m) => ed.insertImage(m)); }
    const html = c.getData('text/html'), txt = c.getData('text/plain');
    if (!txt) return;
    e.preventDefault();
    const v = (await import('./media.js')).parseVideo(txt);
    if (v) { let poster = ''; try { if (v.kind !== 'file') poster = (await api('media.poster', v)).media.src; } catch { /* without */ } return ed.insertVideo({ ...v, poster }); }
    const box = h('div'); box.append(fragment(html || textToHtml(txt)));
    const w = Math.min(ed.ctx.W * .6, 760 * ed.ctx.s);
    put({ t: 'text', role: 'body', ...centered(w, Math.min(ed.ctx.H * .7, 40 * ed.ctx.s * Math.max(1, Math.ceil(txt.length / 48)))), html: serialize(box) });
  };
  addEventListener('keydown', onKey); addEventListener('copy', onCopy); addEventListener('cut', onCopy); addEventListener('paste', onPaste);
  // buttons of the panel do not take the focus away from the text being written
  panel.addEventListener('mousedown', (e) => { if (ed.editing && !e.composedPath().some((x) => /^(INPUT|TEXTAREA)$/.test(x.tagName))) e.preventDefault(); });
  const onResize = () => { if ((mobile() ? 92 : 150) !== stripW) drawStrip(); };
  addEventListener('resize', onResize);
  // swipe between slides on phones (viewers)
  if (!ed.edit) { let x0 = null; stage.scroller.addEventListener('touchstart', (e) => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true }); stage.scroller.addEventListener('touchend', (e) => { if (x0 == null || ed.picking) return; const dx = e.changedTouches[0].clientX - x0, l = deck.order(), i = deck.index(ed.sid); if (Math.abs(dx) > 60) ed.goto(l[clamp(i + (dx < 0 ? 1 : -1), 0, l.length - 1)].sid); }, { passive: true }); }

  let running = null;
  function show(from) { if (!deck.slides.size) return; ed.closeText(); const cur = deck.slide(ed.sid); running = startShow(ed, from || (cur && !cur.d.hide ? ed.sid : undefined)); ed.onShowEnd = (sid) => { running = null; ed.goto(sid); stage.draw(); deck.setState({ s: sid }); }; }
  function shortcuts() { const r = (k, v) => h('div.kr', h('span', t(v)), h('kbd', k)); dialog(t('shortcuts'), h('div.keys', r('F5', 'present'), r(C + 'Z', 'undo'), r(isMac ? '⇧⌘Z' : 'Ctrl+Y', 'redo'), r('T', 'text'), r('Ctrl+M', 'new_slide'), r(C + 'D', 'duplicate'), r('Enter', 'k_write'), r('Esc', 'k_esc'), r('↑ ↓ ← →', 'k_nudge'), r('Shift', 'k_shift'), r('Alt', 'k_alt'), r(C + '[  ]', 'k_order'), r(C + t('k_wheel_n'), 'k_wheel'), r('PgUp / PgDn', 'k_pages'), r(t('k_show_n'), 'k_show')), [], { width: '30rem' }); }

  // ------------------------------------------------------------------ go
  drawStrip(); stage.draw(); drawRail(); buttons(); setStatus();
  app.classList.toggle('viewer', !ed.edit);
  if (q.get('comments')) setTab('comments'); else if (q.get('notes')) setTab('notes'); else if (ed.edit && !mobile()) setTab(deck.slides.size ? 'elements' : 'layouts');
  deck.state = { s: ed.sid };
  deck.start();
  marks.load();
  if (data.deck.status === 'trashed') toast(t('deck_is_trashed'), 'warning');
  if (q.get('present')) show(ed.sid);
  // for automatic checks and the console
  window.__sp = ed;
  return { leave: () => { ed.closeText(); running?.close(); stage.leave(); deck.stop(); removeEventListener('keydown', onKey); removeEventListener('copy', onCopy); removeEventListener('cut', onCopy); removeEventListener('paste', onPaste); removeEventListener('resize', onResize); app.className = ''; $$('.ctx,.ftb').forEach((x) => x.remove()); delete window.__sp; } };
}
