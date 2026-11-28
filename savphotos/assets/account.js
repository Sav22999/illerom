/**
 * The account (the one of SavDrive), the settings of SavPhotos, the frame of every page (header, side menu, bottom bar of
 * phones) and the pages of whoever cannot use SavPhotos yet: not signed in, not confirmed, waiting.
 */
import { btn, bytes, drop, empty, face, h, icon, item, primary, put, toast, dialog, K } from './ui.js';
import { getLang, setLang, t } from './i18n.js';
import { VERSION } from './version.js';
import { S, api, driveUrl } from './store.js';

export const go = (x) => { if (location.hash === x) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = x; };

// ------------------------------------------------------------------ settings (kept in the account, or in this browser)

export const prefs = () => { if (S.photos?.prefs) return S.photos.prefs; try { return JSON.parse(localStorage.getItem('savphotos-prefs') || '{}'); } catch { return {}; } };
export async function setPrefs(p) {
  const all = { ...prefs(), ...p };
  if (S.photos) S.photos.prefs = all;
  try { localStorage.setItem('savphotos-prefs', JSON.stringify(all)); } catch { /* private mode */ }
  applyTheme();
  if (S.photos?.allowed) await api('photos.prefs', { prefs: all });
}
/** The theme of SavPhotos, or the one chosen in SavDrive. */
export const applyTheme = () => window.Sav?.setMode(prefs().theme || S.user?.prefs?.theme || 'auto');
export function setUser(u, csrf) {
  S.user = u;
  if (csrf) S.csrf = csrf;
  if (u) setLang(u.lang);
  applyTheme();
}

/** Signing in happens in SavDrive (the account is that one): it sends the person back here afterwards. */
export function toDrive(mode = 'signin') {
  try { sessionStorage.setItem('savdrive-next', '../savphotos/' + (/^#\/[\w/-]*$/.test(location.hash) && !/^#\/(welcome)?$/.test(location.hash) ? location.hash : '')); } catch { /* private mode */ }
  location.href = driveUrl('#/' + mode);
}

// ------------------------------------------------------------------ pieces of every page

export const brand = (to = '#/') => h('a.brand', { href: to }, h('img', { src: 'icons/favicon.svg', width: 38, height: 38, alt: '' }), h('span', 'Sav', h('b', 'Photos')));
/** Italian or English: kept in this browser and in the account (the same language of SavDrive). */
export function useLang(l) { setLang(l); if (S.user) { S.user.lang = l; api('auth.profile', { lang: l }).catch(() => {}); } dispatchEvent(new HashChangeEvent('hashchange')); }
export const langSwitch = () => { const c = h('sav-language-choice', { 'sheet-on-mobile': true, include: 'it-IT en-GB', value: getLang() === 'it' ? 'it-IT' : 'en-GB', 'native-names': '', 'no-code': '', size: 'sm', 'aria-label': t('language'), class: 'langs' }); c.addEventListener('change', () => { const l = String(c.value || '').slice(0, 2); if (l && l !== getLang()) useLang(l); }); return c; };
export const langButton = () => btn(h('span.lbl', getLang() === 'it' ? 'English' : 'Italiano'), { icon: 'languages', label: getLang() === 'it' ? 'English' : 'Italiano', class: 'langb', appearance: 'ghost', size: 'sm', onclick: () => useLang(getLang() === 'it' ? 'en' : 'it') });
export const credit = () => h('footer.credit', h('a', { href: 'privacy.html' }, 'Privacy'), h('a', { href: 'terms.html' }, t('terms_c')), h('a', { href: driveUrl() }, 'SavDrive'), h('a', { href: 'https://www.illerom.eu/', rel: 'noopener' }, 'Illerom'),
  h('span', getLang() === 'it' ? 'di ' : 'by ', h('a.sig', { href: 'https://www.saveriomorelli.com', rel: 'noopener' }, 'Saverio Morelli')), h('a.vlink', { href: '#/changelog', title: t('changelog') }, 'v' + VERSION), h('span.grow'), langSwitch());

export function userMenu() {
  const u = S.user, av = face(u.name, null, 36);
  if (u.picture) { const im = new Image(); im.onload = () => av.setAttribute('image', u.picture); im.src = u.picture; }
  av.setAttribute('button', '');
  const ok = S.photos?.allowed && u.verified && u.activated;
  return h('span.umenu', h('savoffice-apps', { current: 'savphotos' }), drop(av, [{ head: u.email }, ok ? ['settings', t('settings'), () => go('#/settings')] : null, ['keyboard', t('shortcuts'), () => showShortcuts()], u.master ? ['shield', t('admin'), () => go('#/admin')] : null,
    ['hard-drive', t('open_drive'), () => { location.href = driveUrl(); }], '-', ['log-out', t('sign_out'), signOut]], { placement: 'bottom-end', label: u.name }));
}
/** The keys of the app, as in SavContacts: in the menu of the account and with ⌘? / Ctrl+?. */
export const showShortcuts = () => shortcutsDialog();
export function shortcutsDialog() {
  const row = ([keys, label]) => h('div.orow', h('div.orow-t', h('b', label)), h('div.orow-c', { style: 'gap:.3rem' }, keys.map((k) => h('sav-kbd', K(k)))));
  dialog({ title: t('shortcuts'), width: '28rem', body: [h('sav-card.ocard', { appearance: 'outlined' }, h('div.orows', [[['Mod+A'], t('select_all')], [['Delete'], t('k_del')], [['Esc'], t('k_none')], [['←', '→'], t('k_browse')], [['Alt+Shift+I'], t('k_info')], [['Alt+Shift+F'], t('k_fav')], [['Mod+?'], t('shortcuts')], [['Mod+J'], t('actions_search')]].map(row)))], actions: [{ label: t('close') }] });
}
// ⌘? / Ctrl+? opens them on every page of the app, also while writing (as ⌘J), never over a dialog
addEventListener('keydown', (e) => {
  if (e.defaultPrevented || !(e.metaKey || e.ctrlKey) || e.altKey || !(e.key === '?' || (e.shiftKey && e.code === 'Slash'))) return;
  if (document.querySelector('sav-dialog[open], sav-drawer[open]')) return;
  e.preventDefault();
  showShortcuts();
});
export async function signOut() {
  await api('auth.logout', {}).catch(() => {});
  const { forgetThumbs } = await import('./store.js');
  await forgetThumbs(); // the small pictures kept in this browser
  S.user = null; S.csrf = ''; S.photos = null;
  go('#/welcome');
}

/** The search of actions (⌘J / Ctrl+J, from ../assets/savoffice/savoffice.js): the screen's own, then the pages of SavPhotos. */
export function commands(...groups) {
  const item = ([ic, label, to, shortcut, description]) => ({ icon: ic, label, shortcut, description, run: typeof to === 'function' ? to : () => { location.hash = to; } });
  const ok = S.user && S.photos?.allowed;
  const pages = ok ? [['image', t('photos'), '#/'], ['star', t('favorites'), '#/favorites'], ['video', t('videos'), '#/videos'], ['album', t('albums'), '#/albums'], ['settings', t('settings'), '#/settings'], S.user.master ? ['shield', t('admin'), '#/admin'] : null, ['sparkles', t('changelog'), '#/changelog'], ['log-out', t('sign_out'), () => signOut()]]
    : [['log-in', t('sign_in'), () => toDrive('signin')], ['sparkles', t('changelog'), '#/changelog']];
  window.SavOffice?.commands([...groups.filter(Boolean).map(([label, list]) => ({ label, items: list.filter(Boolean).map(item) })), { label: 'SavPhotos', items: pages.filter(Boolean).map(item) }]);
}

// ------------------------------------------------------------------ the frame: header with the search, side menu (as in SavDrive)

const PLACES = [['photos', 'images', '#/'], ['favorites', 'star', '#/favorites'], ['videos', 'film', '#/videos'], ['albums', 'album', '#/albums']];

/** The space of SavOffice (the one of SavDrive), drawn as in SavDrive: photos count in it like every file. */
export function spaceBox() {
  const u = S.user;
  if (!u || u.quota === undefined) return null;
  const pc = u.unlimited ? 0 : u.quota ? Math.min(100, (u.used / u.quota) * 100) : 0;
  return h('div.quota', h('div.qhead', icon('hard-drive'), h('b', t('space'))),
    u.unlimited ? null : h('sav-progress-bar', { value: Math.max(pc, u.used ? 1 : 0), max: 100, variant: pc > 95 ? 'danger' : pc > 85 ? 'warning' : 'primary', 'aria-label': t('space') }),
    h('small', u.unlimited ? t('space_unl', { used: bytes(u.used) }) : t('space_of', { used: bytes(u.used), quota: bytes(u.quota) })));
}

/** "New", as in SavDrive: upload photos and videos, a whole folder (computers), a new album. */
function newMenu() {
  const trig = primary(t('new'), { icon: 'plus', size: 'lg', block: true, slot: 'trigger', class: 'newb' });
  const coarse = matchMedia('(pointer: coarse)').matches;
  const d = h('sav-dropdown.newd', { placement: 'bottom-start', 'sheet-on-mobile': true, label: t('new') }, trig,
    item('files', 'upload', t('upload_files')), coarse ? null : item('dir', 'folder-up', t('upload_folder')), h('sav-divider'), item('album', 'album', t('new_album')));
  d.addEventListener('sav-select', (e) => {
    const v = String(e.detail.value);
    setTimeout(async () => {
      if (v === 'album') { const { newAlbum } = await import('./albums.js'); newAlbum(); return; }
      const { chooseFiles } = await import('./upload.js');
      chooseFiles({ folder: v === 'dir' });
    }, 20);
  });
  return d;
}

/**
 * The page with its frame, the same of SavDrive: the header (the search of the photos), the side menu (New, the places,
 * the space) and the page. On phones the side menu becomes a row under the header, as in SavDrive.
 * o.q: the search written; o.onSearch(q): the page searches by itself (otherwise the search opens #/search/<q>).
 */
export function frame(root, current, main, o = {}) {
  const nav = h('sav-menu.dnav', { label: t('places'), selectable: true }, PLACES.map(([k, ic]) => { const x = item(k, ic, t(k)); x.toggleAttribute('current', k === current); return x; }));
  nav.addEventListener('sav-select', (e) => go(PLACES.find((p) => p[0] === e.detail.value)?.[2] || '#/'));
  const search = h('sav-input.hsearch', { type: 'search', placeholder: t('search_photos'), value: o.q || '', clearable: true, pill: true, 'aria-label': t('search_photos') }, icon('search', { slot: 'prefix' }));
  let to;
  search.addEventListener('input', () => {
    clearTimeout(to);
    to = setTimeout(() => {
      const v = search.value.trim();
      if (o.onSearch) { history.replaceState(null, '', v ? '#/search/' + encodeURIComponent(v) : '#/'); o.onSearch(v); } else if (v) go('#/search/' + encodeURIComponent(v));
    }, 300);
  });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value = ''; go('#/'); } });
  // phones and tablets: the places in the bar at the bottom of SavOffice (the row of places at the top is left out)
  const bnav = window.SavOffice?.bottomNav?.({ label: t('places'), current, items: PLACES.map(([k, ic, href]) => ({ value: k, icon: ic, label: t(k), href })) });
  put(root, h('div.home' + (o.cls ? '.' + o.cls : ''), h('header.htop', brand(), search, h('div.spacer'), userMenu()),
    h('div.hbody', h('nav.hside', newMenu(), nav, spaceBox()), main), credit(), bnav));
  return main;
}

// ------------------------------------------------------------------ pages of who cannot use SavPhotos (yet)

/** A picture of SavPhotos for the first page: days with their photos, drawn with colours only. */
function heroArt() {
  const tones = [['#f6c35b', '#e07a2e'], ['#7cc7f2', '#2f7fc1'], ['#b6e2a1', '#4c9a52'], ['#f4a3b8', '#c2457a'], ['#c8b6f2', '#6a4fc0'], ['#ffd9a0', '#d98b2b'], ['#a9e4e0', '#2b9a93'], ['#e6c2a0', '#9b6a3f'], ['#9fb7f5', '#3c5bc4']];
  const tile = (i, n) => h('i', { style: `background:linear-gradient(${135 + i * 17}deg, ${tones[(i + n) % tones.length][0]}, ${tones[(i + n) % tones.length][1]})` });
  const day = (label, n, from) => h('div.hday', h('b', label), h('div.htiles', Array.from({ length: n }, (_, i) => tile(i, from))));
  return h('div.hart', { 'aria-hidden': 'true' }, h('div.hwin', h('div.hwbar', h('i'), h('i'), h('i'), h('span', 'SavPhotos')), day(t('today'), 5, 0), day(t('ex_day'), 3, 4), day(t('ex_trip'), 6, 2),
    h('div.hback', icon('cloud-upload'), h('span', t('ex_backup')), h('div.hqbar', h('i', { style: 'width:72%' })))));
}

export function land(root) {
  document.title = 'SavPhotos';
  const feat = (ic, k) => h('div.feat', icon(ic), h('h3', t(k)), h('p', t(k + '_t')));
  put(root, h('div.landing', h('header.ltop', brand('#/welcome'), h('div.spacer'), langButton(), h('savoffice-apps', { current: 'savphotos' }), btn(t('sign_in'), { appearance: 'outline', onclick: () => toDrive('signin') })),
    h('main.lmain', h('section.hero', h('div.hero-t', h('h1', t('land_title')), h('p', t('land_text')),
      h('div.prow.wrap', primary(t('l_cta'), { size: 'lg', icon: 'log-in', onclick: () => toDrive('signin') }), btn(t('l_new'), { size: 'lg', appearance: 'ghost', onclick: () => toDrive('signup') })),
      h('small', t('l_small'))), heroArt()),
    h('section.feats', feat('calendar', 'ft_days'), feat('smartphone', 'ft_backup'), feat('album', 'ft_albums'), feat('link', 'ft_share'), feat('hard-drive', 'ft_drive'), feat('shield', 'ft_eu'))), credit()));
}

const centered = (root, ...kids) => put(root, h('div.home', h('header.htop', brand(), h('div.spacer'), S.user ? userMenu() : langButton()), h('div.wait', h('sav-card.auth', h('div.stack', kids))), credit()));
/** The email of the account of SavDrive is not confirmed yet. */
export const unverified = (root) => centered(root, empty('mail', t('unverified'), t('unverified_t', { email: S.user.email })),
  h('div.prow.wrap.cen', primary(t('open_drive'), { icon: 'hard-drive', href: driveUrl() }), btn(t('sign_out'), { icon: 'log-out', onclick: signOut })));
/** The account of SavDrive waits for an admin. */
export const driveWaiting = (root) => centered(root, empty('clock', t('drive_wait'), t('drive_wait_t', { email: S.user.email })),
  h('div.prow.wrap.cen', primary(t('open_drive'), { icon: 'hard-drive', href: driveUrl() }), btn(t('sign_out'), { icon: 'log-out', onclick: signOut })));
/** SavPhotos is not on for this account (an admin turns it on). */
export function waiting(root) {
  centered(root, empty('images', t('wait_title'), t('wait_text', { email: S.user.email })),
    h('div.prow.wrap.cen', primary(t('wait_check'), { icon: 'refresh', onclick: async () => { S.photos = await api('photos.me'); if (S.photos.allowed) go('#/'); else toast(t('wait_still'), 'neutral'); } }), btn(t('open_drive'), { icon: 'hard-drive', href: driveUrl() })),
    btn(t('sign_out'), { size: 'sm', appearance: 'ghost', onclick: signOut }));
  document.title = 'SavPhotos';
}
