/** The API, and the state of the app. */
import { getLang } from './i18n.js';

/** user: the account (the same of SavSchedules) · cal: settings of the calendar · calendars · schedulesUrl · tasksUrl · feed */
export const S = { user: null, csrf: '', config: {}, cal: {}, calendars: [], schedulesUrl: '../savschedules/', tasksUrl: '../savtasks/', formsUrl: '../savforms/', feed: null };

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
