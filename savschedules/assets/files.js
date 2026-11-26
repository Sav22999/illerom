/** Files: .savsch (a whole schedule), CSV of the answers, .ics for calendars. */
import { zip, unzip, text } from './zip.js';

export const SAVSCH = 'application/vnd.savschedules.schedule+zip';
export const fileName = (title, ext) => (String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 100) || 'schedule') + '.' + ext;
export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

/** A .savsch: a ZIP with mimetype and schedule.json; the answers only when asked (names and emails are personal data). */
export async function toSavsch(s, withAnswers = false) {
  const opts = s.options.map((o) => ({ ref: o.id, start: o.start, end: o.end, day: o.day, label: o.label, cap: o.cap }));
  const json = { format: 'savsch', version: 1, kind: s.kind, title: s.title, descr: s.descr, place: s.place, settings: s.settings, options: opts };
  if (withAnswers) json.answers = (s.responses || []).map((r) => ({ name: r.name, email: r.email || '', note: r.note, at: r.at, choices: r.choices }));
  return zip([['mimetype', SAVSCH, { store: true }], ['schedule.json', JSON.stringify(json, null, 1)]], SAVSCH);
}
/** Reads a .savsch (or the JSON inside one): what sch.create needs. */
export async function readSavsch(file) {
  if (file.size > 5e6) throw Object.assign(new Error('file_big'), { code: 'file_big' });
  const buf = await file.arrayBuffer();
  let json;
  try {
    const head = new Uint8Array(buf.slice(0, 2));
    if (head[0] === 0x50 && head[1] === 0x4b) { const files = await unzip(buf, { maxFiles: 20, maxBytes: 10e6 }); const f = files.get('schedule.json'); if (!f) throw 0; json = JSON.parse(text(await f())); } else json = JSON.parse(text(new Uint8Array(buf)));
  } catch { throw Object.assign(new Error('file_invalid'), { code: 'file_invalid' }); }
  if (json?.format !== 'savsch' || !Array.isArray(json.options)) throw Object.assign(new Error('file_invalid'), { code: 'file_invalid' });
  return { kind: json.kind === 'slots' ? 'slots' : 'poll', title: String(json.title || '').slice(0, 160), descr: String(json.descr || ''), place: String(json.place || ''), settings: json.settings || {}, options: json.options.map(({ start, end, day, label, cap }) => ({ start, end, day, label, cap })) };
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",;\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };
/** rows: arrays of cells. A BOM so that spreadsheets read the accents. */
export const toCsv = (rows) => new Blob(['\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });

const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);
const icsTime = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const fold = (line) => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };
/** One calendar event per option: events [{option, title, descr, place, url}] */
export function toIcs(events) {
  const now = icsTime(new Date().toISOString());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SavSchedules//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    const o = e.option;
    lines.push('BEGIN:VEVENT', `UID:${o.id}-${e.uid || 'x'}@savschedules`, `DTSTAMP:${now}`);
    if (o.day) { const d = o.day.replace(/-/g, ''); const n = new Date(o.day + 'T00:00:00Z'); n.setUTCDate(n.getUTCDate() + 1); lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${n.toISOString().slice(0, 10).replace(/-/g, '')}`); } else lines.push(`DTSTART:${icsTime(o.start)}`, `DTEND:${icsTime(o.end || new Date(Date.parse(o.start) + 3600e3).toISOString())}`);
    lines.push(`SUMMARY:${icsText(e.title + (o.label ? ' · ' + o.label : ''))}`);
    if (e.descr || e.url) lines.push(`DESCRIPTION:${icsText([e.descr, e.url].filter(Boolean).join('\n\n'))}`);
    if (e.place) lines.push(`LOCATION:${icsText(e.place)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return new Blob([lines.map(fold).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
}
