/**
 * Home: what was left half listened, then the new episodes of the podcasts followed, newest first. In the background the
 * feeds that are old are read again (pod.refresh, again while some are still arriving after an import): when something
 * new came, the lists are drawn again.
 */
import { btn, empty, fail, h, primary, put, toggle } from './ui.js';
import { t } from './i18n.js';
import { EPS, S, api, keep } from './store.js';
import { commands, prefs, setPrefs } from './account.js';
import { frame, head, section } from './shell.js';
import { cover, dur, epRow, forget } from './eps.js';
import { clock, current, isPlaying, play, position } from './player.js';
import { importOpml } from './library.js';

let refreshing = null, lastRefresh = 0;

/** Reads the old feeds of the account again; true when new episodes came. Once every few minutes at most. */
export async function refresh(force = false, onStep = null) {
  if (refreshing) return refreshing;
  if (!force && Date.now() - lastRefresh < 4 * 60000) return false;
  refreshing = (async () => {
    let any = false;
    try {
      for (let i = 0; i < 12; i++) {
        const r = await api('pod.refresh', {});
        S.pending = r.pending;
        if (r.updated) any = true;
        onStep?.(r);
        if (!r.checked || (!r.pending && r.checked < 12)) break;
      }
      if (any) { const x = await api('pod.init'); S.subs = x.subs; S.queue = keep(x.queue); window.dispatchEvent(new CustomEvent('pod-subs')); window.dispatchEvent(new CustomEvent('pod-queue')); }
    } finally { lastRefresh = Date.now(); refreshing = null; }
    return any;
  })();
  return refreshing;
}

/** A card of "Continue listening": the cover, from where it resumes and how much is left; a press goes on from there. */
function contCard(ep) {
  ep = EPS.get(ep.id) || ep;
  const card = h('button.ccard', { type: 'button', 'data-ep': ep.id, onclick: () => play(ep), title: ep.title },
    h('span.cc-cv', cover(ep.image, ep.podcast?.title || ep.title), h('span.cc-pp', h('sav-icon', { name: 'play' }))),
    h('span.cc-t', ep.title), h('span.cc-a', ep.podcast?.title || ''), h('span.cc-bar', h('i')), h('span.cc-from'), h('span.cc-left'));
  card._upd = () => {
    const e = EPS.get(ep.id) || ep, isCur = current()?.id === e.id, pos = isCur ? position() : e.pos, d = e.dur || 0, on = isCur && isPlaying();
    card.querySelector('.cc-bar i').style.width = d ? Math.min(100, (pos / d) * 100) + '%' : '0';
    card.querySelector('.cc-from').textContent = on ? t('now_playing') : t('resume_from', { t: clock(pos) });
    card.querySelector('.cc-left').textContent = d ? t('left_t', { t: dur(d - pos) }) : '';
    card.querySelector('.cc-pp sav-icon').setAttribute('name', on ? 'pause' : 'play');
    card.setAttribute('aria-label', `${e.title} – ${on ? t('pause') : t('resume_from', { t: clock(pos) })}`);
    card.classList.toggle('cur', isCur);
  };
  card._upd();
  const x = h('sav-button.cc-x', { size: 'sm', appearance: 'ghost', variant: 'neutral', square: true, icon: 'x', label: t('forget_ep'), title: t('forget_ep'), onclick: (ev) => { ev.stopPropagation(); forget(ep).catch(fail); } });
  return h('div.ccw', card, x);
}

/** A small card of "Listen again": an episode played to the end, from the start. */
function againCard(ep) {
  ep = EPS.get(ep.id) || ep;
  const card = h('button.ccard.small', { type: 'button', 'data-ep': ep.id, onclick: () => play(ep, current()?.id === ep.id ? null : 0), title: ep.title },
    h('span.cc-cv', cover(ep.thumb, ep.podcast?.title || ep.title), h('span.cc-pp', h('sav-icon', { name: 'rotate-ccw' }))),
    h('span.cc-t', ep.title), h('span.cc-a', ep.podcast?.title || ''));
  card._upd = () => {
    const on = current()?.id === ep.id && isPlaying();
    card.querySelector('.cc-pp sav-icon').setAttribute('name', on ? 'pause' : 'rotate-ccw');
    card.setAttribute('aria-label', `${ep.title} – ${on ? t('pause') : t('listen_again')}`);
  };
  card._upd();
  return card;
}

export async function homeScreen(root) {
  const status = h('span.hstatus');
  const body = h('div.homeb', h('div.wait', h('sav-spinner')));
  const main = frame(root, 'home', head(t('nav_home'), status), body);
  document.title = 'SavPodcasts';
  commands();
  let hide = !!prefs().hidePlayed, more = false, latest = [];

  // what was left half listened and what was listened to the end come from any podcast, followed or not;
  // each section can be hidden in the settings (Home)
  const draw = (r) => {
    const p = prefs(), showCont = p.showContinue !== false, showNew = p.showNew !== false, showAgain = p.showAgain !== false;
    hide = !!p.hidePlayed;
    const cont = showCont ? keep(r.continue).filter((e) => !e.done) : [];
    const again = showAgain ? keep(r.again || []).filter((e) => e.done && !cont.some((c) => c.id === e.id)) : [];
    if (!showCont && !showNew && !showAgain) {
      put(body, empty('home', t('home_all_hidden'), t('home_all_hidden_t'), btn(t('open_settings'), { icon: 'settings', href: '#/settings/home' })));
      return;
    }
    const contBox = cont.length ? [section(t('continue')), h('div.crow', cont.map(contCard))] : null;
    const againBox = again.length ? h('section.again', h('div.shead2', h('h2', t('listen_again')), h('span.spacer'), btn(t('lib_history'), { size: 'sm', appearance: 'ghost', 'icon-end': 'arrow-right', href: '#/library/history' })), h('div.crow', again.map(againCard))) : null;
    if (!S.subs.length) {
      put(body, contBox, !showNew && (cont.length || again.length) ? null : h('div.welcome', empty('podcast', t(cont.length || again.length ? 'follow_h' : 'welcome_h'), t(cont.length || again.length ? 'follow_t' : 'welcome_t'), h('div.prow.wrap.center', primary(t('find_podcasts'), { icon: 'compass', href: '#/discover' }), btn(t('import_opml'), { icon: 'file-up', onclick: () => importOpml().then((n) => n && homeScreen(root)) })))), againBox);
      return;
    }
    latest = keep(r.latest);
    more = r.more;
    const list = h('div.eplist', { role: 'list' });
    const fill = () => put(list, latest.filter((e) => !hide || !e.done || current()?.id === e.id).map((e) => epRow(e, { podcast: true, summary: true })));
    fill();
    const loadMore = more ? btn(t('load_more'), { block: true, appearance: 'outline', class: 'more', onclick: async (ev, b) => {
      const x = await api('pod.home', undefined, { before: latest[latest.length - 1]?.date });
      latest = latest.concat(keep(x.latest));
      fill();
      if (!x.more) b.remove();
    } }) : null;
    const hideSw = toggle(t('hide_played'), hide, (v) => { hide = v; setPrefs({ hidePlayed: v }).catch(() => {}); fill(); });
    // last and quieter: what was listened to the end lately
    put(body, contBox, showNew ? [section(t('new_eps'), hideSw), latest.length ? list : empty('podcast', t('no_eps'), ''), loadMore] : null, againBox,
      !contBox && !againBox && !showNew ? empty('home', t('home_all_hidden'), t('home_all_hidden_t'), btn(t('open_settings'), { icon: 'settings', href: '#/settings/home' })) : null);
  };

  const redraw = async () => { if (!main.isConnected) { removeEventListener('pod-home', redraw); return; } try { draw(await api('pod.home')); } catch { /* the next visit */ } };
  addEventListener('pod-home', redraw);
  try { draw(await api('pod.home')); } catch (e) { fail(e); put(body, empty('cloud-off', t('err_network'), '')); return; }
  // new episodes in the background
  if (S.subs.length) {
    const say = (r) => { status.replaceChildren(h('sav-spinner'), ' ', r?.pending ? t('arriving', { n: r.pending }) : t('updating')); };
    if (Date.now() - lastRefresh >= 4 * 60000 || S.pending) say(S.pending ? { pending: S.pending } : null);
    const got = await refresh(!!S.pending, say).catch(() => false);
    status.replaceChildren();
    if (got && main.isConnected) draw(await api('pod.home'));
  }
}
