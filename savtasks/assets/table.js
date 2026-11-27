/**
 * A list as a table: one row per task, the columns of what a task has (status — the column of its board —, start, due day,
 * priority, labels, progress of its checklist, created). A press on a heading sorts by it (again: the other way round);
 * status, due day and priority change from the cell itself, with a small menu; the title opens the task. The columns
 * shown are chosen from the menu of the table (kept in the settings). On phones the table scrolls sideways and the
 * column of the titles stays.
 */
import { drop, fail, h, icon, put } from './ui.js';
import { getLang, t } from './i18n.js';
import { api, keep, listById } from './store.js';
import { prefs, setPrefs } from './account.js';
import { addDays, dayLabel, relDay, todayKey, weekday } from './time.js';
import { openTask } from './task.js';
import { PRIO, PRIO_COLOR, toggleDone } from './tasks.js';

const tz = () => prefs().tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const COLS = ['status', 'start', 'due', 'priority', 'tags', 'progress', 'created'];
const HIDDEN = ['start', 'created']; // hidden at first
const progress = (x) => (x.checklist.length ? x.checklist.filter((c) => c.d).length / x.checklist.length : x.done ? 1 : 0);

export function tableView(l, tasks, ctx) {
  const p = prefs(), hide = new Set(p.tableHide || HIDDEN), shown = COLS.filter((c) => !hide.has(c));
  const sort = p.tableSort?.k ? p.tableSort : { k: 'due', dir: 1 };
  const colIndex = (x) => l.columns.findIndex((c) => c.id === x.col);
  const key = {
    title: (x) => x.title.toLocaleLowerCase(getLang()), status: colIndex, start: (x) => x.start || '9999', due: (x) => (x.due || '9999') + (x.time || ''),
    priority: (x) => -x.priority, tags: (x) => x.tags.join(' ') || '~', progress: (x) => -progress(x), created: (x) => x.created,
  }[sort.k] || ((x) => x.position);
  const cmp = (a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : a.position - b.position) * sort.dir; };
  const showDone = p.showDone !== false;
  const rows = [...tasks.filter((x) => !x.done).sort(cmp), ...(showDone ? tasks.filter((x) => x.done).sort(cmp) : [])];

  const setSort = (k) => setPrefs({ tableSort: { k, dir: sort.k === k ? -sort.dir : 1 } }).then(() => ctx.redraw()).catch(fail);
  const th = (k) => h('th', { class: 'tc-' + k, 'aria-sort': sort.k === k ? (sort.dir > 0 ? 'ascending' : 'descending') : null },
    h('button.tsort', { type: 'button', onclick: () => setSort(k) }, t('tc_' + k), sort.k === k ? icon(sort.dir > 0 ? 'chevron-up' : 'chevron-down') : null));
  const colsMenu = drop(h('sav-button', { icon: 'columns-3', label: t('tc_cols'), appearance: 'ghost', size: 'sm', square: true }), () => [{ head: t('tc_cols') },
    ...COLS.map((c) => ['', t('tc_' + c), () => { const s = new Set(prefs().tableHide || HIDDEN); s.has(c) ? s.delete(c) : s.add(c); setPrefs({ tableHide: [...s] }).then(() => ctx.redraw()).catch(fail); }, { check: !hide.has(c) }])], { placement: 'bottom-end', label: t('tc_cols') });

  const table = h('table.ttable', h('thead', h('tr', th('title'), shown.map(th), h('th.tc-menu', colsMenu))),
    h('tbody', rows.map((x) => row(x, l, ctx, shown))));
  return h('div.twrapt', { style: `--c:${l.color}` }, rows.length ? table : h('div.gempty', h('sav-empty-state', { icon: 'table', heading: t('empty_list'), text: t('empty_list_t') })));
}

/** A cell that changes with a small menu: the button shows the value, the menu the choices. */
const menuCell = (content, label, items) => drop(h('button.tcell', { type: 'button', title: label }, content, icon('chevron-down', { class: 'tcaret' })), items, { placement: 'bottom-start', label });

async function save(x, fields, ctx) {
  try { keep((await api('tasks.task.save', { id: x.id, tz: tz(), ...fields })).task); } catch (e) { fail(e); }
  ctx.redraw();
}

function row(x, l, ctx, shown) {
  const k = todayKey(tz());
  const cb = h('sav-checkbox.tcheck', { checked: !!x.done || null, 'aria-label': t(x.done ? 'mark_open' : 'mark_done'), style: x.priority ? `--p:${PRIO_COLOR[x.priority]}` : null });
  cb.addEventListener('change', () => toggleDone(x, cb.checked, ctx));
  const cells = {
    status: () => {
      const c = l.columns.find((y) => y.id === x.col) || l.columns[0];
      return menuCell(h('span.tstat' + (c.done ? '.ok' : ''), c.name), t('tc_status'), () => l.columns.map((y) => ['', y.name, async () => {
        try { const r = await api('tasks.task.move', { id: x.id, col: y.id, tz: tz() }); keep(r.task); keep(r.next); } catch (e) { fail(e); }
        ctx.redraw();
      }, { check: y.id === x.col }]));
    },
    start: () => (x.start ? h('span', dayLabel(x.start, { day: 'numeric', month: 'short' })) : h('span.muted', '—')),
    due: () => {
      const late = !x.done && x.due && x.due < k;
      const text = x.due ? relDay(x.due, t, tz()) + (x.time ? ' ' + x.time : '') : '—';
      const nextMon = addDays(k, 7 - weekday(k));
      return menuCell(h('span' + (late ? '.late' : x.due === k ? '.now' : x.due ? '' : '.muted'), text), t('tc_due'), () => [
        ['sun', t('today'), () => save(x, { due: k }, ctx)], ['calendar', t('tomorrow'), () => save(x, { due: addDays(k, 1) }, ctx)],
        ['calendar-days', t('next_week'), () => save(x, { due: nextMon }, ctx)], x.due ? ['x', t('no_date'), () => save(x, { due: null }, ctx)] : null,
        '-', ['pencil', t('other_date'), () => openTask(x.id, ctx)]]);
    },
    priority: () => menuCell(x.priority ? h('span.tprio', { style: `--p:${PRIO_COLOR[x.priority]}` }, h('i'), t('p_' + PRIO[x.priority])) : h('span.muted', '—'), t('tc_priority'),
      () => [0, 3, 2, 1].map((n) => ['', t(n ? 'p_' + PRIO[n] : 'p_none'), () => save(x, { priority: n }, ctx), { check: x.priority === n }])),
    tags: () => (x.tags.length ? h('span.ttags', x.tags.map((g) => h('a.m.tag', { href: '#/tag/' + encodeURIComponent(g) }, '#' + g))) : h('span.muted', '—')),
    progress: () => {
      if (!x.checklist.length) return h('span.muted', '—');
      const n = x.checklist.filter((c) => c.d).length;
      return h('span.tprog', h('sav-progress-bar', { value: Math.round((n / x.checklist.length) * 100), size: 'sm', 'aria-label': `${n}/${x.checklist.length}` }), h('small', `${n}/${x.checklist.length}`));
    },
    created: () => h('span.muted', new Date(x.created).toLocaleDateString(getLang(), { day: 'numeric', month: 'short' })),
  };
  return h('tr' + (x.done ? '.done' : ''), { 'data-id': x.id },
    h('td.tc-title', h('div.ttl', cb, h('button.tname', { type: 'button', onclick: () => openTask(x.id, ctx), title: x.title }, x.title || t('no_title')), x.starred ? icon('star', { class: 'tstarred' }) : null, x.rrule ? icon('repeat', { class: 'lk' }) : null)),
    shown.map((c) => h('td', { class: 'tc-' + c }, cells[c]())), h('td.tc-menu'));
}
export { listById, put };
