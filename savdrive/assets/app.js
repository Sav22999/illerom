/** SavDrive — the app: start and addresses. No other module imports this one. */
import { btn, empty, errText, h, icon, menuAt, primary, put } from './ui.js';
import { registerIcons } from './icons.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api, pubUrl } from './store.js';
import { applyTheme, brand, commands, credit, go, land, langButton, reset, setUser, signOut, unverified, userMenu, verify, waiting } from './account.js';
import { CHANGES, VERSION } from './version.js';

const root = document.getElementById('app');
let leave = null, turn = 0;

async function boot() {
  registerIcons();
  setLang(getLang());
  applyTheme();
  try {
    S.config = await api('auth.config');
    if (S.config.installed) { const me = await api('auth.me'); if (me.user) setUser(me.user, me.csrf); }
  } catch (e) {
    S.config = { installed: false, down: true };
    if (e.code !== 'network') console.error(e);
  }
  window.Identity?.setup({ name: 'SavDrive', lang: getLang, accent: '#0A6FB0', accept: 'acceptTerms', acceptUrl: () => 'terms.html', body: () => ({ lang: getLang() }) });
  const next = sessionStorage.getItem('savdrive-next');
  if (S.user?.verified && next) {
    sessionStorage.removeItem('savdrive-next');
    // SavPhotos sends here to sign in (it uses the account of SavDrive) and gets the person back
    if (/^\.\.\/savphotos\/(#[\w/-]*)?$/.test(next)) return location.replace(next);
    if (/^(#\/?(signin|signup|welcome)?)?$/.test(location.hash)) history.replaceState(null, '', next);
  }
  addEventListener('hashchange', route);
  // the right button everywhere else in SavDrive (the drive has its own menus, by place): where to go from here
  root.addEventListener('contextmenu', (e) => {
    if (e.defaultPrevented || e.composedPath().some((n) => n.localName && (/^(input|textarea|sav-input|sav-textarea|sav-search|a)$/.test(n.localName) || n.isContentEditable))) return;
    e.preventDefault();
    const u = S.user, ok = u?.verified && u.activated;
    menuAt(e.clientX, e.clientY, ok ? [['hard-drive', t('my_drive'), () => go('#/')], ['clock', t('recent'), () => go('#/recent')], ['star', t('starred'), () => go('#/starred')], ['trash-2', t('trash'), () => go('#/trash')], '-',
      ['settings', t('settings'), () => go('#/settings')], u.master ? ['shield', t('admin'), () => go('#/admin')] : null, ['sparkles', t('changelog'), () => go('#/changelog')], '-', ['refresh', t('refresh'), () => route()], ['log-out', t('sign_out'), () => signOut()]]
      : u ? [['refresh', t('refresh'), () => location.reload()], ['log-out', t('sign_out'), () => signOut()]]
        : [['log-in', t('sign_in'), () => go('#/signin')], ['user-plus', t('sign_up'), () => go('#/signup')], ['sparkles', t('changelog'), () => go('#/changelog')]], { label: 'SavDrive' });
  });
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function route() {
  const [, a = '', b = '', c = ''] = location.hash.split('/'), n = ++turn;
  leave?.();
  leave = null;
  commands(); // every address starts from the pages of SavDrive; a screen adds its own
  document.querySelectorAll('sav-dialog').forEach((d) => d.hide?.());
  try {
    if (a === 'verify') return verify(root, b);
    if (a === 'reset') return reset(root, b);
    if (a === 's' && b) return await shared(b);
    document.title = 'SavDrive';
    if (a === 'changelog') return changelog();
    if (a === 'signin' || a === 'signup') return S.user ? go('#/') : land(root, a);
    if (!S.user) return land(root, a === '' || a === 'welcome' ? '' : 'signin');
    if (!S.user.verified) return unverified(root);
    if (!S.user.activated) return waiting(root);
    if (a === 'settings') { const { settingsScreen } = await import('./options.js'); return settingsScreen(root, b); }
    if (a === 'admin' && S.user.master) { const { admin } = await import('./admin.js'); return await admin(root, b || 'overview'); }
    const { home } = await import('./drive.js');
    const x = await home(root, a, b, c);
    if (n === turn) leave = x; else x?.();
  } catch (e) {
    if (n !== turn) return;
    if (!e.code) console.error(e);
    if (e.code === 'not_activated') { if (S.user) S.user.activated = false; return waiting(root); }
    if (e.code === 'unauthenticated') { S.user = null; return land(root, 'signin'); }
    put(root, h('div.wait', empty('cloud-off', errText(e), '', h('div.prow', primary(t('home'), { href: '#/' }), btn(t('retry'), { onclick: () => route() })))));
  }
}

/** A file shared with a link: anyone can see it and download it, with or without an account. */
async function shared(tok) {
  put(root, h('div.wait', h('sav-spinner', { style: 'font-size:2rem' })));
  let f;
  try { f = (await api('pub.info', undefined, { t: tok })).file; } catch (e) {
    put(root, h('div.home', h('header.htop', brand(S.user ? '#/' : '#/welcome'), h('div.spacer'), S.user ? userMenu() : langButton()), h('div.wait', empty('link-2-off', t('pub_gone'), t('pub_gone_t'))), credit()));
    return;
  }
  const { kindOf, bytes } = await import('./drive.js');
  const { NAMES } = await import('./office.js');
  const k = kindOf(f), src = pubUrl(tok, true);
  const view = k.k === 'image' ? h('img.pvimg', { src, alt: f.name }) : k.k === 'pdf' ? h('iframe.pvpdf', { src, title: f.name }) : k.k === 'video' ? h('sav-video.pvvid', { src, label: f.name }) : k.k === 'audio' ? h('div.pvaud', icon('music'), h('sav-audio', { src, label: f.name }))
    : h('div.pvnone', f.app ? h('img', { src: `../${f.app}/icons/favicon.svg`, width: 72, height: 72, alt: '' }) : h('span.tic.big', { style: `--fc:${k.c}` }, icon(k.ic)), h('b', f.name), f.app ? h('p.muted', t('pub_app', { app: NAMES[f.app] })) : null);
  put(root, h('div.home.pubp', h('header.htop', brand(S.user ? '#/' : '#/welcome'), h('div.spacer'), S.user ? userMenu() : [langButton(), btn(t('sign_in'), { appearance: 'outline', href: '#/signin' })]),
    h('main.pubm', h('div.pubhead', h('div', h('h1', f.name), h('p.muted', t('pub_by', { name: f.owner, size: bytes(f.size) }))), h('span.grow'), primary(t('download'), { icon: 'download', href: pubUrl(tok), download: f.name })), h('div.pubview', view)), credit()));
  document.title = f.name + ' – SavDrive';
}

function changelog() {
  const it = getLang() === 'it', day = (d) => new Date(d + 'T12:00:00').toLocaleDateString(getLang(), { day: 'numeric', month: 'long', year: 'numeric' });
  put(root, h('div.home.setp', h('header.htop', brand(S.user ? '#/' : '#/welcome'), h('div.spacer'), S.user ? userMenu() : [langButton(), btn(t('sign_in'), { appearance: 'outline', href: '#/signin' })]),
    h('main.smain.chlog', h('div.shd', btn(t('home'), { icon: 'arrow-left', appearance: 'ghost', onclick: () => go(S.user ? '#/' : '#/welcome') }), h('h1', t('changelog'))), h('p.muted', t('changelog_t', { v: VERSION })),
      h('div.vlist', CHANGES.map((c) => h('section.vcard', h('div.vhead', h('sav-badge', { variant: c.v === VERSION ? 'primary' : 'neutral', appearance: 'soft', pill: true }, 'v' + c.v), c.v === VERSION ? h('small.vnow', t('current_v')) : null, h('span.grow'), h('time', { datetime: c.date }, day(c.date))), h('ul', c.items.map((x) => h('li', x[it ? 1 : 0]))))))), credit()));
  document.title = t('changelog') + ' – SavDrive';
}

boot();
