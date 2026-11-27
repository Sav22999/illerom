/**
 * The settings of SavPhotos, arranged as those of SavDrive (tabs on the side, rows in a card): which photos, the grid,
 * the look, the account (the one of SavDrive) and the data.
 */
import { btn, fail, h, mobile, put, select, toast } from './ui.js';
import { getLang, setLang, t } from './i18n.js';
import { S, API, api, driveUrl } from './store.js';
import { brand, credit, go, prefs, setPrefs, signOut, userMenu } from './account.js';

export function settingsScreen(root, want = '') {
  const u = S.user, p = prefs(), md = { size: 'sm' };
  const saved = () => toast(t('settings_saved'), 'success');
  const save = (x, quiet) => setPrefs(x).then(() => { if (!quiet) saved(); }).catch(fail);
  const row = (label, help, control) => h('div.orow', h('div.orow-t', h('b', label), help ? h('small', help) : null), h('div.orow-c', control));
  const section = (title, text, ...rows) => h('div.osec', h('h2', title), text ? h('p.muted', text) : null, h('sav-card.ocard', { appearance: 'outlined' }, h('div.orows', rows.filter(Boolean))));
  const small = (label, o) => btn(label, { size: 'sm', appearance: 'outline', ...o });

  const photos = () => section(t('s_photos'), t('s_source_t'),
    row(t('s_source'), p.source === 'folder' ? t('s_folder_t') : t('s_all_t'), select(null, [['all', t('s_all')], ['folder', t('s_folder')]], p.source === 'folder' ? 'folder' : 'all', (v) => save({ source: v }), { ...md, 'aria-label': t('s_source') })),
    row(t('grid_size'), t('s_size_t'), select(null, [['s', t('size_s')], ['m', t('size_m')], ['l', t('size_l')]], p.size || 'm', (v) => save({ size: v }), { ...md, 'aria-label': t('grid_size') })));

  const look = () => {
    const theme = h('sav-theme-choice', { value: p.theme || u.prefs?.theme || 'auto', appearance: 'buttons', size: 'sm', 'aria-label': t('theme') });
    theme.addEventListener('change', (e) => save({ theme: e.detail?.value ?? theme.value }, true));
    return section(t('s_look'), null, row(t('theme'), t('s_theme_t'), theme),
      row(t('language'), t('s_lang_t'), select(null, [['it', 'Italiano'], ['en', 'English']], getLang(), async (v) => { setLang(v); u.lang = v; await api('auth.profile', { lang: v }).catch(fail); go('#/settings/look'); }, { ...md, 'aria-label': t('language') })));
  };

  const account = () => section(t('s_drive'), u.email,
    row(t('s_drive'), t('s_drive_t', { email: u.email }), small(t('open_drive_settings'), { icon: 'hard-drive', href: driveUrl('#/settings') })),
    row(t('sign_out'), null, small(t('sign_out'), { icon: 'log-out', onclick: () => signOut() })));

  const data = () => section(t('s_account'), null,
    row(t('export_data'), t('export_data_t'), small(t('export_data'), { icon: 'download', href: API + '?r=photos.export', download: 'savphotos-data.json' })));

  const SECTIONS = [['photos', 'images', t('s_photos'), photos], ['look', 'palette', t('s_look'), look], ['account', 'user', t('s_drive'), account], ['data', 'shield', t('s_account'), data]];
  const tabs = h('sav-tabs.otabs', { placement: mobile() ? null : 'start', active: SECTIONS.some((s) => s[0] === want) ? want : 'photos' }, SECTIONS.map(([k, ic, label, body]) => h('sav-tab', { name: k, label, icon: ic }, body())));
  tabs.addEventListener('sav-tab-show', (e) => history.replaceState(null, '', '#/settings/' + e.detail.name));
  put(root, h('div.home.setp', h('header.htop', brand(), h('div.spacer'), userMenu()),
    h('main.smain', h('div.shd', btn(t('back_photos'), { icon: 'arrow-left', appearance: 'ghost', onclick: () => go('#/') }), h('h1', t('settings'))), tabs), credit()));
  document.title = t('settings') + ' – SavPhotos';
}
