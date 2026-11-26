/** Settings: a page of its own, one section at a time chosen on the side, as in the other apps of SavOffice. */
import { btn, dialog, fail, h, mobile, put, select, toast } from './ui.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api } from './store.js';
import { brand, credit, go, prefs, setPrefs, setUser, signOut, userMenu } from './account.js';
import { LOCAL_TZ, ZONES } from './time.js';

const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); };

export function settingsScreen(root, want = '') {
  const u = S.user, p = prefs(), md = { size: 'sm' };
  const saved = () => toast(t('settings_saved'), 'success');
  const save = (x, quiet) => setPrefs(x).then(() => { if (!quiet) saved(); }).catch(fail);
  const row = (label, help, control) => h('div.orow', h('div.orow-t', h('b', label), help ? h('small', help) : null), h('div.orow-c', control));
  const section = (title, text, ...rows) => h('div.osec', h('h2', title), text ? h('p.muted', text) : null, h('sav-card.ocard', { appearance: 'outlined' }, h('div.orows', rows.filter(Boolean))));
  const small = (label, o) => btn(label, { size: 'sm', appearance: 'outline', ...o });
  const sw = (k, label, help, def = true) => { const s = h('sav-switch', { checked: (p[k] ?? def) !== false || null, 'aria-label': label }); s.addEventListener('change', () => save({ [k]: s.checked })); return row(label, help, s); };

  // ---------------------------------------------------------------- account (the same of SavSchedules and SavCalendar)
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

  // ---------------------------------------------------------------- tasks
  const DAYN = (i, f = 'long') => new Intl.DateTimeFormat(getLang(), { weekday: f, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i)));
  const lists = S.lists.filter((l) => !l.archived);
  const tasks = () => section(t('g_tasks'), t('g_tasks_t'),
    row(t('timezone'), t('timezone_tasks_t'), select(null, ZONES.map((z) => [z, z.replace(/_/g, ' ')]), p.tz || LOCAL_TZ, (v) => save({ tz: v }), { ...md, searchable: true, 'aria-label': t('timezone') })),
    row(t('home_view'), t('home_view_t'), select(null, [['today', t('v_today')], ['upcoming', t('v_upcoming')], ['inbox', t('inbox')], ['starred', t('v_starred')]], p.home || 'today', (v) => save({ home: v }), { ...md, 'aria-label': t('home_view') })),
    row(t('default_list'), t('default_list_t'), select(null, lists.map((l) => [l.id, l.name]), p.defaultList && lists.some((l) => l.id === p.defaultList) ? p.defaultList : lists[0]?.id, (v) => save({ defaultList: v }), { ...md, 'aria-label': t('default_list') })),
    row(t('week_start'), null, select(null, [0, 6].map((d) => [String(d), DAYN(d)]), String(p.firstDay ?? 0), (v) => save({ firstDay: +v }), { ...md, 'aria-label': t('week_start') })),
    sw('showDone', t('show_done'), t('show_done_t')));

  // ---------------------------------------------------------------- reminders
  const notifyBtn = () => {
    const can = 'Notification' in window;
    const state = can ? Notification.permission : 'unsupported';
    if (state === 'granted') return h('sav-badge', { variant: 'success', appearance: 'soft' }, t('notify_on'));
    if (state === 'denied' || !can) return h('small.muted', t(can ? 'notify_denied' : 'notify_unsupported'));
    return small(t('notify_allow'), { icon: 'bell', onclick: async () => { const r = await Notification.requestPermission(); if (r === 'granted') { save({ notify: true }); toast(t('notify_on'), 'success'); } go('#/settings/reminders'); } });
  };
  const reminders = () => section(t('g_reminders'), t('g_reminders_t'),
    sw('autoRemind', t('auto_remind'), t('auto_remind_t')),
    row(t('remind_at'), t('remind_at_t'), select(null, Array.from({ length: 33 }, (_, i) => { const m = 360 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }).map((x) => [x, x]), p.remindAt || '09:00', (v) => save({ remindAt: v }), { ...md, 'aria-label': t('remind_at') })),
    row(t('remind_before'), t('remind_before_t'), select(null, [0, 5, 10, 15, 30, 60, 120].map((m) => [String(m), m ? t('minutes_before', { n: m }) : t('rm_at_time')]), String(p.remindBefore ?? 0), (v) => save({ remindBefore: +v }), { ...md, 'aria-label': t('remind_before') })),
    sw('mailReminders', t('mail_reminders'), S.config.mailReady === false ? t('mail_off') : t('mail_reminders_t', { e: u.email })),
    row(t('notify'), t('notify_t'), notifyBtn()));

  const office = () => section(t('with_office'), t('with_office_t'),
    sw('schedules', 'SavSchedules', t('sch_in_tasks_t')),
    row('SavCalendar', t('cal_layer_t'), small(t('open_calendar'), { icon: 'external-link', href: S.calendarUrl + '#/settings/office' })),
    row(t('open_schedules'), null, small(t('open'), { icon: 'external-link', href: S.schedulesUrl })));

  // ---------------------------------------------------------------- look and language
  const look = () => {
    const theme = h('sav-theme-choice', { value: p.theme || 'auto', appearance: 'buttons', size: 'sm', 'aria-label': t('theme') });
    theme.addEventListener('change', (e) => save({ theme: e.detail?.value ?? theme.value }, true));
    return section(t('look_app'), null, row(t('theme'), null, theme), row(t('language'), null, select(null, [['it', 'Italiano'], ['en', 'English']], getLang(), async (v) => { setLang(v); u.lang = v; await api('auth.profile', { lang: v }).catch(fail); go('#/settings/look'); }, { ...md, 'aria-label': t('language') })));
  };

  // ---------------------------------------------------------------- data
  const del = () => {
    const f = u.hasPassword ? h('sav-input', { label: t('password'), type: 'password', 'password-toggle': true, autocomplete: 'current-password' }) : null;
    dialog({ title: t('delete_account'), width: '28rem', body: h('div.form', h('p', t('delete_account_text')), f), actions: [{ label: t('cancel') }, { label: t('delete_forever'), danger: true, run: async () => { await api('auth.delete', { password: f?.value || '' }); S.user = null; S.lists = []; S.tasks = []; S.ready = false; go('#/welcome'); } }] });
  };
  const data = () => section(t('your_data'), t('your_data_t'),
    row(t('export_data'), t('export_data_t'), small(t('export_data'), { icon: 'download', onclick: async () => { try { const r = await fetch('api/?r=auth.export', { cache: 'no-store' }); if (!r.ok) throw Object.assign(new Error(), { code: 'server' }); download(await r.blob(), 'savtasks-data.json'); } catch (e) { fail(Object.assign(e, { code: e.code || 'network' })); } } })),
    row(t('open_file'), t('open_file_t'), small(t('open_file'), { icon: 'file-up', onclick: () => import('./files.js').then((m) => m.openFileDialog()) })),
    row(t('delete_account'), t('delete_account_short'), btn(t('delete_account'), { icon: 'trash', variant: 'danger', appearance: 'soft', size: 'sm', onclick: del })));

  const SECTIONS = [['account', 'user', t('g_account'), account], ['tasks', 'list-checks', t('g_tasks'), tasks], ['reminders', 'bell', t('g_reminders'), reminders], ['office', 'grip', t('with_office'), office], ['look', 'palette', t('look_app'), look], ['data', 'shield', t('your_data'), data]];
  const tabs = h('sav-tabs.otabs', { placement: mobile() ? null : 'start', active: SECTIONS.some((s) => s[0] === want) ? want : 'account' }, SECTIONS.map(([k, ic, label, body]) => h('sav-tab', { name: k, label, icon: ic }, body())));
  tabs.addEventListener('sav-tab-show', (e) => history.replaceState(null, '', '#/settings/' + e.detail.name));

  put(root, h('div.home.setp', h('header.htop', brand(), h('div.spacer'), userMenu()),
    h('main.smain', h('div.shd', btn(t('back_tasks'), { icon: 'arrow-left', appearance: 'ghost', onclick: () => go('#/') }), h('h1', t('settings'))), h('p.muted', t('settings_t')), tabs), credit()));
  document.title = t('settings') + ' – SavTasks';
}
