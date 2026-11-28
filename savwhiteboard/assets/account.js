/** Accounts (the same of SavSchedules and SavCalendar: one account, one session for all): preferences, signing in, the first page. */
import { btn, confirm, dialog, drop, errText, fail, h, icon, primary, put, segmented, select, toast, toggle, face, empty, K } from './ui.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api } from './store.js';
import { heroDeck } from './hero.js';
import { appsButton } from './office.js';
import { VERSION } from './version.js';

export const go = (x) => { if (location.hash === x) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = x; };

// ------------------------------------------------------------------ preferences (kept in the account, or in this browser)

/** The settings of the boards: kept in the account (wb.prefs), and a copy in this browser for the first page. */
export const prefs = () => { if (S.user && S.wb) return S.wb; try { return JSON.parse(localStorage.getItem('savwhiteboard-prefs') || '{}'); } catch { return {}; } };
let sending = null, queued = null;
/** Saves the settings; quick changes in a row (a colour, a size…) leave as one request. */
export async function setPrefs(p) {
  const all = { ...prefs(), ...p };
  if (S.user) S.wb = all;
  try { localStorage.setItem('savwhiteboard-prefs', JSON.stringify(all)); } catch { /* private mode */ }
  applyTheme();
  if (!S.user) return;
  queued = all;
  if (sending) return sending;
  sending = (async () => { try { while (queued) { const x = queued; queued = null; await api('wb.prefs', { prefs: x }); } } finally { sending = null; } })();
  return sending;
}
export const applyTheme = () => window.Sav?.setMode(prefs().theme || 'auto');
export function setUser(u, csrf) {
  S.user = u;
  if (csrf) S.csrf = csrf;
  if (u) setLang(u.lang);
  applyTheme();
}

// ------------------------------------------------------------------ pieces of every page

export const brand = (to = '#/') => h('a.brand', { href: to }, h('img', { src: 'icons/favicon.svg', width: 38, height: 38, alt: '' }), h('span', 'Sav', h('b', 'Whiteboard')));
/** Italian or English, kept in this browser and in the account. */
export function useLang(l) { setLang(l); if (S.user) { S.user.lang = l; api('auth.profile', { lang: l }).catch(() => {}); } dispatchEvent(new HashChangeEvent('hashchange')); }
/** The language of the footer: the SavComponents language choice, only the two languages of the app, with their own names. */
export const langSwitch = () => { const c = h('sav-language-choice', { 'sheet-on-mobile': true, include: 'it-IT en-GB', value: getLang() === 'it' ? 'it-IT' : 'en-GB', 'native-names': '', 'no-code': '', size: 'sm', 'aria-label': t('language'), class: 'langs' }); c.addEventListener('change', () => { const l = String(c.value || '').slice(0, 2); if (l && l !== getLang()) useLang(l); }); return c; };
/** The language in the bar of the first page: a button with the other language, as in SavDocuments. */
export const langButton = () => btn(h('span.lbl', getLang() === 'it' ? 'English' : 'Italiano'), { icon: 'languages', label: getLang() === 'it' ? 'English' : 'Italiano', class: 'langb', appearance: 'ghost', size: 'sm', onclick: () => useLang(getLang() === 'it' ? 'en' : 'it') });
export const credit = () => h('footer.credit', h('a', { href: 'privacy.html' }, 'Privacy'), h('a', { href: 'terms.html' }, t('terms_c')), h('a', { href: 'https://www.illerom.eu/', rel: 'noopener' }, 'Illerom'), h('span', getLang() === 'it' ? 'di ' : 'by ', h('a.sig', { href: 'https://www.saveriomorelli.com', rel: 'noopener' }, 'Saverio Morelli')), h('a.vlink', { href: '#/changelog', title: t('changelog') }, 'v' + VERSION), h('span.grow'), langSwitch());
export function userMenu() {
  const u = S.user, av = face(u.name, null, 36);
  // the picture of SavAccount, once it has really loaded (a service disconnected there keeps the initials)
  if (u.picture) { const im = new Image(); im.onload = () => av.setAttribute('image', u.picture); im.src = u.picture; }
  av.setAttribute('button', '');
  return h('div.umenu', appsButton(), drop(av, [{ head: u.email }, ['settings', t('settings'), () => go('#/settings')], ['keyboard', t('shortcuts'), () => showShortcuts()], '-', ['log-out', t('sign_out'), signOut]], { placement: 'bottom-end', label: u.name }));
}
let own = null;
/** An editor that is open gives its own list of keys (null when it closes): the menu of the account and ⌘? show that one. */
export const ownShortcuts = (show) => { own = show; };
export const showShortcuts = () => (own ? own() : shortcutsDialog());
/** The keys of the app, as in SavContacts: in the menu of the account and with ⌘? / Ctrl+?. */
export function shortcutsDialog() {
  const row = ([keys, label]) => h('div.orow', h('div.orow-t', h('b', label)), h('div.orow-c', { style: 'gap:.3rem' }, keys.map((k) => h('sav-kbd', K(k)))));
  dialog({ title: t('shortcuts'), width: '28rem', body: [h('sav-card.ocard', { appearance: 'outlined' }, h('div.orows', [[['Mod+?'], t('shortcuts')], [['Mod+J'], t('actions_search')]].map(row))), h('p.muted.small', t('k_editor'))], actions: [{ label: t('close') }] });
}
// ⌘? / Ctrl+? opens them on every page of the app, also while writing (as ⌘J), never over a dialog
addEventListener('keydown', (e) => {
  if (e.defaultPrevented || !(e.metaKey || e.ctrlKey) || e.altKey || !(e.key === '?' || (e.shiftKey && e.code === 'Slash'))) return;
  if (document.querySelector('sav-dialog[open], sav-drawer[open]')) return;
  e.preventDefault();
  showShortcuts();
});
export async function signOut() {
  await api('auth.logout', {}).catch(() => {});
  S.user = null; S.csrf = ''; S.boards = []; S.wb = null;
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
  window.SavOffice?.commands([...groups.filter(Boolean).map(([label, list]) => ({ label, items: list.filter(Boolean).map(item) })), { label: 'SavWhiteboard', items: pages.map(item) }]);
}

// ------------------------------------------------------------------ signing in

export function signedIn(r) {
  setUser(r.user, r.csrf);
  const next = sessionStorage.getItem('savwhiteboard-next');
  sessionStorage.removeItem('savwhiteboard-next');
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

const INK = { blue: '#1d4e89', red: '#b3261e', green: '#0f6e56', orange: '#c45a0c', violet: '#5b4cf0', chalk: '#f4f1e8' };
const svgEl = (w, hh, inner, bg) => h('div.lp-svg', { style: bg ? `background:${bg}` : null, html: `<svg viewBox="0 0 ${w} ${hh}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">${inner}</svg>` });
const dots = (gap, c) => `<defs><pattern id="d${gap}${c.slice(1)}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse"><circle cx="${gap / 2}" cy="${gap / 2}" r="1.1" fill="${c}"/></pattern></defs><rect width="100%" height="100%" fill="url(#d${gap}${c.slice(1)})"/>`;
const grid = (gap, c) => `<defs><pattern id="g${gap}${c.slice(1)}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse"><path d="M${gap} 0V${gap}H0" fill="none" stroke="${c}" stroke-width=".7"/></pattern></defs><rect width="100%" height="100%" fill="url(#g${gap}${c.slice(1)})"/>`;
const lines = (gap, c) => `<defs><pattern id="l${gap}${c.slice(1)}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse"><path d="M0 ${gap - .5}H${gap}" stroke="${c}" stroke-width=".7"/></pattern></defs><rect width="100%" height="100%" fill="url(#l${gap}${c.slice(1)})"/>`;
const ink = (d, c, w = 2.4, o = 1) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${o}"/>`;
/** Small boards for the fan of the first page: drawn, not real, the same in both themes. */
function pages() {
  // dots: a mind map written by hand
  const map = svgEl(150, 200, dots(10, '#c9c4bb') + ink('M48 92c10-14 44-16 56 0s-8 28-28 28-38-12-28-28z', INK.blue) + ink('M58 100c4-6 8-6 10 0M70 100c3-5 7-5 9 0M82 98c2-4 5-4 7 0', INK.blue, 1.8)
    + ink('M50 88 28 52M104 92l22-34M96 116l26 38M54 116l-22 34', INK.blue, 1.8) + `<rect x="8" y="34" width="38" height="20" rx="3" fill="#fff3a3"/><rect x="110" y="40" width="34" height="20" rx="3" fill="#cdeaf7"/><rect x="104" y="150" width="38" height="22" rx="3" fill="#ffd9b8"/><rect x="10" y="150" width="34" height="20" rx="3" fill="#d3f3d8"/>`
    + ink('M14 44h22M115 50h20M110 161h24M16 160h20', '#1c1c1c', 1.5, .6));
  // blackboard: a lesson in chalk
  const chalk = svgEl(150, 200, ink('M18 40c6-10 12-10 14 0s8 10 14 0M54 36h10M58 31v10M72 40c6-10 12-10 14 0', INK.chalk, 2.2, .92) + ink('M18 70h70', INK.chalk, 1.4, .6)
    + ink('M20 100c20-30 40-30 60 0s40 30 60 0', '#ffd166', 2.4) + ink('M20 140h110M24 136v8M50 136v8M76 136v8M102 136v8', INK.chalk, 1.6, .8) + ink('M30 170c8-6 16-6 24 0', INK.chalk, 2, .85), '#22372f');
  // squares: shapes and an arrow
  const plan = svgEl(150, 200, grid(12, '#dfe4ec') + '<rect x="18" y="30" width="48" height="30" rx="4" fill="none" stroke="#1d4e89" stroke-width="2.2"/><ellipse cx="108" cy="46" rx="26" ry="16" fill="#cdeaf7" stroke="#0f5f8f" stroke-width="2"/>'
    + ink('M66 45h14M74 39l6 6-6 6', INK.blue, 2) + '<path d="M75 92l26 20-26 20-26-20z" fill="#fff3a3" stroke="#b7791f" stroke-width="2"/>' + ink('M42 60 66 92M108 62 88 96', INK.blue, 1.8) + ink('M75 132v22M69 148l6 6 6-6', INK.blue, 2)
    + '<rect x="46" y="156" width="58" height="24" rx="12" fill="none" stroke="#0f6e56" stroke-width="2.2"/>');
  // lines: notes with the highlighter
  const notes = svgEl(150, 200, lines(16, '#cfd8e6') + ink('M18 42h90', '#ffe14d', 11, .55) + ink('M20 42c8-4 12 4 18 0s10 4 16 0 10 4 16 0 10 4 16 0 8 3 12 0', '#1c1c1c', 1.8)
    + ink('M20 74c8-4 12 4 18 0s10 4 16 0 10 4 16 0 10 4 16 0', '#1c1c1c', 1.6, .8) + ink('M20 90c8-4 12 4 18 0s10 4 16 0 10 4 16 0 10 4 16 0 10 4 16 0 8 3 12 0', '#1c1c1c', 1.6, .8)
    + ink('M18 122h70', '#9be27a', 11, .5) + ink('M20 122c8-4 12 4 18 0s10 4 16 0 10 4 16 0 8 3 12 0', '#1c1c1c', 1.8) + ink('M22 150c8-4 12 4 18 0s10 4 16 0', INK.red, 1.8) + ink('M100 140l8 10 18-22', INK.red, 2.4), '#fffdf6');
  // dark: a laser trail over a chart
  const dark = svgEl(150, 200, dots(12, '#3a3f47') + ink('M20 160V40M20 160h112', '#e8eaed', 1.6, .7) + ink('M24 140c18-4 22-40 40-44s22 20 36 10 16-46 28-56', '#7cc4ff', 2.6)
    + ink('M60 120c10-30 40-40 60-20', '#ff4d4d', 4, .5) + '<circle cx="120" cy="100" r="4" fill="#ff4d4d"/>', '#1d2026');
  return [chalk, plan, notes, dark, map];
}
/**
 * The first page, as in SavDocuments and SavPresentations: a bar with the language and "Sign in", the title with the two
 * buttons, a fan of small schedules that open up and come forward under the pointer, six features and how it works.
 * Signing in and creating an account have a page of their own (#/signin, #/signup).
 */
export function land(root, mode, note) {
  if (/^#\/(day|week|month|agenda|e|settings)\b/.test(location.hash)) sessionStorage.setItem('savwhiteboard-next', location.hash);
  const top = (...right) => h('header.ltop', brand('#/welcome'), h('div.spacer'), langButton(), appsButton(), ...right);
  document.title = 'SavWhiteboard';
  if (mode === 'signin' || mode === 'signup') {
    put(root, h('div.authp', top(), h('main.amain', h('div.stack.aw', note || null, authCard(mode))), credit()));
    return () => {};
  }
  const stage = h('div.l-stage', { 'aria-hidden': 'true' }), cards = pages().map((p, i) => h('div.l-card', { style: `--i:${i}` }, h('div.l-in', p)));
  stage.append(...cards);
  const feat = (ic, k) => h('div.feat', icon(ic), h('h3', t(k)), h('p', t(k + '_t')));
  const step = (n, k) => h('li', h('span.num', String(n)), h('div', h('strong', t(k)), h('span.muted', t(k + '_t'))));
  put(root, h('div.landing', top(btn(t('sign_in'), { appearance: 'outline', href: '#/signin' })),
    h('main.lmain', h('section.hero', h('div.hero-t', h('span.kicker', icon('grip'), ' ', t('land_kicker')), h('h1', t('land_title')), h('p', t('land_text')), h('div.prow', primary(t('l_cta'), { size: 'lg', href: '#/signup' }), btn(t('sign_in'), { size: 'lg', appearance: 'ghost', href: '#/signin' })), h('small', t('l_small'))), stage),
      h('section.feats', feat('scan', 'ft_endless'), feat('pen', 'ft_ink'), feat('dots', 'ft_paper'), feat('type', 'ft_type'), feat('file-down', 'ft_files'), feat('shield', 'ft_free')),
      h('section.how', h('h2', t('how_title')), h('ol.steps', step(1, 'how_1'), step(2, 'how_2'), step(3, 'how_3')))), credit()));
  return heroDeck(stage, cards);
}
const centered = (root, ...kids) => put(root, h('div.wait', h('sav-card.auth', h('div.stack', kids))));
export const verify = (root, token) => centered(root, empty('mail', t('verify_title'), t('verify_text'), primary(t('verify_btn'), { onclick: async () => { signedIn(await api('auth.verify', { token })); } })));
export function reset(root, token) { const pw = h('sav-input', { label: t('new_password'), type: 'password', 'password-toggle': true, autocomplete: 'new-password', help: t('pw_hint') }); centered(root, h('h2', t('reset_title')), pw, primary(t('save'), { block: true, onclick: async () => { signedIn(await api('auth.reset', { token, password: pw.value })); } })); }
export const unverified = (root) => centered(root, empty('mail', t('unverified'), S.user.email, primary(t('resend'), { onclick: async () => { await api('auth.resend', { lang: getLang() }); toast(t('resent'), 'success'); } }), btn(t('sign_out'), { onclick: signOut })));

