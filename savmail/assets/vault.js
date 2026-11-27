/**
 * The vault from the side of the person (lib/vault.php): connecting the first mailbox, opening SavMail on a new device,
 * and the form that connects a mailbox (also from the settings). Passwords go to the server once, to sign in and to be
 * locked in the vault; the app never keeps them.
 */
import { btn, confirm, dialog, errText, h, icon, primary, put, select, tile, toast } from './ui.js';
import { t } from './i18n.js';
import { S, api, takeState } from './store.js';
import { go, prefs, signOut } from './account.js';
import { shell } from './shell.js';

/** The look of each provider in the quick choices: a letter on its own colour (no logos: they are not ours). */
const LOOK = { gmail: ['#c5221f', 'G'], outlook: ['#0a5fb4', 'O'], yahoo: ['#5f01d1', 'Y'], icloud: ['#3b82c4', 'i'], aruba: ['#e5501e', 'A'], libero: ['#1a7f37', 'L'] };
const QUICK = ['gmail', 'outlook', 'yahoo', 'icloud', 'aruba', 'libero'];
/** Only when the app runs on this computer: mail servers without TLS, for a test server (the API refuses them online). */
const LOCAL = /^(localhost|127\.)/.test(location.hostname);

async function presets() {
  if (!S.presets) { const r = await api('ml.presets'); S.presets = r.presets; S.oauth = r.oauth; }
  return S.presets;
}

const errBox = () => {
  const box = h('sav-alert.cerr', { variant: 'danger', hidden: true });
  box.show = (e) => {
    const where = e?.data?.where, server = e?.data?.server;
    put(box, h('b', errText(e)), where ? h('div.small', t(where === 'smtp' ? 'err_where_smtp' : 'err_where_imap')) : null, server ? h('code.srv', server) : null, e?.code === 'mail_auth' ? h('div.small', t('err_auth_help')) : null);
    box.hidden = false;
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  box.clear = () => { box.hidden = true; };
  return box;
};

const COLORS = ['#8f6500', '#0f6e56', '#1d4e89', '#b3261e', '#5b4cf0', '#a1328c', '#0b7a87', '#c45a0c', '#4d7c0f', '#5f6660'];
/** What each provider asks for, shown under its name in the first step. */
const ASKS = { apppw: 'ask_apppw', oauth: 'ask_oauth', oauth_off: 'ask_oauth_off', password: 'ask_password', none: 'ask_none' };

/**
 * Adding an address, in three steps (sav-steps on top; a step already done can be opened again):
 *   1. the provider: Gmail, Outlook, Yahoo, iCloud, Aruba, Libero, or another one whose details the person writes;
 *   2. access: the address and its password (or "Continue with Microsoft"), the servers for another provider; "Check and
 *      continue" signs in to IMAP and SMTP (ml.account.test) and saves nothing;
 *   3. in SavMail: the name people see, the colour, the signature, the copy in Sent (and, the first time, whether this
 *      device stays unlocked); "Add to SavMail" checks again and keeps it in the vault (ml.account.add).
 * opt: {first: the first address of the account, done(result)}. Returns the element.
 */
export function accountForm(opt = {}) {
  let chosen = null, edited = false, lastFound = '', color = '';
  const steps = h('sav-steps.wsteps', { current: 1, clickable: true, label: t('add_mailbox') },
    h('sav-step', { label: t('st_provider') }), h('sav-step', { label: t('st_access') }), h('sav-step', { label: t('st_savmail') }));
  const body = h('div.wbody');
  const show = (n) => {
    steps.current = n;
    put(body, [p1, p2, p3][n - 1]);
    setTimeout(() => { const f = n === 2 ? email : n === 3 ? name : null; if (f && !f.value) f.focus?.(); }, 60);
  };
  steps.addEventListener('change', (e) => show(e.detail.current));
  const alert = (variant, ic, title, text, link) => h('sav-alert', { variant, appearance: 'soft' }, h('sav-icon', { name: ic, slot: 'icon' }), h('b', title), text ? h('div', text) : null, link ? h('a', { href: link, target: '_blank', rel: 'noopener' }, t('open_page'), ' ', icon('external-link')) : null);
  const logo = (p, big) => p === 'custom' ? h('span.plogo.other' + (big ? '.big' : ''), icon('at-sign')) : h('span.plogo' + (big ? '.big' : ''), { style: `--c:${LOOK[p][0]}` }, LOOK[p][1]);

  // ---------------------------------------------------------------- 1. the provider
  const grid = h('div.pgrid');
  const pick = (s) => {
    chosen = s;
    edited = false;
    lastFound = '';
    const v = email.value.trim();
    imap.set({ ...s.imap, user: v });
    smtp.set({ ...s.smtp, user: v });
    sent.checked = s.sentCopy !== false;
    draw2();
    show(2);
  };
  const custom = { provider: 'custom', name: t('mb_other'), auth: 'password', sentCopy: true, imap: { host: '', port: 993, tls: 'ssl' }, smtp: { host: '', port: 465, tls: 'ssl' } };
  const card = (s) => tile(s.name, () => pick(s), { class: 'pcard', 'data-p': s.provider }, logo(s.provider, true), h('div.pct', h('b', s.provider === 'custom' ? t('mb_other_long') : s.name), h('small', t(s.provider === 'custom' ? 'ask_custom' : ASKS[s.auth] || 'ask_password'))));
  put(grid, h('sav-spinner'));
  presets().then((list) => put(grid, QUICK.map((p) => list.find((x) => x.provider === p)).filter(Boolean).map(card), card(custom)))
    .catch((e) => put(grid, alert('danger', 'circle-alert', errText(e)), card(custom)));
  const p1 = h('div.wpane', h('h3.wh', t('st1_title')), h('p.muted.small', t('st1_text')), grid);

  // ---------------------------------------------------------------- 2. access
  const err = errBox();
  const email = h('sav-input', { label: t('mb_email'), type: 'email', autocomplete: 'email', required: true, placeholder: 'nome@esempio.it' });
  const pw = h('sav-input', { label: t('mb_password'), type: 'password', 'password-toggle': true, autocomplete: 'off' });
  const srv = (k) => {
    const host = h('sav-input', { label: t('srv_host'), size: 'sm', autocomplete: 'off', spellcheck: 'false' });
    const port = h('sav-input', { label: t('srv_port'), size: 'sm', inputmode: 'numeric', class: 'port' });
    const tls = select(t('srv_tls'), [['ssl', 'SSL/TLS'], ['starttls', 'STARTTLS'], ...(LOCAL ? [['none', 'None (tests on this computer)']] : [])], 'ssl', null, {});
    const user = h('sav-input', { label: t('srv_user'), size: 'sm', autocomplete: 'off', spellcheck: 'false' });
    for (const x of [host, port, user]) x.addEventListener('input', () => { edited = true; });
    tls.addEventListener('change', () => { edited = true; });
    const box = h('fieldset.srv', h('legend', k === 'imap' ? t('srv_imap') : t('srv_smtp')), h('div.srvrow', host, port, tls), user);
    box.get = () => ({ host: host.value.trim(), port: +port.value || 0, tls: tls.value || 'ssl', user: user.value.trim() || email.value.trim() });
    box.set = (x) => { host.value = x.host || ''; port.value = x.port ? String(x.port) : ''; tls.value = x.tls || 'ssl'; user.value = x.user || ''; };
    return box;
  };
  const imap = srv('imap'), smtp = srv('smtp');
  const servers = h('div.stack', imap, smtp);
  const adv = h('sav-details.adv', { summary: t('mb_advanced'), appearance: 'plain' }, h('div.stack', h('p.muted.small', t('mb_advanced_t')), servers));
  const head2 = h('div.pchosen');
  const info = h('div.pinfo');
  const pwRow = h('div.stack', pw);
  const srvSlot = h('div');
  const check = primary(t('check_continue'), { icon: 'arrow-right' });
  const ms = primary(t('ms_continue'), { icon: 'external-link', hidden: true });
  const back2 = btn(t('back'), { appearance: 'ghost', icon: 'arrow-left', onclick: () => show(1) });
  // the servers of another provider: guessed from the address, written by hand when the guess is wrong
  const discover = async () => {
    const v = email.value.trim().toLowerCase();
    if (chosen?.provider !== 'custom' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) || v === lastFound) return;
    lastFound = v;
    try {
      const r = await api('ml.discover', { email: v });
      if (!edited || !imap.get().host) { imap.set(r.settings.imap); smtp.set(r.settings.smtp); edited = false; }
      sent.checked = r.settings.sentCopy !== false;
      put(info, r.settings.provider !== 'custom' ? alert('neutral', 'info', t('found_known', { name: r.settings.name }), t('found_known_t')) : r.settings.found === 'guess' ? alert('neutral', 'info', t('guess_title'), t('guess_text')) : alert('success', 'check', t('found_settings', { name: r.settings.name })),
        r.settings.auth === 'apppw' ? alert('warning', 'key-round', t('apppw_title', { name: r.settings.name }), t('apppw_any'), r.settings.help) : null);
      if (r.settings.provider !== 'custom') chosen = { ...r.settings, viaCustom: true };
    } catch (e) { if (e.code !== 'email_invalid') err.show(e); }
  };
  email.addEventListener('change', discover);
  email.addEventListener('blur', () => { discover(); const v = email.value.trim(); if (chosen && chosen.provider !== 'custom' && !edited) { imap.set({ ...imap.get(), user: v }); smtp.set({ ...smtp.get(), user: v }); } });
  const draw2 = () => {
    const s = chosen, oauth = s.auth === 'oauth', off = s.auth === 'oauth_off' || s.auth === 'none';
    err.clear();
    put(head2, logo(s.provider, false), h('b', s.provider === 'custom' ? t('mb_other_long') : s.name), h('span.spacer'), btn(t('change'), { size: 'sm', appearance: 'ghost', onclick: () => show(1) }));
    pw.setAttribute('label', s.auth === 'apppw' ? t('mb_app_password') : t('mb_password'));
    // nothing to fill in when the provider cannot be connected here (Outlook not set up yet, Proton): the notice and "Back"
    email.hidden = off;
    pwRow.hidden = oauth || off;
    srvSlot.hidden = oauth || off;
    safe2.hidden = off;
    check.hidden = oauth || off;
    ms.hidden = !oauth;
    put(info,
      s.auth === 'apppw' ? alert('warning', 'key-round', t('apppw_title', { name: s.name }), t('apppw_' + s.provider) !== 'apppw_' + s.provider ? t('apppw_' + s.provider) : t('apppw_any'), s.help) : null,
      oauth ? alert('neutral', 'shield', t('oauth_title'), t('oauth_text')) : null,
      s.auth === 'oauth_off' ? alert('warning', 'circle-alert', t('oauth_off_title'), t('oauth_off_text')) : null,
      s.auth === 'none' ? alert('danger', 'circle-alert', t('proton_title'), t('proton_text')) : null,
      s.provider === 'custom' ? h('p.muted.small', t('custom_t')) : null);
    // another provider: the servers are part of the step; a known one keeps them folded
    if (s.provider === 'custom') put(srvSlot, h('div.stack', h('b.small', t('srv_title')), servers)); else { adv.querySelector('.stack').append(servers); put(srvSlot, adv); }
  };
  check.addEventListener('click', async () => {
    if (check.loading) return;
    err.clear();
    if (!email.value.trim()) { email.focus(); return; }
    await discover();
    if (!pw.value) { pw.focus(); err.show({ code: 'mailbox_password' }); return; }
    if (!imap.get().host || !smtp.get().host) { err.show({ code: 'server_invalid' }); return; }
    check.loading = true;
    try {
      await api('ml.account.test', { email: email.value.trim(), password: pw.value, imap: imap.get(), smtp: smtp.get(), provider: chosen?.provider || 'custom' });
      put(ok3, alert('success', 'check', t('verified', { email: email.value.trim() }), t('verified_t')));
      show(3);
    } catch (e) { err.show(e); } finally { check.loading = false; }
  });
  ms.addEventListener('click', async () => {
    if (ms.loading) return;
    ms.loading = true;
    try { const r = await api('ml.oauth.start', { email: email.value.trim() }); location.href = r.url; } catch (e) { err.show(e); ms.loading = false; }
  });
  const safe2 = h('p.muted.small.safe', icon('lock'), ' ', t('mb_safe'));
  const p2 = h('div.wpane', head2, info, email, pwRow, srvSlot, err, h('div.wnav', back2, h('span.spacer'), check, ms), safe2);
  p2.addEventListener('keydown', (e) => { if (e.key === 'Enter' && /^sav-(input|password)$/.test(e.target.localName) && !check.hidden) check.click(); });

  // ---------------------------------------------------------------- 3. in SavMail
  const ok3 = h('div');
  const name = h('sav-input', { label: t('mb_name'), help: t('mb_name_t'), value: S.user?.name || '', maxlength: 120, autocomplete: 'name' });
  color = COLORS[S.accounts.length % COLORS.length];
  const sw = h('div.sws', COLORS.map((c) => h('button.swb' + (c === color ? '.on' : ''), { type: 'button', style: `--c:${c}`, 'aria-label': c, 'aria-pressed': String(c === color),
    onclick: (e) => { color = c; sw.querySelectorAll('.swb').forEach((x) => { x.classList.toggle('on', x === e.currentTarget); x.setAttribute('aria-pressed', String(x === e.currentTarget)); }); } })));
  const sig = h('div.editor.sig', { contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('signature'), 'data-placeholder': t('signature_hint') });
  sig.addEventListener('keydown', (e) => e.stopPropagation());
  const sent = h('sav-switch', { checked: true }, t('mb_sent_copy'));
  const remember = opt.first ? h('sav-switch', { checked: true }, t('remember_device')) : null;
  const err3 = errBox();
  const addBtn = primary(t('add_to_savmail'), { icon: 'check' });
  addBtn.addEventListener('click', async () => {
    if (addBtn.loading) return;
    err3.clear();
    addBtn.loading = true;
    try {
      const r = await api('ml.account.add', { email: email.value.trim(), name: name.value.trim(), password: pw.value, imap: imap.get(), smtp: smtp.get(), provider: chosen?.viaCustom ? chosen.provider : chosen?.provider || 'custom',
        color, signature: sig.textContent.trim() ? sig.innerHTML : '', sentCopy: sent.checked, remember: remember ? remember.checked : true });
      pw.value = '';
      takeState(r);
      toast(t('mb_connected', { email: r.account.email }), 'success');
      opt.done?.(r);
    } catch (e) { err3.show(e); } finally { addBtn.loading = false; }
  });
  const p3 = h('div.wpane', ok3, name, h('div', h('span.flabel', t('color')), sw), h('div', h('span.flabel', t('signature')), sig), sent, remember, err3,
    h('div.wnav', btn(t('back'), { appearance: 'ghost', icon: 'arrow-left', onclick: () => show(2) }), h('span.spacer'), addBtn));
  p3.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.localName === 'sav-input') addBtn.click(); });

  const form = h('div.wizard', steps, body);
  show(1);
  return form;
}

/** A dialog that connects one more mailbox (from the mail or the settings). */
export function addAccountDialog(after) {
  const d = dialog({ title: t('add_mailbox'), width: '40rem', body: accountForm({ done: (r) => { d.hide(); after?.(r); } }) });
  return d;
}

/** No address yet: the app is open, and its page invites to add the first one (the form right there). */
export function emptyScreen(root) {
  shell(root, { current: 'addresses', content: h('div.welcome',
    h('div.vintro', h('span.kicker', icon('lock'), ' ', t('setup_kicker')), h('h1', t('setup_title')), h('p.muted', t('setup_text')),
      h('ul.vpoints', [['inbox', 'pt_all'], ['lock', 'pt_lock'], ['image-off', 'pt_track'], ['smartphone', 'pt_device']].map(([ic, k]) => h('li', icon(ic), h('div', h('b', t(k)), h('span.muted', t(k + '_t'))))))),
    h('sav-card.vcard2', h('h2.fh', t('add_first')), accountForm({ first: true, done: () => go('#/') }))) });
  document.title = t('setup_title') + ' – SavMail';
}

/** The addresses are there but this browser cannot open them: a password of one of them, or the recovery code. */
export function unlockScreen(root) {
  const secret = h('sav-input', { label: t('unlock_label'), type: 'password', 'password-toggle': true, autocomplete: 'off', autofocus: true, help: t(S.unlock.recovery ? 'unlock_help_code' : 'unlock_help') });
  const remember = h('sav-switch', { checked: true }, t('remember_device'));
  const err = h('sav-alert', { variant: 'danger', hidden: true });
  const go1 = primary(t('unlock'), { block: true, icon: 'lock-open' });
  const run = async () => {
    if (go1.loading || !secret.value) return;
    go1.loading = true;
    err.hidden = true;
    try { takeState(await api('ml.unlock', { secret: secret.value, remember: remember.checked })); secret.value = ''; toast(t('unlocked'), 'success'); go(location.hash.startsWith('#/m/') ? location.hash : '#/'); }
    catch (e) { err.textContent = errText(e); err.hidden = false; }
    finally { go1.loading = false; }
  };
  go1.addEventListener('click', run);
  secret.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  const startOver = async () => {
    if (!await confirm(t('reset_vault'), t('reset_vault_t'), t('reset_vault_go'))) return;
    takeState(await api('ml.reset', { confirm: true }));
    go('#/');
  };
  shell(root, { current: '', action: h('span'), content: h('div.ucenter', h('sav-card.auth.unl', h('div.stack',
    h('div.ulock', icon('lock')), h('h1', t('unlock_title')), h('p.muted', t('unlock_text')), secret, remember, err, go1,
    h('sav-divider'), h('div.prow.wrap', btn(t('reset_vault'), { size: 'sm', appearance: 'ghost', variant: 'danger', onclick: startOver }), h('span.spacer'), btn(t('sign_out'), { size: 'sm', appearance: 'ghost', onclick: signOut }))))) });
  document.title = t('unlock_title') + ' – SavMail';
}

export { prefs };
