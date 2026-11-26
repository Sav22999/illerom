/** Administration: accounts, schedules (titles and numbers, never the answers), reports. */
import { btn, fail, h, item, put } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { api } from './store.js';
import { brand, go, userMenu } from './account.js';

export async function admin(root, tab) {
  document.title = t('admin') + ' – SavSchedules';
  const main = h('main.hmain'), menu = h('sav-menu', { label: t('admin'), selectable: true }, [['overview', 'layout-grid'], ['users', 'users'], ['schedules', 'calendar-days'], ['reports', 'flag']].map(([k, ic]) => { const x = item(k, ic, t('a_' + k)); x.toggleAttribute('current', k === tab); return x; }), h('sav-divider'), item('home', 'arrow-left', t('home')));
  menu.addEventListener('sav-select', (e) => go(e.detail.value === 'home' ? '#/' : '#/admin/' + e.detail.value));
  put(root, h('div.home', h('header.htop', brand(), h('sav-badge', { appearance: 'soft', variant: 'primary', pill: true }, t('admin')), h('div.spacer'), userMenu()), h('div.hbody', h('nav.hside', menu), main)));
  const table = (heads, rows) => h('sav-table', { hover: true }, h('table', h('thead', h('tr', heads.map((x) => h('th', x)))), h('tbody', rows.map((r) => h('tr', r.map((c) => h('td', c)))))));
  const search = (fn) => { const q = h('sav-input', { type: 'search', placeholder: t('a_find'), clearable: true }); let to; q.addEventListener('input', () => { clearTimeout(to); to = setTimeout(() => fn(q.value.trim()).catch(fail), 300); }); return q; };
  const box = h('div.abox'), badge = (v, ...x) => h('sav-badge', { variant: v, appearance: 'soft', pill: true }, x);
  if (tab === 'overview') {
    const o = await api('master.overview');
    put(main, h('h2', t('a_overview')), h('div.stats', [['a_users', o.users, 'users'], ['a_active', o.active30, 'user-check'], ['a_schedules', o.schedules, 'calendar-days'], ['polls', o.polls, 'vote'], ['a_answers', o.answers, 'inbox'], ['a_guests', o.guests, 'user'], ['a_reports', o.reports, 'flag']].map(([k, v, ic]) => h('sav-stat', { label: t(k), value: Number(v).toLocaleString(getLang()), icon: ic }))), h('sav-alert', { variant: 'neutral' }, t('a_privacy')));
  } else if (tab === 'users') {
    const load = async (q = '') => {
      const { users } = await api('master.users', undefined, { q });
      put(box, table([t('name'), t('a_schedules'), t('a_last'), '', ''], users.map((u) => [[h('strong', u.name), h('div.muted.small', u.email)], String(u.schedules), when(u.seen) || '—', u.status !== 'active' ? badge('danger', t('a_blocked')) : u.verified ? '' : badge('neutral', t('a_unverified')),
        btn(t(u.status !== 'active' ? 'a_unblock' : 'a_block'), { size: 'sm', variant: u.status !== 'active' ? 'neutral' : 'danger', appearance: 'soft', onclick: async () => { await api('master.block', { user: u.id, blocked: u.status === 'active' }); await load(q); } })])));
    };
    put(main, h('h2', t('a_users')), search(load), box);
    await load();
  } else if (tab === 'schedules') {
    const load = async (q = '') => {
      const { schedules } = await api('master.schedules', undefined, { q });
      put(box, table([t('title_l'), t('a_owner'), t('a_answers'), '', ''], schedules.map((s) => [[h('strong', s.title), h('div.muted.small', t('k_' + s.kind) + ' · ' + when(s.created))], [s.owner, h('div.muted.small', s.email)], String(s.answers), [s.reports ? badge('warning', `${t('a_reports')}: ${s.reports}`) : null, s.status === 'suspended' ? badge('danger', t('suspended')) : null].filter(Boolean),
        h('div.prow', btn(t('open'), { size: 'sm', href: '#/s/' + s.id, target: '_blank' }), btn(t(s.status === 'suspended' ? 'a_unsuspend' : 'a_suspend'), { size: 'sm', variant: 'danger', appearance: 'soft', onclick: async () => { await api('master.suspend', { id: s.id, on: s.status !== 'suspended' }); await load(q); } }))])));
    };
    put(main, h('h2', t('a_schedules')), h('p.muted.small', t('a_privacy')), search(load), box);
    await load();
  } else {
    const load = async () => {
      const { reports } = await api('master.reports');
      put(box, reports.length ? table([t('title_l'), t('reason'), '', ''], reports.map((r) => [[h('strong', r.title), h('div.muted.small', when(r.at))], [t('rep_' + r.reason), r.note ? h('div.muted.small', r.note) : ''], badge(r.open ? 'warning' : 'neutral', t(r.open ? 'a_open' : 'a_done')),
        h('div.prow.wrap', btn(t('open'), { size: 'sm', href: '#/s/' + r.schedule, target: '_blank' }), btn(t(r.suspended ? 'a_unsuspend' : 'a_suspend'), { size: 'sm', variant: 'danger', appearance: 'soft', onclick: async () => { await api('master.suspend', { id: r.schedule, on: !r.suspended }); await load(); } }), r.open ? btn(t('a_close'), { size: 'sm', onclick: async () => { await api('master.report', { report: r.id }); await load(); } }) : null)])) : h('p.muted', t('a_noreports')));
    };
    put(main, h('h2', t('a_reports')), box);
    await load();
  }
}
