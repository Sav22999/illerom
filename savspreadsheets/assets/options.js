/** Settings: a page of its own, one section at a time chosen on the side, as in SavPresentations and SavSchedules. */
import { btn, dialog, fail, h, mobile, put, select, toast } from './ui.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api, offline } from './store.js';
import { brand, credit, go, prefs, setPrefs, setUser, signOut, userMenu } from './account.js';
import { download } from './files.js';
import { LOCALES, formatValue } from './format.js';

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

  // ---------------------------------------------------------------- new workbooks: how their numbers and dates are shown
  const d = { bookLang: getLang() === 'it' ? 'it' : 'en', currency: 'EUR', ...(prefs().defaults || {}) };
  const setDef = (x) => save({ defaults: { ...(prefs().defaults || {}), ...x } });
  const sample = h('small');
  const showSample = (l) => put(sample, t('nf_preview') + ' ' + formatValue(1234.5, '#,##0.00', LOCALES[l] || LOCALES.en).text + ' · ' + formatValue(46351, 'd mmmm yyyy', LOCALES[l] || LOCALES.en).text);
  showSample(d.bookLang);
  const newDocs = () => section(t('g_defaults'), t('defaults_text'),
    row(t('book_lang'), sample, select(null, Object.keys(LOCALES).map((k) => [k, t('loc_' + k)]), d.bookLang, (v) => { showSample(v); setDef({ bookLang: v }); }, { ...md, 'aria-label': t('book_lang') })),
    row(t('currency'), null, select(null, ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CNY', 'INR', 'BRL', 'SEK', 'PLN'].map((k) => [k, k]), d.currency, (v) => setDef({ currency: v }), { ...md, 'aria-label': t('currency') })),
    h('div.orow', h('div.orow-t', h('b', t('formulas_english')), h('small', t('formulas_english_t')))));

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
    row(t('export_data'), t('export_data_t'), small(t('export_data'), { icon: 'download', onclick: async () => { try { const r = await fetch('api/?r=auth.export', { cache: 'no-store' }); if (!r.ok) throw Object.assign(new Error(), { code: 'server' }); download(await r.blob(), 'savspreadsheets-data.json'); } catch (e) { fail(Object.assign(e, { code: e.code || 'network' })); } } })),
    row(t('delete_account'), t('delete_account_short'), btn(t('delete_account'), { icon: 'trash', variant: 'danger', appearance: 'soft', size: 'sm', onclick: del })));

  const SECTIONS = [['account', 'user', t('g_account'), account], ['new', 'sheet', t('g_defaults'), newDocs], ['sharing', 'users', t('sharing'), sharing], ['look', 'palette', t('look_app'), look], ['offline', 'cloud-off', t('offline_title'), offlineSec], ['data', 'shield', t('your_data'), data]];
  const tabs = h('sav-tabs.otabs', { placement: mobile() ? null : 'start', active: SECTIONS.some((s) => s[0] === want) ? want : 'account' }, SECTIONS.map(([k, ic, label, body]) => h('sav-tab', { name: k, label, icon: ic }, body())));
  tabs.addEventListener('sav-tab-show', (e) => history.replaceState(null, '', '#/settings/' + e.detail.name));

  put(root, h('div.home.setp', h('header.htop', brand(), h('div.spacer'), userMenu()),
    h('main.smain', h('div.shd', btn(t('home'), { icon: 'arrow-left', appearance: 'ghost', onclick: () => go('#/') }), h('h1', t('settings'))), h('p.muted', t('settings_t')), tabs), credit()));
  document.title = t('settings') + ' – SavSpreadsheets';
}
