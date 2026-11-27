/** The API, and the state of the app. */
import { getLang } from './i18n.js';
import { offlineQueue, tmp } from '../../assets/savoffice/offline-queue.js';

/** user: the account (the same of SavSchedules) · cal: settings of the calendar · calendars · schedulesUrl · tasksUrl · feed */
export const S = { user: null, csrf: '', config: {}, cal: {}, calendars: [], schedulesUrl: '../savschedules/', tasksUrl: '../savtasks/', formsUrl: '../savforms/', feed: null };

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
// An event made, changed or deleted offline waits in this browser and leaves when the network is back; the weeks read
// meanwhile (cal.events, kept by the service worker) show it already. A repeating event is changed only with the network
// (its occurrences are worked out by the server).
const series = (b) => !!(b.rrule || b.scope || b.occurrence || b.recurId);
function local(r, b) {
  if (r === 'cal.prefs') return { ok: true };
  if (r === 'cal.event.delete') return b.scope && b.scope !== 'all' ? null : { ok: true };
  if (r === 'cal.event.save') {
    if (series(b)) return null;
    const e = { descr: '', place: '', url: '', allDay: false, tz: null, rrule: '', exdates: [], recurId: null, status: 'confirmed', busy: true, color: null, readOnly: false, why: null, ...b, id: b.id || tmp() };
    return { ok: true, event: e, _tmp: b.id ? null : e.id };
  }
  return null;
}
const Q = offlineQueue('savcalendar', {
  send, local, routes: ['cal.event.save', 'cal.event.delete', 'cal.prefs'],
  done: () => dispatchEvent(new CustomEvent('savoffice-synced')),
});
/** The weeks read from the server, with what is still waiting to leave from this browser. */
async function withWaiting(d) {
  const ops = await Q.waiting();
  if (!ops.length || !Array.isArray(d?.events)) return d;
  let events = d.events.slice();
  for (const op of ops) {
    const b = op.body || {};
    if (op.r === 'cal.event.delete') events = events.filter((e) => e.id !== b.id);
    else if (op.r === 'cal.event.save') {
      const e = local(op.r, op.tmp && !b.id ? { ...b, id: op.tmp } : b)?.event;
      if (!e) continue;
      const i = events.findIndex((x) => x.id === e.id);
      if (i >= 0) events[i] = { ...events[i], ...e }; else events.push(e);
    }
  }
  return { ...d, events };
}
export async function api(r, body, query) {
  const d = await Q.api(r, body, query);
  return r === 'cal.events' ? withWaiting(d) : d;
}
if (window.SavOffice) window.SavOffice.offlineEdit = true;

export const calById = (id) => S.calendars.find((c) => c.id === id);

/**
 * A task of SavTasks ticked (or not) from the calendar: through the API of SavTasks itself (same origin, same session and
 * the same CSRF token), so a repeating task plans the next one as it does there. A session older than the shared cookie
 * of SavTasks is handed over by SavSchedules first.
 */
export async function taskDone(tid, done) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const send = () => fetch(S.tasksUrl + 'api/?r=tasks.task.done', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': S.csrf }, body: JSON.stringify({ id: tid, done, tz }), cache: 'no-store' });
  let r = await send().catch(() => null);
  if (r?.status === 401) { await fetch('../savschedules/api/?r=auth.me', { cache: 'no-store' }).catch(() => null); r = await send().catch(() => null); }
  if (!r) throw Object.assign(new Error('network'), { code: 'network' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw Object.assign(new Error(d.error || 'server'), { code: d.error || 'server' });
  return d;
}
