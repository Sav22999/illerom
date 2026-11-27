/** SavPhotos — the app: start and addresses. No other module imports this one. */
import { btn, empty, errText, h, primary, put } from './ui.js';
import { registerIcons } from './icons.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api } from './store.js';
import { applyTheme, brand, commands, credit, driveWaiting, go, land, langButton, setUser, unverified, userMenu, waiting } from './account.js';
import { CHANGES, VERSION } from './version.js';

const root = document.getElementById('app');
let leave = null, turn = 0;

async function boot() {
  registerIcons();
  setLang(getLang());
  applyTheme();
  try {
    S.config = await api('auth.config');
    if (S.config.installed) {
      const me = await api('auth.me');
      if (me.user) {
        setUser(me.user, me.csrf);
        if (me.user.verified && me.user.activated) S.photos = await api('photos.me');
        applyTheme();
      }
    }
  } catch (e) {
    S.config = S.config?.installed ? S.config : { installed: false, down: true };
    if (e.code !== 'network') console.error(e);
  }
  addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function route() {
  const [, a = '', b = ''] = location.hash.split('/'), n = ++turn;
  leave?.();
  leave = null;
  commands();
  document.querySelectorAll('sav-dialog').forEach((d) => d.hide?.());
  document.querySelector('.viewer')?.close?.();
  try {
    document.title = 'SavPhotos';
    if (a === 'a' && b) { const { publicAlbum } = await import('./albums.js'); return await publicAlbum(root, b); }
    if (a === 'changelog') return changelog();
    if (!S.config.installed) return put(root, h('div.wait', empty('cloud-off', t(S.config.down ? 'err_network' : 'not_ready'), '', btn(t('retry'), { onclick: () => location.reload() }))));
    if (!S.user) return land(root);
    if (!S.user.verified) return unverified(root);
    if (!S.user.activated) return driveWaiting(root);
    if (!S.photos) S.photos = await api('photos.me');
    if (!S.photos.allowed) return waiting(root);
    let x;
    if (a === 'settings') { const { settingsScreen } = await import('./options.js'); return settingsScreen(root, b); }
    if (a === 'admin' && S.user.master) { const { admin } = await import('./admin.js'); return await admin(root, b || 'overview'); }
    const { library } = await import('./library.js');
    if (a === 'albums') { const { albumList } = await import('./albums.js'); x = await albumList(root); }
    else if (a === 'album' && b) x = await library(root, 'album', b);
    else if (a === 'pick' && b) x = await library(root, 'pick', b);
    else if (a === 'favorites') x = await library(root, 'fav');
    else if (a === 'videos') x = await library(root, 'video');
    else if (a === 'search' && b) x = await library(root, 'search', location.hash.slice('#/search/'.length));
    else x = await library(root, 'all');
    if (n === turn) leave = x; else x?.();
  } catch (e) {
    if (n !== turn) return;
    if (!e.code) console.error(e);
    if (e.code === 'photos_off') { S.photos = { allowed: false }; return waiting(root); }
    if (e.code === 'not_activated') { if (S.user) S.user.activated = false; return driveWaiting(root); }
    if (e.code === 'unauthenticated') { S.user = null; S.photos = null; return land(root); }
    put(root, h('div.wait', empty('cloud-off', errText(e), '', h('div.prow', primary(t('home'), { href: '#/' }), btn(t('retry'), { onclick: () => route() })))));
  }
}

function changelog() {
  const it = getLang() === 'it', day = (d) => new Date(d + 'T12:00:00').toLocaleDateString(getLang(), { day: 'numeric', month: 'long', year: 'numeric' });
  put(root, h('div.home.setp', h('header.htop', brand(S.user ? '#/' : '#/welcome'), h('div.spacer'), S.user ? userMenu() : langButton()),
    h('main.smain.chlog', h('div.shd', btn(t('home'), { icon: 'arrow-left', appearance: 'ghost', onclick: () => go(S.user ? '#/' : '#/welcome') }), h('h1', t('changelog'))), h('p.muted', t('changelog_t', { v: VERSION })),
      h('div.vlist', CHANGES.map((c) => h('section.vcard', h('div.vhead', h('sav-badge', { variant: c.v === VERSION ? 'primary' : 'neutral', appearance: 'soft', pill: true }, 'v' + c.v), c.v === VERSION ? h('small.vnow', t('current_v')) : null, h('span.grow'), h('time', { datetime: c.date }, day(c.date))), h('ul', c.items.map((x) => h('li', x[it ? 1 : 0]))))))), credit()));
  document.title = t('changelog') + ' – SavPhotos';
}

boot();
