/**
 * SavMail — the app: start and addresses.
 *   #/ the mail (the first mailbox, its inbox) · #/m/<mailbox>/<folder>[/<uid>] a folder, a message · #/compose?to=…
 *   #/addresses[/new] the email addresses: add, change, remove · #/settings[/<section>] · #/changelog · #/signin · #/signup · #/verify/<token> · #/reset/<token>
 * Before the mail: the vault (lib/vault.php) is empty (connect the first mailbox), locked (open it on this device) or open.
 */
import { btn, empty, errText, h, primary, put, toast } from './ui.js';
import { registerIcons } from './icons.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api, takeState } from './store.js';
import { commands, applyTheme, go, land, reset, setUser, unverified, verify } from './account.js';

const root = document.getElementById('app');
let leave = null, turn = 0;

export async function loadState() { takeState(await api('ml.state')); applyTheme(); }

async function boot() {
  registerIcons();
  setLang(getLang());
  applyTheme();
  try {
    S.config = await api('auth.config');
    if (S.config.installed) {
      let me = await api('auth.me');
      // signed in to SavSchedules before the apps shared the session with SavMail: SavSchedules hands its session over
      if (!me.user) { const r = await fetch('../savschedules/api/?r=auth.me', { cache: 'no-store' }).then((x) => x.json()).catch(() => null); if (r?.user) me = await api('auth.me'); }
      if (me.user) setUser(me.user, me.csrf);
    }
  } catch (e) {
    S.config = { installed: false, down: true };
    if (e.code !== 'network') console.error(e);
  }
  window.Identity?.setup({ name: 'SavMail', lang: getLang, accent: '#8F6500', accept: 'acceptTerms', acceptUrl: () => 'terms.html', body: () => ({ lang: getLang() }) });
  const next = sessionStorage.getItem('savmail-next');
  if (S.user?.verified && next) { sessionStorage.removeItem('savmail-next'); if (/^(#\/?(signin|signup|welcome)?)?$/.test(location.hash)) history.replaceState(null, '', next); }
  // back from "Sign in with Microsoft" (api ml.oauth.callback): #/?oauth=ok | cancelled | failed | expired | locked
  const oa = location.hash.match(/[?&]oauth=([a-z_]+)/);
  if (oa) { history.replaceState(null, '', '#/'); setTimeout(() => toast(t('oauth_' + oa[1]), oa[1] === 'ok' ? 'success' : 'danger', { duration: 6000 }), 400); }
  addEventListener('hashchange', route);
  // the vault was locked from another tab or device: show the unlock page instead of an error
  addEventListener('savmail-locked', () => { S.vault = 'locked'; S.accounts = []; route(); });
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function route() {
  const [path, query = ''] = location.hash.split('?');
  const [, a = '', ...rest] = path.split('/'), n = ++turn;
  leave?.();
  leave = null;
  commands(); // the search of actions (⌘J / Ctrl+J): the screen adds its own
  document.querySelectorAll('sav-dialog:not(.keep)').forEach((d) => d.hide?.());
  document.body.classList.remove('inapp');
  document.title = 'SavMail';
  try {
    if (a === 'verify') return verify(root, rest[0]);
    if (a === 'reset') return reset(root, rest[0]);
    if (a === 'changelog') { const { changelogScreen } = await import('./changelog.js'); return changelogScreen(root, 'SavMail'); }
    if (a === 'signin' || a === 'signup') { if (S.user) return go('#/'); leave = land(root, a); return; }
    if (!S.user) { leave = land(root, a === 'welcome' || a === '' ? '' : 'signin'); return; }
    if (!S.user.verified) return unverified(root);
    if (!S.vault) await loadState();
    if (n !== turn) return;
    if (a === 'settings') { scrollTo(0, 0); const { settingsScreen } = await import('./options.js'); return settingsScreen(root, rest[0] || ''); }
    if (a === 'addresses') { const { addressesScreen } = await import('./addresses.js'); return addressesScreen(root, rest[0] === 'new'); }
    if (S.vault === 'empty') { const { emptyScreen } = await import('./vault.js'); return emptyScreen(root); }
    if (S.vault === 'locked') { const { unlockScreen } = await import('./vault.js'); return unlockScreen(root); }
    const { mailScreen } = await import('./mail.js');
    const x = await mailScreen(root, a === 'm' ? rest.map(decodeURIComponent) : [], a === 'compose' ? new URLSearchParams(query) : null);
    if (n === turn) leave = x; else x?.();
  } catch (e) {
    if (n !== turn) return;
    if (e.code === 'vault_locked' || e.code === 'vault_empty') { S.vault = e.code === 'vault_locked' ? 'locked' : 'empty'; return route(); }
    if (!e.code) console.error(e);
    put(root, h('div.wait', empty('mail', errText(e), '', h('div.prow', primary(t('mail'), { href: '#/' }), btn(t('retry'), { onclick: () => route() })))));
  }
}

export const reroute = () => route();

boot();
