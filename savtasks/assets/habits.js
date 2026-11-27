/**
 * Habits: a list of things to do on some days (every day, the weekdays, or the days chosen: its rrule), each day ticked on
 * its own (the log). The view is a week, Monday to Sunday (arrows to the weeks before): a press on a day ticks it or takes
 * the tick away; the days a habit does not ask are faint, the days to come cannot be ticked. On the right the streak:
 * the days in a row it was done, counting back from today (today not done yet does not break it).
 * "Today" shows the habits of the day too (habitsToday).
 */
import { btn, fail, h, icon, iconBtn, put } from './ui.js';
import { getLang, t } from './i18n.js';
import { S, api, keep } from './store.js';
import { prefs } from './account.js';
import { addDays, dayLabel, daysBetween, todayKey, weekday } from './time.js';
import { openTask, describeRule } from './task.js';

const tz = () => prefs().tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const weeks = new Map(); // how many weeks back each list is showing

/** The day the habit began (its first day counted): the day it was made, or the first day ticked when that came before. */
const startOf = (x) => { const c = new Intl.DateTimeFormat('en-CA', { timeZone: tz() }).format(new Date(x.created)); return x.log[0] && x.log[0] < c ? x.log[0] : c; };

/** Does the habit ask for this day? '' and FREQ=DAILY: every day (or every n days); WEEKLY: its days (or its weekday). */
export function asks(x, d) {
  const r = x.rrule || '';
  if (d < startOf(x)) return false;
  const n = +(/INTERVAL=(\d+)/.exec(r)?.[1] || 1);
  if (!r || /FREQ=DAILY/.test(r)) return daysBetween(startOf(x), d) % n === 0;
  if (/FREQ=WEEKLY/.test(r)) {
    const by = /BYDAY=([A-Z,]+)/.exec(r)?.[1];
    const ok = by ? by.split(',').includes(DAYS[weekday(d)]) : weekday(d) === weekday(startOf(x));
    return ok && Math.floor(daysBetween(addDays(startOf(x), -weekday(startOf(x))), d) / 7) % n === 0;
  }
  return true;
}
const isDone = (x, d) => x.log.includes(d);

/** The days in a row it was done, back from today (today, not done yet, does not break it), and the best run ever. */
export function streaks(x) {
  const k = todayKey(tz()), first = startOf(x);
  let cur = 0, d = k;
  if (asks(x, d) && !isDone(x, d)) d = addDays(d, -1);
  for (let i = 0; i < 800 && d >= first; i++, d = addDays(d, -1)) {
    if (!asks(x, d)) continue;
    if (isDone(x, d)) cur++; else break;
  }
  let best = 0, run = 0;
  for (let d2 = first, i = 0; d2 <= k && i < 1200; d2 = addDays(d2, 1), i++) {
    if (!asks(x, d2)) continue;
    if (isDone(x, d2)) { run++; best = Math.max(best, run); } else if (d2 !== k) run = 0;
  }
  // how many of the days asked in the last 30 it was done
  let asked = 0, done = 0;
  for (let i = 0; i < 30; i++) { const d3 = addDays(k, -i); if (d3 < first) break; if (asks(x, d3)) { asked++; if (isDone(x, d3)) done++; } }
  return { cur, best, rate: asked ? Math.round((done / asked) * 100) : 0 };
}

/** A day ticked or not: the copy here changes at once, then the server. */
export async function mark(x, d, ctx) {
  const done = !isDone(x, d);
  x.log = done ? [...x.log, d].sort() : x.log.filter((y) => y !== d);
  ctx.redraw();
  try { keep((await api('tasks.habit.mark', { id: x.id, day: d, done, tz: tz() })).task); } catch (e) { x.log = done ? x.log.filter((y) => y !== d) : [...x.log, d].sort(); fail(e); }
  ctx.redraw();
}

export function habitsView(l, tasks, ctx) {
  const k = todayKey(tz()), back = weeks.get(l.id) || 0;
  const mon = addDays(addDays(k, -weekday(k)), -7 * back), days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(mon, i));
  const list = tasks.filter((x) => !x.done).sort((a, b) => a.position - b.position);
  const go = (n) => { weeks.set(l.id, Math.max(0, back + n)); ctx.redraw(); };
  const head = h('div.hrow.hhead',
    h('div.hname', iconBtn('chevron-left', t('h_prev'), () => go(1)), h('span', back ? `${dayLabel(days[0], { day: 'numeric', month: 'short' })} – ${dayLabel(days[6], { day: 'numeric', month: 'short' })}` : t('h_this_week')), back ? iconBtn('chevron-right', t('h_next'), () => go(-1)) : null),
    days.map((d) => h('div.hday' + (d === k ? '.now' : ''), h('small', dayLabel(d, { weekday: 'short' })), h('b', dayLabel(d, { day: 'numeric' })))),
    h('div.hstreak', h('small', t('h_streak'))));
  const rows = list.map((x) => {
    const s = streaks(x);
    return h('div.hrow', { 'data-id': x.id },
      h('button.hname.hbtn', { type: 'button', onclick: () => openTask(x.id, ctx), title: x.title }, h('span', x.title || t('no_title')), h('small', describeRule(x.rrule) || t('r_every_day'))),
      days.map((d) => {
        const on = isDone(x, d), want = asks(x, d), future = d > k;
        const label = `${x.title}, ${dayLabel(d, { weekday: 'long', day: 'numeric', month: 'long' })}: ${t(on ? 'h_done' : 'h_not_done')}`;
        return h('button.hcell' + (on ? '.on' : '') + (want ? '' : '.off') + (d === k ? '.now' : ''), { type: 'button', disabled: future || null, 'aria-pressed': String(on), 'aria-label': label, title: label, onclick: () => mark(x, d, ctx) }, on ? icon('check') : null);
      }),
      h('div.hstreak', { title: t('h_stats', { best: s.best, rate: s.rate }) }, s.cur ? h('span.hfire', icon('flame'), String(s.cur)) : h('span.muted', '0'), h('small', t('h_rate', { n: s.rate }))));
  });
  return h('div.habits', { style: `--c:${l.color}` }, list.length ? h('div.hgrid', head, rows) : h('sav-empty-state', { icon: 'flame', heading: t('h_empty'), text: t('h_empty_t2') }));
}

/** For "Today": the habits that ask for today, to tick from there (from lists of habits not archived). */
export function habitsToday(ctx) {
  const k = todayKey(tz()), lists = new Set(S.lists.filter((l) => l.view === 'habits' && !l.archived).map((l) => l.id));
  const list = S.tasks.filter((x) => lists.has(x.list) && !x.done && asks(x, k));
  if (!list.length) return null;
  return h('section.tgroup', h('h2.ghead', icon('flame'), ' ', t('h_today'), h('small', `${list.filter((x) => isDone(x, k)).length}/${list.length}`)),
    h('div.hchips', list.map((x) => { const on = isDone(x, k), s = streaks(x); return h('button.hchip' + (on ? '.on' : ''), { type: 'button', 'aria-pressed': String(on), onclick: () => mark(x, k, ctx) }, icon(on ? 'circle-check' : 'circle'), h('span', x.title), s.cur ? h('small', icon('flame'), String(s.cur)) : null); })));
}
export { btn, getLang, put };
