/** The API, and the state of the app. */
import { getLang } from './i18n.js';

/**
 * user: the account (the same of SavSchedules and SavCalendar) · prefs: settings of SavTasks · lists · tasks ·
 * schedules: what SavSchedules asks of the account (read-only) · linked: the events and polls made from tasks
 */
export const S = { user: null, csrf: '', config: {}, prefs: {}, lists: [], tasks: [], schedules: [], linked: { events: {}, schedules: {} }, schedulesUrl: '../savschedules/', calendarUrl: '../savcalendar/', ready: false };

export async function api(r, body, query = {}) {
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

export const listById = (id) => S.lists.find((l) => l.id === id);
export const taskById = (id) => S.tasks.find((x) => x.id === id);
export const inbox = () => S.lists.find((l) => l.inbox) || S.lists[0];

/** Everything again from the server. */
export async function loadAll() {
  const r = await api('tasks.all');
  S.lists = r.lists;
  S.tasks = r.tasks;
  S.schedules = r.schedules || [];
  S.linked = { events: r.linked?.events || {}, schedules: r.linked?.schedules || {} };
  S.ready = true;
}

/** A task changed on the server: the copy here follows (a new one is added). */
export function keep(task) {
  if (!task) return;
  const i = S.tasks.findIndex((x) => x.id === task.id);
  if (i >= 0) S.tasks[i] = task; else S.tasks.push(task);
}
export const drop = (id) => { S.tasks = S.tasks.filter((x) => x.id !== id); };
