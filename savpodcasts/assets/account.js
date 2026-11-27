/** Accounts (the same of SavSchedules, SavCalendar and SavNotes: one account, one session for all): preferences, signing in, the first page. */
import { btn, confirm, dialog, drop, errText, fail, h, icon, primary, put, segmented, select, toast, toggle, face, empty } from './ui.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api } from './store.js';
import { heroDeck } from './hero.js';
import { appsButton } from './office.js';
import { VERSION } from './version.js';

export const go = (x) => { if (location.hash === x) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = x; };

// ------------------------------------------------------------------ preferences (kept in the account, or in this browser)

/** The settings of SavPodcasts: kept in the account (pod.prefs), and a copy in this browser for the first page. */
export const prefs = () => { if (S.user && S.prefs) return S.prefs; try { return JSON.parse(localStorage.getItem('savpodcasts-prefs') || '{}'); } catch { return {}; } };
let sending = null, queued = null;
/** Saves the settings; quick changes in a row (a colour, a size…) leave as one request. */
export async function setPrefs(p) {
  const all = { ...prefs(), ...p };
  if (S.user) S.prefs = all;
  try { localStorage.setItem('savpodcasts-prefs', JSON.stringify(all)); } catch { /* private mode */ }
  applyTheme();
  if (!S.user) return;
  queued = all;
  if (sending) return sending;
  sending = (async () => { try { while (queued) { const x = queued; queued = null; await api('pod.prefs', { prefs: x }); } } finally { sending = null; } })();
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

export const brand = (to = '#/') => h('a.brand', { href: to }, h('img', { src: 'icons/favicon.svg', width: 38, height: 38, alt: '' }), h('span', 'Sav', h('b', 'Podcasts')));
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
  S.user = null; S.csrf = ''; S.subs = []; S.queue = []; S.prefs = null;
  window.dispatchEvent(new CustomEvent('pod-signout'));
  go('#/welcome');
}

/**
 * The search of actions (⌘J or Ctrl+J, the same in every app of SavOffice: ../assets/savoffice/savoffice.js): what this
 * screen can do, as groups [label, [[icon, label, run or '#/address', shortcut, description]…]], then the pages of the app.
 */
export function commands(...groups) {
  const item = ([icon, label, to, shortcut, description]) => ({ icon, label, shortcut, description, run: typeof to === 'function' ? to : () => { location.hash = to; } });
  const pages = S.user ? [['home', t('nav_home'), '#/'], ['compass', t('nav_discover'), '#/discover'], ['library', t('nav_library'), '#/library'], ['list-music', t('nav_queue'), '#/queue'], ['settings', t('settings'), '#/settings'], ['sparkles', t('changelog'), '#/changelog'], ['log-out', t('sign_out'), () => signOut()]]
    : [['', t('sign_in'), '#/signin'], ['', t('sign_up'), '#/signup'], ['sparkles', t('changelog'), '#/changelog']];
  window.SavOffice?.commands([...groups.filter(Boolean).map(([label, list]) => ({ label, items: list.filter(Boolean).map(item) })), { label: 'SavPodcasts', items: pages.map(item) }]);
}

// ------------------------------------------------------------------ signing in

export function signedIn(r) {
  setUser(r.user, r.csrf);
  const next = sessionStorage.getItem('savpodcasts-next');
  sessionStorage.removeItem('savpodcasts-next');
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

/** Covers of podcasts for the fan of the first page: drawn, not real, the same in both themes. */
function covers() {
  const svgEl = (inner, bg) => h('div.lp-svg', { style: `background:${bg}`, html: `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">${inner}</svg>` });
  const bars = (x, y, n, w, c, o = 1) => { let s = ''; for (let i = 0; i < n; i++) { const hh = 6 + Math.abs(Math.sin(i * 1.7 + x)) * 26; s += `<rect x="${x + i * (w + 3)}" y="${y - hh / 2}" width="${w}" height="${hh}" rx="${w / 2}" fill="${c}" opacity="${o}"/>`; } return s; };
  const words = (y, c, w1 = 120, w2 = 80) => `<rect x="20" y="${y}" width="${w1}" height="13" rx="4" fill="${c}"/><rect x="20" y="${y + 20}" width="${w2}" height="8" rx="4" fill="${c}" opacity=".6"/>`;
  // a talk show: two voices in conversation
  const talk = svgEl(`<circle cx="70" cy="80" r="44" fill="#ffd166"/><circle cx="128" cy="96" r="38" fill="#ff7a59" opacity=".92"/>${words(150, '#fff')}`, 'linear-gradient(140deg,#2d3e63,#151e33)');
  // history: an old arch and the sun behind it
  const story = svgEl(`<circle cx="140" cy="62" r="30" fill="#f7c873"/><path d="M30 140V80a40 40 0 0 1 80 0v60h-20V82a20 20 0 0 0-40 0v58z" fill="#fff6e6"/><rect x="0" y="140" width="200" height="60" fill="#5a2f1c"/>${words(158, '#fff6e6', 100, 70)}`, 'linear-gradient(170deg,#c9673c,#8e3b22)');
  // science: an orbit
  const sci = svgEl(`<ellipse cx="100" cy="82" rx="70" ry="26" fill="none" stroke="#9ff0d6" stroke-width="5" transform="rotate(-24 100 82)"/><circle cx="100" cy="82" r="22" fill="#e9fff8"/><circle cx="156" cy="56" r="7" fill="#ffd166"/>${words(150, '#e9fff8', 110, 64)}`, 'linear-gradient(150deg,#0f5d58,#0a2f33)');
  // news: a waveform
  const news = svgEl(`${bars(24, 86, 15, 7, '#fff')}<rect x="20" y="20" width="44" height="18" rx="9" fill="#ff4d4d"/><text x="42" y="33" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#fff" text-anchor="middle">LIVE</text>${words(150, '#fff', 128, 90)}`, 'linear-gradient(160deg,#4b2a83,#24113f)');
  // stories at night: moon and stars
  const night = svgEl(`<circle cx="120" cy="74" r="40" fill="#fdf3c5"/><circle cx="138" cy="62" r="36" fill="#1d2b4f"/><circle cx="46" cy="44" r="2.5" fill="#fff"/><circle cx="64" cy="96" r="2" fill="#fff"/><circle cx="168" cy="120" r="2.5" fill="#fff"/><circle cx="30" cy="118" r="1.8" fill="#fff"/>${words(150, '#fdf3c5', 96, 120)}`, 'linear-gradient(180deg,#24365f,#111a33)');
  return [talk, story, sci, news, night];
}
/**
 * The first page, as in SavDocuments and SavNotes: a bar with the language and "Sign in", the title with the two
 * buttons, a fan of covers that open up and come forward under the pointer, six features and how it works.
 * Signing in and creating an account have a page of their own (#/signin, #/signup).
 */
export function land(root, mode, note) {
  if (/^#\/(discover|library|queue|p|e|settings)\b/.test(location.hash)) sessionStorage.setItem('savpodcasts-next', location.hash);
  const top = (...right) => h('header.ltop', brand('#/welcome'), h('div.spacer'), langButton(), appsButton(), ...right);
  document.title = 'SavPodcasts';
  if (mode === 'signin' || mode === 'signup') {
    put(root, h('div.authp', top(), h('main.amain', h('div.stack.aw', note || null, authCard(mode))), credit()));
    return () => {};
  }
  const stage = h('div.l-stage', { 'aria-hidden': 'true' }), cards = covers().map((p, i) => h('div.l-card', { style: `--i:${i}` }, h('div.l-in', p, h('div.l-play', h('span.l-pp'), h('span.l-bar', h('i', { style: `width:${[62, 18, 85, 40, 8][i]}%` }))))));
  stage.append(...cards);
  const feat = (ic, k) => h('div.feat', icon(ic), h('h3', t(k)), h('p', t(k + '_t')));
  const step = (n, k) => h('li', h('span.num', String(n)), h('div', h('strong', t(k)), h('span.muted', t(k + '_t'))));
  put(root, h('div.landing', top(btn(t('sign_in'), { appearance: 'outline', href: '#/signin' })),
    h('main.lmain', h('section.hero', h('div.hero-t', h('span.kicker', icon('grip'), ' ', t('land_kicker')), h('h1', t('land_title')), h('p', t('land_text')), h('div.prow', primary(t('l_cta'), { size: 'lg', href: '#/signup' }), btn(t('sign_in'), { size: 'lg', appearance: 'ghost', href: '#/signin' })), h('small', t('l_small'))), stage),
      h('section.feats', feat('rss', 'ft_open'), feat('compass', 'ft_find'), feat('history', 'ft_resume'), feat('list-music', 'ft_queue'), feat('headphones', 'ft_player'), feat('shield', 'ft_private')),
      h('section.how', h('h2', t('how_title')), h('ol.steps', step(1, 'how_1'), step(2, 'how_2'), step(3, 'how_3')))), credit()));
  return heroDeck(stage, cards);
}
const centered = (root, ...kids) => put(root, h('div.wait', h('sav-card.auth', h('div.stack', kids))));
export const verify = (root, token) => centered(root, empty('mail', t('verify_title'), t('verify_text'), primary(t('verify_btn'), { onclick: async () => { signedIn(await api('auth.verify', { token })); } })));
export function reset(root, token) { const pw = h('sav-input', { label: t('new_password'), type: 'password', 'password-toggle': true, autocomplete: 'new-password', help: t('pw_hint') }); centered(root, h('h2', t('reset_title')), pw, primary(t('save'), { block: true, onclick: async () => { signedIn(await api('auth.reset', { token, password: pw.value })); } })); }
export const unverified = (root) => centered(root, empty('mail', t('unverified'), S.user.email, primary(t('resend'), { onclick: async () => { await api('auth.resend', { lang: getLang() }); toast(t('resent'), 'success'); } }), btn(t('sign_out'), { onclick: signOut })));

