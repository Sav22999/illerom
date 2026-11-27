/**
 * Files: .savspl (the format of SavSplits: a group, its people and its expenses, as JSON) and .csv (for spreadsheets).
 * Opening a .savspl makes a new group of the account, with the same people and expenses.
 */
import { fail, toast } from './ui.js';
import { t } from './i18n.js';
import { S, api } from './store.js';
import { go } from './account.js';
import { dec } from './money.js';

export const MIME = 'application/vnd.savsplits.group+json';
const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); };
const safe = (s) => (s || 'group').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'group';

/** The group as a .savspl: {format: "savspl", version: 1, group, members, expenses}; the people keep their codes as keys. */
export function savsplOf(G) {
  const g = G.group;
  return {
    format: 'savspl', version: 1, app: 'SavSplits', exported: new Date().toISOString(),
    group: { name: g.name, kind: g.kind, icon: g.icon, color: g.color, currency: g.currency, notes: g.notes, tables: g.tables },
    members: G.members.map((m) => ({ id: m.id, name: m.name, weight: m.weight, quotas: m.quotas, pay: m.pay, active: m.active })),
    expenses: G.expenses.slice().reverse().map((e) => ({ kind: e.kind, title: e.title, category: e.category, day: e.day, amount: e.amount, currency: e.currency, rate: e.rate, payers: e.payers, split: e.split, notes: e.notes, repeat: e.repeat, repeatNext: e.repeatNext, by: e.by })),
  };
}
export const saveSavspl = (G) => download(new Blob([JSON.stringify(savsplOf(G), null, 1)], { type: MIME }), safe(G.group.name) + '.savspl');

/** One row per expense, then what each person paid and owes in it (in the currency of the group). */
export function saveCsv(G) {
  const cur = G.group.currency, num = (minor, c = cur) => ((minor || 0) / 10 ** dec(c)).toFixed(dec(c));
  const cell = (v) => { const s = String(v ?? ''); return /[",\n\r;]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };
  const people = G.members;
  const head = [t('day'), t('what'), t('category'), t('kind'), t('amount'), t('currency'), t('rate'), `${t('amount')} (${cur})`, t('paid_by_l'), ...people.map((m) => `${m.name} (${cur})`)];
  const rows = G.expenses.slice().reverse().map((e) => [e.day, e.title, e.category ? t('cat_' + e.category) : '', t('k_' + e.kind), num(e.amount, e.currency), e.currency, e.currency === cur ? '' : e.rate, num(e.base),
    Object.entries(e.payers).map(([id, v]) => (people.find((m) => m.id === id)?.name || '?') + (Object.keys(e.payers).length > 1 ? ' ' + num(v, e.currency) : '')).join(' + '),
    ...people.map((m) => (e.paid[m.id] !== undefined || e.alloc[m.id] !== undefined ? num((+e.paid[m.id] || 0) - (+e.alloc[m.id] || 0)) : ''))]);
  rows.push([], [t('balances'), '', '', '', '', '', '', '', '', ...people.map((m) => num(G.balance[m.id]))]);
  download(new Blob(['﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), safe(G.group.name) + '.csv');
}

/** A .savspl file becomes a new group of the account. */
export async function openFile(file) {
  if (file.size > 6000000) throw Object.assign(new Error(), { code: 'file_big' });
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw Object.assign(new Error(), { code: 'file_invalid' }); }
  if (data?.format !== 'savspl') throw Object.assign(new Error(), { code: 'file_invalid' });
  const r = await api('splits.import', { data });
  toast(t('opened_group', { n: r.group.name, x: r.expenses.length }), 'success');
  go('#/g/' + r.group.id + '/people');
}

export function openFileDialog() {
  const i = document.createElement('input');
  i.type = 'file';
  i.accept = '.savspl,' + MIME + ',application/json';
  i.onchange = () => { const f = i.files?.[0]; if (f) openFile(f).catch(fail); };
  i.click();
}

/** A file opened with the installed app or from SavDrive, once signed in. */
export function openPending() {
  const f = S.pendingFile;
  S.pendingFile = null;
  if (f) openFile(f).catch(fail);
}
