/**
 * What the pages share: an episode as a row (with its play button, progress and menu), a podcast as a cover, and what
 * can be done with them (queue, played, star, follow). A row keeps itself up to date: the player calls _upd on every
 * element with data-ep="<id>" (epChanged), so the progress moves in every list on screen.
 */
import { copyText, drop, fail, h, icon, toast } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { S, EPS, api, keep } from './store.js';
import { clock, current, dropEpisode as dropFromPlayer, epChanged, isPlaying, play, position, settled } from './player.js';
import { go } from './account.js';

/** 3725 → "1 h 2 min", 2400 → "40 min", 40 → "40 s". */
export function dur(s) {
  s = Math.round(s || 0);
  if (s <= 0) return '';
  if (s < 60) return t('s_only', { s });
  const hh = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return hh ? t('h_m', { h: hh, m }) : t('m_only', { m });
}
/** The date of an episode: "yesterday", "3 days ago", or the date. */
export function day(iso) {
  if (!iso) return '';
  const d = new Date(iso), days = (Date.now() - d) / 86400000;
  if (days < 7) return when(iso);
  return d.toLocaleDateString(getLang(), { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
const initial = (s) => (String(s || '?').trim()[0] || '?').toUpperCase();
const hueOf = (s) => [...String(s || '')].reduce((a, c) => (a * 31 + c.codePointAt(0)) % 360, 11);

/** A cover: the picture through the server, or (none, or it does not load) a tile with the initial. */
export function cover(src, name, cls = '') {
  const ph = () => h('span.ph' + (cls ? '.' + cls : ''), { style: `--h:${hueOf(name)}`, 'aria-hidden': 'true' }, initial(name));
  if (!src) return ph();
  const img = h('img.cv' + (cls ? '.' + cls : ''), { src, alt: '', loading: 'lazy', decoding: 'async' });
  img.addEventListener('error', () => img.replaceWith(ph()), { once: true });
  return img;
}

// ------------------------------------------------------------------ actions

const queued = (id) => S.queue.some((e) => e.id === id);
const queueChanged = () => window.dispatchEvent(new CustomEvent('pod-queue'));
export async function queueAdd(ep, at) {
  const r = await api('pod.queue_add', { id: ep.id, at });
  S.queue = keep(r.queue);
  queueChanged();
  epChanged(ep.id);
  toast(t(at === 'next' ? 'added_next' : 'added_queue'), 'success', { duration: 2200 });
}
export async function queueRemove(ep) {
  const r = await api('pod.queue_remove', { id: ep.id });
  S.queue = keep(r.queue);
  queueChanged();
  epChanged(ep.id);
}
export async function mark(ep, done) {
  await api('pod.mark', { ids: [ep.id], done });
  Object.assign(EPS.get(ep.id) || ep, { done, pos: 0 });
  Object.assign(ep, { done, pos: 0 });
  if (done && queued(ep.id)) { S.queue = S.queue.filter((e) => e.id !== ep.id); queueChanged(); }
  epChanged(ep.id);
}
export async function star(ep, on) {
  await api('pod.star', { id: ep.id, on });
  Object.assign(EPS.get(ep.id) || ep, { starred: on });
  ep.starred = on;
  epChanged(ep.id);
}
/**
 * An episode started and not liked: out of "Continue listening" and of the history (position forgotten), with Undo in
 * the message. The home is told (pod-home) to draw itself again.
 */
export async function forget(ep) {
  dropFromPlayer(ep.id);
  await settled();
  const r = await api('pod.forget', { id: ep.id });
  const e = EPS.get(ep.id) || ep;
  Object.assign(e, { pos: 0, done: false });
  epChanged(ep.id);
  window.dispatchEvent(new CustomEvent('pod-home'));
  const msg = toast(t('forgotten', { t: ep.title }), 'neutral', { duration: 12000 });
  const undo = h('sav-button', { size: 'sm', appearance: 'outline', variant: 'neutral', class: 'toast-undo' }, t('undo'));
  undo.addEventListener('click', async () => {
    undo.loading = true;
    try {
      await api('pod.forget', { id: ep.id, restore: r.was });
      Object.assign(e, { pos: r.was.pos });
      epChanged(ep.id);
      window.dispatchEvent(new CustomEvent('pod-home'));
      msg.remove?.();
    } catch (x) { fail(x); undo.loading = false; }
  });
  msg?.append?.(undo);
}

/** Follow a podcast, or stop: the list of the podcasts followed comes back with the answer. */
export async function follow(p, on) {
  const r = await api(on ? 'pod.subscribe' : 'pod.unsubscribe', { id: p.id });
  S.subs = r.subs;
  window.dispatchEvent(new CustomEvent('pod-subs'));
  toast(t(on ? 'now_following' : 'unfollowed', { t: p.title }), on ? 'success' : 'neutral', { duration: 2500 });
}
/** A podcast of a catalogue (only its feed address): read now, then its page. */
export async function openFeed(url, box) {
  box?.classList.add('busy');
  try { const r = await api('pod.open', { url }); go('#/p/' + r.id); } finally { box?.classList.remove('busy'); }
}
export function download(ep) {
  const a = h('a', { href: ep.audio, target: '_blank', rel: 'noopener noreferrer', download: '' });
  document.body.append(a);
  a.click();
  a.remove();
}

/** The menu of an episode. */
export const epMenu = (ep, o = {}) => () => [
  queued(ep.id) ? ['list-x', t('remove_queue'), () => queueRemove(ep)] : null,
  !queued(ep.id) && current()?.id !== ep.id ? ['list-start', t('play_next'), () => queueAdd(ep, 'next')] : null,
  !queued(ep.id) && current()?.id !== ep.id ? ['list-plus', t('add_queue'), () => queueAdd(ep, 'last')] : null,
  '-',
  ep.done ? ['circle', t('mark_unplayed'), () => mark(ep, false)] : ['circle-check', t('mark_played'), () => mark(ep, true)],
  !ep.done && (ep.pos > 0 || current()?.id === ep.id) ? ['x', t('forget_ep'), () => forget(ep)] : null,
  ['star', t(ep.starred ? 'unstar' : 'star'), () => star(ep, !ep.starred), { check: ep.starred }],
  '-',
  o.page !== false ? ['info', t('ep_page'), () => go('#/e/' + ep.id)] : null,
  o.podcast !== false ? ['podcast', t('go_podcast'), () => go('#/p/' + ep.feed)] : null,
  ['download', t('download_audio'), () => download(ep)],
  ['link', t('copy_link'), () => copyText(ep.audio)],
];

// ------------------------------------------------------------------ an episode as a row

/** opts: podcast (show its cover and name), summary (two lines of the notes), grip (in the queue). */
export function epRow(ep, opts = {}) {
  ep = EPS.get(ep.id) || ep;
  const meta = h('div.ep-meta'), foot = h('div.ep-foot'), playB = h('sav-button.ep-play', { variant: 'neutral', appearance: 'soft', size: 'sm', square: true, icon: 'play', label: t('play') });
  playB.addEventListener('click', (e) => { e.stopPropagation(); play(ep); });
  const menu = drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true }), epMenu(ep, opts), { placement: 'bottom-end', label: ep.title });
  const row = h('div.ep', { 'data-ep': ep.id, role: 'listitem' },
    opts.podcast ? h('a.ep-cv', { href: '#/e/' + ep.id, tabindex: '-1', 'aria-hidden': 'true' }, cover(ep.thumb, ep.podcast?.title || ep.title, 'sm')) : null,
    h('div.ep-main', meta, h('a.ep-title', { href: '#/e/' + ep.id }, ep.title), opts.summary && ep.summary ? h('p.ep-sum', ep.summary) : null, foot),
    h('div.ep-act', playB, menu));
  row._upd = () => {
    const e = EPS.get(ep.id) || ep, isCur = current()?.id === e.id, on = isCur && isPlaying();
    const pos = isCur ? position() : e.pos, total = e.dur || 0;
    const showDone = !!e.done && !on; // played: also when it is still in the player, unless it is playing again
    row.classList.toggle('done', showDone);
    row.classList.toggle('cur', isCur);
    playB.icon = on ? 'pause' : 'play';
    playB.label = t(on ? 'pause' : pos > 0 ? 'resume' : 'play');
    playB.variant = isCur ? 'primary' : 'neutral';
    const bits = [];
    if (opts.podcast && e.podcast?.title) bits.push(h('a.ep-pod', { href: '#/p/' + e.feed }, e.podcast.title));
    if (e.date) bits.push(h('span', day(e.date)));
    if (e.kind && e.kind !== 'full') bits.push(h('span.kind', t(e.kind)));
    else if (e.season && e.ep) bits.push(h('span', t('season_ep', { s: e.season, e: e.ep })));
    meta.replaceChildren(...bits.flatMap((b, i) => (i ? [h('span.dot', '·'), b] : [b])));
    const parts = [];
    if (showDone) parts.push(h('span.ep-done', icon('circle-check'), t('played')));
    else if (pos > 0 && total) parts.push(h('span.ep-prog', h('i', { style: `width:${Math.min(100, (pos / total) * 100)}%` })), h('span', t('left_t', { t: dur(total - pos) || clock(total - pos) })));
    else if (total) parts.push(h('span', dur(total)));
    if (e.starred) parts.push(icon('star', { class: 'ep-star', label: t('lib_starred') }));
    if (queued(e.id)) parts.push(icon('list-music', { class: 'ep-q', label: t('nav_queue') }));
    foot.replaceChildren(...parts);
  };
  row._upd();
  return row;
}
export const epList = (eps, opts = {}) => h('div.eplist', { role: 'list' }, keep(eps).map((e) => epRow(e, opts)));

// ------------------------------------------------------------------ a podcast as a cover

/**
 * p: a podcast known here ({id, title, author, image, new, …}) or a result of a catalogue ({url, title, author, image,
 * episodes, latest, id?, sub?}). A click opens its page (reading the feed first when it is not known yet).
 */
export function podCard(p, o = {}) {
  const href = p.id ? '#/p/' + p.id : null;
  const card = h(href ? 'a.pcard' : 'button.pcard', href ? { href } : { type: 'button', onclick: () => openFeed(p.url, card).catch(fail) },
    h('span.pc-cv', cover(p.image || p.thumb, p.title), p.new ? h('sav-badge.pc-new', { variant: 'primary', pill: true, size: 'sm' }, String(p.new > 99 ? '99+' : p.new)) : null, h('span.pc-busy', h('sav-spinner'))),
    h('span.pc-t', p.title), p.author ? h('span.pc-a', p.author) : null,
    o.details ? h('span.pc-d', [p.episodes ? (p.episodes === 1 ? t('episodes_1') : t('episodes_n', { n: p.episodes })) : null, p.latest ? t('updated_w', { w: day(p.latest) }) : null].filter(Boolean).join(' · ')) : null);
  return card;
}
