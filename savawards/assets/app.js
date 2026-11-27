/**
 * SavAwards — the app: one page, the routes in the hash.
 *   #/                        home              #/products?…           catalogue with filters
 *   #/p/<slug>                a product         #/compare/<a,b,c,d>    side by side
 *   #/alternatives[/<name>]   "alternative to"  #/awards[/<year>]      awards editions
 *   #/methodology             criteria          #/independence         independence, test devices, legal notes
 *   #/certificate             verify a code     #/suggest              suggest a product
 *   #/signin #/signup #/verify/<t> #/reset/<t>  #/me[/<tab>]           account
 *   #/staff[/<tab>[/<id>]]    moderators, administrators, master administrator
 */
import { h, put, icon, btn, primary, go, face, fail, toast } from './ui.js';
import { t, getLang, setLang } from './i18n.js';
import { S, api, loadMeta, isMod } from './store.js';
import { registerIcons } from './icons.js';
import * as pub from './public.js';
import * as acc from './account.js';
import * as staff from './staff.js';

const root = document.getElementById('app');
const main = h('main.main', { id: 'main', tabindex: '-1' });

// ------------------------------------------------------------------ theme and language

export const theme = () => localStorage.getItem('savawards-theme') || 'auto';
export function setTheme(m) { localStorage.setItem('savawards-theme', m); window.Sav?.setMode(m); }
export function useLang(l) {
  setLang(l);
  if (S.user) api('auth.profile', { lang: l }).catch(() => {});
  loadMeta().catch(() => {}).finally(() => { shell(); route(); });
}

// ------------------------------------------------------------------ the frame of every page

/** The links of the header: direct children of sav-header, which folds them behind a menu button when it is narrow. */
function navLinks() {
  const here = location.hash.split(/[/?]/)[1] || '';
  const a = (to, key, ic) => h('a.navl', { href: '#/' + to, 'aria-current': here === to.split(/[/?]/)[0] ? 'page' : null }, icon(ic), h('span', t(key)));
  return [a('products', 'nav_catalogue', 'layout-grid'), a('alternatives', 'nav_alternatives', 'arrow-left-right'), a('awards', 'nav_awards', 'trophy'), a('methodology', 'nav_method', 'scale')];
}

function account() {
  if (!S.user) return h('div.acct', btn(t('sign_in'), { appearance: 'outline', size: 'sm', href: '#/signin', icon: 'user' }));
  const trig = face(S.user.name, 34);
  // the picture of SavAccount, once it has really loaded (otherwise the initials stay)
  if (S.user.picture) { const im = new Image(); im.onload = () => trig.setAttribute('image', S.user.picture); im.src = S.user.picture; }
  trig.setAttribute('button', '');
  trig.slot = 'trigger';
  const d = h('sav-dropdown', { placement: 'bottom-end', label: S.user.name, 'sheet-on-mobile': true }, trig,
    h('sav-menu-label', S.user.email),
    h('sav-menu-item', { value: 'me' }, icon('user', { slot: 'prefix' }), t('my_account')),
    h('sav-menu-item', { value: 'fav' }, icon('heart', { slot: 'prefix' }), t('favourites')),
    h('sav-menu-item', { value: 'suggest' }, icon('lightbulb', { slot: 'prefix' }), t('suggest_product')),
    isMod() ? h('sav-menu-item', { value: 'staff' }, icon('shield-check', { slot: 'prefix' }), t('staff_area')) : null,
    h('sav-divider'),
    h('sav-menu-item', { value: 'out' }, icon('log-out', { slot: 'prefix' }), t('sign_out')));
  d.addEventListener('sav-select', (e) => {
    const v = e.detail.value;
    if (v === 'me') go('#/me'); else if (v === 'fav') go('#/me/favourites'); else if (v === 'suggest') go('#/suggest'); else if (v === 'staff') go('#/staff'); else if (v === 'out') acc.signOut();
  });
  return h('div.acct', d);
}

function themeButton() {
  const order = ['auto', 'light', 'dark'], ic = { auto: 'theme-auto', light: 'sun', dark: 'moon' };
  const b = h('sav-button', { appearance: 'ghost', size: 'sm', square: true, icon: ic[theme()], label: t('theme_' + theme()), title: t('theme_' + theme()) });
  b.addEventListener('click', () => { const n = order[(order.indexOf(theme()) + 1) % 3]; setTheme(n); b.icon = ic[n]; b.label = b.title = t('theme_' + n); });
  return b;
}

const header = h('sav-header.top', { sticky: true, breakpoint: 980 });
const footer = h('footer.foot');
function shell() {
  document.documentElement.lang = getLang();
  // the header of SavComponents: it follows the style of the page (Glass), and folds the links behind a menu when narrow
  header.setAttribute('label', t('menu'));
  put(header,
    h('a.brand', { href: '#/', slot: 'logo' }, h('img', { src: 'icons/favicon.svg', width: 36, height: 36, alt: '' }), h('span', 'Sav', h('b', 'Awards'))),
    navLinks(),
    h('div.hact', { slot: 'actions' },
      h('sav-button', { appearance: 'ghost', size: 'sm', square: true, icon: 'search', label: t('search'), title: t('search'), href: '#/products', class: 'srch' }),
      themeButton(), account()));
  put(footer, h('div.foot-in',
    h('div.foot-brand', h('a.brand', { href: '#/' }, h('img', { src: 'icons/favicon.svg', width: 30, height: 30, alt: '' }), h('span', 'Sav', h('b', 'Awards'))), h('p', t('foot_claim')),
      h('p.indep', icon('badge-check'), ' ', t('foot_independent'), ' ', h('a', { href: '#/independence' }, t('read_more')))),
    h('div.foot-col', h('strong', t('foot_explore')), h('a', { href: '#/products' }, t('nav_catalogue')), h('a', { href: '#/alternatives' }, t('nav_alternatives')), h('a', { href: '#/awards' }, t('nav_awards')), h('a', { href: '#/certificate' }, t('verify_certificate'))),
    h('div.foot-col', h('strong', t('foot_about')), h('a', { href: '#/methodology' }, t('nav_method')), h('a', { href: '#/independence' }, t('independence')), h('a', { href: 'privacy.html' }, t('privacy')), h('a', { href: 'terms.html' }, t('terms'))),
    h('div.foot-col', h('strong', t('foot_follow')), h('a', { href: `feed.php?lang=${getLang()}` }, icon('rss'), ' RSS'), h('a', { href: `feed.php?format=json&lang=${getLang()}` }, 'JSON Feed'), h('a', { href: 'https://www.illerom.eu/', rel: 'noopener' }, 'Illerom'),
      h('span', 'by ', h('a', { href: 'https://www.saveriomorelli.com', rel: 'noopener' }, 'Saverio Morelli')))),
    h('p.foot-legal', t('foot_legal')));
  pub.compareTray();
}

// ------------------------------------------------------------------ routes

let cleanup = null;
async function route() {
  cleanup?.();
  cleanup = null;
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').map(decodeURIComponent);
  const qs = new URLSearchParams(query || '');
  header.querySelectorAll('.navl').forEach((a) => { if (a.getAttribute('href').slice(2) === parts[0]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  put(main, h('div.loading', h('sav-spinner', { label: t('loading') })));
  window.scrollTo({ top: 0 });
  try {
    switch (parts[0]) {
      case '': await pub.home(main); break;
      case 'products': await pub.catalogue(main, qs); break;
      case 'p': await pub.product(main, parts[1] || ''); break;
      case 'compare': await pub.compare(main, (parts[1] || '').split(',').filter(Boolean)); break;
      case 'alternatives': await pub.alternatives(main, parts[1] || ''); break;
      case 'awards': await pub.awards(main, parts[1] || ''); break;
      case 'methodology': pub.methodology(main); break;
      case 'independence': pub.independence(main); break;
      case 'certificate': pub.verifyForm(main); break;
      case 'signin': case 'signup': acc.auth(main, parts[0]); break;
      case 'verify': acc.verify(main, parts[1]); break;
      case 'reset': acc.reset(main, parts[1]); break;
      case 'me': if (needUser()) await acc.me(main, parts[1] || 'favourites'); break;
      case 'suggest': if (needUser()) acc.suggest(main); break;
      case 'staff': if (needUser()) { if (!isMod()) throw Object.assign(new Error(), { code: 'forbidden' }); cleanup = await staff.area(main, parts[1] || 'queue', parts[2]); } break;
      default: put(main, pub.notFound());
    }
  } catch (e) {
    if (e?.code === 'not_found') put(main, pub.notFound());
    else { put(main, pub.errorBox(e)); if (e?.code !== 'forbidden') console.error(e); }
  }
  main.focus({ preventScroll: true });
}

/** A page that needs an account: signs in first and comes back. Unconfirmed accounts see the request to confirm. */
function needUser() {
  if (!S.user) { sessionStorage.setItem('savawards-next', location.hash); go('#/signin'); return false; }
  if (!S.user.verified) { acc.unverified(main); return false; }
  return true;
}
export function signedIn(r, next) {
  S.user = r.user;
  S.csrf = r.csrf || S.csrf;
  shell();
  const back = next || sessionStorage.getItem('savawards-next') || '#/';
  sessionStorage.removeItem('savawards-next');
  go(back);
}
export const refreshShell = () => shell();

// ------------------------------------------------------------------ start

async function boot() {
  registerIcons();
  window.Sav?.setStyle('glass');
  window.Sav?.setMode(theme());
  put(root, header, main, footer);
  try {
    const [cfg, me] = await Promise.all([api('auth.config'), api('auth.me').catch(() => ({ user: null }))]);
    S.config = cfg;
    if (me.user) { S.user = me.user; S.csrf = me.csrf; }
    if (cfg.installed) await loadMeta();
  } catch (e) {
    S.config = { installed: false, down: true };
  }
  shell();
  window.Identity?.setup({ name: 'SavAwards', lang: getLang, accent: '#2347c9', accept: 'acceptTerms', acceptUrl: () => 'terms.html', body: () => ({ lang: getLang() }) });
  if (!S.config.installed) { put(main, pub.errorBox({ code: S.config.down ? 'network' : 'not_installed' })); return; }
  addEventListener('hashchange', route);
  route();
}
customElements.whenDefined('sav-button').then(boot, () => boot());
addEventListener('unhandledrejection', (e) => { if (e.reason?.code) { fail(e.reason); e.preventDefault(); } });
export { toast, primary };
