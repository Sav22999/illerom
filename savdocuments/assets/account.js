/** Accounts: preferences, signing in, settings. */
import { btn, confirm, dialog, drop, errText, fail, h, icon, primary, put, segmented, select, toast, toggle, face, empty } from './ui.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api } from './store.js';
import { DEFAULTS } from './settings.js';
import { pageForm, styleForm } from './panels.js';
import { importFile } from './actions.js';

export const go = (x) => { if (location.hash === x) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = x; };

// ------------------------------------------------------------------ preferences (kept in the account, or in this browser)

export const prefs = () => { if (S.user) return S.user.prefs || {}; try { return JSON.parse(localStorage.getItem('savdocuments-prefs') || '{}'); } catch { return {}; } };
export async function setPrefs(p) {
  const all = { ...prefs(), ...p };
  if (S.user) S.user.prefs = all;
  try { localStorage.setItem('savdocuments-prefs', JSON.stringify(all)); } catch { /* private mode */ }
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

export const brand = (to = '#/') => h('a.brand', { href: to }, h('img', { src: 'icons/favicon.svg', width: 38, height: 38, alt: '' }), h('span', 'Sav', h('b', 'Documents')));
export const langSwitch = () => segmented(t('language'), getLang(), [['it', '=Italiano', 'Italiano'], ['en', '=English', 'English']], (l) => { setLang(l); if (S.user) { S.user.lang = l; api('auth.profile', { lang: l }).catch(() => {}); } dispatchEvent(new HashChangeEvent('hashchange')); }, { class: 'langs' });
export const credit = () => h('footer.credit', h('a', { href: 'privacy.html' }, 'Privacy'), h('a', { href: 'terms.html' }, t('terms_c')), h('a', { href: 'https://www.illerom.eu/', rel: 'noopener' }, 'Illerom'), h('span', getLang() === 'it' ? 'di ' : 'by ', h('a.sig', { href: 'https://www.saveriomorelli.com', rel: 'noopener' }, 'Saverio Morelli')), h('span.grow'), langSwitch());
export function userMenu() {
  const u = S.user, av = face(u.name, null, 34);
  av.setAttribute('button', '');
  return drop(av, [{ head: u.name }, { head: u.email }, '-', ['settings', t('settings'), () => settings()], u.master ? ['shield', t('admin'), () => go('#/admin')] : null, '-', ['log-out', t('sign_out'), signOut]], { placement: 'bottom-end', label: u.name });
}
export async function signOut() { await api('auth.logout', {}); S.user = null; S.csrf = ''; go('#/welcome'); }

// ------------------------------------------------------------------ signing in

let gis = null;
export function googleButton(slot, cb) {
  if (!S.config.googleClientId) return;
  gis ||= new Promise((ok, no) => { const s = h('script', { src: 'https://accounts.google.com/gsi/client', async: true }); s.onload = ok; s.onerror = no; document.head.append(s); });
  gis.then(() => {
    google.accounts.id.initialize({ client_id: S.config.googleClientId, callback: (r) => cb(r.credential) });
    google.accounts.id.renderButton(slot, { theme: 'outline', size: 'large', width: Math.min(360, slot.clientWidth || 320), locale: getLang(), text: 'continue_with' });
  }).catch(() => {});
}
export function signedIn(r) {
  setUser(r.user, r.csrf);
  const next = sessionStorage.getItem('savdocuments-next');
  sessionStorage.removeItem('savdocuments-next');
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
    const g = h('div.gbox'), sav = window.Identity?.button(S.config.savAccount) || null;
    put(inner, segmented(t('sign_in'), mode, [['signin', '=' + t('sign_in'), t('sign_in')], ['signup', '=' + t('sign_up'), t('sign_up')]], (v) => { mode = v; draw(); }, { class: 'wide' }), form,
      mode === 'signin' ? btn(t('forgot'), { size: 'sm', appearance: 'ghost', onclick: () => { forgot(); } }) : !S.config.mailReady && S.config.installed ? h('p.muted.small', t('mail_off')) : null,
      S.config.googleClientId || sav ? [h('sav-divider', t('or')), S.config.googleClientId ? g : null, sav, h('p.muted.small.center', t('google_terms'))] : null);
    if (S.config.googleClientId) setTimeout(() => googleButton(g, async (credential) => {
      try {
        let r = await api('auth.google', { credential, lang: getLang() });
        if (r.error === 'needs_signup') { if (!(await confirm(t('sign_up'), t('google_new'), t('create'), false))) return; r = await api('auth.google', { credential, acceptTerms: true, lang: getLang() }); }
        signedIn(r);
      } catch (e) { if (!window.Identity?.handle(e)) show(e); }
    }));
  };
  draw();
  if (!S.config.installed) put(inner, empty('cloud-off', t(S.config.down ? 'err_network' : 'not_ready'), S.config.down ? '' : t('err_not_installed')));
  return box;
}
function forgot() {
  const email = h('sav-input', { label: t('email'), type: 'email', autofocus: true });
  dialog({ title: t('forgot'), body: h('div.form', h('p.muted', t('forgot_text')), email), actions: [{ label: t('cancel') }, { label: t('send_link'), primary: true, run: async () => { await api('auth.forgot', { email: email.value, lang: getLang() }); toast(t('link_sent'), 'success'); } }] });
}

const demo = () => h('div.demo', { 'aria-hidden': 'true' }, h('div.dsheet', h('b'), h('i'), h('i.s'), h('i'), h('i.m'), h('div.dtable', Array.from({ length: 9 }, () => h('span'))), h('i'), h('i.caret')), h('div.dsheet.two', h('i'), h('i.m'), h('div.dimg'), h('i'), h('i.s')));
export function land(root, mode, note, create) {
  if (/^#\/(d|invite)\//.test(location.hash)) sessionStorage.setItem('savdocuments-next', location.hash);
  const f = (ic, k) => h('sav-card.feat', h('div.stack', icon(ic), h('strong', t(k)), h('span.muted', t(k + '_t'))));
  put(root, h('div.land', h('header.lhead', brand('#/welcome'), langSwitch()),
    h('main.lmain', h('div.ltext', h('h1', t('land_title')), h('p.lead', t('land_text')), h('div.prow.wrap', primary(t('try_now'), { icon: 'pencil', size: 'lg', onclick: () => create('blank') }), btn(t('open_file'), { icon: 'upload', size: 'lg', onclick: () => importFile() })), h('p.muted.small', t('try_hint')), demo()), h('div.lside', note || null, authCard(mode === 'signup' ? 'signup' : 'signin'))),
    h('section.feats', f('ruler', 'ft_page'), f('chart-column', 'ft_obj'), f('file-text', 'ft_word'), f('users', 'ft_team')), credit()));
}
const centered = (root, ...kids) => put(root, h('div.wait', h('sav-card.auth', h('div.stack', kids))));
export const verify = (root, token) => centered(root, empty('mail', t('verify_title'), t('verify_text'), primary(t('verify_btn'), { onclick: async () => { signedIn(await api('auth.verify', { token })); } })));
export function reset(root, token) { const pw = h('sav-input', { label: t('new_password'), type: 'password', 'password-toggle': true, autocomplete: 'new-password', help: t('pw_hint') }); centered(root, h('h2', t('reset_title')), pw, primary(t('save'), { block: true, onclick: async () => { signedIn(await api('auth.reset', { token, password: pw.value })); } })); }
export const unverified = (root) => centered(root, empty('mail', t('unverified'), S.user.email, primary(t('resend'), { onclick: async () => { await api('auth.resend', { lang: getLang() }); toast(t('resent'), 'success'); } }), btn(t('sign_out'), { onclick: signOut })));

// ------------------------------------------------------------------ settings

export function settings() {
  const p = prefs(), u = S.user, opt = (k, def = true) => toggle(t('g_' + k), p[k] ?? def, (v) => setPrefs({ [k]: v }).catch(fail)), md = { size: 'md' };
  const name = u ? h('sav-input', { label: t('your_name'), value: u.name, maxlength: 80 }) : null;
  const pwBox = () => { const cur = h('sav-input', { label: t('current_pw'), type: 'password', 'password-toggle': true, autocomplete: 'current-password' }), pw = h('sav-input', { label: t('new_password'), type: 'password', 'password-toggle': true, autocomplete: 'new-password', help: t('pw_hint') }); dialog({ title: t(u.hasPassword ? 'change_pw' : 'set_pw'), body: h('div.form', u.hasPassword ? cur : null, pw), actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => { const r = await api('auth.password', { current: cur.value, password: pw.value }); setUser({ ...r.user, prefs: prefs() }); toast(t('pw_changed'), 'success'); } }] }); };
  const del = () => { const pw = h('sav-input', { label: t('password'), type: 'password', 'password-toggle': true, autocomplete: 'current-password' }); dialog({ title: t('delete_account'), body: h('div.form', h('p', t('delete_account_text')), u.hasPassword ? pw : null), actions: [{ label: t('cancel') }, { label: t('delete_account'), danger: true, run: async () => { await api('auth.delete', { password: pw.value }); S.user = null; go('#/welcome'); } }] }); };
  const defs = () => {
    const s = { ...structuredClone(DEFAULTS), lang: getLang(), ...(p.defaults || {}) }, up = (x) => Object.assign(s, x);
    dialog({ title: t('g_defaults'), width: '34rem', body: h('sav-tabs', h('sav-tab', { label: t('tab_page') }, pageForm(s, up)), h('sav-tab', { label: t('tab_style') }, styleForm(s, up))), actions: [{ label: t('reset'), run: async () => { await setPrefs({ defaults: null }); toast(t('settings_saved'), 'success'); } }, { label: t('save'), primary: true, run: async () => { await setPrefs({ defaults: s }); toast(t('settings_saved'), 'success'); } }] });
  };
  dialog({ title: t('settings'), width: '36rem', body: h('sav-tabs',
    h('sav-tab', { label: t('g_editor') }, h('div.form', h('div.grid2', select(t('theme'), ['auto', 'light', 'dark'].map((k) => [k, t('th_' + k)]), p.theme || 'auto', (v) => setPrefs({ theme: v }).catch(fail), md), select(t('language'), [['it', 'Italiano'], ['en', 'English']], getLang(), async (v) => { setLang(v); if (u) { u.lang = v; await api('auth.profile', { lang: v }).catch(fail); } document.querySelectorAll('sav-dialog').forEach((d) => d.hide()); dispatchEvent(new HashChangeEvent('hashchange')); }, md)), opt('spellcheck'), opt('autoformat'), opt('bubble'), opt('rulers'), opt('outline'))),
    h('sav-tab', { label: t('g_defaults') }, h('div.form', h('p.muted', t('defaults_text')), btn(t('doc_options'), { icon: 'settings', onclick: () => { defs(); } }))),
    u ? h('sav-tab', { label: t('g_account') }, h('div.form', h('div.prow.end', h('div.grow', name), btn(t('save'), { onclick: async () => { const r = await api('auth.profile', { name: name.value, lang: getLang() }); setUser({ ...r.user, prefs: prefs() }); toast(t('settings_saved'), 'success'); dispatchEvent(new HashChangeEvent('hashchange')); } })), h('p.muted', u.email), h('div.prow.wrap', btn(t(u.hasPassword ? 'change_pw' : 'set_pw'), { icon: 'lock', onclick: () => { pwBox(); } }), window.Identity ? btn(window.Identity.text('methods'), { icon: 'shield', onclick: () => { window.Identity.methods(); } }) : null), btn(t('delete_account'), { icon: 'trash', variant: 'danger', onclick: () => { del(); } }))) : null) });
}
