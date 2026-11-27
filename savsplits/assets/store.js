/** The API, and the state of the app. */
import { getLang } from './i18n.js';
import { todayKey } from './time.js';

/**
 * user: the account (the same of SavSchedules, SavCalendar, SavTasks…) · prefs: settings of SavSplits · groups: the
 * groups of the account, for the home · G: the group open now, as the server sends it (splits.group), with `src`: how it
 * is reached ({id} for an account, {code, as} for its link)
 */
export const S = { user: null, csrf: '', config: {}, prefs: {}, groups: [], G: null, ready: false };

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

// ------------------------------------------------------------------ the group open now

/** The person a guest of a link said they are (kept in this browser, one per link). */
export const guestKey = (code) => 'savsplits-as-' + code;
export const guestAs = (code) => { try { return localStorage.getItem(guestKey(code)) || ''; } catch { return ''; } };
export const setGuestAs = (code, mid) => { try { if (mid) localStorage.setItem(guestKey(code), mid); else localStorage.removeItem(guestKey(code)); } catch { /* private mode */ } };

/** How the open group is reached, added to every request about it. */
export const src = () => (S.G?.src?.code ? { code: S.G.src.code, as: guestAs(S.G.src.code) || undefined } : { id: S.G?.src?.id });

/** Opens a group (by its id or its link): the copies of the repeated expenses whose day has come are made by the server. */
export async function loadGroup(where) {
  const d = await api('splits.group', undefined, { ...where, today: todayKey() });
  S.G = { ...d, src: where };
  return S.G;
}

/** A change about the open group: the server answers with the whole group again, which replaces the copy here. */
export async function groupCall(r, body = {}) {
  const d = await api(r, { ...src(), today: todayKey(), ...body });
  if (d.group) S.G = { ...d, src: S.G.src };
  return d;
}

/** The address of a photo of the open group (the same access as the group: the account, or the link). */
export const photoUrl = (pid, dl) => `api/?r=splits.photo&p=${pid}&` + (S.G?.src?.code ? 'code=' + S.G.src.code : 'id=' + S.G?.group.id) + (dl ? '&dl=1' : '');

/** A photo for the expense being written: the body is the image itself (at most 5 MB, checked here and by the server). */
export async function uploadPhoto(file) {
  if (!/^image\//.test(file.type || '') && !/\.(jpe?g|png|webp|gif|heic)$/i.test(file.name || '')) throw Object.assign(new Error(), { code: 'photo_type' });
  if (file.size > 5 * 1048576) throw Object.assign(new Error(), { code: 'photo_big' });
  const headers = { 'Content-Type': file.type || 'application/octet-stream', 'X-Lang': getLang() };
  if (S.csrf) headers['X-CSRF-Token'] = S.csrf;
  const where = S.G.src.code ? 'code=' + S.G.src.code : 'id=' + S.G.group.id;
  let res, d;
  try { res = await fetch(`api/?r=splits.photo.upload&${where}`, { method: 'POST', headers, body: file, cache: 'no-store' }); } catch { throw Object.assign(new Error('network'), { code: 'network' }); }
  try { d = await res.json(); } catch { throw Object.assign(new Error('server'), { code: res.status === 413 ? 'photo_big' : 'server' }); }
  if (!res.ok || d.ok === false) throw Object.assign(new Error(d.error), { code: d.error || 'server' });
  return d.photo;
}

export const member = (id) => S.G?.members.find((m) => m.id === id);
export const memberName = (id) => member(id)?.name ?? '?';
/** The person of this account (or the one a guest chose). */
export const meId = () => S.G?.me || (S.G?.src?.code ? guestAs(S.G.src.code) : '') || '';
export const canWrite = () => !!S.G && S.G.role !== 'viewer';

export async function loadGroups() {
  const r = await api('splits.groups');
  S.groups = r.groups;
  S.ready = true;
  return S.groups;
}
