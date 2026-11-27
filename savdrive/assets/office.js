/**
 * The files of SavOffice inside SavDrive: an empty one of each kind is made here, in the format of its app (the same
 * ZIP its app writes with "Download"), and kept in the drive like any other file. "Open in …" opens the app with
 * ?savdrive=<id>: the app reads the file from ../savdrive/api/?r=file.get (same site, the cookie of SavDrive) and opens
 * it as it opens a file chosen on the device; the cloud next to the grid of the apps saves it back into the same file
 * (see assets/savoffice/savoffice.js).
 */
import { zip } from './zip.js';

const id = () => Math.random().toString(36).slice(2, 10);

/** ext => {app, name, mime, blank(title)}: the kinds SavDrive can create, in the order of the menu. */
export const KINDS = {
  savdoc: { app: 'savdocuments', name: 'SavDocuments', k: 'k_doc', mime: 'application/vnd.savdocuments.document+zip', file: 'document.json',
    blank: (title) => ({ format: 'savdoc', version: 1, title, settings: {}, blocks: [{ id: id(), h: '<p><br></p>' }] }) },
  savspr: { app: 'savspreadsheets', name: 'SavSpreadsheets', k: 'k_spr', mime: 'application/vnd.savspreadsheets.workbook+zip', file: 'workbook.json',
    blank: (title) => ({ format: 'savspr', version: 1, title, settings: {}, sheets: [{ name: 'Sheet1' }] }) },
  savpre: { app: 'savpresentations', name: 'SavPresentations', k: 'k_pre', mime: 'application/vnd.savpresentations', file: 'deck.json',
    blank: (title) => ({ app: 'SavPresentations', version: 1, title, meta: {}, slides: [{ sid: id(), pos: 1, d: { els: {} } }], media: {} }) },
  savboo: { app: 'savbooks', name: 'SavBooks', k: 'k_boo', mime: 'application/vnd.savbooks.book+zip', file: 'book.json',
    blank: (title) => ({ format: 'savboo', version: 1, title, settings: {}, blocks: [{ id: id(), h: '<p><br></p>' }] }) },
  savwhi: { app: 'savwhiteboard', name: 'SavWhiteboard', k: 'k_whi', mime: 'application/vnd.savwhiteboard.board+zip', file: 'board.json',
    blank: (title) => ({ format: 'savwhi', version: 1, app: 'SavWhiteboard', exported: new Date().toISOString(), title, settings: {}, items: [] }) },
  savnot: { app: 'savnotes', name: 'SavNotes', k: 'k_not', mime: 'application/vnd.savnotes.notebook+zip', file: 'notebook.json',
    blank: (title) => ({ format: 'savnot', version: 1, app: 'SavNotes', exported: new Date().toISOString(), title, settings: {}, sheets: [{ id: id(), items: [] }] }) },
};

/** The app of a file name (any kind of SavOffice, also the ones SavDrive cannot create), or null. */
export const APPS = { savdoc: 'savdocuments', savspr: 'savspreadsheets', savpre: 'savpresentations', savboo: 'savbooks', savwhi: 'savwhiteboard', savnot: 'savnotes', savfor: 'savforms', savtas: 'savtasks', savcal: 'savcalendar', savsch: 'savschedules', savnew: 'savnewsletters', savspl: 'savsplits', savrea: 'savreads' };
export const NAMES = { savdocuments: 'SavDocuments', savspreadsheets: 'SavSpreadsheets', savpresentations: 'SavPresentations', savbooks: 'SavBooks', savwhiteboard: 'SavWhiteboard', savnotes: 'SavNotes', savforms: 'SavForms', savtasks: 'SavTasks', savcalendar: 'SavCalendar', savschedules: 'SavSchedules', savnewsletters: 'SavNewsletters', savsplits: 'SavSplits', savreads: 'SavReads' };
export const appOf = (name) => APPS[(/\.([a-z]+)$/i.exec(name || '')?.[1] || '').toLowerCase()] || null;

/** An empty file of this kind, ready to upload. */
export async function blankFile(ext, title) {
  const k = KINDS[ext];
  const blob = await zip([['mimetype', k.mime, { store: true }], [k.file, JSON.stringify(k.blank(title))]], k.mime);
  return new File([blob], `${title}.${ext}`, { type: k.mime });
}

/** Opens a file of the drive in its app, in a new tab (the drive stays where it is). */
export function openInApp(item) {
  const app = item.app || appOf(item.name);
  if (!app) return false;
  window.open(`../${app}/?savdrive=${encodeURIComponent(item.id)}`, '_blank', 'noopener');
  return true;
}
