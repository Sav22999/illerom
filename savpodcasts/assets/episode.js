/**
 * An episode: its cover, podcast, date and length, Play (or Resume), the queue, played, starred, the audio file, and its
 * notes. The times written in the notes (12:34, 1:02:03) become buttons that play from there.
 */
import { btn, drop, h, icon, primary, put } from './ui.js';
import { t } from './i18n.js';
import { EPS, api, keep } from './store.js';
import { commands } from './account.js';
import { frame } from './shell.js';
import { cover, day, dur, epMenu, follow } from './eps.js';
import { clock, current, isPlaying, play, playAt, position } from './player.js';
import { notes } from './podcast.js';

/** The times in the text of the notes as buttons. */
function times(frag, ep) {
  const walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT);
  const found = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/\b\d{1,2}:\d{2}(?::\d{2})?\b/.test(n.nodeValue) && !n.parentNode.closest?.('a')) found.push(n);
  for (const n of found) {
    const parts = n.nodeValue.split(/(\b\d{1,2}:\d{2}(?::\d{2})?\b)/);
    n.replaceWith(...parts.map((p, i) => {
      if (i % 2 === 0) return document.createTextNode(p);
      const s = p.split(':').reduce((a, x) => a * 60 + +x, 0);
      if (ep.dur && s > ep.dur) return document.createTextNode(p);
      return h('button.ts', { type: 'button', title: t('play_from', { t: p }), onclick: () => playAt(ep, s) }, p);
    }));
  }
  return frag;
}

export async function episodeScreen(root, id) {
  const body = h('div.epb', h('div.wait', h('sav-spinner')));
  frame(root, 'ep', body);
  const r = await api('pod.episode', undefined, { id });
  const p = r.podcast;
  const ep = keep([{ ...r.episode, podcast: r.episode.podcast || { id: p.id, title: p.title } }])[0];
  ep.descr = r.episode.descr;
  document.title = ep.title + ' – SavPodcasts';

  const playB = primary(t('play'), { icon: 'play', size: 'lg', onclick: () => play(ep) });
  const info = h('div.eh-info');
  const box = h('section.ehead', { 'data-ep': ep.id },
    h('div.eh-cv', cover(ep.image, p.title, 'lg')),
    h('div.eh-t', h('a.eh-pod', { href: '#/p/' + p.id }, p.title), h('h1', ep.title), info,
      h('div.prow.wrap.eh-act', playB,
        drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'outline', variant: 'neutral', size: 'lg', square: true }), epMenu(ep, { page: false }), { placement: 'bottom-end', label: ep.title }),
        !p.sub ? btn(t('follow'), { icon: 'plus', appearance: 'ghost', onclick: async (e, b) => { await follow(p, true); p.sub = true; b.remove(); } }) : null,
        ep.link ? btn(t('ep_web'), { icon: 'external-link', appearance: 'ghost', onclick: () => window.open(ep.link, '_blank', 'noopener') }) : null)));
  box._upd = () => {
    const e = EPS.get(ep.id) || ep, isCur = current()?.id === e.id, on = isCur && isPlaying(), pos = isCur ? position() : e.pos;
    playB.icon = on ? 'pause' : 'play';
    playB.textContent = t(on ? 'pause' : pos > 0 ? 'resume' : 'play');
    const bits = [e.date ? day(e.date) : null, e.dur ? dur(e.dur) : null, e.kind !== 'full' ? t(e.kind) : e.season && e.ep ? t('season_ep', { s: e.season, e: e.ep }) : e.ep ? t('ep_n', { e: e.ep }) : null].filter(Boolean);
    put(info, h('span', bits.join(' · ')),
      e.done && !on ? h('span.ep-done', icon('circle-check'), t('played')) : pos > 0 && e.dur ? h('span.eh-prog', h('span.ep-prog', h('i', { style: `width:${Math.min(100, (pos / e.dur) * 100)}%` })), t('left_t', { t: clock(e.dur - pos) })) : null,
      e.starred ? h('span.ep-starred', icon('star'), t('lib_starred')) : null);
  };
  box._upd();
  const text = ep.descr ? times(notes(ep.descr), ep) : null;
  put(body, box, h('section.enotes', h('h2', t('notes')), text ? h('div.notes', text) : h('p.muted', t('no_notes'))));
  commands([ep.title, [['play', t('play'), () => play(ep)], ['podcast', t('go_podcast'), '#/p/' + p.id]]]);
}
