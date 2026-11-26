/**
 * Times. The opening and the deadline of a form are moments (UTC on the server), chosen and shown on the clock of the
 * zone of the form; answers are shown on the clock of the browser.
 */
import { getLang } from './i18n.js';

export const LOCAL_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
const pad = (n) => String(n).padStart(2, '0');
const fmts = new Map();
const fmt = (tz, o) => { const k = tz + JSON.stringify(o) + getLang(); if (!fmts.has(k)) fmts.set(k, new Intl.DateTimeFormat(getLang() === 'it' ? 'it-IT' : 'en-GB', { timeZone: tz, ...o })); return fmts.get(k); };

/** The wall clock of an instant in a zone: {y, m, d, h, mi}. */
export function parts(ms, tz) {
  const p = {};
  for (const x of fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms))) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute };
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
/** ISO moment -> "YYYY-MM-DDTHH:MM" on the clock of a zone (for an input of date and time), and back. */
export const toLocalInput = (iso, tz) => { if (!iso) return ''; const p = parts(Date.parse(iso), tz); return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`; };
export const fromLocalInput = (v, tz) => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || ''); return m ? new Date(zoned(+m[1], +m[2], +m[3], +m[4], +m[5], tz)).toISOString() : null; };
/** "Tue 1 Dec 2026, 18:00" of an ISO moment in a zone. */
export const moment = (iso, tz = LOCAL_TZ, o = {}) => fmt(tz, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...o }).format(new Date(iso));
export const shortMoment = (iso, tz = LOCAL_TZ) => fmt(tz, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
/** "1 Dec 2026" of a day key (YYYY-MM-DD). */
export const dayLabel = (k, o = { day: 'numeric', month: 'short', year: 'numeric' }) => { const [y, m, d] = k.split('-').map(Number); return fmt('UTC', o).format(new Date(Date.UTC(y, m - 1, d, 12))); };
export const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };
/** "2 h 5 min", "45 s" of seconds. */
export const duration = (s) => { if (s == null) return '–'; if (s < 60) return s + ' s'; const m = Math.round(s / 60); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : ''); };
/** "in 3 days", "2 hours ago" of an ISO moment. */
export function rel(iso) {
  const s = (Date.parse(iso) - Date.now()) / 1000, a = Math.abs(s), rtf = new Intl.RelativeTimeFormat(getLang(), { numeric: 'auto' });
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}
/** The time zones the browser knows, the local one first. */
export const ZONES = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return [LOCAL_TZ, 'UTC', 'Europe/Rome', 'Europe/London', 'America/New_York']; } })();
