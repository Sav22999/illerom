/**
 * The week of the person: which day comes first and which days the week and month views show. One panel, the same in
 * the bar of the calendar and in the settings.
 *
 * Rules (so that nothing undoes something else):
 *   - the first day and the days shown are independent: hiding the first day does not change the first day;
 *   - at least one day stays shown (the last one cannot be switched off);
 *   - the shortcuts only set the days shown (they never touch the first day) and are lit when the days match them;
 *   - the day and agenda views always show every day; the small month always shows the whole week.
 * Kept in the settings of the calendar: firstDay (0 = Monday … 6 = Sunday) and days (sorted list, all 7 = every day).
 */
import { h } from './ui.js';
import { t, getLang } from './i18n.js';
import { prefs, setPrefs } from './account.js';

const ALL = [0, 1, 2, 3, 4, 5, 6];
export const dayName = (i, f = 'long') => new Intl.DateTimeFormat(getLang(), { weekday: f, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i)));
/** 0 = Monday … 6 = Sunday. "weekStart: 0" of the first version meant Sunday. */
export const firstDay = () => { const f = prefs().firstDay; return Number.isInteger(f) && f >= 0 && f < 7 ? f : prefs().weekStart === 0 ? 6 : 0; };
export const shownDays = () => { const d = Array.isArray(prefs().days) ? [...new Set(prefs().days.filter((x) => Number.isInteger(x) && x >= 0 && x < 7))].sort() : []; return d.length ? d : ALL; };
/** The seven days in the order of the week of the person. */
export const weekOrder = () => ALL.map((i) => (i + firstDay()) % 7);

const PRESETS = [['days_all', ALL], ['days_work', [0, 1, 2, 3, 4]], ['days_no_sun', [0, 1, 2, 3, 4, 5]], ['days_no_sat', [0, 1, 2, 3, 4, 6]]];
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The panel. onchange(): after every change (the views are drawn again). opts.compact: no headings (settings rows). */
export function weekPanel(onchange, opts = {}) {
  const box = h('div.weekp');
  const save = async (x) => { await setPrefs(x); draw(); onchange?.(x); };
  const draw = () => {
    const on = shownDays(), f = firstDay();
    const first = h('div.wk-first', { role: 'radiogroup', 'aria-label': t('week_start') }, ALL.map((d) => h('button.wkf' + (d === f ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': String(d === f), title: dayName(d), onclick: () => d !== f && save({ firstDay: d }) }, dayName(d, 'short'))));
    const days = h('div.wk-days', { role: 'group', 'aria-label': t('show_days') }, weekOrder().map((d) => {
      const lit = on.includes(d), last = lit && on.length === 1;
      return h('button.wkd' + (lit ? '.on' : ''), { type: 'button', 'aria-pressed': String(lit), disabled: last || null, title: last ? t('days_one_left') : dayName(d), onclick: () => save({ days: lit ? on.filter((x) => x !== d) : [...on, d].sort() }) },
        h('b', dayName(d, 'narrow')), h('small', dayName(d, 'short')));
    }));
    const presets = h('div.wk-pre', PRESETS.map(([k, list]) => h('button.wkp' + (same(on, list) ? '.on' : ''), { type: 'button', 'aria-pressed': String(same(on, list)), onclick: () => save({ days: list }) }, t(k))));
    box.replaceChildren(
      opts.compact ? null : h('div.wk-h', t('week_start')), first,
      opts.compact ? null : h('div.wk-h', t('show_days')), days, presets,
      h('p.wk-note', on.length === 7 ? t('days_note_all') : on.length === 6 ? t('days_note_1') : t('days_note', { n: 7 - on.length })));
  };
  draw();
  return box;
}

