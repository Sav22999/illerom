/** The API, and the state of the app. */
import { getLang } from './i18n.js';

/**
 * user: the account (the same of SavSchedules, SavCalendar, SavNotes…) · prefs: settings of SavPodcasts · subs: the
 * podcasts followed · queue: the episodes to play next · catalog: the open catalogue in use (fyyd | podcastindex)
 */
export const S = { user: null, csrf: '', config: {}, prefs: null, subs: [], queue: [], catalog: 'fyyd', pending: 0 };

export async function api(r, body, query = {}) {
  const q = Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
  const headers = { 'X-Lang': getLang() };
  if (body) { headers['Content-Type'] = 'application/json'; if (S.csrf) headers['X-CSRF-Token'] = S.csrf; }
  let res, d;
  try { res = await fetch(`api/?r=${r}${q}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', keepalive: !!body && JSON.stringify(body).length < 60000 }); } catch { throw Object.assign(new Error('network'), { code: 'network' }); }
  try { d = await res.json(); } catch { throw Object.assign(new Error('server'), { code: 'server' }); }
  if (!res.ok || (d.ok === false && d.error !== 'needs_signup')) throw Object.assign(new Error(d.error), { code: d.error || 'server', status: res.status, data: d });
  if (d.csrf) S.csrf = d.csrf;
  return d;
}

/** An episode known to the app, by id: lists keep it fresh (position, played, starred) when the player moves. */
export const EPS = new Map();
export const keep = (list) => { for (const e of list || []) { const old = EPS.get(e.id); EPS.set(e.id, old ? Object.assign(old, e) : e); } return (list || []).map((e) => EPS.get(e.id)); };
