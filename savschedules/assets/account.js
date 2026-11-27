/** Accounts: preferences, signing in, settings. */
import { btn, confirm, dialog, drop, errText, fail, h, icon, primary, put, segmented, select, toast, toggle, face, empty } from './ui.js';
import { getLang, setLang, t } from './i18n.js';
import { VERSION } from './version.js';
import { S, api } from './store.js';
import { heroDeck } from './hero.js';

export const go = (x) => { if (location.hash === x) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = x; };

// ------------------------------------------------------------------ preferences (kept in the account, or in this browser)

export const prefs = () => { if (S.user) return S.user.prefs || {}; try { return JSON.parse(localStorage.getItem('savschedules-prefs') || '{}'); } catch { return {}; } };
export async function setPrefs(p) {
  const all = { ...prefs(), ...p };
  if (S.user) S.user.prefs = all;
  try { localStorage.setItem('savschedules-prefs', JSON.stringify(all)); } catch { /* private mode */ }
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

export const brand = (to = '#/') => h('a.brand', { href: to }, h('img', { src: 'icons/favicon.svg', width: 38, height: 38, alt: '' }), h('span', 'Sav', h('b', 'Schedules')));
/** Italian or English, kept in this browser and in the account. */
export function useLang(l) { setLang(l); if (S.user) { S.user.lang = l; api('auth.profile', { lang: l }).catch(() => {}); } dispatchEvent(new HashChangeEvent('hashchange')); }
/** The language of the footer: the SavComponents language choice, only the two languages of the app, with their own names. */
export const langSwitch = () => { const c = h('sav-language-choice', { include: 'it-IT en-GB', value: getLang() === 'it' ? 'it-IT' : 'en-GB', 'native-names': '', 'no-code': '', size: 'sm', 'aria-label': t('language'), class: 'langs' }); c.addEventListener('change', () => { const l = String(c.value || '').slice(0, 2); if (l && l !== getLang()) useLang(l); }); return c; };
/** The language in the bar of the first page: a button with the other language, as in SavDocuments. */
export const langButton = () => btn(h('span.lbl', getLang() === 'it' ? 'English' : 'Italiano'), { icon: 'languages', label: getLang() === 'it' ? 'English' : 'Italiano', class: 'langb', appearance: 'ghost', size: 'sm', onclick: () => useLang(getLang() === 'it' ? 'en' : 'it') });
export const credit = () => h('footer.credit', h('a', { href: 'privacy.html' }, 'Privacy'), h('a', { href: 'terms.html' }, t('terms_c')), h('a', { href: 'https://www.illerom.eu/', rel: 'noopener' }, 'Illerom'), h('span', getLang() === 'it' ? 'di ' : 'by ', h('a.sig', { href: 'https://www.saveriomorelli.com', rel: 'noopener' }, 'Saverio Morelli')), h('a.vlink', { href: '#/changelog', title: t('changelog') }, 'v' + VERSION), h('span.grow'), langSwitch());
export function userMenu() {
  const u = S.user, av = face(u.name, null, 36);
  // the picture of SavAccount, once it has really loaded (a service disconnected there keeps the initials)
  if (u.picture) { const im = new Image(); im.onload = () => av.setAttribute('image', u.picture); im.src = u.picture; }
  av.setAttribute('button', '');
  // the apps of SavOffice next to the avatar
  return h('span.umenu', h('savoffice-apps', { current: 'savschedules' }), drop(av, [{ head: u.email }, ['settings', t('settings'), () => go('#/settings')], u.master ? ['shield', t('admin'), () => go('#/admin')] : null, '-', ['log-out', t('sign_out'), signOut]], { placement: 'bottom-end', label: u.name }));
}
export async function signOut() {
  await api('auth.logout', {}).catch(() => {});
  S.user = null; S.csrf = '';
  go('#/welcome');
}

/**
 * The search of actions (⌘J or Ctrl+J, the same in every app of SavOffice: ../assets/savoffice/savoffice.js): what this
 * screen can do, as groups [label, [[icon, label, run or '#/address', shortcut, description]…]], then the pages of the app.
 */
export function commands(...groups) {
  const item = ([icon, label, to, shortcut, description]) => ({ icon, label, shortcut, description, run: typeof to === 'function' ? to : () => { location.hash = to; } });
  const pages = S.user ? [['layout-grid', t('home'), '#/'], ['settings', t('settings'), '#/settings'], ['sparkles', t('changelog'), '#/changelog'], ['log-out', t('sign_out'), () => signOut()]]
    : [['', t('sign_in'), '#/signin'], ['', t('sign_up'), '#/signup'], ['sparkles', t('changelog'), '#/changelog']];
  window.SavOffice?.commands([...groups.filter(Boolean).map(([label, list]) => ({ label, items: list.filter(Boolean).map(item) })), { label: 'SavSchedules', items: pages.map(item) }]);
}

// ------------------------------------------------------------------ signing in

export function signedIn(r) {
  setUser(r.user, r.csrf);
  const next = sessionStorage.getItem('savschedules-next');
  sessionStorage.removeItem('savschedules-next');
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
      sav ? [h('sav-divider', t('or')), sav, h('p.muted.small.center', t('google_terms'))] : null);
  };
  draw();
  if (!S.config.installed) put(inner, empty('cloud-off', t(S.config.down ? 'err_network' : 'not_ready'), S.config.down ? '' : t('err_not_installed')));
  return box;
}
function forgot() {
  const email = h('sav-input', { label: t('email'), type: 'email', autofocus: true });
  dialog({ title: t('forgot'), body: h('div.form', h('p.muted', t('forgot_text')), email), actions: [{ label: t('cancel') }, { label: t('send_link'), primary: true, run: async () => { await api('auth.forgot', { email: email.value, lang: getLang() }); toast(t('link_sent'), 'success'); } }] });
}

// ------------------------------------------------------------------ first page

const wd = (i, o = 'short') => new Intl.DateTimeFormat(getLang(), { weekday: o, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i)));
/** Small pages of schedules for the fan of the first page: drawn, not real, the same in both themes. */
function pages() {
  const bar = (title) => h('div.lp-bar', h('i.lp-dot'), h('b', title));
  const slot = (cls, time) => h('div.lp-slot.' + cls, h('b', time), cls === 'free' ? null : h('span'));
  const day = (i, ...slots) => h('div.lp-day', h('small', wd(i)), ...slots);
  const week = h('div.lp', bar(t('p_office')), h('div.lp-week', day(0, slot('taken', '14:00'), slot('free', '14:15'), slot('taken', '14:30'), slot('free', '14:45')), day(1, slot('free', '14:00'), slot('pick', '14:15'), slot('free', '14:30'), slot('taken', '14:45')), day(2, slot('taken', '14:00'), slot('taken', '14:15'), slot('free', '14:30'), slot('free', '14:45'))));
  const v = (c) => h('span.lp-v.' + c), row = (hh, ...x) => h('div.lp-row', h('span.lp-av', { style: `--h:${hh}` }), ...x);
  const poll = h('div.lp', bar(t('p_dinner')), h('div.lp-grid', h('div.lp-row.head', h('span'), ['12', '13', '19', '20'].map((d) => h('em', d))), row(210, v('y'), v('n'), v('y'), v('m')), row(150, v('y'), v('y'), v('y'), v('n')), row(20, v('m'), v('n'), v('y'), v('y')), row(280, v('y'), v('n'), v('y'), v('n')), row(100, v('n'), v('m'), v('y'), v('y')), h('div.lp-row.sum', h('span'), h('em', '3'), h('em', '1'), h('em.best', '5'), h('em', '3'))));
  const month = h('div.lp', bar(t('p_meeting')), h('div.lp-month', Array.from({ length: 35 }, (_, i) => h('span' + ([9, 11, 16].includes(i) ? '.on' : '') + (i === 17 ? '.best' : '') + (i < 3 || i > 32 ? '.out' : '')))));
  const done = h('div.lp.lp-done', h('div.lp-check', icon('check')), h('b', t('booked')), h('div.lp-ticket', h('small', wd(1, 'long')), h('strong', '14:15–14:30'), h('i')), h('div.lp-btn'));
  const rank = h('div.lp', bar(t('p_shifts')), h('div.lp-rank', [92, 70, 54, 30, 18].map((w, i) => h('div.lp-r', h('span', { style: `width:${w}%` }), i === 0 ? h('em') : null))));
  return [rank, month, poll, done, week];
}
/**
 * The first page, as in SavDocuments and SavPresentations: a bar with the language and "Sign in", the title with the two
 * buttons, a fan of small schedules that open up and come forward under the pointer, six features and how it works.
 * Signing in and creating an account have a page of their own (#/signin, #/signup).
 */
export function land(root, mode, note) {
  if (/^#\/(s|r|e)\//.test(location.hash)) sessionStorage.setItem('savschedules-next', location.hash);
  // the other apps of SavOffice are a button away on the first page too, as in every app of the suite
  const top = (...right) => h('header.ltop', brand('#/welcome'), h('div.spacer'), langButton(), h('savoffice-apps', { current: 'savschedules' }), ...right);
  document.title = 'SavSchedules';
  if (mode === 'signin' || mode === 'signup') {
    put(root, h('div.authp', top(), h('main.amain', h('div.stack.aw', note || null, authCard(mode))), credit()));
    return () => {};
  }
  const stage = h('div.l-stage', { 'aria-hidden': 'true' }), cards = pages().map((p, i) => h('div.l-card', { style: `--i:${i}` }, h('div.l-in', p)));
  stage.append(...cards);
  const feat = (ic, k) => h('div.feat', icon(ic), h('h3', t(k)), h('p', t(k + '_t')));
  const step = (n, k) => h('li', h('span.num', String(n)), h('div', h('strong', t(k)), h('span.muted', t(k + '_t'))));
  put(root, h('div.landing', top(btn(t('sign_in'), { appearance: 'outline', href: '#/signin' })),
    h('main.lmain', h('section.hero', h('div.hero-t', h('h1', t('land_title')), h('p', t('land_text')), h('div.prow', primary(t('l_cta'), { size: 'lg', href: '#/signup' }), btn(t('sign_in'), { size: 'lg', appearance: 'ghost', href: '#/signin' })), h('small', t('l_small'))), stage),
      h('section.feats', feat('vote', 'ft_poll'), feat('lock', 'ft_slots'), feat('user-check', 'ft_guest'), feat('sliders-horizontal', 'ft_rules'), feat('globe', 'ft_zones'), feat('calendar-plus', 'ft_files')),
      h('section.how', h('h2', t('how_title')), h('ol.steps', step(1, 'how_1'), step(2, 'how_2'), step(3, 'how_3')))), credit()));
  return heroDeck(stage, cards);
}
const centered = (root, ...kids) => put(root, h('div.wait', h('sav-card.auth', h('div.stack', kids))));
export const verify = (root, token) => centered(root, empty('mail', t('verify_title'), t('verify_text'), primary(t('verify_btn'), { onclick: async () => { signedIn(await api('auth.verify', { token })); } })));
export function reset(root, token) { const pw = h('sav-input', { label: t('new_password'), type: 'password', 'password-toggle': true, autocomplete: 'new-password', help: t('pw_hint') }); centered(root, h('h2', t('reset_title')), pw, primary(t('save'), { block: true, onclick: async () => { signedIn(await api('auth.reset', { token, password: pw.value })); } })); }
export const unverified = (root) => centered(root, empty('mail', t('unverified'), S.user.email, primary(t('resend'), { onclick: async () => { await api('auth.resend', { lang: getLang() }); toast(t('resent'), 'success'); } }), btn(t('sign_out'), { onclick: signOut })));

// ------------------------------------------------------------------ settings

export const settings = () => go('#/settings');
