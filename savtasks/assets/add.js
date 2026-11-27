/**
 * "Add" in the head of a list, of the habits or of a Gantt chart (and the last row of the Gantt): a dialog in the middle
 * made for what is on screen, adding to that list — never the generic "New". Kanban boards and matrices have no "Add":
 * each column has its own "Add a card" (board.js); their dialogs here are kept for "New card" from elsewhere:
 *   habits       a habit: its name and its days (every day, the weekdays, the days chosen)
 *   list, table  an item: title, due day, time, priority
 *   board        a card: title, its column, due day, priority
 *   matrix       a task of the Eisenhower matrix: title, its quadrant (the four drawn two by two), due day
 *   gantt        a bar: title, start and end (or a milestone: one day only), priority
 */
import { dialog, h, icon, put, segmented, select, toast } from './ui.js';
import { getLang, t } from './i18n.js';
import { api, keep } from './store.js';
import { prefs } from './account.js';
import { addDays, todayKey, weekday } from './time.js';
import { isMatrix } from './create.js';
import { defaultRemind } from './tasks.js';

const tz = () => prefs().tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const wdName = (i, f) => new Intl.DateTimeFormat(getLang(), { weekday: f, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i)));
const QCOL = { q1: '#c93a2f', q2: '#0b7a87', q3: '#c27a06', q4: '#8a8f9d' };

/** What kind of section a list is, for its "Add". */
export const sectionOf = (l) => (l.view === 'habits' ? 'habits' : isMatrix(l) ? 'matrix' : l.view === 'board' ? 'board' : l.view === 'gantt' ? 'gantt' : 'list');

/** o: {col} — the column of a board or quadrant of a matrix to start with. */
export function addDialog(l, ctx, o = {}) {
  const kind = sectionOf(l), k = todayKey(tz());
  const title = h('sav-input', { label: t(kind === 'habits' ? 'name' : 'title_l'), placeholder: t(kind === 'habits' ? 'habit_ph' : 'title_ph'), maxlength: 255 });
  const fields = [title];
  let priority = 0, col = o.col || l.columns[0]?.id;
  const prio = () => segmented(t('priority'), '0', [['0', '=' + t('p_none'), t('p_none')], ['1', '=' + t('p_low'), t('p_low')], ['2', '=' + t('p_medium'), t('p_medium')], ['3', '=' + t('p_high'), t('p_high')]], (v) => { priority = +v; }, { show: true, class: 'prio' });
  const date = (label, value = '') => h('sav-date-picker', { label, value, clearable: true });
  let due, time, start, milestone, days = 'daily', chosen = [DAYS[weekday(k)]];

  if (kind === 'habits') {
    const box = h('div.stack');
    const paint = () => put(box,
      segmented(t('h_when'), days, [['daily', '=' + t('r_every_day'), t('r_every_day')], ['weekdays', '=' + t('h_weekdays'), t('h_weekdays')], ['days', '=' + t('h_days'), t('h_days')]], (v) => { days = v; paint(); }, { show: true, class: 'wide' }),
      days === 'days' ? h('div.hdays', DAYS.map((d, i) => h('button.hdaybtn' + (chosen.includes(d) ? '.on' : ''), { type: 'button', title: wdName(i, 'long'), 'aria-pressed': String(chosen.includes(d)), onclick: () => { const n = chosen.includes(d) ? chosen.filter((y) => y !== d) : [...chosen, d]; if (n.length) { chosen = n; paint(); } } }, wdName(i, 'narrow')))) : null);
    paint();
    fields.push(box);
  } else if (kind === 'gantt') {
    start = date(t('g_start'), k);
    due = date(t('g_end'), addDays(k, 4));
    milestone = h('sav-switch', { size: 'sm' }, t('g_milestone'));
    milestone.addEventListener('change', () => { start.hidden = milestone.checked; due.setAttribute('label', t(milestone.checked ? 'g_day' : 'g_end')); });
    fields.push(h('div.grid2', start, due), milestone, prio());
  } else if (kind === 'matrix') {
    const grid = h('div.qpick');
    const paint = () => put(grid, l.columns.map((c) => h('button.qbtn' + (c.id === col ? '.on' : ''), { type: 'button', style: `--q:${QCOL[c.id] || 'var(--c)'}`, 'aria-pressed': String(c.id === col), onclick: () => { col = c.id; paint(); } }, h('b', c.name), h('small', t(c.id + '_t')))));
    paint();
    due = date(t('due'));
    fields.push(h('div', h('span.flabel', t('quadrant')), grid), due);
  } else {
    if (kind === 'board') fields.push(select(t('column'), l.columns.filter((c) => !c.done).map((c) => [c.id, c.name]), col, (v) => { col = v; }, { size: 'md' }));
    due = date(t('due'));
    time = h('sav-time-picker', { label: t('time'), step: 5, clearable: true });
    fields.push(h('div.grid2', due, time), prio());
  }

  const run = async () => {
    const v = title.value.trim();
    if (!v) { title.focus(); throw Object.assign(new Error(), { code: kind === 'habits' ? 'name_required' : 'title_required' }); }
    const body = { title: v, list: l.id, end: true, tz: tz(), priority };
    if (kind === 'habits') body.rrule = days === 'daily' ? '' : days === 'weekdays' ? 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' : 'FREQ=WEEKLY;BYDAY=' + DAYS.filter((d) => chosen.includes(d)).join(',');
    if (kind === 'board' || kind === 'matrix') body.col = col;
    if (due?.value) { body.due = due.value; body.time = time?.value || null; body.remind = defaultRemind(body.due, body.time); }
    if (kind === 'gantt') {
      if (!due.value) throw Object.assign(new Error(), { code: 'bad_time' });
      if (!milestone.checked && start.value) body.start = start.value;
    }
    const r = await api('tasks.task.save', body);
    keep(r.task);
    ctx.redraw();
    toast(t(kind === 'habits' ? 'habit_added' : 'added_to', { l: l.name }), 'success');
  };
  const d = dialog({ title: t('add_' + kind + '_t'), width: '34rem', cls: 'adddlg', body: h('div.form', h('p.muted.small.addin', icon(l.icon || 'list-checks'), ' ', l.name), fields),
    actions: [{ label: t('cancel') }, { label: t('add_' + kind + '_b'), icon: 'plus', primary: true, run }] });
  requestAnimationFrame(() => title.focus());
  return d;
}
