/** Settings: a page of its own, one section at a time chosen on the side, as in the other apps of SavOffice. */
import { btn, dialog, fail, h, mobile, put, select, toast } from './ui.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api } from './store.js';
import { brand, credit, go, prefs, setPrefs, setUser, signOut, userMenu } from './account.js';
import { LOCAL_TZ, ZONES } from './time.js';
import { weekPanel } from './week.js';
import { download } from './files.js';


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
    h('sav-alert', { variant: 'neutral', appearance: 'soft', class: 'shared' }, h('sav-icon', { name: 'vote', slot: 'icon' }), t('shared_account')),
    row(t('your_name'), t('name_t'), name),
    row(t('password'), t(u.hasPassword ? 'password_t' : 'password_none_t'), small(t(u.hasPassword ? 'change_pw' : 'set_pw'), { onclick: password })),
    window.Identity ? row(t('sign_in_ways'), t('sign_in_ways_t'), small(window.Identity.text('methods'), { icon: 'shield', onclick: () => window.Identity.methods() })) : null,
    row(t('sign_out'), t('sign_out_t'), small(t('sign_out'), { icon: 'log-out', onclick: () => signOut() })));

  // ---------------------------------------------------------------- the calendar
  const cals = S.calendars.filter((c) => c.kind === 'local');
  const calendar = () => section(t('g_calendar'), t('g_calendar_t'),
    row(t('timezone'), t('timezone_t'), select(null, ZONES.map((z) => [z, z.replace(/_/g, ' ')]), p.tz || LOCAL_TZ, (v) => save({ tz: v }), { ...md, searchable: true, 'aria-label': t('timezone') })),
    h('div.orow.owide', h('div.orow-t', h('b', t('week_days')), h('small', t('show_days_t'))), weekPanel(() => saved())),
    row(t('default_view'), null, select(null, [['day', t('v_day')], ['week', t('v_week')], ['month', t('v_month')], ['agenda', t('v_agenda')]], p.view || 'week', (v) => save({ view: v }), { ...md, 'aria-label': t('default_view') })),
    row(t('day_starts'), t('day_starts_t'), select(null, Array.from({ length: 13 }, (_, i) => [String(i), String(i).padStart(2, '0') + ':00']), String(p.dayStart ?? 8), (v) => save({ dayStart: +v }), { ...md, 'aria-label': t('day_starts') })),
    row(t('default_length'), null, select(null, [15, 30, 45, 60, 90, 120].map((m) => [String(m), t('minutes_n', { n: m })]), String(p.duration || 60), (v) => save({ duration: +v }), { ...md, 'aria-label': t('default_length') })),
    cals.length > 1 ? row(t('default_cal'), null, select(null, cals.map((c) => [c.id, c.name]), p.defaultCal || cals[0].id, (v) => save({ defaultCal: v }), { ...md, 'aria-label': t('default_cal') })) : null);

  const office = () => section(t('from_office'), t('from_office_t'),
    sw('schedules', 'SavSchedules', t('sch_layer_long')), sw('proposals', t('show_proposals'), t('show_proposals_t')),
    sw('newsletters', 'SavNewsletters', t('nl_layer_long')),
    sw('tasks', 'SavTasks', t('task_layer_long')), sw('tasksDone', t('show_tasks_done'), t('show_tasks_done_t')),
    sw('forms', 'SavForms', t('form_layer_long')),
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
    dialog({ title: t('delete_account'), width: '28rem', body: h('div.form', h('p', t('delete_account_text')), f), actions: [{ label: t('cancel') }, { label: t('delete_forever'), danger: true, run: async () => { await api('auth.delete', { password: f?.value || '' }); S.user = null; S.calendars = []; go('#/welcome'); } }] });
  };
  const data = () => section(t('your_data'), t('your_data_t'),
    row(t('export_data'), t('export_data_t'), small(t('export_data'), { icon: 'download', onclick: async () => { try { const r = await fetch('api/?r=auth.export', { cache: 'no-store' }); if (!r.ok) throw Object.assign(new Error(), { code: 'server' }); download(await r.blob(), 'savcalendar-data.json'); } catch (e) { fail(Object.assign(e, { code: e.code || 'network' })); } } })),
    row(t('delete_account'), t('delete_account_short'), btn(t('delete_account'), { icon: 'trash', variant: 'danger', appearance: 'soft', size: 'sm', onclick: del })));

  const SECTIONS = [['account', 'user', t('g_account'), account], ['calendar', 'calendar-days', t('g_calendar'), calendar], ['office', 'grip', t('from_office'), office], ['look', 'palette', t('look_app'), look], ['data', 'shield', t('your_data'), data]];
  const tabs = h('sav-tabs.otabs', { placement: mobile() ? null : 'start', active: SECTIONS.some((s) => s[0] === want) ? want : 'account' }, SECTIONS.map(([k, ic, label, body]) => h('sav-tab', { name: k, label, icon: ic }, body())));
  tabs.addEventListener('sav-tab-show', (e) => history.replaceState(null, '', '#/settings/' + e.detail.name));

  put(root, h('div.home.setp', h('header.htop', brand(), h('div.spacer'), userMenu()),
    h('main.smain', h('div.shd', btn(t('back_calendar'), { icon: 'arrow-left', appearance: 'ghost', onclick: () => go('#/') }), h('h1', t('settings'))), h('p.muted', t('settings_t')), tabs), credit()));
  document.title = t('settings') + ' – SavCalendar';
}
