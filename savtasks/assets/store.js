/** The API, and the state of the app. */
import { getLang } from './i18n.js';
import { offlineQueue, tmp } from '../../assets/savoffice/offline-queue.js';

/**
 * user: the account (the same of SavSchedules and SavCalendar) · prefs: settings of SavTasks · lists · tasks ·
 * schedules: what SavSchedules asks of the account (read-only) · linked: the events and polls made from tasks ·
 * timer: the timer that runs (one per account, kept on the server) · timeTotals: the seconds tracked on each task
 */
export const S = { user: null, csrf: '', config: {}, prefs: {}, lists: [], tasks: [], schedules: [], timer: null, timeTotals: {}, linked: { events: {}, schedules: {} }, schedulesUrl: '../savschedules/', calendarUrl: '../savcalendar/', ready: false };

/** The API as it is (the network): changes made offline go through the queue below first. */
async function send(r, body, query = {}) {
  const q = Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
  const headers = { 'X-Lang': getLang() };
  if (body) { headers['Content-Type'] = 'application/json'; if (S.csrf) headers['X-CSRF-Token'] = S.csrf; }
  let res, d;
  try { res = await fetch(`api/?r=${r}${q}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' }); } catch { throw Object.assign(new Error('network'), { code: 'network' }); }
  try { d = await res.json(); } catch { throw Object.assign(new Error('server'), { code: 'server' }); }
  if (!res.ok || (d.ok === false && d.error !== 'needs_signup')) throw Object.assign(new Error(d.error), { code: d.error || 'server', status: res.status, data: d });
  if (d.csrf) S.csrf = d.csrf;
  return d;
}

// ---------------------------------------------------------------- without a network (../assets/savoffice/offline-queue.js)
// Tasks and lists change here at once and the changes wait in this browser until the network is back; what is read
// meanwhile comes from the service worker (offline-sw.js). Each change is done on the state below as the server does
// it (the server has the last word when it arrives: then everything is read again).
const now = () => new Date().toISOString();
const FIELDS = ['title', 'notes', 'checklist', 'tags', 'priority', 'starred', 'col', 'start', 'due', 'time', 'remind', 'rrule', 'tz'];
function local(r, b) {
  const x = b.id ? taskById(b.id) : null;
  switch (r) {
    case 'tasks.task.save': {
      if (b.id && !x) return null;
      const y = x ? { ...x } : { id: tmp(), list: b.list || inbox()?.id, title: '', notes: '', checklist: [], tags: [], priority: 0, starred: false, col: null, position: b.end ? 1e9 : -1, start: null, due: null, time: null, dueAt: null, tz: b.tz || null, remind: null, reminded: null, rrule: '', log: [], done: null, calEvent: null, schedule: null, created: now() };
      for (const k of FIELDS) if (k in b) y[k] = b[k];
      y.updated = now();
      keep(y);
      return { ok: true, task: y, _tmp: x ? null : y.id };
    }
    case 'tasks.task.done': { if (!x) return null; const y = { ...x, done: b.done === false ? null : now(), updated: now() }; keep(y); return { ok: true, task: y, next: null }; }
    case 'tasks.task.delete': drop(b.id); return { ok: true };
    case 'tasks.task.move': { if (!x) return null; const y = { ...x, list: b.list || x.list, col: b.col ?? x.col, updated: now() }; keep(y); return { ok: true, task: y, next: null }; }
    case 'tasks.task.order': { (b.ids || []).forEach((id, i) => { const y = taskById(id); if (y) y.position = (i + 1) * 10; }); return { ok: true }; }
    case 'tasks.list.save': {
      const l = b.id ? listById(b.id) : null;
      if (b.id && !l) return null;
      const m = l ? { ...l } : { id: tmp(), name: '', color: '#0b7a87', icon: 'list', view: 'list', columns: [], inbox: false, archived: false };
      for (const k of ['name', 'color', 'icon', 'view', 'columns', 'archived']) if (k in b) m[k] = b[k];
      if (l) Object.assign(l, m); else S.lists.push(m);
      return { ok: true, list: m, _tmp: l ? null : m.id };
    }
    case 'tasks.list.order': { const at = new Map((b.ids || []).map((id, i) => [id, i])); S.lists.sort((p, q) => (at.get(p.id) ?? 1e9) - (at.get(q.id) ?? 1e9)); return { ok: true }; }
    case 'tasks.prefs': return { ok: true };
  }
  return null;
}
const Q = offlineQueue('savtasks', {
  send, local,
  routes: ['tasks.task.save', 'tasks.task.done', 'tasks.task.delete', 'tasks.task.move', 'tasks.task.order', 'tasks.list.save', 'tasks.list.order', 'tasks.prefs'],
  // what waited has left: the server has the last word (repetitions, positions, real ids)
  done: () => dispatchEvent(new CustomEvent('savoffice-synced')),
});
export const api = (r, body, query) => Q.api(r, body, query);
/** After the lists and the tasks are read: the changes still waiting are done again on them (the screen shows them). */
export const replayOffline = () => Q.replay();
if (window.SavOffice) window.SavOffice.offlineEdit = true;

export const listById = (id) => S.lists.find((l) => l.id === id);
export const taskById = (id) => S.tasks.find((x) => x.id === id);
export const inbox = () => S.lists.find((l) => l.inbox) || S.lists[0];

/** Everything again from the server. */
export async function loadAll() {
  const r = await api('tasks.all');
  S.lists = r.lists;
  S.tasks = r.tasks;
  S.schedules = r.schedules || [];
  S.timer = r.timer || null;
  S.timeTotals = r.timeTotals && !Array.isArray(r.timeTotals) ? r.timeTotals : {};
  S.linked = { events: r.linked?.events || {}, schedules: r.linked?.schedules || {} };
  await Q.replay();
  S.ready = true;
}

/** A task changed on the server: the copy here follows (a new one is added). */
export function keep(task) {
  if (!task) return;
  const i = S.tasks.findIndex((x) => x.id === task.id);
  if (i >= 0) S.tasks[i] = task; else S.tasks.push(task);
}
export const drop = (id) => { S.tasks = S.tasks.filter((x) => x.id !== id); };
