/**
 * Files: .savspr (the format of SavSpreadsheets), Excel (.xlsx and the older .xls), OpenDocument (.ods), CSV and TSV
 * (one sheet), HTML. Reading always gives {title, settings, sheets}; writing gets a bundle {title, settings, sheets,
 * value(sheet, key), text(sheet, r, c)} with the values computed.
 *
 * .savspr: a ZIP with "mimetype" (application/vnd.savspreadsheets.workbook+zip) stored first, and workbook.json
 * ({format: "savspr", version: 1, title, settings, sheets}).
 */
import { zip, unzip, text } from './zip.js';
import { cleanBook, colName, key, extent } from './model.js';
import { LOCALES } from './format.js';
import { cellFrom, machine } from './tools.js';
import { t } from './i18n.js';

export const MIME = 'application/vnd.savspreadsheets.workbook+zip';
export const TYPES = { savspr: MIME, xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', ods: 'application/vnd.oasis.opendocument.spreadsheet', csv: 'text/csv', tsv: 'text/tab-separated-values', html: 'text/html' };
export const ACCEPT = '.savspr,.xlsx,.xlsm,.xls,.ods,.csv,.tsv,.txt';
export const fileName = (title, ext) => (title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 100) || 'spreadsheet') + '.' + ext;

/** Inside the Android app: the file goes to the app in pieces, then the system asks where to keep it. */
export const inApp = () => /SavSpreadsheetsApp\/Android/.test(navigator.userAgent) && !!window.SavSpreadsheetsAndroid?.saveFile;
async function saveInApp(blob, name) {
  const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  window.SavSpreadsheetsAndroid.saveBegin(name, blob.type || 'application/octet-stream');
  for (let i = 0; i < b64.length; i += 524288) window.SavSpreadsheetsAndroid.saveFile(b64.slice(i, i + 524288));
  window.SavSpreadsheetsAndroid.saveEnd();
}
export function download(blob, name) {
  if (inApp()) return void saveInApp(blob, name);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
const bad = () => Object.assign(new Error('file_invalid'), { code: 'file_invalid' });
const baseName = (n) => n.replace(/\.[^.]+$/, '').slice(0, 160) || t('untitled');

// ------------------------------------------------------------------ reading

export async function readFile(file) {
  if (file.size > 60e6) throw Object.assign(new Error('file_big'), { code: 'file_big' });
  const buf = new Uint8Array(await file.arrayBuffer()), name = file.name || '', ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] || '').toLowerCase();
  let book;
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const files = await unzip(buf), get = async (n) => (files.has(n) ? text(await files.get(n)()) : null);
    const mime = (await get('mimetype'))?.trim();
    if (files.has('workbook.json')) book = readSavspr(JSON.parse(await get('workbook.json')));
    else if (files.has('xl/workbook.xml')) book = await (await import('./xlsx.js')).readXlsx(files);
    else if (files.has('content.xml') && (!mime || /spreadsheet/.test(mime))) book = await (await import('./ods.js')).readOds(files);
    else throw bad();
  } else if (buf[0] === 0xd0 && buf[1] === 0xcf) book = await (await import('./xls.js')).readXls(buf);
  else if (['csv', 'tsv', 'txt', ''].includes(ext) || !/[\x00-\x08]/.test(new TextDecoder().decode(buf.slice(0, 2000)))) book = readCsv(buf, ext);
  else throw bad();
  const clean = cleanBook(book);
  return { title: book.title || baseName(name), settings: clean.settings, sheets: clean.sheets };
}
function readSavspr(j) {
  if (!j || j.format !== 'savspr' || !Array.isArray(j.sheets)) throw bad();
  return { title: String(j.title || '').slice(0, 160), settings: j.settings, sheets: j.sheets };
}
/** Bytes of a text file: UTF-8, or the old Windows encoding when it is not UTF-8. */
function decode(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return new TextDecoder().decode(buf.subarray(3));
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }
}
/** Rows of a delimited text (quotes, doubled quotes, new lines inside quotes). */
export function parseDelimited(s, d) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"' && cur === '') { q = true; continue; }
    if (ch === d) { row.push(cur); cur = ''; continue; }
    if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; continue; }
    cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function readCsv(buf, ext) {
  const s = decode(buf), head = s.slice(0, 5000);
  // the separator: the one that splits the first lines the same way
  const d = ext === 'tsv' ? '\t' : ['\t', ';', ',', '|'].map((x) => [x, head.split(/\r?\n/).slice(0, 5).map((l) => l.split(x).length)]).filter(([, n]) => n[0] > 1).sort((a, b) => (new Set(a[1]).size - new Set(b[1]).size) || b[1][0] - a[1][0])[0]?.[0] || ',';
  // ";" is used where "," is the decimal separator: numbers are read that way first
  const langs = d === ';' ? [LOCALES.it, LOCALES.en] : [LOCALES.en, LOCALES.it];
  const rows = parseDelimited(s, d), cells = {};
  if (rows.length > 100000) throw Object.assign(new Error('file_big'), { code: 'file_big' });
  rows.forEach((r, i) => r.slice(0, 702).forEach((v, j) => { if (v === '') return; const c = cellFrom(v[0] === '=' ? "'" + v : v, langs, 'EUR'); if (c) cells[key(i + 1, j + 1)] = c; }));
  return { settings: { lang: 'en' }, sheets: [{ name: 'Sheet1', cells }] };
}

// ------------------------------------------------------------------ writing

export async function write(kind, b, sh) {
  if (kind === 'savspr') return new Blob([await zip([['mimetype', MIME, { store: true }], ['workbook.json', JSON.stringify({ format: 'savspr', version: 1, title: b.title, settings: b.settings, sheets: b.sheets })]])], { type: MIME });
  if (kind === 'xlsx') return (await import('./xlsx.js')).writeXlsx(b);
  if (kind === 'ods') return (await import('./ods.js')).writeOds(b);
  if (kind === 'xls') return (await import('./xls.js')).writeXls(b);
  if (kind === 'csv' || kind === 'tsv') return new Blob(['﻿' + delimited(b, sh, kind === 'csv' ? ',' : '\t')], { type: TYPES[kind] + ';charset=utf-8' });
  if (kind === 'html') { const { sheetTable } = await import('./print.js'); return new Blob([html(b, sheetTable)], { type: 'text/html' }); }
  throw new Error('kind');
}
/** One sheet as CSV or TSV: numbers as any program reads them, dates as shown. */
function delimited(b, sh, d) {
  const ext = extent(sh), out = [];
  for (let r = 1; r <= ext.r; r++) {
    const row = [];
    for (let c = 1; c <= ext.c; c++) {
      const k = key(r, c), v = b.value(sh, k), nf = sh.cells[k]?.s?.nf || sh.cols[colName(c)]?.s?.nf || '';
      let s = typeof v === 'number' && /[dmyhs]/i.test(nf.replace(/"[^"]*"/g, '')) ? b.text(sh, r, c) : machine(v);
      if (s.includes(d) || /["\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      row.push(s);
    }
    out.push(row.join(d));
  }
  return out.join('\r\n') + '\r\n';
}
function html(b, sheetTable) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return `<!doctype html><html lang="${esc(b.settings.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(b.title)}</title><meta name="generator" content="SavSpreadsheets">
<style>body{font:14px/1.4 Inter,system-ui,sans-serif;margin:24px;color:#1c1c1c}h1{font-size:22px}h2{font-size:16px;margin:28px 0 8px}table{border-collapse:collapse;table-layout:fixed}td{border:1px solid #dde3d6;padding:2px 6px;overflow:hidden}.nogrid td{border-color:transparent}.pchart{margin:16px 0}</style></head>
<body><h1>${esc(b.title)}</h1>${b.sheets.filter((s) => !s.hidden).map((s) => `<h2>${esc(s.name)}</h2>${sheetTable(b, s)}`).join('\n')}</body></html>`;
}
