/** SavDocuments — the app: start and addresses. No other module imports this one. */
import { btn, empty, errText, fail, h, primary, put } from './ui.js';
import { registerIcons } from './icons.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api, local } from './store.js';
import { applyTheme, go, googleButton, land, reset, setUser, unverified, verify } from './account.js';
import { openFile } from './actions.js';

const root = document.getElementById('app');
let writer = null, leave = null, turn = 0;
const landing = async (mode, note) => { const { create } = await import('./home.js'); land(root, mode, note, (k) => create(k).catch(fail)); };

async function boot() {
  registerIcons();
  setLang(getLang());
  applyTheme();
  try {
    S.config = await api('auth.config');
    if (S.config.installed) { const me = await api('auth.me'); if (me.user) setUser(me.user, me.csrf); }
  } catch (e) { S.config = { installed: false, down: true }; if (e.code !== 'network') console.error(e); }
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
    if (a === 'admin' && S.user?.master) { const { admin } = await import('./admin.js'); return await admin(root, b || 'overview'); }
    if (S.user && !S.user.verified) return unverified(root);
    const left = !S.user && (await local.list().catch(() => [])).length;
    if (S.user || a === 'local' || a === 'templates' || (left && a !== 'welcome')) { const { home } = await import('./home.js'); const x = await home(root, a, b); if (n === turn) leave = x; return; }
    await landing();
  } catch (e) {
    if (n !== turn) return;
    if (!e.code) console.error(e);
    if (e.code === 'doc_signin') return void landing('signin', h('sav-alert', { variant: 'neutral', heading: t('doc_signin') }, t('doc_signin_text')));
    put(root, h('div.wait', empty('file-text', errText(e), '', h('div.prow', primary(t('home'), { href: '#/' }), btn(t('retry'), { onclick: () => route() })))));
  }
}
async function invite(token) {
  if (!S.user?.verified) { await landing('signin', h('sav-alert', { variant: 'primary', heading: t('invite_open') }, t('invite_text'))); sessionStorage.setItem('savdocuments-next', location.hash); return; }
  try { go('#/d/' + (await api('invite.accept', { token })).doc); } catch (e) { fail(e); go('#/'); }
}

boot();
