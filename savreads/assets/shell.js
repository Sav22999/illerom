/**
 * The frame of every page once signed in, as in SavDrive and the other apps of SavOffice: the bar at the top (brand, the
 * pill search, SavOffice, the account), the side with the big "New" menu, the places with their counts, the feeds in their
 * folders and the tags; the page in the middle and the footer. On phones the side becomes rows, as in SavDrive: "New",
 * then the places scrolling sideways (never a bar at the bottom); the feeds are chosen on the page of the feeds.
 */
import { h, icon, item, put } from './ui.js';
import { t } from './i18n.js';
import { S } from './store.js';
import { brand, credit, go, userMenu } from './account.js';
import { addFeed, importDialog, saveDialog } from './actions.js';

const PLACES = [['unread', 'inbox', 'nav_unread', '#/'], ['starred', 'star', 'nav_starred', '#/starred'], ['archive', 'archive', 'nav_archive', '#/archive'], ['highlights', 'highlighter', 'nav_highlights', '#/highlights'], ['feeds', 'rss', 'nav_feeds', '#/feeds']];

const n99 = (n) => (n > 999 ? '999+' : String(n));
const unreadAll = () => S.subs.reduce((a, f) => a + f.unread, 0);
const countOf = (k) => (k === 'feeds' ? unreadAll() : k === 'highlights' ? 0 : S.counts[k] || 0);

/** The search of the bar: Enter searches the articles (or, on the pages of the feeds, the feeds). */
function searchBox(value, feeds) {
  const ph = t(feeds ? 'search_feeds_ph' : 'search_ph');
  const s = h('sav-input.hsearch', { type: 'search', placeholder: ph, value: value || '', clearable: true, pill: true, 'aria-label': ph }, icon('search', { slot: 'prefix' }));
  s.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const v = s.value.trim(); go(feeds ? '#/feeds/q/' + encodeURIComponent(v) : v ? '#/search/' + encodeURIComponent(v) : '#/'); } });
  s.addEventListener('sav-clear', () => go(feeds ? '#/feeds' : '#/'));
  return s;
}

/** The big button on top of the side: what can be made, as in SavDrive. */
function newMenu() {
  const trig = h('sav-button', { variant: 'primary', appearance: 'solid', icon: 'plus', size: 'lg', block: true, slot: 'trigger', class: 'newb' }, t('new'));
  const d = h('sav-dropdown.newd', { placement: 'bottom-start', 'sheet-on-mobile': true, label: t('new') }, trig,
    item('save', 'bookmark-plus', t('save_article')), item('feed', 'rss', t('add_feed')), h('sav-divider'), item('import', 'file-up', t('import_title')));
  d.addEventListener('sav-select', (e) => { const v = String(e.detail.value); setTimeout(() => (v === 'save' ? saveDialog() : v === 'feed' ? addFeed() : importDialog()), 20); });
  return d;
}

/** The feeds followed, in their folders, each with what is unread. */
function feedsList(active) {
  if (!S.subs.length) return null;
  const groups = new Map();
  for (const f of S.subs) { if (!groups.has(f.folder)) groups.set(f.folder, []); groups.get(f.folder).push(f); }
  const feed = (f) => h('a.side-feed' + (active === 'f' + f.id ? '.on' : '') + (f.unread ? '.has' : ''), { href: '#/feeds/f/' + f.id, title: f.title },
    f.icon ? h('img.fic', { src: f.icon, alt: '', width: 16, height: 16, loading: 'lazy', onerror: (e) => e.target.replaceWith(icon('rss', { class: 'fic' })) }) : icon('rss', { class: 'fic' }), h('span', f.title), f.unread ? h('b.side-n', n99(f.unread)) : null);
  const out = [];
  for (const [folder, list] of [...groups].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0])))) {
    if (folder === '') { out.push(...list.map(feed)); continue; }
    const n = list.reduce((a, f) => a + f.unread, 0);
    const open = (() => { try { return localStorage.getItem('savreads-fold-' + folder) !== '0'; } catch { return true; } })();
    const det = h('details.side-folder', { open: open || active === 'd' + folder || list.some((f) => active === 'f' + f.id) },
      h('summary', h('a.side-feed.fold' + (active === 'd' + folder ? '.on' : ''), { href: '#/feeds/d/' + encodeURIComponent(folder), title: folder }, icon('folder', { class: 'fic' }), h('span', folder), n ? h('b.side-n', n99(n)) : null)),
      h('div.side-in', list.map(feed)));
    det.addEventListener('toggle', () => { try { localStorage.setItem('savreads-fold-' + folder, det.open ? '1' : '0'); } catch { /* private mode */ } });
    out.push(det);
  }
  return h('div.side-sec.side-feeds', h('div.navh', t('feeds')), h('div.side-list', out));
}

function tagsList(active) {
  if (!S.counts.tags?.length) return null;
  return h('div.side-sec.side-tags', h('div.navh', t('tags')), h('div.side-tagl', S.counts.tags.map((x) => h('a.stag' + (active === 'tag:' + x.name ? '.on' : ''), { href: '#/tag/' + encodeURIComponent(x.name) }, '#' + x.name, h('small', String(x.n))))));
}

/**
 * frame(root, active, ...content): active is unread | starred | archive | highlights | feeds | f<id> | d<folder> |
 * tag:<name> | search. Returns the <main>.
 */
export function frame(root, active, ...content) {
  const place = active.startsWith('f') && active !== 'feeds' ? 'feeds' : active.startsWith('d') ? 'feeds' : active;
  const menu = h('sav-menu.dnav', { label: 'SavReads', selectable: true }, PLACES.map(([k, ic, label]) => {
    const x = item(k, ic, t(label));
    x.toggleAttribute('current', k === place);
    const n = countOf(k);
    if (n) x.append(h('sav-badge', { slot: 'suffix', pill: true, size: 'sm', variant: k === 'feeds' ? 'primary' : 'neutral', appearance: k === 'feeds' ? 'soft' : null }, n99(n)));
    return x;
  }));
  menu.addEventListener('sav-select', (e) => go(PLACES.find((p) => p[0] === e.detail.value)[3]));
  const side = h('nav.hside', { 'aria-label': 'SavReads' }, newMenu(), menu, h('div.side-more', feedsList(active), tagsList(active)));
  const main = h('main.hmain', content);
  const feeds = place === 'feeds';
  const q = location.hash.startsWith('#/search/') ? decodeURIComponent(location.hash.slice(9)) : location.hash.startsWith('#/feeds/q/') ? decodeURIComponent(location.hash.slice(10)) : '';
  put(root, h('div.home', h('header.htop', brand(), searchBox(q, feeds), h('div.spacer'), userMenu()), h('div.hbody', side, main), credit()));
  // the side follows the counts while the page stays
  const again = () => {
    if (!side.isConnected) { removeEventListener('rd-counts', again); return; }
    for (const [k] of PLACES) { const mi = menu.querySelector(`sav-menu-item[value="${k}"]`); mi?.querySelector('sav-badge')?.remove(); const n = countOf(k); if (n) mi?.append(h('sav-badge', { slot: 'suffix', pill: true, size: 'sm', variant: k === 'feeds' ? 'primary' : 'neutral', appearance: k === 'feeds' ? 'soft' : null }, n99(n))); }
    put(side.querySelector('.side-more'), feedsList(active), tagsList(active));
  };
  addEventListener('rd-counts', again);
  // on phones the places are a row that scrolls: the current one in view
  if (matchMedia('(max-width: 900px)').matches) customElements.whenDefined('sav-menu').then(() => setTimeout(() => { const cur = menu.querySelector('sav-menu-item[current]'); if (cur && place !== 'unread') menu.scrollLeft = Math.max(0, cur.getBoundingClientRect().left - menu.getBoundingClientRect().left - 16); }, 60));
  return main;
}

/** The title of a page with what goes on its right. */
export const head = (title, ...right) => h('div.dhead', h('h1', title), h('span.spacer'), right);
