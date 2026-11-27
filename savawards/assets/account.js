/** Accounts: signing in (email and password with a confirmed address, or SavAccount; no Google), the account page, suggestions. */
import { h, put, icon, btn, primary, face, dialog, confirm, toast, fail, empty, errText, go, day, ago, field, area } from './ui.js';
import { t, getLang } from './i18n.js';
import { S, api } from './store.js';
import { signedIn, refreshShell, useLang } from './app.js';
import { card } from './public.js';

export async function signOut() {
  await api('auth.logout', {}).catch(() => {});
  S.user = null;
  S.csrf = '';
  refreshShell();
  go('#/');
}

const centered = (root, ...kids) => put(root, h('div.narrow', h('sav-card.auth', h('div.stack', kids))));

export function auth(root, mode) {
  document.title = t(mode === 'signup' ? 'sign_up' : 'sign_in') + ' · SavAwards';
  if (S.user) { go('#/me'); return; }
  const box = h('div.stack');
  const draw = () => {
    const err = h('sav-alert', { variant: 'danger', hidden: true });
    const show = (e) => { err.textContent = errText(e); err.hidden = false; };
    const name = field(t('your_name'), '', { maxlength: 80, autocomplete: 'nickname', help: t('name_public') });
    const email = field(t('email'), '', { type: 'email', autocomplete: 'email', help: mode === 'signup' ? t('email_fixed') : null });
    const pw = field(t('password'), '', { type: 'password', 'password-toggle': true, autocomplete: mode === 'signup' ? 'new-password' : 'current-password', help: mode === 'signup' ? t('pw_hint') : null });
    const terms = h('sav-checkbox', {}, t('accept') + ' ', h('a', { href: 'terms.html', target: '_blank' }, t('terms')), ` ${t('and')} `, h('a', { href: 'privacy.html', target: '_blank' }, t('privacy')));
    const submit = primary(t(mode === 'signup' ? 'sign_up' : 'sign_in'), { block: true });
    const run = async () => {
      if (submit.loading) return;
      submit.loading = true;
      err.hidden = true;
      try {
        if (mode === 'signup') {
          await api('auth.register', { name: name.value, email: email.value, password: pw.value, acceptTerms: terms.checked, lang: getLang() });
          put(box, empty('mail', t('check_email'), t('check_email_text')));
        } else signedIn(await api('auth.login', { email: email.value, password: pw.value }));
      } catch (e) { show(e); } finally { submit.loading = false; }
    };
    submit.addEventListener('click', run);
    const form = h('div.form', mode === 'signup' ? name : null, email, pw, mode === 'signup' ? terms : null, err, submit);
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.localName === 'sav-input') run(); });
    const sav = window.Identity?.button(S.config.savAccount) || null;
    const seg = h('sav-radio-group', { appearance: 'buttons', value: mode, 'aria-label': t('sign_in'), class: 'wide' }, h('sav-radio', { value: 'signin' }, t('sign_in')), h('sav-radio', { value: 'signup' }, t('sign_up')));
    seg.addEventListener('change', () => { mode = seg.value; history.replaceState(null, '', '#/' + mode); draw(); });
    put(box, h('div.auth-h', h('img', { src: 'icons/favicon.svg', width: 48, height: 48, alt: '' }), h('h1', t(mode === 'signup' ? 'join_title' : 'welcome_back')), h('p.muted', t(mode === 'signup' ? 'join_text' : 'signin_text'))),
      seg, form,
      mode === 'signin' ? btn(t('forgot'), { size: 'sm', appearance: 'ghost', onclick: forgot }) : !S.config.mailReady ? h('p.muted.small', t('mail_off')) : null,
      sav ? [h('sav-divider', t('or')), sav] : null,
      h('p.small.muted.center', t('no_google')));
  };
  draw();
  put(root, h('div.narrow', h('sav-card.auth', box)));
}

function forgot() {
  const email = field(t('email'), '', { type: 'email', autofocus: true });
  dialog({ title: t('forgot'), body: h('div.form', h('p.muted', t('forgot_text')), email), actions: [{ label: t('cancel') }, { label: t('send_link'), primary: true, run: async () => { await api('auth.forgot', { email: email.value, lang: getLang() }); toast(t('link_sent'), 'success'); } }] });
}

export const verify = (root, token) => centered(root, empty('mail', t('verify_title'), t('verify_text_mail'), primary(t('verify_btn'), { onclick: async () => { signedIn(await api('auth.verify', { token }), '#/me'); toast(t('verified'), 'success'); } })));
export function reset(root, token) {
  const pw = field(t('new_password'), '', { type: 'password', 'password-toggle': true, autocomplete: 'new-password', help: t('pw_hint') });
  centered(root, h('h1', t('reset_title')), pw, primary(t('save'), { block: true, onclick: async () => { signedIn(await api('auth.reset', { token, password: pw.value }), '#/me'); } }));
}
export const unverified = (root) => centered(root, empty('mail', t('unverified'), S.user.email + ' — ' + t('unverified_text'),
  primary(t('resend'), { onclick: async () => { await api('auth.resend', { lang: getLang() }); toast(t('resent'), 'success'); } }), btn(t('sign_out'), { onclick: signOut })));

// ------------------------------------------------------------------ the account

const STATUS = { pending: ['neutral', 'st_pending'], accepted: ['success', 'st_accepted'], rejected: ['danger', 'st_rejected'] };
const status = (s) => h('sav-tag', { size: 'sm', appearance: 'soft', variant: STATUS[s]?.[0] || 'neutral' }, t(STATUS[s]?.[1] || s));

export async function me(root, tab) {
  document.title = t('my_account') + ' · SavAwards';
  const d = await api('me.activity');
  const u = S.user;
  const roleName = t('role_' + u.role);
  const tabs = h('sav-tabs', { label: t('my_account') },
    h('sav-tab', { label: t('favourites'), icon: 'heart', name: 'favourites', active: tab === 'favourites' }, d.favourites.length ? h('div.pgrid', d.favourites.map((p) => card(p))) : empty('heart', t('no_favourites'), t('no_favourites_text'), btn(t('browse'), { href: '#/products' }))),
    h('sav-tab', { label: t('my_reviews'), icon: 'star', name: 'reviews', active: tab === 'reviews' }, d.reviews.length ? h('div.list', d.reviews.map((r) => h('a.li', { href: '#/p/' + r.slug }, h('strong', r.product), h('span', r.title || ''), r.hidden ? h('sav-tag', { size: 'sm', variant: 'danger', appearance: 'soft' }, t('hidden')) : null, h('span.grow'), h('b', `${r.rating}/10`), h('small.muted', day(r.updated))))) : empty('star', t('no_my_reviews'), '')),
    h('sav-tab', { label: t('my_requests'), icon: 'pencil', name: 'requests', active: tab === 'requests' },
      h('h3', t('edit_requests')), d.requests.length ? h('div.list', d.requests.map((r) => h('div.li.col', h('div.row', h('a', { href: '#/p/' + r.slug }, h('strong', r.product)), h('small', t('rf_' + r.field)), h('span.grow'), status(r.status), h('small.muted', day(r.created))), h('p.small', r.proposal), r.reply ? h('p.small.reply', icon('message-circle'), ' ', r.reply) : null))) : h('p.muted', t('no_requests')),
      h('h3', t('suggestions')), d.suggestions.length ? h('div.list', d.suggestions.map((s) => h('div.li.col', h('div.row', h('strong', s.name), h('span.grow'), status(s.status), h('small.muted', day(s.created))), s.reply ? h('p.small.reply', icon('message-circle'), ' ', s.reply) : null))) : h('p.muted', t('no_suggestions')),
      btn(t('suggest_product'), { href: '#/suggest', icon: 'lightbulb' })),
    h('sav-tab', { label: t('settings'), icon: 'settings', name: 'settings', active: tab === 'settings' }, settings()));
  tabs.addEventListener('sav-tab-show', (e) => { const n = e.detail?.name || e.target?.getAttribute?.('name'); if (n) history.replaceState(null, '', '#/me/' + n); });
  put(root, h('div.page-head.me-head', h('div.row', ((av) => { if (u.picture) { const im = new Image(); im.onload = () => av.setAttribute('image', u.picture); im.src = u.picture; } return av; })(face(u.name, 56)), h('div', h('h1', u.name), h('p.muted', u.email, ' · ', roleName)))), tabs);
}

function settings() {
  const u = S.user;
  const name = field(t('your_name'), u.name, { maxlength: 80, help: t('name_public') });
  const methods = btn(t('signin_methods'), { icon: 'key-round', onclick: () => window.Identity?.methods() });
  return h('div.settings',
    h('sav-card', h('h3', t('profile')), h('div.form', name, primary(t('save'), { onclick: async () => { const r = await api('auth.profile', { name: name.value, lang: getLang() }); S.user = r.user; refreshShell(); toast(t('saved'), 'success'); } }))),
    h('sav-card', h('h3', t('security')), h('p.muted.small', t('email_fixed')), h('div.row.wrap', btn(u.hasPassword ? t('change_password') : t('set_password'), { icon: 'lock', onclick: passwordDialog }), window.Identity ? methods : null)),
    h('sav-card', h('h3', t('your_data')), h('p.muted.small', t('your_data_text')), h('div.row.wrap',
      btn(t('export_data'), { icon: 'download', href: 'api/?r=auth.export', download: 'savawards-data.json' }),
      btn(t('delete_account'), { icon: 'trash', variant: 'danger', onclick: deleteDialog }))));
}

function passwordDialog() {
  const cur = S.user.hasPassword ? field(t('current_password'), '', { type: 'password', autocomplete: 'current-password' }) : null;
  const pw = field(t('new_password'), '', { type: 'password', 'password-toggle': true, autocomplete: 'new-password', help: t('pw_hint') });
  dialog({ title: S.user.hasPassword ? t('change_password') : t('set_password'), body: h('div.form', cur, pw), actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => { const r = await api('auth.password', { current: cur?.value || '', password: pw.value }); S.user = r.user; toast(t('saved'), 'success'); } }] });
}

function deleteDialog() {
  const pw = S.user.hasPassword ? field(t('password'), '', { type: 'password', autocomplete: 'current-password' }) : null;
  dialog({ title: t('delete_account'), body: h('div.form', h('p', t('delete_account_text')), pw), actions: [{ label: t('cancel') }, { label: t('delete_account'), danger: true, run: async () => { await api('auth.delete', { password: pw?.value || '' }); S.user = null; S.csrf = ''; refreshShell(); go('#/'); toast(t('account_deleted'), 'success'); } }] });
}

// ------------------------------------------------------------------ suggest a product

export function suggest(root) {
  document.title = t('suggest_product') + ' · SavAwards';
  const name = field(t('product_name'), '', { maxlength: 90, required: true });
  const site = field(t('website'), '', { type: 'url', maxlength: 300, placeholder: 'https://' });
  const alt = field(t('alternative_to'), '', { maxlength: 200, placeholder: t('alt_ph') });
  const why = area(t('why_suggest'), '', { maxlength: 2000 });
  put(root, h('div.narrow', h('div.page-head', h('h1', t('suggest_product')), h('p.muted', t('suggest_text'))),
    h('sav-card', h('div.form', name, site, alt, why, primary(t('send'), { icon: 'send', onclick: async () => { await api('me.suggest', { name: name.value, website: site.value, alternativeTo: alt.value, reason: why.value }); toast(t('suggest_sent'), 'success'); go('#/me/requests'); } })))));
}
