/**
 * Repetitions (RRULE of RFC 5545) without libraries: the part every calendar uses. FREQ daily, weekly, monthly, yearly;
 * INTERVAL; COUNT or UNTIL; BYDAY (with a position in the month: 2TU, -1FR), BYMONTHDAY (also from the end: -1),
 * BYMONTH, BYSETPOS, WKST. The occurrences keep the wall clock of the zone of the event (a weekly 9:00 stays 9:00 across
 * summer time); whole days are dates and never move.
 */
import { parts, zoned, addDays, keyParts, weekday } from './time.js';

const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const pad = (n) => String(n).padStart(2, '0');
const key = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const monthLen = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** "FREQ=WEEKLY;BYDAY=MO,WE" → {freq, interval, count, until, byday: [{n, wd}], bymonthday, bymonth, bysetpos, wkst} */
export function parseRule(s) {
  if (!s) return null;
  const r = { interval: 1, byday: [], bymonthday: [], bymonth: [], wkst: 0 };
  for (const p of String(s).replace(/^RRULE:/i, '').split(';')) {
    const [k, v = ''] = p.split('=');
    const K = k.toUpperCase();
    if (K === 'FREQ') r.freq = v.toUpperCase();
    else if (K === 'INTERVAL') r.interval = Math.max(1, parseInt(v, 10) || 1);
    else if (K === 'COUNT') r.count = Math.max(1, parseInt(v, 10) || 1);
    else if (K === 'UNTIL') r.until = v.toUpperCase();
    else if (K === 'BYDAY') r.byday = v.toUpperCase().split(',').map((x) => { const m = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(x); return m ? { n: m[1] ? parseInt(m[1], 10) : 0, wd: DAYS.indexOf(m[2]) } : null; }).filter(Boolean);
    else if (K === 'BYMONTHDAY') r.bymonthday = v.split(',').map((x) => parseInt(x, 10)).filter((x) => x && Math.abs(x) <= 31);
    else if (K === 'BYMONTH') r.bymonth = v.split(',').map((x) => parseInt(x, 10)).filter((x) => x >= 1 && x <= 12);
    else if (K === 'BYSETPOS') r.bysetpos = parseInt(v, 10) || 0;
    else if (K === 'WKST') r.wkst = Math.max(0, DAYS.indexOf(v.toUpperCase()));
  }
  return ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(r.freq) ? r : null;
}

/** Back to text, in the order calendars expect. */
export function ruleText(r) {
  if (!r) return '';
  const out = ['FREQ=' + r.freq];
  if (r.interval > 1) out.push('INTERVAL=' + r.interval);
  if (r.count) out.push('COUNT=' + r.count); else if (r.until) out.push('UNTIL=' + r.until);
  if (r.byday?.length) out.push('BYDAY=' + r.byday.map((d) => (d.n ? d.n : '') + DAYS[d.wd]).join(','));
  if (r.bymonthday?.length) out.push('BYMONTHDAY=' + r.bymonthday.join(','));
  if (r.bymonth?.length) out.push('BYMONTH=' + r.bymonth.join(','));
  if (r.bysetpos) out.push('BYSETPOS=' + r.bysetpos);
  return out.join(';');
}

/** The days of a month that match BYDAY (with or without a position) and BYMONTHDAY; the start day when neither. */
function monthDays(y, m, r, startDay) {
  const len = monthLen(y, m);
  let days;
  if (r.byday.length) {
    days = [];
    for (const { n, wd } of r.byday) {
      const all = [];
      for (let d = 1; d <= len; d++) if (weekday(key(y, m, d)) === wd) all.push(d);
      if (!n) days.push(...all); else { const x = n > 0 ? all[n - 1] : all[all.length + n]; if (x) days.push(x); }
    }
    if (r.bymonthday.length) { const md = new Set(r.bymonthday.map((d) => (d < 0 ? len + d + 1 : d))); days = days.filter((d) => md.has(d)); }
  } else if (r.bymonthday.length) days = r.bymonthday.map((d) => (d < 0 ? len + d + 1 : d)).filter((d) => d >= 1 && d <= len);
  else days = startDay <= len ? [startDay] : [];
  days = [...new Set(days)].sort((a, b) => a - b);
  if (r.bysetpos) { const x = r.bysetpos > 0 ? days[r.bysetpos - 1] : days[days.length + r.bysetpos]; days = x ? [x] : []; }
  return days;
}

/** The candidate dates of the repetition, in order, from the first period (the caller stops it; a rule that matches nothing ends after some centuries of looking). */
function* candidates(r, start) {
  const [y0, m0, d0] = keyParts(start);
  if (r.freq === 'DAILY') {
    for (let k = start, i = 0; i < 40000; k = addDays(k, r.interval), i++) {
      const [y, m, d] = keyParts(k);
      if (r.bymonth.length && !r.bymonth.includes(m)) continue;
      if (r.byday.length && !r.byday.some((b) => b.wd === weekday(k))) continue;
      if (r.bymonthday.length && !r.bymonthday.some((x) => (x < 0 ? monthLen(y, m) + x + 1 : x) === d)) continue;
      yield k;
    }
  }
  if (r.freq === 'WEEKLY') {
    const wds = (r.byday.length ? r.byday.map((b) => b.wd) : [weekday(start)]).map((wd) => (wd - r.wkst + 7) % 7).sort((a, b) => a - b);
    const first = addDays(start, -((weekday(start) - r.wkst + 7) % 7));
    for (let w = first, i = 0; i < 6000; w = addDays(w, 7 * r.interval), i++) {
      for (const off of wds) {
        const k = addDays(w, off);
        if (r.bymonth.length && !r.bymonth.includes(keyParts(k)[1])) continue;
        yield k;
      }
    }
  }
  if (r.freq === 'MONTHLY') {
    for (let i = 0; i < 4800; i += r.interval) {
      const y = y0 + Math.floor((m0 - 1 + i) / 12), m = ((m0 - 1 + i) % 12) + 1;
      if (r.bymonth.length && !r.bymonth.includes(m)) continue;
      for (const d of monthDays(y, m, r, d0)) yield key(y, m, d);
    }
  }
  if (r.freq === 'YEARLY') {
    for (let y = y0; y < y0 + 400; y += r.interval) {
      let out = [];
      for (const m of r.bymonth.length ? r.bymonth : [m0]) for (const d of monthDays(y, m, { ...r, bysetpos: 0 }, d0)) out.push(key(y, m, d));
      out.sort();
      if (r.bysetpos) { const x = r.bysetpos > 0 ? out[r.bysetpos - 1] : out[out.length + r.bysetpos]; out = x ? [x] : []; }
      yield* out;
    }
  }
}

/** The end of UNTIL as a limit: a date key (whole days) or an instant. */
function untilLimit(r, tz) {
  if (!r.until) return null;
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(r.until);
  if (!m) return null;
  if (!m[4]) return { key: `${m[1]}-${m[2]}-${m[3]}`, ms: zoned(+m[1], +m[2], +m[3], 23, 59, tz) + 59999 };
  const ms = m[7] ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : zoned(+m[1], +m[2], +m[3], +m[4], +m[5], tz);
  return { key: `${m[1]}-${m[2]}-${m[3]}`, ms };
}

/**
 * The occurrences of an event in [a, b) (instants in ms; whole days compare their dates).
 * ev: {start, end, allDay, tz, rrule, exdates}. Returns [{start, end}] (ISO instants, or date keys for whole days).
 */
export function expand(ev, a, b, limit = 1500) {
  const r = parseRule(ev.rrule);
  const tz = ev.tz || 'UTC';
  if (!r) return [{ start: ev.start, end: ev.end }];
  const ex = new Set((ev.exdates || []).map((x) => (x.length === 10 ? x : String(Date.parse(x)))));
  const until = untilLimit(r, tz);
  const out = [];
  let n = 0, guard = 0;
  if (ev.allDay) {
    const len = Math.max(1, Math.round((Date.parse(ev.end + 'T00:00:00Z') - Date.parse(ev.start + 'T00:00:00Z')) / 864e5));
    const aKey = new Date(a).toISOString().slice(0, 10), bKey = new Date(b).toISOString().slice(0, 10);
    for (const k of candidates(r, ev.start)) {
      if (++guard > 60000) break;
      if (k < ev.start) continue;
      if (until && k > until.key) break;
      if (r.count && ++n > r.count) break;
      if (k > bKey) break;
      const e = addDays(k, len);
      if (e > aKey && !ex.has(k)) out.push({ start: k, end: e });
      if (out.length >= limit) break;
    }
    return out;
  }
  const s = Date.parse(ev.start), dur = Math.max(0, Date.parse(ev.end) - s), p = parts(s, tz);
  const first = key(p.y, p.m, p.d);
  for (const k of candidates(r, first)) {
    if (++guard > 60000) break;
    if (k < first) continue;
    const [y, m, d] = keyParts(k);
    const at = zoned(y, m, d, p.h, p.mi, tz);
    if (at < s) continue;
    if (until && at > until.ms) break;
    if (r.count && ++n > r.count) break;
    if (at >= b) break;
    if (at + dur > a || (dur === 0 && at >= a)) if (!ex.has(String(at))) out.push({ start: new Date(at).toISOString().replace('.000Z', 'Z'), end: new Date(at + dur).toISOString().replace('.000Z', 'Z') });
    if (out.length >= limit) break;
  }
  return out;
}

/** Words for a repetition: "Every week on Monday and Wednesday, 10 times". t: the texts of the app. */
export function describe(rule, t, lang, startKey) {
  const r = typeof rule === 'string' ? parseRule(rule) : rule;
  if (!r) return '';
  const wdName = (wd, form = 'long') => new Intl.DateTimeFormat(lang, { weekday: form, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + wd)));
  const list = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' ' + t('and') + ' ' + xs[xs.length - 1]);
  const ord = (n) => t(n === -1 ? 'ord_last' : 'ord_' + n);
  const unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[r.freq];
  let s = r.interval > 1 ? t('every_n_' + unit, { n: r.interval }) : t('every_' + unit);
  if (r.freq === 'WEEKLY' && r.byday.length) {
    const wds = r.byday.map((b) => b.wd).sort();
    s += ' ' + (wds.join() === '0,1,2,3,4' ? t('on_weekdays') : t('on_days', { d: list(wds.map((w) => wdName(w))) }));
  }
  if (r.freq === 'MONTHLY' || r.freq === 'YEARLY') {
    if (r.byday.length && r.byday[0].n) s += ' ' + t('on_nth', { n: ord(r.byday[0].n), d: wdName(r.byday[0].wd) });
    else if (r.bymonthday.length) s += ' ' + t('on_day_n', { n: r.bymonthday.map((d) => (d === -1 ? t('ord_last_day') : d)).join(', ') });
    if (r.freq === 'YEARLY' && r.bymonth.length) s += ' ' + new Intl.DateTimeFormat(lang, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, r.bymonth[0] - 1, 5)));
  }
  if (r.count) s += ', ' + t(r.count === 1 ? 'once' : 'n_times', { n: r.count });
  else if (r.until) { const u = r.until.slice(0, 8); s += ', ' + t('until_d', { d: new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+u.slice(0, 4), +u.slice(4, 6) - 1, +u.slice(6, 8), 12))) }); }
  return s;
}

export { DAYS };
