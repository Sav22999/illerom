/** Accounts: preferences, the first page, signing in, the pages of an account that cannot use the drive yet. */
import { btn, bytes, dialog, drop, empty, errText, face, h, icon, primary, put, segmented, toast } from './ui.js';
import { getLang, setLang, t } from './i18n.js';
import { VERSION } from './version.js';
import { S, api, forgetThumbs } from './store.js';

export const go = (x) => { if (location.hash === x) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = x; };

// ------------------------------------------------------------------ preferences (kept in the account, or in this browser)

export const prefs = () => { if (S.user) return S.user.prefs || {}; try { return JSON.parse(localStorage.getItem('savdrive-prefs') || '{}'); } catch { return {}; } };
export async function setPrefs(p) {
  const all = { ...prefs(), ...p };
  if (S.user) S.user.prefs = all;
  try { localStorage.setItem('savdrive-prefs', JSON.stringify(all)); } catch { /* private mode */ }
  applyTheme();
  if (S.user) await api('auth.prefs', { prefs: all });
}
export const applyTheme = () => window.Sav?.setMode(prefs().theme || 'auto');
export function setUser(u, csrf) {
  S.user = u;
  if (csrf) S.csrf = csrf;
  if (u) { if (Array.isArray(u.prefs) || !u.prefs) u.prefs = {}; setLang(u.lang); }
  applyTheme();
}

// ------------------------------------------------------------------ pieces of every page

export const brand = (to = '#/') => h('a.brand', { href: to }, h('img', { src: 'icons/favicon.svg', width: 38, height: 38, alt: '' }), h('span', 'Sav', h('b', 'Drive')));
/** Italian or English, kept in this browser and in the account. */
export function useLang(l) { setLang(l); if (S.user) { S.user.lang = l; api('auth.profile', { lang: l }).catch(() => {}); } dispatchEvent(new HashChangeEvent('hashchange')); }
export const langSwitch = () => { const c = h('sav-language-choice', { 'sheet-on-mobile': true, include: 'it-IT en-GB', value: getLang() === 'it' ? 'it-IT' : 'en-GB', 'native-names': '', 'no-code': '', size: 'sm', 'aria-label': t('language'), class: 'langs' }); c.addEventListener('change', () => { const l = String(c.value || '').slice(0, 2); if (l && l !== getLang()) useLang(l); }); return c; };
export const langButton = () => btn(h('span.lbl', getLang() === 'it' ? 'English' : 'Italiano'), { icon: 'languages', label: getLang() === 'it' ? 'English' : 'Italiano', class: 'langb', appearance: 'ghost', size: 'sm', onclick: () => useLang(getLang() === 'it' ? 'en' : 'it') });
export const credit = () => h('footer.credit', h('a', { href: 'privacy.html' }, 'Privacy'), h('a', { href: 'terms.html' }, t('terms_c')), h('a', { href: 'https://www.illerom.eu/', rel: 'noopener' }, 'Illerom'), h('span', getLang() === 'it' ? 'di ' : 'by ', h('a.sig', { href: 'https://www.saveriomorelli.com', rel: 'noopener' }, 'Saverio Morelli')), h('a.vlink', { href: '#/changelog', title: t('changelog') }, 'v' + VERSION), h('span.grow'), langSwitch());
export function userMenu() {
  const u = S.user, av = face(u.name, null, 36);
  // the picture of SavAccount, once it has really loaded (a service disconnected there keeps the initials)
  if (u.picture) { const im = new Image(); im.onload = () => av.setAttribute('image', u.picture); im.src = u.picture; }
  av.setAttribute('button', '');
  // the apps of SavOffice next to the avatar
  return h('span.umenu', h('savoffice-apps', { current: 'savdrive' }), drop(av, [{ head: u.email }, u.activated ? ['settings', t('settings'), () => go('#/settings')] : null, u.master ? ['shield', t('admin'), () => go('#/admin')] : null, '-', ['log-out', t('sign_out'), signOut]], { placement: 'bottom-end', label: u.name }));
}
export async function signOut() {
  S.vaultLock?.(); // the key of the Vault (vault.js) is forgotten at once
  await api('auth.logout', {}).catch(() => {});
  S.user = null; S.csrf = '';
  forgetThumbs();
  go('#/welcome');
}

/**
 * The search of actions (⌘J / Ctrl+J, from ../assets/savoffice/savoffice.js): groups of [icon, label, address or function,
 * shortcut, description] of the screen that is open, then the pages of SavDrive (the apps of SavOffice are added by it).
 */
export function commands(...groups) {
  const item = ([icon, label, to, shortcut, description]) => ({ icon, label, shortcut, description, run: typeof to === 'function' ? to : () => { location.hash = to; } });
  const pages = S.user ? [['hard-drive', t('my_drive'), '#/'], S.user.activated ? ['settings', t('settings'), '#/settings'] : null, S.user.master ? ['shield', t('admin'), '#/admin'] : null, ['sparkles', t('changelog'), '#/changelog'], ['log-out', t('sign_out'), () => signOut()]]
    : [['log-in', t('sign_in'), '#/signin'], ['user-plus', t('sign_up'), '#/signup'], ['sparkles', t('changelog'), '#/changelog']];
  window.SavOffice?.commands([...groups.filter(Boolean).map(([label, list]) => ({ label, items: list.filter(Boolean).map(item) })), { label: 'SavDrive', items: pages.filter(Boolean).map(item) }]);
}

// ------------------------------------------------------------------ signing in

export function signedIn(r) {
  setUser(r.user, r.csrf);
  const next = sessionStorage.getItem('savdrive-next');
  sessionStorage.removeItem('savdrive-next');
  // back to SavPhotos, which sent the person here to sign in
  if (next && /^\.\.\/savphotos\/(#[\w/-]*)?$/.test(next)) { location.href = next; return; }
  go(next || '#/');
}
function authCard(mode) {
  const box = h('sav-card.auth'), inner = h('div.stack');
  box.append(inner);
  const draw = () => {
    const err = h('sav-alert', { variant: 'danger', hidden: true }), show = (e) => { err.textContent = errText(e); err.hidden = false; };
    const name = h('sav-input', { label: t('your_name'), maxlength: 80, autocomplete: 'name' }), email = h('sav-input', { label: t('email'), type: 'email', autocomplete: 'email', help: mode === 'signup' ? t('email_fixed') : null });
    const pw = h('sav-input', { label: t('password'), type: 'password', 'password-toggle': true, autocomplete: mode === 'signup' ? 'new-password' : 'current-password', help: mode === 'signup' ? t('pw_hint') : null });
    const terms = h('sav-checkbox', {}, t('accept') + ' ', h('a', { href: 'terms.html', target: '_blank' }, t('terms')), ` ${t('and_privacy')} `, h('a', { href: 'privacy.html', target: '_blank' }, t('privacy')));
    const submit = primary(t(mode === 'signup' ? 'sign_up' : 'sign_in'), { block: true });
    const run = async () => {
      if (submit.loading) return;
      submit.loading = true;
      err.hidden = true;
      try {
        if (mode === 'signup') { await api('auth.register', { name: name.value, email: email.value, password: pw.value, acceptTerms: terms.checked, lang: getLang() }); put(inner, empty('mail', t('check_email'), t('check_email_text'))); } else signedIn(await api('auth.login', { email: email.value, password: pw.value }));
      } catch (e) { show(e); } finally { submit.loading = false; }
    };
    submit.addEventListener('click', run);
    const form = h('div.form', mode === 'signup' ? name : null, email, pw, mode === 'signup' ? terms : null, err, submit);
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.localName === 'sav-input') run(); });
    const sav = window.Identity?.button(S.config.savAccount) || null;
    put(inner, segmented(t('sign_in'), mode, [['signin', '=' + t('sign_in'), t('sign_in')], ['signup', '=' + t('sign_up'), t('sign_up')]], (v) => { mode = v; draw(); }, { class: 'wide' }), form,
      mode === 'signin' ? btn(t('forgot'), { size: 'sm', appearance: 'ghost', onclick: () => { forgot(); } }) : !S.config.mailReady && S.config.installed ? h('p.muted.small', t('mail_off')) : null,
      sav ? [h('sav-divider', t('or')), sav] : null);
  };
  draw();
  if (!S.config.installed) put(inner, empty('cloud-off', t(S.config.down ? 'err_network' : 'not_ready'), S.config.down ? '' : t('err_not_installed')));
  return box;
}
function forgot() {
  const email = h('sav-input', { label: t('email'), type: 'email', autofocus: true });
  dialog({ title: t('forgot'), body: h('div.form', h('p.muted', t('forgot_text')), email), actions: [{ label: t('cancel') }, { label: t('send_link'), primary: true, run: async () => { await api('auth.forgot', { email: email.value, lang: getLang() }); toast(t('link_sent'), 'success'); } }] });
}

/** The space a new account gets, as the admins chose it (auth.config); 500 MB if the server did not say. */
const newSpace = () => +S.config?.space || 500 * 1048576;

/** A small picture of the drive for the first page: folders and the files of the apps of SavOffice, with the space used. */
function heroArt() {
  const apps = [['savdocuments', t('ex_doc')], ['savspreadsheets', t('ex_spr')], ['savpresentations', t('ex_pre')], ['savwhiteboard', t('ex_whi')]];
  const folder = (name, c, n) => h('div.hf', { style: `--fc:${c}` }, h('span.hfi', icon('folder')), h('span.hfn', h('b', name), h('small', t('n_items', { n }))));
  const file = (app, name) => h('div.hfile', h('div.hthumb', h('img', { src: `../${app}/icons/favicon.svg`, alt: '', width: 40, height: 40 })), h('span', name));
  return h('div.hart', { 'aria-hidden': 'true' },
    h('div.hwin', h('div.hwbar', h('i'), h('i'), h('i'), h('span', t('my_drive'))),
      h('div.hfolders', folder(t('ex_f1'), '#0a6fb0', 12), folder(t('ex_f2'), '#d85a30', 7), folder(t('ex_f3'), '#13a079', 24)),
      h('div.hfiles', apps.map(([a, n]) => file(a, n))),
      h('div.hquota', h('div.hqbar', h('i', { style: 'width:34%' })), h('small', t('ex_quota', { used: bytes(newSpace() * .34), q: bytes(newSpace()) })))));
}

/** The first page: a bar with the language and "Sign in", the title with the two buttons, a picture of the drive, six features. */
export function land(root, mode, note) {
  if (/^#\/(f|folder|preview)\//.test(location.hash)) sessionStorage.setItem('savdrive-next', location.hash);
  const top = (...right) => h('header.ltop', brand('#/welcome'), h('div.spacer'), langButton(), h('savoffice-apps', { current: 'savdrive' }), ...right);
  document.title = 'SavDrive';
  if (mode === 'signin' || mode === 'signup') {
    put(root, h('div.authp', top(), h('main.amain', h('div.stack.aw', note || null, authCard(mode))), credit()));
    return;
  }
  const Q = { q: bytes(newSpace()) }; // the words that say how much space: the one the admins chose
  const feat = (ic, k) => h('div.feat', icon(ic), h('h3', t(k, Q)), h('p', t(k + '_t', Q)));
  put(root, h('div.landing', top(btn(t('sign_in'), { appearance: 'outline', href: '#/signin' })),
    h('main.lmain', h('section.hero', h('div.hero-t', h('h1', t('land_title')), h('p', t('land_text')), h('div.prow.wrap', primary(t('l_cta', Q), { size: 'lg', href: '#/signup' }), btn(t('sign_in'), { size: 'lg', appearance: 'ghost', href: '#/signin' })), h('small', t('l_small'))), heroArt()),
      h('section.feats', feat('hard-drive', 'ft_space'), feat('file-plus', 'ft_office'), feat('upload', 'ft_upload'), feat('eye', 'ft_preview'), feat('link', 'ft_share'), feat('shield', 'ft_eu'))), credit()));
}
const centered = (root, ...kids) => put(root, h('div.wait', h('sav-card.auth', h('div.stack', kids))));
export const verify = (root, token) => centered(root, empty('mail', t('verify_title'), t('verify_text'), primary(t('verify_btn'), { onclick: async () => { signedIn(await api('auth.verify', { token })); } })));
export function reset(root, token) { const pw = h('sav-input', { label: t('new_password'), type: 'password', 'password-toggle': true, autocomplete: 'new-password', help: t('pw_hint') }); centered(root, h('h2', t('reset_title')), pw, primary(t('save'), { block: true, onclick: async () => { signedIn(await api('auth.reset', { token, password: pw.value })); } })); }
export const unverified = (root) => centered(root, empty('mail', t('unverified'), S.user.email, primary(t('resend'), { onclick: async () => { await api('auth.resend', { lang: getLang() }); toast(t('resent'), 'success'); } }), btn(t('sign_out'), { onclick: signOut })));

/** An account an admin has not activated (yet, or any more): it can only wait, check again, leave or delete itself. */
export function waiting(root) {
  const del = () => {
    const f = S.user.hasPassword ? h('sav-input', { label: t('password'), type: 'password', 'password-toggle': true, autocomplete: 'current-password' }) : null;
    dialog({ title: t('delete_account'), width: '28rem', body: h('div.form', h('p', t('delete_account_text')), f), actions: [{ label: t('cancel') }, { label: t('delete_forever'), danger: true, run: async () => { await api('auth.delete', { password: f?.value || '' }); S.user = null; go('#/welcome'); } }] });
  };
  put(root, h('div.home', h('header.htop', brand(), h('div.spacer'), userMenu()),
    h('div.wait', h('sav-card.auth', h('div.stack', empty('clock', t('wait_title'), t('wait_text', { email: S.user.email })),
      h('div.prow.wrap.cen', primary(t('wait_check'), { icon: 'refresh', onclick: async () => { const me = await api('auth.me'); if (me.user) setUser(me.user, me.csrf); if (me.user?.activated) go('#/'); else toast(t('wait_still'), 'neutral'); } }), btn(t('sign_out'), { icon: 'log-out', onclick: signOut })),
      btn(t('delete_account'), { size: 'sm', appearance: 'ghost', variant: 'danger', onclick: del })))), credit()));
  document.title = 'SavDrive';
}
