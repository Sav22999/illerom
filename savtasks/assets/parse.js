/**
 * Quick add: what a line typed in the box means, in Italian and English. "Call Anna tomorrow 15:00 !high #work @Home"
 * gives the title "Call Anna", due tomorrow at 15:00, high priority, the label "work" and the list "Home". Only what is
 * clearly a date, a time, a priority, a label, a list or a repetition is taken out of the title; the rest stays as it is.
 *
 *   days       today/oggi, tomorrow/domani, dopodomani, monday…/lunedì… (the next one), next week/prossima settimana,
 *              in 3 days/tra 3 giorni, 25/12, 25/12/2027, 2027-12-25
 *   time       15:00, 9.30, 3pm, at 9/alle 9
 *   priority   !, !!, !!! or !low !medium !high / !bassa !media !alta
 *   label      #word     list  @name (the start of the name of a list)     star  *  (alone)
 *   repeat     every day/ogni giorno, every week, every month, every year, every monday/ogni lunedì, weekdays/giorni feriali
 */
import { addDays, todayKey, weekday } from './time.js';

const WD = [['monday', 'mon', 'lunedì', 'lunedi', 'lun'], ['tuesday', 'tue', 'martedì', 'martedi', 'mar'], ['wednesday', 'wed', 'mercoledì', 'mercoledi', 'mer'], ['thursday', 'thu', 'giovedì', 'giovedi', 'gio'],
  ['friday', 'fri', 'venerdì', 'venerdi', 'ven'], ['saturday', 'sat', 'sabato', 'sab'], ['sunday', 'sun', 'domenica', 'dom']];
const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const pad = (n) => String(n).padStart(2, '0');
const wdIndex = (w) => WD.findIndex((names) => names.includes(w));
const nextWeekday = (from, i) => { const d = (i - weekday(from) + 7) % 7 || 7; return addDays(from, d); };

/** {title, due, time, priority, tags, list, rrule, starred, found: [[kind, text]]} — lists: [{id, name}] */
export function parseQuick(text, lists = [], tz) {
  let s = ' ' + String(text || '').replace(/\s+/g, ' ') + ' ';
  const out = { due: null, time: null, priority: 0, tags: [], list: null, rrule: '', starred: false, found: [] };
  const today = todayKey(tz);
  const take = (re, fn) => { s = s.replace(re, (...m) => { const r = fn(...m); return r === false ? m[0] : ' '; }); };
  const W = '(?=[\\s,.;!?]|$)';

  // repetitions first (they may name a weekday)
  take(new RegExp(`\\s(?:every|ogni)\\s(day|giorno|week|settimana|month|mese|year|anno)${W}`, 'i'), (m, w) => {
    const f = { day: 'DAILY', giorno: 'DAILY', week: 'WEEKLY', settimana: 'WEEKLY', month: 'MONTHLY', mese: 'MONTHLY', year: 'YEARLY', anno: 'YEARLY' }[w.toLowerCase()];
    out.rrule = 'FREQ=' + f; out.found.push(['repeat', m.trim()]); if (!out.due) out.due = today;
  });
  take(new RegExp(`\\s(?:weekdays|on weekdays|(?:nei |i )?giorni feriali|ogni giorno feriale)${W}`, 'i'), (m) => {
    out.rrule = 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'; out.found.push(['repeat', m.trim()]);
    if (!out.due) { let d = today; while (weekday(d) > 4) d = addDays(d, 1); out.due = d; }
  });
  take(new RegExp(`\\s(?:every|ogni)\\s([a-zàèéìòù]+)${W}`, 'i'), (m, w) => {
    const i = wdIndex(w.toLowerCase());
    if (i < 0) return false;
    out.rrule = 'FREQ=WEEKLY;BYDAY=' + BYDAY[i]; out.found.push(['repeat', m.trim()]);
    if (!out.due) out.due = weekday(today) === i ? today : nextWeekday(today, i);
  });

  // days
  take(new RegExp(`\\s(today|oggi|stasera|tonight)${W}`, 'i'), (m, w) => { out.due = today; if (/stasera|tonight/i.test(w) && !out.time) out.time = '20:00'; out.found.push(['due', m.trim()]); });
  take(new RegExp(`\\s(tomorrow|domani)${W}`, 'i'), (m) => { out.due = addDays(today, 1); out.found.push(['due', m.trim()]); });
  take(new RegExp(`\\s(dopodomani|day after tomorrow)${W}`, 'i'), (m) => { out.due = addDays(today, 2); out.found.push(['due', m.trim()]); });
  take(new RegExp(`\\s(next week|(?:la )?prossima settimana|settimana prossima)${W}`, 'i'), (m) => { out.due = nextWeekday(today, 0); out.found.push(['due', m.trim()]); });
  take(new RegExp(`\\s(?:in|tra|fra)\\s(\\d{1,3})\\s(days?|giorni|giorno|weeks?|settimane|settimana)${W}`, 'i'), (m, n, u) => { out.due = addDays(today, +n * (/^(w|sett)/i.test(u) ? 7 : 1)); out.found.push(['due', m.trim()]); });
  take(new RegExp(`\\s(?:(?:on|next|il|lo|la|di|questo|questa|prossimo|prossima)\\s)?([a-zàèéìòù]+)${W}`, 'gi'), (m, w) => {
    if (out.due) return false;
    const i = wdIndex(w.toLowerCase());
    // the short names that are also words (mar, dom, sun…) count only after "on/il/di…" or when they are the long name
    if (i < 0 || (w.length <= 3 && !/^\s(on|next|il|di|questo|questa|prossimo|prossima)\s/i.test(m))) return false;
    out.due = nextWeekday(addDays(today, -1), i); out.found.push(['due', m.trim()]);
  });
  take(/\s(\d{4})-(\d{2})-(\d{2})(?=[\s,.;]|$)/, (m, y, mo, d) => { out.due = `${y}-${mo}-${d}`; out.found.push(['due', m.trim()]); });
  take(/\s(?:il\s|on\s)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=[\s,.;]|$)/, (m, d, mo, y) => {
    if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return false;
    let yy = y ? (y.length === 2 ? 2000 + +y : +y) : +today.slice(0, 4);
    let k = `${yy}-${pad(mo)}-${pad(d)}`;
    if (!y && k < today) k = `${yy + 1}-${pad(mo)}-${pad(d)}`;
    out.due = k; out.found.push(['due', m.trim()]);
  });

  // time
  take(/\s(?:at\s|alle\s|ore\s|h\s?)?([01]?\d|2[0-3])[:.]([0-5]\d)(?=[\s,.;]|$)/i, (m, hh, mi) => { out.time = `${pad(hh)}:${mi}`; out.found.push(['time', m.trim()]); });
  take(/\s(?:at\s)?(1[0-2]|0?[1-9])(?::([0-5]\d))?\s?(am|pm)(?=[\s,.;]|$)/i, (m, hh, mi, ap) => { let x = +hh % 12 + (ap.toLowerCase() === 'pm' ? 12 : 0); out.time = `${pad(x)}:${mi || '00'}`; out.found.push(['time', m.trim()]); });
  take(/\s(?:at|alle)\s([01]?\d|2[0-3])(?=[\s,.;]|$)/i, (m, hh) => { if (out.time) return false; out.time = `${pad(hh)}:00`; out.found.push(['time', m.trim()]); });
  if (out.time && !out.due) out.due = today;

  // priority, labels, list, star
  take(/\s!(low|bassa|medium|med|media|high|alta|urgent|urgente)(?=\s)/i, (m, w) => { out.priority = /low|bassa/i.test(w) ? 1 : /med/i.test(w) ? 2 : 3; out.found.push(['priority', m.trim()]); });
  take(/\s(!{1,3})(?=\s)/, (m, b) => { out.priority = b.length; out.found.push(['priority', m.trim()]); });
  // a label at the end goes away; one inside the sentence ("buy #bread and milk") stays there as a word
  s = s.replace(/\s#([\p{L}\p{N}_-]{1,30})(?=\s)/gu, (m, w, at, all) => {
    if (out.tags.length >= 12) return m;
    const tg = w.toLowerCase(); if (!out.tags.includes(tg)) out.tags.push(tg); out.found.push(['tag', m.trim()]);
    return /^(\s+[#@!*]\S*)*\s*$/u.test(all.slice(at + m.length)) ? ' ' : ' ' + w;
  });
  take(/\s@([\p{L}\p{N}_-]{1,40})(?=\s)/u, (m, w) => {
    const k = w.toLowerCase().replace(/[_-]/g, ' ');
    const l = lists.find((x) => x.name.toLowerCase() === k) || lists.find((x) => x.name.toLowerCase().startsWith(k)) || lists.find((x) => x.name.toLowerCase().replace(/\s+/g, '').startsWith(k.replace(/\s+/g, '')));
    if (!l) return false;
    out.list = l.id; out.found.push(['list', m.trim()]);
  });
  take(/\s\*(?=\s)/, (m) => { out.starred = true; out.found.push(['star', '*']); });

  out.title = s.replace(/\s+/g, ' ').trim().replace(/[\s,;]+$/, '');
  return out;
}
