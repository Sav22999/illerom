/**
 * My spending: a light personal budget on top of the groups, only to look at what was spent (no accounts, no assets, no
 * advice). It adds up the share of the account in the expenses of every group where it is one of the people (not what it
 * paid: that is settled by the balances), with the expenses of its personal group, by month and by category, for a
 * period and a group. Monthly caps for some categories show how much of each is used; the view goes out as CSV.
 * Shown inside the home (#/spending), beside the same side menu.
 */
import { btn, dialog, empty, fail, h, icon, iconBtn, primary, put, select, toast } from './ui.js';
import { t } from './i18n.js';
import { S, api, hasPersonal, loadGroups, loadMine } from './store.js';
import { go, prefs } from './account.js';
import { CATS, catHue, catIcon, catName, convert, curOptions, dec, major, money, parseAmount, toInput } from './money.js';
import { dayLabel, monthKey, monthLabel, todayKey } from './time.js';

const PERIODS = ['this_month', 'prev_month', '3m', '12m', 'year', 'all'];
const st = { period: 'this_month', group: '', shown: 60 };

/** Months as YYYY-MM, n months after (or before) mk. */
const addMonths = (mk, n) => { const [y, m] = mk.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
/** The months of a period: [first, last] (null: no bound). */
function range(p) {
  const now = todayKey().slice(0, 7);
  return { this_month: [now, now], prev_month: [addMonths(now, -1), addMonths(now, -1)], '3m': [addMonths(now, -2), now], '12m': [addMonths(now, -11), now], year: [now.slice(0, 4) + '-01', now], all: [null, null] }[p] || [now, now];
}
const inRange = (day, [a, b]) => { const m = day.slice(0, 7); return (!a || m >= a) && (!b || m <= b); };

/** The currency of the view: the one saved, else the one of most groups. */
export function viewCur(d = S.mine) {
  if (d?.budget?.currency) return d.budget.currency;
  const by = {};
  for (const g of d?.groups || []) by[g.currency] = (by[g.currency] || 0) + 1;
  return Object.keys(by).sort((a, b) => by[b] - by[a])[0] || prefs().currency || 'EUR';
}
/** An amount of a group in the currency of the view, at today's rates of the ECB (null when one of them has none). */
function toView(v, from, cur, rates) {
  if (from === cur) return v;
  if (!rates?.[from] || !rates?.[cur]) return null;
  return convert(v, from, cur, rates[cur] / rates[from]);
}

/** The rows of the view as objects, in the currency of the view; skipped: how many could not be converted. */
function rowsOf(d) {
  const cur = viewCur(d), out = [];
  let skipped = 0;
  for (const [gi, day, cat, title, share, eid] of d.rows) {
    const g = d.groups[gi];
    const v = toView(share, g.currency, cur, d.rates);
    if (v === null) { skipped++; continue; }
    out.push({ g, day, cat, title, share, v, eid, personal: g.kind === 'personal' });
  }
  return { cur, rows: out, skipped };
}

/** What was spent in each capped category in the month mk: {category: minor units of the view}. */
function capUse(rows, mk) {
  const use = {};
  for (const r of rows) if (r.day.slice(0, 7) === mk) use[r.cat] = (use[r.cat] || 0) + r.v;
  return use;
}

// ------------------------------------------------------------------ the view

export async function spendingView(main, term = '') {
  if (!S.mine) {
    put(main, h('div.wait.small', h('sav-spinner', { style: 'font-size:2rem' })));
    await loadMine();
  }
  paint(main, term);
}

function paint(main, term) {
  const d = S.mine, { cur, rows: all, skipped } = rowsOf(d), fmt = (v) => money(v, cur);
  const rg = range(st.period);
  const gOk = (r) => !st.group || (st.group === ':personal' ? r.personal : st.group === ':shared' ? !r.personal : r.g.id === st.group);
  const words = term.trim().toLowerCase();
  const rows = all.filter((r) => inRange(r.day, rg) && gOk(r) && (!words || (r.title + ' ' + r.g.name + ' ' + catName(r.cat)).toLowerCase().includes(words)));
  const total = rows.reduce((a, r) => a + r.v, 0);

  // ---------------------------------------------------------------- head and filters
  const head = h('div.hhead', h('h1', t('my_spending')), h('span.spacer'),
    btn(t('import_bank_s'), { size: 'sm', icon: 'upload', appearance: 'outline', variant: 'neutral', onclick: () => import('./bankcsv.js').then((m) => m.importDialog()) }),
    btn(t('set_caps'), { size: 'sm', icon: 'target', appearance: 'outline', variant: 'neutral', onclick: () => capsDialog() }),
    iconBtn('download', t('export_csv'), () => exportCsv(rows, cur)),
    iconBtn('tag', t('keywords'), () => keywordsDialog()));
  const groupOpts = [['', t('all_groups_f')], [':personal', t('personal_groups')], [':shared', t('shared_groups')], ...d.groups.filter((g) => !g.archived || st.group === g.id).map((g) => [g.id, g.name])];
  const filters = h('div.etools.bfilters',
    select(null, PERIODS.map((p) => [p, t('per_' + p)]), st.period, (v) => { st.period = v; st.shown = 60; paint(main, term); }, { 'aria-label': t('period'), class: 'efilter' }),
    select(null, groupOpts, st.group, (v) => { st.group = v; st.shown = 60; paint(main, term); }, { 'aria-label': t('group_f'), class: 'efilter' }));

  // ---------------------------------------------------------------- alerts: the personal group to make, the caps passed
  const caps = d.budget?.caps || {};
  const capMonth = st.period === 'prev_month' ? rg[0] : todayKey().slice(0, 7);
  const use = capUse(all.filter(gOk), capMonth);
  const over = Object.keys(caps).filter((c) => (use[c] || 0) > caps[c]);
  const alerts = [];
  if (!hasPersonal()) alerts.push(h('sav-alert.gban', { variant: 'neutral', appearance: 'soft' }, icon('user', { slot: 'icon' }),
    h('div.gban-t', h('b', t('make_personal')), h('small', t('make_personal_t'))), btn(t('make_personal'), { size: 'sm', variant: 'primary', appearance: 'soft', icon: 'plus', onclick: () => makePersonal() })));
  if (over.length) alerts.push(h('sav-alert.gban', { variant: 'danger', appearance: 'soft' }, icon('alert-triangle', { slot: 'icon' }),
    h('div.gban-t', h('b', over.length === 1 ? t('caps_over_1') : t('caps_over_n', { n: over.length })), h('small', t('caps_over_list', { l: over.map(catName).join(', ') })))));
  if (skipped) alerts.push(h('sav-alert', { variant: 'neutral', appearance: 'soft' }, icon('info', { slot: 'icon' }), t('other_cur', { n: skipped })));

  // ---------------------------------------------------------------- four numbers
  const months = new Set(rows.map((r) => monthKey(r.day)));
  const nMonths = rg[0] ? Math.max(1, monthsBetween(rg[0], rg[1])) : Math.max(1, months.size);
  const thisMonth = all.filter((r) => gOk(r) && r.day.slice(0, 7) === todayKey().slice(0, 7)).reduce((a, r) => a + r.v, 0);
  const stat = (label, value, ic) => h('sav-card.stat', h('div.sti', icon(ic)), h('div', h('small.muted', label), h('strong', value)));
  const stats = h('div.stats', stat(t('my_share_total'), fmt(total), 'pie-chart'), stat(t('month_avg'), fmt(Math.round(total / nMonths)), 'bar-chart'),
    stat(t('this_month'), fmt(thisMonth), 'calendar'), stat(t('n_expenses_l'), String(rows.length), 'list'));

  if (!all.length) {
    put(main, head, h('p.muted.bsub', t('my_spending_t')), alerts, empty('pie-chart', t('no_spending'), t('no_spending_t'),
      h('div.prow.wrap.center', hasPersonal() ? null : primary(t('make_personal'), { icon: 'plus', onclick: () => makePersonal() }), btn(t('import_bank_s'), { icon: 'upload', onclick: () => import('./bankcsv.js').then((m) => m.importDialog()) }))),
    capsCard(caps, use, capMonth, cur));
    return;
  }

  // ---------------------------------------------------------------- by month (personal and shared, stacked) and by category
  const last = rg[1] || [...months].sort().pop() || todayKey().slice(0, 7);
  let first = rg[0] || [...months].sort()[0] || last;
  if (monthsBetween(first, last) < 6) first = addMonths(last, -5);
  if (monthsBetween(first, last) > 24) first = addMonths(last, -23);
  const mks = [];
  for (let m = first; m <= last; m = addMonths(m, 1)) mks.push(m);
  const found = words ? new Set(rows) : null;
  const byM = (pers) => mks.map((m) => major(all.filter((r) => gOk(r) && r.personal === pers && r.day.slice(0, 7) === m && (!found || found.has(r))).reduce((a, r) => a + r.v, 0), cur));
  const mbars = h('sav-chart-bar', { label: t('by_month'), height: 220, stacked: true, 'show-values': true, gap: 0.35, style: 'width:100%' });
  mbars.data = { labels: mks.map((m) => monthLabel(m, true)), series: [{ name: t('personal_s'), values: byM(true), color: 'var(--sav-color-primary)' }, { name: t('shared_s'), values: byM(false), color: 'var(--sun)' }] };

  const byCat = {};
  for (const r of rows) byCat[r.cat] = (byCat[r.cat] || 0) + r.v;
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const pie = h('sav-chart-pie', { type: 'donut', label: t('by_category'), height: 210, center: fmt(total), 'show-values': true, 'no-legend': true });
  pie.data = { labels: cats.map(([c]) => catName(c)), values: cats.map(([, v]) => major(v, cur)) };
  const catList = h('div.clist', cats.map(([c, v]) => h('div.crow', h('span.eic.sm', { style: `--h:${catHue(c)}` }, icon(catIcon(c))), h('span.grow', catName(c)), h('small.muted', total ? Math.round(v / total * 100) + '%' : ''), h('b', fmt(v)))));

  // ---------------------------------------------------------------- the expenses
  const list = h('div.elist');
  const paintList = () => {
    const shown = rows.slice(0, st.shown), days = new Map();
    for (const r of shown) { if (!days.has(r.day)) days.set(r.day, []); days.get(r.day).push(r); }
    put(list, [...days].map(([day, items]) => h('section.eday', h('h3', dayLabel(day, { weekday: 'short', day: 'numeric', month: 'long', year: day.slice(0, 4) === todayKey().slice(0, 4) ? undefined : 'numeric' })), items.map(rowOf))),
      rows.length > st.shown ? h('div.center.bmore', btn(t('show_more'), { size: 'sm', appearance: 'ghost', onclick: () => { st.shown += 100; paintList(); } })) : null);
  };
  const rowOf = (r) => h('div.erow', { tabindex: 0, role: 'button', onclick: () => go('#/g/' + r.g.id), onkeydown: (e) => { if (e.key === 'Enter') go('#/g/' + r.g.id); } },
    h('span.eic', { style: `--h:${catHue(r.cat)}` }, icon(catIcon(r.cat))),
    h('div.emid', h('b', r.title || catName(r.cat)), h('small.muted', h('span.gdot', { style: `--c:${r.g.color}` }), r.g.name, ' · ', catName(r.cat))),
    h('div.eamt', h('strong', fmt(r.v)), r.g.currency !== cur ? h('small.muted', money(r.share, r.g.currency)) : null));
  paintList();

  put(main, head, h('p.muted.bsub', t('my_spending_t')), filters, alerts, stats,
    h('div.bgrid', h('sav-card.bcard2', h('h2', t('by_month')), mbars), h('sav-card.bcard2', h('h2', t('by_category')), cats.length ? h('div.catbox', pie, catList) : empty('pie-chart', t('no_spending'), ''))),
    h('div.bgrid', capsCard(caps, use, capMonth, cur), h('sav-card.bcard2.blist2', h('div.bhead', h('h2', t('latest')), h('span.spacer'), h('small.muted', t('n_rows', { n: rows.length }) + ' · ' + fmt(total))), rows.length ? list : empty('search', t('no_spending'), ''))),
    Object.keys(d.rates || {}).length && d.groups.some((g) => g.currency !== cur) ? h('small.muted', t('conv_note')) : null);
}
const monthsBetween = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1) + 1; };

/** The caps of the month: a bar for each capped category, red once it is passed. */
function capsCard(caps, use, mk, cur) {
  const list = Object.keys(caps).sort((a, b) => (use[b] || 0) / caps[b] - (use[a] || 0) / caps[a]);
  const bar = (c) => {
    const u = use[c] || 0, cap = caps[c], pct = Math.round(u / cap * 100), over = u > cap;
    return h('div.caprow' + (over ? '.over' : ''), h('div.caphead', h('span.eic.sm', { style: `--h:${catHue(c)}` }, icon(catIcon(c))), h('b.grow', catName(c)),
      h('small' + (over ? '.neg' : '.muted'), over ? t('cap_over', { a: money(u - cap, cur) }) : t('cap_left', { a: money(cap - u, cur) }))),
      h('sav-progress-bar', { value: Math.min(100, pct), variant: over ? 'danger' : pct >= 80 ? 'warning' : 'success', label: t('cap_of', { a: money(u, cur), b: money(cap, cur) }), 'show-value': true }));
  };
  return h('sav-card.bcard2', h('div.bhead', h('h2', t('caps_month', { m: monthLabel(mk) })), h('span.spacer'), iconBtn('pencil', t('set_caps'), () => capsDialog())),
    list.length ? h('div.caps', list.map(bar)) : h('div.alleven', icon('target'), h('div', h('b', t('caps_none')), h('small.muted', t('caps_none_t')))));
}

/** The personal group of the account: made once, then the view is drawn again. */
async function makePersonal() {
  const r = await api('splits.group.create', { name: t('k_personal_ph'), kind: 'personal', icon: 'user', color: '#4a5875', currency: viewCur(), members: [{ name: S.user.name, me: true }] });
  toast(t('personal_made'), 'success');
  await loadGroups();
  go('#/g/' + r.group.id);
}

/** The view as CSV, as it is filtered: one row per expense, with the share in the currency of the group and of the view. */
function exportCsv(rows, cur) {
  const cell = (v) => { const s = String(v ?? ''); return /[",\n\r;]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };
  const num = (minor, c) => ((minor || 0) / 10 ** dec(c)).toFixed(dec(c));
  const head = [t('day'), t('group_col'), t('what'), t('category'), t('my_share_col'), t('currency'), `${t('my_share_col')} (${cur})`];
  const out = [head, ...rows.map((r) => [r.day, r.g.name, r.title, r.cat ? catName(r.cat) : '', num(r.share, r.g.currency), r.g.currency, num(r.v, cur)])];
  const blob = new Blob(['﻿' + out.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (t('my_spending') + ' ' + todayKey()).replace(/[\\/:*?"<>|]+/g, ' ') + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

const redrawHome = () => dispatchEvent(new CustomEvent('savsplits-budget'));

/** The caps: the currency of the view and an amount a month for any category (empty: none). */
export function capsDialog() {
  const d = S.mine, caps = d?.budget?.caps || {};
  let cur = viewCur(d);
  const curSel = select(t('view_currency'), curOptions(), cur, (v) => { cur = v || cur; }, { searchable: true, help: t('view_currency_t') });
  const boxes = CATS.map(([c]) => { const n = h('sav-input', { value: caps[c] ? toInput(caps[c], cur) : '', inputmode: 'decimal', size: 'sm', placeholder: '—', 'aria-label': catName(c), 'data-c': c, class: 'capin' }); n.addEventListener('keydown', (e) => e.stopPropagation()); return n; });
  const rows = CATS.map(([c, ic], i) => h('div.capedit', h('span.eic.sm', { style: `--h:${catHue(c)}` }, icon(ic)), h('span.grow', catName(c)), boxes[i]));
  dialog({ title: t('caps'), width: '30rem', body: h('div.form', h('p.muted.small', t('caps_t')), curSel, h('div.capgrid', rows)), actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => {
    const out = {};
    for (const b of boxes) { const v = parseAmount(b.value, cur); if (v && v > 0) out[b.dataset.c] = v; }
    const r = await api('splits.budget.save', { currency: cur, caps: out });
    S.mine.budget = r.budget;
    S.capCats = Object.keys(r.budget.caps || {});
    toast(t('caps_saved'), 'success');
    redrawHome();
  } }] });
}

/** The keywords that give a category to the rows of a bank statement. */
export function keywordsDialog() {
  let rules = (S.mine?.budget?.rules || []).map((r) => ({ ...r }));
  const box = h('div.stack');
  const opts = CATS.map(([c]) => [c, catName(c)]);
  const paint = () => put(box, rules.length ? rules.map((r, i) => {
    const k = h('sav-input', { value: r.k, size: 'sm', maxlength: 60, 'aria-label': t('keyword') });
    k.addEventListener('input', () => { r.k = k.value; });
    k.addEventListener('keydown', (e) => e.stopPropagation());
    return h('div.kwrow', k, select(null, opts, r.c, (v) => { r.c = v; }, { 'aria-label': t('category'), searchable: true }), iconBtn('trash', t('remove'), () => { rules.splice(i, 1); paint(); }));
  }) : h('small.muted', t('no_keywords')), btn(t('add_keyword'), { size: 'sm', icon: 'plus', onclick: () => { rules.push({ k: '', c: 'other' }); paint(); box.querySelector('.kwrow:last-of-type sav-input')?.focus?.(); } }));
  paint();
  dialog({ title: t('keywords'), width: '34rem', body: h('div.form', h('p.muted.small', t('keywords_t')), box), actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => {
    const r = await api('splits.budget.save', { rules: rules.filter((x) => x.k.trim().length > 1) });
    S.mine.budget = r.budget;
    toast(t('keywords_saved'), 'success');
  } }] });
}

/**
 * After an expense is saved in a group: when the category of the account passed its cap of this month with it, a note
 * (only when the caps were already read: nothing is asked to the server for an account that never opened the view).
 */
export async function capCheck(cat, day, share, from) {
  try {
    if (!cat || !share || day.slice(0, 7) !== todayKey().slice(0, 7) || !(S.mine?.budget?.caps?.[cat] || S.capCats?.includes(cat))) return;
    await loadMine();
    const cap = S.mine.budget.caps[cat], cur = viewCur();
    if (!cap) return;
    const now = capUse(rowsOf(S.mine).rows, day.slice(0, 7))[cat] || 0, mine = toView(share, from, cur, S.mine.rates) || 0;
    if (now > cap && now - mine <= cap) toast(t('cap_toast', { c: catName(cat), a: money(now, cur), b: money(cap, cur) }), 'warning', { duration: 7000 });
  } catch { /* only a note */ }
}
