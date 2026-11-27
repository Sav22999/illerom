/** The API, and the state of the app. */
import { getLang } from './i18n.js';

/**
 * user: the account (the same of SavSchedules, SavCalendar, SavNotes, SavPodcasts…) · prefs: settings of SavReads ·
 * counts: how many articles in each place, and the tags · subs: the feeds followed
 */
export const S = { user: null, csrf: '', config: {}, prefs: null, counts: { unread: 0, starred: 0, archive: 0, highlights: 0, pending: 0, tags: [] }, subs: [], offline: false };

export async function api(r, body, query = {}) {
  const q = Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
  const headers = { 'X-Lang': getLang() };
  if (body) { headers['Content-Type'] = 'application/json'; if (S.csrf) headers['X-CSRF-Token'] = S.csrf; }
  let res, d;
  try { res = await fetch(`api/?r=${r}${q}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', keepalive: !!body && JSON.stringify(body).length < 60000 }); } catch { throw Object.assign(new Error('network'), { code: 'network' }); }
  S.offline = res.headers.get('X-SavOffice-Offline') === '1';
  try { d = await res.json(); } catch { throw Object.assign(new Error('server'), { code: 'server' }); }
  if (!res.ok || (d.ok === false && d.error !== 'needs_signup')) throw Object.assign(new Error(d.error), { code: d.error || 'server', status: res.status, data: d });
  if (d.csrf) S.csrf = d.csrf;
  return d;
}

/** The counts of the places and the feeds, as an answer of the API gives them: the side follows (event rd-counts). */
export function setCounts(r) {
  if (r?.counts) S.counts = r.counts;
  if (r?.subs) S.subs = r.subs;
  if (r?.counts || r?.subs) dispatchEvent(new CustomEvent('rd-counts'));
}

/** Minutes an article takes at the reading speed of the settings. */
export const minutes = (words) => Math.max(0, Math.round((words || 0) / (S.prefs?.wpm || 230)));
