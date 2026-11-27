/** Accounts (the same of SavSchedules, SavCalendar, SavNotes and SavPodcasts: one account, one session for all): preferences, signing in, the first page. */
import { btn, confirm, dialog, drop, errText, fail, h, icon, primary, put, segmented, select, toast, toggle, face, empty } from './ui.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api } from './store.js';
import { heroDeck } from './hero.js';
import { appsButton } from './office.js';
import { VERSION } from './version.js';

export const go = (x) => { if (location.hash === x) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = x; };

// ------------------------------------------------------------------ preferences (kept in the account, or in this browser)

/** The settings of SavReads: kept in the account (rd.prefs), and a copy in this browser (the reader opens with them offline too). */
export const prefs = () => { if (S.user && S.prefs) return S.prefs; try { return JSON.parse(localStorage.getItem('savreads-prefs') || '{}'); } catch { return {}; } };
let sending = null, queued = null;
/** Saves the settings; quick changes in a row (a colour, a size…) leave as one request. */
export async function setPrefs(p) {
  const all = { ...prefs(), ...p };
  if (S.user) S.prefs = all;
  try { localStorage.setItem('savreads-prefs', JSON.stringify(all)); } catch { /* private mode */ }
  applyTheme();
  if (!S.user) return;
  queued = all;
  if (sending) return sending;
  sending = (async () => { try { while (queued) { const x = queued; queued = null; await api('rd.prefs', { prefs: x }); } } finally { sending = null; } })();
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

export const brand = (to = '#/') => h('a.brand', { href: to }, h('img', { src: 'icons/favicon.svg', width: 38, height: 38, alt: '' }), h('span', 'Sav', h('b', 'Reads')));
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
  S.user = null; S.csrf = ''; S.subs = []; S.prefs = null;
  try { localStorage.removeItem('savreads-prefs'); localStorage.removeItem('savreads-kept'); } catch { /* private mode */ }
  navigator.serviceWorker?.controller?.postMessage('savreads-signout'); // the pictures of the articles kept on this device go too
  go('#/welcome');
}

/**
 * The search of actions (⌘J or Ctrl+J, the same in every app of SavOffice: ../assets/savoffice/savoffice.js): what this
 * screen can do, as groups [label, [[icon, label, run or '#/address', shortcut, description]…]], then the pages of the app.
 */
export function commands(...groups) {
  const item = ([icon, label, to, shortcut, description]) => ({ icon, label, shortcut, description, run: typeof to === 'function' ? to : () => { location.hash = to; } });
  const pages = S.user ? [['inbox', t('nav_unread'), '#/'], ['star', t('nav_starred'), '#/starred'], ['archive', t('nav_archive'), '#/archive'], ['highlighter', t('nav_highlights'), '#/highlights'], ['rss', t('nav_feeds'), '#/feeds'], ['settings', t('settings'), '#/settings'], ['sparkles', t('changelog'), '#/changelog'], ['log-out', t('sign_out'), () => signOut()]]
    : [['', t('sign_in'), '#/signin'], ['', t('sign_up'), '#/signup'], ['sparkles', t('changelog'), '#/changelog']];
  window.SavOffice?.commands([...groups.filter(Boolean).map(([label, list]) => ({ label, items: list.filter(Boolean).map(item) })), { label: 'SavReads', items: pages.map(item) }]);
}

// ------------------------------------------------------------------ signing in

export function signedIn(r) {
  setUser(r.user, r.csrf);
  const next = sessionStorage.getItem('savreads-next');
  sessionStorage.removeItem('savreads-next');
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

/** Small pages of articles for the fan of the first page: drawn, not real, the same in both themes. */
function pages() {
  const lines = (y, n, w = [150, 160, 120, 155, 140, 90], c = '#d9dce6') => w.slice(0, n).map((x, i) => `<rect x="22" y="${y + i * 13}" width="${x}" height="6" rx="3" fill="${c}"/>`).join('');
  const page = (pic, head, tone, hl = -1) => h('div.lp-svg', { style: 'background:#fff', html: `<svg viewBox="0 0 200 232" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><rect width="200" height="96" fill="${tone}"/>${pic}<rect x="22" y="110" width="${head}" height="11" rx="4" fill="#1d1f3d"/><rect x="22" y="128" width="${head * .62}" height="11" rx="4" fill="#1d1f3d"/><circle cx="28" cy="153" r="6" fill="#c7cbe0"/><rect x="40" y="150" width="60" height="6" rx="3" fill="#a9aec8"/>${hl >= 0 ? `<rect x="18" y="${168 + hl * 13}" width="150" height="11" rx="3" fill="#ffd166" opacity=".7"/>` : ''}${lines(170, 5)}</svg>` });
  // science: a planet with its ring
  const a = page('<circle cx="100" cy="48" r="26" fill="#fff3c4"/><ellipse cx="100" cy="48" rx="50" ry="11" fill="none" stroke="#fff" stroke-width="4" transform="rotate(-14 100 48)"/>', 150, '#3d40a0', 1);
  // travel: hills and a sun
  const b = page('<circle cx="150" cy="34" r="16" fill="#ffd166"/><path d="M0 96 60 40l40 34 30-22 70 44z" fill="#2f6b4f"/><path d="M0 96 50 62l50 34z" fill="#3f8a66"/>', 132, '#bfe3f2');
  // food: a bowl
  const c = page('<ellipse cx="100" cy="58" rx="56" ry="12" fill="#f4d9b5"/><path d="M44 58a56 34 0 0 0 112 0z" fill="#e2733f"/><circle cx="84" cy="50" r="7" fill="#7cb342"/><circle cx="108" cy="47" r="6" fill="#ffd166"/>', 140, '#fbe9da', 3);
  // a story: a lighthouse at night
  const d = page('<circle cx="40" cy="26" r="2" fill="#fff"/><circle cx="160" cy="20" r="2" fill="#fff"/><path d="M92 96 98 30h8l6 66z" fill="#fff"/><rect x="96" y="22" width="12" height="10" fill="#ffd166"/><path d="M108 27 200 6v40z" fill="#ffd166" opacity=".35"/>', 120, '#1d2b4f');
  // ideas: shapes
  const e = page('<rect x="38" y="24" width="44" height="44" rx="8" fill="#ff7a59"/><circle cx="126" cy="48" r="24" fill="#5b5fd6"/><path d="M150 72 172 30l22 42z" fill="#ffd166"/>', 146, '#eef0fb', 0);
  return [a, b, c, d, e];
}
/**
 * The first page, as in SavDocuments, SavNotes and SavPodcasts: a bar with the language and "Sign in", the title with
 * the two buttons, a fan of article pages that open up and come forward under the pointer, six features and how it
 * works. Signing in and creating an account have a page of their own (#/signin, #/signup).
 */
export function land(root, mode, note) {
  if (/^#\/(starred|archive|highlights|feeds|tag|a|i|settings|search)\b/.test(location.hash)) sessionStorage.setItem('savreads-next', location.hash);
  const top = (...right) => h('header.ltop', brand('#/welcome'), h('div.spacer'), langButton(), appsButton(), ...right);
  document.title = 'SavReads';
  if (mode === 'signin' || mode === 'signup') {
    put(root, h('div.authp', top(), h('main.amain', h('div.stack.aw', note || null, authCard(mode))), credit()));
    return () => {};
  }
  const stage = h('div.l-stage', { 'aria-hidden': 'true' }), cards = pages().map((p, i) => h('div.l-card', { style: `--i:${i}` }, h('div.l-in', p, h('div.l-read', h('span.l-time', ['4 min', '9 min', '6 min', '12 min', '3 min'][i]), h('span.l-bar', h('i', { style: `width:${[62, 18, 85, 40, 8][i]}%` }))))));
  stage.append(...cards);
  const feat = (ic, k) => h('div.feat', icon(ic), h('h3', t(k)), h('p', t(k + '_t')));
  const step = (n, k) => h('li', h('span.num', String(n)), h('div', h('strong', t(k)), h('span.muted', t(k + '_t'))));
  put(root, h('div.landing', top(btn(t('sign_in'), { appearance: 'outline', href: '#/signin' })),
    h('main.lmain', h('section.hero', h('div.hero-t', h('a.kicker', { href: '#/signup' }, icon('file-up'), ' ', t('land_kicker')), h('h1', t('land_title')), h('p', t('land_text')), h('div.prow', primary(t('l_cta'), { size: 'lg', href: '#/signup' }), btn(t('sign_in'), { size: 'lg', appearance: 'ghost', href: '#/signin' })), h('small', t('l_small'))), stage),
      h('section.feats', feat('newspaper', 'ft_clean'), feat('glasses', 'ft_reader'), feat('highlighter', 'ft_hl'), feat('rss', 'ft_feeds'), feat('file-up', 'ft_import'), feat('shield', 'ft_private')),
      h('section.how', h('h2', t('how_title')), h('ol.steps', step(1, 'how_1'), step(2, 'how_2'), step(3, 'how_3')))), credit()));
  return heroDeck(stage, cards);
}
const centered = (root, ...kids) => put(root, h('div.wait', h('sav-card.auth', h('div.stack', kids))));
export const verify = (root, token) => centered(root, empty('mail', t('verify_title'), t('verify_text'), primary(t('verify_btn'), { onclick: async () => { signedIn(await api('auth.verify', { token })); } })));
export function reset(root, token) { const pw = h('sav-input', { label: t('new_password'), type: 'password', 'password-toggle': true, autocomplete: 'new-password', help: t('pw_hint') }); centered(root, h('h2', t('reset_title')), pw, primary(t('save'), { block: true, onclick: async () => { signedIn(await api('auth.reset', { token, password: pw.value })); } })); }
export const unverified = (root) => centered(root, empty('mail', t('unverified'), S.user.email, primary(t('resend'), { onclick: async () => { await api('auth.resend', { lang: getLang() }); toast(t('resent'), 'success'); } }), btn(t('sign_out'), { onclick: signOut })));

