/**
 * One task, on the side: everything about it, saved as it changes (a new one is saved with its button). And the
 * actions that join it to the other apps of the same account:
 *   "Add to SavCalendar"         an event in one of one's own calendars (tasks.cal.create); the task shows it after
 *   "Find a date with others"    a date poll in SavSchedules with the dates chosen here (tasks.sch.create), opened in its
 *                                editor; once a date is chosen there, the task shows it and can take it as its due day
 * Also the dialog of a list (name, colour, icon, list or board).
 */
import { btn, colorPop, confirm, dialog, empty, fail, h, icon, iconBtn, mobile, primary, put, segmented, select, toast } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { S, api, drop as forget, inbox, keep, listById, taskById } from './store.js';
import { go, prefs } from './account.js';
import { addDays, dayLabel, longDay, relDay, todayKey, weekday } from './time.js';
import { PRIO, PRIO_COLOR, defaultRemind, toggleDone, whenText, zonedMs } from './tasks.js';

const tz = () => prefs().tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const today = () => todayKey(tz());
const pad = (n) => String(n).padStart(2, '0');
const stop = (n) => { n.addEventListener('keydown', (e) => e.stopPropagation()); return n; };
export const LIST_COLORS = ['#0b7a87', '#1f56d1', '#6a2cf0', '#c2307a', '#c93a2f', '#e0532f', '#c27a06', '#0f8a63', '#4a5875', '#7a5c3e'];
export const LIST_ICONS = ['', 'list-checks', 'square-kanban', 'briefcase', 'house', 'shopping-cart', 'book-open', 'heart', 'plane', 'graduation-cap', 'dumbbell', 'lightbulb', 'users', 'star', 'flag', 'inbox'];

// ------------------------------------------------------------------ repetitions

const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const wdName = (i, f = 'short') => new Intl.DateTimeFormat(getLang(), { weekday: f, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i)));
/** "Every day", "Every 2 weeks on Mon, Thu", "Every month"… */
export function describeRule(r) {
  if (!r) return '';
  const f = /FREQ=(\w+)/.exec(r)?.[1], n = +(/INTERVAL=(\d+)/.exec(r)?.[1] || 1), by = /BYDAY=([A-Z,]+)/.exec(r)?.[1];
  if (f === 'WEEKLY' && by === 'MO,TU,WE,TH,FR' && n === 1) return t('r_weekdays');
  const unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[f];
  if (!unit) return t('repeats');
  let s = n === 1 ? t('r_every_' + unit) : t('r_every_n_' + unit, { n });
  if (f === 'WEEKLY' && by) s += ' ' + t('r_on', { d: by.split(',').map((d) => wdName(DAYS.indexOf(d))).join(', ') });
  return s;
}
const RULES = () => [['', t('r_none')], ['FREQ=DAILY', t('r_every_day')], ['FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', t('r_weekdays')], ['FREQ=WEEKLY', t('r_every_week')], ['FREQ=WEEKLY;INTERVAL=2', t('r_every_n_week', { n: 2 })], ['FREQ=MONTHLY', t('r_every_month')], ['FREQ=YEARLY', t('r_every_year')]];

// ------------------------------------------------------------------ reminders

/** The kinds of reminder offered for a due day (and time): [value, label, moment in ms]. */
function remindChoices(due, time) {
  if (!due) return [['none', t('rm_none')]];
  const at = prefs().remindAt || '09:00';
  if (time) {
    const base = zonedMs(due, time);
    return [['none', t('rm_none')], ['0', t('rm_at_time'), base], ['10', t('rm_before', { n: 10 }), base - 600e3], ['30', t('rm_before', { n: 30 }), base - 1800e3], ['60', t('rm_before_h', { n: 1 }), base - 3600e3], ['1440', t('rm_day_before'), base - 864e5], ['custom', t('rm_custom')]];
  }
  return [['none', t('rm_none')], ['morning', t('rm_morning', { t: at }), zonedMs(due, at)], ['eve', t('rm_eve', { t: at }), zonedMs(addDays(due, -1), at)], ['custom', t('rm_custom')]];
}
const kindOf = (x) => { if (!x.remind) return 'none'; const ms = Date.parse(x.remind), c = remindChoices(x.due, x.time).find((r) => r[2] !== undefined && Math.abs(r[2] - ms) < 60000); return c ? c[0] : 'custom'; };

// ------------------------------------------------------------------ the editor

let open = null; // the drawer on screen

/**
 * The editor of a task (id) or of a new one (null, with init: {list, due, starred, tags}). An existing task is saved at
 * every change; a new one when "Add" is pressed.
 */
export function openTask(id, ctx, init = {}) {
  open?.hide?.();
  const real = id ? taskById(id) : null;
  if (id && !real) return toast(t('err_not_found'), 'danger');
  const isNew = !real;
  const x = real ? { ...real, checklist: real.checklist.map((c) => ({ ...c })), tags: [...real.tags] } : { title: '', notes: '', checklist: [], tags: init.tags || [], priority: 0, starred: !!init.starred, due: init.due || null, time: null, rrule: '', remind: null, list: init.list || inbox().id, col: null };
  if (isNew && x.due) x.remind = defaultRemind(x.due, null);
  let remindKind = kindOf(x);
  const drawer = h('sav-drawer.tdet', { label: t(isNew ? 'new_task' : 'task'), placement: mobile() ? 'bottom' : 'end' });
  open = drawer;

  /** Saves some fields of an existing task (and keeps the copy of the app); a new one only remembers them. */
  const save = async (fields) => {
    Object.assign(x, fields);
    if (isNew) return;
    try { const r = await api('tasks.task.save', { id: x.id, tz: tz(), ...fields }); keep(r.task); Object.assign(x, r.task); ctx.redraw(); paintLinks(); } catch (e) { fail(e); }
  };

  // title and tick
  const title = stop(h('sav-textarea.dtitle', { value: x.title, placeholder: t('title_ph'), rows: 1, resize: 'auto', maxlength: 255, 'aria-label': t('title_l'), autofocus: isNew || null }));
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (isNew) addBtn.click(); else title.blur(); } });
  title.addEventListener('change', () => { const v = String(title.value).replace(/\s+/g, ' ').trim(); if (!v && !isNew) { title.value = x.title; return; } if (v !== x.title) save({ title: v }); });
  const tick = isNew ? null : h('sav-checkbox.tcheck.big', { checked: !!x.done || null, 'aria-label': t('mark_done'), style: x.priority ? `--p:${PRIO_COLOR[x.priority]}` : null });
  tick?.addEventListener('change', async () => { await toggleDone(taskById(x.id), tick.checked, ctx); Object.assign(x, taskById(x.id)); });

  // list and column
  const lists = S.lists.filter((l) => !l.archived || l.id === x.list);
  const colBox = h('div.dcol');
  const drawCols = () => {
    const l = listById(x.list);
    if (!l || l.view !== 'board') return put(colBox);
    put(colBox, select(t('column'), l.columns.map((c) => [c.id, c.name]), x.col || l.columns[0].id, async (v) => {
      if (isNew) { x.col = v; return; }
      try { const r = await api('tasks.task.move', { id: x.id, col: v, tz: tz() }); keep(r.task); keep(r.next); Object.assign(x, r.task); ctx.redraw(); } catch (e) { fail(e); }
    }));
  };
  const listSel = select(t('list'), lists.map((l) => [l.id, l.name]), x.list, async (v) => {
    if (isNew) { x.list = v; x.col = null; drawCols(); return; }
    try { const r = await api('tasks.task.move', { id: x.id, list: v, tz: tz() }); keep(r.task); Object.assign(x, r.task); drawCols(); ctx.redraw(); toast(t('moved_to', { l: listById(v)?.name }), 'success'); } catch (e) { fail(e); }
  });
  drawCols();

  // due day, time, repetition, reminder
  const datePick = stop(h('sav-date-picker', { label: t('due'), value: x.due || '', size: 'sm', clearable: true }));
  const timePick = stop(h('sav-time-picker', { label: t('time'), value: x.time || '', size: 'sm', step: 5, clearable: true }));
  const quick = h('div.dquick');
  const ruleBox = h('div'), remindBox = h('div.dremind');
  const setDue = (due, time = x.time) => {
    if (!due) time = null;
    const f = { due: due || null, time: time || null };
    // a reminder of a kind that follows the due day moves with it
    const next = { ...x, ...f };
    const c = remindChoices(next.due, next.time).find((r) => r[0] === remindKind);
    if (!next.due) { f.remind = null; remindKind = 'none'; } else if (c && c[2] !== undefined) f.remind = c[2] > Date.now() ? new Date(c[2]).toISOString() : null;
    else if (remindKind === 'none' && !x.due && isNew) { f.remind = defaultRemind(next.due, next.time); remindKind = kindOf({ ...next, remind: f.remind }); }
    if (!next.due) f.rrule = '';
    datePick.value = f.due || '';
    timePick.value = f.time || '';
    save(f);
    paintDue();
  };
  datePick.addEventListener('change', () => setDue(datePick.value || null));
  timePick.addEventListener('change', () => { if (!x.due && timePick.value) return setDue(today(), timePick.value); setDue(x.due, timePick.value || null); });
  const paintDue = () => {
    const k = today(), nextMon = addDays(k, 7 - weekday(k));
    put(quick, [['sun', t('today'), k], ['sunrise', t('tomorrow'), addDays(k, 1)], ['calendar-days', t('next_week'), nextMon]].map(([ic, l, d]) => h('sav-chip', { size: 'sm', selected: x.due === d || null, onclick: () => setDue(d) }, l)),
      x.due ? h('sav-chip', { size: 'sm', onclick: () => setDue(null) }, icon('x', { slot: 'prefix' }), t('no_date')) : null);
    put(ruleBox, x.due ? select(t('repeat'), [...RULES(), ...(x.rrule && !RULES().some(([v]) => v === x.rrule) ? [[x.rrule, describeRule(x.rrule)]] : [])], x.rrule || '', (v) => save({ rrule: v })) : null);
    paintRemind();
  };
  const paintRemind = () => {
    if (!x.due) return put(remindBox, h('small.muted', icon('bell'), ' ', t('rm_needs_due')));
    const choices = remindChoices(x.due, x.time);
    if (!choices.some((c) => c[0] === remindKind)) remindKind = x.remind ? 'custom' : 'none';
    const sel = select(t('reminder'), choices.map(([v, l]) => [v, l]), remindKind, (v) => {
      remindKind = v;
      if (v === 'custom') { const ms = x.remind ? Date.parse(x.remind) : zonedMs(x.due, x.time || prefs().remindAt || '09:00'); return save({ remind: new Date(ms).toISOString() }).then(paintRemind); }
      const c = choices.find((r) => r[0] === v);
      const ms = c?.[2];
      if (ms !== undefined && ms <= Date.now()) toast(t('rm_past'), 'warning');
      save({ remind: ms !== undefined && ms > Date.now() ? new Date(ms).toISOString() : null }).then(paintRemind);
    });
    let custom = null;
    if (remindKind === 'custom' && x.remind) {
      const d = new Date(x.remind), k = new Intl.DateTimeFormat('en-CA', { timeZone: tz() }).format(d), hm = new Intl.DateTimeFormat('en-GB', { timeZone: tz(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
      const dp = stop(h('sav-date-picker', { label: t('rm_day'), value: k, size: 'sm' })), tp = stop(h('sav-time-picker', { label: t('time'), value: hm, size: 'sm', step: 5 }));
      const upd = () => { if (!dp.value || !tp.value) return; const ms = zonedMs(dp.value, tp.value); if (ms <= Date.now()) toast(t('rm_past'), 'warning'); save({ remind: new Date(ms).toISOString() }); };
      dp.addEventListener('change', upd); tp.addEventListener('change', upd);
      custom = h('div.grid2', dp, tp);
    }
    const sent = x.reminded && x.remind ? h('small.muted', icon('mail'), ' ', t('rm_sent', { w: when(x.reminded) })) : x.remind ? h('small.muted', icon('bell'), ' ', whenText(x.remind), prefs().mailReminders !== false ? ' · ' + t('rm_by_mail') : '') : null;
    put(remindBox, sel, custom, sent);
  };

  // priority and star
  const prio = segmented(t('priority'), String(x.priority), [['0', '=' + t('p_none'), t('p_none')], ['1', '=' + t('p_low'), t('p_low')], ['2', '=' + t('p_medium'), t('p_medium')], ['3', '=' + t('p_high'), t('p_high')]], (v) => { save({ priority: +v }); tick?.style.setProperty('--p', PRIO_COLOR[+v] || ''); }, { show: true, class: 'prio' });
  const star = h('sav-switch', { checked: x.starred || null, size: 'sm' }, t('v_starred'));
  star.addEventListener('change', () => save({ starred: star.checked }));

  // labels
  const known = [...new Set(S.tasks.flatMap((y) => y.tags))].sort();
  const tags = stop(h('sav-chip-input', { label: t('labels'), multiple: true, size: 'sm', placeholder: t('labels_ph'), value: x.tags.join(','), 'max-terms': 12 }, known.map((g) => h('option', { value: g }, g))));
  tags.addEventListener('change', () => { const v = (Array.isArray(tags.value) ? tags.value : String(tags.value || '').split(',')).map((g) => g.replace(/^#/, '').trim().toLowerCase()).filter(Boolean); save({ tags: [...new Set(v)] }); });

  // checklist
  const clBox = h('div.cl');
  const paintCl = () => {
    const rows = x.checklist.map((c, i) => {
      const cb = h('sav-checkbox', { checked: c.d || null, 'aria-label': c.t });
      cb.addEventListener('change', () => { x.checklist[i].d = cb.checked; save({ checklist: x.checklist }); row.classList.toggle('done', cb.checked); });
      const inp = stop(h('input.clt', { value: c.t, maxlength: 200, 'aria-label': t('subtask') }));
      inp.addEventListener('change', () => { const v = inp.value.trim(); if (!v) { x.checklist.splice(i, 1); save({ checklist: x.checklist }); paintCl(); return; } x.checklist[i].t = v; save({ checklist: x.checklist }); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCl.focus(); } });
      const row = h('div.clrow' + (c.d ? '.done' : ''), cb, inp, iconBtn('x', t('remove'), () => { x.checklist.splice(i, 1); save({ checklist: x.checklist }); paintCl(); }));
      return row;
    });
    const n = x.checklist.filter((c) => c.d).length;
    put(clBox, x.checklist.length ? h('sav-progress-bar', { value: Math.round((n / x.checklist.length) * 100), size: 'sm', 'aria-label': `${n}/${x.checklist.length}` }) : null, rows);
  };
  const addCl = stop(h('input.cladd', { placeholder: t('add_subtask'), maxlength: 200, 'aria-label': t('add_subtask') }));
  addCl.addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; e.preventDefault(); const v = addCl.value.trim(); if (!v) return; x.checklist.push({ t: v, d: false }); addCl.value = ''; save({ checklist: x.checklist }); paintCl(); addCl.focus(); });

  // notes
  const notes = stop(h('sav-textarea', { label: t('notes'), value: x.notes, rows: 4, resize: 'auto', maxlength: 10000, placeholder: t('notes_ph') }));
  notes.addEventListener('change', () => { if (notes.value !== x.notes) save({ notes: notes.value }); });

  // the other apps
  const links = h('div.dlinks');
  const paintLinks = () => {
    if (isNew) return put(links);
    const ev = x.calEvent ? S.linked.events[x.calEvent] : null, sch = x.schedule ? S.linked.schedules[x.schedule] : null;
    const evText = ev ? (ev.allDay ? longDay(ev.start) : whenText(ev.start)) + ' · ' + ev.calendar : '';
    const card = (img, name, text, ...actions) => h('div.app-card', h('img', { src: img, alt: '', width: 28, height: 28 }), h('div', h('b', name), h('small.muted', text)), h('div.prow.wrap', actions));
    put(links, h('sav-label', { appearance: 'plain', case: 'normal', variant: 'neutral' }, t('with_office')),
      card('../savcalendar/icons/favicon.svg', 'SavCalendar', ev ? t('cal_linked', { w: evText }) : t('cal_none'),
        ev ? btn(t('open'), { size: 'sm', icon: 'external-link', href: S.calendarUrl + '#/day/' + (ev.allDay ? ev.start : new Intl.DateTimeFormat('en-CA', { timeZone: tz() }).format(new Date(ev.start))) }) : null,
        btn(t(ev ? 'cal_again' : 'cal_add'), { size: 'sm', icon: 'calendar-plus', appearance: ev ? 'ghost' : 'outline', onclick: () => calendarDialog(x, ctx, paintLinks) })),
      card('../savschedules/icons/favicon.svg', 'SavSchedules', sch ? (sch.final ? t('sch_final', { w: sch.finalAllDay ? longDay(sch.final) : whenText(sch.final) }) : t('sch_open', { n: sch.answers })) : t('sch_none_task'),
        sch ? btn(t('open'), { size: 'sm', icon: 'external-link', href: sch.link }) : null,
        sch?.final ? btn(t('use_date'), { size: 'sm', icon: 'calendar-check', onclick: () => { const k = sch.finalAllDay ? sch.final : new Intl.DateTimeFormat('en-CA', { timeZone: tz() }).format(new Date(sch.final)); const hm = sch.finalAllDay ? null : new Intl.DateTimeFormat('en-GB', { timeZone: tz(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(sch.final)); setDue(k, hm); toast(t('date_taken'), 'success'); } }) : null,
        !sch ? btn(t('find_date'), { size: 'sm', icon: 'vote', onclick: () => scheduleDialog(x, ctx, paintLinks) }) : null));
  };

  // footer
  const addBtn = primary(t('add'), { slot: 'footer', icon: 'plus', onclick: async () => {
    const v = String(title.value).replace(/\s+/g, ' ').trim();
    if (!v) { title.focus(); throw Object.assign(new Error(), { code: 'title_required' }); }
    const r = await api('tasks.task.save', { title: v, notes: notes.value, list: x.list, col: x.col || undefined, due: x.due, time: x.time, rrule: x.rrule, remind: x.remind, priority: x.priority, starred: x.starred, tags: x.tags, checklist: x.checklist, tz: tz() });
    keep(r.task);
    drawer.hide();
    ctx.redraw();
    toast(t('added_to', { l: listById(r.task.list)?.name || '' }), 'success');
  } });
  const foot = isNew ? [btn(t('cancel'), { slot: 'footer', onclick: () => drawer.hide() }), addBtn] : [
    btn(t('delete'), { slot: 'footer', icon: 'trash', variant: 'danger', appearance: 'ghost', onclick: async () => { if (!(await confirm(t('delete_task'), t('delete_task_t', { t: x.title }), t('delete')))) return; await api('tasks.task.delete', { id: x.id }); forget(x.id); drawer.hide(); ctx.redraw(); toast(t('deleted'), 'success'); } }),
    btn(t('duplicate'), { slot: 'footer', icon: 'copy', appearance: 'ghost', onclick: async () => { const r = await api('tasks.task.save', { title: x.title, notes: x.notes, list: x.list, due: x.due, time: x.time, rrule: x.rrule, priority: x.priority, starred: x.starred, tags: x.tags, checklist: x.checklist.map((c) => ({ t: c.t, d: false })), tz: tz() }); keep(r.task); ctx.redraw(); openTask(r.task.id, ctx); } }),
    primary(t('done'), { slot: 'footer', onclick: () => drawer.hide() })];

  const sec = (label, ...kids) => h('section.dsec', label ? h('sav-label', { appearance: 'plain', case: 'normal', variant: 'neutral' }, label) : null, kids);
  drawer.append(h('div.dbody',
    h('div.dhead', tick, title),
    h('div.grid2', listSel, colBox),
    sec(t('when'), quick, h('div.grid2', datePick, timePick), ruleBox, remindBox),
    sec(null, prio, star),
    sec(null, tags),
    sec(t('subtasks'), clBox, addCl),
    sec(null, notes),
    links,
    isNew ? null : h('small.muted.dinfo', t('created_w', { w: when(x.created) }) + (x.updated !== x.created ? ' · ' + t('updated_w', { w: when(x.updated) }) : ''))), ...foot);
  paintDue(); paintCl(); paintLinks();
  document.body.append(drawer);
  drawer.addEventListener('sav-after-hide', (e) => {
    if (e.target !== drawer) return;
    drawer.remove();
    if (open === drawer) open = null;
    if (/^#\/t\//.test(location.hash) && !isNew) history.replaceState(null, '', '#/l/' + x.list);
  });
  customElements.whenDefined('sav-drawer').then(() => drawer.show());
  return drawer;
}

// ------------------------------------------------------------------ SavCalendar

/** The task as an event of SavCalendar: which calendar, which day and time, how long. */
async function calendarDialog(x, ctx, after) {
  const r = await api('tasks.calendars', undefined, { tz: tz() }).catch((e) => { fail(e); return null; });
  if (!r) return;
  const cal = select(t('calendar'), r.calendars.map((c) => [c.id, c.name]), r.default && r.calendars.some((c) => c.id === r.default) ? r.default : r.calendars[0]?.id);
  const day = stop(h('sav-date-picker', { label: t('day'), value: x.due || today(), size: 'sm' }));
  const allDay = h('sav-switch', { checked: !x.time || null, size: 'sm' }, t('all_day'));
  const time = stop(h('sav-time-picker', { label: t('from'), value: x.time || '09:00', size: 'sm', step: 5 }));
  const len = select(t('length'), [15, 30, 45, 60, 90, 120, 180, 240].map((m) => [String(m), m < 60 ? t('minutes_n', { n: m }) : t('hours_n', { n: m / 60 })]), '60');
  const timed = h('div.grid2', time, len);
  const upd = () => { timed.hidden = allDay.checked; };
  allDay.addEventListener('change', upd); upd();
  dialog({ title: t('cal_add'), width: '28rem', body: h('div.form', h('p.muted', t('cal_add_t')), cal, day, allDay, timed), actions: [{ label: t('cancel') }, { label: t('create'), primary: true, run: async () => {
    if (!day.value) throw Object.assign(new Error(), { code: 'bad_time' });
    const res = await api('tasks.cal.create', { id: x.id, cal: cal.value, day: day.value, time: allDay.checked ? null : time.value, minutes: +len.value, tz: tz() });
    x.calEvent = res.event;
    const real = taskById(x.id); if (real) real.calEvent = res.event;
    S.linked.events[res.event] = { allDay: allDay.checked, start: allDay.checked ? day.value : new Date(zonedMs(day.value, time.value)).toISOString(), calendar: res.calendar };
    ctx.redraw(); after?.();
    dialog({ title: t('cal_done'), width: '26rem', body: empty('calendar-check', t('cal_done'), t('cal_done_t', { c: res.calendar })), actions: [{ label: t('stay_here') }, { label: t('open_in_cal'), primary: true, run: () => { location.href = res.link; } }] });
  } }] });
}

// ------------------------------------------------------------------ SavSchedules

/**
 * The task as a date poll of SavSchedules: a few days (and maybe a time) chosen here; everything else (who answers,
 * deadline…) is set in the editor of SavSchedules, which opens with the same account.
 */
function scheduleDialog(x, ctx, after) {
  const name = stop(h('sav-input', { label: t('title_l'), value: x.title, maxlength: 160 }));
  const place = stop(h('sav-input', { label: t('place'), maxlength: 200, placeholder: t('place_ph') }));
  const picks = [];
  const day = stop(h('sav-date-picker', { label: t('day'), value: x.due || addDays(today(), 1), size: 'sm' }));
  const time = stop(h('sav-time-picker', { label: t('time_opt'), value: x.time || '', size: 'sm', step: 15, clearable: true }));
  const len = select(t('length'), [30, 60, 90, 120, 180].map((m) => [String(m), m < 60 ? t('minutes_n', { n: m }) : t('hours_n', { n: m / 60 })]), '60');
  const list = h('div.picks');
  const paint = () => put(list, picks.length ? picks.map((p, i) => h('sav-tag', { size: 'sm', removable: true, 'onsav-remove': () => { picks.splice(i, 1); paint(); } }, p.time ? `${dayLabel(p.day)} · ${p.time}` : dayLabel(p.day))) : h('small.muted', t('pick_some')));
  const add = (d, hm) => { if (!d || picks.some((p) => p.day === d && p.time === (hm || null))) return; picks.push({ day: d, time: hm || null }); picks.sort((a, b) => (a.day + (a.time || '')).localeCompare(b.day + (b.time || ''))); paint(); };
  const addBtn = btn(t('add'), { size: 'sm', icon: 'plus', onclick: () => add(day.value, time.value) });
  const five = btn(t('next_5'), { size: 'sm', appearance: 'ghost', icon: 'calendar-range', onclick: () => { let d = day.value || today(), n = 0; while (n < 5) { if (weekday(d) < 5) { add(d, time.value); n++; } d = addDays(d, 1); } } });
  paint();
  dialog({ title: t('find_date'), width: '30rem', body: h('div.form', h('p.muted', t('find_date_t')), name, place, h('div.grid2', day, time), h('div.prow.wrap', addBtn, five), list, len), actions: [{ label: t('cancel') }, { label: t('create_open'), primary: true, run: async () => {
    if (!name.value.trim()) throw Object.assign(new Error(), { code: 'title_required' });
    if (!picks.length) throw Object.assign(new Error(), { code: 'nothing_chosen' });
    const m = +len.value;
    const options = picks.map((p) => (p.time ? { start: new Date(zonedMs(p.day, p.time)).toISOString(), end: new Date(zonedMs(p.day, p.time) + m * 60000).toISOString() } : { day: p.day }));
    const r = await api('tasks.sch.create', { id: x.id, title: name.value.trim(), place: place.value.trim(), tz: tz(), options });
    x.schedule = r.id;
    const real = taskById(x.id); if (real) real.schedule = r.id;
    S.linked.schedules[r.id] = { title: name.value.trim(), answers: 0, closed: false, final: null, link: r.edit };
    ctx.redraw(); after?.();
    dialog({ title: t('created'), width: '26rem', body: empty('vote', t('created_sch'), t('created_sch_t')), actions: [{ label: t('stay_here') }, { label: t('open_in_sch'), primary: true, run: () => { location.href = r.edit; } }] });
  } }] });
}

// ------------------------------------------------------------------ lists

/** A new list, or the name, colour, icon and way of showing of one. */
export function listDialog(l, ctx, asNew = false) {
  const base = l;
  if (asNew) l = null;
  const name = stop(h('sav-input', { label: t('name'), value: l?.name || '', maxlength: 120, autofocus: true, placeholder: t('list_ph') }));
  let color = l?.color || LIST_COLORS[S.lists.length % LIST_COLORS.length], ic = l?.icon || (base?.view === 'board' ? 'square-kanban' : ''), view = l?.view || base?.view || 'list';
  const col = colorPop(t('color'), color, (v) => { if (v) color = v; }, { list: LIST_COLORS });
  const icons = h('div.icons', LIST_ICONS.map((n) => h('button.icb' + (n === ic ? '.on' : ''), { type: 'button', title: n || t('no_icon'), 'aria-pressed': String(n === ic), onclick: (e) => { ic = n; icons.querySelectorAll('.icb').forEach((b) => { b.classList.toggle('on', b === e.currentTarget); b.setAttribute('aria-pressed', String(b === e.currentTarget)); }); } }, n ? icon(n) : h('i.ldot', { style: `--c:${color}` }))));
  const as = segmented(t('show_as'), view, [['list', '=' + t('as_list'), t('as_list')], ['board', '=' + t('as_board'), t('as_board')]], (v) => { view = v; }, { show: true, class: 'wide' });
  dialog({ title: t(l ? 'edit_list' : base?.view === 'board' ? 'new_board' : 'new_list'), width: '28rem', body: h('div.form', name, h('div.cf', h('span.flabel', t('color')), col), h('div', h('span.flabel', t('icon')), icons), as), actions: [{ label: t('cancel') }, { label: t(l ? 'save' : 'create'), primary: true, run: async () => {
    if (!name.value.trim()) throw Object.assign(new Error(), { code: 'name_required' });
    const r = await api('tasks.list.save', { ...(l ? { id: l.id } : {}), name: name.value.trim(), color, icon: ic, view });
    if (l) Object.assign(l, r.list); else S.lists.push(r.list);
    if (!l) go('#/l/' + r.list.id); else ctx.redraw();
  } }] });
}
export { relDay };
