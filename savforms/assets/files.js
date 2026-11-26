/**
 * Files. .savfor is the format of SavForms: one form, whole (questions with their pictures, look, settings, opening and
 * deadline), with its answers when asked, opened again as a new form exactly as it was (it starts closed: open it when
 * ready). The answers alone go out as CSV from the API (forms.csv), for spreadsheets.
 *
 * .savfor: a ZIP with `mimetype` (application/vnd.savforms.form+zip, stored first) and form.json
 *   {format: "savfor", version: 1, app, exported, title, descr, tz, theme, settings, items: [...], answers?: [{answers,
 *    name, email, score, maxScore, seconds, created, updated}]}
 */
import { zip, unzip, text } from './zip.js';
import { S, api, keep } from './store.js';
import { confirm, fail, h, toast } from './ui.js';
import { t } from './i18n.js';
import { go } from './account.js';
import { LOCAL_TZ } from './time.js';

export const SAVFOR = 'application/vnd.savforms.form+zip';
const MAX = 40e6;
export const fileName = (title, ext) => (String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 100) || 'form') + '.' + ext;
export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
const bad = (code) => Object.assign(new Error(code), { code });

export async function saveSavfor(id, withAnswers) {
  try {
    const { form: f } = await api('forms.export', undefined, { id, answers: withAnswers ? 1 : '' });
    const json = { format: 'savfor', version: 1, app: 'SavForms', exported: new Date().toISOString(), title: f.title, descr: f.descr, tz: f.tz, theme: f.theme, settings: f.settings, items: f.items, opens: f.opens, closes: f.closes };
    if (withAnswers) json.answers = f.answers || [];
    download(await zip([['mimetype', SAVFOR, { store: true }], ['form.json', JSON.stringify(json)]], SAVFOR), fileName(f.title, 'savfor'));
  } catch (e) { fail(e); }
}

/** A .savfor read from a file: its form.json, checked a little (the server cleans everything again). */
async function readSavfor(file) {
  if (file.size > MAX) throw bad('file_big');
  const files = await unzip(await file.arrayBuffer(), { maxFiles: 20, maxBytes: 120e6 }).catch(() => { throw bad('file_invalid'); });
  const get = files.get('form.json');
  if (!get) throw bad('file_invalid');
  let json;
  try { json = JSON.parse(text(await get())); } catch { throw bad('file_invalid'); }
  if (json?.format !== 'savfor' || !Array.isArray(json.items)) throw bad('file_invalid');
  return json;
}

export async function openFile(file) {
  try {
    const json = await readSavfor(file);
    let withAnswers = false;
    if (json.answers?.length) withAnswers = await confirm(t('open_file'), t('file_has_answers', { n: json.answers.length }), t('with_answers'), false);
    const r = await api('forms.import', { form: json, withAnswers, tz: LOCAL_TZ });
    keep(r.form);
    toast(r.answers ? t('opened_with_answers', { n: r.answers }) : t('file_opened'), 'success');
    go('#/e/' + r.form.id);
  } catch (e) { fail(e); }
}

export function openFileDialog() {
  const i = h('input', { type: 'file', accept: '.savfor,' + SAVFOR });
  i.addEventListener('change', () => { if (i.files[0]) openFile(i.files[0]); });
  i.click();
}

/** A file given to the installed app by the system (launchQueue). */
export function openPending() {
  const f = S.pendingFile;
  S.pendingFile = null;
  if (f) openFile(f);
}
