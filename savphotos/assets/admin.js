/**
 * The panel of the master admins of SavPhotos: how it is used, who can use it (on or off, account by account, or as the
 * default) and the default for whoever has no choice of their own. The accounts are the ones of SavDrive; the space and
 * the activation of the account stay in the panel of SavDrive. Never the photos themselves.
 */
import { btn, bytes, empty, face, fail, h, item, put, segmented, toast } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { api, driveUrl } from './store.js';
import { brand, commands, credit, go, userMenu } from './account.js';

export async function admin(root, tab) {
  document.title = t('admin') + ' – SavPhotos';
  const tabs = [['overview', 'layout-grid'], ['users', 'users'], ['settings', 'settings']];
  if (!tabs.some(([k]) => k === tab)) tab = 'overview';
  const main = h('main.hmain.amain2');
  const menu = h('sav-menu', { label: t('admin'), selectable: true }, tabs.map(([k, ic]) => { const x = item(k, ic, t('a_' + k)); x.toggleAttribute('current', k === tab); return x; }), h('sav-divider'),
    item('drive', 'hard-drive', t('a_drive_panel')), item('home', 'arrow-left', t('back_photos')));
  menu.addEventListener('sav-select', (e) => { const v = e.detail.value; if (v === 'drive') location.href = driveUrl('#/admin'); else go(v === 'home' ? '#/' : '#/admin/' + v); });
  commands([t('admin'), tabs.map(([k, ic]) => [ic, t('a_' + k), '#/admin/' + k])]);
  put(root, h('div.home', h('header.htop', brand(), h('sav-badge', { appearance: 'soft', variant: 'primary', pill: true }, t('admin')), h('div.spacer'), userMenu()), h('div.hbody', h('nav.hside', menu), main), credit()));
  const badge = (v, ...x) => h('sav-badge', { variant: v, appearance: 'soft', pill: true }, x);
  const num = (n) => Number(n).toLocaleString(getLang());

  if (tab === 'overview') {
    const o = await api('photos.admin.overview');
    put(main, h('h1.ah', t('a_overview')),
      h('div.stats', [['a_accounts', num(o.accounts), 'users'], ['a_on', num(o.on), 'user-check'], ['a_used', num(o.used), 'images'], ['a_photos', num(o.photos), 'image'], ['a_videos', num(o.videos), 'film'], ['a_stored', bytes(o.bytes), 'hard-drive'], ['a_albums', num(o.albums), 'album'], ['a_shared', num(o.sharedAlbums), 'link']]
        .map(([k, v, ic]) => h('sav-stat', { label: t(k), value: v, icon: ic }))),
      h('sav-card.acard', h('div.stack', h('h2', t('a_who')), h('p', t(o.defaultOn ? 'a_default_on' : 'a_default_off')), h('p.muted.small', t('a_masters_note')),
        h('div.prow.wrap', btn(t('a_users'), { icon: 'users', size: 'sm', onclick: () => go('#/admin/users') }), btn(t('a_settings'), { icon: 'settings', size: 'sm', onclick: () => go('#/admin/settings') })))),
      h('sav-alert', { variant: 'neutral' }, t('a_privacy')));
    return;
  }

  if (tab === 'settings') {
    const o = await api('photos.admin.overview');
    const def = h('sav-radio-group', { label: t('a_default'), value: o.defaultOn ? 'on' : 'off' },
      h('sav-radio', { value: 'off' }, h('b', t('a_def_off')), h('br'), h('small.muted', t('a_def_off_t'))),
      h('sav-radio', { value: 'on' }, h('b', t('a_def_on')), h('br'), h('small.muted', t('a_def_on_t'))));
    put(main, h('h1.ah', t('a_settings')), h('p.muted', t('a_settings_t')),
      h('sav-card.acard', h('div.form', h('h2', t('a_who')), def, h('p.muted.small', t('a_masters_note')))),
      h('sav-alert', { variant: 'warning' }, t('a_publish_note')),
      h('div.prow', btn(t('save'), { variant: 'primary', appearance: 'solid', icon: 'check', onclick: async () => { await api('photos.admin.settings', { defaultOn: def.value === 'on' }); toast(t('settings_saved'), 'success'); } })));
    return;
  }

  // ---------------------------------------------------------------- accounts
  let show = 'all', q = '', users = [], defaultOn = false;
  const box = h('div.ulist2'), count = h('span.muted.small');
  const searchBox = h('sav-input', { type: 'search', placeholder: t('a_find'), clearable: true, 'aria-label': t('a_find') });
  let to;
  searchBox.addEventListener('input', () => { clearTimeout(to); to = setTimeout(() => { q = searchBox.value.trim(); load().catch(fail); }, 300); });
  const filter = segmented(t('a_show'), show, [['all', '=' + t('a_all'), t('a_all')], ['on', '=' + t('a_is_on'), t('a_is_on')], ['off', '=' + t('a_is_off'), t('a_is_off')]], (v) => { show = v; load().catch(fail); }, { class: 'afilter', size: 'md' });
  const set = async (ids, on) => { const r = await api('photos.admin.set', { ids, on }); toast(on === null ? t('a_reset_n', { n: ids.length }) : t(on ? 'a_on_n' : 'a_off_n', { n: r.changed }), 'success'); await load(); };

  const userCard = (u) => h('sav-card.ucard', { appearance: 'outlined' }, h('div.urow2',
    face(u.name, null, 40),
    h('div.uwho', h('b', u.name, u.master ? badge('primary', t('admin')) : null), h('small', u.email), h('small.muted', t('a_joined', { when: when(u.created) }) + (u.seen ? ' · ' + t('a_seen', { when: when(u.seen) }) : ' · ' + t('a_never')))),
    h('div.ustate', u.on ? badge('success', t('a_is_on')) : badge('neutral', t('a_is_off')), u.own === null && !u.master ? badge('neutral', t('a_by_default')) : null,
      !u.driveOn ? badge('warning', t('a_drive_off')) : null, !u.verified ? badge('neutral', t('a_unverified')) : null),
    h('div.uspace', h('small', u.photos ? t('a_n_photos', { n: num(u.photos), size: bytes(u.bytes) }) : t('a_no_photos')), u.albums ? h('small.muted', t('a_n_albums', { n: u.albums })) : null),
    h('div.uact', u.master ? h('small.muted', t('a_master_fixed')) : [
      btn(t(u.on ? 'a_turn_off' : 'a_turn_on'), { size: 'sm', icon: u.on ? 'user-x' : 'user-check', variant: u.on ? 'neutral' : 'primary', appearance: u.on ? 'outline' : 'solid', onclick: () => set([u.id], !u.on) }),
      u.own !== null ? btn(t('a_follow_default'), { size: 'sm', appearance: 'ghost', icon: 'rotate-ccw', onclick: () => set([u.id], null) }) : null])));

  async function load() {
    const r = await api('photos.admin.users', undefined, { q, show });
    users = r.users; defaultOn = r.defaultOn;
    const off = users.filter((u) => !u.on && !u.master);
    put(count, t('a_n_accounts', { n: users.length }));
    put(box, h('p.muted.small', t(defaultOn ? 'a_default_on' : 'a_default_off')),
      off.length > 1 && show !== 'on' ? h('sav-alert.wbar', { variant: 'neutral' }, t('a_n_off', { n: off.length }), ' ', btn(t('a_turn_on_all'), { size: 'sm', icon: 'user-check', onclick: () => set(off.map((u) => u.id), true) })) : null,
      users.length ? users.map(userCard) : empty('users', t('a_none'), ''));
  }
  put(main, h('h1.ah', t('a_users')), h('div.atools', searchBox, filter, count), box);
  await load();
}
