/** Settings: a page of its own, one section at a time chosen on the side, as in SavPresentations and SavSchedules. */
import { btn, dialog, fail, h, mobile, put, select, toast } from './ui.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api, offline } from './store.js';
import { brand, credit, go, prefs, setPrefs, setUser, signOut, userMenu } from './account.js';
import { DEFAULTS, LOOKS, SIZES } from './settings.js';
import { pageForm, styleForm } from './panels.js';
import { fontDialog, fontOptions, withFont } from './fonts.js';
import { download } from './files.js';

export function settingsScreen(root, want = '') {
  const u = S.user, p = prefs(), md = { size: 'sm' };
  const saved = () => toast(t('settings_saved'), 'success');
  const save = (x, quiet) => setPrefs(x).then(() => { if (!quiet) saved(); }).catch(fail);
  /** A line of a section: what it is on the left, the control on the right. */
  const row = (label, help, control) => h('div.orow', h('div.orow-t', h('b', label), help ? h('small', help) : null), h('div.orow-c', control));
  const sw = (k, label, help, def = true) => { const s = h('sav-switch', { checked: (p[k] ?? def) || null, 'aria-label': label }); s.addEventListener('change', () => save({ [k]: s.checked }, true)); return row(label, help, s); };
  const section = (title, text, ...rows) => h('div.osec', h('h2', title), text ? h('p.muted', text) : null, h('sav-card.ocard', { appearance: 'outlined' }, h('div.orows', rows.filter(Boolean))));
  const small = (label, o) => btn(label, { size: 'sm', appearance: 'outline', ...o });

  // ---------------------------------------------------------------- account
  const name = h('sav-input', { value: u.name, maxlength: 80, size: 'sm', 'aria-label': t('your_name') });
  name.addEventListener('keydown', (e) => e.stopPropagation());
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

  // ---------------------------------------------------------------- new documents: the most used choices here, everything else in "All options"
  const defs = () => ({ ...structuredClone(DEFAULTS), lang: getLang(), ...(prefs().defaults || {}) });
  const setDef = (x) => save({ defaults: { ...(prefs().defaults || {}), ...x } });
  const d = defs();
  const allDefaults = () => {
    const s = defs(), up = (x) => Object.assign(s, x);
    dialog({ title: t('g_defaults'), width: '34rem', body: h('sav-tabs', h('sav-tab', { label: t('tab_page') }, pageForm(s, up)), h('sav-tab', { label: t('tab_style') }, styleForm(s, up))), actions: [{ label: t('reset'), run: async () => { await setPrefs({ defaults: null }); saved(); go('#/settings/new'); } }, { label: t('cancel') }, { label: t('save'), primary: true, run: async () => { await setPrefs({ defaults: s }); saved(); go('#/settings/new'); } }] });
  };
  const newDocs = () => section(t('g_defaults'), t('defaults_text'),
    row(t('o_size'), null, select(null, Object.keys(SIZES).map((k) => [k, `${k} · ${SIZES[k].join(' × ')} mm`]), d.size === 'custom' ? 'A4' : d.size, (v) => setDef({ size: v }), { ...md, 'aria-label': t('o_size') })),
    row(t('o_orient'), null, select(null, [['0', t('portrait')], ['1', t('landscape')]], d.landscape ? '1' : '0', (v) => setDef({ landscape: v === '1' }), { ...md, 'aria-label': t('o_orient') })),
    row(t('look'), t('look_t'), select(null, [['', t('look_none')], ...Object.keys(LOOKS).map((k) => [k, t('look_' + k)])], '', (v) => { if (v) setDef(LOOKS[v]); }, { ...md, 'aria-label': t('look') })),
    row(t('font'), null, select(null, fontOptions(d.fonts), d.font, (v) => { if (v !== '__more') return setDef({ font: v, headFont: v }); fontDialog({ current: d.font, used: d.fonts, onpick: (f) => { setDef({ font: f.n, headFont: f.n, fonts: withFont(d.fonts, f) }); go('#/settings/new'); } }); }, { ...md, searchable: true, 'aria-label': t('font') })),
    row(t('doc_lang'), t('doc_lang_t'), select(null, [['it', 'Italiano'], ['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español'], ['pt', 'Português'], ['nl', 'Nederlands'], ['pl', 'Polski'], ['ro', 'Română']], d.lang, (v) => setDef({ lang: v }), { ...md, 'aria-label': t('doc_lang') })),
    row(t('all_options'), t('all_options_t'), small(t('all_options'), { icon: 'sliders-horizontal', onclick: allDefaults })));

  // ---------------------------------------------------------------- editor
  const editor = () => section(t('g_editor'), t('editor_t'),
    sw('spellcheck', t('g_spellcheck')), sw('autoformat', t('g_autoformat'), t('g_autoformat_t')), sw('bubble', t('g_bubble')), sw('rulers', t('g_rulers')), sw('outline', t('g_outline')),
    row(t('toolbar_reset'), t('toolbar_reset_t'), small(t('reset'), { icon: 'settings-2', onclick: () => save({ tools: null }) })));

  // ---------------------------------------------------------------- sharing
  const sharing = () => section(t('sharing'), t('sharing_t'),
    row(t('access_new'), null, select(null, [['private', t('v_private')], ['link', t('v_link')]], p.access || 'private', (v) => save({ access: v }), { ...md, 'aria-label': t('access_new') })),
    row(t('link_role_new'), null, select(null, [['viewer', t('r_viewer')], ['commenter', t('r_commenter')], ['editor', t('r_editor')]], p.linkRole || 'viewer', (v) => save({ linkRole: v }), { ...md, 'aria-label': t('link_role_new') })),
    sw('mailShare', t('mail_share')));

  // ---------------------------------------------------------------- look and language
  const look = () => {
    const theme = h('sav-theme-choice', { value: p.theme || 'auto', appearance: 'buttons', size: 'sm', 'aria-label': t('theme') });
    theme.addEventListener('change', (e) => save({ theme: e.detail?.value ?? theme.value }, true));
    return section(t('look_app'), null, row(t('theme'), null, theme), row(t('language'), null, select(null, [['it', 'Italiano'], ['en', 'English']], getLang(), async (v) => { setLang(v); u.lang = v; await api('auth.profile', { lang: v }).catch(fail); go('#/settings/look'); }, { ...md, 'aria-label': t('language') })));
  };

  // ---------------------------------------------------------------- offline: copies of the recent documents in this browser
  const offlineSec = () => {
    const count = h('small'), showCount = async () => { put(count, t('offline_n', { n: (await offline.docs()).length })); };
    const off = h('sav-switch', { checked: p.offline !== false || null, 'aria-label': t('offline_keep') });
    off.addEventListener('change', async () => { await save({ offline: off.checked }, true); if (!off.checked) await offline.clear(); showCount(); });
    showCount();
    return section(t('offline_title'), t('offline_text'), row(t('offline_keep'), t('offline_help'), off), h('div.orow', h('div.orow-t', h('b', t('offline_clear')), count), h('div.orow-c', small(t('offline_clear'), { icon: 'trash', onclick: async () => { await offline.clear(); showCount(); saved(); } }))));
  };

  // ---------------------------------------------------------------- data
  const del = () => {
    const f = u.hasPassword ? h('sav-input', { label: t('password'), type: 'password', 'password-toggle': true, autocomplete: 'current-password' }) : null;
    dialog({ title: t('delete_account'), width: '28rem', body: h('div.form', h('p', t('delete_account_text')), f), actions: [{ label: t('cancel') }, { label: t('delete_forever'), danger: true, run: async () => { await api('auth.delete', { password: f?.value || '' }); await offline.clear(); offline.rememberUser(null); S.user = null; go('#/welcome'); } }] });
  };
  const data = () => section(t('your_data'), t('your_data_t'),
    row(t('export_data'), t('export_data_t'), small(t('export_data'), { icon: 'download', onclick: async () => { try { const r = await fetch('api/?r=auth.export', { cache: 'no-store' }); if (!r.ok) throw Object.assign(new Error(), { code: 'server' }); download(await r.blob(), 'savbooks-data.json'); } catch (e) { fail(Object.assign(e, { code: e.code || 'network' })); } } })),
    row(t('delete_account'), t('delete_account_short'), btn(t('delete_account'), { icon: 'trash', variant: 'danger', appearance: 'soft', size: 'sm', onclick: del })));

  const SECTIONS = [['account', 'user', t('g_account'), account], ['new', 'file-text', t('g_defaults'), newDocs], ['editor', 'pencil', t('g_editor'), editor], ['sharing', 'users', t('sharing'), sharing], ['look', 'palette', t('look_app'), look], ['offline', 'cloud-off', t('offline_title'), offlineSec], ['data', 'shield', t('your_data'), data]];
  const tabs = h('sav-tabs.otabs', { placement: mobile() ? null : 'start', active: SECTIONS.some((s) => s[0] === want) ? want : 'account' }, SECTIONS.map(([k, ic, label, body]) => h('sav-tab', { name: k, label, icon: ic }, body())));
  tabs.addEventListener('sav-tab-show', (e) => history.replaceState(null, '', '#/settings/' + e.detail.name));

  put(root, h('div.home.setp', h('header.htop', brand(), h('div.spacer'), userMenu()),
    h('main.smain', h('div.shd', btn(t('home'), { icon: 'arrow-left', appearance: 'ghost', onclick: () => go('#/') }), h('h1', t('settings'))), h('p.muted', t('settings_t')), tabs), credit()));
  document.title = t('settings') + ' – SavBooks';
}
