/*
 * SavOffice — what an app keeps in this browser while it cannot save: a copy of the notebook, the board or the changes
 * that did not leave (no network), so that a page closed or reloaded offline loses nothing. The app sends it at the
 * next opening and then drops it. IndexedDB "savoffice-offline", one store, keys "<app>:<key>"; emptied at sign-out
 * by the service worker (offline-sw.js).
 *
 *   import { keep, take, drop } from '../../assets/savoffice/offline-keep.js';
 *   keep('savnotes', id, value) · take('savnotes', id) → value or null · drop('savnotes', id) · all('savtasks') → [values]
 */
const DB = 'savoffice-offline', STORE = 'kept';
let open = null;
function db() {
  open ||= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => { open = null; reject(r.error); };
  });
  return open;
}
async function run(mode, fn) {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result ?? null);
      tx.onerror = () => reject(tx.error);
    });
  } catch { return null; } // a private window without IndexedDB: nothing kept, the app works as before
}
export const keep = (app, key, value) => run('readwrite', (s) => s.put({ ...value, keptAt: new Date().toISOString() }, `${app}:${key}`));
export const take = (app, key) => run('readonly', (s) => s.get(`${app}:${key}`));
export const drop = (app, key) => run('readwrite', (s) => s.delete(`${app}:${key}`));
export const all = (app) => run('readonly', (s) => s.getAll(IDBKeyRange.bound(app + ':', app + ':￿'))).then((x) => x || []);
