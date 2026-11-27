/**
 * The player: the audio player of SavComponents (<sav-audio>), the same one of the other apps. One player only: it lives
 * in the dock at the bottom of every page (outside #app, so it keeps playing while the pages change) and, while the big
 * player is open (a sheet from the bottom), it moves into it with all its controls, then back to the dock. Moving it
 * does not stop the sound: the element is never left out of the page.
 *
 * Its own controls do the listening: play and pause, back and forward 10 seconds, the bar, the time, the speed (its
 * steps), mute and volume. Around it the app adds only what the player has not: the episode (cover, titles), the sleep
 * timer, the queue.
 *
 * The audio is played from the address of the publisher (the server never copies it). Where the listener is goes to the
 * account every 15 seconds while playing, at every pause and when the page goes away: another device goes on from there.
 * This browser also keeps the episode in the player (localStorage savpodcasts-now), so a reload finds it again.
 * Speed: the one of the podcast (its settings) or the one of the settings; changed in the player, it is kept there.
 * A podcast may skip its first seconds (skip) and count as ended a little before the end (skipEnd).
 * Lock screen and headphones: the Media Session API (play, pause, back, forward, seek, next in the queue).
 */
import { btn, drop, h, iconBtn, put, toast } from './ui.js';
import { t } from './i18n.js';
import { S, EPS, api, keep } from './store.js';
import { prefs, setPrefs } from './account.js';

const NOW_KEY = 'savpodcasts-now';
const SKIP = 10; // the step of the 10-second buttons of sav-audio, also for headphones and keys
/** The speeds of sav-audio (its speed button goes through them). */
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

let cur = null, el = null, audio = null, dock = null, sheet = null, sheetParts = null, rateByApp = false, rateTimer = 0;
let sentAt = 0, sentPos = -1, startAt = null, sleepAt = 0, sleepEnd = false, sleepTick = 0, posStateAt = 0;

export const current = () => cur;
export const isPlaying = () => !!audio && !!cur && !audio.paused && !audio.ended;
export const position = () => (audio && cur ? audio.currentTime : 0);

/** 3723 → "1:02:03", 245 → "4:05". */
export const clock = (s) => { s = Math.max(0, Math.floor(s || 0)); const hh = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0'); return hh ? `${hh}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const abs = (u) => (u ? new URL(u, location.href).href : '');
const subOf = (feed) => S.subs.find((s) => s.id === feed);
const setting = (k, def) => { const p = prefs(); return p[k] ?? def; };
/** The speed for an episode: its podcast's own, or the one of the settings. */
export const speedFor = (feed) => +(subOf(feed)?.settings?.speed || setting('speed', 1));
const setRate = (v) => { if (!audio) return; rateByApp = true; audio.defaultPlaybackRate = audio.playbackRate = v; setTimeout(() => { rateByApp = false; }); };

/** Tells the rows on screen that an episode changed (position, played, playing). */
export function epChanged(id) { document.querySelectorAll(`[data-ep="${id}"]`).forEach((n) => n._upd?.()); }
const changed = () => { if (cur) epChanged(cur.id); window.dispatchEvent(new CustomEvent('pod-player')); paintSheet(); };

function remember() {
  try { if (cur) localStorage.setItem(NOW_KEY, JSON.stringify({ ep: cur, pos: Math.floor(audio?.currentTime || cur.pos || 0) })); else localStorage.removeItem(NOW_KEY); } catch { /* private mode */ }
}

/** At the very end of the audio (the browser pauses there, just before "ended"). */
const atEnd = () => !!audio && (audio.ended || (audio.duration > 0 && audio.currentTime >= audio.duration - 1));
let sending = Promise.resolve();

/**
 * Sends where the listener is (or that the episode is over). One request after the other, in order: a position sent
 * at the end must never arrive after "played" and undo it.
 */
function send(done = false) {
  if (!cur || !audio) return;
  const pos = Math.floor(audio.currentTime || 0), dur = Math.floor(audio.duration || cur.dur || 0);
  if (!done && (pos === sentPos || pos < 1 || atEnd())) return; // at the end, finish() says "played"
  if (done && cur.done && sentPos === -2) return; // already said
  sentPos = done ? -2 : pos;
  sentAt = Date.now();
  const e = EPS.get(cur.id) || cur;
  Object.assign(e, done ? { pos: 0, done: true } : { pos, done: false }, dur ? { dur } : {});
  cur.pos = e.pos;
  cur.done = e.done;
  remember();
  const body = { id: cur.id, pos, dur, done };
  sending = sending.then(() => api('pod.progress', body)).catch(() => {});
}

// ------------------------------------------------------------------ playing

/** Plays an episode (or pauses it, when it is the one playing). at: the second to start from. */
export async function play(ep, at = null) {
  if (!ep?.audio) return;
  build();
  if (cur?.id === ep.id && at === null) { toggle(); return; }
  if (cur) send();
  load(ep, at ?? (ep.done ? 0 : ep.pos || 0));
  audio.play().catch(playFailed);
  // an episode that starts leaves the queue: the queue is what comes after
  if (S.queue.some((e) => e.id === ep.id)) {
    S.queue = S.queue.filter((e) => e.id !== ep.id);
    window.dispatchEvent(new CustomEvent('pod-queue'));
    api('pod.queue_remove', { id: ep.id }).then((r) => { S.queue = keep(r.queue); window.dispatchEvent(new CustomEvent('pod-queue')); }).catch(() => {});
  }
}
function playFailed(e) { if (e?.name !== 'AbortError' && e?.name !== 'NotAllowedError') toast(t('err_audio'), 'danger'); }

/** Puts an episode in the player without starting it. */
function load(ep, at) {
  cur = { id: ep.id, feed: ep.feed, title: ep.title, audio: ep.audio, image: ep.image, thumb: ep.thumb, dur: ep.dur, pos: ep.pos || 0, done: !!ep.done, podcast: ep.podcast || (subOf(ep.feed) ? { id: ep.feed, title: subOf(ep.feed).title } : null) };
  EPS.set(cur.id, Object.assign(EPS.get(cur.id) || {}, ep));
  sentPos = -1;
  const sub = subOf(cur.feed)?.settings || {};
  startAt = at > 0 ? at : (sub.skip || 0);
  meta(!sheet?.open);
  setRate(speedFor(cur.feed));
  el.setAttribute('src', cur.audio);
  dock.hidden = false;
  document.body.classList.add('has-dock');
  media();
  remember();
  changed();
}

export function toggle() { if (!cur) return; if (audio.paused || audio.ended) audio.play().catch(playFailed); else audio.pause(); }
export function seek(s) { if (!cur || !audio) return; audio.currentTime = Math.max(0, Math.min(audio.duration || s, s)); }

/** Plays from a second of an episode (the times written in the notes). */
export function playAt(ep, s) { if (cur?.id === ep.id) { seek(s); if (audio.paused) audio.play().catch(playFailed); } else play(ep, s); }

/** The episode is over: it counts as played, the queue goes on (unless the sleep timer waits for the end). */
function finish() {
  if (!cur || (cur.done && sentPos === -2)) return;
  send(true);
  cur.done = true;
  audio.pause();
  changed();
  if (sleepEnd) { setSleep(0); return; }
  if (setting('autoplay', true) !== false && S.queue.length) play(S.queue[0], 0);
}

export function next() { if (S.queue.length) play(S.queue[0], 0); }

/** The saves of positions still on their way (the next request for that episode waits for them). */
export const settled = () => sending;

/** An episode forgotten (not liked): out of the player when it is there, without saving its position again. */
export function dropEpisode(id) {
  if (!cur || cur.id !== id) return;
  sentPos = Math.floor(audio?.currentTime || 0); // send() skips a position already sent: closing saves nothing
  close();
}

/** The episode on the player itself (in the dock); in the big player the cover and titles are already above it. */
function meta(show) {
  if (!el || !cur) return;
  for (const [k, v] of [['title', cur.title], ['artist', cur.podcast?.title || ''], ['cover', cur.thumb || '']]) { if (show && v) el.setAttribute(k, v); else el.removeAttribute(k); }
  el.setAttribute('aria-label', cur.title);
}

/** Takes the episode out of the player. */
export function close() {
  if (!cur) return;
  send();
  audio.pause();
  sheet?.hide?.();
  el.removeAttribute('src');
  audio.removeAttribute('src');
  audio.load();
  const id = cur.id;
  cur = null;
  remember();
  setSleep(0, true);
  dock.hidden = true;
  document.body.classList.remove('has-dock');
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  epChanged(id);
  window.dispatchEvent(new CustomEvent('pod-player'));
}

/** A speed chosen with the button of the player: kept for the podcast (when it has its own) or in the settings. */
function keepRate() {
  if (rateByApp || !cur || !audio) return;
  const v = audio.playbackRate, sub = subOf(cur.feed);
  clearTimeout(rateTimer);
  rateTimer = setTimeout(() => {
    if (sub?.settings?.speed) { sub.settings = { ...sub.settings, speed: v }; api('pod.sub_settings', { id: sub.id, settings: sub.settings }).catch(() => {}); } else setPrefs({ speed: v }).catch(() => {});
  }, 700);
}

// ------------------------------------------------------------------ sleep timer

/** minutes, 'end' (at the end of the episode) or 0 (off). The volume goes down for the last 8 seconds. */
export function setSleep(v, quiet = false) {
  clearInterval(sleepTick);
  sleepAt = 0;
  sleepEnd = v === 'end';
  if (audio) audio.volume = 1;
  if (v && v !== 'end') {
    sleepAt = Date.now() + v * 60000;
    sleepTick = setInterval(() => {
      const left = sleepAt - Date.now();
      if (audio && left < 8000) audio.volume = Math.max(0, left / 8000);
      if (left <= 0) { audio?.pause(); setSleep(0, true); }
      paintSleep();
    }, 1000);
    if (!quiet) toast(t('sleep_set', { n: v }), 'neutral', { duration: 2500 });
  } else if (v === 'end' && !quiet) toast(t('sleep_set_end'), 'neutral', { duration: 2500 });
  paintSleep();
}
const sleepText = () => (sleepEnd ? t('sleep_end') : sleepAt ? clock((sleepAt - Date.now()) / 1000) : '');
const sleepMenu = (trigger, placement = 'top-end') => drop(trigger, () => [{ head: t('sleep') }, ['', t('sleep_off'), () => setSleep(0), { check: !sleepAt && !sleepEnd }],
  ...[5, 15, 30, 45, 60, 90].map((n) => ['', t('sleep_min', { n }), () => setSleep(n)]), ['', t('sleep_end'), () => setSleep('end'), { check: sleepEnd }]], { placement, label: t('sleep') });
function paintSleep() {
  const on = !!(sleepAt || sleepEnd);
  for (const b of [dock?._sleep, sheetParts?.sleep]) {
    if (!b) continue;
    b.variant = on ? 'primary' : 'neutral';
    b.appearance = b === sheetParts?.sleep ? (on ? 'soft' : 'outline') : on ? 'soft' : 'ghost';
    b.title = sleepAt ? t('sleep_left', { t: sleepText() }) : sleepEnd ? t('sleep_end') : t('sleep');
  }
  if (sheetParts) sheetParts.sleep.lastChild.textContent = on ? sleepText() : t('sleep');
}

// ------------------------------------------------------------------ lock screen, headphones, keyboard

function media() {
  if (!('mediaSession' in navigator) || !cur) return;
  try {
    const art = cur.image ? [{ src: abs(cur.image), sizes: '400x400', type: 'image/jpeg' }] : [{ src: abs('icons/icon-512.png'), sizes: '512x512', type: 'image/png' }];
    navigator.mediaSession.metadata = new MediaMetadata({ title: cur.title, artist: cur.podcast?.title || '', album: 'SavPodcasts', artwork: art });
  } catch { /* old browsers */ }
}
function mediaHandlers() {
  if (!('mediaSession' in navigator)) return;
  const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch { /* not supported */ } };
  set('play', () => audio.play().catch(playFailed));
  set('pause', () => audio.pause());
  set('seekbackward', (d) => seek(position() - (d?.seekOffset || SKIP)));
  set('seekforward', (d) => seek(position() + (d?.seekOffset || SKIP)));
  set('seekto', (d) => { if (d?.seekTime != null) seek(d.seekTime); });
  set('previoustrack', () => seek(position() - SKIP));
  set('nexttrack', () => (S.queue.length ? next() : seek(position() + SKIP)));
}
function posState() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState || !audio?.duration || !isFinite(audio.duration)) return;
  if (Date.now() - posStateAt < 4000) return;
  posStateAt = Date.now();
  try { navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration) }); } catch { /* ignore */ }
}
/** Space or K plays and pauses, J and L go back and forward 10 seconds: only when no field or control has the keyboard (the player has its own keys). */
function keys(e) {
  if (!cur || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
  const path = e.composedPath();
  if (path.some((x) => x.localName && (/^(input|textarea|select|sav-input|sav-search|sav-select|sav-textarea|sav-range|sav-audio|sav-dropdown|sav-dialog|sav-drawer|button|a|sav-button)$/.test(x.localName) || x.isContentEditable))) return;
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'k') { e.preventDefault(); toggle(); } else if (k === 'j') seek(position() - SKIP); else if (k === 'l') seek(position() + SKIP);
}

// ------------------------------------------------------------------ the dock and the big player

/** The controls of sav-audio in the dock, and in the big player (with mute and volume too). */
const DOCK_CONTROLS = 'play skip seek time speed', SHEET_CONTROLS = 'play skip seek time speed mute volume';

function build() {
  if (dock) return;
  dock = document.getElementById('dock');
  el = h('sav-audio.dk-audio', { controls: DOCK_CONTROLS, 'replay-label': t('play') });
  const slot = h('div.dk-slot', el);
  dock.append(slot); // connected: its <audio> exists from here on
  audio = el.audio;
  audio.preload = 'metadata';
  audio.addEventListener('loadedmetadata', () => {
    if (startAt != null) { const s = startAt; startAt = null; if (s > 0 && s < (audio.duration || Infinity) - 5) audio.currentTime = s; }
    setRate(speedFor(cur?.feed));
  });
  audio.addEventListener('timeupdate', () => {
    if (!cur) return;
    const sub = subOf(cur.feed)?.settings || {};
    if (sub.skipEnd && audio.duration && audio.currentTime >= audio.duration - sub.skipEnd && !audio.paused) { finish(); return; }
    if (!audio.paused && Date.now() - sentAt > 15000) send();
    posState();
    epChanged(cur.id);
  });
  audio.addEventListener('play', () => { changed(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
  audio.addEventListener('pause', () => { send(); changed(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });
  audio.addEventListener('ended', finish);
  audio.addEventListener('ratechange', () => { keepRate(); posStateAt = 0; posState(); });
  audio.addEventListener('error', () => { if (cur && audio.getAttribute('src')) toast(t('err_audio'), 'danger'); });
  const save = () => { if (cur) { send(); remember(); } };
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  addEventListener('keydown', keys);
  addEventListener('pod-signout', () => { close(); try { localStorage.removeItem(NOW_KEY); } catch { /* */ } });
  mediaHandlers();

  // a press on the cover of the player in the dock opens the big player (the cover is a part of sav-audio: part="cover")
  el.addEventListener('click', (e) => { if (el.parentNode === slot && e.composedPath().some((n) => n.getAttribute?.('part') === 'cover')) openSheet(); });
  const sleepB = h('sav-button.dk-sleep', { appearance: 'ghost', variant: 'neutral', size: 'sm', square: true, icon: 'timer', label: t('sleep'), title: t('sleep') });
  dock._sleep = sleepB;
  dock.append(h('div.dk-side', sleepMenu(sleepB), iconBtn('list-music', t('nav_queue'), () => { location.hash = '#/queue'; }, { place: 'top', class: 'dk-q' }),
    iconBtn('chevron-up', t('open_player'), openSheet, { place: 'top', class: 'dk-open' }), iconBtn('chevron-down', t('hide_player'), () => setMini(true), { place: 'top', class: 'dk-hide' })));
  // hidden: only a small pill at the bottom right (cover, play/pause, show again); the sound goes on
  const miniCv = h('img', { alt: '', width: 40, height: 40 });
  const miniPlay = h('sav-button.dk-mplay', { variant: 'primary', appearance: 'solid', size: 'sm', square: true, icon: 'play', label: t('play'), onclick: () => toggle() });
  dock.append(h('div.dk-mini', h('button.dk-mcv', { type: 'button', title: t('show_player'), 'aria-label': t('show_player'), onclick: () => setMini(false) }, miniCv, h('span.dk-mring')), miniPlay,
    iconBtn('chevron-up', t('show_player'), () => setMini(false), { place: 'top', class: 'dk-mshow' })));
  dock._slot = slot;
  dock._mini = { cv: miniCv, play: miniPlay };
  addEventListener('pod-player', paintMini);
  audio.addEventListener('timeupdate', () => { if (dock.classList.contains('mini')) dock.style.setProperty('--done', (audio.duration ? Math.min(100, (audio.currentTime / audio.duration) * 100) : 0) + '%'); });
  setMini(localStorage.getItem('savpodcasts-mini') === '1', true);
}

/** The player bar hidden (a small pill) or shown; remembered in this browser. */
function setMini(on, quiet = false) {
  if (!dock) return;
  dock.classList.toggle('mini', on);
  document.body.classList.toggle('dock-mini', on);
  try { localStorage.setItem('savpodcasts-mini', on ? '1' : '0'); } catch { /* private mode */ }
  paintMini();
  if (!quiet) (on ? dock.querySelector('.dk-mcv') : dock.querySelector('.dk-hide'))?.focus?.();
}
function paintMini() {
  const m = dock?._mini;
  if (!m || !cur) return;
  if (cur.thumb) { m.cv.src = cur.thumb; m.cv.hidden = false; } else m.cv.hidden = true;
  const on = isPlaying();
  m.play.icon = on ? 'pause' : 'play';
  m.play.label = t(on ? 'pause' : 'play');
  m.play.title = `${t(on ? 'pause' : 'play')} – ${cur.title}`;
}

function openSheet() {
  if (!cur) return;
  if (!sheet) {
    const img = h('img.pl-cover', { alt: '' });
    const ttl = h('a.pl-title'), pod = h('a.pl-pod');
    const slot = h('div.pl-slot');
    const sleep = h('sav-button', { appearance: 'outline', variant: 'neutral', size: 'sm', icon: 'timer' }, t('sleep'));
    const nextB = btn(t('next_ep'), { size: 'sm', icon: 'skip-forward', onclick: () => next() });
    const upnext = h('div.pl-next');
    sheet = h('sav-drawer.plsheet', { placement: 'bottom', label: t('now_playing') },
      h('div.pl', img, h('div.pl-head', ttl, pod), slot,
        h('div.pl-more', sleepMenu(sleep, 'top'), nextB, btn(t('nav_queue'), { size: 'sm', icon: 'list-music', appearance: 'ghost', href: '#/queue' }), btn(t('close_player'), { size: 'sm', icon: 'x', appearance: 'ghost', onclick: () => close() })), upnext));
    ttl.addEventListener('click', () => sheet.hide());
    pod.addEventListener('click', () => sheet.hide());
    // the one player goes back to the dock when the big player closes
    sheet.addEventListener('sav-after-hide', (e) => { if (e.target === sheet) { el.setAttribute('controls', DOCK_CONTROLS); meta(true); dock._slot.append(el); } });
    document.body.append(sheet);
    sheetParts = { img, ttl, pod, slot, sleep, nextB, upnext };
  }
  el.setAttribute('controls', SHEET_CONTROLS);
  meta(false);
  sheetParts.slot.append(el);
  paintSheet();
  paintSleep();
  customElements.whenDefined('sav-drawer').then(() => sheet.show());
}

function paintSheet() {
  const p = sheetParts;
  if (!p || !cur) return;
  if (cur.image) { p.img.src = cur.image; p.img.hidden = false; } else p.img.hidden = true;
  p.ttl.textContent = cur.title;
  p.ttl.href = '#/e/' + cur.id;
  p.pod.textContent = cur.podcast?.title || '';
  p.pod.href = '#/p/' + cur.feed;
  p.nextB.hidden = !S.queue.length;
  put(p.upnext, S.queue.length ? [h('h3', t('up_next')), ...S.queue.slice(0, 3).map((e) => h('button.pl-q', { type: 'button', onclick: () => play(e, null) }, e.thumb ? h('img', { src: e.thumb, alt: '', width: 40, height: 40, loading: 'lazy' }) : null, h('span', h('b', e.title), h('small', e.podcast?.title || ''))))] : null);
}

// ------------------------------------------------------------------ start

/** Called once signed in: the episode left in the player comes back (paused, where the account says it stopped), unless it was played to the end. */
export async function initPlayer() {
  build();
  window.addEventListener('pod-queue', () => paintSheet());
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(NOW_KEY) || 'null'); } catch { /* */ }
  if (!saved?.ep?.id || cur) return;
  let ep = saved.ep, at = saved.pos || 0;
  try {
    const r = await api('pod.episode', undefined, { id: ep.id });
    ep = { ...r.episode, podcast: r.episode.podcast || { id: r.podcast.id, title: r.podcast.title } };
    // an episode played to the end does not come back into the player: it is done
    if (r.episode.done) { try { localStorage.removeItem(NOW_KEY); } catch { /* */ } return; }
    if (r.episode.pos) at = r.episode.pos;
    keep([ep]);
  } catch (e) {
    if (e.code === 'not_found') { try { localStorage.removeItem(NOW_KEY); } catch { /* */ } return; }
  }
  if (!cur) load(ep, at);
}
