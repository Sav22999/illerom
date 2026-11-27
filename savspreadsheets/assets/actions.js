/** Small actions shared by the home and the grid: roles, choosing files, opening them. */
import { fail, h, toast } from './ui.js';
import { t } from './i18n.js';
import { keep } from './store.js';
import { ACCEPT, readFile } from './files.js';
import { uniqueName } from './model.js';

const RANK = ['viewer', 'commenter', 'editor', 'owner'];
export const can = (role, min) => RANK.indexOf(role) >= RANK.indexOf(min);

export const pickFile = (accept, multiple) => new Promise((res) => {
  const i = h('input', { type: 'file', accept, multiple });
  i.addEventListener('change', () => res([...i.files]));
  i.addEventListener('cancel', () => res([]));
  i.click();
});

/** A file of the device becomes a new workbook. */
export async function openFile(file, folder) {
  const note = toast(t('importing'), 'neutral', { duration: 0 });
  try { location.hash = '#/d/' + (await keep(await readFile(file), { folder })); } catch (e) { fail(e); } finally { note.remove(); }
}
export async function importFile(folder) {
  const [f] = await pickFile(ACCEPT);
  if (f) await openFile(f, folder);
}
/** The sheets of a file added to the workbook that is open. */
export async function importInto(W) {
  const [f] = await pickFile(ACCEPT);
  if (!f) return;
  const note = toast(t('importing'), 'neutral', { duration: 0 });
  try {
    const b = await readFile(f), { newId } = await import('./model.js'), ops = [];
    let after = W.book.sheets.at(-1).id;
    for (const s of b.sheets) { const id = newId(); ops.push({ t: 'addsheet', id, after, sheet: { ...s, id, name: uniqueName({ sheets: [...W.book.sheets, ...ops.map((o) => o.sheet)] }, s.name) } }); after = id; }
    W.change(ops);
    toast(t('imported_sheets', { n: ops.length }), 'success');
  } catch (e) { fail(e); } finally { note.remove(); }
}
