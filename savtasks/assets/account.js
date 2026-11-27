/** Accounts (the same of SavSchedules and SavCalendar: one account, one session for all): preferences, signing in, the first page. */
import { btn, confirm, dialog, drop, errText, fail, h, icon, primary, put, segmented, select, toast, toggle, face, empty } from './ui.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api } from './store.js';
import { heroDeck } from './hero.js';
import { appsButton } from './office.js';
import { VERSION } from './version.js';

export const go = (x) => { if (location.hash === x) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = x; };

// ------------------------------------------------------------------ preferences (kept in the account, or in this browser)

/** The settings of SavTasks: kept in the account (tasks.prefs), and a copy in this browser for the first page. */
export const prefs = () => { if (S.user && S.prefs) return S.prefs; try { return JSON.parse(localStorage.getItem('savtasks-prefs') || '{}'); } catch { return {}; } };
export async function setPrefs(p) {
  const all = { ...prefs(), ...p };
  if (S.user) S.prefs = all;
  try { localStorage.setItem('savtasks-prefs', JSON.stringify(all)); } catch { /* private mode */ }
  applyTheme();
  if (S.user) await api('tasks.prefs', { prefs: all });
}
export const applyTheme = () => window.Sav?.setMode(prefs().theme || 'auto');
export function setUser(u, csrf) {
  S.user = u;
  if (csrf) S.csrf = csrf;
  if (u) setLang(u.lang);
  applyTheme();
}

// ------------------------------------------------------------------ pieces of every page

export const brand = (to = '#/') => h('a.brand', { href: to }, h('img', { src: 'icons/favicon.svg', width: 38, height: 38, alt: '' }), h('span', 'Sav', h('b', 'Tasks')));
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
  return h('div.umenu', appsButton(), drop(av, [{ head: u.email }, ['settings', t('settings'), () => go('#/settings')], ['keyboard', t('shortcuts'), () => import('./tasks.js').then((m) => m.shortcutsDialog())], '-',
    ['calendar', t('open_calendar'), () => { location.href = S.calendarUrl; }], ['vote', t('open_schedules'), () => { location.href = S.schedulesUrl; }], '-', ['log-out', t('sign_out'), signOut]], { placement: 'bottom-end', label: u.name }));
}
export async function signOut() {
  await api('auth.logout', {}).catch(() => {});
  S.user = null; S.csrf = ''; S.lists = []; S.tasks = []; S.prefs = {}; S.ready = false;
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
  window.SavOffice?.commands([...groups.filter(Boolean).map(([label, list]) => ({ label, items: list.filter(Boolean).map(item) })), { label: 'SavTasks', items: pages.map(item) }]);
}

// ------------------------------------------------------------------ signing in

export function signedIn(r) {
  setUser(r.user, r.csrf);
  const next = sessionStorage.getItem('savtasks-next');
  sessionStorage.removeItem('savtasks-next');
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

const C = { teal: '#0b7a87', blue: '#1f56d1', red: '#c93a2f', green: '#0f8a63', amber: '#c27a06', violet: '#6a2cf0', pink: '#c2307a' };
/** Small pages of lists and boards for the fan of the first page: drawn, not real, the same in both themes. */
function pages() {
  const bar = (title, c = C.teal) => h('div.lp-bar', h('i.lp-dot', { style: `background:${c}` }), h('b', title));
  const row = (done, w, c, chip) => h('div.lp-row' + (done ? '.done' : ''), h('i.lp-box', { style: `--c:${c}` }), h('span', { style: `width:${w}%` }), chip ? h('em', { style: `--c:${chip}` }) : null);
  // a list with a few things ticked
  const list = h('div.lp', bar(t('p_list')), row(true, 62, C.teal), row(false, 74, C.red, C.red), row(false, 48, C.amber), row(true, 56, C.teal), row(false, 66, C.blue, C.blue), row(false, 40, C.teal));
  // a board with three columns
  const card = (c, w) => h('div.lp-card', { style: `--c:${c}` }, h('span', { style: `width:${w}%` }));
  const board = h('div.lp', bar(t('p_board'), C.violet), h('div.lp-board', h('div.lp-col', h('small', t('p_todo')), card(C.blue, 70), card(C.red, 50), card(C.green, 80)), h('div.lp-col', h('small', t('p_doing')), card(C.amber, 60)), h('div.lp-col', h('small', t('p_done')), card(C.teal, 66), card(C.teal, 44))));
  // today, with what is late
  const today = h('div.lp', bar(t('p_today'), C.amber), h('div.lp-sec', t('p_late')), row(false, 58, C.red), h('div.lp-sec', t('today')), row(false, 70, C.teal), row(false, 52, C.blue), row(true, 64, C.teal));
  // a reminder
  const remind = h('div.lp.lp-remind', h('div.lp-bell', icon('bell')), h('b', t('p_remind')), h('div.lp-time', '09:30'));
  // a task that lands in the calendar
  const sync = h('div.lp.lp-sync', h('div.lp-ticket', h('small', 'SavTasks'), h('strong', t('p_task')), h('i')), h('div.lp-arrow', icon('arrow-right')), h('div.lp-mini', h('i'), h('i.on'), h('i')));
  return [remind, sync, board, today, list];
}
/**
 * The first page, as in the other apps of SavOffice: a bar with the language and "Sign in", the title with the two
 * buttons, a fan of small lists and boards that open up and come forward under the pointer, six features and how it works.
 * Signing in and creating an account have a page of their own (#/signin, #/signup).
 */
export function land(root, mode, note) {
  if (/^#\/(today|upcoming|inbox|starred|done|schedules|l|t|tag|settings)\b/.test(location.hash)) sessionStorage.setItem('savtasks-next', location.hash);
  const top = (...right) => h('header.ltop', brand('#/welcome'), h('div.spacer'), langButton(), appsButton(), ...right);
  document.title = 'SavTasks';
  if (mode === 'signin' || mode === 'signup') {
    put(root, h('div.authp', top(), h('main.amain', h('div.stack.aw', note || null, authCard(mode))), credit()));
    return () => {};
  }
  const stage = h('div.l-stage', { 'aria-hidden': 'true' }), cards = pages().map((p, i) => h('div.l-card', { style: `--i:${i}` }, h('div.l-in', p)));
  // not pages: a small window of SavTasks at work (../assets/savoffice/savoffice.js), the fan of pages only if that script is missing
  const scene = window.SavOffice?.scene?.('tasks');
  if (scene) stage.replaceChildren(scene); else stage.append(...cards);
  const feat = (ic, k) => h('div.feat', icon(ic), h('h3', t(k)), h('p', t(k + '_t')));
  const step = (n, k) => h('li', h('span.num', String(n)), h('div', h('strong', t(k)), h('span.muted', t(k + '_t'))));
  put(root, h('div.landing', top(btn(t('sign_in'), { appearance: 'outline', href: '#/signin' })),
    h('main.lmain', h('section.hero', h('div.hero-t', h('span.kicker', icon('grip'), ' ', t('land_kicker')), h('h1', t('land_title')), h('p', t('land_text')), h('div.prow', primary(t('l_cta'), { size: 'lg', href: '#/signup' }), btn(t('sign_in'), { size: 'lg', appearance: 'ghost', href: '#/signin' })), h('small', t('l_small'))), stage),
      h('section.feats', feat('list-todo', 'ft_lists'), feat('square-kanban', 'ft_board'), feat('bell', 'ft_remind'), feat('calendar', 'ft_cal'), feat('vote', 'ft_sch'), feat('shield', 'ft_free')),
      h('section.how', h('h2', t('how_title')), h('ol.steps', step(1, 'how_1'), step(2, 'how_2'), step(3, 'how_3')))), credit()));
  return scene ? () => {} : heroDeck(stage, cards);
}
const centered = (root, ...kids) => put(root, h('div.wait', h('sav-card.auth', h('div.stack', kids))));
export const verify = (root, token) => centered(root, empty('mail', t('verify_title'), t('verify_text'), primary(t('verify_btn'), { onclick: async () => { signedIn(await api('auth.verify', { token })); } })));
export function reset(root, token) { const pw = h('sav-input', { label: t('new_password'), type: 'password', 'password-toggle': true, autocomplete: 'new-password', help: t('pw_hint') }); centered(root, h('h2', t('reset_title')), pw, primary(t('save'), { block: true, onclick: async () => { signedIn(await api('auth.reset', { token, password: pw.value })); } })); }
export const unverified = (root) => centered(root, empty('mail', t('unverified'), S.user.email, primary(t('resend'), { onclick: async () => { await api('auth.resend', { lang: getLang() }); toast(t('resent'), 'success'); } }), btn(t('sign_out'), { onclick: signOut })));

