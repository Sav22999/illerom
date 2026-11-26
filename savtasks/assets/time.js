/**
 * Times. A task is due on a day (YYYY-MM-DD) with an optional wall-clock time (HH:MM) in a time zone: days never move.
 * Reminders and the items of SavSchedules are moments in UTC, shown in the zone of the app (settings → time zone).
 */
import { getLang } from './i18n.js';

export const LOCAL_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
const pad = (n) => String(n).padStart(2, '0');
const fmts = new Map();
const fmt = (tz, o) => { const k = tz + JSON.stringify(o) + getLang(); if (!fmts.has(k)) fmts.set(k, new Intl.DateTimeFormat(getLang() === 'it' ? 'it-IT' : 'en-GB', { timeZone: tz, ...o })); return fmts.get(k); };

/** The wall clock of an instant in a zone: {y, m, d, h, mi, wd} (m from 1, wd 0 = Monday). */
export function parts(ms, tz) {
  const p = {};
  for (const x of fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(ms))) p[x.type] = x.value;
  const wd = new Date(Date.UTC(+p.year, +p.month - 1, +p.day)).getUTCDay();
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, wd: (wd + 6) % 7 };
}
const offset = (ms, tz) => { const p = parts(ms, tz); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000; };
/** The instant of a wall clock in a zone (the hour skipped by summer time moves forward). */
export function zoned(y, m, d, h, mi, tz) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offset(guess, tz);
  const o2 = offset(t, tz);
  if (guess - o2 !== t) t = guess - o2;
  return t;
}
export const dayKey = (ms, tz) => { const p = parts(ms, tz); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
export const keyParts = (k) => k.split('-').map(Number);
export const addDays = (k, n) => { const [y, m, d] = keyParts(k); const x = new Date(Date.UTC(y, m - 1, d + n)); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };
export const weekday = (k) => { const [y, m, d] = keyParts(k); return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; };
export const mondayOf = (k) => addDays(k, -weekday(k));
export const todayKey = (tz = LOCAL_TZ) => dayKey(Date.now(), tz);
export const hm = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

/** "Tue 1 Dec" / "mar 1 dic" of a date key. */
export const dayLabel = (k, o = { weekday: 'short', day: 'numeric', month: 'short' }) => { const [y, m, d] = keyParts(k); return fmt('UTC', o).format(new Date(Date.UTC(y, m - 1, d, 12))); };
export const longDay = (k) => dayLabel(k, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const monthLabel = (k) => dayLabel(k, { month: 'long', year: 'numeric' });
export const clock = (ms, tz) => fmt(tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
export const zoneName = (tz) => { try { const p = fmt(tz, { timeZoneName: 'shortGeneric' }).formatToParts(new Date()).find((x) => x.type === 'timeZoneName'); return (p?.value || '') + ' · ' + tz.replace(/_/g, ' '); } catch { return tz; } };

/** An option seen in a zone: {key: day, start, end (minutes of that day), allDay} */
export function place(o, tz) {
  if (o.day) return { key: o.day, allDay: true };
  const a = Date.parse(o.start), p = parts(a, tz), start = p.h * 60 + p.mi;
  let end = start + 60;
  if (o.end) { const b = Date.parse(o.end); end = start + Math.round((b - a) / 60000); }
  return { key: dayKey(a, tz), start, end, allDay: false };
}
/** "09:00–09:30" or "all day". */
export function span(o, tz, allDayText) {
  if (o.day) return allDayText;
  const a = Date.parse(o.start);
  return clock(a, tz) + (o.end ? '–' + clock(Date.parse(o.end), tz) : '');
}
/** The sort key of an option. */
export const sortKey = (o) => (o.day ? o.day + 'T00:00:00Z' : o.start);
export const byTime = (a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0);
/** Groups the options by day in a zone, sorted: [[key, [options]]] */
export function byDay(list, tz) {
  const m = new Map();
  for (const o of [...list].sort(byTime)) { const k = o.day || dayKey(Date.parse(o.start), tz); if (!m.has(k)) m.set(k, []); m.get(k).push(o); }
  return [...m.entries()];
}
/** The time zones the browser knows, the local one first. */
export const ZONES = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return [LOCAL_TZ, 'UTC', 'Europe/Rome', 'Europe/London', 'America/New_York']; } })();

/** Days between two date keys (b - a). */
export const daysBetween = (a, b) => { const [y1, m1, d1] = keyParts(a), [y2, m2, d2] = keyParts(b); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5); };
/** "Today", "Tomorrow", "Yesterday", the weekday within a week, otherwise "Tue 1 Dec" (with the year when it is another one). */
export function relDay(k, t, tz = LOCAL_TZ) {
  const n = daysBetween(todayKey(tz), k);
  if (n === 0) return t('today');
  if (n === 1) return t('tomorrow');
  if (n === -1) return t('yesterday');
  if (n > 1 && n < 7) return dayLabel(k, { weekday: 'long' });
  return dayLabel(k, { weekday: 'short', day: 'numeric', month: 'short', year: k.slice(0, 4) !== todayKey(tz).slice(0, 4) ? 'numeric' : undefined });
}
