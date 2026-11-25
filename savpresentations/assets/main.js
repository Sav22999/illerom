/** Entry point: who is signed in, which screen to show. */
import { state, get, h, $, go } from './core.js';
import { t, setLang, lang } from './i18n.js';
import { fontFaces } from './themes.js';

document.head.append(h('style', fontFaces()));
const app = $('#app');
let current = null;

export function applyMode(mode) {
  const m = mode || state.user?.settings?.mode || localStorage.getItem('sp-mode') || 'auto';
  localStorage.setItem('sp-mode', m);
  document.documentElement.classList.remove('sav-theme-light', 'sav-theme-dark', 'sav-theme-auto');
  document.documentElement.classList.add('sav-theme-' + m);
}

export async function signedIn(data) {
  state.user = data.user; state.csrf = data.csrf;
  setLang(data.user.lang);
  applyMode();
  // back to what one was opening before signing in (a shared presentation, a single-use link)
  const back = sessionStorage.getItem('sp-back');
  sessionStorage.removeItem('sp-back');
  go(back || './');
}

async function route() {
  const q = new URLSearchParams(location.search);
  if (current?.leave) await current.leave();
  current = null;
  document.body.className = 'sav-base';
  app.textContent = '';
  document.title = 'SavPresentations';
  const u = state.user;
  const need = () => { sessionStorage.setItem('sp-back', location.pathname + location.search); };
  const show = async (mod, fn, ...a) => { const m = await mod; current = (await m[fn](app, ...a)) || null; };
  if (q.get('verify')) return show(import('./auth.js'), 'verifyScreen', q.get('verify'));
  if (q.get('reset')) return show(import('./auth.js'), 'resetScreen', q.get('reset'));
  if (u && !u.verified) return show(import('./auth.js'), 'confirmScreen');
  if (q.get('join')) { if (!u) { need(); return show(import('./auth.js'), 'authScreen', { note: t('join_sign_in') }); } return show(import('./share.js'), 'joinScreen', q.get('join')); }
  if (q.get('d')) return show(import('./editor.js'), 'deckScreen', q.get('d'), q);
  if (q.get('signin') || (!u && q.get('p'))) { if (u) return go('./'); return show(import('./auth.js'), 'authScreen', { mode: q.get('signin') }); }
  if (!u) return show(import('./auth.js'), 'landing');
  if (q.get('p') === 'settings') return show(import('./settings.js'), 'settingsScreen');
  if (q.get('p') === 'admin' && u.master) return show(import('./admin.js'), 'adminScreen', q);
  return show(import('./home.js'), 'homeScreen', q);
}

addEventListener('popstate', () => route().catch(failed));
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[data-go]');
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
  e.preventDefault(); go(a.getAttribute('href'));
});

function failed(e) {
  console.error(e);
  app.textContent = '';
  app.append(h('div.center', h('sav-empty-state', { heading: t('err_server'), text: t('try_again_text'), icon: 'cloud-off' }, h('sav-button', { onclick: () => location.reload() }, t('try_again')))));
}

(async () => {
  setLang(localStorage.getItem('sp-lang') || navigator.language);
  applyMode();
  try {
    const [cfg, me] = await Promise.all([get('auth.config'), get('auth.me')]);
    state.config = cfg;
    if (me.user) { state.user = me.user; state.csrf = me.csrf; setLang(me.user.lang); applyMode(); }
  } catch (e) { if (!e.network) return failed(e); }
  await route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  // a .savpre file opened from the computer (installed app)
  window.launchQueue?.setConsumer?.(async (p) => { if (!p.files?.length || !state.user) return; const f = await p.files[0].getFile(); (await import('./files.js')).openFile(f); });
})().catch(failed);
export { lang };
