/** The state of the app and the calls to the API. */
import { getLang } from './i18n.js';

export const S = { user: null, csrf: '', config: {}, meta: null };

export async function api(route, body, query = {}) {
  const qs = new URLSearchParams({ r: route, ...Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== false)) });
  const opt = { method: body ? 'POST' : 'GET', headers: { 'X-Lang': getLang() }, credentials: 'same-origin' };
  if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); if (S.csrf) opt.headers['X-CSRF-Token'] = S.csrf; }
  let r;
  try { r = await fetch('api/?' + qs, opt); } catch { throw Object.assign(new Error('network'), { code: 'network' }); }
  let d = null;
  try { d = await r.json(); } catch { /* not JSON */ }
  if (!d) throw Object.assign(new Error('server'), { code: r.status === 503 ? 'not_installed' : 'server' });
  if (d.ok === false && !['needs_signup', 'link_needed'].includes(d.error)) throw Object.assign(new Error(d.error), { code: d.error, data: d });
  return d;
}

export const role = () => S.user?.role || 0;
export const isMod = () => role() >= 3;
export const isAdmin = () => role() >= 5;
export const isMaster = () => role() >= 10;
/** Reloaded after the staff changes categories, criteria or editions. */
export async function loadMeta() { S.meta = await api('pub.meta'); return S.meta; }
