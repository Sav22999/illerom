/** Days. An expense happens on a day (YYYY-MM-DD) of the person who writes it: days never move with time zones. */
import { getLang, t } from './i18n.js';

const pad = (n) => String(n).padStart(2, '0');
const locale = () => (getLang() === 'it' ? 'it-IT' : 'en-GB');
const fmts = new Map();
const fmt = (o) => { const k = JSON.stringify(o) + getLang(); if (!fmts.has(k)) fmts.set(k, new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', ...o })); return fmts.get(k); };
const at = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };

/** Today here, as YYYY-MM-DD. */
export const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const addDays = (k, n) => { const x = at(k); x.setUTCDate(x.getUTCDate() + n); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };
export const dayLabel = (k, o = { day: 'numeric', month: 'short' }) => fmt(o).format(at(k));
export const longDay = (k) => fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(at(k));
export const monthKey = (k) => k.slice(0, 7);
export const monthLabel = (mk, short = false) => fmt(short ? { month: 'short', year: '2-digit' } : { month: 'long', year: 'numeric' }).format(at(mk + '-01'));

/** The head of a day in the list of expenses: "Today", "Yesterday", "Monday 24 November", with the year when not this one. */
export function dayHead(k) {
  const today = todayKey();
  if (k === today) return t('today');
  if (k === addDays(today, -1)) return t('yesterday');
  return fmt({ weekday: 'long', day: 'numeric', month: 'long', year: k.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' }).format(at(k));
}
