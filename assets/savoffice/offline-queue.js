/*
 * SavOffice — the changes made without a network, in the apps that save many small changes (a task, an event):
 * each one waits in this browser (offline-keep.js, keys "<app>:q:…", in order) and leaves when the network is back.
 *
 *   const Q = offlineQueue('savtasks', { send, routes, local, done });
 *   Q.api(r, body)   instead of the app's own api() for the routes listed: with the network (and nothing waiting) the
 *                    change goes as always; without it, local(r, body) does it on the state of the app and answers as
 *                    the server would ({…, offline: true}), and the change waits. Anything else goes to send().
 *   Q.replay()       after the data of the app is read (from the server, or kept by the service worker while offline):
 *                    the changes still waiting are done again on it with local(), so the screen shows them.
 *   Q.sync()         sends what waits (by itself when the network comes back, at the start and every 30 s).
 *
 * New things made offline get a temporary id from local() (tmp(), "o" + letters): its answer gives { _tmp: id };
 * when the server answers with the real id (answer.task.id, answer.list.id, answer.event.id…), the changes after it that
 * name the temporary id are sent with the real one. A change the server refuses (not found any more, not allowed) is
 * dropped and counted; done(stats) runs after a sync that sent something, so the app can read everything again.
 */
import { keep, drop, all } from './offline-keep.js';

let n = 0, preset = null;
/** A temporary id for something made offline (the same one again when a waiting change is done again: replay()). */
export const tmp = () => { if (preset) { const v = preset; preset = null; return v; } return 'o' + Math.random().toString(36).slice(2, 11).padEnd(9, '0'); };

export function offlineQueue(app, { send, routes, local, done }) {
  let syncing = null;
  const waiting = async () => (await all(app)).filter((x) => x.k?.startsWith('q:')).sort((a, b) => (a.k < b.k ? -1 : 1));
  const mapOf = async () => (await all(app)).find((x) => x.k === 'map')?.ids || {};
  const swap = (body, ids) => { let s = JSON.stringify(body ?? null); for (const [t, real] of Object.entries(ids)) s = s.split(`"${t}"`).join(`"${real}"`); return JSON.parse(s); };
  const realId = (res) => { for (const k of ['task', 'list', 'event', 'calendar', 'form', 'group', 'expense', 'item']) if (res?.[k]?.id) return res[k].id; return res?.id || null; };

  async function api(r, body, query) {
    if (!routes.includes(r) || !body) return send(r, body, query);
    if (!(await waiting()).length) {
      try { return await send(r, body, query); } catch (e) { if (e.code !== 'network') throw e; }
    }
    const res = local(r, body);
    if (!res) throw Object.assign(new Error('network'), { code: 'network' }); // this change cannot be made offline
    const k = 'q:' + String(Date.now()).padStart(14, '0') + ':' + String(n++).padStart(4, '0');
    await keep(app, k, { k, r, body, tmp: res._tmp || null });
    later(1500);
    return { ...res, offline: true };
  }
  async function replay() {
    const ids = await mapOf();
    for (const op of await waiting()) { preset = op.tmp && !ids[op.tmp] ? op.tmp : null; try { local(op.r, swap(op.body, ids)); } catch { /* the state moved on */ } preset = null; }
  }
  function sync() {
    if (syncing) return syncing;
    syncing = (async () => {
      const ops = await waiting();
      if (!ops.length) return;
      const ids = await mapOf();
      let sent = 0, refused = 0;
      for (const op of ops) {
        try {
          const res = await send(op.r, swap(op.body, ids));
          if (op.tmp && realId(res)) { ids[op.tmp] = realId(res); await keep(app, 'map', { k: 'map', ids }); }
          sent++;
        } catch (e) {
          if (e.code === 'network' || e.code === 'rate_limited' || (e.status || 0) >= 500) break; // later
          refused++; // the server does not take it (gone, not allowed): it would never go
        }
        await drop(app, op.k);
      }
      if (!(await waiting()).length) await drop(app, 'map');
      if (sent || refused) done?.({ sent, refused });
    })().finally(() => { syncing = null; });
    return syncing;
  }
  let timer = 0;
  const later = (ms) => { clearTimeout(timer); timer = setTimeout(() => { if (navigator.onLine !== false) sync(); }, ms); };
  addEventListener('online', () => later(800));
  setInterval(() => { if (navigator.onLine !== false) sync(); }, 30000);
  later(2000);
  return { api, replay, sync, waiting };
}
