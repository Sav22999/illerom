/** The API, and the state of the app. */
import { getLang } from './i18n.js';

/**
 * user: the account (the same of SavSchedules and the other apps) · vault: 'empty' | 'locked' | 'open' (lib/vault.php)
 * accounts: the mailboxes (no passwords: they never leave the server) · prefs: the look of the app · unlock: ways to open
 * the vault on a new device · oauth: whether Outlook can sign in here · folders: the folders of each address (id → {list, special, err})
 */
export const S = { user: null, csrf: '', config: {}, vault: null, accounts: [], folders: {}, prefs: null, unlock: {}, oauth: false, presets: null };

export async function api(r, body, query = {}) {
  const q = Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
  const headers = { 'X-Lang': getLang() };
  if (body) { headers['Content-Type'] = 'application/json'; if (S.csrf) headers['X-CSRF-Token'] = S.csrf; }
  let res, d;
  try { res = await fetch(`api/?r=${r}${q}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', credentials: 'same-origin' }); } catch { throw Object.assign(new Error('network'), { code: 'network' }); }
  try { d = await res.json(); } catch { throw Object.assign(new Error('server'), { code: res.status === 413 ? 'message_big' : 'server' }); }
  if (!res.ok || (d.ok === false && d.error !== 'needs_signup')) throw Object.assign(new Error(d.error), { code: d.error || 'server', status: res.status, data: d });
  if (d.csrf) S.csrf = d.csrf;
  return d;
}

/** The state of the vault, as the API gives it (ml.state and the calls that change it). */
export function takeState(d) {
  S.vault = d.state;
  S.accounts = d.accounts || [];
  for (const id of Object.keys(S.folders)) if (!S.accounts.some((a) => a.id === id)) delete S.folders[id];
  S.prefs = d.prefs && !Array.isArray(d.prefs) ? d.prefs : {};
  S.unlock = d.unlock || {};
  S.oauth = !!d.oauth;
  return d;
}
