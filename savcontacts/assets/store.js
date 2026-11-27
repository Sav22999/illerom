/** The API, and the state of the app. */
import { getLang } from './i18n.js';

/**
 * user: the account (the same of SavSchedules, SavCalendar, SavTasks, SavMail…) · prefs: settings of SavContacts ·
 * contacts: every contact of the account (without photos: con.photo) · groups: its groups · trash: how many in the trash
 */
export const S = { user: null, csrf: '', config: {}, prefs: {}, contacts: [], groups: [], trash: 0, ready: false, pendingFile: null };

export async function api(r, body, query = {}) {
  const q = Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
  const headers = { 'X-Lang': getLang() };
  if (body) { headers['Content-Type'] = 'application/json'; if (S.csrf) headers['X-CSRF-Token'] = S.csrf; }
  let res, d;
  try { res = await fetch(`api/?r=${r}${q}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' }); } catch { throw Object.assign(new Error('network'), { code: 'network' }); }
  try { d = await res.json(); } catch { throw Object.assign(new Error('server'), { code: res.status === 413 ? 'file_big' : 'server' }); }
  if (!res.ok || (d.ok === false && d.error !== 'needs_signup')) throw Object.assign(new Error(d.error), { code: d.error || 'server', status: res.status, data: d });
  if (d.csrf) S.csrf = d.csrf;
  return d;
}

/** Everything the app shows: settings, groups, contacts. */
export async function loadAll() {
  const r = await api('con.init');
  S.prefs = r.prefs && !Array.isArray(r.prefs) ? r.prefs : {};
  S.groups = r.groups.map((g) => ({ id: g.gid, name: g.name, color: g.color }));
  S.contacts = r.contacts;
  S.trash = r.trash;
  S.ready = true;
  return S;
}
export const setGroups = (list) => { S.groups = list.map((g) => ({ id: g.gid, name: g.name, color: g.color })); };

export const contact = (id) => S.contacts.find((c) => c.id === id) || null;
/** A contact changed (the server sends it back): it takes the place of the old one, or comes first. */
export function putContact(c) {
  const i = S.contacts.findIndex((x) => x.id === c.id);
  if (i >= 0) S.contacts[i] = c; else S.contacts.push(c);
  return c;
}
export const group = (id) => S.groups.find((g) => g.id === id) || null;
export const photoUrl = (c) => (c?.photo ? `api/?r=con.photo&id=${c.id}&v=${c.photo}` : null);
