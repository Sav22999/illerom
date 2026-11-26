/** The show: full screen, transitions, entrances, tools (laser, pen), speaker view in a second window (speaker.js). */
import { h, icon, iconBtn, btn, toast, uid, clamp, openLink, $, $$ } from './core.js';
import {t} from './i18n.js';
import {fluidThumb, frameClip, mediaUrl, slideNode} from './render.js';
import {okLink} from './richtext.js';

const EASE = 'cubic-bezier(.2,.7,.2,1)';

export function videoNode(el, autoplay) {
    const start = el.start ? Math.round(el.start) : 0;
    if (el.kind === 'youtube') return h('iframe', {
        src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(el.vid)}?` + new URLSearchParams({
            autoplay: autoplay ? 1 : 0,
            mute: el.mute ? 1 : 0,
            rel: 0,
            start, ...(el.loop ? {loop: 1, playlist: el.vid} : {})
        }),
        allow: 'autoplay; fullscreen; picture-in-picture',
        allowfullscreen: true,
        referrerpolicy: 'strict-origin-when-cross-origin'
    });
    if (el.kind === 'vimeo') return h('iframe', {
        src: `https://player.vimeo.com/video/${encodeURIComponent(el.vid)}?` + new URLSearchParams({
            autoplay: autoplay ? 1 : 0,
            muted: el.mute ? 1 : 0,
            loop: el.loop ? 1 : 0,
            dnt: 1
        }) + (start ? `#t=${start}s` : ''), allow: 'autoplay; fullscreen', allowfullscreen: true
    });
    if (!/^(https:\/\/|m:)/.test(el.vid || '')) return null;
    // a video file plays in the player of SavComponents: the same controls everywhere, filling the frame of the element like its still
    const fx = (el.fx ?? .5) * 100 + '%', fy = (el.fy ?? .5) * 100 + '%';
    return h('sav-video.spvideo', {
        src: (mediaUrl(el.vid) || el.vid) + (start ? '#t=' + start : ''),
        poster: mediaUrl(el.poster) || null,
        label: el.alt || t('video'),
        'replay-label': t('video_replay'),
        loop: el.loop ? '' : null,
        autoplay: autoplay ? '' : null,
        muted: el.mute || (autoplay && el.auto) ? '' : null,
        style: `--fit:${el.fit || 'cover'};--vpos:${fx} ${fy};--vz:${el.zoom || 1};--vflip:${el.flip ? -1 : 1}`
    });
}

const PENS = ['#ff2d55', '#ffd60a', '#32d74b', '#0a84ff', '#ffffff', '#111111'];

export function startShow(ed, fromSid, { follow = '', presenter: withPresenter = false } = {}) {
  const deck = ed.deck;
  const list = () => deck.order().filter((s) => !s.d.hide || s.sid === cur);
  let cur = fromSid || list()[0]?.sid, step = 0, stage = null, auto;
  if (!cur) return;
  const root = h('div.show', { tabindex: -1, role: 'dialog', 'aria-label': t('show') }), view = h('div.show-v'), bar = h('div.show-bar', { role: 'toolbar', 'aria-label': t('show') }), count = h('span.show-n'), dot = h('div.laser', { hidden: true }), chip = h('div.show-chip', { role: 'status', hidden: true });

  // ---- tools: one at a time; what is on is always written on the screen
  let tool = '', black = false, penColor = PENS[0], drawing = false;
  const ink = h('canvas.ink', { hidden: true });
  const toggleBtn = (ic, label, key, fn) => { const tip = iconBtn(ic, `${label} · ${key}`, fn, { place: 'top' }), b = tip.firstElementChild; b.setAttribute('aria-pressed', 'false'); return { tip, b, set(on) { b.setAttribute('aria-pressed', String(on)); b.variant = on ? 'primary' : 'neutral'; b.appearance = on ? 'solid' : 'ghost'; } }; };
  const laserB = toggleBtn('pointer', t('laser'), 'L', () => setTool(tool === 'laser' ? '' : 'laser')), penB = toggleBtn('pencil', t('pen'), 'D', () => setTool(tool === 'pen' ? '' : 'pen')), blackB = toggleBtn('eye-off', t('black'), 'B', () => setBlack(!black)), overB = toggleBtn('layout-grid', t('overview'), 'G', () => overview()), speakB = toggleBtn('presentation', t('speaker_view'), 'S', () => presenter());
  const pens = h('div.pens', { hidden: true, role: 'group', 'aria-label': t('pen_color') }, ...PENS.map((c) => h('sav-button.sw.penc', { circle: true, size: 'sm', label: c, style: `--c:${c}`, 'data-c': c, onclick: () => { penColor = c; drawTools(); } })), iconBtn('eraser', t('pen_clear') + ' · E', () => inkClear(), { place: 'top' }));
  function drawTools() {
    laserB.set(tool === 'laser'); penB.set(tool === 'pen'); blackB.set(black); speakB.set(!!win && !win.closed);
    pens.hidden = tool !== 'pen';
    $$('.penc', pens).forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.c === penColor)); b.classList.toggle('on', b.dataset.c === penColor); });
    dot.hidden = tool !== 'laser';
    ink.hidden = tool !== 'pen' && !ink.dataset.used; ink.classList.toggle('on', tool === 'pen');
    root.classList.toggle('lasering', tool === 'laser'); root.classList.toggle('black', black); root.classList.toggle('tooling', !!tool || black);
    const [ic, txt, key] = black ? ['eye-off', 'black_on', 'B'] : tool === 'laser' ? ['pointer', 'laser_on', 'L'] : tool === 'pen' ? ['pencil', 'pen_on', 'D'] : [];
    chip.hidden = !ic;
    if (ic) chip.replaceChildren(icon(ic), h('b', t(txt)), h('span', t('turn_off_key', { k: key })));
  }
  function setTool(v) { tool = v; drawTools(); tell(); }
  function setBlack(v) { black = v; drawTools(); tell(); }
  const inkClear = () => { ink.width = innerWidth; ink.height = innerHeight; delete ink.dataset.used; ink.hidden = tool !== 'pen'; };
  ink.addEventListener('pointerdown', (e) => { drawing = true; ink.dataset.used = 1; ink.setPointerCapture(e.pointerId); const g = ink.getContext('2d'); g.strokeStyle = penColor; g.lineWidth = Math.max(3, innerWidth / 380); g.lineCap = g.lineJoin = 'round'; g.beginPath(); g.moveTo(e.clientX, e.clientY); });
  ink.addEventListener('pointermove', (e) => { if (!drawing) return; const g = ink.getContext('2d'); for (const p of e.getCoalescedEvents?.() || [e]) g.lineTo(p.clientX, p.clientY); g.stroke(); });
  for (const ev of ['pointerup', 'pointercancel']) ink.addEventListener(ev, () => { drawing = false; });

  bar.append(iconBtn('chevron-left', t('prev') + ' · ←', () => prev(), { place: 'top' }), count, iconBtn('chevron-right', t('next') + ' · →', () => next(), { place: 'top' }), h('i'), laserB.tip, penB.tip, pens, blackB.tip, h('i'), overB.tip, speakB.tip, iconBtn('maximize', t('fullscreen') + ' · F', () => full(), { place: 'top' }), iconBtn('x', t('exit') + ' · Esc', () => close(), { place: 'top' }));
  root.append(view, ink, bar, dot, chip);
  document.body.append(root);
  document.body.classList.add('showing');

  function overview() {
    const old = $('.show-ov', root);
    overB.set(!old);
    if (old) return old.remove();
    root.append(h('div.show-ov', ...list().map((s, i) => { const n = h('sav-card.tile.lay', { interactive: true, role: 'button', tabindex: 0, class: s.sid === cur ? 'on' : '', onclick: () => { overview(); to(s.sid); } }); n.append(fluidThumb(s.d, ed.ctx, { index: deck.index(s.sid) }), h('span', [i + 1, s.d.name].filter(Boolean).join(' · '))); return n; })));
  }

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
      if (el.t === 'video' && el.vid && el.auto) playIn(n, el);
    }
    anims().sort((a, b) => a.dataset.z - b.dataset.z).forEach((n, j) => { n.dataset.step = j + 1; });
    view.append(stage);
    if (withAnim) inkClear();
    size();
    step = dir < 0 ? anims().length : 0;
    reveal(false);
    const tr = s.d.tr || deck.meta.opts.tr || 'none';
    if (old) {
      $$('iframe,video,sav-video', old).forEach((v) => v.remove());
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
    deck.setState({ s: cur, sel: [], pr: follow ? 0 : 1, st: step });
  }
  /** The player takes the place of the still; a source written on it stays. */
  const playIn = (n, el) => { const b = frameClip(h('div.im.playing'), el, true), v = videoNode(el, true); if (v) b.append(v); n.querySelector('.im')?.replaceWith(b); };
  function reveal(animate = true) {
    for (const n of anims()) {
      const on = +n.dataset.step <= step;
      n.classList.toggle('wait', !on);
      if (animate && +n.dataset.step === step && !matchMedia('(prefers-reduced-motion: reduce)').matches) { const el = deck.slide(cur).d.els[n.dataset.id], rot = el?.r ? `rotate(${el.r}deg)` : '', op = el?.o ?? 1; n.animate([{ opacity: 0, transform: `${{ up: 'translateY(40px)', left: 'translateX(-60px)', zoom: 'scale(.8)' }[n.dataset.anim] || ''} ${rot}`.trim() || 'none' }, { opacity: op, transform: rot || 'none' }], { duration: 420, easing: EASE }); }
    }
  }
  function next() { if (step < anims().length) { step++; reveal(); tell(); deck.setState({ st: step }); return; } const l = list(), i = l.findIndex((x) => x.sid === cur); if (i < l.length - 1) { cur = l[i + 1].sid; render(1); } else if (deck.meta.opts.loop) { cur = l[0].sid; render(1); } }
  function prev() { if (step > 0) { step--; reveal(false); tell(); return; } const l = list(), i = l.findIndex((x) => x.sid === cur); if (i > 0) { cur = l[i - 1].sid; render(-1); } }
  function to(sid) { if (deck.slide(sid)) { cur = sid; render(1); } }
  const full = () => { if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen?.().catch(() => {}); };

  // ---- speaker view: a second window with the notes; this one, for the audience, has none
  const room = 'sp-show-' + uid(), chan = 'BroadcastChannel' in window ? new BroadcastChannel(room) : null;
  let win = null;
  function presenter() {
    if (!chan) return;
    win = open(`?d=${deck.uid}&speaker=${room}`, room, 'popup,width=1180,height=760');
    if (!win) return toast(t('popup_blocked'), 'warning');
    const note = h('div.show-tip', icon('presentation'), h('span', t('speaker_hint')), btn(t('to_fullscreen'), () => { note.remove(); full(); }, { size: 'sm', icon: 'maximize' }), iconBtn('x', t('close'), () => note.remove(), { size: 'sm' }));
    $('.show-tip', root)?.remove();
    root.append(note);
    drawTools();
  }
  function tell() {
    if (!chan) return;
    const l = list(), i = l.findIndex((x) => x.sid === cur), nx = l[i + 1] || (deck.meta.opts.loop ? l[0] : null);
    chan.postMessage({ k: 'state', title: deck.title, meta: deck.meta, i, n: l.length, sid: cur, index: deck.index(cur), step, steps: anims().length, cur: l[i]?.d, next: nx && nx.sid !== cur ? nx.d : null, nextIndex: nx ? deck.index(nx.sid) : -1, notes: l[i]?.d.notes || '', tool, black, pages: l.map((x) => [x.sid, x.d.name || '']) });
  }
  if (chan) chan.onmessage = ({ data: m }) => {
    if (m.k === 'hello') tell();
    else if (m.k === 'next') next(); else if (m.k === 'prev') prev(); else if (m.k === 'to') to(m.sid);
    else if (m.k === 'tool') setTool(m.v); else if (m.k === 'black') setBlack(!black); else if (m.k === 'clear') inkClear(); else if (m.k === 'end') close();
    else if (m.k === 'gone') { win = null; drawTools(); } else if (m.k === 'point' && tool === 'laser' && stage) { const r = stage.getBoundingClientRect(); dot.style.left = r.left + m.x * r.width + 'px'; dot.style.top = r.top + m.y * r.height + 'px'; }
  };

  // following someone: their slide and their step are shown here too
  const onPeople = () => {
    if (!follow) return;
    const p = deck.people.find((x) => x.c === follow);
    if (!p || !p.st?.pr) { follow = ''; return; }
    if (p.st.s !== cur) to(p.st.s);
    if ((p.st.st || 0) !== step && deck.slide(cur)) { step = Math.min(p.st.st || 0, anims().length); reveal(); tell(); }
  };
  deck.addEventListener('people', onPeople);

  let digits = '';
  function keys(e) {
    if (e.target.closest?.('input,textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    // a button of the bar reached with Tab is pressed by Enter and Space
    if ((k === 'Enter' || k === ' ') && e.composedPath().some((x) => x.localName === 'sav-button')) return;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'n'].includes(k)) next();
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(k)) prev();
    else if (k === 'Enter') { if (digits) { const l = list(); to(l[clamp(+digits - 1, 0, l.length - 1)].sid); digits = ''; } else next(); } else if (/^\d$/.test(k)) digits += k;
    else if (k === 'Home') to(list()[0].sid); else if (k === 'End') to(list().pop().sid); else if (k === 'f') full(); else if (k === 'l') setTool(tool === 'laser' ? '' : 'laser'); else if (k === 'd') setTool(tool === 'pen' ? '' : 'pen'); else if (k === 'e') inkClear(); else if (k === 'g') overview(); else if (k === 's') presenter(); else if (k === 'b' || k === '.') setBlack(!black); else if (k === 'Escape') { if ($('.show-ov', root)) overview(); else if (tool) setTool(''); else if (black) setBlack(false); else if (!document.fullscreenElement) close(); } else return;
    e.preventDefault(); e.stopPropagation();
  }
  let hideT, wasFull = false;
  const wake = () => { root.classList.add('awake'); clearTimeout(hideT); hideT = setTimeout(() => root.classList.remove('awake'), 2200); };
  const onFull = () => { if (document.fullscreenElement) { wasFull = true; $('.show-tip', root)?.remove(); } else if (wasFull) return close(); size(); };
  root.addEventListener('pointermove', (e) => { wake(); if (tool === 'laser') { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; } });
  let tx = null;
  view.addEventListener('pointerdown', (e) => { tx = { x: e.clientX, y: e.clientY, ty: e.pointerType }; });
  view.addEventListener('pointerup', (e) => {
    if (!tx) return;
    const dx = e.clientX - tx.x, touch = tx.ty === 'touch'; tx = null;
    if (Math.abs(dx) > 50) return dx < 0 ? next() : prev();
    const n = e.target.closest('.el[data-id]'), el = n && deck.slide(cur)?.d.els[n.dataset.id], a = e.target.closest('a');
    const link = a ? a.getAttribute('href') : el?.link;
    if (link && okLink(link)) { e.preventDefault(); openLink(link, to); return; }
    if (el?.t === 'video' && el.vid) { if (!n.querySelector('iframe,video,sav-video')) playIn(n, el); return; }
    if (e.button === 0) touch && e.clientX < innerWidth * .28 ? prev() : next();
    wake();
  });
  view.addEventListener('click', (e) => { if (e.target.closest('a')) e.preventDefault(); });
  view.addEventListener('contextmenu', (e) => { e.preventDefault(); prev(); });
  const onChange = (e) => { if (e.detail.ops.some((o) => o.s === cur && o.k === 'slide.set' && Object.keys(o.p).join() === 'notes')) return tell(); if (e.detail.ops.some((o) => o.s === cur || o.k === 'deck.set' || o.k.startsWith('slide.'))) { const s = step; stageRefresh(s); } };
  function stageRefresh(s) { render(1, false); step = Math.min(s, anims().length); reveal(false); }
  deck.addEventListener('change', onChange);
  addEventListener('resize', size); addEventListener('keydown', keys, true); document.addEventListener('fullscreenchange', onFull);

  function close() {
    clearTimeout(auto); clearTimeout(hideT);
    deck.removeEventListener('change', onChange); deck.removeEventListener('people', onPeople);
    deck.setState({ pr: 0, st: 0 });
    removeEventListener('resize', size); removeEventListener('keydown', keys, true); document.removeEventListener('fullscreenchange', onFull);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    chan?.postMessage({ k: 'bye' });
    setTimeout(() => chan?.close(), 200);
    root.remove();
    document.body.classList.remove('showing');
    wakeLock?.release?.().catch(() => {});
    ed.onShowEnd?.(cur);
  }
  let wakeLock;
  navigator.wakeLock?.request('screen').then((w) => { wakeLock = w; }).catch(() => {});
  render(); wake(); drawTools(); root.focus();
  if (withPresenter) presenter(); else full();
  onPeople();
  return { close };
}
