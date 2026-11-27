/**
 * Files: in, a vCard (.vcf: 2.1, 3.0, 4.0, one contact or many), a CSV of Google or Outlook, or a .savcon (the format of
 * SavContacts, with groups and photos) — read on the server (lib/vcard.php); out, the same formats for all the contacts,
 * the selected ones or a group.
 */
import { dialog, fail, h, toast } from './ui.js';
import { getLang, t } from './i18n.js';
import { S, api, group, loadAll } from './store.js';
import { redraw } from './contacts.js';

export const MIME = 'application/vnd.savcontacts.contacts+json';
const ACCEPT = '.vcf,.vcard,.csv,.savcon,text/vcard,text/x-vcard,text/csv,' + MIME;

/** A file as text for the API: UTF-8 as it is; UTF-16 (Outlook) or old Windows text travel as base64, decoded there. */
async function payload(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const utf16 = (buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff);
  if (!utf16) { try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf) }; } catch { /* not UTF-8 */ } }
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { text: btoa(bin), base64: true };
}

export async function importFile(file) {
  if (file.size > 8000000) throw Object.assign(new Error(), { code: 'file_big' });
  const ext = (/\.([a-z]+)$/i.exec(file.name || '')?.[1] || '').toLowerCase();
  const format = { vcf: 'vcf', vcard: 'vcf', csv: 'csv', savcon: 'savcon' }[ext] || 'auto';
  const t0 = toast(file.name + ' …', 'neutral', { duration: 0, closable: false });
  try {
    const r = await api('con.import', { format, ...(await payload(file)) });
    await loadAll();
    redraw();
    toast(t('imported', { a: r.added, u: r.updated }) + (r.skipped ? ' · ' + t('imported_skip', { s: r.skipped }) : ''), 'success', { duration: 6000 });
    return r;
  } finally { t0?.remove(); }
}

export function importDialog() {
  const i = document.createElement('input');
  i.type = 'file';
  i.accept = ACCEPT;
  i.onchange = () => { const f = i.files?.[0]; if (f) importFile(f).catch(fail); };
  i.click();
}

/** A file opened with the installed app or from SavDrive, once signed in. */
export function openPending() {
  const f = S.pendingFile;
  S.pendingFile = null;
  if (f) importFile(f).catch(fail);
}

/** o: {ids, group, one}: what to export (the selected ones, a group, one contact); otherwise everything. */
export function exportDialog(o = {}) {
  const n = S.contacts.length;
  const scopes = [];
  if (o.one) scopes.push(['one', o.one]);
  else if (o.ids?.length) scopes.push(['sel', t('exp_sel', { n: o.ids.length })]);
  if (o.group) scopes.push(['group', t('exp_group', { g: group(o.group)?.name || '', n: S.contacts.filter((c) => c.groups.includes(o.group)).length })]);
  scopes.push(['all', t('exp_all', { n: n.toLocaleString(getLang()) })]);
  let scope = scopes[0][0], fmt = 'vcf3';
  const sc = h('sav-radio-group', { label: t('export_t'), value: scope }, scopes.map(([v, l]) => h('sav-radio', { value: v }, l)));
  sc.addEventListener('change', () => { scope = sc.value; });
  const fm = h('sav-radio-group', { value: fmt, 'aria-label': t('export') }, ['vcf3', 'vcf4', 'csv', 'outlook', 'savcon'].map((f) => h('sav-radio', { value: f }, t('fmt_' + f))));
  fm.addEventListener('change', () => { fmt = fm.value; });
  dialog({ title: t('export'), width: '30rem', body: h('div.form', scopes.length > 1 ? sc : h('p.muted', scopes[0][1]), fm), actions: [{ label: t('cancel') }, { label: t('download'), primary: true, run: () => {
    const name = scope === 'one' ? o.one : scope === 'group' ? group(o.group)?.name : 'contacts';
    const q = new URLSearchParams({ r: 'con.export', fmt, name: name || 'contacts' });
    if (scope === 'sel' || scope === 'one') q.set('ids', o.ids.join(','));
    if (scope === 'group') q.set('group', o.group);
    const a = document.createElement('a');
    a.href = 'api/?' + q;
    a.download = '';
    document.body.append(a);
    a.click();
    a.remove();
  } }] });
}
