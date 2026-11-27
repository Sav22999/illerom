/**
 * A group: its expenses (by day, with a search and filters), the balances and who pays whom, the charts, the people (and
 * the tables of shares of a condominium), what happened. Opened by an account (#/g/<id>) or from its link (#/j/<code>):
 * a guest of the link says who they are (kept in this browser) and may join with an account at any time.
 */
import { btn, colorPop, confirm, copyText, dialog, drop, empty, face, fail, h, icon, iconBtn, primary, put, select, toast, K } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { S, api, canWrite, groupCall, guestAs, loadGroup, meId, member, memberName, setGuestAs } from './store.js';
import { brand, commands, credit, go, langButton, userMenu } from './account.js';
import { appsButton } from './office.js';
import { CATS, catHue, catIcon, catName, curOptions, major, money, toInput, parseAmount } from './money.js';
import { dayHead, monthKey, monthLabel } from './time.js';
import { KINDS, groupIcon, kindOf } from './home.js';

const TABS = [['expenses', 'receipt'], ['stats', 'pie-chart'], ['people', 'users'], ['activity', 'history']];
const GROUP_ICONS = ['wallet', 'plane', 'house', 'heart', 'party-popper', 'users', 'building', 'utensils', 'car', 'tent', 'gift', 'shopping-cart', 'graduation-cap', 'dumbbell', 'music', 'briefcase', 'coffee', 'globe', 'star'];
let sc = null; // the screen open now

const G = () => S.G;
const cur = () => S.G.group.currency;
const fmt = (v) => money(v, cur());
const base = () => (S.G.src.code ? '#/j/' + S.G.src.code : '#/g/' + S.G.group.id);
export const linkUrl = (code) => location.origin + location.pathname.replace(/[^/]*$/, '') + '#/j/' + code;
const isGuest = () => !S.user || !S.user.verified;

export async function groupScreen(root, where, tab) {
  const first = !sc || sc.key !== JSON.stringify(where) || !root.contains(sc.el);
  if (first) {
    put(root, h('div.wait', h('sav-spinner', { style: 'font-size:2rem' })));
    await loadGroup(where);
    // an account that belongs to the group and opened its link: the address of the group of its own
    if (where.code && G().via === 'account') { history.replaceState(null, '', '#/g/' + G().group.id + (tab ? '/' + tab : '')); where = { id: G().group.id }; S.G.src = where; }
    sc = { key: JSON.stringify(where), el: null, tab: 'expenses', filter: { q: '', who: '', cat: '' } };
  }
  sc.tab = TABS.some((x) => x[0] === tab) ? tab : sc.tab || 'expenses';
  draw(root);
  if (first && G().src.code && !G().me && !guestAs(G().src.code) && G().members.length) setTimeout(() => whoAreYou(), 250);
  commands([G().group.name, [canWrite() ? ['plus', t('add_expense'), () => openExpense(), 'N'] : null, canWrite() ? ['hand-coins', t('add_transfer'), () => openExpense(null, { kind: 'transfer' })] : null,
    ...TABS.map(([k, ic], i) => [ic, t('tab_' + k), () => setTab(k), String(i + 1)]), ['share', t('share'), () => shareDialog()], S.user ? ['home', t('my_groups'), '#/'] : null]]);
  const onKey = (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('sav-dialog[open], sav-drawer[open]')) return;
    if (e.composedPath().some((x) => /^(input|textarea|sav-input|sav-textarea|sav-select|sav-search|sav-chip-input|sav-date-picker|sav-number-input)$/.test(x.localName || ''))) return;
    const map = { n: () => canWrite() && openExpense(), a: () => canWrite() && openExpense(), '/': () => document.querySelector('.eq')?.focus(), '?': () => shortcutsDialog() };
    TABS.forEach(([k], i) => { map[String(i + 1)] = () => setTab(k); });
    if (map[e.key]) { e.preventDefault(); map[e.key](); }
  };
  let last = Date.now();
  const onVis = () => { if (document.visibilityState === 'visible' && Date.now() - last > 30000) { last = Date.now(); refresh().catch(() => {}); } };
  addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVis);
  return () => { removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis); };
}

/** Again from the server (another person may have added something), only when something changed. */
async function refresh(force) {
  const rev = G().group.rev;
  await loadGroup(G().src);
  if ((force || G().group.rev !== rev) && sc?.el?.isConnected) redraw();
}
export const redraw = () => { if (sc?.el?.isConnected) draw(sc.el.parentNode); };
function setTab(k) {
  if (k === 'balances') { document.querySelector('.bcard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  history.replaceState(null, '', base() + '/' + k); sc.tab = k; redraw();
}
const openExpense = (e, preset) => import('./expense.js').then((m) => m.expenseDialog(e, preset)).catch(fail);

// ------------------------------------------------------------------ the page

/**
 * As the page of a schedule in SavSchedules: the bar (back, refresh, edit, share, add, more), the title with its kind,
 * four numbers, then the balances and who pays whom on the side and the expenses (with charts, people, history) beside.
 */
function draw(root) {
  const d = G(), g = d.group, me = meId();
  const top = h('header.htop', brand(S.user ? '#/' : '#/welcome'), h('div.spacer'),
    isGuest() ? [langButton(), appsButton(), btn(t('sign_in'), { appearance: 'outline', size: 'sm', onclick: () => { sessionStorage.setItem('savsplits-next', location.hash); go('#/signin'); } })] : userMenu());
  const people = d.members.filter((m) => m.active);
  const head = h('div.rhead', S.user ? btn(t('my_groups'), { icon: 'arrow-left', appearance: 'ghost', size: 'sm', onclick: () => go('#/') }) : null, h('span.spacer'),
    iconBtn('rotate-ccw', t('refresh'), () => refresh(true)), canWrite() && d.via === 'account' ? btn(t('edit'), { icon: 'pencil', size: 'sm', onclick: () => settingsDialog() }) : null,
    btn(t('share'), { icon: 'share', size: 'sm', onclick: () => shareDialog() }), canWrite() ? primary(t('add_expense'), { icon: 'plus', size: 'sm', class: 'addb', onclick: () => openExpense() }) : null, groupMenu());
  const title = h('div.rtitle', h('span.rk', icon(groupIcon(g)), t('k_' + g.kind)), h('h1', g.name), h('p.muted', [people.map((m) => m.name).join(', '), t('updated_w', { w: when(g.updated) })].filter(Boolean).join(' · ')), g.notes ? h('p.gnotes', g.notes) : null);
  const st = (label, value, ic, cls) => h('sav-card.stat', h('div.sti', icon(ic)), h('div', h('small.muted', label), h('strong' + (cls ? '.' + cls : ''), value)));
  const ex = d.expenses.filter((e) => e.kind === 'expense'), mine = me ? +d.balance[me] || 0 : null;
  const stats = h('div.stats', st(t('total_spent'), fmt(g.total), 'receipt'),
    mine !== null ? st(t(mine > 0 ? 'to_get' : mine < 0 ? 'to_give' : 'your_balance'), mine ? fmt(Math.abs(mine)) : t('settled'), 'scale', mine > 0 ? 'pos' : mine < 0 ? 'neg' : '') : st(t('people'), String(people.length), 'users'),
    st(t('n_expenses_l'), String(ex.length), 'list'), st(t('per_person'), fmt(Math.round(g.total / Math.max(1, people.length))), 'users'));
  const tabs = h('sav-tabs.gtabs', { active: sc.tab }, TABS.map(([k, ic]) => h('sav-tab', { name: k, label: t('tab_' + k), icon: ic }, h('div.tabbody', { 'data-tab': k }))));
  tabs.addEventListener('sav-tab-show', (e) => { if (e.target !== tabs) return; sc.tab = e.detail.name; history.replaceState(null, '', base() + '/' + sc.tab); fillTab(tabs); });
  const fab = canWrite() ? h('sav-button.fab', { variant: 'primary', appearance: 'solid', icon: 'plus', label: t('add_expense'), size: 'lg', onclick: () => openExpense() }) : null;
  const el = h('div.home.resp', { style: `--c:${g.color}` }, top,
    h('main.rmain', head, title, banner(me), stats, h('div.rbody', h('div.rside', balancesCard(), settleCard()), h('sav-card.tcard', tabs))), credit(), fab);
  put(root, el);
  sc.el = el;
  fillTab(tabs);
  document.title = g.name + ' – SavSplits';
}

function fillTab(tabs) {
  const box = tabs.querySelector(`.tabbody[data-tab="${sc.tab}"]`);
  if (!box) return;
  tabs.querySelectorAll('.tabbody').forEach((b) => { if (b !== box) b.replaceChildren(); });
  const f = { expenses: expensesTab, stats: statsTab, people: peopleTab, activity: activityTab }[sc.tab];
  put(box, f());
}

/** A guest of the link: who they are, and joining with an account. An account not yet among the people: which one it is. */
function banner(me) {
  const d = G();
  if (d.src.code && isGuest()) {
    const who = me ? memberName(me) : '';
    return h('sav-alert.gban', { variant: 'neutral', appearance: 'soft' }, icon('link', { slot: 'icon' }),
      h('div.gban-t', h('b', who ? t('guest_as', { n: who }) : t('guest_title')), h('small', d.role === 'viewer' ? t('guest_view_t') : t('guest_edit_t'))),
      h('div.prow.wrap', btn(who ? t('change') : t('who_btn'), { size: 'sm', onclick: () => whoAreYou() }), btn(t('keep_group'), { size: 'sm', variant: 'primary', appearance: 'soft', onclick: () => { sessionStorage.setItem('savsplits-next', location.hash); go('#/signup'); } })));
  }
  if (S.user?.verified && !d.me) {
    const free = d.members.filter((m) => !m.linked && m.active);
    return h('sav-alert.gban', { variant: 'primary', appearance: 'soft' }, icon('user-plus', { slot: 'icon' }),
      h('div.gban-t', h('b', t('join_title')), h('small', t('join_t'))), h('div.prow.wrap', btn(t('join_btn'), { size: 'sm', variant: 'primary', appearance: 'solid', onclick: () => claimDialog(free) })));
  }
  if (d.archived) return h('sav-alert.gban', { variant: 'neutral', appearance: 'soft' }, icon('archive', { slot: 'icon' }), h('div.gban-t', h('b', t('archived_group'))), btn(t('unarchive'), { size: 'sm', onclick: () => archive(false) }));
  return null;
}

// ------------------------------------------------------------------ expenses

/** What an expense means for a person: what they paid minus their part (minor units of the group). */
const net = (e, mid) => (+e.paid[mid] || 0) - (+e.alloc[mid] || 0);
const payersText = (e) => { const ids = Object.keys(e.payers); return ids.length === 1 ? memberName(ids[0]) : ids.map(memberName).join(', '); };

function expensesTab() {
  const d = G(), me = meId(), f = sc.filter;
  const q = h('sav-input.eq', { type: 'search', placeholder: t('search_expenses'), value: f.q, clearable: true, size: 'sm', 'aria-label': t('search') }, icon('search', { slot: 'prefix' }));
  q.addEventListener('keydown', (e) => e.stopPropagation());
  q.addEventListener('input', () => { f.q = q.value; paint(); });
  const who = select(null, [['', t('everyone')], ...d.members.map((m) => [m.id, m.name])], f.who, (v) => { f.who = v; paint(); }, { 'aria-label': t('filter_person'), class: 'efilter' });
  const used = new Set(d.expenses.map((e) => e.category));
  const cat = select(null, [['', t('all_categories')], ...CATS.filter(([c]) => used.has(c)).map(([c]) => [c, catName(c)]), used.has('') ? ['-', t('cat_none')] : null].filter(Boolean), f.cat, (v) => { f.cat = v; paint(); }, { 'aria-label': t('category'), class: 'efilter' });
  const list = h('div.elist');
  const foot = h('div.efoot');
  function paint() {
    const words = f.q.trim().toLowerCase();
    const rows = d.expenses.filter((e) => (!f.who || e.payers[f.who] !== undefined || e.alloc[f.who] !== undefined) && (!f.cat || (f.cat === '-' ? !e.category : e.category === f.cat))
      && (!words || [e.title, e.notes, catName(e.category), payersText(e), ...Object.keys(e.alloc).map(memberName)].join(' ').toLowerCase().includes(words)));
    if (!d.expenses.length) {
      put(list, empty('receipt', t('no_expenses'), canWrite() ? t('no_expenses_t') : t('no_expenses_view'), canWrite() ? primary(t('add_expense'), { icon: 'plus', onclick: () => openExpense() }) : null));
      put(foot);
      return;
    }
    if (!rows.length) { put(list, empty('search', t('nothing_found'), '')); put(foot); return; }
    const days = new Map();
    for (const e of rows) { if (!days.has(e.day)) days.set(e.day, []); days.get(e.day).push(e); }
    put(list, [...days].map(([day, items]) => h('section.eday', h('h3', dayHead(day)), items.map((e) => expenseRow(e, me)))));
    const sum = rows.filter((e) => e.kind === 'expense').reduce((a, e) => a + e.base, 0);
    put(foot, h('span.muted', t('n_expenses', { n: rows.filter((e) => e.kind === 'expense').length })), h('span.spacer'), h('b', fmt(sum)));
  }
  paint();
  return h('div.etab', h('div.etools', q, who, cat), list, foot);
}

function expenseRow(e, me) {
  const tr = e.kind === 'transfer', inc = e.kind === 'income';
  const to = tr ? Object.keys(e.alloc)[0] : null, from = tr ? Object.keys(e.payers)[0] : null;
  const title = tr ? h('b', memberName(from), ' ', icon('arrow-right', { class: 'arr' }), ' ', memberName(to)) : h('b', e.title || t('k_' + e.kind));
  const sub = tr ? t('payback') : inc ? t('received_by', { n: payersText(e) }) : t('paid_by', { n: payersText(e) });
  const mine = me ? net(e, me) : null;
  const involved = mine !== null && (e.alloc[me] !== undefined || e.paid[me] !== undefined);
  // a payback is money given or received; an expense is money lent or owed
  const say = tr ? (mine > 0 ? t('you_gave', { a: fmt(mine) }) : t('you_received', { a: fmt(-mine) })) : mine > 0 ? t('you_lent', { a: fmt(mine) }) : mine < 0 ? t('you_borrowed', { a: fmt(-mine) }) : t('even');
  const impact = mine === null ? null : !involved ? h('small.eimp.zero', t('not_involved')) : h('small.eimp.' + (tr ? 'zero' : mine > 0 ? 'pos' : mine < 0 ? 'neg' : 'zero'), say);
  const ic = tr ? 'arrow-right-left' : inc ? 'banknote' : catIcon(e.category);
  const hue = tr ? 150 : inc ? 140 : catHue(e.category);
  const n = h('div.erow', { tabindex: 0, role: 'button', 'aria-label': (e.title || t('k_' + e.kind)) + ', ' + money(e.amount, e.currency), onclick: () => openExpense(e), onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openExpense(e); } } },
    h('span.eic' + (tr ? '.tr' : ''), { style: `--h:${hue}` }, icon(ic)),
    h('div.emid', title, h('small.muted', sub, e.waiting ? [' · ', icon('clock', { class: 'rep' }), ' ', t('waiting_net')] : null, e.repeat ? [' · ', icon('repeat', { class: 'rep' }), ' ', t('rep_' + e.repeat)] : null, e.repeatOf ? [' · ', icon('repeat', { class: 'rep' })] : null, e.photos?.length ? [' · ', icon('camera', { class: 'rep', label: t('n_photos', { n: e.photos.length }) }), ' ', String(e.photos.length)] : null)),
    h('div.eamt', h('strong' + (inc ? '.inc' : ''), (inc ? '+' : '') + money(e.amount, e.currency)), e.currency !== cur() ? h('small.muted', fmt(e.base)) : null, impact));
  return n;
}

// ------------------------------------------------------------------ balances and who pays whom

function balancesCard() {
  const d = G(), me = meId();
  const top = Math.max(1, ...d.members.map((m) => Math.abs(+d.balance[m.id] || 0)));
  const rows = d.members.filter((m) => m.active || d.balance[m.id]).map((m) => {
    const v = +d.balance[m.id] || 0, w = Math.round(Math.abs(v) / top * 100);
    return h('div.brow' + (m.id === me ? '.me' : ''), face(m.name, null, 30),
      h('div.bname', h('b', m.name, m.id === me ? h('small.tu', ' · ' + t('you')) : null), h('small.muted', t('paid_share', { p: fmt(d.paid[m.id] || 0), s: fmt(d.spent[m.id] || 0) }))),
      h('strong.bval.' + (v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'), v ? money(v, cur(), { sign: true }) : t('even')),
      h('div.bbar', h('i.l', h('span', { class: v < 0 ? 'neg' : '', style: `width:${v < 0 ? w : 0}%` })), h('i.r', h('span', { class: v > 0 ? 'pos' : '', style: `width:${v > 0 ? w : 0}%` }))));
  });
  return h('sav-card.bcard', h('h2', t('balances')), h('small.muted.bnote', t('balances_t')), h('div.blist', rows));
}

function settleCard() {
  const d = G();
  const pay = d.settle.map((p) => {
    const to = member(p.to);
    return h('div.prow2', h('div.pp', face(memberName(p.from), null, 28), h('b', memberName(p.from)), icon('arrow-right', { class: 'parr' }), face(memberName(p.to), null, 28), h('b', memberName(p.to)), h('span.spacer'), h('strong.pamt', fmt(p.amount))),
      to?.pay || canWrite() ? h('div.pact', to?.pay ? btn(t('how_to_pay'), { size: 'sm', icon: 'wallet', appearance: 'ghost', onclick: () => payInfo(to, p.amount) }) : null,
        canWrite() ? btn(t('mark_paid'), { size: 'sm', variant: 'primary', appearance: 'soft', icon: 'check', onclick: () => markPaid(p) }) : null) : null);
  });
  return h('sav-card.scard2', h('div.bhead', h('h2', t('to_settle')), h('span.spacer'), d.settle.length ? iconBtn('copy', t('copy_summary'), () => copyText(summaryText())) : null),
    d.settle.length ? [h('small.muted.bnote', t(d.settle.length === 1 ? 'settle_one' : 'settle_n', { n: d.settle.length })), h('div.plist', pay)] : h('div.alleven', icon('circle-check'), h('div', h('b', t('all_even')), h('small.muted', t('all_even_t')))));
}

/** A payment of the plan done: it becomes a payback (a transfer), which brings both to even. */
async function markPaid(p) {
  const amount = h('sav-input', { label: t('amount'), value: toInput(p.amount, cur()), inputmode: 'decimal', help: t('mark_paid_t', { a: memberName(p.from), b: memberName(p.to) }) });
  let ok = false;
  await new Promise((res) => dialog({
    title: t('mark_paid'), width: '26rem', body: h('div.form', amount),
    actions: [{ label: t('cancel') }, { label: t('mark_paid'), primary: true, run: async () => {
      const v = parseAmount(amount.value, cur());
      if (!v || v <= 0) throw Object.assign(new Error(), { code: 'amount_required' });
      await groupCall('splits.expense.save', { kind: 'transfer', title: '', amount: v, currency: cur(), payers: { [p.from]: v }, split: { mode: 'exact', parts: { [p.to]: v } } });
      ok = true;
    } }], onclose: res,
  }));
  if (ok) { toast(t('paid_done'), 'success'); redraw(); }
}

function payInfo(m, amount) {
  const text = m.pay;
  dialog({ title: t('pay_to', { n: m.name }), width: '28rem', body: h('div.form', h('p', t('pay_amount', { a: fmt(amount) })), h('div.linkrow', h('code', text), btn(t('copy'), { size: 'sm', icon: 'copy', onclick: () => copyText(text) })),
    /^https?:\/\//.test(text) ? btn(t('pay_open'), { icon: 'external-link', href: text, target: '_blank', rel: 'noopener' }) : null, h('small.muted', t('pay_note'))), actions: [{ label: t('close') }] });
}

/** Who pays whom, as text for a chat. */
function summaryText() {
  const d = G();
  return [d.group.name, ...d.settle.map((p) => `• ${memberName(p.from)} → ${memberName(p.to)}: ${fmt(p.amount)}`), '', S.G.group.link ? linkUrl(S.G.group.link) : ''].join('\n').trim();
}

// ------------------------------------------------------------------ charts

function statsTab() {
  const d = G(), ex = d.expenses.filter((e) => e.kind === 'expense');
  if (!ex.length) return empty('pie-chart', t('no_stats'), t('no_stats_t'));
  const byCat = {};
  for (const e of ex) byCat[e.category] = (byCat[e.category] || 0) + e.base;
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const pie = h('sav-chart-pie', { type: 'donut', label: t('by_category'), height: 220, center: fmt(d.group.total), 'show-values': true, 'no-legend': true });
  pie.data = { labels: cats.map(([c]) => catName(c)), values: cats.map(([, v]) => major(v, cur())) };
  const catList = h('div.clist', cats.map(([c, v]) => h('div.crow', h('span.eic.sm', { style: `--h:${catHue(c)}` }, icon(catIcon(c))), h('span.grow', catName(c)), h('small.muted', Math.round(v / d.group.total * 100) + '%'), h('b', fmt(v)))));
  // what each one paid and what was theirs, side by side
  const persons = d.members.filter((m) => d.spent[m.id] || d.paid[m.id]);
  const bars = h('sav-chart-bar', { label: t('by_person'), height: 230, 'show-values': true, gap: 0.3, style: 'width:100%' });
  bars.data = { labels: persons.map((m) => m.name), series: [{ name: t('they_paid'), values: persons.map((m) => major(d.paid[m.id] || 0, cur())), color: 'var(--sav-color-primary)' }, { name: t('their_share'), values: persons.map((m) => major(d.spent[m.id] || 0, cur())), color: 'var(--sun)' }] };
  const byMonth = {};
  for (const e of ex) byMonth[monthKey(e.day)] = (byMonth[monthKey(e.day)] || 0) + e.base;
  const months = Object.keys(byMonth).sort().slice(-12);
  const mbars = months.length > 1 ? h('sav-chart-bar', { label: t('by_month'), height: 200, 'show-values': true, 'no-legend': true, style: 'width:100%' }) : null;
  if (mbars) mbars.data = { labels: months.map((m) => monthLabel(m, true)), series: [{ name: t('spent'), values: months.map((m) => major(byMonth[m], cur())), color: 'var(--sav-color-primary)' }] };
  return h('div.stab',
    h('section.ssec', h('h3', t('by_category')), h('div.catbox', pie, catList)),
    h('section.ssec', h('h3', t('by_person')), h('small.muted', t('by_person_t')), bars),
    mbars ? h('section.ssec', h('h3', t('by_month')), mbars) : null);
}

// ------------------------------------------------------------------ people and tables

function peopleTab() {
  const d = G(), me = meId(), tables = d.group.tables || [];
  const card = (m) => {
    const badges = [m.id === me ? h('sav-badge', { variant: 'primary', appearance: 'soft', pill: true }, t('you')) : null,
      m.linked ? h('sav-badge', { variant: 'neutral', appearance: 'soft', pill: true }, icon('user-check'), ' ', t(m.role === 'viewer' ? 'role_viewer' : 'role_editor')) : null,
      !m.active ? h('sav-badge', { variant: 'neutral', appearance: 'outline', pill: true }, t('left')) : null];
    const quotas = tables.filter((x) => m.quotas?.[x.id]).map((x) => `${x.name} ${fmtQ(m.quotas[x.id])}`);
    return h('div.mrow' + (m.active ? '' : '.away'), face(m.name, null, 38),
      h('div.mname', h('b', m.name, ...badges), h('small.muted', [m.weight !== 1 ? t('default_share', { n: fmtQ(m.weight) }) : null, ...quotas, m.pay ? t('has_pay') : null].filter(Boolean).join(' · ') || ' ')),
      canWrite() ? iconBtn('pencil', t('edit'), () => memberDialog(m)) : null);
  };
  const tbl = tables.length || d.group.kind === 'condo' ? h('section.bsec', h('div.bhead', h('h2', t('tables')), h('span.spacer'), canWrite() && d.via === 'account' ? btn(t('edit_tables'), { size: 'sm', icon: 'pencil', onclick: () => tablesDialog() }) : null),
    h('small.muted.bnote', t('tables_t')), tables.length ? quotasGrid(tables) : empty('building', t('no_tables'), t('no_tables_t'))) : null;
  const mine = d.members.find((m) => m.id === d.me);
  return h('div.ptab',
    h('section.bsec', h('div.bhead', h('h2', t('people')), h('span.spacer'), canWrite() ? btn(t('add_person'), { size: 'sm', icon: 'user-plus', onclick: () => memberDialog() }) : null),
      h('div.mlist', d.members.filter((m) => m.active).map(card)), d.members.some((m) => !m.active) ? h('sav-details', { summary: t('left_n', { n: d.members.filter((m) => !m.active).length }), appearance: 'plain' }, h('div.mlist', d.members.filter((m) => !m.active).map(card))) : null),
    tbl,
    mine && d.role !== 'owner' ? h('section.bsec', h('div.prow.wrap', h('small.muted.grow', t('leave_t')), btn(t('leave'), { size: 'sm', icon: 'log-out', variant: 'danger', appearance: 'outline', onclick: () => leaveGroup() }))) : null);
}
const fmtQ = (n) => new Intl.NumberFormat(getLang() === 'it' ? 'it-IT' : 'en-GB', { maximumFractionDigits: 4 }).format(+n || 0);

/** The shares of each person in each table (the thousandths), changed in the cell, with the total of each table. */
function quotasGrid(tables) {
  const d = G(), people = d.members.filter((m) => m.active), edit = canWrite();
  const cell = (m, x) => {
    if (!edit) return h('td.qn', fmtQ(m.quotas?.[x.id] || 0));
    const n = h('sav-number-input', { value: m.quotas?.[x.id] || '', min: 0, size: 'sm', 'aria-label': `${m.name} · ${x.name}`, limits: 'never', step: 1 });
    n.addEventListener('keydown', (e) => e.stopPropagation());
    n.addEventListener('change', async () => {
      const v = parseFloat(String(n.value).replace(',', '.'));
      const q = { ...(m.quotas || {}) };
      if (Number.isFinite(v) && v > 0) q[x.id] = v; else delete q[x.id];
      try { await groupCall('splits.member.save', { mid: m.id, name: m.name, quotas: q }); redraw(); } catch (e) { fail(e); }
    });
    return h('td', n);
  };
  const sums = tables.map((x) => people.reduce((a, m) => a + (+m.quotas?.[x.id] || 0), 0));
  return h('div.qwrap', h('table.qgrid', h('thead', h('tr', h('th', t('person')), tables.map((x) => h('th', x.name)))),
    h('tbody', people.map((m) => h('tr', h('th', m.name), tables.map((x) => cell(m, x))))),
    h('tfoot', h('tr', h('th', t('total')), sums.map((s) => h('td.qn', h('b', fmtQ(s)), s && Math.abs(s - 1000) > 1e-6 && Math.abs(s - 100) > 1e-6 ? h('small.muted', ' ' + t('not_1000')) : null))))));
}

function memberDialog(m) {
  const d = G(), tables = d.group.tables || [];
  const name = h('sav-input', { label: t('name'), value: m?.name || '', maxlength: 80, autofocus: !m });
  const weight = h('sav-number-input', { label: t('default_share_l'), value: m?.weight ?? 1, min: 0, step: 0.5, help: t('default_share_t'), limits: 'never' });
  const pay = h('sav-input', { label: t('pay_info'), value: m?.pay || '', maxlength: 300, placeholder: t('pay_info_ph'), help: t('pay_info_t') });
  const qs = tables.map((x) => h('sav-number-input', { label: x.name, value: m?.quotas?.[x.id] || '', min: 0, 'data-id': x.id, limits: 'never' }));
  const role = m?.linked && d.role === 'owner' ? select(t('can'), [['editor', t('role_editor_l')], ['viewer', t('role_viewer_l')]], m.role, null) : null;
  const actions = [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => {
    const quotas = {};
    for (const n of qs) { const v = parseFloat(String(n.value).replace(',', '.')); if (Number.isFinite(v) && v > 0) quotas[n.dataset.id] = v; }
    await groupCall('splits.member.save', { mid: m?.id, name: name.value, weight: parseFloat(String(weight.value).replace(',', '.')) || 0, pay: pay.value, quotas, role: role?.value, active: m ? true : undefined });
    redraw();
  } }];
  if (m) actions.unshift({ label: m.active ? t('remove') : t('bring_back'), danger: m.active, run: async () => {
    if (!m.active) { await groupCall('splits.member.save', { mid: m.id, name: m.name, active: true }); redraw(); return; }
    if (!(await confirm(t('remove_person'), t('remove_person_t', { n: m.name }), t('remove')))) return false;
    const r = await groupCall('splits.member.delete', { mid: m.id });
    toast(r.kept ? t('person_kept', { n: m.name }) : t('person_removed', { n: m.name }), 'success');
    redraw();
  } });
  dialog({ title: m ? m.name : t('add_person'), width: '30rem', body: h('div.form', name, weight, tables.length ? h('div.grid2', qs) : null, pay, role), actions });
}

function tablesDialog() {
  const d = G();
  let rows = (d.group.tables || []).map((x) => ({ ...x }));
  const box = h('div.stack');
  const paint = () => put(box, rows.map((x, i) => { const n = h('sav-input', { value: x.name, size: 'sm', maxlength: 60, 'aria-label': t('table_name') }); n.addEventListener('input', () => { x.name = n.value; }); return h('div.prow', n, iconBtn('trash', t('remove'), () => { rows.splice(i, 1); paint(); })); }),
    rows.length < 12 ? btn(t('add_table'), { size: 'sm', icon: 'plus', onclick: () => { rows.push({ name: '' }); paint(); box.querySelector('sav-input:last-of-type')?.focus?.(); } }) : null);
  paint();
  dialog({ title: t('tables'), width: '28rem', body: h('div.form', h('p.muted.small', t('tables_edit_t')), box), actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => {
    await groupCall('splits.group.save', { name: d.group.name, tables: rows.filter((x) => x.name.trim()) });
    redraw();
  } }] });
}

// ------------------------------------------------------------------ what happened

function activityTab() {
  const box = h('div.atab', h('div.wait.small', h('sav-spinner')));
  api('splits.log', undefined, G().src.code ? { code: G().src.code } : { id: G().group.id }).then((r) => {
    if (!r.log.length) return put(box, empty('history', t('no_activity'), ''));
    put(box, h('div.alist', r.log.map((x) => h('div.arow', h('span.aic', icon(ACT_ICONS[x.action] || 'history')), h('div.grow', h('span', actText(x))), h('small.muted', { title: new Date(x.when).toLocaleString(getLang()) }, when(x.when))))));
  }).catch((e) => put(box, empty('circle-alert', t('err_server'), e.code || '')));
  return box;
}
const ACT_ICONS = { 'expense.add': 'plus', 'expense.edit': 'pencil', 'expense.delete': 'trash', 'expense.restore': 'undo', 'member.add': 'user-plus', 'member.edit': 'user', 'member.remove': 'user-x', 'member.join': 'user-check', 'member.leave': 'log-out', 'group.create': 'sparkles', 'group.import': 'file-up', 'group.edit': 'settings', 'group.link': 'link' };
function actText(x) {
  const i = x.info || {}, who = x.who || t('someone');
  const what = i.kind === 'transfer' ? t('a_payback') : `«${i.title || t('k_' + (i.kind || 'expense'))}»`;
  const amt = i.base !== undefined ? ` (${fmt(i.base)})` : '';
  const m = { 'expense.add': 'act_add', 'expense.edit': 'act_edit', 'expense.delete': 'act_delete', 'expense.restore': 'act_restore' }[x.action];
  if (m) return t(m, { who, what: what + amt });
  if (x.action === 'member.add') return t('act_member_add', { who, n: i.name });
  if (x.action === 'member.edit') return i.was ? t('act_member_rename', { who, was: i.was, n: i.name }) : t('act_member_edit', { who, n: i.name });
  if (x.action === 'member.remove') return t('act_member_remove', { who, n: i.name });
  if (x.action === 'member.join') return t('act_member_join', { who, n: i.name });
  if (x.action === 'member.leave') return t('act_member_leave', { who, n: i.name });
  if (x.action === 'group.create') return t('act_create', { who });
  if (x.action === 'group.import') return t('act_import', { who });
  if (x.action === 'group.edit') return t('act_group_edit', { who });
  if (x.action === 'group.link') return t(i.on ? (i.renew ? 'act_link_new' : i.role === 'view' ? 'act_link_view' : 'act_link_edit') : 'act_link_off', { who });
  return x.action;
}

// ------------------------------------------------------------------ the group: menu, settings, link, joining

function groupMenu() {
  const d = G();
  const account = d.via === 'account';
  return drop(h('sav-button', { icon: 'more-vertical', label: t('more'), appearance: 'outline', size: 'sm', square: true }), () => [
    canWrite() && account ? ['settings', t('group_settings'), () => settingsDialog()] : null,
    ['share', t('share'), () => shareDialog()],
    '-',
    ['download', t('save_savspl'), () => import('./files.js').then((m) => m.saveSavspl(G()))],
    ['file-text', t('save_csv'), () => import('./files.js').then((m) => m.saveCsv(G()))],
    ['printer', t('print'), () => print()],
    d.me ? '-' : null,
    d.me ? (d.archived ? ['archive', t('unarchive'), () => archive(false)] : ['archive', t('archive'), () => archive(true)]) : null,
    d.me && d.role !== 'owner' ? ['log-out', t('leave'), () => leaveGroup(), { danger: true }] : null,
    d.role === 'owner' ? ['trash', t('delete_group'), () => deleteGroup(), { danger: true }] : null,
  ], { placement: 'bottom-end', label: t('more') });
}

async function archive(v) {
  await groupCall('splits.group.archive', { archived: v }).catch(fail);
  toast(t(v ? 'archived_done' : 'unarchived_done'), 'success');
  redraw();
}

async function leaveGroup() {
  if (!(await confirm(t('leave'), t('leave_confirm', { n: G().group.name }), t('leave')))) return;
  try { await api('splits.member.leave', { id: G().group.id }); go('#/'); } catch (e) { fail(e); }
}

async function deleteGroup() {
  const g = G().group;
  if (!(await confirm(t('delete_group'), t('delete_group_t', { n: g.name, x: G().expenses.length }), t('delete_forever')))) return;
  try { await api('splits.group.delete', { id: g.id }); toast(t('group_deleted'), 'success'); go('#/'); } catch (e) { fail(e); }
}

function settingsDialog() {
  const d = G(), g = d.group;
  let color = g.color, ic = g.icon || kindOf(g.kind)[1], kind = g.kind;
  const name = h('sav-input', { label: t('group_name'), value: g.name, maxlength: 80 });
  const kindSel = select(t('kind'), KINDS.map(([k]) => [k, t('k_' + k)]), kind, (v) => { kind = v; });
  const icons = h('div.icgrid', { role: 'radiogroup', 'aria-label': t('icon') });
  const paintIcons = () => put(icons, GROUP_ICONS.map((x) => h('sav-button', { icon: x, label: x, square: true, size: 'sm', appearance: x === ic ? 'solid' : 'ghost', variant: x === ic ? 'primary' : 'neutral', role: 'radio', 'aria-checked': String(x === ic), onclick: () => { ic = x; paintIcons(); } })));
  paintIcons();
  const colr = colorPop(t('color'), color, (v) => { color = v || g.color; }, { list: ['#1a7f37', '#b7791f', '#0b7a87', '#1f56d1', '#6a2cf0', '#c2307a', '#c93a2f', '#e0532f', '#0f8a63', '#4a5875', '#7a5c3e'] });
  const locked = d.role !== 'owner' || d.expenses.length > 0;
  const currency = select(t('currency'), curOptions(), g.currency, null, { searchable: true, disabled: locked || null, help: locked ? t(d.role !== 'owner' ? 'currency_owner' : 'currency_locked_t') : t('currency_t') });
  const notes = h('sav-textarea', { label: t('notes'), value: g.notes || '', maxlength: 2000, rows: 3, resize: 'auto', placeholder: t('group_notes_ph') });
  dialog({ title: t('group_settings'), width: '34rem', body: h('div.form', name, h('div.grid2', kindSel, h('div.cf', h('span.flabel', t('color')), colr)), h('div', h('span.flabel', t('icon')), icons), currency, notes),
    actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => {
      await groupCall('splits.group.save', { name: name.value, kind, icon: ic, color, currency: currency.value || g.currency, notes: notes.value });
      redraw();
    } }] });
}

export function shareDialog() {
  const d = G(), g = d.group, can = d.via === 'account' && d.role !== 'viewer';
  const body = h('div.share');
  const paint = () => {
    const g2 = G().group;
    const url = g2.link ? linkUrl(g2.link) : '';
    put(body,
      h('p.muted', t('share_t')),
      can ? h('div.orow.flat', h('div.orow-t', h('b', t('link_on')), h('small', t('link_on_t'))), h('sav-switch', { checked: !!g2.link || null, 'aria-label': t('link_on'), onchange: async (e) => { try { await groupCall('splits.group.link', { on: e.currentTarget.checked }); paint(); redraw(); } catch (x) { fail(x); } } })) : null,
      url ? h('section', h('div.linkrow', h('code', url), btn(t('copy'), { size: 'sm', icon: 'copy', variant: 'primary', appearance: 'solid', onclick: () => copyText(url, t('link_copied')) })),
        navigator.share ? btn(t('send_link_app'), { size: 'sm', icon: 'send', onclick: () => navigator.share({ title: g2.name, text: t('share_text', { n: g2.name }), url }).catch(() => {}) }) : null) : null,
      url && can ? h('div.orow.flat', h('div.orow-t', h('b', t('link_can')), h('small', t(g2.linkRole === 'view' ? 'link_view_t' : 'link_edit_t'))),
        select(null, [['edit', t('link_edit')], ['view', t('link_view')]], g2.linkRole, async (v) => { try { await groupCall('splits.group.link', { role: v }); paint(); } catch (x) { fail(x); } }, { 'aria-label': t('link_can') })) : null,
      url && can ? btn(t('link_renew'), { size: 'sm', icon: 'refresh', appearance: 'ghost', onclick: async () => { if (!(await confirm(t('link_renew'), t('link_renew_t'), t('link_renew'), false))) return; await groupCall('splits.group.link', { renew: true }); paint(); toast(t('link_renewed'), 'success'); } }) : null,
      !url && !can ? h('sav-alert', { variant: 'neutral' }, t(d.src.code ? 'share_guest' : 'share_ask_owner')) : null,
      d.src.code && !can ? h('div.linkrow', h('code', linkUrl(d.src.code)), btn(t('copy'), { size: 'sm', icon: 'copy', onclick: () => copyText(linkUrl(d.src.code), t('link_copied')) })) : null);
  };
  paint();
  dialog({ title: t('share_title', { n: g.name }), width: '32rem', body, actions: [{ label: t('close') }] });
}

/** A guest of the link: which of the people they are (or a new one), kept in this browser. */
export function whoAreYou() {
  const d = G(), code = d.src.code, now = guestAs(code);
  let pick = now;
  const list = h('sav-radio-group', { label: t('who_title'), value: now || '' }, d.members.filter((m) => m.active).map((m) => h('sav-radio', { value: m.id }, m.name)), h('sav-radio', { value: '' }, t('just_looking')));
  list.addEventListener('change', () => { pick = list.value; });
  const name = canWrite() ? h('sav-input', { label: t('not_listed'), placeholder: t('your_name'), maxlength: 80, size: 'sm' }) : null;
  dialog({ title: t('who_title'), width: '26rem', body: h('div.form', h('p.muted', t('who_t')), list, name), actions: [{ label: t('ok'), primary: true, run: async () => {
    if (name && name.value.trim()) { const r = await groupCall('splits.member.save', { name: name.value.trim() }); pick = r.mid; }
    setGuestAs(code, pick);
    redraw();
  } }] });
}

/** An account not yet among the people: one of them that has no account yet, or a new one with its name. */
function claimDialog(free) {
  let pick = free[0]?.id || '';
  const opts = [...free.map((m) => h('sav-radio', { value: m.id }, m.name)), canWrite() ? h('sav-radio', { value: '' }, t('join_new', { n: S.user.name })) : null];
  const list = h('sav-radio-group', { label: t('join_which'), value: pick }, opts);
  list.addEventListener('change', () => { pick = list.value; });
  dialog({ title: t('join_title'), width: '26rem', body: h('div.form', h('p.muted', t('join_dialog_t')), list), actions: [{ label: t('cancel') }, { label: t('join_btn'), primary: true, run: async () => {
    const r = await api('splits.member.claim', { ...(G().src.code ? { code: G().src.code } : { id: G().group.id }), mid: pick || undefined });
    if (G().src.code) setGuestAs(G().src.code, '');
    S.G = { ...r, src: { id: r.group.id } };
    toast(t('joined', { n: r.group.name }), 'success');
    if (location.hash.startsWith('#/j/')) { sc = null; go('#/g/' + r.group.id); } else redraw();
  } }] });
}

export function shortcutsDialog() {
  const rows = [['N', t('add_expense')], ['1 – 5', t('tabs_keys')], ['/', t('search_expenses')], ['?', t('shortcuts')], [K('Mod+J'), t('actions_search')]];
  dialog({ title: t('shortcuts'), width: '26rem', body: h('div.keys', rows.map(([k, l]) => h('div.krow', h('kbd', k), h('span', l)))), actions: [{ label: t('close') }] });
}

