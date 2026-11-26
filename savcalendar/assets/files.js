/**
 * Files. .savcal is the format of SavCalendar: one calendar, whole (name, colour, zone, every event with its
 * repetitions, exceptions and changed occurrences), opened again exactly as it was. The standard formats are there too:
 * .ics (Google, Outlook, Apple, Thunderbird… read it; written by the server, the same writer of the feed) and .csv for
 * spreadsheets.
 *
 * .savcal: a ZIP with `mimetype` (application/vnd.savcalendar.calendar+zip, stored first) and calendar.json
 *   {format: "savcal", version: 1, app, exported, name, color, descr, tz, events: [{uid, title, descr, place, url, allDay,
 *    start, end, tz, rrule, exdates, recurId, status, busy, color}]}   (times as cal.events gives them: ISO UTC, or dates)
 */
import { zip, unzip, text } from './zip.js';
import { api } from './store.js';

export const SAVCAL = 'application/vnd.savcalendar.calendar+zip';
export const fileName = (title, ext) => (String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 100) || 'calendar') + '.' + ext;
/** Inside the Android app: the file goes to the app in pieces, then the system asks where to keep it. */
export const inApp = () => /SavCalendarApp\/Android/.test(navigator.userAgent) && !!window.SavCalendarAndroid?.saveFile;
async function saveInApp(blob, name) {
  // the pieces end at a multiple of 4 characters, so each one can be decoded alone
  const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  window.SavCalendarAndroid.saveBegin(name, blob.type || 'application/octet-stream');
  for (let i = 0; i < b64.length; i += 524288) window.SavCalendarAndroid.saveFile(b64.slice(i, i + 524288));
  window.SavCalendarAndroid.saveEnd();
}
export function download(blob, name) {
  if (inApp()) return void saveInApp(blob, name);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
const bad = (code) => Object.assign(new Error(code), { code });

/** The whole calendar from the server. */
const whole = (id) => api('cal.cal.export', undefined, { id });

export async function saveSavcal(id) {
  const { calendar: c, events } = await whole(id);
  const json = { format: 'savcal', version: 1, app: 'SavCalendar', exported: new Date().toISOString(), name: c.name, color: c.color, descr: c.descr, tz: c.tz,
    events: events.map(({ uid, title, descr, place, url, allDay, start, end, tz, rrule, exdates, recurId, status, busy, color }) => ({ uid, title, descr, place, url, allDay, start, end, tz, rrule, exdates, recurId, status, busy, color })) };
  download(await zip([['mimetype', SAVCAL, { store: true }], ['calendar.json', JSON.stringify(json, null, 1)]], SAVCAL), fileName(c.name, 'savcal'));
}

export async function saveIcs(id, name) {
  const r = await fetch('api/?r=cal.cal.ics&id=' + encodeURIComponent(id), { cache: 'no-store' }).catch(() => null);
  if (!r?.ok) throw bad(r ? 'server' : 'network');
  download(await r.blob(), fileName(name, 'ics'));
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",;\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };
/** The columns Google Calendar reads when it imports a .csv (and that any spreadsheet shows well). */
export async function saveCsv(id, tz) {
  const { calendar: c, events } = await whole(id);
  const d = (iso, all) => (all ? iso : new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)));
  const h = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  const rows = [['Subject', 'Start Date', 'Start Time', 'End Date', 'End Time', 'All Day Event', 'Description', 'Location', 'Repeats', 'Calendar']];
  for (const e of events) {
    const end = e.allDay ? new Date(Date.parse(e.end + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10) : e.end;
    rows.push([e.title, d(e.start, e.allDay), e.allDay ? '' : h(e.start), d(end, e.allDay), e.allDay ? '' : h(e.end), e.allDay ? 'True' : 'False', e.descr, e.place, e.rrule, c.name]);
  }
  download(new Blob(['﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }), fileName(c.name, 'csv'));
}

/** What cal.import needs from a file: {savcal} for a .savcal (or its JSON), {ics} for a standard calendar. */
export async function readCalendarFile(file) {
  if (file.size > 6e6) throw bad('file_big');
  const buf = await file.arrayBuffer(), head = new Uint8Array(buf.slice(0, 2));
  if (head[0] === 0x50 && head[1] === 0x4b) {
    let json;
    try { const files = await unzip(buf, { maxFiles: 20, maxBytes: 30e6 }); const f = files.get('calendar.json'); if (!f) throw 0; json = JSON.parse(text(await f())); } catch { throw bad('file_invalid'); }
    if (json?.format !== 'savcal' || !Array.isArray(json.events)) throw bad('file_invalid');
    return { savcal: json, name: json.name };
  }
  const s = text(new Uint8Array(buf)).replace(/^﻿/, '');
  if (/^\s*\{/.test(s)) { try { const json = JSON.parse(s); if (json?.format === 'savcal') return { savcal: json, name: json.name }; } catch { /* not JSON */ } throw bad('file_invalid'); }
  if (!/^\s*BEGIN:VCALENDAR/i.test(s)) throw bad('ics_invalid');
  return { ics: s, name: file.name.replace(/\.(ics|ical|ifb|icalendar)$/i, '') };
}
