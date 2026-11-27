/**
 * The frame of every page once signed in, as in the other apps of SavOffice: the bar at the top (brand, search, SavOffice,
 * the account), the places on the side with the podcasts followed (on phones, a bar at the bottom instead), the page in
 * the middle and the footer.
 */
import { h, icon, item, primary, put } from './ui.js';
import { t } from './i18n.js';
import { S } from './store.js';
import { brand, credit, go, userMenu } from './account.js';
import { cover } from './eps.js';

const PLACES = [['home', 'home', 'nav_home', '#/'], ['discover', 'compass', 'nav_discover', '#/discover'], ['library', 'library', 'nav_library', '#/library'], ['queue', 'list-music', 'nav_queue', '#/queue']];

/** The search of the bar: Enter opens Discover with the words (or the address of a feed). */
function searchBox(value = '') {
  const s = h('sav-input.hs', { type: 'search', placeholder: t('search_ph'), value, clearable: true, pill: true, 'aria-label': t('search_ph') }, icon('search', { slot: 'prefix' }));
  s.addEventListener('keydown', (e) => { if (e.key === 'Enter' && s.value.trim()) go('#/discover/' + encodeURIComponent(s.value.trim())); });
  return s;
}

/** The podcasts followed, on the side: the newest first, with how many new episodes. */
function following(active) {
  if (!S.subs.length) return null;
  return h('div.side-subs', h('div.navh', t('following')), h('div.side-list', S.subs.slice(0, 200).map((p) => h('a.side-pod' + (active === 'p' + p.id ? '.on' : ''), { href: '#/p/' + p.id, title: p.title },
    cover(p.thumb, p.title, 'xs'), h('span', p.title), p.new ? h('b.side-new', String(p.new > 99 ? '99+' : p.new)) : null))));
}

/**
 * frame(root, active, ...content): active is home | discover | library | queue | p<id> (a podcast) | settings.
 * Returns the <main>, where the page can put more later.
 */
export function frame(root, active, ...content) {
  const menu = h('sav-menu', { label: 'SavPodcasts', selectable: true }, PLACES.map(([k, ic, label]) => { const x = item(k, ic, t(label)); x.toggleAttribute('current', k === active); if (k === 'queue' && S.queue.length) x.append(h('sav-badge', { slot: 'suffix', pill: true, size: 'sm', variant: 'neutral' }, String(S.queue.length))); return x; }));
  menu.addEventListener('sav-select', (e) => go(PLACES.find((p) => p[0] === e.detail.value)[3]));
  // as the New button of the other apps: the main thing to do, adding a podcast
  const side = h('nav.hside', { 'aria-label': 'SavPodcasts' }, primary(t('add_podcast'), { icon: 'plus', size: 'lg', block: true, class: 'newbtn', onclick: () => go('#/discover') }), menu, following(active));
  const main = h('main.hmain', content);
  const bottom = h('sav-bottom-nav.bnav', { fixed: true, 'mobile-only': true, label: 'SavPodcasts' }, PLACES.map(([k, ic, label, to]) => h('sav-bottom-nav-item', { icon: ic, label: t(label), href: to, current: k === active, badge: k === 'queue' && S.queue.length ? String(S.queue.length) : null })));
  const q = location.hash.startsWith('#/discover/') ? decodeURIComponent(location.hash.split('/')[2] || '') : '';
  put(root, h('div.home', h('header.htop', brand(), h('div.hsearch', searchBox(q)), h('div.spacer'), userMenu()), h('div.hbody', side, main), credit(), bottom));
  // the side follows the podcasts followed and the queue while the page stays
  const again = () => { if (!side.isConnected) { removeEventListener('pod-subs', again); removeEventListener('pod-queue', again); return; } const f = following(active); side.querySelector('.side-subs')?.remove(); if (f) side.append(f); const qi = menu.querySelector('sav-menu-item[value="queue"]'); qi?.querySelector('sav-badge')?.remove(); if (S.queue.length) qi?.append(h('sav-badge', { slot: 'suffix', pill: true, size: 'sm', variant: 'neutral' }, String(S.queue.length))); const bq = bottom.querySelectorAll('sav-bottom-nav-item')[3]; if (S.queue.length) bq.setAttribute('badge', String(S.queue.length)); else bq.removeAttribute('badge'); };
  addEventListener('pod-subs', again);
  addEventListener('pod-queue', again);
  return main;
}

/** The title of a page with what goes on its right. */
export const head = (title, ...right) => h('div.hhead', h('h1', title), h('span.spacer'), right);
export const section = (title, ...right) => h('div.shead2', h('h2', title), h('span.spacer'), right);
