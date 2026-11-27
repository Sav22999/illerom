/**
 * Files. .savtas is the format of SavTasks: one list, whole (name, colour, icon, list, board or Gantt, its columns, every task
 * with its checklist, labels, due day, repetition and reminder, the done ones too), opened again as a new list exactly
 * as it was. The other formats: .csv for spreadsheets (the columns most apps read), .md as a checklist of Markdown
 * (- [ ] / - [x]), and lines of text (pasted, or a .txt/.md file) that become tasks.
 *
 * .savtas: a ZIP with `mimetype` (application/vnd.savtasks.list+zip, stored first) and list.json
 *   {format: "savtas", version: 1, app, exported, name, color, icon, view, columns: [{id, name, done}],
 *    tasks: [{title, notes, checklist: [{t, d}], tags, priority, starred, col, start, due, time, tz, remind, rrule, log, done}]}
 *   (log: the days a habit was done)
 */
import { zip, unzip, text } from './zip.js';
import { S, api, listById } from './store.js';
import { dialog, fail, h, toast } from './ui.js';
import { t } from './i18n.js';
import { go, prefs } from './account.js';

export const SAVTAS = 'application/vnd.savtasks.list+zip';
const tz = () => prefs().tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export const fileName = (title, ext) => (String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 100) || 'tasks') + '.' + ext;
/** Inside the Android app: the file goes to the app in pieces, then the system asks where to keep it. */
export const inApp = () => /SavTasksApp\/Android/.test(navigator.userAgent) && !!window.SavTasksAndroid?.saveFile;
async function saveInApp(blob, name) {
  // the pieces end at a multiple of 4 characters, so each one can be decoded alone
  const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  window.SavTasksAndroid.saveBegin(name, blob.type || 'application/octet-stream');
  for (let i = 0; i < b64.length; i += 524288) window.SavTasksAndroid.saveFile(b64.slice(i, i + 524288));
  window.SavTasksAndroid.saveEnd();
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
const whole = (id) => api('tasks.list.export', undefined, { id });

export async function saveSavtas(id) {
  try {
    const { list: l, tasks } = await whole(id);
    const json = { format: 'savtas', version: 1, app: 'SavTasks', exported: new Date().toISOString(), name: l.name, color: l.color, icon: l.icon, view: l.view, columns: l.columns,
      tasks: tasks.map(({ title, notes, checklist, tags, priority, starred, col, start, due, time, tz: z, remind, rrule, log, done }) => ({ title, notes, checklist, tags, priority, starred, col, start, due, time, tz: z, remind, rrule, log, done })) };
    download(await zip([['mimetype', SAVTAS, { store: true }], ['list.json', JSON.stringify(json, null, 1)]], SAVTAS), fileName(l.name, 'savtas'));
  } catch (e) { fail(e); }
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",;\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };
export async function saveCsv(id) {
  try {
    const { list: l, tasks } = await whole(id);
    const col = (k) => l.columns.find((c) => c.id === k)?.name || '';
    const rows = [['Title', 'Notes', 'Start date', 'Due date', 'Due time', 'Priority', 'Starred', 'Labels', 'Checklist', 'Repeat', 'Column', 'Completed', 'List']];
    for (const x of tasks) rows.push([x.title, x.notes, x.start || '', x.due || '', x.time || '', ['', 'low', 'medium', 'high'][x.priority], x.starred ? 'yes' : '', x.tags.join(', '), x.checklist.map((c) => (c.d ? '[x] ' : '[ ] ') + c.t).join(' | '), x.rrule, l.view === 'board' ? col(x.col) : '', x.done ? x.done.slice(0, 10) : '', l.name]);
    download(new Blob(['﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }), fileName(l.name, 'csv'));
  } catch (e) { fail(e); }
}

export async function saveMd(id) {
  try {
    const { list: l, tasks } = await whole(id);
    const line = (x) => `- [${x.done ? 'x' : ' '}] ${x.title}${x.due ? ' (' + (x.start ? x.start + ' → ' : '') + x.due + (x.time ? ' ' + x.time : '') + ')' : ''}${x.tags.length ? ' ' + x.tags.map((g) => '#' + g).join(' ') : ''}` + x.checklist.map((c) => `\n  - [${c.d ? 'x' : ' '}] ${c.t}`).join('');
    let md = `# ${l.name}\n\n`;
    if (l.view === 'board') for (const c of l.columns) { const list = tasks.filter((x) => x.col === c.id); if (list.length) md += `## ${c.name}\n\n${list.map(line).join('\n')}\n\n`; }
    else md += tasks.map(line).join('\n') + '\n';
    download(new Blob([md], { type: 'text/markdown;charset=utf-8' }), fileName(l.name, 'md'));
  } catch (e) { fail(e); }
}

/** Lines of text as tasks: "- [ ] buy bread", "* milk", "1. call Anna", "[x] done"; indented lines are subtasks. */
export function linesToTasks(s) {
  const out = [];
  for (const raw of String(s).replace(/\r/g, '').split('\n')) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const sub = /^(\s{2,}|\t)/.test(raw) && out.length;
    const m = /^\s*(?:[-*+•]|\d+[.)])?\s*(?:\[( |x|X)\])?\s*(.+)$/.exec(raw);
    if (!m) continue;
    const title = m[2].trim().slice(0, 255), done = /x/i.test(m[1] || '');
    if (sub) out[out.length - 1].checklist.push({ t: title.slice(0, 200), d: done });
    else out.push({ title, done: done ? new Date().toISOString() : null, checklist: [] });
    if (out.length >= 1000) break;
  }
  return out;
}

/** Paste lines (or open a .txt/.md) into a list. */
export function pasteDialog(l, ctx) {
  const area = h('sav-textarea', { label: t('paste_label'), rows: 8, placeholder: t('paste_ph') });
  area.addEventListener('keydown', (e) => e.stopPropagation());
  dialog({ title: t('paste_lines'), width: '30rem', body: h('div.form', h('p.muted', t('paste_t', { l: l.name })), area), actions: [{ label: t('cancel') }, { label: t('add'), primary: true, run: async () => {
    const lines = linesToTasks(area.value);
    if (!lines.length) throw bad('nothing_chosen');
    const r = await api('tasks.import', { id: l.id, lines, tz: tz() });
    toast(t('imported_n', { n: r.added }), 'success');
    await ctx.refresh();
  } }] });
}

/** What tasks.import needs from a file: {savtas} for a .savtas, {lines} for text. */
export async function readTasksFile(file) {
  if (file.size > 6e6) throw bad('file_big');
  const buf = await file.arrayBuffer(), head = new Uint8Array(buf.slice(0, 2));
  if (head[0] === 0x50 && head[1] === 0x4b) {
    let json;
    try { const files = await unzip(buf, { maxFiles: 20, maxBytes: 30e6 }); const f = files.get('list.json'); if (!f) throw 0; json = JSON.parse(text(await f())); } catch { throw bad('file_invalid'); }
    if (json?.format !== 'savtas' || !Array.isArray(json.tasks)) throw bad('file_invalid');
    return { savtas: json, name: json.name };
  }
  const s = text(new Uint8Array(buf)).replace(/^﻿/, '');
  if (/^\s*\{/.test(s)) { try { const json = JSON.parse(s); if (json?.format === 'savtas') return { savtas: json, name: json.name }; } catch { /* not JSON */ } throw bad('file_invalid'); }
  const lines = linesToTasks(s);
  if (!lines.length) throw bad('file_invalid');
  return { lines, name: file.name.replace(/\.(txt|md|markdown)$/i, '') };
}

/** A file becomes a new list (a .savtas exactly as it was; text: one task per line). */
export async function importFile(file) {
  const r0 = await readTasksFile(file);
  const r = await api('tasks.import', { ...r0, tz: tz() });
  S.lists.push(r.list);
  toast(t('opened_list', { l: r.list.name, n: r.added }), 'success');
  go('#/l/' + r.list.id);
  return r;
}

export function openFileDialog() {
  const input = h('input', { type: 'file', accept: '.savtas,.md,.txt,.markdown,application/zip,text/plain,text/markdown', hidden: true });
  input.addEventListener('change', async () => { const f = input.files?.[0]; input.remove(); if (!f) return; try { await importFile(f); } catch (e) { fail(e); } });
  document.body.append(input);
  input.click();
}

/** A .savtas opened from the device (double click, "Open with"): it becomes a new list. */
export async function openPending() {
  const f = S.pendingFile;
  if (!f) return;
  S.pendingFile = null;
  try { await importFile(f); } catch (e) { fail(e); }
}
export { listById };
