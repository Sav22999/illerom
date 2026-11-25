/** Landing page, sign-in, registration, email confirmation, new password. */
import { state, api, get, h, icon, btn, go, oops, errText, ok, isApp, $ } from './core.js';
import { t, lang, setLang } from './i18n.js';
import { signedIn, applyMode } from './main.js';
import { slideNode } from './render.js';
import { context } from './themes.js';
import { makeSlide } from './layouts.js';

export const logo = (size = 34) => h('img', { src: 'icons/favicon.svg', width: size, height: size, alt: '' });
export const brand = () => h('a.brand', { href: './', 'data-go': true }, logo(), h('span', 'Sav', h('b', 'Presentations')));
export const credit = () => h('footer.credit', h('a', { href: 'terms.php', target: '_blank' }, t('terms')), h('a', { href: 'privacy.php', target: '_blank' }, t('privacy')), h('a', { href: 'https://github.com/Sav22999/illerom/tree/main/savpresentations', target: '_blank', rel: 'noopener' }, t('source')), h('span', t('developed_by'), ' ', h('a.sign', { href: 'https://www.saveriomorelli.com/', target: '_blank', rel: 'noopener' }, 'Saverio Morelli')));
export const langButton = () => h('sav-button', { appearance: 'ghost', variant: 'neutral', size: 'sm', icon: 'languages', onclick: async () => { const l = lang() === 'it' ? 'en' : 'it'; setLang(l); localStorage.setItem('sp-lang', l); if (state.user) { try { const r = await api('auth.profile', { lang: l }); state.user = r.user; } catch { /* only the language */ } } dispatchEvent(new PopStateEvent('popstate')); } }, lang() === 'it' ? 'English' : 'Italiano');

const topBar = (...right) => h('header.ltop', brand(), h('div.spacer'), langButton(), ...right);

export function landing(app) {
  document.body.classList.add('landing');
  const demo = h('div.l-stage');
  const themes = ['aurora', 'editorial', 'bauhaus', 'cotton', 'ocean', 'playful'];
  const slides = themes.map((id, i) => {
    const ctx = context({ format: { w: 1280, h: 720 }, theme: { id }, opts: {} });
    const lay = ['cover', 'cover', 'cover', 'quote', 'section', 'cover'][i];
    const n = slideNode(makeSlide(lay, ctx, { title: t('l_slide' + (i + 1)), subtitle: 'SavPresentations', quote: t('l_slide' + (i + 1)), author: '', big: '100%', body: t('l_slide' + (i + 1)), label: '' }).d, ctx, { mode: 'thumb' });
    const w = h('div.l-card', { style: `--i:${i}` }, n);
    return w;
  });
  demo.append(...slides);
  const fit = () => slides.forEach((w) => { w.firstChild.style.transform = `scale(${w.clientWidth / 1280})`; });
  const ro = new ResizeObserver(fit);
  slides.forEach((s) => ro.observe(s));
  const feat = (ic, k) => h('div.feat', icon(ic), h('h3', t('f_' + k)), h('p', t('f_' + k + '_t')));
  app.append(topBar(btn(t('sign_in'), () => go('?signin=login'), { appearance: 'outline', variant: 'neutral' })),
    h('main.lmain', h('section.hero', h('div.hero-t', h('h1', t('l_title')), h('p', t('l_text')), h('div.row', btn(t('l_cta'), () => go('?signin=register'), { size: 'lg' }), btn(t('sign_in'), () => go('?signin=login'), { size: 'lg', appearance: 'ghost', variant: 'neutral' })), h('small', t('l_small'))), demo),
      h('section.feats', feat('users', 'live'), feat('layout-template', 'themes'), feat('images', 'search'), feat('shield', 'share'), feat('sticky-note', 'notes'), feat('download', 'files'))), credit());
  return { leave: () => ro.disconnect() };
}

function shell(app, ...kids) {
  document.body.classList.add('authp');
  app.append(topBar(), h('main.amain', h('sav-card.acard', { appearance: 'elevated' }, ...kids)), credit());
}

let googleLoading;
const loadGoogle = () => (googleLoading ||= new Promise((r, no) => { const s = h('script', { src: 'https://accounts.google.com/gsi/client', async: true }); s.onload = r; s.onerror = no; document.head.append(s); }));

async function google(box, terms) {
  const id = state.config.googleClientId;
  if (!id) return;
  const done = async (credential) => {
    const send = async (accept) => api('auth.google', { credential, acceptTerms: accept, lang: lang() });
    try { signedIn(await send(terms?.checked)); } catch (e) {
      if (e.code !== 'needs_signup') return failedLogin(e);
      // a new account: the terms first
      const c = h('sav-checkbox', termsText());
      box.replaceChildren(h('p', t('g_new', { name: e.data.name || '' })), c, btn(t('create_account'), async () => { if (!c.checked) return oops({ code: 'terms_required', __proto__: Object.getPrototypeOf(e) }); try { signedIn(await send(true)); } catch (x) { failedLogin(x); } }, { block: true }));
    }
  };
  if (isApp && window.SavPresentationsAndroid?.googleSignIn) {
    window.SavPresentationsNative = { ...window.SavPresentationsNative, result: (kind, value, err) => { if (kind !== 'google') return; if (value) done(value); else if (err !== 'cancelled') oops({ code: 'google_token' }); } };
    box.append(btn(t('google'), () => window.SavPresentationsAndroid.googleSignIn(id), { block: true, appearance: 'outline', variant: 'neutral' }));
    return;
  }
  try {
    await loadGoogle();
    window.google.accounts.id.initialize({ client_id: id, callback: (r) => done(r.credential), ux_mode: 'popup' });
    const slot = h('div.gbtn');
    box.append(slot);
    window.google.accounts.id.renderButton(slot, { theme: 'outline', size: 'large', width: Math.min(340, box.clientWidth || 340), locale: lang(), shape: 'pill', text: 'continue_with' });
  } catch { /* blocked or offline: the password still works */ }
}

const termsText = () => h('span', t('accept_1'), ' ', h('a', { href: 'terms.php', target: '_blank' }, t('terms')), ' ', t('accept_2'), ' ', h('a', { href: 'privacy.php', target: '_blank' }, t('privacy')), '. ', t('accept_3'));
function failedLogin(e) {
  const box = $('.aerr');
  const msg = e.code === 'blocked' && e.data.reason ? t('err_blocked_why', { reason: t('reason_' + e.data.reason) }) : errText(e);
  if (box) { box.replaceChildren(h('sav-alert', { variant: 'danger' }, msg)); box.scrollIntoView({ block: 'nearest' }); } else oops(e);
}

export function authScreen(app, { mode = 'login', note = '' } = {}) {
  const register = mode === 'register', forgot = mode === 'forgot';
  const name = h('sav-input', { label: t('name'), autocomplete: 'name', maxlength: 80 });
  const email = h('sav-input', { label: t('email'), type: 'email', autocomplete: 'username', inputmode: 'email', maxlength: 190 });
  const pw = register ? h('sav-password', { label: t('password'), autocomplete: 'new-password', 'min-uppercase': 0, 'min-digits': 0, 'min-lowercase': 0, labels: t('pw_labels') }) : h('sav-input', { label: t('password'), type: 'password', 'password-toggle': true, autocomplete: 'current-password' });
  const terms = h('sav-checkbox', termsText());
  const submit = btn(forgot ? t('send_link') : register ? t('create_account') : t('sign_in'), () => send(), { block: true, size: 'lg' });
  const gbox = h('div.gbox');
  const body = h('div.aform', { onkeydown: (e) => { if (e.key === 'Enter') send(); } },
    h('h1', forgot ? t('forgot') : register ? t('register_title') : t('login_title')), note && h('sav-alert', note), h('div.aerr'),
    register && name, email, !forgot && pw, register && terms, submit,
    !forgot && state.config.googleClientId && h('div.or', h('span', t('or'))), !forgot && gbox,
    h('div.alinks', mode === 'login' || !mode ? [h('a', { href: '?signin=forgot', 'data-go': true }, t('forgot_q')), h('a', { href: '?signin=register', 'data-go': true }, t('no_account'))] : h('a', { href: '?signin=login', 'data-go': true }, t('have_account'))));
  const send = async () => {
    if (submit.loading) return;
    submit.loading = true;
    try {
      if (forgot) { await api('auth.forgot', { email: email.value, lang: lang() }); body.replaceChildren(h('h1', t('check_mail')), h('p', t('forgot_sent')), h('div.alinks', h('a', { href: '?signin=login', 'data-go': true }, t('sign_in')))); } else if (register) {
        await api('auth.register', { name: name.value, email: email.value, password: pw.value, acceptTerms: terms.checked, lang: lang() });
        body.replaceChildren(h('div.bigicon', icon('mail')), h('h1', t('check_mail')), h('p', t('verify_sent', { email: email.value })), h('div.alinks', h('a', { href: '?signin=login', 'data-go': true }, t('sign_in'))));
      } else signedIn(await api('auth.login', { email: email.value, password: pw.value }));
    } catch (e) { failedLogin(e); }
    submit.loading = false;
  };
  shell(app, body);
  if (!forgot) google(gbox, register ? terms : null);
  setTimeout(() => (register ? name : email).focus?.(), 80);
}

export function confirmScreen(app) {
  shell(app, h('div.aform', h('div.bigicon', icon('mail')), h('h1', t('check_mail')), h('p', t('verify_sent', { email: state.user.email })), h('div.aerr'),
    btn(t('resend'), async (e) => { try { await api('auth.resend', { lang: lang() }); ok(t('sent')); } catch (x) { oops(x); } }, { block: true }),
    btn(t('verified_done'), () => location.assign('./'), { block: true, appearance: 'outline', variant: 'neutral' }), btn(t('sign_out'), logout, { block: true, appearance: 'ghost', variant: 'neutral' })));
}
export function verifyScreen(app, token) {
  shell(app, h('div.aform', h('div.bigicon', icon('mail')), h('h1', t('verify_title')), h('p', t('verify_text')), h('div.aerr'), btn(t('verify_button'), async () => { try { history.replaceState(null, '', './'); signedIn(await api('auth.verify', { token })); ok(t('verified')); } catch (e) { failedLogin(e); } }, { block: true, size: 'lg' })));
}
export function resetScreen(app, token) {
  const pw = h('sav-password', { label: t('new_password'), autocomplete: 'new-password', 'min-uppercase': 0, 'min-digits': 0, 'min-lowercase': 0, labels: t('pw_labels') });
  shell(app, h('div.aform', h('h1', t('reset_title')), h('div.aerr'), pw, btn(t('save'), async () => { try { const r = await api('auth.reset', { token, password: pw.value }); history.replaceState(null, '', './'); signedIn(r); } catch (e) { failedLogin(e); } }, { block: true, size: 'lg' })));
}
export async function logout() {
  try { await api('auth.logout', {}); } catch { /* the cookie goes anyway */ }
  state.user = null; state.csrf = '';
  window.google?.accounts?.id?.disableAutoSelect?.();
  go('./');
}
