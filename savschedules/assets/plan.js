/** Kinds, colours, ready-made starts and the slot generator, shared by the home and the editor. */
import { addDays, LOCAL_TZ, mondayOf, todayKey, zoned, keyParts } from './time.js';

export const COLORS = { blue: '#1f56d1', violet: '#6a2cf0', green: '#0f8a63', coral: '#e0532f', amber: '#c27a06', pink: '#c2307a', teal: '#0b8494', slate: '#4a5875' };
export const KINDS = { poll: { icon: 'vote' }, slots: { icon: 'ticket' } };

export const BASE = { access: 'open', hidden: false, maybe: true, maxPer: 1, minPer: 0, deadline: null, notify: true, askEmail: 'optional', note: true, tz: LOCAL_TZ, color: 'blue', duration: 60, cap: 1 };

/** Slots in a range of days: every `len` minutes (plus `gap`) from `start` to `end`, on the chosen weekdays (0 = Monday). */
export function genSlots({ from, to, weekdays, start, end, len, gap = 0, cap = 1, label = '', tz }) {
  const out = [];
  if (!from || !to || len < 5) return out;
  for (let k = from, guard = 0; k <= to && guard < 400; k = addDays(k, 1), guard++) {
    const [y, m, d] = keyParts(k);
    const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
    if (weekdays && !weekdays.includes(wd)) continue;
    for (let a = start; a + len <= end; a += len + gap) {
      out.push({ start: new Date(zoned(y, m, d, Math.floor(a / 60), a % 60, tz)).toISOString(), end: new Date(zoned(y, m, d, Math.floor((a + len) / 60), (a + len) % 60, tz)).toISOString(), label, cap });
      if (out.length >= 400) return out;
    }
  }
  return out;
}

/** Ready-made starts: a kind, some rules and options around the coming days (all of it can be changed). */
export const PRESETS = {
  meeting: { kind: 'poll', icon: 'users', build(tz) { const mon = addDays(mondayOf(todayKey(tz)), 7); return { settings: { maybe: true, duration: 60 }, options: [0, 1, 2].flatMap((i) => [genSlots({ from: addDays(mon, i), to: addDays(mon, i), start: 600, end: 660, len: 60, tz }), genSlots({ from: addDays(mon, i), to: addDays(mon, i), start: 900, end: 960, len: 60, tz })]).flat() }; } },
  dinner: { kind: 'poll', icon: 'party-popper', build(tz) { const mon = addDays(mondayOf(todayKey(tz)), 7); return { settings: { maybe: true }, options: [4, 5, 11, 12].map((i) => ({ day: addDays(mon, i) })) }; } },
  office: { kind: 'slots', icon: 'clock', build(tz) { const mon = addDays(mondayOf(todayKey(tz)), 7); return { settings: { maxPer: 1, duration: 15 }, options: genSlots({ from: mon, to: addDays(mon, 4), weekdays: [1, 3], start: 840, end: 960, len: 15, tz }) }; } },
  interviews: { kind: 'slots', icon: 'message-square-text', build(tz) { const mon = addDays(mondayOf(todayKey(tz)), 7); return { settings: { maxPer: 1, askEmail: 'required', duration: 10 }, options: genSlots({ from: addDays(mon, 2), to: addDays(mon, 2), start: 900, end: 1080, len: 10, gap: 0, tz }) }; } },
  shifts: { kind: 'slots', icon: 'hand', build(tz) { const mon = addDays(mondayOf(todayKey(tz)), 7); return { settings: { maxPer: 0, duration: 240 }, options: genSlots({ from: addDays(mon, 5), to: addDays(mon, 6), start: 540, end: 1020, len: 240, cap: 3, tz }) }; } },
  visits: { kind: 'slots', icon: 'door-open', build(tz) { const mon = addDays(mondayOf(todayKey(tz)), 7); return { settings: { maxPer: 1, duration: 60 }, options: genSlots({ from: addDays(mon, 5), to: addDays(mon, 5), start: 600, end: 1080, len: 60, gap: 0, cap: 10, tz }) }; } },
};
