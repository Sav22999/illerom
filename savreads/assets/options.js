/** Settings: a page of its own, one section at a time chosen on the side, as in the other apps of SavOffice. */
import { btn, copyText, dialog, fail, h, mobile, put, select, toast } from './ui.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api } from './store.js';
import { brand, credit, go, prefs, setPrefs, setUser, signOut, userMenu } from './account.js';
import { download } from './files.js';
import { bookmarklet, importFile, pickFile } from './actions.js';
import { FONTS, WIDTHS } from './reader.js';
import { forgetKept, keepOffline, keptCount } from './offline.js';

export function settingsScreen(root, want = '') {
  const u = S.user, p = prefs(), md = { size: 'sm' };
  const saved = () => toast(t('settings_saved'), 'success');
  const save = (x, quiet) => setPrefs(x).then(() => { if (!quiet) saved(); }).catch(fail);
  const row = (label, help, control) => h('div.orow', h('div.orow-t', h('b', label), help ? h('small', help) : null), h('div.orow-c', control));
  const section = (title, text, ...rows) => h('div.osec', h('h2', title), text ? h('p.muted', text) : null, h('sav-card.ocard', { appearance: 'outlined' }, h('div.orows', rows.filter(Boolean))));
  const small = (label, o) => btn(label, { size: 'sm', appearance: 'outline', ...o });
  const sw = (k, label, help, def = true) => { const s = h('sav-switch', { checked: (p[k] ?? def) !== false || null, 'aria-label': label }); s.addEventListener('change', () => save({ [k]: s.checked })); return row(label, help, s); };

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

  // ---------------------------------------------------------------- reading
  const sample = h('div.osample', h('b', t('land_title')), h('p', t('land_text')));
  const look = () => { sample.style.fontFamily = FONTS[prefs().rFont || 'serif']; sample.style.fontSize = (prefs().rSize || 19) + 'px'; sample.style.lineHeight = String(prefs().rLine || 1.65); sample.dataset.page = prefs().rTheme || 'auto'; };
  const setLook = (x) => { save(x, true); look(); };
  look();
  const reading = () => section(t('g_reading'), t('g_reading_t'),
    h('div.orow.osamplerow', sample),
    row(t('font'), null, select(null, [['serif', t('f_serif')], ['sans', t('f_sans')], ['mono', t('f_mono')]], p.rFont || 'serif', (v) => setLook({ rFont: v }), { ...md, 'aria-label': t('font') })),
    row(t('size'), null, select(null, [14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 26, 28].map((v) => [String(v), v + ' px']), String(p.rSize || 19), (v) => setLook({ rSize: +v }), { ...md, 'aria-label': t('size') })),
    row(t('line'), null, select(null, [1.3, 1.45, 1.55, 1.65, 1.8, 1.95, 2.1].map((v) => [String(v), String(v).replace('.', getLang() === 'it' ? ',' : '.')]), String(p.rLine || 1.65), (v) => setLook({ rLine: +v }), { ...md, 'aria-label': t('line') })),
    row(t('width'), null, select(null, Object.keys(WIDTHS).map((v) => [v, t('w_' + v)]), p.rWidth || 'medium', (v) => setLook({ rWidth: v }), { ...md, 'aria-label': t('width') })),
    row(t('page'), null, select(null, ['auto', 'light', 'sepia', 'dark'].map((v) => [v, t('t_' + v)]), p.rTheme || 'auto', (v) => setLook({ rTheme: v }), { ...md, 'aria-label': t('page') })),
    row(t('wpm'), t('wpm_t'), select(null, [150, 180, 200, 230, 260, 300, 350, 400].map((v) => [String(v), t('wpm_v', { n: v })]), String(p.wpm || 230), (v) => save({ wpm: +v }), { ...md, 'aria-label': t('wpm') })),
    sw('images', t('show_images'), t('show_images_t')),
    sw('autoArchive', t('auto_archive'), t('auto_archive_t'), false));

  // ---------------------------------------------------------------- offline
  const keptInfo = h('small', t('offline_kept', { n: keptCount() }));
  const offline = () => section(t('g_offline'), null,
    sw('offline', t('offline'), t('offline_t')),
    row(t('offline_n'), keptInfo, h('div.prow', select(null, [10, 30, 50, 100].map((v) => [String(v), String(v)]), String(p.offlineN || 30), (v) => save({ offlineN: +v }), { ...md, 'aria-label': t('offline_n') }),
      small(t('offline_now_btn'), { icon: 'download', onclick: async () => { forgetKept(); const r = await api('rd.list', null, { view: 'unread' }); await keepOffline(r.articles); keptInfo.textContent = t('offline_kept', { n: keptCount() }); } }))));

  // ---------------------------------------------------------------- feeds
  const feeds = () => section(t('g_feeds_s'), t('g_feeds_s_t'),
    sw('feedsUnread', t('feeds_unread'), t('feeds_unread_t')),
    sw('openRead', t('open_read'), t('open_read_t')),
    row(t('import_opml'), t('import_opml_t'), small(t('import_opml'), { icon: 'file-up', onclick: async () => importFile('opml', await pickFile('.opml,.xml,text/xml,text/x-opml')) })),
    row(t('export_opml'), t('export_opml_t'), small(t('export_opml'), { icon: 'file-down', disabled: !S.subs.length || null, onclick: () => { location.href = 'api/?r=rd.opml.export'; } })));

  // ---------------------------------------------------------------- saving: bookmarklet, share menu, links
  const saving = () => {
    const bm = h('a.bmlet', { href: bookmarklet(), title: t('bookmarklet_btn'), onclick: (e) => { e.preventDefault(); toast(t('bookmarklet_t'), 'neutral'); } }, h('img', { src: 'icons/favicon.svg', alt: '', width: 18, height: 18 }), t('bookmarklet_btn'));
    const link = new URL('./?save=', location.href).href;
    let deferred = window.__savreadsInstall;
    const inst = small(t('install'), { icon: 'smartphone', hidden: !deferred || null, onclick: async () => { deferred = window.__savreadsInstall; if (!deferred) return; deferred.prompt(); const r = await deferred.userChoice; if (r.outcome === 'accepted') toast(t('installed_ok'), 'success'); } });
    return section(t('g_saving'), t('g_saving_t'),
      row(t('bookmarklet'), t('bookmarklet_t'), h('div.prow.wrap', bm, small(t('bookmarklet_copy'), { icon: 'copy', onclick: () => copyText(bookmarklet()) }))),
      row(t('share_target'), t('share_target_t'), inst),
      row(t('by_link'), t('by_link_t'), h('code.ocode', link + 'https://…')));
  };

  // ---------------------------------------------------------------- import and export
  const imp = (kind, accept) => small(t('choose_file'), { icon: 'file-up', onclick: async () => importFile(kind, await pickFile(accept)) });
  const files = () => section(t('g_import'), t('g_import_t'),
    row(t('imp_pocket'), t('imp_pocket_t'), imp('pocket', '.csv,.html,.htm,text/csv,text/html')),
    row(t('imp_instapaper'), t('imp_instapaper_t'), imp('instapaper', '.csv,text/csv')),
    row(t('imp_savrea'), t('imp_savrea_t'), imp('savrea', '.savrea,application/json')),
    row(t('exp_savrea'), t('exp_savrea_t'), small(t('exp_savrea'), { icon: 'file-down', onclick: () => { location.href = 'api/?r=rd.export'; } })));

  // ---------------------------------------------------------------- look and language
  const lookApp = () => {
    const theme = h('sav-theme-choice', { value: p.theme || 'auto', appearance: 'buttons', size: 'sm', 'aria-label': t('theme') });
    theme.addEventListener('change', (e) => save({ theme: e.detail?.value ?? theme.value }, true));
    return section(t('look_app'), null, row(t('theme'), null, theme), row(t('language'), null, select(null, [['it', 'Italiano'], ['en', 'English']], getLang(), async (v) => { setLang(v); u.lang = v; await api('auth.profile', { lang: v }).catch(fail); go('#/settings/look'); }, { ...md, 'aria-label': t('language') })));
  };

  // ---------------------------------------------------------------- data
  const del = () => {
    const f = u.hasPassword ? h('sav-input', { label: t('password'), type: 'password', 'password-toggle': true, autocomplete: 'current-password' }) : null;
    dialog({ title: t('delete_account'), width: '28rem', body: h('div.form', h('p', t('delete_account_text')), f), actions: [{ label: t('cancel') }, { label: t('delete_forever'), danger: true, run: async () => { await api('auth.delete', { password: f?.value || '' }); S.user = null; S.subs = []; forgetKept(); go('#/welcome'); } }] });
  };
  const data = () => section(t('your_data'), t('your_data_t'),
    row(t('export_data'), t('export_data_t'), small(t('export_data'), { icon: 'download', onclick: async () => { try { const r = await fetch('api/?r=auth.export', { cache: 'no-store' }); if (!r.ok) throw Object.assign(new Error(), { code: 'server' }); download(await r.blob(), 'savreads-data.json'); } catch (e) { fail(Object.assign(e, { code: e.code || 'network' })); } } })),
    row(t('delete_account'), t('delete_account_short'), btn(t('delete_account'), { icon: 'trash', variant: 'danger', appearance: 'soft', size: 'sm', onclick: del })));

  const SECTIONS = [['account', 'user', t('g_account'), account], ['reading', 'glasses', t('g_reading'), reading], ['offline', 'wifi-off', t('g_offline'), offline], ['feeds', 'rss', t('g_feeds_s'), feeds], ['saving', 'bookmark-plus', t('g_saving'), saving], ['import', 'file-up', t('g_import'), files], ['look', 'palette', t('look_app'), lookApp], ['data', 'shield', t('your_data'), data]];
  const tabs = h('sav-tabs.otabs', { placement: mobile() ? null : 'start', active: SECTIONS.some((s) => s[0] === want) ? want : 'account' }, SECTIONS.map(([k, ic, label, body]) => h('sav-tab', { name: k, label, icon: ic }, body())));
  tabs.addEventListener('sav-tab-show', (e) => history.replaceState(null, '', '#/settings/' + e.detail.name));

  put(root, h('div.home.setp', h('header.htop', brand(), h('div.spacer'), userMenu()),
    h('main.smain', h('div.shd', btn(t('home'), { icon: 'arrow-left', appearance: 'ghost', onclick: () => go('#/') }), h('h1', t('settings'))), h('p.muted', t('settings_t')), tabs), credit()));
  document.title = t('settings') + ' – SavReads';
}

export { put };
