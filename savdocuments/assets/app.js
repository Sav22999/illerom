/** SavDocuments — the app: start and addresses. No other module imports this one. */
import { btn, empty, errText, fail, h, primary, put } from './ui.js';
import { registerIcons } from './icons.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api, offline } from './store.js';
import { applyTheme, go, googleButton, land, reset, setUser, unverified, verify } from './account.js';
import { openFile } from './actions.js';

const root = document.getElementById('app');
let writer = null, leave = null, turn = 0;
const landing = async (mode, note) => { const { heroPages } = await import('./home.js'); leave = land(root, mode, note, heroPages()); };

async function boot() {
  registerIcons();
  setLang(getLang());
  applyTheme();
  try {
    S.config = await api('auth.config');
    if (S.config.installed) { const me = await api('auth.me'); if (me.user) setUser(me.user, me.csrf); else offline.rememberUser(null); }
  } catch (e) {
    // no connection: whoever was signed in here goes on with the copies kept in this browser
    const u = e.code === 'network' ? offline.lastUser() : null;
    if (u) { S.config = { installed: true, offline: true }; S.offline = true; setUser(u); } else S.config = { installed: false, down: true };
    if (e.code !== 'network') console.error(e);
  }
  addEventListener('online', back);
  addEventListener('offline', () => { S.offline = true; document.documentElement.classList.add('is-offline'); });
  document.documentElement.classList.toggle('is-offline', !!S.offline);
  window.Identity?.setup({ name: 'SavDocuments', lang: getLang, accent: '#0F6E56', accept: 'acceptTerms', acceptUrl: () => 'terms.html', google: (slot, cb) => googleButton(slot, cb), body: () => ({ lang: getLang() }) });
  // signed in with Google or SavAccount (the page was left and came back): on to the document that was asked for
  const next = sessionStorage.getItem('savdocuments-next');
  if (S.user?.verified && next) { sessionStorage.removeItem('savdocuments-next'); if (/^(#\/?(signin|signup|welcome)?)?$/.test(location.hash)) history.replaceState(null, '', next); }
  addEventListener('hashchange', route);
  // a .savdoc or .docx opened from the files of the device
  window.launchQueue?.setConsumer(async (p) => { for (const f of p.files || []) await openFile(await f.getFile()); });
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function route() {
  const [, a = '', b = ''] = location.hash.split('/'), n = ++turn;
  if (writer) { const w = writer; writer = null; w.close(); }
  leave?.();
  leave = null;
  document.querySelectorAll('sav-dialog').forEach((d) => d.hide?.());
  try {
    if (a === 'verify') return verify(root, b);
    if (a === 'reset') return reset(root, b);
    if (a === 'invite') return await invite(b);
    if (a === 'd' && b) {
      put(root, h('div.wait', h('sav-spinner', { style: 'font-size:2.2rem' })));
      const { openWriter } = await import('./write.js');
      const w = await openWriter(root, b, { review: location.hash.endsWith('/review'), onReload: (x) => { writer = x; } });
      if (n !== turn) w.close(); else writer = w;
      return;
    }
    document.title = 'SavDocuments';
    if (a === 'signin' || a === 'signup') return S.user ? go('#/') : await landing(a);
    if (!S.user) return await landing(a === '' || a === 'welcome' ? '' : 'signin', a === '' || a === 'welcome' ? null : undefined); // SavDocuments works only with an account
    if (a === 'settings') { const { settingsScreen } = await import('./options.js'); return settingsScreen(root); }
    if (a === 'admin' && S.user?.master) { const { admin } = await import('./admin.js'); return await admin(root, b || 'overview'); }
    if (S.user && !S.user.verified) return unverified(root);
    const { home } = await import('./home.js');
    const x = await home(root, a, b);
    if (n === turn) leave = x;
  } catch (e) {
    if (n !== turn) return;
    if (!e.code) console.error(e);
    if (e.code === 'doc_signin') return void landing('signin', h('sav-alert', { variant: 'neutral', heading: t('doc_signin') }, t('doc_signin_text')));
    put(root, h('div.wait', empty('file-text', errText(e), '', h('div.prow', primary(t('home'), { href: '#/' }), btn(t('retry'), { onclick: () => route() })))));
  }
}
/** The connection is back: a fresh session key, then the open document and the home catch up by themselves. */
async function back() {
  document.documentElement.classList.remove('is-offline');
  if (!S.offline) return;
  try {
    const me = await api('auth.me');
    S.offline = false;
    if (me.user) setUser(me.user, me.csrf); else { offline.rememberUser(null); S.user = null; }
    if (!writer || !S.user) route();
  } catch { /* still away */ }
}
async function invite(token) {
  if (!S.user?.verified) { await landing('signin', h('sav-alert', { variant: 'primary', heading: t('invite_open') }, t('invite_text'))); sessionStorage.setItem('savdocuments-next', location.hash); return; }
  try { go('#/d/' + (await api('invite.accept', { token })).doc); } catch (e) { fail(e); go('#/'); }
}

boot();
