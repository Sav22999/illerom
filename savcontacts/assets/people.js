/** A contact as people read it: its name in the chosen order, the key of its letter, its avatar, its labels, its next birthday. */
import { h, hue } from './ui.js';
import { getLang, has, t } from './i18n.js';
import { S, photoUrl } from './store.js';
import { prefs } from './account.js';

export const LABELS = { emails: ['home', 'work', 'other'], phones: ['mobile', 'home', 'work', 'main', 'fax', 'pager', 'other'], addresses: ['home', 'work', 'other'], urls: ['home', 'work', 'other'] };
export const labelText = (l) => (has('l_' + l) ? t('l_' + l) : l);

/** Letters without accents, lowercase: "Lucrèzia" is found by "lucre". */
export const fold = (s) => String(s || '').normalize('NFD').replace(/\p{Mn}+/gu, '').toLowerCase();

const join = (...p) => p.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
/** The name as the settings want it ("Mario Rossi" or "Rossi Mario"), else the nickname, the company, an email, a phone. */
export function fullName(c) {
  const n = prefs().show === 'last' && c.last ? join(c.last, c.first, c.middle) : join(c.prefix, c.first, c.middle, c.last, c.suffix);
  return n || c.nickname || c.company || c.emails?.[0]?.value || c.phones?.[0]?.value || '?';
}
/** The name with the part it is sorted by in bold. */
export function nameNode(c) {
  const byLast = prefs().sort === 'last', show = prefs().show === 'last';
  if (!c.first && !c.last) return h('span', fullName(c));
  const f = join(c.first, c.middle), l = c.last;
  const parts = show ? [l, f] : [f, l];
  const strong = byLast ? l : f;
  return h('span', parts.filter(Boolean).map((p, i) => [i ? ' ' : '', p === strong ? h('b', p) : p]));
}
export function sortKey(c) {
  const byLast = prefs().sort === 'last';
  const k = byLast ? join(c.last, c.first, c.middle) || fullName(c) : join(c.first, c.middle, c.last) || fullName(c);
  return fold(k);
}
export const letterOf = (c) => { const ch = sortKey(c).replace(/^[^\p{L}\p{N}]+/u, '')[0] || '#'; return /\p{L}/u.test(ch) ? ch.toUpperCase() : '#'; };
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
export const sortContacts = (list) => list.slice().sort((a, b) => collator.compare(sortKey(a), sortKey(b)));

/** What a row shows under the name: the role and company, else the first email or phone. */
export const subline = (c) => join(c.title, c.title && c.company ? '·' : '', c.company) || c.emails?.[0]?.value || c.phones?.[0]?.value || '';

export function avatar(c, size = 38) {
  const name = fullName(c), initials = join(c.first, c.last) || name;
  const a = h('sav-avatar.cav', { label: initials, title: name, style: `--size:${size}px;--sav-avatar-size:${size}px;background:hsl(${hue(name)} 42% 42%);color:#fff;border-radius:50%` });
  const url = photoUrl(c);
  if (url) a.setAttribute('image', url);
  return a;
}

/** Everything a contact holds, as one text without accents: for the quick search. */
export const haystack = (c) => fold([fullName(c), c.first, c.last, c.middle, c.nickname, c.company, c.department, c.title, c.notes,
  ...c.emails.map((e) => e.value), ...c.phones.map((p) => p.value + ' ' + p.value.replace(/\D+/g, '')), ...c.addresses.map((a) => `${a.street} ${a.city} ${a.region} ${a.code} ${a.country}`),
  ...c.urls.map((u) => u.value), ...c.groups.map((g) => S.groups.find((x) => x.id === g)?.name || '')].join(' '));

// ---------------------------------------------------------------- birthdays

/** The next birthday from today: {date, days, age} (age null when the year is not known), or null. */
export function nextBirthday(c, from = new Date()) {
  const b = c.birthday;
  if (!b) return null;
  const m = +b.slice(-5, -3), d = +b.slice(-2);
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let y = today.getFullYear();
  const at = (yy) => { const last = new Date(yy, m, 0).getDate(); return new Date(yy, m - 1, Math.min(d, last)); };
  let date = at(y);
  if (date < today) date = at(++y);
  const days = Math.round((date - today) / 86400000);
  const born = b[0] === '-' ? null : +b.slice(0, 4);
  return { date, days, age: born ? y - born : null };
}
export const birthdayText = (c) => {
  const b = c.birthday;
  if (!b) return '';
  const m = +b.slice(-5, -3), d = +b.slice(-2);
  const date = new Date(b[0] === '-' ? 2000 : +b.slice(0, 4), m - 1, d);
  return date.toLocaleDateString(getLang(), b[0] === '-' ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
};
export const daysText = (n) => (n === 0 ? t('today_b') : n === 1 ? t('tomorrow') : n < 60 ? t('in_days', { n }) : '');
