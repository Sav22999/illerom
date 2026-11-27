/** Settings: a page of its own, one section at a time chosen on the side, as in the other apps of SavOffice. */
import { btn, confirm, copyText, dialog, empty, fail, h, iconBtn, mobile, primary, put, select, toast } from './ui.js';
import { getLang, setLang, t, when } from './i18n.js';
import { S, api } from './store.js';
import { brand, credit, go, prefs, setPrefs, setUser, signOut, userMenu } from './account.js';

const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); };

export function settingsScreen(root, want = '') {
  const u = S.user, p = prefs(), md = { size: 'sm' };
  const saved = () => toast(t('settings_saved'), 'success');
  const save = (x, quiet) => setPrefs(x).then(() => { if (!quiet) saved(); }).catch(fail);
  const row = (label, help, control) => h('div.orow', h('div.orow-t', h('b', label), help ? h('small', help) : null), control ? h('div.orow-c', control) : null);
  const section = (title, text, ...rows) => h('div.osec', h('h2', title), text ? h('p.muted', text) : null, h('sav-card.ocard', { appearance: 'outlined' }, h('div.orows', rows.filter(Boolean))));
  const small = (label, o) => btn(label, { size: 'sm', appearance: 'outline', ...o });

  // ---------------------------------------------------------------- account (the same of the other apps of SavOffice)
  const name = h('sav-input', { value: u.name, maxlength: 80, size: 'sm', 'aria-label': t('your_name') });
  name.addEventListener('keydown', (e) => e.stopPropagation());
  name.addEventListener('change', async () => { if (!name.value.trim()) return; try { const r = await api('auth.profile', { name: name.value, lang: getLang() }); setUser(r.user); saved(); } catch (e) { fail(e); } });
  const password = () => {
    const cur = h('sav-input', { label: t('current_pw'), type: 'password', 'password-toggle': true, autocomplete: 'current-password' }), pw = h('sav-input', { label: t('new_password'), type: 'password', 'password-toggle': true, autocomplete: 'new-password', help: t('pw_hint') });
    dialog({ title: t(u.hasPassword ? 'change_pw' : 'set_pw'), width: '26rem', body: h('div.form', u.hasPassword ? cur : null, pw), actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => { const r = await api('auth.password', { current: cur.value, password: pw.value }); setUser(r.user); u.hasPassword = true; saved(); } }] });
  };
  const account = () => section(t('g_account'), u.email,
    h('sav-alert', { variant: 'neutral', appearance: 'soft', class: 'shared' }, h('sav-icon', { name: 'grip', slot: 'icon' }), t('shared_account')),
    row(t('your_name'), t('name_t'), name),
    row(t('password'), t(u.hasPassword ? 'password_t' : 'password_none_t'), small(t(u.hasPassword ? 'change_pw' : 'set_pw'), { onclick: password })),
    window.Identity ? row(t('sign_in_ways'), t('sign_in_ways_t'), small(window.Identity.text('methods'), { icon: 'shield', onclick: () => window.Identity.methods() })) : null,
    row(t('sign_out'), t('sign_out_t'), small(t('sign_out'), { icon: 'log-out', onclick: () => signOut() })));

  // ---------------------------------------------------------------- contacts
  const contacts = () => section(t('g_contacts'), t('g_contacts_t'),
    row(t('sort_by'), t('sort_by_t'), select(null, [['first', t('by_first')], ['last', t('by_last')]], p.sort === 'last' ? 'last' : 'first', (v) => save({ sort: v }), { ...md, 'aria-label': t('sort_by') })),
    row(t('show_as'), t('show_as_t'), select(null, [['first', t('first_last')], ['last', t('last_first')]], p.show === 'last' ? 'last' : 'first', (v) => save({ show: v }), { ...md, 'aria-label': t('show_as') })));

  // ---------------------------------------------------------------- look and language
  const look = () => {
    const theme = h('sav-theme-choice', { value: p.theme || 'auto', appearance: 'buttons', size: 'sm', 'aria-label': t('theme') });
    theme.addEventListener('change', (e) => save({ theme: e.detail?.value ?? theme.value }, true));
    return section(t('look_app'), null, row(t('theme'), null, theme), row(t('language'), null, select(null, [['it', 'Italiano'], ['en', 'English']], getLang(), async (v) => { setLang(v); u.lang = v; await api('auth.profile', { lang: v }).catch(fail); go('#/settings/look'); }, { ...md, 'aria-label': t('language') })));
  };

  // ---------------------------------------------------------------- data
  const del = () => {
    const f = u.hasPassword ? h('sav-input', { label: t('password'), type: 'password', 'password-toggle': true, autocomplete: 'current-password' }) : null;
    dialog({ title: t('delete_account'), width: '28rem', body: h('div.form', h('p', t('delete_account_text')), f), actions: [{ label: t('cancel') }, { label: t('delete_forever'), danger: true, run: async () => { await api('auth.delete', { password: f?.value || '' }); S.user = null; S.groups = []; S.contacts = []; S.ready = false; go('#/welcome'); } }] });
  };
  const data = () => section(t('your_data'), t('your_data_t'),
    row(t('export_data'), t('export_data_t'), small(t('export_data'), { icon: 'download', onclick: async () => { try { const r = await fetch('api/?r=auth.export', { cache: 'no-store' }); if (!r.ok) throw Object.assign(new Error(), { code: 'server' }); download(await r.blob(), 'savcontacts-data.json'); } catch (e) { fail(Object.assign(e, { code: e.code || 'network' })); } } })),
    row(t('export'), t('import_t'), small(t('export'), { icon: 'download', onclick: () => import('./files.js').then((m) => m.exportDialog({})) })),
    row(t('import_file'), t('import_t'), small(t('import_file'), { icon: 'file-up', onclick: () => import('./files.js').then((m) => m.importDialog()) })),
    row(t('delete_account'), t('delete_account_short'), btn(t('delete_account'), { icon: 'trash', variant: 'danger', appearance: 'soft', size: 'sm', onclick: del })));

  // ---------------------------------------------------------------- phones and other apps (CardDAV, dav/index.php)
  const devices = () => {
    const box = h('div.stack', h('div.wait', h('sav-spinner')));
    const draw = (d) => {
      const list = d.passwords.length
        ? d.passwords.map((p) => row(p.name, p.used ? t('dav_used', { w: when(p.used) }) : t('dav_never'), btn(t('dav_revoke'), { size: 'sm', appearance: 'outline', icon: 'trash', onclick: async () => {
          if (!(await confirm(t('dav_revoke_q', { n: p.name }), t('dav_revoke_t'), t('dav_revoke')))) return;
          draw({ ...d, passwords: (await api('con.dav.revoke', { id: p.id })).passwords });
        } })))
        : [h('div.orow', h('div.orow-t', h('small', t('dav_none'))))];
      put(box, section(t('g_devices'), t('g_devices_t'),
        row(t('dav_server'), t('dav_server_t'), h('div.prow', h('code.dcode', d.url), iconBtn('copy', t('copy'), () => copyText(d.url)))),
        row(t('dav_user'), t('dav_user_t'), h('div.prow', h('code.dcode', d.user), iconBtn('copy', t('copy'), () => copyText(d.user))))),
      h('div.osec', h('div.prow.wrap', h('h2', t('dav_passwords')), h('span.grow'), primary(t('dav_new'), { size: 'sm', icon: 'plus', onclick: () => newPassword(d) })),
        h('p.muted', t('dav_passwords_t')), h('sav-card.ocard', { appearance: 'outlined' }, h('div.orows', list))),
      h('div.osec', h('h2', t('dav_how')), h('sav-card.ocard', { appearance: 'outlined' }, h('div.orows',
        row('iPhone · iPad · Mac', t('dav_ios'), null), row('Android', t('dav_android'), null), row('Thunderbird', t('dav_tb'), null)))));
    };
    /** A new password: shown once, with a button that tries it on this server (the hosting must let WebDAV through). */
    const newPassword = (d) => {
      const name = h('sav-input', { label: t('dav_device'), placeholder: t('dav_device_ph'), maxlength: 60, autofocus: true });
      dialog({ title: t('dav_new'), width: '28rem', body: h('div.form', h('p.muted', t('dav_new_t')), name), actions: [{ label: t('cancel') }, { label: t('create'), primary: true, run: async () => {
        const r = await api('con.dav.password', { name: name.value });
        draw({ ...d, passwords: r.passwords });
        showPassword(d, r.password);
      } }] });
    };
    const showPassword = (d, pw) => {
      const out = h('div.dtest');
      const test = async () => {
        put(out, h('sav-spinner'));
        const auth = 'Basic ' + btoa(String.fromCharCode(...new TextEncoder().encode(d.user + ':' + pw)));
        let code = 0;
        try { code = (await fetch('dav/', { method: 'PROPFIND', headers: { Authorization: auth, Depth: '0', 'Content-Type': 'application/xml', 'X-SavContacts-Test': '1' }, body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>', cache: 'no-store', credentials: 'omit' })).status; } catch { code = -1; }
        const ok = code === 207;
        put(out, h('sav-alert', { variant: ok ? 'success' : 'danger', appearance: 'soft' }, ok ? t('dav_test_ok') : code === 401 ? t('dav_test_auth') : [405, 501, 403, 400].includes(code) ? t('dav_test_method', { c: code }) : t('dav_test_other', { c: code })));
      };
      dialog({ title: t('dav_ready'), width: '30rem', body: h('div.form', h('p', t('dav_ready_t')), h('div.prow', h('code.dpw', pw), iconBtn('copy', t('copy'), () => copyText(pw))),
        h('div.orows.dsum', row(t('dav_server'), null, h('code.dcode', d.url)), row(t('dav_user'), null, h('code.dcode', d.user))), btn(t('dav_test'), { icon: 'refresh', size: 'sm', onclick: test }), out),
        actions: [{ label: t('done'), primary: true }] });
    };
    api('con.dav').then(draw).catch((e) => { fail(e); put(box, empty('circle-alert', t('err_server'), '')); });
    return box;
  };

  const SECTIONS = [['account', 'user', t('g_account'), account], ['contacts', 'contact', t('g_contacts'), contacts], ['devices', 'smartphone', t('g_devices'), devices], ['look', 'palette', t('look_app'), look], ['data', 'shield', t('your_data'), data]];
  const tabs = h('sav-tabs.otabs', { placement: mobile() ? null : 'start', active: SECTIONS.some((s) => s[0] === want) ? want : 'account' }, SECTIONS.map(([k, ic, label, body]) => h('sav-tab', { name: k, label, icon: ic }, body())));
  tabs.addEventListener('sav-tab-show', (e) => history.replaceState(null, '', '#/settings/' + e.detail.name));

  put(root, h('div.home.setp', h('header.htop', brand(), h('div.spacer'), userMenu()),
    h('main.smain', h('div.shd', btn(t('back_contacts'), { icon: 'arrow-left', appearance: 'ghost', onclick: () => go('#/') }), h('h1', t('settings'))), h('p.muted', t('settings_t')), tabs), credit()));
  document.title = t('settings') + ' – SavContacts';
}
