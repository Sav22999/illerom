/**
 * Reading without a connection. The service worker keeps every answer of the API to a GET (../assets/savoffice/offline-sw.js)
 * and the pictures of the articles (sw.js): here the newest articles to read are asked for once, quietly, with their
 * pictures, so that they open later without a connection. Only on this device; at sign-out the copies are deleted.
 */
import { S } from './store.js';
import { prefs } from './account.js';

const KEY = 'savreads-kept';
const kept = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };

/** items: the list of articles to read just shown. */
export async function keepOffline(items) {
  const p = prefs();
  if (p.offline === false || !('serviceWorker' in navigator) || !navigator.serviceWorker.controller || navigator.connection?.saveData) return;
  const want = items.filter((a) => a.status === 'ready' && !a.archived).slice(0, Math.max(5, Math.min(100, p.offlineN || 30)));
  const k = kept(), now = Date.now(), todo = want.filter((a) => !k[a.id] || now - k[a.id] > 7 * 86400000);
  const next = {};
  for (const a of want) if (k[a.id]) next[a.id] = k[a.id];
  const one = async (a) => {
    try {
      const r = await fetch(`api/?r=rd.get&id=${a.id}`, { cache: 'no-store', headers: { 'X-Lang': document.documentElement.lang || 'en' } });
      if (!r.ok) return;
      const d = await r.json();
      if (p.images !== false) {
        const pics = [d.article.cover, ...[...String(d.article.content || '').matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))].filter(Boolean).slice(0, 12);
        await Promise.allSettled(pics.map((u) => fetch(u, { credentials: 'same-origin' })));
      }
      next[a.id] = now;
    } catch { /* the next time */ }
  };
  // three at a time, when the page is idle
  for (let i = 0; i < todo.length; i += 3) {
    if (S.offline || document.hidden) break;
    await new Promise((res) => (window.requestIdleCallback || setTimeout)(res, { timeout: 2000 }));
    await Promise.all(todo.slice(i, i + 3).map(one));
  }
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
}

export const keptCount = () => Object.keys(kept()).length;
export const forgetKept = () => { try { localStorage.removeItem(KEY); } catch { /* private mode */ } };
