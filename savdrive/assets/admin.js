/**
 * The panel of the master admins: how the drive is used, the accounts (activated or not, their space, deleting them) and
 * the settings of new accounts (the default space and whether they are activated at once). Never the files themselves.
 */
import { btn, confirm, dialog, empty, fail, face, h, icon, item, put, segmented, select, toast } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { S, api } from './store.js';
import { brand, commands, credit, go, userMenu } from './account.js';
import { bytes, spaceParts } from './drive.js';

const UNITS = { MB: 1048576, GB: 1073741824, TB: 1099511627776 };
/** The unit a space reads best in: TB from 1 TB, GB from 1 GB, otherwise MB. */
const unitOf = (b) => (b >= UNITS.TB && b % (UNITS.TB / 100) === 0 ? 'TB' : b >= UNITS.GB ? 'GB' : 'MB');
/**
 * A space typed as a number and a unit (MB, GB, TB), the two at the same height. .bytes reads and writes it in bytes;
 * .disabled switches both off.
 */
function sizeField(label, value) {
  const n = h('sav-number-input', { label, min: 0, step: 1, size: 'md', class: 'grow' });
  let unit = unitOf(value);
  const u = select(null, Object.keys(UNITS).map((k) => [k, k]), unit, (v) => {
    // the number stays the same space in the new unit
    const b = f.bytes; unit = v; n.value = Math.round((b / UNITS[unit]) * 100) / 100;
  }, { size: 'md', class: 'unitsel', 'aria-label': t('a_unit') });
  const f = h('div.sizef', n, u);
  Object.defineProperty(f, 'bytes', {
    get: () => { const v = parseFloat(String(n.value).replace(',', '.')); return Number.isFinite(v) ? Math.round(v * UNITS[unit]) : NaN; },
    set: (b) => { unit = unitOf(b); u.value = unit; n.value = Math.round((b / UNITS[unit]) * 100) / 100; },
  });
  Object.defineProperty(f, 'disabled', { set: (v) => { n.disabled = v; u.disabled = v; } });
  f.bytes = value;
  return f;
}

export async function admin(root, tab) {
  document.title = t('admin') + ' – SavDrive';
  const tabs = [['overview', 'layout-grid'], ['users', 'users'], ['reports', 'flag'], ['settings', 'settings']];
  if (!tabs.some(([k]) => k === tab)) tab = 'overview';
  const ov = await api('master.overview'); // once: the menu badge of open reports, and the overview and settings tabs
  const main = h('main.hmain.amain2'), menu = h('sav-menu', { label: t('admin'), selectable: true }, tabs.map(([k, ic]) => { const x = item(k, ic, t('a_' + k)); if (k === 'reports' && ov.reports) x.append(h('sav-badge', { slot: 'suffix', variant: 'danger', appearance: 'soft', pill: true }, ov.reports)); x.toggleAttribute('current', k === tab); return x; }), h('sav-divider'), item('home', 'arrow-left', t('back_drive')));
  menu.addEventListener('sav-select', (e) => go(e.detail.value === 'home' ? '#/' : '#/admin/' + e.detail.value));
  commands([t('admin'), tabs.map(([k, ic]) => [ic, t('a_' + k), '#/admin/' + k])]);
  put(root, h('div.home', h('header.htop', brand(), h('sav-badge', { appearance: 'soft', variant: 'primary', pill: true }, t('admin')), h('div.spacer'), userMenu()), h('div.hbody', h('nav.hside', menu), main), credit()));
  const badge = (v, ...x) => h('sav-badge', { variant: v, appearance: 'soft', pill: true }, x);
  const num = (n) => Number(n).toLocaleString(getLang());

  if (tab === 'overview') {
    const o = ov;
    put(main, h('h1.ah', t('a_overview')),
      o.reports ? h('sav-alert.rbar', { variant: 'warning' }, icon('flag'), ' ', t('a_reports_open', { n: o.reports }), ' ', btn(t('a_reports_see'), { size: 'sm', icon: 'flag', variant: 'warning', appearance: 'soft', onclick: () => go('#/admin/reports') })) : null,
      h('div.stats', [['a_users', num(o.users), 'users'], ['a_active', num(o.active), 'user-check'], ['a_waiting', num(o.waiting), 'clock'], ['a_files', num(o.files), 'file'], ['a_folders', num(o.folders), 'folder'], ['a_stored', bytes(o.bytes), 'hard-drive']]
        .map(([k, v, ic]) => h('sav-stat', { label: t(k), value: v, icon: ic }))),
      h('sav-card.acard', h('div.stack', h('h2', t('a_new_accounts')),
        h('p', t('a_default_quota_is', { q: bytes(o.defaultQuota) })), h('p', t(o.defaultActive ? 'a_default_on' : 'a_default_off')),
        h('p.muted.small', t('a_given', { q: bytes(o.given) }) + (o.unlimited ? ' · ' + t('a_unlimited_n', { n: o.unlimited }) : '') + (o.disk ? ' · ' + t('a_disk', { q: bytes(o.disk) }) : '')),
        h('div.prow.wrap', btn(t('a_settings'), { icon: 'settings', size: 'sm', onclick: () => go('#/admin/settings') }), o.waiting ? btn(t('a_see_waiting', { n: o.waiting }), { icon: 'clock', size: 'sm', variant: 'primary', appearance: 'soft', onclick: () => go('#/admin/users') }) : null))),
      h('sav-alert', { variant: 'neutral' }, t('a_privacy')));
    return;
  }

  if (tab === 'settings') {
    const o = ov;
    const quota = sizeField(t('a_default_quota'), o.defaultQuota);
    const presets = h('div.prow.wrap', [[500, 'MB'], [1, 'GB'], [2, 'GB'], [5, 'GB'], [10, 'GB'], [50, 'GB'], [100, 'GB'], [1, 'TB']].map(([n, k]) => btn(`${n} ${k}`, { size: 'sm', appearance: 'outline', onclick: () => { quota.bytes = n * UNITS[k]; } })));
    const act = h('sav-radio-group', { label: t('a_new_state'), value: o.defaultActive ? 'on' : 'off' },
      h('sav-radio', { value: 'on' }, h('b', t('a_activate')), h('br'), h('small.muted', t('a_activate_t'))),
      h('sav-radio', { value: 'off' }, h('b', t('a_deactivate')), h('br'), h('small.muted', t('a_deactivate_t'))));
    const save = btn(t('save'), { variant: 'primary', appearance: 'solid', icon: 'check', onclick: async () => {
      const b = quota.bytes;
      if (!Number.isFinite(b) || b < UNITS.MB) throw Object.assign(new Error('bad_quota'), { code: 'bad_quota' });
      await api('master.settings', { defaultQuota: b, defaultActive: act.value === 'on' });
      toast(t('settings_saved'), 'success');
    } });
    put(main, h('h1.ah', t('a_settings')), h('p.muted', t('a_settings_t')),
      h('sav-card.acard', h('div.form', h('h2', t('a_space')), h('div', quota, h('p.muted.small.fhelp', t('a_default_quota_t'))), presets, h('p.muted.small', t('a_space_note')))),
      h('sav-card.acard', h('div.form', h('h2', t('a_new_accounts')), act, h('p.muted.small', t('a_masters_note')))),
      h('div.prow', save));
    return;
  }

  // ---------------------------------------------------------------- reports (DSA): the reported public links, their review
  if (tab === 'reports') {
    let rshow = 'open';
    const rbox = h('div.rlist');
    const rfilter = segmented(t('a_show'), rshow, [['open', '=' + t('a_r_open'), t('a_r_open')], ['resolved', '=' + t('a_r_resolved'), t('a_r_resolved')], ['all', '=' + t('a_all'), t('a_all')]], (v) => { rshow = v; rload().catch(fail); });
    rfilter.setAttribute('size', 'md');
    const fileUrl = (rep, itemId) => `api/?r=report.file&id=${rep.id}${itemId ? '&i=' + itemId : ''}&inline=1`;
    const catBadge = (c) => h('sav-badge', { variant: c === 'csam' ? 'danger' : 'neutral', appearance: 'soft', pill: true }, t('rep_cat_' + c));
    // the decision is derived: open, or closed as "dismissed" (no action) or "removed" (something was done)
    const decisionOf = (r) => r.status === 'open' ? 'open' : (r.action === 'dismissed' || r.action === '' ? 'dismissed' : 'removed');
    const statusBadge = (r) => { const s = decisionOf(r); return h('sav-badge', { variant: s === 'open' ? 'warning' : s === 'removed' ? 'danger' : 'neutral', appearance: 'soft', pill: true }, t('a_r_status_' + s)); };
    const actLabel = (a) => t('a_r_did_' + ({ disable_link: 'link', trash: 'trash', block: 'block' }[a] || a));

    const resolveDialog = (rep) => {
      const decision = h('sav-radio-group', { label: t('a_r_decision'), value: 'removed' },
        h('sav-radio', { value: 'removed' }, h('b', t('a_r_remove')), h('br'), h('small.muted', t('a_r_remove_t'))),
        h('sav-radio', { value: 'dismissed' }, h('b', t('a_r_dismiss')), h('br'), h('small.muted', t('a_r_dismiss_t'))));
      const aLink = h('sav-checkbox', { checked: true }, t('a_r_act_link'));
      const aTrash = rep.kind === 'share' ? h('sav-checkbox', {}, t('a_r_act_trash')) : null;
      const aBlock = rep.owner && !rep.owner.blocked ? h('sav-checkbox', {}, t('a_r_act_block')) : null;
      const note = h('sav-textarea', { label: t('a_r_note'), rows: 2, maxlength: 1000, placeholder: t('a_r_note_ph') });
      const acts = h('div.stack.racts', aLink, aTrash, aBlock, aBlock ? h('small.muted', t('a_r_block_note')) : null);
      const sync = () => { acts.hidden = decision.value !== 'removed'; };
      decision.addEventListener('change', sync);
      dialog({ title: t('a_r_resolve'), width: '30rem',
        body: h('div.form', decision, acts, note, h('p.muted.small', t('a_r_mail_note'))),
        actions: [{ label: t('cancel') }, { label: t('a_r_apply'), primary: true, icon: 'shield-check', run: async () => {
          const actions = [aLink.checked && 'disable_link', aTrash && aTrash.checked && 'trash', aBlock && aBlock.checked && 'block'].filter(Boolean);
          await api('master.report.resolve', { id: rep.id, decision: decision.value, actions, note: note.value.trim() });
          toast(t('a_r_applied'), 'success'); rload().catch(fail);
        } }] });
    };

    const viewBtn = (rep, itemId) => btn(t('a_r_view'), { size: 'sm', icon: 'eye', appearance: 'outline', onclick: () => window.open(fileUrl(rep, itemId), '_blank', 'noopener') });
    const repCard = (rep) => {
      const who = rep.owner ? h('span', h('b', rep.owner.name), ' ', h('small.muted', rep.owner.email), ' ', rep.owner.blocked ? badge('danger', t('a_r_blocked')) : null) : h('small.muted', t('a_r_owner_gone'));
      const content = rep.gone ? h('p.muted.small', icon('link-2-off'), ' ', t('a_r_content_gone'))
        : rep.kind === 'share'
          ? h('div.rfile', h('span', `${rep.file.name} · ${bytes(rep.file.size)}`), viewBtn(rep))
          : h('div.stack', (rep.temp.items || []).map((it) => h('div.rfile', h('span', `${it.name} · ${bytes(it.size)}`), it.folder ? badge('neutral', t('a_r_folder')) : viewBtn(rep, it.id))));
      return h('sav-card.rcard', { appearance: 'outlined' }, h('div.stack',
        h('div.rhead', catBadge(rep.reason), badge('neutral', t('a_r_kind_' + rep.kind)), statusBadge(rep), h('span.grow'), h('small.muted', when(rep.created))),
        h('div.rwho', who),
        rep.note ? h('p.rdetail', rep.note) : null,
        h('small.muted', t('a_r_reporter', { who: rep.reporter || t('a_r_anon') }) + (rep.ip ? ' · ' + rep.ip : '') + (rep.seen ? ' · ' + t('a_r_seen', { when: when(rep.seen) }) : '')),
        content,
        rep.status !== 'open' ? h('small.muted.rdone', t('a_r_decided', { when: when(rep.resolved) }) + (rep.action && rep.action !== 'dismissed' ? ' · ' + rep.action.split(',').filter(Boolean).map(actLabel).join(', ') : '') + (rep.resolution ? ' — ' + rep.resolution : '')) : null,
        rep.status === 'open' ? h('div.prow', btn(t('a_r_resolve'), { size: 'sm', variant: 'primary', appearance: 'solid', icon: 'shield-check', onclick: () => resolveDialog(rep) })) : null));
    };

    async function rload() {
      const r = await api('master.reports', undefined, { show: rshow });
      put(rbox, r.reports.length ? r.reports.map(repCard) : empty('flag', t('a_r_none'), t('a_r_none_t')));
    }
    put(main, h('h1.ah', t('a_reports')), h('p.muted', t('a_reports_t')), h('sav-alert', { variant: 'neutral' }, t('a_r_privacy')), h('div.atools', rfilter), rbox);
    await rload();
    return;
  }

  // ---------------------------------------------------------------- accounts
  let show = 'all', q = '', users = [], defaultQuota = 0;
  const box = h('div.ulist2'), count = h('span.muted.small');
  const searchBox = h('sav-input', { type: 'search', placeholder: t('a_find'), clearable: true, 'aria-label': t('a_find') });
  let to;
  searchBox.addEventListener('input', () => { clearTimeout(to); to = setTimeout(() => { q = searchBox.value.trim(); load().catch(fail); }, 300); });
  const filter = segmented(t('a_show'), show, [['all', '=' + t('a_all'), t('a_all')], ['waiting', '=' + t('a_waiting'), t('a_waiting')], ['active', '=' + t('a_active'), t('a_active')]], (v) => { show = v; load().catch(fail); }, { class: 'afilter' });
  filter.setAttribute('size', 'md'); // the height of the search next to it

  const quotaDialog = (u) => {
    // a space of its own (a number, or without a limit: "Unlimited" switches the number off), or the space of everybody
    const own = h('sav-switch', { checked: u.ownQuota || null }, t('a_own_quota'));
    const unl = h('sav-switch', { checked: u.unlimited || null, disabled: !u.ownQuota || null }, t('a_unlimited'));
    const n = sizeField(t('a_space'), u.unlimited ? defaultQuota : u.quota);
    n.disabled = !u.ownQuota || u.unlimited;
    const sync = () => { unl.disabled = !own.checked; n.disabled = !own.checked || unl.checked; if (!own.checked) { unl.checked = false; n.bytes = defaultQuota; } };
    own.addEventListener('change', sync);
    unl.addEventListener('change', sync);
    dialog({ title: t('a_quota_of', { name: u.name }), width: '26rem',
      body: h('div.form', h('p.muted', t('a_quota_used', { used: bytes(u.used), files: num(u.files) })), own, unl, n, h('p.muted.small', t('a_quota_def', { q: bytes(defaultQuota) }))),
      actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => {
        const b = n.bytes;
        if (own.checked && !unl.checked && (!Number.isFinite(b) || b < 0)) throw Object.assign(new Error('bad_quota'), { code: 'bad_quota' });
        await api('master.quota', own.checked && unl.checked ? { id: u.id, email: u.email, unlimited: true } : { id: u.id, email: u.email, quota: own.checked ? b : null });
        toast(t('settings_saved'), 'success');
        load().catch(fail);
      } }] });
  };
  const setActive = async (ids, on) => { const r = await api('master.activate', { ids, on }); toast(t(on ? 'a_activated_n' : 'a_deactivated_n', { n: r.changed }), 'success'); await load(); };
  const del = async (u) => {
    if (!(await confirm(t('a_delete'), t('a_delete_t', { name: u.name, email: u.email, used: bytes(u.used) }), t('a_delete')))) return;
    try { await api('master.delete', { id: u.id }); toast(t('a_deleted'), 'success'); load(); } catch (e) { fail(e); }
  };

  const userCard = (u) => {
    const pc = u.unlimited ? 0 : u.quota ? Math.min(100, (u.used / u.quota) * 100) : 0;
    return h('sav-card.ucard', { appearance: 'outlined' }, h('div.urow2',
      face(u.name, null, 40),
      h('div.uwho', h('b', u.name, u.master ? badge('primary', t('admin')) : null), u.account ? h('small', u.email) : null, h('small.muted', u.account ? t('a_joined', { when: when(u.created) }) + (u.login ? ' · ' + t('a_last', { when: when(u.login) }) : '') : t('a_other_only'))),
      h('div.ustate', !u.account ? badge('neutral', t('a_no_account')) : u.activated ? badge('success', t('a_is_active')) : badge('warning', t('a_is_waiting')), u.account && !u.verified ? badge('neutral', t('a_unverified')) : null),
      h('div.uspace', u.unlimited ? null : h('sav-progress-bar', { value: Math.max(pc, u.used ? 1 : 0), max: 100, variant: pc > 95 ? 'danger' : pc > 85 ? 'warning' : 'primary', 'aria-label': t('a_space') }),
        h('small', u.unlimited ? [t('space_used_unl', { used: bytes(u.used) }), ' ', h('sav-badge', { variant: 'primary', appearance: 'soft', pill: true }, t('unlimited'))] : [t('space_used', { used: bytes(u.used), quota: bytes(u.quota) }), u.ownQuota ? ' · ' + t('a_custom') : '']), Object.keys(u.parts || {}).length ? h('ul.qparts.row', spaceParts(u.parts)) : null),
      h('div.uact', u.master ? [h('small.muted', t('a_master_fixed')), btn(t('a_space'), { size: 'sm', icon: 'hard-drive', onclick: () => quotaDialog(u) })] : !u.account ? btn(t('a_space'), { size: 'sm', icon: 'hard-drive', onclick: () => quotaDialog(u) })
        : [btn(t(u.activated ? 'a_deactivate_one' : 'a_activate_one'), { size: 'sm', icon: u.activated ? 'user-x' : 'user-check', variant: u.activated ? 'neutral' : 'primary', appearance: u.activated ? 'outline' : 'solid', onclick: () => setActive([u.id], !u.activated) }),
          btn(t('a_space'), { size: 'sm', icon: 'hard-drive', onclick: () => quotaDialog(u) }),
          btn('', { size: 'sm', icon: 'trash-2', variant: 'danger', appearance: 'ghost', label: t('a_delete'), title: t('a_delete'), onclick: () => del(u) })])));
  };

  async function load() {
    const r = await api('master.users', undefined, { q, show });
    users = r.users; defaultQuota = r.defaultQuota;
    const waiting = users.filter((u) => u.account && !u.activated && !u.master);
    put(count, t('a_n_accounts', { n: users.length }));
    put(box, waiting.length > 1 && show !== 'active' ? h('sav-alert.wbar', { variant: 'warning' }, t('a_n_waiting', { n: waiting.length }), ' ', btn(t('a_activate_all'), { size: 'sm', icon: 'user-check', onclick: () => setActive(waiting.map((u) => u.id), true) })) : null,
      users.length ? users.map(userCard) : empty('users', t('a_none'), ''));
  }
  put(main, h('h1.ah', t('a_users')), h('div.atools', searchBox, filter, count), box);
  await load();
}
