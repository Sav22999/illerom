/**
 * The screen of SavTasks: a bar, the side (smart views, then the lists), and the main card with the quick add and the
 * tasks of the view. A list shows as a list (drag to reorder), as a board (board.js) or as a Gantt chart (gantt.js). A task opens on the side
 * (task.js). The screen stays while the address changes view: only the side and the card are drawn again.
 *
 * Smart views: today (late and due today), upcoming (by day), inbox, starred, done (the last 60 days), labels, search,
 * and "From SavSchedules": what SavSchedules asks of the account (polls to decide, places booked), read-only.
 */
import { btn, confirm, dialog, drop, dropBtn, empty, fail, h, icon, iconBtn, mobile, put, segmented, toast, K } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { S, api, inbox, keep, listById, loadAll, taskById } from './store.js';
import { brand, commands, go, prefs, setPrefs, userMenu } from './account.js';
import { addDays, clock, dayLabel, daysBetween, longDay, relDay, todayKey } from './time.js';
import { parseQuick } from './parse.js';
import { openTask, describeRule, listDialog } from './task.js';
import { boardView } from './board.js';
import { ganttView } from './gantt.js';
import { isMatrix, newDialog } from './create.js';
import { tableView } from './table.js';
import { addDialog } from './add.js';
import { habitsView, habitsToday } from './habits.js';

const tz = () => prefs().tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const today = () => todayKey(tz());
const live = (l) => l && !l.archived;
const liveLists = () => S.lists.filter(live);
const liveTasks = () => { const on = new Set(liveLists().map((l) => l.id)); return S.tasks.filter((x) => on.has(x.list)); };
const openOnes = () => liveTasks().filter((x) => !x.done);
const byPos = (a, b) => a.position - b.position || (a.created < b.created ? -1 : 1);
const dueKey = (x) => (x.due || '9999-99-99') + (x.time || '99:99');
const SORTS = { manual: byPos, due: (a, b) => dueKey(a).localeCompare(dueKey(b)) || byPos(a, b), priority: (a, b) => b.priority - a.priority || dueKey(a).localeCompare(dueKey(b)) || byPos(a, b), title: (a, b) => a.title.localeCompare(b.title, getLang()), created: (a, b) => (a.created < b.created ? 1 : -1) };
export const PRIO = ['', 'low', 'medium', 'high'];
export const PRIO_COLOR = ['', '#1f56d1', '#c27a06', '#c93a2f'];

/** The ones of a smart view or a list, with the title of the view: {title, icon, color, tasks, list, groups} */
function viewData(view, arg) {
  const k = today();
  if (view === 'l' || view === 't') {
    const l = listById(arg) || inbox();
    return { title: l.name, icon: l.icon || (l.inbox ? 'inbox' : 'list-checks'), color: l.color, list: l };
  }
  if (view === 'inbox') { const l = inbox(); return { title: l.name, icon: 'inbox', color: l.color, list: l }; }
  if (view === 'today') {
    const all = openOnes().filter((x) => x.due && x.due <= k);
    const late = all.filter((x) => x.due < k).sort(SORTS.due), now = all.filter((x) => x.due === k).sort(SORTS.due);
    const sch = S.schedules.filter((i) => schDay(i) && schDay(i) <= k);
    return { title: t('v_today'), sub: longDay(k), icon: 'sun', color: '#c27a06', groups: [[t('overdue'), late, 'late'], [t('today'), now, 'today']], sch, count: all.length };
  }
  if (view === 'upcoming') {
    const later = openOnes().filter((x) => x.due && x.due > k).sort(SORTS.due);
    const m = new Map();
    const horizon = addDays(k, 14);
    for (const x of later) { const g = x.due <= horizon ? x.due : 'later'; if (!m.has(g)) m.set(g, []); m.get(g).push(x); }
    const groups = [...m.entries()].map(([g, list]) => [g === 'later' ? t('later') : relDay(g, t, tz()) + (daysBetween(k, g) > 1 && daysBetween(k, g) < 7 ? ' · ' + dayLabel(g, { day: 'numeric', month: 'short' }) : ''), list, g === 'later' ? 'later' : 'day', g]);
    // a day without tasks still shows, for the next 7 days: something can be dropped there
    for (let i = 1; i <= 7; i++) { const d = addDays(k, i); if (!m.has(d)) groups.push([relDay(d, t, tz()) + (i > 1 ? ' · ' + dayLabel(d, { day: 'numeric', month: 'short' }) : ''), [], 'day', d]); }
    groups.sort((a, b) => String(a[3] || 'z').localeCompare(String(b[3] || 'z')));
    return { title: t('v_upcoming'), icon: 'calendar-days', color: '#1f56d1', groups, sch: S.schedules.filter((i) => schDay(i) && schDay(i) > k), count: later.length };
  }
  if (view === 'starred') { const list = openOnes().filter((x) => x.starred).sort(SORTS.due); return { title: t('v_starred'), icon: 'star', color: '#c27a06', groups: [[null, list]], count: list.length }; }
  if (view === 'done') {
    const list = liveTasks().filter((x) => x.done).sort((a, b) => (a.done < b.done ? 1 : -1));
    const m = new Map();
    for (const x of list) { const g = new Intl.DateTimeFormat('en-CA', { timeZone: tz() }).format(new Date(x.done)); if (!m.has(g)) m.set(g, []); m.get(g).push(x); }
    return { title: t('v_done'), icon: 'circle-check', color: '#0f8a63', groups: [...m.entries()].map(([g, l]) => [relDay(g, t, tz()), l]), count: list.length, doneView: true };
  }
  if (view === 'schedules') return { title: t('v_schedules'), icon: 'vote', color: '#1f56d1', schedulesView: true, count: S.schedules.length };
  if (view === 'tag') { const list = openOnes().filter((x) => x.tags.includes(arg)).sort(SORTS.due); return { title: '#' + arg, icon: 'tag', color: '#4a5875', groups: [[null, list]], count: list.length, tag: arg }; }
  if (view === 'search') {
    const q = arg.toLowerCase();
    const list = liveTasks().filter((x) => (x.title + ' ' + x.notes + ' ' + x.tags.join(' ') + ' ' + x.checklist.map((c) => c.t).join(' ')).toLowerCase().includes(q)).sort((a, b) => (!!a.done - !!b.done) || SORTS.due(a, b));
    return { title: t('results_for', { q: arg }), icon: 'search', color: '#4a5875', groups: [[null, list]], count: list.length, search: true };
  }
  return viewData('today');
}
const schDay = (i) => i.due || (i.start ? new Intl.DateTimeFormat('en-CA', { timeZone: tz() }).format(new Date(i.start)) : null);

// ------------------------------------------------------------------ the screen

let screen = null;

export async function tasksScreen(root, view, arg) {
  if (!screen || !root.contains(screen.el)) screen = build(root);
  screen.view = view;
  screen.arg = arg;
  if (view === 't') {
    const x = taskById(arg);
    if (!x) { await loadAll().catch(() => {}); }
    const y = taskById(arg);
    if (!y) { toast(t('err_not_found'), 'danger'); go('#/today'); return () => {}; }
    screen.arg = y.list;
    screen.draw();
    openTask(y.id, screen.ctx);
  } else screen.draw();
  // the search of actions (⌘J / Ctrl+J): new, the views of the side, the lists to open
  commands([t('new_l'), [['plus', t('new_l'), () => newTaskDialog(screen)], ['list-plus', t('new_list_dots'), () => newDialog(screen.ctx, { kind: 'list' })], ['file-up', t('open_file'), () => import('./files.js').then((m) => m.openFileDialog())]]],
    [t('views'), [['sun', t('v_today'), '#/today'], ['calendar-days', t('v_upcoming'), '#/upcoming'], ['inbox', inbox()?.name || t('inbox'), '#/inbox'], ['star', t('v_starred'), '#/starred'], ['circle-check', t('v_done'), '#/done'], prefs().schedules !== false ? ['vote', t('v_schedules'), '#/schedules'] : null]],
    [t('my_lists'), S.lists.filter((l) => !l.inbox && !l.archived).map((l) => [l.icon || 'list', l.name, '#/l/' + l.id])]);
  if (S.pendingFile) import('./files.js').then((m) => m.openPending());
  addEventListener('keydown', screen.onKey);
  document.addEventListener('visibilitychange', screen.onVis);
  return () => { removeEventListener('keydown', screen.onKey); document.removeEventListener('visibilitychange', screen.onVis); };
}

function build(root) {
  const side = h('nav.tside', { 'aria-label': t('lists') });
  const main = h('main.tmain');
  const q = h('sav-input', { type: 'search', placeholder: t('search_tasks'), 'aria-label': t('search'), clearable: true, pill: true, size: 'sm' }, icon('search', { slot: 'prefix' }));
  q.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && q.value.trim()) go('#/search/' + encodeURIComponent(q.value.trim())); if (e.key === 'Escape') q.blur(); });
  const drawer = h('sav-drawer.tdrawer', { label: t('lists'), placement: 'start' });
  const menuBtn = iconBtn('menu', t('lists'), () => { put(drawer, sidebar(sc)); drawer.show(); }, { class: 'only-mobile' });
  const nav = h('sav-bottom-nav.tbottom', { label: t('views') });
  const el = h('div.tapp', h('header.ttop', menuBtn, brand(), h('div.spacer'), h('div.tsearch', q), userMenu()), h('div.tbody', side, h('div.twrap', main)), nav, drawer);
  put(root, el);

  const sc = {
    el, view: 'today', arg: '', drawer, q,
    ctx: null,
    draw() {
      put(side, sidebar(sc));
      drawMain(main, sc);
      drawNav(nav, sc);
      document.title = (viewData(sc.view, sc.arg).title || 'SavTasks') + ' – SavTasks';
      reminders.check();
    },
  };
  sc.ctx = { redraw: () => sc.draw(), tz, screen: sc, refresh: async () => { await loadAll(); sc.draw(); } };
  sc.onKey = (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('sav-dialog[open], sav-drawer[open]')) return;
    if (e.composedPath().some((x) => /^(input|textarea|sav-input|sav-textarea|sav-select|sav-search|sav-chip-input|sav-date-picker|sav-time-picker)$/.test(x.localName || ''))) return;
    const map = { n: () => main.querySelector('.qadd')?.focus(), q: () => main.querySelector('.qadd')?.focus(), '/': () => q.focus(), t: () => go('#/today'), u: () => go('#/upcoming'), i: () => go('#/inbox'), s: () => go('#/starred'),
      '?': () => shortcutsDialog() };
    if (map[e.key]) { e.preventDefault(); map[e.key](); }
  };
  let last = Date.now();
  sc.onVis = () => { if (document.visibilityState === 'visible' && Date.now() - last > 30000) { last = Date.now(); sc.ctx.refresh().catch(() => {}); } };
  return sc;
}

// ------------------------------------------------------------------ side

function sidebar(sc) {
  const k = today(), open = openOnes();
  const n = { today: open.filter((x) => x.due && x.due <= k).length, late: open.filter((x) => x.due && x.due < k).length, upcoming: open.filter((x) => x.due && x.due > k && x.due <= addDays(k, 7)).length, starred: open.filter((x) => x.starred).length, inbox: open.filter((x) => x.list === inbox()?.id).length };
  const cur = (v, a = '') => sc.view === v && (!a || sc.arg === a);
  const close = () => sc.drawer.hide?.();
  const link = (v, ic, label, count, o = {}) => h('a.vrow' + (cur(v, o.arg) ? '.on' : ''), { href: '#/' + v + (o.arg ? '/' + o.arg : ''), style: o.color ? `--c:${o.color}` : null, onclick: close, 'aria-current': cur(v, o.arg) ? 'page' : null },
    icon(ic), h('span', label), count ? h('sav-badge', { pill: true, size: 'sm', variant: o.late ? 'danger' : 'neutral', appearance: o.late ? 'solid' : 'soft' }, String(count)) : null);
  const lists = S.lists.filter((l) => !l.inbox && !l.archived), archived = S.lists.filter((l) => l.archived);
  const counts = new Map();
  for (const x of open) counts.set(x.list, (counts.get(x.list) || 0) + 1);
  const lrow = (l) => h('div.lrow' + (cur('l', l.id) ? '.on' : ''), { 'data-id': l.id, style: `--c:${l.color}`, role: 'link', tabindex: 0, onclick: () => { close(); go('#/l/' + l.id); }, onkeydown: (e) => { if (e.key === 'Enter') { close(); go('#/l/' + l.id); } } },
    l.icon ? icon(l.icon, { class: 'licon' }) : h('i.ldot'), h('span', l.name), l.view === 'board' ? icon(isMatrix(l) ? 'grid-2x2' : 'square-kanban', { class: 'lk', label: t(isMatrix(l) ? 'matrix' : 'board') }) : l.view === 'habits' ? icon('flame', { class: 'lk', label: t('habits') }) : l.view === 'table' ? icon('table', { class: 'lk', label: t('as_table') }) : l.view === 'gantt' ? icon('chart-gantt', { class: 'lk', label: t('gantt') }) : null, counts.get(l.id) ? h('small.muted', String(counts.get(l.id))) : null);
  const sortable = h('sav-sortable.lsort', { style: '--gap:1px' }, lists.map(lrow));
  sortable.addEventListener('sav-sort', async (e) => {
    const ids = e.detail.order;
    S.lists.sort((a, b) => (a.inbox ? -1 : b.inbox ? 1 : ids.indexOf(a.id) - ids.indexOf(b.id)));
    await api('tasks.list.order', { ids }).catch(fail);
  });
  const add = drop(h('sav-button', { icon: 'plus', label: t('new_list'), appearance: 'ghost', size: 'sm', square: true }), [
    ['list-plus', t('new_list_dots'), () => { close(); newDialog(sc.ctx, { kind: 'list' }); }],
    '-', ['file-up', t('open_file'), () => { close(); import('./files.js').then((m) => m.openFileDialog()); }]], { placement: 'bottom-end', label: t('new_list') });
  return h('div.side',
    h('div.sbtns', btn(t('new_l'), { icon: 'plus', variant: 'primary', appearance: 'solid', size: 'lg', class: 'newbtn', onclick: () => { close(); newTaskDialog(sc); } })),
    link('today', 'sun', t('v_today'), n.today, { late: n.late > 0, color: '#c27a06' }),
    link('upcoming', 'calendar-days', t('v_upcoming'), n.upcoming, { color: '#1f56d1' }),
    link('inbox', 'inbox', inbox()?.name || t('inbox'), n.inbox, { color: inbox()?.color }),
    link('starred', 'star', t('v_starred'), n.starred, { color: '#c27a06' }),
    link('done', 'circle-check', t('v_done'), 0, { color: '#0f8a63' }),
    prefs().schedules !== false ? link('schedules', 'vote', t('v_schedules'), S.schedules.length, { color: '#1f56d1' }) : null,
    h('div.shead', h('span', t('my_lists')), add),
    lists.length ? sortable : h('p.muted.small.snone', t('no_lists')),
    archived.length ? h('sav-details.sarch', { summary: t('archived_n', { n: archived.length }), appearance: 'plain' }, h('div.stack0', archived.map(lrow))) : null,
    tagCloud(sc),
    h('div.sfoot', h('a.oapp', { href: S.calendarUrl }, h('img', { src: '../savcalendar/icons/favicon.svg', alt: '', width: 20, height: 20 }), 'SavCalendar'), h('a.oapp', { href: S.schedulesUrl }, h('img', { src: '../savschedules/icons/favicon.svg', alt: '', width: 20, height: 20 }), 'SavSchedules')));
}
function tagCloud(sc) {
  const m = new Map();
  for (const x of openOnes()) for (const g of x.tags) m.set(g, (m.get(g) || 0) + 1);
  if (!m.size) return null;
  return [h('div.shead', h('span', t('labels'))), h('div.tags', [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([g, c]) => h('a.tagl' + (sc.view === 'tag' && sc.arg === g ? '.on' : ''), { href: '#/tag/' + encodeURIComponent(g), onclick: () => sc.drawer.hide?.() }, '#' + g, h('small', String(c)))))];
}

/** On phones, the bar at the bottom: today, upcoming, inbox, lists. */
function drawNav(nav, sc) {
  const k = today(), late = openOnes().filter((x) => x.due && x.due <= k).length;
  const it = (v, ic, label, badge) => h('sav-bottom-nav-item', { icon: ic, label, href: v ? '#/' + v : null, value: v || 'lists', current: sc.view === v || null, badge: badge || null });
  put(nav, it('today', 'sun', t('v_today'), late), it('upcoming', 'calendar-days', t('v_upcoming')), it('inbox', 'inbox', t('inbox')), it('', 'list-checks', t('lists')));
  nav.onclick = (e) => { const i = e.target.closest('sav-bottom-nav-item'); if (i && !i.getAttribute('href')) { put(sc.drawer, sidebar(sc)); sc.drawer.show(); } };
}

// ------------------------------------------------------------------ main

function drawMain(main, sc) {
  const d = viewData(sc.view, sc.arg), ctx = sc.ctx;
  ctx.list = d.list || null;
  ctx.view = sc.view;
  const l = d.list;
  const head = h('div.vhead', { style: `--c:${d.color || '#0b7a87'}` },
    h('span.vicon', icon(d.icon || 'list-checks')),
    h('div.vtitle', h('h1', d.title), h('small.muted', d.sub || (l ? t(l.view === 'habits' ? 'n_habits' : 'n_open', { n: liveTasks().filter((x) => x.list === l.id && !x.done).length }) : d.count !== undefined ? t(d.schedulesView ? 'n_items' : 'n_tasks', { n: d.count }) : ''))),
    h('div.spacer'),
    // the type of a list (list, table, kanban, Gantt, matrix, habits) is chosen once in "New" and never changes: no switch
    l && l.view === 'list' && !asTable(l) ? sortMenu(l, sc) : null,
    l && (l.view !== 'board' || asTable(l)) ? addButton(l, sc) : null, // a kanban board and a matrix add from the "Add a card" of each column
    l ? listMenu(l, sc) : null);
  const body = h('div.vbody' + ((l?.view === 'board' || l?.view === 'gantt') && !asTable(l) ? '.isboard' : ''));
  // the quick add only in the smart views: a list has its own "Add" (the button above, the line at its end, the cards)
  const qa = !l && !d.doneView && !d.schedulesView ? quickAdd(sc, d) : null;
  put(main, head, qa, body);
  if (d.schedulesView) return put(body, schedulesView());
  if (l && asTable(l)) return put(body, tableView(l, liveTasks().filter((x) => x.list === l.id), ctx));
  if (l && l.view === 'board') return put(body, boardView(l, liveTasks().filter((x) => x.list === l.id), ctx));
  if (l && l.view === 'gantt') return put(body, ganttView(l, liveTasks().filter((x) => x.list === l.id), ctx));
  if (l && l.view === 'habits') return put(body, habitsView(l, liveTasks().filter((x) => x.list === l.id), ctx));
  if (l) return put(body, listView(l, ctx));
  const groups = (d.groups || []).filter(([, list, kind]) => list.length || kind === 'day' || (kind === 'today' && sc.view === 'today'));
  const schItems = (d.sch || []).length ? h('section.tgroup', h('h2.ghead', icon('vote'), ' ', t('from_sch')), h('div.slist', d.sch.map(schRow))) : null;
  const habits = sc.view === 'today' ? habitsToday(ctx) : null;
  const hasAny = groups.some(([, list]) => list.length) || (d.sch || []).length || habits;
  if (!hasAny && sc.view !== 'upcoming') return put(body, emptyView(sc.view, d));
  put(body, habits, sc.view === 'today' ? null : schItems, groups.map(([title, list, kind, day]) => h('section.tgroup' + (kind === 'late' ? '.late' : ''), { 'data-day': day || null },
    title ? h('h2.ghead', title, list.length ? h('small', String(list.length)) : null, kind === 'late' && list.length ? btn(t('move_today'), { size: 'sm', appearance: 'ghost', icon: 'sun', onclick: () => moveAll(list, today(), ctx) }) : null) : null,
    list.length ? h('div.tlist', list.map((x) => taskRow(x, ctx, { showList: true, noDay: kind === 'day' || kind === 'today' }))) : h('p.gempty', kind === 'day' ? t('nothing_planned') : t('nothing_here')))),
  sc.view === 'today' ? schItems : null);
}

function emptyView(view, d) {
  const map = { today: ['party-popper', 'empty_today', 'empty_today_t'], starred: ['star', 'empty_starred', 'empty_starred_t'], done: ['circle-check', 'empty_done', 'empty_done_t'], tag: ['tag', 'nothing_here', ''], search: ['search', 'nothing_found', ''] };
  const [ic, a, b] = map[view] || ['list-checks', 'nothing_here', ''];
  return empty(ic, t(a), b ? t(b) : '');
}

/** Tasks of a list: the open ones in their order (drag the handle to move them), then the done ones folded. */
function listView(l, ctx) {
  const mine = liveTasks().filter((x) => x.list === l.id), sort = (prefs().sorts || {})[l.id] || 'manual';
  const open = mine.filter((x) => !x.done).sort(SORTS[sort] || byPos), done = mine.filter((x) => x.done).sort((a, b) => (a.done < b.done ? 1 : -1));
  const rows = open.map((x) => taskRow(x, ctx, { drag: sort === 'manual' }));
  let box;
  if (sort === 'manual' && open.length > 1) {
    box = h('sav-sortable.tlist', { handle: '[data-grip]', style: '--gap:0' }, rows);
    box.addEventListener('sav-sort', async (e) => {
      const ids = e.detail.order;
      ids.forEach((id, i) => { const x = taskById(id); if (x) x.position = (i + 1) * 10; });
      await api('tasks.task.order', { list: l.id, ids }).catch(fail);
    });
  } else box = h('div.tlist', rows);
  const showDone = prefs().showDone !== false;
  return [open.length ? box : empty(l.inbox ? 'inbox' : 'list-checks', t(l.inbox ? 'empty_inbox' : 'empty_list'), t('empty_list_t2')),
    done.length && showDone ? h('sav-details.donebox', { summary: t('done_n', { n: done.length }), appearance: 'plain', open: done.length <= 3 || null },
      h('div.tlist', done.map((x) => taskRow(x, ctx))), btn(t('clear_done'), { size: 'sm', appearance: 'ghost', icon: 'trash', onclick: () => clearDone(l, ctx) })) : null];
}

async function clearDone(l, ctx) {
  if (!(await confirm(t('clear_done'), t('clear_done_t'), t('delete')))) return;
  await api('tasks.done.clear', { list: l.id });
  S.tasks = S.tasks.filter((x) => !(x.list === l.id && x.done));
  ctx.redraw();
}

// ------------------------------------------------------------------ one task

/** The meta line of a task: due, repetition, reminder, checklist, labels, list, links. */
export function metaOf(x, o = {}) {
  const k = today(), bits = [];
  if (x.due && !o.noDay) {
    const late = !x.done && (x.due < k || (x.due === k && x.time && x.time < clock(Date.now(), tz())));
    const from = x.start ? dayLabel(x.start, { day: 'numeric', month: 'short' }) + ' → ' : '';
    bits.push(h('span.m.due' + (late ? '.late' : x.due === k ? '.now' : ''), icon(x.start ? 'calendar-range' : 'calendar'), from + relDay(x.due, t, tz()) + (x.time ? ' ' + x.time : '')));
  } else if (x.due && x.time) bits.push(h('span.m.due', icon('clock'), x.time));
  if (x.rrule) bits.push(h('span.m', { title: describeRule(x.rrule) }, icon('repeat')));
  if (x.remind && !x.done && Date.parse(x.remind) > Date.now()) bits.push(h('span.m', { title: t('reminder') + ': ' + whenText(x.remind) }, icon('bell')));
  if (x.checklist.length) { const dn = x.checklist.filter((c) => c.d).length; bits.push(h('span.m' + (dn === x.checklist.length ? '.ok' : ''), icon('list-checks'), `${dn}/${x.checklist.length}`)); }
  if (x.notes) bits.push(h('span.m', { title: t('notes') }, icon('text')));
  if (x.calEvent && S.linked.events[x.calEvent]) bits.push(h('span.m.app', { title: t('in_calendar') }, icon('calendar-check')));
  if (x.schedule) { const s = S.linked.schedules[x.schedule]; bits.push(h('span.m.app' + (s?.final ? '.ok' : ''), { title: s?.final ? t('sch_date_set') : t('sch_waiting') }, icon('vote'), s ? (s.final ? t('date_set') : String(s.answers)) : '')); }
  for (const g of x.tags) bits.push(h('a.m.tag', { href: '#/tag/' + encodeURIComponent(g), onclick: (e) => e.stopPropagation() }, '#' + g));
  if (o.showList) { const l = listById(x.list); if (l) bits.push(h('span.m.lst', { style: `--c:${l.color}` }, h('i'), l.name)); }
  return bits;
}
export const whenText = (iso) => { const d = new Date(iso), k = new Intl.DateTimeFormat('en-CA', { timeZone: tz() }).format(d); return relDay(k, t, tz()) + ' ' + clock(d.getTime(), tz()); };

export function taskRow(x, ctx, o = {}) {
  const cb = h('sav-checkbox.tcheck', { checked: !!x.done || null, 'aria-label': t(x.done ? 'mark_open' : 'mark_done'), style: x.priority ? `--p:${PRIO_COLOR[x.priority]}` : null });
  cb.addEventListener('click', (e) => e.stopPropagation());
  cb.addEventListener('change', () => toggleDone(x, cb.checked, ctx, row));
  // the favourite button of SavComponents, as in the other apps of SavOffice: the star fills at once when it is pressed
  const star = h('sav-favourite-button.tstar' + (x.starred ? '.on' : ''), { icon: 'star', pressed: x.starred || null, label: t(x.starred ? 'unstar' : 'star'), appearance: 'ghost', size: 'sm' });
  star.addEventListener('click', (e) => e.stopPropagation());
  star.addEventListener('keydown', (e) => e.stopPropagation());
  star.addEventListener('change', async (e) => { const v = !!e.detail?.pressed; x.starred = v; star.classList.toggle('on', v); try { keep((await api('tasks.task.save', { id: x.id, starred: v })).task); } catch (err) { x.starred = !v; star.toggleAttribute('pressed', !v); star.classList.toggle('on', !v); fail(err); } setTimeout(() => ctx.redraw(), 300); });
  const meta = metaOf(x, o);
  const row = h('div.trow' + (x.done ? '.done' : '') + (x.priority ? '.p' + x.priority : ''), { 'data-id': x.id, tabindex: 0, role: 'button', 'aria-label': x.title,
    onclick: () => openTask(x.id, ctx), onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) openTask(x.id, ctx); if (e.key === ' ' && e.target === e.currentTarget) { e.preventDefault(); cb.checked = !cb.checked; toggleDone(x, cb.checked, ctx, row); } } },
    o.drag ? h('span.grip', { 'data-grip': '', 'aria-hidden': 'true' }, icon('grip-vertical')) : null,
    cb, h('div.tinfo', h('div.ttitle', x.title || t('no_title')), meta.length ? h('div.tmeta', meta) : null), x.done ? null : star);
  return row;
}

/** Ticks a task (with a short pause, so the tick is seen) and offers to take it back. */
export async function toggleDone(x, done, ctx, row) {
  row?.classList.toggle('done', done);
  row?.classList.add('ticking');
  const prev = x.done;
  x.done = done ? new Date().toISOString() : null;
  try {
    const r = await api('tasks.task.done', { id: x.id, done, tz: tz() });
    keep(r.task); keep(r.next);
    if (done) {
      const a = toast(r.next ? t('done_next', { d: relDay(r.next.due, t, tz()) }) : t('done_one'), 'success', { duration: 5000 });
      a?.append(h('sav-button', { size: 'sm', appearance: 'outline', variant: 'neutral', slot: 'action', style: 'margin-left:.6rem', onclick: async () => { a.remove?.(); await undoDone(x.id, r.next?.id, ctx); } }, t('undo')));
    }
  } catch (e) { x.done = prev; fail(e); }
  setTimeout(() => ctx.redraw(), done ? 450 : 0);
}
async function undoDone(id, nextId, ctx) {
  try {
    keep((await api('tasks.task.done', { id, done: false, tz: tz() })).task);
    if (nextId) { await api('tasks.task.delete', { id: nextId }); S.tasks = S.tasks.filter((y) => y.id !== nextId); }
    ctx.redraw();
  } catch (e) { fail(e); }
}

async function moveAll(list, day, ctx) {
  for (const x of list) keep((await api('tasks.task.save', { id: x.id, due: day, tz: tz() })).task);
  toast(t('moved_today', { n: list.length }), 'success');
  ctx.redraw();
}

// ------------------------------------------------------------------ quick add

/**
 * The box at the top: a task in one line, with what it understands shown under it while typing. In "today" a task gets
 * today, in "starred" the star, in a label the label; in a list it goes into that list (or into the one named with @).
 */
function quickAdd(sc, d) {
  const habit = d.list?.view === 'habits';
  const input = h('sav-input.qadd', { placeholder: t(habit ? (mobile() ? 'qa_habit_short' : 'qa_habit') : mobile() ? 'qa_ph_short' : 'qa_ph'), 'aria-label': t(habit ? 'new_habit' : 'new_task'), maxlength: 255, size: 'md' }, icon('plus', { slot: 'prefix' }));
  const hints = h('div.qhints');
  const parsed = () => parseQuick(input.value, S.lists.filter((l) => !l.archived), tz());
  const show = () => {
    const p = parsed(), bits = [];
    if (!input.value.trim()) return put(hints);
    if (p.due) bits.push(h('sav-tag', { size: 'sm', variant: 'primary', appearance: 'soft' }, icon('calendar', { slot: 'prefix' }), relDay(p.due, t, tz()) + (p.time ? ' ' + p.time : '')));
    if (p.rrule) bits.push(h('sav-tag', { size: 'sm', appearance: 'soft' }, icon('repeat', { slot: 'prefix' }), describeRule(p.rrule)));
    if (p.priority) bits.push(h('sav-tag', { size: 'sm', variant: p.priority === 3 ? 'danger' : p.priority === 2 ? 'warning' : 'primary', appearance: 'soft' }, icon('flag', { slot: 'prefix' }), t('p_' + PRIO[p.priority])));
    for (const g of p.tags) bits.push(h('sav-tag', { size: 'sm', appearance: 'soft' }, '#' + g));
    if (p.list) bits.push(h('sav-tag', { size: 'sm', appearance: 'soft' }, icon('list-checks', { slot: 'prefix' }), listById(p.list)?.name));
    if (p.starred) bits.push(h('sav-tag', { size: 'sm', variant: 'warning', appearance: 'soft' }, icon('star', { slot: 'prefix' }), t('v_starred')));
    put(hints, bits.length ? [h('small.muted', t('qa_understood')), bits] : h('small.muted', t('qa_hint')));
  };
  input.addEventListener('input', show);
  input.addEventListener('focus', show);
  input.addEventListener('keydown', async (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { input.value = ''; show(); input.blur(); return; }
    if (e.key !== 'Enter' || e.isComposing) return;
    const p = parsed();
    if (!p.title) return;
    const body = { title: p.title, tz: tz(), list: p.list || d.list?.id || prefs().defaultList || inbox().id, priority: p.priority, tags: p.tags, starred: p.starred, rrule: p.rrule };
    if (!listById(body.list) || listById(body.list).archived) body.list = inbox().id;
    if (p.due) { body.due = p.due; body.time = p.time; } else if (sc.view === 'today') body.due = today();
    if (sc.view === 'starred') body.starred = true;
    if (d.tag && !body.tags.includes(d.tag)) body.tags.push(d.tag);
    if (listById(body.list)?.view === 'habits') { delete body.due; delete body.time; } // a habit has days, not a due day
    if (body.due) body.remind = defaultRemind(body.due, body.time);
    input.disabled = true;
    try {
      const r = await api('tasks.task.save', body);
      keep(r.task);
      input.value = '';
      show();
      sc.draw();
      sc.el.querySelector('.qadd')?.focus();
      if (body.list !== (d.list?.id || body.list) || (sc.view !== 'l' && sc.view !== 'inbox' && !visibleIn(r.task, sc))) toast(t('added_to', { l: listById(r.task.list)?.name || '' }), 'success');
    } catch (err) { fail(err); } finally { input.disabled = false; }
  });
  return h('div.qbox', input, hints);
}
const visibleIn = (x, sc) => (sc.view === 'today' ? x.due && x.due <= today() : sc.view === 'upcoming' ? x.due > today() : sc.view === 'starred' ? x.starred : sc.view === 'tag' ? x.tags.includes(sc.arg) : true);

/** The reminder a new task with a due day gets by itself (settings → reminders): at its time, or that morning. */
export function defaultRemind(day, time) {
  const p = prefs();
  if (p.autoRemind === false) return null;
  const at = time || p.remindAt || '09:00';
  const ms = zonedMs(day, at) - (time ? (p.remindBefore ?? 0) * 60000 : 0);
  return ms > Date.now() ? new Date(ms).toISOString() : null;
}
/** The moment of a wall clock in the zone of the app. */
export function zonedMs(day, hm) {
  const [y, m, d] = day.split('-').map(Number), [hh, mi] = hm.split(':').map(Number), z = tz();
  const guess = Date.UTC(y, m - 1, d, hh, mi);
  const off = (ms) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: z, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - ms; };
  let ms = guess - off(guess);
  const o2 = off(ms);
  if (guess - o2 !== ms) ms = guess - o2;
  return ms;
}

/** "New task" (the big button): the editor of an empty task, in the list on screen. */
/** "New" (the big button): the dialog in the middle, with what the screen suggests (the list on screen, today…). */
function newTaskDialog(sc) {
  const d = viewData(sc.view, sc.arg);
  newDialog(sc.ctx, { kind: 'task', list: d.list?.id || prefs().defaultList || inbox().id, due: sc.view === 'today' ? today() : undefined, starred: sc.view === 'starred', tags: d.tag ? [d.tag] : [] });
}

// ------------------------------------------------------------------ list tools

/** A table is a type of list of its own (made as such in "New"). */
const asTable = (l) => l.view === 'table';

/** "Add" in the head of a list, habits or Gantt: the dialog made for what is on screen (a habit, a bar, an item), adding to this list (add.js). */
function addButton(l, sc) {
  const habit = l.view === 'habits';
  return btn(h('span.lbl', t('add_s')), { icon: 'plus', size: 'sm', variant: 'primary', appearance: 'soft', class: 'addb', title: t(habit ? 'add_habit' : 'add_item'), onclick: () => addDialog(l, sc.ctx) });
}

function sortMenu(l, sc) {
  const cur = (prefs().sorts || {})[l.id] || 'manual';
  const set = (v) => setPrefs({ sorts: { ...(prefs().sorts || {}), [l.id]: v } }).then(() => sc.draw()).catch(fail);
  return dropBtn('arrow-up-down', t('sort'), [{ head: t('sort') }, ...['manual', 'due', 'priority', 'title', 'created'].map((k) => ['', t('sort_' + k), () => set(k), { check: cur === k }]), '-',
    ['', t('show_done'), () => setPrefs({ showDone: prefs().showDone === false }).then(() => sc.draw()), { check: prefs().showDone !== false }]], { placement: 'bottom-end' });
}

function listMenu(l, sc) {
  const ctx = sc.ctx;
  return drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', size: 'sm', square: true }), () => [
    ['pencil', t('edit_list'), () => listDialog(l, ctx)],
    l.view === 'board' && !isMatrix(l) ? ['columns-3', t('edit_columns'), () => import('./board.js').then((m) => m.columnsDialog(l, ctx))] : null,
    '-', { head: t('files') },
    ['download', t('save_savtas'), () => import('./files.js').then((m) => m.saveSavtas(l.id))],
    ['file-down', t('save_csv'), () => import('./files.js').then((m) => m.saveCsv(l.id))],
    ['text', t('save_md'), () => import('./files.js').then((m) => m.saveMd(l.id))],
    ['list-plus', t('paste_lines'), () => import('./files.js').then((m) => m.pasteDialog(l, ctx))],
    '-',
    !l.inbox ? ['archive', t(l.archived ? 'unarchive' : 'archive'), async () => { Object.assign(l, (await api('tasks.list.save', { id: l.id, archived: !l.archived })).list); toast(t(l.archived ? 'archived' : 'unarchived'), 'success'); go(l.archived ? '#/today' : '#/l/' + l.id); sc.draw(); }] : null,
    !l.inbox ? ['trash', t('delete_list'), () => deleteList(l, ctx), { danger: true }] : null,
  ], { placement: 'bottom-end', label: t('more') });
}

async function deleteList(l, ctx) {
  const n = S.tasks.filter((x) => x.list === l.id).length;
  if (!(await confirm(t('delete_list'), t('delete_list_t', { name: l.name, n }), t('delete')))) return;
  await api('tasks.list.delete', { id: l.id }).catch((e) => { fail(e); throw e; });
  S.lists = S.lists.filter((x) => x.id !== l.id);
  S.tasks = S.tasks.filter((x) => x.list !== l.id);
  go('#/today');
  ctx.redraw();
}

// ------------------------------------------------------------------ SavSchedules

/** What SavSchedules asks of the account: read-only here, it opens there. */
function schRow(i) {
  const k = schDay(i);
  const what = i.why === 'decide' ? t('sch_decide', { n: i.answers }) : i.why === 'booked' ? t('sch_booked', { owner: i.owner || '' }) : t('sch_gfinal', { owner: i.owner || '' });
  const time = i.start ? clock(Date.parse(i.start), tz()) + (i.end ? '–' + clock(Date.parse(i.end), tz()) : '') : '';
  return h('a.srow', { href: i.link, style: `--c:${i.color}` },
    h('span.sic', icon(i.why === 'decide' ? 'vote' : i.why === 'booked' ? 'ticket' : 'calendar-check')),
    h('div', h('b', i.title), h('small.muted', what)),
    h('div.swhen', k ? h('span' + (k < today() ? '.late' : ''), relDay(k, t, tz())) : null, time ? h('small.muted', time) : null, i.why === 'decide' && i.closed ? h('small.muted', t('sch_closed')) : null),
    icon('external-link', { class: 'lk' }));
}
function schedulesView() {
  if (!S.schedules.length) return empty('vote', t('sch_none'), t('sch_none_t'), btn(t('open_schedules'), { icon: 'external-link', href: S.schedulesUrl }));
  const g = (why, title) => { const list = S.schedules.filter((i) => i.why === why); return list.length ? h('section.tgroup', h('h2.ghead', title, h('small', String(list.length))), h('div.slist', list.map(schRow))) : null; };
  return [h('sav-alert.schnote', { variant: 'neutral', appearance: 'soft' }, icon('lock', { slot: 'icon' }), t('sch_note')), g('decide', t('sch_g_decide')), g('booked', t('sch_g_booked')), g('gfinal', t('sch_g_gfinal'))];
}

// ------------------------------------------------------------------ keys and reminders

export function shortcutsDialog() {
  const r = (k, l) => h('div.krow', h('span', l), h('kbd', K(k)));
  dialog({ title: t('shortcuts'), width: '26rem', body: h('div.keys', r('N', t('k_new')), r('/', t('k_search')), r('T', t('v_today')), r('U', t('v_upcoming')), r('I', t('inbox')), r('S', t('v_starred')),  r('?', t('shortcuts')),
    h('p.muted.small', t('k_quick'))), actions: [{ label: t('close'), primary: true }] });
}

/**
 * Reminders while the app is open: a notification of the browser (when allowed) or a message on screen, once for each
 * reminder. The emails leave from the server (cron/savtasks-reminders.php) whether the app is open or not.
 */
const reminders = {
  timer: 0,
  shown: (() => { try { return new Set(JSON.parse(localStorage.getItem('savtasks-shown') || '[]')); } catch { return new Set(); } })(),
  check() {
    if (!this.timer) this.timer = setInterval(() => this.check(), 30000);
    const now = Date.now();
    for (const x of S.tasks) {
      if (x.done || !x.remind) continue;
      const at = Date.parse(x.remind), key = x.id + '@' + x.remind;
      if (at > now || now - at > 15 * 60000 || this.shown.has(key)) continue;
      this.shown.add(key);
      this.fire(x);
    }
    try { localStorage.setItem('savtasks-shown', JSON.stringify([...this.shown].slice(-300))); } catch { /* private mode */ }
  },
  async fire(x) {
    const body = x.due ? relDay(x.due, t, tz()) + (x.time ? ' ' + x.time : '') : t('reminder');
    if ('Notification' in window && Notification.permission === 'granted' && prefs().notify !== false) {
      try {
        const reg = await navigator.serviceWorker?.getRegistration?.();
        if (reg) return reg.showNotification(x.title || 'SavTasks', { body, icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', tag: 'task-' + x.id, data: { url: '#/t/' + x.id } });
        const n = new Notification(x.title || 'SavTasks', { body, icon: 'icons/icon-192.png', tag: 'task-' + x.id });
        n.onclick = () => { focus(); go('#/t/' + x.id); };
        return;
      } catch { /* falls back to a message */ }
    }
    const a = toast(`${x.title} · ${body}`, 'primary', { duration: 0, icon: 'bell', heading: t('reminder') });
    a?.append(h('sav-button', { size: 'sm', appearance: 'outline', variant: 'neutral', style: 'margin-left:.6rem', onclick: () => { a.remove?.(); go('#/t/' + x.id); } }, t('open')));
  },
};
export { when };
