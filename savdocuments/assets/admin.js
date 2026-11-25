/** Administration: accounts, documents (never their text), reports. */
import { btn, dialog, empty, fail, h, item, put, select } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { api } from './store.js';
import { brand, go, userMenu } from './account.js';

export async function admin(root, tab) {
  const main = h('main.hmain'), menu = h('sav-menu', { label: t('admin'), selectable: true }, [['overview', 'monitor'], ['users', 'users'], ['docs', 'file-text'], ['reports', 'flag']].map(([k, ic]) => { const x = item(k, ic, t('a_' + k)); x.toggleAttribute('current', k === tab); return x; }), h('sav-divider'), item('home', 'arrow-left', t('home')));
  menu.addEventListener('sav-select', (e) => go(e.detail.value === 'home' ? '#/' : '#/admin/' + e.detail.value));
  put(root, h('div.home', h('header.htop', brand(), h('sav-badge', { appearance: 'soft', variant: 'primary', pill: true }, t('admin')), h('div.spacer'), userMenu()), h('div.hbody', h('nav.hside', menu), main)));
  const table = (heads, rows) => h('sav-table', { hover: true }, h('table', h('thead', h('tr', heads.map((x) => h('th', x)))), h('tbody', rows.map((r) => h('tr', r.map((c) => h('td', c)))))));
  const search = (fn) => { const q = h('sav-input', { type: 'search', placeholder: t('a_find'), clearable: true }); let to; q.addEventListener('input', () => { clearTimeout(to); to = setTimeout(() => fn(q.value.trim()).catch(fail), 300); }); return q; };
  const box = h('div'), suspend = (id, on) => api('master.suspend', { doc: id, on }), badge = (v, ...x) => h('sav-badge', { variant: v, appearance: 'soft', pill: true }, x);
  if (tab === 'overview') {
    const o = await api('master.overview');
    put(main, h('h2', t('a_overview')), h('div.stats', [['a_users', o.users, 'users'], ['a_blocked', o.blocked, 'ban'], ['a_docs', o.docs, 'file-text'], ['a_active', o.active, 'pencil'], ['a_images', (o.images / 1048576).toFixed(1) + ' MB', 'image'], ['a_reports', o.reports, 'flag']].map(([k, v, ic]) => h('sav-stat', { label: t(k), value: typeof v === 'number' ? v.toLocaleString(getLang()) : v, icon: ic }))), h('sav-alert', { variant: 'neutral' }, t('a_privacy')));
  } else if (tab === 'users') {
    const load = async (q = '') => {
      const { users } = await api('master.users', undefined, { q });
      put(box, table([t('name'), t('a_docs'), t('a_last'), '', ''], users.map((u) => [[h('strong', u.name), h('div.muted.small', u.email)], String(u.docs), when(u.login) || '—', u.blocked ? badge('danger', t('rep_' + u.reason) + (u.note ? ': ' + u.note : '')) : u.master ? badge('primary', t('admin')) : u.verified ? '' : badge('neutral', t('a_unverified')), u.master ? '' : btn(t(u.blocked ? 'a_unblock' : 'a_block'), { size: 'sm', icon: u.blocked ? 'circle-check' : 'ban', variant: u.blocked ? 'neutral' : 'danger', onclick: () => {
        if (u.blocked) return api('master.block', { id: u.id, on: false }).then(() => load(q));
        const why = select(t('reason'), ['spam', 'phishing', 'illegal', 'other'].map((k) => [k, t('rep_' + k)]), 'spam', null, { size: 'md' }), note = h('sav-input', { label: t('a_note'), maxlength: 300 });
        dialog({ title: `${t('a_block')}: ${u.name}`, body: h('div.form', h('p.muted', t('a_block_t')), why, note), actions: [{ label: t('cancel') }, { label: t('a_block'), danger: true, run: async () => { await api('master.block', { id: u.id, on: true, reason: why.value, note: note.value }); load(q); } }] });
        return undefined;
      } })])));
    };
    put(main, h('h2', t('a_users')), search(load), box);
    await load();
  } else if (tab === 'docs') {
    const load = async (q = '') => {
      const { docs } = await api('master.docs', undefined, { q });
      put(box, table([t('document'), t('a_owner'), t('modified'), t('a_access'), ''], docs.map((d) => [[h('code', d.id), h('div.muted.small', `${d.words} ${t('words')} · ${Math.ceil(d.bytes / 1024)} KB`)], [d.owner, h('div.muted.small', d.email)], when(d.updated), [badge('neutral', t(d.visibility === 'link' ? 'a_link' : 'a_private')), d.reports ? badge('warning', `${t('a_reports')}: ${d.reports}`) : null, d.suspended ? badge('danger', t('suspended')) : null].filter(Boolean), btn(t(d.suspended ? 'a_unsuspend' : 'a_suspend'), { size: 'sm', variant: d.suspended ? 'neutral' : 'danger', onclick: () => suspend(d.id, !d.suspended).then(() => load(q)) })])));
    };
    put(main, h('h2', t('a_docs')), h('p.muted.small', t('a_privacy')), search(load), box);
    await load();
  } else {
    const load = async () => {
      const { reports } = await api('master.reports');
      put(box, reports.length ? table([t('document'), t('reason'), t('a_owner'), '', ''], reports.map((r) => [[h('strong', r.title), h('div.muted.small', when(r.at))], [t('rep_' + r.reason), r.note ? h('div.muted.small', r.note) : ''], [r.owner, h('div.muted.small', r.email)], badge(r.open ? 'warning' : 'neutral', t(r.open ? 'a_open' : 'a_done')), h('div.prow.wrap', r.open ? btn(t('a_review'), { size: 'sm', icon: 'eye', href: `#/d/${r.doc}/review` }) : null, btn(t(r.suspended ? 'a_unsuspend' : 'a_suspend'), { size: 'sm', variant: r.suspended ? 'neutral' : 'danger', onclick: () => suspend(r.doc, !r.suspended).then(load) }), btn(t(r.open ? 'a_closed' : 'a_reopen'), { size: 'sm', onclick: () => api('master.report', { id: r.id, closed: r.open }).then(load) }))])) : empty('flag', t('a_noreports'), ''));
    };
    put(main, h('h2', t('a_reports')), h('p.muted.small', t('a_privacy')), box);
    await load();
  }
}
