/** The show: full screen, transitions, entrances, presenter view in a second window. */
import { h, icon, iconBtn, clamp, $, $$ } from './core.js';
import { t } from './i18n.js';
import { slideNode, mediaUrl } from './render.js';
import { okLink } from './richtext.js';

const EASE = 'cubic-bezier(.2,.7,.2,1)';

export function videoNode(el, autoplay) {
  const start = el.start ? Math.round(el.start) : 0;
  if (el.kind === 'youtube') return h('iframe', { src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(el.vid)}?` + new URLSearchParams({ autoplay: autoplay ? 1 : 0, mute: el.mute ? 1 : 0, rel: 0, start, ...(el.loop ? { loop: 1, playlist: el.vid } : {}) }), allow: 'autoplay; fullscreen; picture-in-picture', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin' });
  if (el.kind === 'vimeo') return h('iframe', { src: `https://player.vimeo.com/video/${encodeURIComponent(el.vid)}?` + new URLSearchParams({ autoplay: autoplay ? 1 : 0, muted: el.mute ? 1 : 0, loop: el.loop ? 1 : 0, dnt: 1 }) + (start ? `#t=${start}s` : ''), allow: 'autoplay; fullscreen', allowfullscreen: true });
  if (!/^https:\/\//.test(el.vid || '')) return null;
  const v = h('video', { src: el.vid + (start ? '#t=' + start : ''), controls: true, playsinline: true, loop: !!el.loop, autoplay, poster: mediaUrl(el.poster) || null });
  v.muted = !!el.mute || autoplay && !!el.auto;
  return v;
}

export function startShow(ed, fromSid) {
  const deck = ed.deck;
  const list = () => deck.order().filter((s) => !s.d.hide || s.sid === cur);
  let cur = fromSid || list()[0]?.sid, step = 0, stage = null, auto, chan, started = Date.now(), laser = false;
  if (!cur) return;
  const root = h('div.show', { tabindex: -1, role: 'dialog', 'aria-label': t('show') }), view = h('div.show-v'), bar = h('div.show-bar'), count = h('span.show-n'), dot = h('div.laser', { hidden: true });
  bar.append(iconBtn('chevron-left', t('prev'), () => prev(), { place: 'top' }), count, iconBtn('chevron-right', t('next'), () => next(), { place: 'top' }), iconBtn('pointer', t('laser'), () => setLaser(!laser), { place: 'top' }), iconBtn('monitor', t('presenter'), () => presenter(), { place: 'top' }), iconBtn('maximize', t('fullscreen'), () => full(), { place: 'top' }), iconBtn('x', t('exit'), () => close(), { place: 'top' }));
  root.append(view, bar, dot);
  document.body.append(root);
  document.body.classList.add('showing');

  const size = () => { if (!stage) return; const k = Math.min(innerWidth / ed.ctx.W, innerHeight / ed.ctx.H); for (const s of $$('.sl', view)) { s.style.setProperty('--k', k); s.style.left = (innerWidth - ed.ctx.W * k) / 2 + 'px'; s.style.top = (innerHeight - ed.ctx.H * k) / 2 + 'px'; } };
  const anims = () => (stage ? $$('.el[data-anim]', stage) : []);

  function render(dir = 1, withAnim = true) {
    const s = deck.slide(cur);
    if (!s) { cur = list()[0]?.sid; if (!cur) return close(); return render(); }
    const old = stage, l = list(), i = l.findIndex((x) => x.sid === cur);
    stage = slideNode(s.d, ed.ctx, { mode: 'present', index: deck.index(cur), count: deck.slides.size });
    for (const n of $$('.el[data-id]', stage)) {
      const el = s.d.els[n.dataset.id];
      if (el.anim) { n.dataset.anim = el.anim; n.dataset.z = el.z || 0; }
      if (el.t === 'video' && el.vid && el.auto) n.replaceChildren(wrapVideo(el, n));
    }
    anims().sort((a, b) => a.dataset.z - b.dataset.z).forEach((n, j) => { n.dataset.step = j + 1; });
    view.append(stage);
    size();
    step = dir < 0 ? anims().length : 0;
    reveal(false);
    const tr = s.d.tr || deck.meta.opts.tr || 'none';
    if (old) {
      $$('iframe,video', old).forEach((v) => v.remove());
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!withAnim || tr === 'none' || reduce) old.remove();
      else {
        const k = Math.min(innerWidth / ed.ctx.W, innerHeight / ed.ctx.H), base = `scale(${k})`, W = ed.ctx.W * k * dir;
        const go = (n, frames, ms) => n.animate(frames, { duration: ms, easing: EASE });
        if (tr === 'fade') go(stage, [{ opacity: 0 }, { opacity: 1 }], 380);
        if (tr === 'slide') go(stage, [{ transform: `translateX(${W}px) ${base}` }, { transform: base }], 480);
        if (tr === 'push') { go(stage, [{ transform: `translateX(${W}px) ${base}` }, { transform: base }], 520); go(old, [{ transform: base }, { transform: `translateX(${-W}px) ${base}` }], 520); }
        if (tr === 'zoom') go(stage, [{ opacity: 0, transform: `scale(${k * .86})` }, { opacity: 1, transform: base }], 420);
        setTimeout(() => old.remove(), tr === 'push' ? 520 : 500);
      }
    }
    count.textContent = `${i + 1} / ${l.length}`;
    clearTimeout(auto);
    if (deck.meta.opts.auto > 0) auto = setTimeout(() => next(), deck.meta.opts.auto * 1000);
    tell();
    deck.setState({ s: cur, sel: [] });
  }
  const wrapVideo = (el) => { const b = h('div.im', { style: el.rad ? `border-radius:${el.rad}px` : '' }); const v = videoNode(el, true); if (v) b.append(v); return b; };
  function reveal(animate = true) {
    for (const n of anims()) {
      const on = +n.dataset.step <= step;
      n.classList.toggle('wait', !on);
      if (animate && +n.dataset.step === step && !matchMedia('(prefers-reduced-motion: reduce)').matches) { const el = deck.slide(cur).d.els[n.dataset.id], rot = el?.r ? `rotate(${el.r}deg)` : '', op = el?.o ?? 1; n.animate([{ opacity: 0, transform: `${{ up: 'translateY(40px)', left: 'translateX(-60px)', zoom: 'scale(.8)' }[n.dataset.anim] || ''} ${rot}`.trim() || 'none' }, { opacity: op, transform: rot || 'none' }], { duration: 420, easing: EASE }); }
    }
  }
  function next() { if (step < anims().length) { step++; reveal(); tell(); return; } const l = list(), i = l.findIndex((x) => x.sid === cur); if (i < l.length - 1) { cur = l[i + 1].sid; render(1); } else if (deck.meta.opts.loop) { cur = l[0].sid; render(1); } }
  function prev() { if (step > 0) { step--; reveal(false); tell(); return; } const l = list(), i = l.findIndex((x) => x.sid === cur); if (i > 0) { cur = l[i - 1].sid; render(-1); } }
  function to(sid) { if (deck.slide(sid)) { cur = sid; render(1); } }
  const full = () => { if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen?.().catch(() => {}); };
  function setLaser(v) { laser = v; dot.hidden = !v; root.classList.toggle('lasering', v); }

  // presenter view: another window of this same origin, filled from here
  let win;
  function presenter() {
    win = open('', 'sp-presenter', 'width=1100,height=720');
    if (!win) return;
    const d = win.document;
    d.title = t('presenter') + ' — ' + deck.title;
    d.head.replaceChildren(...$$('link[rel=stylesheet], style').map((x) => { const c = x.cloneNode(true); if (c.href) c.href = x.href; return d.importNode(c, true); }));
    const base = d.createElement('base'); base.href = document.baseURI; d.head.prepend(base);
    d.documentElement.className = 'sav-theme-dark';
    d.body.className = 'pv sav-base';
    win.addEventListener('keydown', keys);
    tell();
  }
  function tell() {
    if (!win || win.closed) return;
    const d = win.document, l = list(), i = l.findIndex((x) => x.sid === cur), nx = l[i + 1];
    const box = (s, w) => { const b = h('div.thumb', { style: `width:${w}px;height:${w * ed.ctx.H / ed.ctx.W}px` }); if (s) { const n = slideNode(s.d, ed.ctx, { mode: 'thumb', index: deck.index(s.sid) }); n.style.transform = `scale(${w / ed.ctx.W})`; n.style.transformOrigin = '0 0'; b.append(n); } return b; };
    const w1 = Math.min(win.innerWidth * .6, (win.innerHeight - 190) * ed.ctx.W / ed.ctx.H);
    const b = (txt, f) => h('button.pvb', { type: 'button', onclick: f }, txt);
    d.body.replaceChildren(d.adoptNode(h('div.pv-l', box(l[i], w1), h('div.pv-c', b(t('prev'), prev), h('b', `${i + 1} / ${l.length}`), b(t('next'), next), h('span.pv-t'), b(t('reset'), () => { started = Date.now(); }))), ), d.adoptNode(h('div.pv-r', h('small', t('next')), nx ? box(nx, win.innerWidth * .28) : h('p', t('end_show')), h('small', t('speaker_notes')), h('div.pv-n', l[i]?.d.notes || t('no_speaker_notes')))));
  }
  const clock = setInterval(() => { const s = Math.floor((Date.now() - started) / 1000); if (win && !win.closed) { const e = win.document.querySelector('.pv-t'); if (e) e.textContent = `${String(s / 60 | 0).padStart(2, '0')}:${String(s % 60).padStart(2, '0')} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; } }, 500);

  let digits = '';
  function keys(e) {
    if (e.target.closest?.('input,textarea')) return;
    const k = e.key;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'n'].includes(k)) next();
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(k)) prev();
    else if (k === 'Enter') { if (digits) { const l = list(); to(l[clamp(+digits - 1, 0, l.length - 1)].sid); digits = ''; } else next(); } else if (/^\d$/.test(k)) digits += k;
    else if (k === 'Home') to(list()[0].sid); else if (k === 'End') to(list().pop().sid); else if (k === 'f') full(); else if (k === 'l') setLaser(!laser); else if (k === 'b' || k === '.') root.classList.toggle('black'); else if (k === 'Escape') { if (!document.fullscreenElement) close(); } else return;
    e.preventDefault(); e.stopPropagation();
  }
  let hideT, wasFull = false;
  const wake = () => { root.classList.add('awake'); clearTimeout(hideT); hideT = setTimeout(() => root.classList.remove('awake'), 2200); };
  const onFull = () => { if (document.fullscreenElement) wasFull = true; else if (wasFull) close(); size(); };
  root.addEventListener('pointermove', (e) => { wake(); if (laser) { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; } });
  let tx = null;
  view.addEventListener('pointerdown', (e) => { tx = { x: e.clientX, y: e.clientY, ty: e.pointerType }; });
  view.addEventListener('pointerup', (e) => {
    if (!tx) return;
    const dx = e.clientX - tx.x, touch = tx.ty === 'touch'; tx = null;
    if (Math.abs(dx) > 50) return dx < 0 ? next() : prev();
    const n = e.target.closest('.el[data-id]'), el = n && deck.slide(cur)?.d.els[n.dataset.id], a = e.target.closest('a');
    const link = a ? a.getAttribute('href') : el?.link;
    if (link && okLink(link)) { e.preventDefault(); if (link.startsWith('#s:')) to(link.slice(3)); else window.open(link, '_blank', 'noopener,noreferrer'); return; }
    if (el?.t === 'video' && el.vid) { if (!n.querySelector('iframe,video')) n.replaceChildren(wrapVideo(el)); return; }
    if (e.button === 0) touch && e.clientX < innerWidth * .28 ? prev() : next();
    wake();
  });
  view.addEventListener('click', (e) => { if (e.target.closest('a')) e.preventDefault(); });
  view.addEventListener('contextmenu', (e) => { e.preventDefault(); prev(); });
  const onChange = (e) => { if (e.detail.ops.some((o) => o.s === cur || o.k === 'deck.set' || o.k.startsWith('slide.'))) { const s = step; stageRefresh(s); } };
  function stageRefresh(s) { render(1, false); step = Math.min(s, anims().length); reveal(false); }
  deck.addEventListener('change', onChange);
  addEventListener('resize', size); addEventListener('keydown', keys, true); document.addEventListener('fullscreenchange', onFull);

  function close() {
    clearInterval(clock); clearTimeout(auto); clearTimeout(hideT);
    deck.removeEventListener('change', onChange);
    removeEventListener('resize', size); removeEventListener('keydown', keys, true); document.removeEventListener('fullscreenchange', onFull);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    win?.close();
    root.remove();
    document.body.classList.remove('showing');
    wakeLock?.release?.().catch(() => {});
    ed.onShowEnd?.(cur);
  }
  let wakeLock;
  navigator.wakeLock?.request('screen').then((w) => { wakeLock = w; }).catch(() => {});
  render(); wake(); root.focus();
  full();
  return { close };
}
