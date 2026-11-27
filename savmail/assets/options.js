/** Settings: a page of its own, one section at a time chosen on the side, as in the other apps of SavOffice. */
import { btn, confirm, copyText, dialog, errText, fail, h, icon, mobile, put, select, toast } from './ui.js';
import { getLang, setLang, t, when } from './i18n.js';
import { S, api, takeState } from './store.js';
import { go, lockDevice, prefs, setPrefs, setUser, signOut } from './account.js';
import { shell } from './shell.js';

const COLORS = ['#8f6500', '#0f6e56', '#1d4e89', '#b3261e', '#5b4cf0', '#a1328c', '#0b7a87', '#c45a0c', '#4d7c0f', '#5f6660'];

export function settingsScreen(root, want = '') {
  const u = S.user, p = prefs(), md = { size: 'sm' };
  const saved = () => toast(t('settings_saved'), 'success');
  const save = (x, quiet) => setPrefs(x).then(() => { if (!quiet) saved(); }).catch(fail);
  const row = (label, help, control) => h('div.orow', h('div.orow-t', h('b', label), help ? h('small', help) : null), control ? h('div.orow-c', control) : null);
  const section = (title, text, ...rows) => h('div.osec', h('h2', title), text ? h('p.muted', text) : null, h('sav-card.ocard', { appearance: 'outlined' }, h('div.orows', rows.flat().filter(Boolean))));
  const small = (label, o) => btn(label, { size: 'sm', appearance: 'outline', ...o });
  const redraw = (k) => settingsScreen(root, k);

  // ---------------------------------------------------------------- account (the same of SavSchedules)
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

  // ---------------------------------------------------------------- mailboxes
  const mailboxes = () => section(t('g_mailboxes'), t('g_mailboxes_t', { n: S.accounts.length }),
    row(t('manage_addresses'), t('manage_addresses_t'), btn(t('open_addresses'), { size: 'sm', icon: 'at-sign', variant: 'primary', appearance: 'soft', href: '#/addresses' })));

  // ---------------------------------------------------------------- security: the vault on the devices
  const devBox = h('div.orows');
  const loadDevices = async () => {
    try {
      const r = await api('ml.devices');
      S.unlock = r.unlock;
      put(devBox, r.devices.length ? r.devices.map((d) => h('div.orow', icon('smartphone'), h('div.orow-t', h('b', d.label || t('device')), h('small', (d.current ? t('this_device') + ' · ' : '') + t('used_w', { w: when(d.used || d.created) }))),
        h('div.orow-c', btn(t(d.current ? 'lock_device' : 'remove'), { size: 'sm', appearance: 'ghost', variant: d.current ? 'neutral' : 'danger', onclick: async () => { if (d.current) return lockDevice(); await api('ml.device.remove', { id: d.id }); loadDevices(); toast(t('device_removed'), 'success'); } }))))
        : h('div.orow', h('div.orow-t', h('small', t('no_devices')))));
      drawRecovery();
    } catch (e) { put(devBox, h('div.orow', h('small', errText(e)))); }
  };
  const recBox = h('div');
  const drawRecovery = () => put(recBox, row(t('recovery'), t(S.unlock?.recovery ? 'recovery_on' : 'recovery_off'), S.vault === 'open' ? h('div.prow', small(t(S.unlock?.recovery ? 'recovery_new' : 'recovery_make'), { icon: 'key-round', onclick: makeCode }),
    S.unlock?.recovery ? btn(t('remove'), { size: 'sm', appearance: 'ghost', variant: 'danger', onclick: async () => { if (!await confirm(t('recovery_remove_q'), t('recovery_remove_t'), t('remove'))) return; const r = await api('ml.recovery.remove', {}); S.unlock = r.unlock; drawRecovery(); } }) : null) : null));
  const makeCode = async () => {
    if (S.unlock?.recovery && !await confirm(t('recovery_new'), t('recovery_replace_t'), t('recovery_new'), false)) return;
    const r = await api('ml.recovery', {});
    S.unlock = r.unlock;
    drawRecovery();
    dialog({ title: t('recovery'), width: '28rem', body: h('div.stack', h('p', t('recovery_show_t')), h('div.rcode', r.code), h('sav-alert', { variant: 'warning', appearance: 'soft' }, t('recovery_once'))),
      actions: [{ label: t('copy'), run: () => { copyText(r.code); return false; } }, { label: t('recovery_saved'), primary: true }] });
  };
  const startOver = async () => {
    if (!await confirm(t('reset_vault'), t('reset_vault_t'), t('reset_vault_go'))) return;
    takeState(await api('ml.reset', { confirm: true }));
    go('#/');
  };
  const security = () => {
    loadDevices();
    return h('div.osec', h('h2', t('g_security')), h('p.muted', t('g_security_t')),
      h('sav-alert', { variant: 'neutral', appearance: 'soft' }, h('sav-icon', { name: 'lock', slot: 'icon' }), h('b', t('how_safe')), h('div.small', t('how_safe_t'))),
      h('h3.osub', t('devices')), h('sav-card.ocard', { appearance: 'outlined' }, devBox),
      h('sav-card.ocard', { appearance: 'outlined' }, h('div.orows', recBox,
        row(t('lock_device'), t('lock_device_t'), S.vault === 'open' ? small(t('lock_device'), { icon: 'lock', onclick: lockDevice }) : null),
        row(t('reset_vault'), t('reset_vault_short'), btn(t('reset_vault'), { size: 'sm', variant: 'danger', appearance: 'soft', onclick: () => startOver().catch(fail) })))));
  };

  // ---------------------------------------------------------------- look and language
  const look = () => {
    const theme = h('sav-theme-choice', { value: p.theme || 'auto', appearance: 'buttons', size: 'sm', 'aria-label': t('theme') });
    theme.addEventListener('change', (e) => save({ theme: e.detail?.value ?? theme.value }, true));
    return section(t('look_app'), null,
      row(t('theme'), null, theme),
      row(t('every'), t('every_t'), select(null, [['30', t('every_30s')], ['60', t('every_1m')], ['120', t('every_n_min', { n: 2 })], ['300', t('every_n_min', { n: 5 })], ['600', t('every_n_min', { n: 10 })], ['900', t('every_n_min', { n: 15 })], ['0', t('every_never')]], String(p.every ?? 60), (v) => save({ every: Number(v) }), { ...md, 'aria-label': t('every') })),
      row(t('density'), t('density_t'), select(null, [['cozy', t('density_cozy')], ['compact', t('density_compact')]], p.density || 'cozy', (v) => save({ density: v }), { ...md, 'aria-label': t('density') })),
      row(t('sender_icons'), t('sender_icons_t'), (() => { const sw = h('sav-switch', { checked: p.icons !== false || null, 'aria-label': t('sender_icons') }); sw.addEventListener('change', () => save({ icons: sw.checked })); return sw; })()),
      row(t('images'), t('images_t'), select(null, [['ask', t('images_ask')], ['always', t('images_always')]], p.images || 'ask', (v) => save({ images: v }), { ...md, 'aria-label': t('images') })),
      p.imgFrom?.length ? row(t('img_senders', { n: p.imgFrom.length }), t('img_senders_t'), small(t('forget_all'), { onclick: () => { save({ imgFrom: [] }); redraw('look'); } })) : null,
      row(t('language'), null, select(null, [['it', 'Italiano'], ['en', 'English']], getLang(), async (v) => { setLang(v); u.lang = v; await api('auth.profile', { lang: v }).catch(fail); go('#/settings/look'); }, { ...md, 'aria-label': t('language') })));
  };

  // ---------------------------------------------------------------- data
  const del = () => {
    const f = u.hasPassword ? h('sav-input', { label: t('password'), type: 'password', 'password-toggle': true, autocomplete: 'current-password' }) : null;
    dialog({ title: t('delete_account'), width: '28rem', body: h('div.form', h('p', t('delete_account_text')), f), actions: [{ label: t('cancel') }, { label: t('delete_forever'), danger: true, run: async () => { await api('auth.delete', { password: f?.value || '' }); S.user = null; S.accounts = []; go('#/welcome'); } }] });
  };
  const download = (blob, name) => { const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
  const data = () => section(t('your_data'), t('your_data_t'),
    row(t('export_data'), t('export_data_t'), small(t('export_data'), { icon: 'download', onclick: async () => { try { const r = await fetch('api/?r=auth.export', { cache: 'no-store' }); if (!r.ok) throw Object.assign(new Error(), { code: 'server' }); download(await r.blob(), 'savmail-data.json'); } catch (e) { fail(Object.assign(e, { code: e.code || 'network' })); } } })),
    row(t('delete_account'), t('delete_account_short'), btn(t('delete_account'), { icon: 'trash', variant: 'danger', appearance: 'soft', size: 'sm', onclick: del })));

  const SECTIONS = [['account', 'user', t('g_account'), account], ['mailboxes', 'inbox', t('g_mailboxes'), mailboxes], ['security', 'lock', t('g_security'), security], ['look', 'palette', t('look_app'), look], ['data', 'shield', t('your_data'), data]];
  const tabs = h('sav-tabs.otabs', { placement: mobile() ? null : 'start', active: SECTIONS.some((s) => s[0] === want) ? want : 'mailboxes' }, SECTIONS.map(([k, ic, label, body]) => h('sav-tab', { name: k, label, icon: ic }, body())));
  tabs.addEventListener('sav-tab-show', (e) => history.replaceState(null, '', '#/settings/' + e.detail.name));

  shell(root, { current: 'settings', noSide: true, content: h('div.sett', h('div.shd', btn(t('back_mail'), { icon: 'arrow-left', appearance: 'ghost', onclick: () => go('#/') })), h('div.hhead', h('div', h('h1', t('settings')), h('p.muted', t('settings_t')))), tabs) });
  document.title = t('settings') + ' – SavMail';
}
