/** The API, and the state of the app. */
import { getLang } from './i18n.js';

/**
 * user: the account (the same of SavSchedules, SavCalendar and SavTasks) · prefs: settings of SavForms · forms: the forms
 * of the account (without their questions) · the addresses of the other apps
 */
export const S = { user: null, csrf: '', config: {}, prefs: {}, forms: [], calendarUrl: '../savcalendar/', schedulesUrl: '../savschedules/', appUrl: '', ready: false };

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

/** The forms of the account again from the server. */
export async function loadForms() {
  const r = await api('forms.list');
  S.forms = r.forms;
  S.ready = true;
}
/** A form changed on the server: the copy in the list follows (a new one goes first). */
export function keep(f) {
  if (!f) return;
  const brief = { ...f };
  delete brief.items; delete brief.settings; delete brief.theme; delete brief.descr;
  const i = S.forms.findIndex((x) => x.id === f.id);
  if (i >= 0) S.forms[i] = { ...S.forms[i], ...brief }; else S.forms.unshift(brief);
}
export const drop = (id) => { S.forms = S.forms.filter((x) => x.id !== id); };
/** The public address of a form (the link to share). */
export const formLink = (id) => (S.appUrl || new URL('./', location.href.split('#')[0]).href) + '#/f/' + id;
