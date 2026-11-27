/** The account and the API; uploads travel in pieces (4 MB), so files of any size fit under the limits of PHP. */
import { getLang } from './i18n.js';

export const S = { user: null, csrf: '', config: {} };

export async function api(r, body, query = {}) {
  const q = Object.entries(query).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
  const headers = { 'X-Lang': getLang() };
  if (body) { headers['Content-Type'] = 'application/json'; headers['X-CSRF-Token'] = S.csrf; }
  let res, d;
  try {
    res = await fetch(`api/?r=${r}${q}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  } catch {
    throw Object.assign(new Error('network'), { code: 'network' });
  }
  try { d = await res.json(); } catch { throw Object.assign(new Error('server'), { code: 'server' }); }
  if (!res.ok || (d.ok === false && d.error !== 'needs_signup')) throw Object.assign(new Error(d.error), { code: d.error || 'server', status: res.status, data: d });
  if (d.csrf) S.csrf = d.csrf;
  return d;
}

/** The address of a file of the account: to download it, or (inline) to show it in the page. */
export const fileUrl = (id, inline = false) => `api/?r=file.get&id=${encodeURIComponent(id)}${inline ? '&inline=1' : ''}`;
export const pubUrl = (tok, inline = false) => `api/?r=pub.get&t=${encodeURIComponent(tok)}${inline ? '&inline=1' : ''}`;

/**
 * Sends one file. onProgress(bytes sent). signal: an AbortSignal (the upload is cancelled on the server too).
 * Returns {item, used, quota}.
 */
export async function upload(file, folder, { onProgress, signal, name } = {}) {
  const start = await api('upload.start', { name: name || file.name, size: file.size, mime: file.type, folder: folder || null });
  if (start.done) return start;
  const id = start.upload, size = start.chunk || S.config.chunk || 4194304;
  let offset = 0, tries = 0;
  const cancel = () => api('upload.cancel', { id }).catch(() => {});
  try {
    while (offset < file.size) {
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { code: 'aborted', silent: true });
      const piece = file.slice(offset, Math.min(file.size, offset + size));
      let res, d;
      try {
        res = await fetch(`api/?r=upload.chunk&id=${id}&offset=${offset}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-CSRF-Token': S.csrf, 'X-Lang': getLang() }, body: piece, signal, cache: 'no-store' });
        d = await res.json();
      } catch (e) {
        if (signal?.aborted) throw Object.assign(new Error('aborted'), { code: 'aborted', silent: true });
        // a moment without connection: the same piece again, a few times
        if (++tries > 5) throw Object.assign(new Error('network'), { code: 'network' });
        await new Promise((r) => setTimeout(r, 1000 * tries));
        continue;
      }
      if (d.error === 'offset') { offset = d.received; continue; } // the server already has more (or less) than we thought
      if (!res.ok || d.ok === false) throw Object.assign(new Error(d.error), { code: d.error || 'server', status: res.status, data: d });
      tries = 0;
      if (d.done) { onProgress?.(file.size); return d; }
      offset = d.received;
      onProgress?.(offset);
    }
    throw Object.assign(new Error('server'), { code: 'server' });
  } catch (e) {
    cancel();
    throw e;
  }
}
