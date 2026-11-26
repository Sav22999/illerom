/** The speaker view, in its own window: notes, this slide and the next one, time. The show (present.js) sends what to draw. */
import { h, icon, iconBtn, btn, $ } from './core.js';
import { t } from './i18n.js';
import { context } from './themes.js';
import { slideNode } from './render.js';
import { fixSlide } from './model.js';

export function speakerScreen(app, room) {
  document.body.classList.add('spk');
  document.documentElement.classList.remove('sav-theme-light', 'sav-theme-auto');
  document.documentElement.classList.add('sav-theme-dark');
  const chan = new BroadcastChannel(room), send = (k, p = {}) => chan.postMessage({ k, ...p });
  let st = null, gone = false, size = +(localStorage.getItem('sp-notes-size') || 22), from = Date.now(), stopped = 0;

  const now = h('div.spk-now'), nxt = h('div.spk-next'), notes = h('div.spk-notes', { tabindex: 0 }), count = h('b.spk-n'), timer = h('span.spk-t'), clock = h('span.muted'), dots = h('span.muted');
  const tog = (ic, label, key, fn) => { const tip = iconBtn(ic, `${label} · ${key}`, fn), b = tip.firstElementChild; return { tip, set(on) { b.setAttribute('aria-pressed', String(on)); b.variant = on ? 'primary' : 'neutral'; b.appearance = on ? 'solid' : 'ghost'; } }; };
  const laser = tog('pointer', t('laser'), 'L', () => send('tool', { v: st?.tool === 'laser' ? '' : 'laser' })), black = tog('eye-off', t('black'), 'B', () => send('black'));
  const page = h('sav-select.spk-page', { size: 'sm', 'aria-label': t('go_to_page'), onchange: (e) => { if (e.target.value !== st?.sid) send('to', { sid: e.target.value }); } });
  const pause = iconBtn('pause', t('pause'), () => { if (stopped) { from += Date.now() - stopped; stopped = 0; } else stopped = Date.now(); pause.firstElementChild.icon = stopped ? 'play' : 'pause'; pause.setAttribute('content', stopped ? t('resume') : t('pause')); tick(); }, { size: 'sm' });
  const setSize = (d) => { size = Math.max(14, Math.min(60, size + d)); localStorage.setItem('sp-notes-size', size); notes.style.fontSize = size + 'px'; };
  setSize(0);
  app.append(h('main.spk-main',
    h('header.spk-top', h('div.spk-time', timer, pause, iconBtn('rotate-ccw', t('reset'), () => { from = Date.now(); stopped = stopped ? from : 0; tick(); }, { size: 'sm' })), clock, h('div.spacer'), btn(t('end_show_b'), () => send('end'), { size: 'sm', variant: 'danger', appearance: 'soft', icon: 'x' })),
    h('section.spk-l', h('small.muted', t('current_slide')), now, h('div.spk-c', btn(t('prev'), () => send('prev'), { appearance: 'outline', variant: 'neutral', icon: 'chevron-left' }), btn(t('next'), () => send('next'), { 'icon-end': 'chevron-right' }), count, dots, h('div.spacer'), laser.tip, black.tip, page)),
    h('section.spk-r', h('small.muted', t('next')), nxt, h('div.prow', h('small.muted', t('speaker_notes')), h('div.spacer'), iconBtn('a-arrow-down', t('notes_smaller'), () => setSize(-2), { size: 'sm' }), iconBtn('a-arrow-up', t('notes_bigger'), () => setSize(2), { size: 'sm' })), notes)));
  const slide = (box, d, index) => {
    if (!d) { box.replaceChildren(h('p.muted', t('end_show'))); return; }
    const ctx = context(st.meta), n = slideNode(fixSlide(d), ctx, { mode: 'thumb', index, count: st.n }), th = h('div.thumb', n);
    box.replaceChildren(th);
    const w = Math.min(box.clientWidth, box.clientHeight * ctx.W / ctx.H) || box.clientWidth;
    Object.assign(th.style, { width: w + 'px', height: w * ctx.H / ctx.W + 'px' });
    n.style.transform = `scale(${w / ctx.W})`; n.style.transformOrigin = '0 0';
  };
  let last = '';
  function draw() {
    if (gone) return;
    if (!st) return now.replaceChildren(h('div.center', h('sav-spinner'), h('p', t('speaker_wait'))));
    document.title = st.title + ' – ' + t('speaker_view') + ' – SavPresentations';
    slide(now, st.cur, st.index); slide(nxt, st.next, st.nextIndex);
    now.classList.toggle('off', st.black); now.classList.toggle('pointing', st.tool === 'laser');
    if (last !== st.sid) notes.scrollTop = 0;
    last = st.sid;
    notes.textContent = st.notes || t('no_speaker_notes'); notes.classList.toggle('muted', !st.notes);
    count.textContent = `${st.i + 1} / ${st.n}`; dots.textContent = st.steps ? `${st.step}/${st.steps}` : '';
    laser.set(st.tool === 'laser'); black.set(st.black);
    page.replaceChildren(...st.pages.map(([sid, name], i) => h('option', { value: sid }, [i + 1, name].filter(Boolean).join(' · '))));
    page.value = st.sid;
  }
  function tick() { const s = Math.max(0, Math.floor(((stopped || Date.now()) - from) / 1000)), p = (v) => String(v).padStart(2, '0'); timer.textContent = (s >= 3600 ? p(s / 3600 | 0) + ':' : '') + `${p((s / 60 | 0) % 60)}:${p(s % 60)}`; timer.classList.toggle('muted', !!stopped); clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  const ticking = setInterval(tick, 500);
  tick();
  chan.onmessage = ({ data: m }) => { if (m.k === 'state') { st = m; draw(); } else if (m.k === 'bye') { gone = true; window.close(); app.replaceChildren(h('div.center', h('sav-empty-state', { icon: 'presentation', heading: t('speaker_lost') }))); } };
  // the laser of the audience follows the pointer over the slide here
  now.addEventListener('pointermove', (e) => { if (st?.tool !== 'laser') return; const r = now.querySelector('.thumb')?.getBoundingClientRect(); if (!r) return; const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; if (x >= 0 && y >= 0 && x <= 1 && y <= 1) send('point', { x, y }); });
  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.composedPath().some((x) => /^(input|textarea|sav-select|sav-button)$/.test(x.localName || ''))) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'n', 'Enter'].includes(k)) send('next');
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(k)) send('prev');
    else if (k === 'l') send('tool', { v: st?.tool === 'laser' ? '' : 'laser' }); else if (k === 'b' || k === '.') send('black'); else if (k === 'e') send('clear'); else return;
    e.preventDefault();
  };
  const onBye = () => send('gone');
  addEventListener('keydown', onKey); addEventListener('resize', draw); addEventListener('pagehide', onBye);
  draw(); send('hello');
  return { leave: () => { clearInterval(ticking); removeEventListener('keydown', onKey); removeEventListener('resize', draw); removeEventListener('pagehide', onBye); chan.close(); } };
}
void icon; void $;
