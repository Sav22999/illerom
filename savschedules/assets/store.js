/** The API, and what this browser remembers (the private keys of the answers given without an account). */
import { getLang } from './i18n.js';

export const S = { user: null, csrf: '', config: {} };

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

/** Private keys of the answers given here: { pid: key }. They are also in the email of the answer and in its link. */
const KEYS = 'savschedules-keys';
export const keys = {
  all() { try { return JSON.parse(localStorage.getItem(KEYS) || '{}') || {}; } catch { return {}; } },
  get: (pid) => keys.all()[pid] || '',
  set(pid, key) { const a = keys.all(); if (key) a[pid] = key; else delete a[pid]; try { localStorage.setItem(KEYS, JSON.stringify(a)); } catch { /* private mode */ } },
};
/** The name and email typed in the last answer, offered again in the next one. */
export const guest = {
  get() { try { return JSON.parse(localStorage.getItem('savschedules-guest') || '{}') || {}; } catch { return {}; } },
  set(v) { try { localStorage.setItem('savschedules-guest', JSON.stringify(v)); } catch { /* private mode */ } },
};
