/** Accounts (the same of SavSchedules and SavCalendar: one account, one session for all): preferences, signing in, the first page. */
import { btn, confirm, dialog, drop, errText, fail, h, icon, primary, put, segmented, select, toast, toggle, face, empty } from './ui.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api } from './store.js';
import { heroDeck } from './hero.js';
import { appsButton } from './office.js';
import { VERSION } from './version.js';

export const go = (x) => { if (location.hash === x) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = x; };

// ------------------------------------------------------------------ preferences (kept in the account, or in this browser)

/** The settings of the notebooks: kept in the account (nb.prefs), and a copy in this browser for the first page. */
export const prefs = () => { if (S.user && S.nb) return S.nb; try { return JSON.parse(localStorage.getItem('savnotes-prefs') || '{}'); } catch { return {}; } };
let sending = null, queued = null;
/** Saves the settings; quick changes in a row (a colour, a size…) leave as one request. */
export async function setPrefs(p) {
  const all = { ...prefs(), ...p };
  if (S.user) S.nb = all;
  try { localStorage.setItem('savnotes-prefs', JSON.stringify(all)); } catch { /* private mode */ }
  applyTheme();
  if (!S.user) return;
  queued = all;
  if (sending) return sending;
  sending = (async () => { try { while (queued) { const x = queued; queued = null; await api('nb.prefs', { prefs: x }); } } finally { sending = null; } })();
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

export const brand = (to = '#/') => h('a.brand', { href: to }, h('img', { src: 'icons/favicon.svg', width: 38, height: 38, alt: '' }), h('span', 'Sav', h('b', 'Notes')));
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
  return h('div.umenu', appsButton(), drop(av, [{ head: u.email }, ['settings', t('settings'), () => go('#/settings')], '-', ['log-out', t('sign_out'), signOut]], { placement: 'bottom-end', label: u.name }));
}
export async function signOut() {
  await api('auth.logout', {}).catch(() => {});
  S.user = null; S.csrf = ''; S.notebooks = []; S.nb = null;
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
  window.SavOffice?.commands([...groups.filter(Boolean).map(([label, list]) => ({ label, items: list.filter(Boolean).map(item) })), { label: 'SavNotes', items: pages.map(item) }]);
}

// ------------------------------------------------------------------ signing in

export function signedIn(r) {
  setUser(r.user, r.csrf);
  const next = sessionStorage.getItem('savnotes-next');
  sessionStorage.removeItem('savnotes-next');
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

const INK = { blue: '#1d4e89', red: '#b3261e', green: '#0f6e56', brown: '#7b5434', violet: '#5b4cf0' };
const svgEl = (w, hh, inner, bg) => h('div.lp-svg', { style: bg ? `background:${bg}` : null, html: `<svg viewBox="0 0 ${w} ${hh}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">${inner}</svg>` });
const dots = (gap, c) => `<defs><pattern id="d${gap}${c.slice(1)}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse"><circle cx="${gap / 2}" cy="${gap / 2}" r="1.1" fill="${c}"/></pattern></defs><rect width="100%" height="100%" fill="url(#d${gap}${c.slice(1)})"/>`;
const grid = (gap, c) => `<defs><pattern id="g${gap}${c.slice(1)}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse"><path d="M${gap} 0V${gap}H0" fill="none" stroke="${c}" stroke-width=".7"/></pattern></defs><rect width="100%" height="100%" fill="url(#g${gap}${c.slice(1)})"/>`;
const lines = (gap, c) => `<defs><pattern id="l${gap}${c.slice(1)}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse"><path d="M0 ${gap - .5}H${gap}" stroke="${c}" stroke-width=".7"/></pattern></defs><rect width="100%" height="100%" fill="url(#l${gap}${c.slice(1)})"/>`;
const ink = (d, c, w = 2.4, o = 1) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${o}"/>`;
const scrib = (x, y, n, c = '#1c1c1c', w = 1.6) => { let d = `M${x} ${y}`; for (let i = 0; i < n; i++) d += `c3-4 5 4 8 0s5 4 8 0`; return ink(d, c, w); };
const bar = (x, y, w, c = '#2b2b30', o = .55, hh = 3) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="1.5" fill="${c}" opacity="${o}"/>`;
/** Small sheets for the fan of the first page: drawn, not real, the same in both themes. */
function pages() {
  // ruled paper: notes by hand with the highlighter
  const notes = svgEl(150, 200, lines(14, '#bcd0ea') + '<path d="M26 0V200" stroke="#e58b8b" stroke-width=".9"/>' + ink('M32 32h70', '#ffe14d', 10, .55) + scrib(32, 33, 4, INK.blue, 2)
    + scrib(32, 60, 6) + scrib(32, 74, 5) + scrib(32, 88, 6) + ink('M32 116h44', '#9be27a', 10, .5) + scrib(32, 117, 3, INK.red, 1.8) + scrib(32, 144, 5) + scrib(32, 158, 4) + ink('M110 140l6 8 14-18', INK.red, 2.2), '#fffdf6');
  // squares: maths and a figure
  const maths = svgEl(150, 200, grid(10, '#d5dce8') + ink('M20 30h10M25 25v10M38 30h8M54 26c6-6 10 6 4 10s4 4 8-2', '#1c1c1c', 1.8) + ink('M20 52h60', '#1c1c1c', 1.2, .5)
    + '<path d="M30 150 30 80 110 150Z" fill="#cdeaf7" stroke="#0f5f8f" stroke-width="2"/>' + ink('M30 140h10v10', '#0f5f8f', 1.4) + ink('M64 104c10-2 16 6 14 12', INK.red, 1.6) + scrib(84, 178, 3, INK.blue, 1.6));
  // a typed sheet: title, lines of text, a checklist
  const doc = svgEl(150, 200, lines(14, '#d8e2f0') + bar(18, 22, 74, '#1f1f22', .85, 6) + bar(18, 52, 110) + bar(18, 66, 104) + bar(18, 80, 116) + bar(18, 94, 60)
    + '<rect x="18" y="116" width="7" height="7" rx="2" fill="none" stroke="#1f1f22" stroke-width="1.2" opacity=".7"/><rect x="18" y="130" width="7" height="7" rx="2" fill="#1f1f22" opacity=".45"/><rect x="18" y="144" width="7" height="7" rx="2" fill="none" stroke="#1f1f22" stroke-width="1.2" opacity=".7"/>'
    + bar(31, 118, 70) + bar(31, 132, 54, '#2b2b30', .3) + bar(31, 146, 80) + ink('M96 160c10 10 24 6 30-8', INK.red, 2) + ink('M120 150l6 2-2 6', INK.red, 2), '#ffffff');
  // Cornell notes: questions on the left, notes on the right, summary below
  const cornell = svgEl(150, 200, lines(14, '#bcd0ea') + '<rect y="160" width="150" height="40" fill="#fff"/><path d="M45 0V160M0 160H150" stroke="#e58b8b" stroke-width="1"/>' + scrib(8, 33, 2, INK.violet, 1.6) + scrib(8, 75, 2, INK.violet, 1.6)
    + scrib(52, 33, 5) + scrib(52, 47, 4) + scrib(52, 61, 5) + scrib(52, 89, 4) + scrib(52, 103, 5) + scrib(10, 176, 7, INK.brown, 1.6) + scrib(10, 188, 4, INK.brown, 1.6));
  // dots: a plan for the week
  const plan = svgEl(150, 200, dots(10, '#c9c4bb') + ink('M20 28c4-6 10-6 12 0', INK.green, 2.2) + scrib(38, 29, 4, INK.green, 2) + '<rect x="18" y="46" width="114" height="44" rx="6" fill="#fff3a3" opacity=".8"/>'
    + scrib(26, 62, 5) + scrib(26, 76, 3) + ink('M24 108l5 5 9-10', INK.green, 2) + scrib(44, 110, 4) + ink('M24 128l5 5 9-10', INK.green, 2) + scrib(44, 130, 3) + '<circle cx="30" cy="152" r="5" fill="none" stroke="#1c1c1c" stroke-width="1.4"/>' + scrib(44, 153, 4), '#fbf8f2');
  return [cornell, maths, doc, plan, notes];
}
/**
 * The first page, as in SavDocuments and SavPresentations: a bar with the language and "Sign in", the title with the two
 * buttons, a fan of small sheets that open up and come forward under the pointer, six features and how it works.
 * Signing in and creating an account have a page of their own (#/signin, #/signup).
 */
export function land(root, mode, note) {
  if (/^#\/(n|trash|settings)\b/.test(location.hash)) sessionStorage.setItem('savnotes-next', location.hash);
  const top = (...right) => h('header.ltop', brand('#/welcome'), h('div.spacer'), langButton(), appsButton(), ...right);
  document.title = 'SavNotes';
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
      h('section.feats', feat('notebook', 'ft_books'), feat('pen', 'ft_ink'), feat('grid-3x3', 'ft_paper'), feat('keyboard', 'ft_type'), feat('file-down', 'ft_files'), feat('shield', 'ft_free')),
      h('section.how', h('h2', t('how_title')), h('ol.steps', step(1, 'how_1'), step(2, 'how_2'), step(3, 'how_3')))), credit()));
  return heroDeck(stage, cards);
}
const centered = (root, ...kids) => put(root, h('div.wait', h('sav-card.auth', h('div.stack', kids))));
export const verify = (root, token) => centered(root, empty('mail', t('verify_title'), t('verify_text'), primary(t('verify_btn'), { onclick: async () => { signedIn(await api('auth.verify', { token })); } })));
export function reset(root, token) { const pw = h('sav-input', { label: t('new_password'), type: 'password', 'password-toggle': true, autocomplete: 'new-password', help: t('pw_hint') }); centered(root, h('h2', t('reset_title')), pw, primary(t('save'), { block: true, onclick: async () => { signedIn(await api('auth.reset', { token, password: pw.value })); } })); }
export const unverified = (root) => centered(root, empty('mail', t('unverified'), S.user.email, primary(t('resend'), { onclick: async () => { await api('auth.resend', { lang: getLang() }); toast(t('resent'), 'success'); } }), btn(t('sign_out'), { onclick: signOut })));

