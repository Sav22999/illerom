/** Accounts (the same of SavSchedules and the other apps: one account, one session for all): preferences, signing in, the first page. */
import { btn, dialog, drop, errText, h, icon, primary, put, segmented, toast, face, empty } from './ui.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api } from './store.js';
import { heroDeck } from './hero.js';
import { appsButton } from './office.js';
import { VERSION } from './version.js';

export const go = (x) => { if (location.hash === x) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = x; };

// ------------------------------------------------------------------ preferences (kept in the account, or in this browser)

/** The look of the app: kept in the account (ml.prefs), and a copy in this browser for the first page. */
export const prefs = () => { if (S.user && S.prefs) return S.prefs; try { return JSON.parse(localStorage.getItem('savmail-prefs') || '{}'); } catch { return {}; } };
let sending = null, queued = null;
/** Saves the preferences; quick changes in a row leave as one request. */
export async function setPrefs(p) {
  const all = { ...prefs(), ...p };
  if (S.user) S.prefs = all;
  try { localStorage.setItem('savmail-prefs', JSON.stringify(all)); } catch { /* private mode */ }
  applyTheme();
  if (!S.user) return;
  queued = all;
  if (sending) return sending;
  sending = (async () => { try { while (queued) { const x = queued; queued = null; await api('ml.prefs', { prefs: x }); } } finally { sending = null; } })();
  return sending;
}
export const applyTheme = () => { window.Sav?.setMode(prefs().theme || 'auto'); document.documentElement.dataset.density = prefs().density || 'cozy'; };
export function setUser(u, csrf) {
  S.user = u;
  if (csrf) S.csrf = csrf;
  if (u) setLang(u.lang);
  applyTheme();
}

// ------------------------------------------------------------------ pieces of every page

export const brand = (to = '#/') => h('a.brand', { href: to }, h('img', { src: 'icons/favicon.svg', width: 38, height: 38, alt: '' }), h('span', 'Sav', h('b', 'Mail')));
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
  return h('div.umenu', appsButton(), drop(av, [{ head: u.email }, ['settings', t('settings'), () => go('#/settings')], S.vault === 'open' ? ['lock', t('lock_device'), lockDevice] : null, '-', ['log-out', t('sign_out'), signOut]], { placement: 'bottom-end', label: u.name }));
}
export async function signOut() {
  await api('auth.logout', {}).catch(() => {});
  S.user = null; S.csrf = ''; S.accounts = []; S.vault = null; S.prefs = null;
  go('#/welcome');
}
/** This browser forgets the key of the vault: the next time a password of a mailbox (or the recovery code) opens it again. */
export async function lockDevice() {
  await api('ml.lock', {});
  S.vault = 'locked'; S.accounts = [];
  toast(t('locked_now'), 'success');
  go('#/');
}

/**
 * The search of actions (⌘J or Ctrl+J, the same in every app of SavOffice: ../assets/savoffice/savoffice.js): what this
 * screen can do, as groups [label, [[icon, label, run or '#/address', shortcut, description]…]], then the pages of the app.
 */
export function commands(...groups) {
  const item = ([icon, label, to, shortcut, description]) => ({ icon, label, shortcut, description, run: typeof to === 'function' ? to : () => { location.hash = to; } });
  const pages = S.user ? [['inbox', t('mail'), '#/'], ['settings', t('settings'), '#/settings'], ['sparkles', t('changelog'), '#/changelog'], ['log-out', t('sign_out'), () => signOut()]]
    : [['', t('sign_in'), '#/signin'], ['', t('sign_up'), '#/signup'], ['sparkles', t('changelog'), '#/changelog']];
  window.SavOffice?.commands([...groups.filter(Boolean).map(([label, list]) => ({ label, items: list.filter(Boolean).map(item) })), { label: 'SavMail', items: pages.map(item) }]);
}

// ------------------------------------------------------------------ signing in

export function signedIn(r) {
  setUser(r.user, r.csrf);
  const next = sessionStorage.getItem('savmail-next');
  sessionStorage.removeItem('savmail-next');
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
    // SavAccount first: one press and the mail is there (the account of SavOffice is made with it)
    put(inner, sav ? [sav, h('p.muted.small.center', t('google_terms')), h('sav-divider', t('or'))] : null,
      segmented(t('sign_in'), mode, [['signin', '=' + t('sign_in'), t('sign_in')], ['signup', '=' + t('sign_up'), t('sign_up')]], (v) => { mode = v; draw(); }, { class: 'wide' }), form,
      mode === 'signin' ? btn(t('forgot'), { size: 'sm', appearance: 'ghost', onclick: () => { forgot(); } }) : !S.config.mailReady && S.config.installed ? h('p.muted.small', t('mail_off')) : null);
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

const svgEl = (inner, bg = '#fff') => h('div.lp-svg', { style: `background:${bg}`, html: `<svg viewBox="0 0 150 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">${inner}</svg>` });
const bar = (x, y, w, c = '#2b2b30', o = .5, hh = 4) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="2" fill="${c}" opacity="${o}"/>`;
const who = (x, y, c, l) => `<circle cx="${x}" cy="${y}" r="9" fill="${c}"/><text x="${x}" y="${y + 3.5}" font-size="10" font-family="Inter,Arial" font-weight="700" fill="#fff" text-anchor="middle">${l}</text>`;
const head = (c, l, w) => who(18, 20, c, l) + bar(32, 14, w, '#1f1f22', .8, 5) + bar(32, 23, w * .7, '#2b2b30', .35, 3.5) + '<path d="M10 38H140" stroke="#e7e1d3" stroke-width="1"/>';
/** Small messages for the fan of the first page: drawn, not real, the same in both themes. */
function letters() {
  const hello = svgEl(head('#0f6e56', 'G', 58) + bar(12, 52, 120, '#1f1f22', .8, 6) + bar(12, 70, 126) + bar(12, 80, 118) + bar(12, 90, 122) + bar(12, 100, 70)
    + bar(12, 118, 124) + bar(12, 128, 110) + bar(12, 138, 60) + '<path d="M14 168c8-10 16 6 24-4s12 4 18-2" fill="none" stroke="#1d4e89" stroke-width="2" stroke-linecap="round"/>');
  const photo = svgEl(head('#a1328c', 'M', 46) + bar(12, 52, 96, '#1f1f22', .8, 6) + '<rect x="12" y="66" width="126" height="78" rx="6" fill="#cdeaf7"/><circle cx="104" cy="88" r="10" fill="#ffd166"/><path d="M12 144 52 100l26 26 18-14 42 32Z" fill="#0f6e56" opacity=".7"/>' + bar(12, 156, 120) + bar(12, 166, 84));
  const invoice = svgEl(head('#1d4e89', 'A', 52) + bar(12, 52, 110, '#1f1f22', .8, 6) + bar(12, 70, 124) + bar(12, 80, 100)
    + '<rect x="12" y="98" width="70" height="22" rx="6" fill="#f2eadd"/><rect x="18" y="104" width="10" height="10" rx="2" fill="#b3261e"/>' + bar(32, 106, 42, '#1f1f22', .55, 3.5) + bar(12, 134, 120) + bar(12, 144, 96));
  const invite = svgEl(head('#c45a0c', 'L', 60) + bar(12, 52, 86, '#1f1f22', .8, 6) + '<rect x="12" y="66" width="126" height="64" rx="8" fill="#fff3d6" stroke="#f0d9a6"/><rect x="22" y="76" width="30" height="34" rx="5" fill="#fff" stroke="#e3c98f"/><rect x="22" y="76" width="30" height="9" rx="4" fill="#b3261e"/>'
    + '<text x="37" y="104" font-size="13" font-family="Inter,Arial" font-weight="700" fill="#2a1f14" text-anchor="middle">12</text>' + bar(60, 82, 64, '#1f1f22', .7, 4.5) + bar(60, 94, 50) + bar(60, 104, 40) + '<rect x="12" y="140" width="56" height="16" rx="8" fill="#8f6500"/><rect x="74" y="140" width="56" height="16" rx="8" fill="none" stroke="#c9bd9f"/>');
  const list = svgEl([0, 1, 2, 3, 4].map((i) => { const y = 14 + i * 37, c = ['#8f6500', '#0b7a87', '#5b4cf0', '#b3261e', '#4d7c0f'][i]; return who(18, y + 10, c, 'ABCDE'[i]) + bar(32, y + 4, 60 + (i % 3) * 12, '#1f1f22', i < 2 ? .85 : .45, 4.5) + bar(32, y + 14, 92, '#2b2b30', .3, 3.5) + (i < 2 ? `<circle cx="138" cy="${y + 10}" r="3.5" fill="#8f6500"/>` : '') + `<path d="M10 ${y + 30}H140" stroke="#efe9dc"/>`; }).join(''), '#fffdf8');
  return [list, invite, hello, invoice, photo];
}
/**
 * The first page, as in SavDocuments and SavNotes: a bar with the language and "Sign in", the title with the two buttons,
 * a fan of small messages that open up and come forward under the pointer, six features and how it works.
 * Signing in and creating an account have a page of their own (#/signin, #/signup).
 */
export function land(root, mode, note) {
  if (/^#\/(m|settings|compose)\b/.test(location.hash)) sessionStorage.setItem('savmail-next', location.hash);
  const top = (...right) => h('header.ltop', brand('#/welcome'), h('div.spacer'), langButton(), appsButton(), ...right);
  document.title = 'SavMail';
  if (mode === 'signin' || mode === 'signup') {
    put(root, h('div.authp', top(), h('main.amain', h('div.stack.aw', note || null, authCard(mode))), credit()));
    return () => {};
  }
  const stage = h('div.l-stage', { 'aria-hidden': 'true' }), cards = letters().map((p, i) => h('div.l-card', { style: `--i:${i}` }, h('div.l-in', p)));
  // not pages: a small window of SavMail at work (../assets/savoffice/savoffice.js), the fan of pages only if that script is missing
  const scene = window.SavOffice?.scene?.('mail');
  if (scene) stage.replaceChildren(scene); else stage.append(...cards);
  const feat = (ic, k) => h('div.feat', icon(ic), h('h3', t(k)), h('p', t(k + '_t')));
  const step = (n, k) => h('li', h('span.num', String(n)), h('div', h('strong', t(k)), h('span.muted', t(k + '_t'))));
  put(root, h('div.landing', top(btn(t('sign_in'), { appearance: 'outline', href: '#/signin' })),
    h('main.lmain', h('section.hero', h('div.hero-t', h('span.kicker', icon('grip'), ' ', t('land_kicker')), h('h1', t('land_title')), h('p', t('land_text')), h('div.prow', primary(t('l_cta'), { size: 'lg', href: '#/signin' }), btn(t('sign_up'), { size: 'lg', appearance: 'ghost', href: '#/signup' })), h('small', t('l_small'))), stage),
      h('section.feats', feat('inbox', 'ft_all'), feat('lock', 'ft_lock'), feat('image-off', 'ft_track'), feat('paperclip', 'ft_write'), feat('server', 'ft_yours'), feat('shield', 'ft_free')),
      h('section.how', h('h2', t('how_title')), h('ol.steps', step(1, 'how_1'), step(2, 'how_2'), step(3, 'how_3')))), credit()));
  return scene ? () => {} : heroDeck(stage, cards);
}
const centered = (root, ...kids) => put(root, h('div.wait', h('sav-card.auth', h('div.stack', kids))));
export const verify = (root, token) => centered(root, empty('mail', t('verify_title'), t('verify_text'), primary(t('verify_btn'), { onclick: async () => { signedIn(await api('auth.verify', { token })); } })));
export function reset(root, token) { const pw = h('sav-input', { label: t('new_password'), type: 'password', 'password-toggle': true, autocomplete: 'new-password', help: t('pw_hint') }); centered(root, h('h2', t('reset_title')), pw, primary(t('save'), { block: true, onclick: async () => { signedIn(await api('auth.reset', { token, password: pw.value })); } })); }
export const unverified = (root) => centered(root, empty('mail', t('unverified'), S.user.email, primary(t('resend'), { onclick: async () => { await api('auth.resend', { lang: getLang() }); toast(t('resent'), 'success'); } }), btn(t('sign_out'), { onclick: signOut })));
