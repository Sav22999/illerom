/**
 * The email addresses of the person: the ones connected, how each one is doing, adding one more, changing its name,
 * colour, signature, password or servers, removing it. As the groups in SavNewsletters: one card each.
 */
import { btn, confirm, dialog, empty, errText, fail, h, icon, put, select, toast } from './ui.js';
import { t } from './i18n.js';
import { S, api, takeState } from './store.js';
import { go } from './account.js';
import { shell } from './shell.js';

const COLORS = ['#8f6500', '#0f6e56', '#1d4e89', '#b3261e', '#5b4cf0', '#a1328c', '#0b7a87', '#c45a0c', '#4d7c0f', '#5f6660'];
const PROVIDER = { gmail: 'Gmail', outlook: 'Outlook', yahoo: 'Yahoo Mail', icloud: 'iCloud Mail', aruba: 'Aruba', libero: 'Libero Mail', tiscali: 'Tiscali' };

export async function addressesScreen(root, adding) {
  if (S.vault === 'empty') { const { emptyScreen } = await import('./vault.js'); return emptyScreen(root); }
  if (S.vault === 'locked') { const { unlockScreen } = await import('./vault.js'); return unlockScreen(root); }
  const frame = shell(root, { current: 'addresses' });
  const saved = () => toast(t('settings_saved'), 'success');
  const after = () => addressesScreen(root, false);
  const add = async () => { const { addAccountDialog } = await import('./vault.js'); addAccountDialog(async () => { after(); (await import('./mail.js')).loadFolders().then(() => frame.redraw()).catch(() => {}); }); };
  const editBox = (a) => {
    const nm = h('sav-input', { label: t('mb_name'), help: t('mb_name_t'), value: a.name || '', maxlength: 120 });
    const sw = h('div.sws', COLORS.map((c) => h('button.swb' + (c === a.color ? '.on' : ''), { type: 'button', style: `--c:${c}`, 'aria-label': c, 'aria-pressed': String(c === a.color), onclick: (e) => { color = c; e.currentTarget.parentNode.querySelectorAll('.swb').forEach((x) => { x.classList.toggle('on', x === e.currentTarget); x.setAttribute('aria-pressed', String(x === e.currentTarget)); }); } })));
    let color = a.color;
    const sig = h('div.editor.sig', { contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('signature'), html: a.signature || '' });
    sig.addEventListener('keydown', (e) => e.stopPropagation());
    const sent = h('sav-switch', { checked: a.sentCopy }, t('mb_sent_copy'));
    const pw = a.auth === 'password' ? h('sav-input', { label: t('mb_new_password'), help: t('mb_new_password_t'), type: 'password', 'password-toggle': true, autocomplete: 'off' }) : null;
    const srv = (k, s) => {
      const host = h('sav-input', { label: t('srv_host'), size: 'sm', value: s.host }), port = h('sav-input', { label: t('srv_port'), size: 'sm', value: String(s.port), class: 'port' });
      const tls = select(t('srv_tls'), [['ssl', 'SSL/TLS'], ['starttls', 'STARTTLS']], s.tls), user = h('sav-input', { label: t('srv_user'), size: 'sm', value: s.user });
      const box = h('fieldset.srv', h('legend', t(k === 'imap' ? 'srv_imap' : 'srv_smtp')), h('div.srvrow', host, port, tls), user);
      box.get = () => ({ host: host.value.trim(), port: +port.value || 0, tls: tls.value, user: user.value.trim() });
      box.changed = () => JSON.stringify(box.get()) !== JSON.stringify({ host: s.host, port: s.port, tls: s.tls, user: s.user });
      return box;
    };
    const im = srv('imap', a.imap), sm = srv('smtp', a.smtp);
    const adv = a.auth === 'password' ? h('sav-details.adv', { summary: t('mb_advanced'), appearance: 'plain' }, h('div.stack', im, sm)) : null;
    const err = h('sav-alert', { variant: 'danger', hidden: true });
    const reauth = a.auth === 'xoauth2' ? btn(t('ms_again'), { icon: 'shield', size: 'sm', onclick: async () => { const r = await api('ml.oauth.start', { account: a.id, email: a.email }); location.href = r.url; } }) : null;
    dialog({
      title: a.email, width: '36rem', body: h('div.form', nm, h('div', h('span.flabel', t('color')), sw), h('div', h('span.flabel', t('signature')), sig), sent, pw, adv, reauth, err),
      actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => {
        const body = { id: a.id, name: nm.value.trim(), color, signature: sig.innerHTML.trim() === '<br>' ? '' : sig.innerHTML, sentCopy: sent.checked };
        if (pw?.value) body.password = pw.value;
        if (im.changed()) body.imap = im.get();
        if (sm.changed()) body.smtp = sm.get();
        try { takeState(await api('ml.account.update', body)); saved(); after(); }
        catch (e) { put(err, h('b', errText(e)), e.data?.server ? h('code.srv', e.data.server) : null); err.hidden = false; return false; }
      } }],
    });
  };
  const removeBox = async (a) => {
    const last = S.accounts.length === 1;
    if (!await confirm(t('mb_remove_q', { email: a.email }), t(last ? 'mb_remove_last_t' : 'mb_remove_t'), t('remove'))) return;
    takeState(await api('ml.account.remove', { id: a.id }));
    toast(t('mb_removed'), 'success');
    go(S.accounts.length ? '#/addresses' : '#/');
    if (S.accounts.length) after();
  };
  const card = (a) => {
    const F = S.folders[a.id], inbox = F?.list?.find((f) => f.raw.toUpperCase() === 'INBOX');
    const status = F?.err ? h('div.astat.bad', icon('circle-alert'), h('span', errText(F.err)), F.err.data?.server ? h('code.srv', F.err.data.server) : null)
      : F ? h('div.astat.ok', icon('check'), h('span', inbox?.unread ? t('unread_n', { n: inbox.unread }) : t('all_read'))) : h('div.astat', h('sav-spinner'), h('span', t('checking')));
    return h('sav-card.acard', { appearance: 'outlined' },
      h('div.ahead', h('span.gdot.big', { style: `--g:${a.color}` }, (a.name || a.email)[0].toUpperCase()), h('div.grow', h('b.aemail', a.email), h('small.muted', [a.name, PROVIDER[a.provider] || a.imap.host, a.auth === 'xoauth2' ? t('via_ms') : null].filter(Boolean).join(' · ')))),
      status,
      h('div.aact', btn(t('open_inbox'), { size: 'sm', icon: 'inbox', href: `#/m/${encodeURIComponent(a.id)}/INBOX` }), h('span.spacer'),
        btn(t('edit'), { size: 'sm', appearance: 'ghost', icon: 'pen-line', onclick: () => editBox(a) }), btn(t('remove'), { size: 'sm', appearance: 'ghost', variant: 'danger', onclick: () => removeBox(a).catch(fail) })));
  };
  const draw = () => put(frame.main, h('div.addr',
    h('div.hhead', h('div', h('h1', t('g_mailboxes')), h('p.muted', t('addresses_t'))), h('span.spacer'), S.accounts.length < 10 ? btn(t('add_mailbox'), { icon: 'plus', variant: 'primary', appearance: 'solid', onclick: add }) : null),
    h('div.agrid', S.accounts.map(card)),
    h('sav-alert.asafe', { variant: 'neutral', appearance: 'soft' }, h('sav-icon', { name: 'lock', slot: 'icon' }), h('b', t('how_safe')), h('div.small', t('how_safe_short')), h('a.small', { href: '#/settings/security' }, t('security_link')))));
  draw();
  document.title = t('g_mailboxes') + ' – SavMail';
  (await import('./mail.js')).loadFolders().then(() => { if (root.contains(frame.main)) { draw(); frame.redraw(); } }).catch(() => {});
  if (adding) { history.replaceState(null, '', '#/addresses'); add(); }
}
