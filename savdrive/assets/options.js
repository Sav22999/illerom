/** Settings: a page of its own, one section at a time chosen on the side, as in the other apps of SavOffice. */
import { btn, dialog, fail, h, mobile, put, select, toast } from './ui.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api, forgetThumbs } from './store.js';
import { brand, credit, go, prefs, setPrefs, setUser, signOut, userMenu } from './account.js';
import { PREVIEW_KINDS, bytes, previewOn, spaceParts, unlimited } from './drive.js';

export function settingsScreen(root, want = '') {
  const u = S.user, p = prefs(), md = { size: 'sm' };
  const saved = () => toast(t('settings_saved'), 'success');
  const save = (x, quiet) => setPrefs(x).then(() => { if (!quiet) saved(); }).catch(fail);
  const row = (label, help, control) => h('div.orow', h('div.orow-t', h('b', label), help ? h('small', help) : null), h('div.orow-c', control));
  const section = (title, text, ...rows) => h('div.osec', h('h2', title), text ? h('p.muted', text) : null, h('sav-card.ocard', { appearance: 'outlined' }, h('div.orows', rows.filter(Boolean))));
  const small = (label, o) => btn(label, { size: 'sm', appearance: 'outline', ...o });

  const name = h('sav-input', { value: u.name, maxlength: 80, size: 'sm', 'aria-label': t('your_name') });
  name.addEventListener('change', async () => { if (!name.value.trim()) return; try { const r = await api('auth.profile', { name: name.value, lang: getLang() }); setUser({ ...r.user, prefs: prefs() }); saved(); } catch (e) { fail(e); } });
  const password = () => {
    const cur = h('sav-input', { label: t('current_pw'), type: 'password', 'password-toggle': true, autocomplete: 'current-password' }), pw = h('sav-input', { label: t('new_password'), type: 'password', 'password-toggle': true, autocomplete: 'new-password', help: t('pw_hint') });
    dialog({ title: t(u.hasPassword ? 'change_pw' : 'set_pw'), width: '26rem', body: h('div.form', u.hasPassword ? cur : null, pw), actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => { const r = await api('auth.password', { current: cur.value, password: pw.value }); setUser({ ...r.user, prefs: prefs() }); u.hasPassword = true; saved(); } }] });
  };
  const account = () => section(t('g_account'), u.email,
    row(t('your_name'), t('name_t'), name),
    row(t('password'), t(u.hasPassword ? 'password_t' : 'password_none_t'), small(t(u.hasPassword ? 'change_pw' : 'set_pw'), { onclick: password })),
    window.Identity ? row(t('sign_in_ways'), t('sign_in_ways_t'), small(window.Identity.text('methods'), { icon: 'shield', onclick: () => window.Identity.methods() })) : null,
    row(t('sign_out'), t('sign_out_t'), small(t('sign_out'), { icon: 'log-out', onclick: () => signOut() })));

  const space = () => {
    const pc = u.quota ? Math.min(100, (u.used / u.quota) * 100) : 0;
    return section(t('space'), t('space_t'),
      h('div.orow', h('div.orow-t', h('b', unlimited(u.quota) ? t('space_used_unl', { used: bytes(u.used) }) + ' · ' + t('unlimited').toLowerCase() : t('space_used', { used: bytes(u.used), quota: bytes(u.quota) })), unlimited(u.quota) ? null : h('sav-progress-bar', { value: Math.max(pc, u.used ? 1 : 0), max: 100, 'aria-label': t('space') }), Object.keys(u.parts || {}).length ? h('ul.qparts', spaceParts(u.parts)) : null, h('small', t('space_more')))),
      row(t('trash'), t('space_trash'), small(t('trash'), { icon: 'trash-2', onclick: () => go('#/trash') })));
  };

  const drive = () => section(t('g_drive'), null,
    row(t('view'), null, select(null, [['grid', t('v_grid')], ['list', t('v_list')]], p.view || (mobile() ? 'list' : 'grid'), (v) => save({ view: v }), { ...md, 'aria-label': t('view') })),
    row(t('sort'), null, select(null, ['name', 'updated', 'size'].map((k) => [k, t('sort_' + k)]), p.sort || 'name', (v) => save({ sort: v }), { ...md, 'aria-label': t('sort') })),
    // which kinds of files show what is inside them in the cards: one choice for each
    h('div.orow.pvkinds', h('div.orow-t', h('b', t('previews')), h('small', t('previews_t')),
      h('div.pvlist', { role: 'group', 'aria-label': t('previews') }, PREVIEW_KINDS.map((k) => {
        const c = h('sav-checkbox', { checked: previewOn(k) || null, help: t('pv_' + k + '_t') }, t('pv_' + k));
        c.addEventListener('change', () => save({ previews: Object.fromEntries(PREVIEW_KINDS.map((x) => [x, x === k ? !!c.checked : previewOn(x)])) }, true));
        return c;
      })))),
    row(t('create_office'), t('create_office_t'), (() => { const s = h('sav-switch', { checked: !p.hideOffice || null, 'aria-label': t('create_office') }); s.addEventListener('change', () => save({ hideOffice: !s.checked }, true)); return s; })()));

  const look = () => {
    const theme = h('sav-theme-choice', { value: p.theme || 'auto', appearance: 'buttons', size: 'sm', 'aria-label': t('theme') });
    theme.addEventListener('change', (e) => save({ theme: e.detail?.value ?? theme.value }, true));
    return section(t('look_app'), null, row(t('theme'), null, theme), row(t('language'), null, select(null, [['it', 'Italiano'], ['en', 'English']], getLang(), async (v) => { setLang(v); u.lang = v; await api('auth.profile', { lang: v }).catch(fail); go('#/settings/look'); }, { ...md, 'aria-label': t('language') })));
  };

  const del = () => {
    const f = u.hasPassword ? h('sav-input', { label: t('password'), type: 'password', 'password-toggle': true, autocomplete: 'current-password' }) : null;
    dialog({ title: t('delete_account'), width: '28rem', body: h('div.form', h('p', t('delete_account_text')), f), actions: [{ label: t('cancel') }, { label: t('delete_forever'), danger: true, run: async () => { await api('auth.delete', { password: f?.value || '' }); S.user = null; forgetThumbs(); go('#/welcome'); } }] });
  };
  const data = () => section(t('your_data'), t('your_data_t'),
    row(t('export_data'), t('export_data_t'), small(t('export_data'), { icon: 'download', href: 'api/?r=auth.export', download: 'savdrive-data.json' })),
    u.master ? null : row(t('delete_account'), t('delete_account_short'), btn(t('delete_account'), { icon: 'trash-2', variant: 'danger', appearance: 'soft', size: 'sm', onclick: del })));

  const SECTIONS = [['account', 'user', t('g_account'), account], ['space', 'hard-drive', t('space'), space], ['drive', 'folder', t('g_drive'), drive], ['look', 'palette', t('look_app'), look], ['data', 'shield', t('your_data'), data]];
  const tabs = h('sav-tabs.otabs', { placement: mobile() ? null : 'start', active: SECTIONS.some((s) => s[0] === want) ? want : 'account' }, SECTIONS.map(([k, ic, label, body]) => h('sav-tab', { name: k, label, icon: ic }, body())));
  tabs.addEventListener('sav-tab-show', (e) => history.replaceState(null, '', '#/settings/' + e.detail.name));
  put(root, h('div.home.setp', h('header.htop', brand(), h('div.spacer'), userMenu()),
    h('main.smain', h('div.shd', btn(t('back_drive'), { icon: 'arrow-left', appearance: 'ghost', onclick: () => go('#/') }), h('h1', t('settings'))), tabs), credit()));
  document.title = t('settings') + ' – SavDrive';
}
