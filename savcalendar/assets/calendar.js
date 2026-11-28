/**
 * The calendar: day, week, month and agenda, with the calendars on the side. Times are shown in the zone of the settings
 * (the one of the device by default); whole days are dates and never move.
 *
 * What is shown: the events of the calendars that are switched on (own ones and subscriptions), what comes from
 * SavSchedules (polls and slots of the same account) and, when it is there, from SavNewsletters. Only the events of one's
 * own calendars can be changed: the others carry a lock, and opening them says why (see event.js).
 *
 * Choosing dates for SavSchedules: "Find a date" turns drawing on the grid into choosing options for a poll or a sheet
 * of slots; the tray at the bottom creates it (cal.sch.create) and opens it in SavSchedules.
 */
import { btn, dialog, drop, empty, fail, h, icon, iconBtn, mobile, primary, put, segmented, toast, errText } from './ui.js';
import { t, getLang } from './i18n.js';
import { S, api, calById } from './store.js';
import { brand, commands, credit, go, prefs, setPrefs, userMenu } from './account.js';
import { addDays, dayKey, keyParts, LOCAL_TZ, parts, todayKey, weekday, zoned, clock, hm, monthLabel, dayLabel, longDay } from './time.js';
import { expand } from './rrule.js';
import { sidebar, openFile } from './sources.js';
import { openItem, editEvent, quickCreate, moveEvent, deleteItem, scheduleDialog, searchDialog } from './event.js';
import { firstDay, shownDays, weekPanel } from './week.js';
export { firstDay, shownDays };

export const VIEWS = ['day', 'week', 'month', 'agenda'];
const HH = 48; // pixels of an hour in the day and week views
export const viewTz = () => prefs().tz || LOCAL_TZ;
const startOfDay = (k, tz = viewTz()) => { const [y, m, d] = keyParts(k); return zoned(y, m, d, 0, 0, tz); };
export const weekStart = (k) => addDays(k, -((weekday(k) - firstDay() + 7) % 7));
/** The days of the week that holds k, as shown (without the hidden ones). */
const weekDays = (k) => { const a = weekStart(k), on = new Set(shownDays()); return Array.from({ length: 7 }, (_, i) => addDays(a, i)).filter((d) => on.has(weekday(d))); };
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

/** The days a view shows: [first, last + 1) as date keys. */
export function rangeOf(view, k) {
  if (view === 'day') return [k, addDays(k, 1)];
  if (view === 'week') { const a = weekStart(k); return [a, addDays(a, 7)]; }
  if (view === 'month') { const [y, m] = keyParts(k); const a = weekStart(`${y}-${String(m).padStart(2, '0')}-01`); return [a, addDays(a, 42)]; }
  return [k, addDays(k, 30)];
}

// ------------------------------------------------------------------ data

const D = { from: 0, to: 0, events: [], schedules: [], newsletters: [], tasks: [], forms: [], birthdays: [], turn: 0 };
/** Asks the server for what may touch [a, b) (a margin of two days on each side). */
export async function load(a, b, force) {
  if (!force && a >= D.from && b <= D.to) return false;
  const n = ++D.turn, from = a - 2 * 864e5, to = b + 2 * 864e5;
  const r = await api('cal.events', undefined, { from: iso(from), to: iso(to) });
  if (n !== D.turn) return false;
  Object.assign(D, { from, to, events: r.events, schedules: r.schedules || [], newsletters: r.newsletters || [], tasks: r.tasks || [], forms: r.forms || [], birthdays: r.birthdays || [] });
  return true;
}
export const forget = () => { D.from = D.to = 0; };
export const allEvents = () => D.events;

/**
 * The occurrences in [a, b): every event once, or every time it repeats (minus its exceptions and the occurrences
 * changed on their own), and the items of SavSchedules and SavNewsletters. Each one:
 * {key, e, cal, title, color, allDay, s, en (ms; whole days: midnight in the zone of the view), startKey, endKey,
 *  readOnly, occ (the original start of an occurrence of a repetition), source}
 */
export function occurrences(a, b) {
  const tz = viewTz(), on = new Set(S.calendars.filter((c) => c.visible).map((c) => c.id)), out = [];
  const changed = new Map();
  const norm = (e, x) => (e.allDay ? x.slice(0, 10) : String(Date.parse(x)));
  for (const e of D.events) if (e.recurId) { const k = e.cal + '|' + e.uid; if (!changed.has(k)) changed.set(k, new Set()); changed.get(k).add(norm(e, e.recurId)); }
  const add = (e, cal, start, end, occ, source) => {
    const o = { key: (e.id || '') + '@' + start, e, cal, source, title: e.title || t('no_title'), color: e.color || cal?.color || '#888', allDay: !!e.allDay, readOnly: !!e.readOnly, occ };
    if (o.allDay) { o.startKey = start.slice(0, 10); o.endKey = end.slice(0, 10) > o.startKey ? end.slice(0, 10) : addDays(o.startKey, 1); o.s = startOfDay(o.startKey, tz); o.en = startOfDay(o.endKey, tz); }
    else { o.s = Date.parse(start); o.en = Math.max(o.s, Date.parse(end)); o.startKey = dayKey(o.s, tz); o.endKey = addDays(dayKey(Math.max(o.s, o.en - 1), tz), 1); }
    if (o.en > a && o.s < b || (o.s === o.en && o.s >= a && o.s < b)) out.push(o);
  };
  for (const e of D.events) {
    if (!on.has(e.cal) || e.status === 'cancelled') continue;
    const cal = calById(e.cal);
    if (e.rrule) {
      const skip = changed.get(e.cal + '|' + e.uid);
      for (const x of expand(e, a, b)) if (!skip?.has(norm(e, x.start))) add(e, cal, x.start, x.end, x.start, 'cal');
    } else add(e, cal, e.start, e.end, e.recurId, 'cal');
  }
  if (prefs().schedules !== false) for (const s of D.schedules) add(s, null, s.start, s.end, null, 'schedules');
  if (prefs().newsletters !== false) for (const s of D.newsletters) add({ ...s, color: '#c2307a' }, null, s.start, s.end, null, 'newsletters'); // the colour of SavNewsletters
  if (prefs().tasks !== false) for (const s of D.tasks) add({ ...s, title: (s.done ? '✓ ' : '') + s.title }, null, s.start, s.end, null, 'tasks'); // the tasks of SavTasks, in the colour of their list
  if (prefs().forms !== false) for (const s of D.forms) add(s, null, s.start, s.end, null, 'forms'); // the deadlines of SavForms, in the colour of the form
  if (prefs().birthdays !== false) for (const s of D.birthdays) add({ ...s, title: s.age ? t('bday_title_age', { name: s.name, n: s.age }) : t('bday_title', { name: s.name }) }, null, s.start, s.end, null, 'birthdays'); // the birthdays of SavContacts
  return out.sort((x, y) => x.s - y.s || (y.en - y.s) - (x.en - x.s));
}

/** Whole days, and timed events of 24 hours or more, go in the row above the hours. */
const longOne = (o) => o.allDay || o.en - o.s >= 864e5;
const tentative = (o) => o.e.status === 'tentative';

// ------------------------------------------------------------------ the screen

export async function calendarScreen(root, view = '', k = '') {
  view = VIEWS.includes(view) ? view : prefs().view || (mobile() ? 'day' : 'week');
  k = /^\d{4}-\d{2}-\d{2}$/.test(k) ? k : todayKey(viewTz());
  const pick = { on: false, list: [] }; // choosing dates for SavSchedules
  let leaving = false;

  const side = h('nav.cside', { 'aria-label': t('calendars') });
  const main = h('main.cmain');
  const title = h('h1.ctitle');
  const q = h('sav-input', { type: 'search', placeholder: t('search_events'), 'aria-label': t('search'), clearable: true, pill: true, size: 'sm' }, icon('search', { slot: 'prefix' }));
  q.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && q.value.trim().length > 1) searchDialog(q.value.trim(), (o) => go(`#/day/${o}`)); });
  const drawer = h('sav-drawer.cdrawer', { label: t('calendars'), placement: 'start' });
  const menuBtn = iconBtn('menu', t('calendars'), () => { put(drawer, sidebar(api_side())); drawer.show(); }, { class: 'only-mobile' });
  /** Which day comes first and which days the week and month views show: a panel that stays open while it is used. */
  const daysBtn = h('sav-button', { slot: 'trigger', icon: 'calendar-range', label: t('week_days'), title: t('week_days'), appearance: 'ghost', size: 'sm', square: true });
  const daysMenu = h('sav-popover.daysp', { placement: 'bottom-end', heading: t('week_days'), 'sheet-on-mobile': true }, daysBtn);
  daysMenu.addEventListener('sav-show', () => {
    if (daysMenu.dataset.built) return;
    daysMenu.dataset.built = 1;
    daysMenu.append(weekPanel((x) => { forget(); refresh(true); if ('firstDay' in x) drawSide(); }));
  });
  const viewSel = segmented(t('view'), view, [['day', '=' + t('v_day'), t('v_day')], ['week', '=' + t('v_week'), t('v_week')], ['month', '=' + t('v_month'), t('v_month')], ['agenda', '=' + t('v_agenda'), t('v_agenda')]], (v) => go(`#/${v}/${k}`), { class: 'vsel' });
  const tray = h('div.tray', { hidden: true });
  // the title bar: the logo on the left, ⋮, the apps and the account on the right (always); between them the buttons each person
  // chooses, in their order (⋮ → Customise the bars, kept with the account). Going back and forth, today and the period shown stay
  // together (on a phone they make a row of their own).
  const T2 = { today: btn(t('today'), { size: 'sm', onclick: () => go(`#/${view}/${todayKey(viewTz())}`) }), prev: iconBtn('chevron-left', t('previous'), () => step(-1), { kbd: '←' }), next: iconBtn('chevron-right', t('next'), () => step(1), { kbd: '→' }),
    period: title, search: h('div.csearch', q), view: viewSel, days: daysMenu, new: iconBtn('plus', t('new_event'), () => newEvent(), { kbd: 'Alt+Shift+C' }) };
  const TITLE_ITEMS = [['today', 'calendar-check', t('today')], ['prev', 'chevron-left', t('previous')], ['next', 'chevron-right', t('next')], ['period', 'calendar', t('bar_period'), { lock: true }], ['new', 'plus', t('new_event')], ['search', 'search', t('search_events')], ['view', 'calendar-days', t('view')], ['days', 'calendar-range', t('week_days')]];
  const TITLE_DEF = ['today', 'prev', 'next', 'period', '~', 'search', 'view', 'days'];
  const NAV = ['today', 'prev', 'next', 'period'];
  const BARS = window.SavOffice?.bars;
  const barPick = () => (BARS ? BARS.pick(prefs().bars?.title, TITLE_DEF, TITLE_ITEMS) : TITLE_DEF);
  const moreB = drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), title: t('more'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true }), [
    !mobile() && BARS ? ['settings-2', BARS.menuLabel(), () => barsDialog()] : null, ['settings', t('settings'), () => go('#/settings')]], { placement: 'bottom-end' });
  const top = h('header.ctop'), accountEl = userMenu();
  function layoutTitle() {
    const list = BARS ? BARS.layout(barPick()) : TITLE_DEF, out = [];
    let group = null;
    for (const k of list) {
      if (NAV.includes(k)) { if (!group) { group = h('div.cnav'); out.push(h('div.chead', group)); } group.append(T2[k]); continue; }
      group = null;
      out.push(k === '|' ? h('span.csep.so-sep') : k === '_' ? h('i.bgap') : k === '~' ? h('div.spacer') : T2[k]);
    }
    put(top, menuBtn, brand(), out, moreB, accountEl);
  }
  /** Customising the bars (⋮ → Customise the bars): the window shared by the apps of SavOffice. */
  function barsDialog() {
    BARS.dialog({ bars: [{ id: 'title', items: TITLE_ITEMS, def: TITLE_DEF, before: [[null, 'SavCalendar']], after: [['ellipsis-vertical', t('more')], ['layout-grid', 'SavOffice'], ['user', t('account')]] }], value: { title: barPick() },
      save: async (v) => { await setPrefs({ bars: { ...(prefs().bars || {}), ...v } }); layoutTitle(); } });
  }
  layoutTitle();
  put(root, h('div.capp', top, h('div.cbody', side, h('div.cwrap', main, tray)), drawer));

  const range = () => rangeOf(view, k).map((x) => startOfDay(x));
  function step(dir) {
    const n = view === 'day' ? 1 : view === 'week' ? 7 : view === 'agenda' ? 30 : 0;
    if (n) return go(`#/${view}/${addDays(k, dir * n)}`);
    const [y, m] = keyParts(k), x = new Date(Date.UTC(y, m - 1 + dir, 1));
    go(`#/month/${x.toISOString().slice(0, 10)}`);
  }

  /** What the side panel and the dialogs need from the screen. */
  const api_side = () => ({ day: k, view, pick: startPick, newEvent: () => ctx.newEvent(), redraw: () => { drawSide(); draw(); }, reload: async () => { forget(); await refresh(); drawSide(); }, go: (x) => go(`#/${view}/${x}`), drawer });
  const drawSide = () => put(side, sidebar(api_side()));

  async function refresh(force) {
    const [a, b] = range();
    try { if (await load(a, b, force) || force) draw(); } catch (e) { if (!leaving) fail(e); }
  }
  /** After any change: the data again, then the screen. */
  const changed = async () => { forget(); await refresh(true); drawSide(); };
  const ctx = { changed, tz: viewTz, startPick };

  function draw() {
    const [a, b] = range();
    const list = occurrences(a, b);
    const [k0, k1] = rangeOf(view, k);
    title.textContent = view === 'month' ? monthLabel(k) : view === 'day' ? longDay(k) : view === 'agenda' ? `${dayLabel(k0, { day: 'numeric', month: 'short' })} – ${dayLabel(addDays(k1, -1), { day: 'numeric', month: 'short', year: 'numeric' })}` : weekTitle(k0, k1);
    document.title = title.textContent + ' – SavCalendar';
    if (view === 'month') put(main, monthView(k, list, ctx, pick));
    else if (view === 'agenda') put(main, agendaView(k0, k1, list, ctx));
    else put(main, timeView(view === 'day' ? [k] : weekDays(k), list, ctx, pick));
    drawTray();
  }

  // ---------------------------------------------------------------- choosing dates for SavSchedules
  function startPick(first) {
    pick.on = true;
    if (first) pick.list.push(first);
    if (view === 'agenda') return go(`#/week/${k}`);
    draw();
    toast(t(view === 'month' ? 'pick_hint_month' : 'pick_hint'), 'primary', { duration: 6000 });
  }
  function drawTray() {
    tray.hidden = !pick.on;
    if (!pick.on) return;
    const n = pick.list.length;
    put(tray, h('div.tray-in', icon('vote'), h('div.tray-t', h('b', n ? t(n === 1 ? 'picked_1' : 'picked_n', { n }) : t('pick_none')), h('small.muted', t(view === 'month' ? 'pick_hint_month' : 'pick_hint'))),
      h('div.spacer'), btn(t('cancel'), { size: 'sm', appearance: 'ghost', onclick: () => { pick.on = false; pick.list = []; draw(); } }),
      btn(t('k_slots'), { size: 'sm', icon: 'ticket', disabled: !n, onclick: () => scheduleDialog('slots', pick.list, viewTz(), afterPick) }),
      primary(t('k_poll'), { size: 'sm', icon: 'vote', disabled: !n, onclick: () => scheduleDialog('poll', pick.list, viewTz(), afterPick) })));
  }
  /** The poll or the sheet is made: its dates show up in the calendar (SavSchedules layer). */
  const afterPick = () => { pick.on = false; pick.list = []; changed(); };
  pick.redraw = draw;
  pick.tray = drawTray;

  // ---------------------------------------------------------------- keys
  const onKey = (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || document.querySelector('sav-dialog[open]')) return;
    if (e.composedPath().some((x) => /^(input|textarea|sav-input|sav-textarea|sav-select)$/.test(x.localName || ''))) return;
    // a letter is a shortcut only with ⌥⇧ (Alt+Shift), never alone: read from the key itself (on a Mac ⌥ changes the character)
    const L = e.altKey && e.shiftKey && /^Key[A-Z]$/.test(e.code) ? e.code[3].toLowerCase() : null;
    if ((e.altKey && !L) || (!L && /^[a-z]$/i.test(e.key))) return;
    const map = { t: () => go(`#/${view}/${todayKey(viewTz())}`), j: () => step(1), k: () => step(-1), ArrowRight: () => step(1), ArrowLeft: () => step(-1), d: () => go(`#/day/${k}`), w: () => go(`#/week/${k}`), m: () => go(`#/month/${k}`), a: () => go(`#/agenda/${k}`), c: () => newEvent(), n: () => newEvent(), '/': () => q.focus() };
    const kk = L || e.key;
    if (map[kk]) { e.preventDefault(); map[kk](); }
  };
  const newEvent = () => { const s = zoned(...keyParts(k), 9, 0, viewTz()); editEvent(null, { start: s, end: s + 3600e3 }, ctx); };
  ctx.newEvent = newEvent;
  // the search of actions (⌘J / Ctrl+J): the same moves as the keys of the calendar
  commands([t('new_event'), [['plus', t('new_event'), () => newEvent(), 'Alt+Shift+C'], ['search', t('search_events'), () => q.focus(), '/']]],
    [t('today'), [['calendar-check', t('today'), () => go(`#/${view}/${todayKey(viewTz())}`), 'Alt+Shift+T'], ['chevron-left', t('previous'), () => step(-1), '←'], ['chevron-right', t('next'), () => step(1), '→'],
      ...VIEWS.map((v) => [{ day: 'calendar', week: 'calendar-range', month: 'calendar-days', agenda: 'list' }[v], t('v_' + v), () => go(`#/${v}/${k}`), 'Alt+Shift+' + v[0].toUpperCase()])]]);
  addEventListener('keydown', onKey);
  const onVis = () => { if (document.visibilityState === 'visible') refresh(true).catch(() => {}); };
  document.addEventListener('visibilitychange', onVis);

  if (prefs().view !== view && VIEWS.includes(view)) setPrefs({ view }).catch(() => {});
  drawSide();
  put(main, h('div.wait', h('sav-spinner', { style: 'font-size:2rem' })));
  await refresh(true);
  // a .savcal or .ics opened from the device (double click, "Open with")
  if (S.pendingFile) { const f = S.pendingFile; S.pendingFile = null; openFile(api_side(), f); }
  return () => { leaving = true; removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis); };
}

function weekTitle(a, b) {
  const [y1, m1] = keyParts(a), [y2, m2] = keyParts(addDays(b, -1));
  if (y1 === y2 && m1 === m2) return monthLabel(a);
  return `${dayLabel(a, { month: 'short', year: y1 === y2 ? undefined : 'numeric' })} – ${dayLabel(addDays(b, -1), { month: 'short', year: 'numeric' })}`;
}

// ------------------------------------------------------------------ pieces

const lockOf = (o) => (o.readOnly ? h('sav-icon.lk', { name: 'lock', label: t('read_only') }) : null);
const srcIcon = (o) => (o.source === 'schedules' ? h('sav-icon.lk', { name: o.e.kind === 'slots' ? 'ticket' : 'vote' }) : o.source === 'newsletters' ? h('sav-icon.lk', { name: 'mail' }) : o.source === 'tasks' ? h('sav-icon.lk', { name: o.e.done ? 'circle-check' : 'list-checks' }) : o.source === 'forms' ? h('sav-icon.lk', { name: 'hourglass' }) : o.source === 'birthdays' ? h('sav-icon.lk', { name: 'cake' }) : o.e.rrule || o.e.recurId ? h('sav-icon.lk', { name: 'repeat' }) : null);
const timeText = (o, tz) => (o.allDay ? t('all_day') : clock(o.s, tz));
/** What can be done with an event: open it, change it, a copy, one day later, away (what cannot be changed only opens) —
 *  its right click and ⌘J (SavOffice.context: the element carries them as soMenu). */
function evMenu(o, ctx) {
  return () => {
    const ro = o.readOnly, run = (p) => Promise.resolve(p).catch(fail);
    return [
      ['calendar-search', t('open'), () => openItem(o, ctx)],
      ro ? null : ['pencil', t('edit'), () => editEvent(o, null, ctx)],
      ['copy', t('duplicate'), () => editEvent(null, { copyOf: o.e }, ctx)],
      ro ? null : ['calendar-arrow-down', t('move_next_day'), () => run(moveEvent(o, o.s + 864e5, o.en + 864e5, ctx))],
      ro ? null : '-', ro ? null : ['trash', t('delete'), () => run(deleteItem(o, ctx)), { danger: true }],
    ].filter(Boolean);
  };
}

function chip(o, ctx, opts = {}) {
  const tz = ctx.tz(), full = o.allDay || opts.bar;
  const b = h('button.chip' + (full ? '.full' : '') + (tentative(o) ? '.tent' : '') + (o.readOnly ? '.ro' : ''), { type: 'button', style: `--c:${o.color}`, title: `${o.title}${o.readOnly ? ' · ' + t('read_only') : ''}`, onclick: (e) => { e.stopPropagation(); openItem(o, ctx); } },
    full ? null : h('i.dot'), full || o.allDay ? null : h('b', clock(o.s, tz)), h('span', o.title), srcIcon(o), lockOf(o));
  b.soMenu = evMenu(o, ctx);
  return b;
}

// ------------------------------------------------------------------ month

function monthView(k, list, ctx, pick) {
  const [k0] = rangeOf('month', k), [, m] = keyParts(k), today = todayKey(ctx.tz()), tz = ctx.tz();
  const on = new Set(shownDays()), cols = Array.from({ length: 7 }, (_, i) => addDays(k0, i)).filter((d) => on.has(weekday(d)));
  const names = cols.map((d) => h('div', dayLabel(d, { weekday: mobile() ? 'narrow' : 'short' })));
  const max = mobile() ? 2 : 3;
  const byDay = new Map();
  for (const o of list) for (let d = o.startKey; d < o.endKey; d = addDays(d, 1)) { if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(o); }
  const picked = new Set(pick.list.filter((p) => p.day).map((p) => p.day));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(k0, i)).filter((d) => on.has(weekday(d))).map((d) => {
    const items = (byDay.get(d) || []).sort((a, b) => (longOne(b) - longOne(a)) || a.s - b.s);
    const more = items.length - max;
    const cell = h('div.mcell' + (keyParts(d)[1] !== m ? '.out' : '') + (d === today ? '.today' : '') + (picked.has(d) ? '.picked' : ''), {
      onclick: () => {
        if (pick.on) { const at = pick.list.findIndex((p) => p.day === d); if (at >= 0) pick.list.splice(at, 1); else pick.list.push({ day: d }); return pick.redraw(); }
        quickCreate({ allDay: true, startKey: d, endKey: addDays(d, 1) }, ctx);
      },
    }, h('button.mnum', { type: 'button', title: longDay(d), onclick: (e) => { e.stopPropagation(); go(`#/day/${d}`); } }, String(keyParts(d)[2])),
      h('div.mlist', items.slice(0, more > 0 ? max - 1 : max).map((o) => chip(o, ctx, { bar: longOne(o) })),
        more > 0 ? h('button.mmore', { type: 'button', onclick: (e) => { e.stopPropagation(); dayList(d, items, ctx); } }, t('n_more', { n: more + 1 })) : null),
      picked.has(d) ? h('sav-icon.pk', { name: 'check' }) : null);
    return cell;
  });
  void tz;
  return h('div.month' + (pick.on ? '.picking' : ''), { style: `--cols:${cols.length}` }, h('div.mnames', names), h('div.mgrid', cells));
}

/** Everything of one day, in a dialog (from "+3 more"). */
function dayList(d, items, ctx) {
  const dlg = dialog({ title: longDay(d), width: '24rem', body: h('div.dlist', items.map((o) => { const c = chip(o, ctx, { bar: longOne(o) }); c.addEventListener('click', () => dlg.hide()); return c; })), actions: [{ label: t('open_day'), run: () => go(`#/day/${d}`) }, { label: t('close') }] });
}

// ------------------------------------------------------------------ agenda

function agendaView(k0, k1, list, ctx) {
  const tz = ctx.tz(), today = todayKey(tz), days = [];
  for (let d = k0; d < k1; d = addDays(d, 1)) {
    const items = list.filter((o) => o.startKey <= d && o.endKey > d);
    if (!items.length && d !== today) continue;
    days.push(h('section.aday' + (d === today ? '.today' : ''), h('button.ahead', { type: 'button', onclick: () => go(`#/day/${d}`) }, h('b', String(keyParts(d)[2])), h('span', dayLabel(d, { weekday: 'long', month: 'long' }))),
      h('div.alist', items.length ? items.map((o) => h('button.arow' + (tentative(o) ? '.tent' : ''), { type: 'button', style: `--c:${o.color}`, onclick: () => openItem(o, ctx), soMenu: evMenu(o, ctx) },
        h('span.atime', o.allDay || (o.startKey < d && o.endKey > addDays(d, 1)) ? t('all_day') : o.startKey < d ? t('until_t', { t: clock(o.en, tz) }) : `${clock(o.s, tz)}${o.en > o.s ? ' – ' + clock(o.en, tz) : ''}`),
        h('i.dot'), h('span.atitle', h('b', o.title), o.e.place ? h('small.muted', o.e.place) : null), srcIcon(o), lockOf(o))) : h('p.muted.small', t('nothing_today')))));
  }
  return h('div.agenda', days.length ? days : empty('calendar-days', t('agenda_empty'), t('agenda_empty_t'), primary(t('new_event'), { icon: 'plus', onclick: () => ctx.newEvent() })));
}

// ------------------------------------------------------------------ day and week

/** Overlapping blocks side by side: each item gets col and n (columns of its group). */
function layout(items) {
  items.sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  let group = [], end = -1;
  const close = () => { const cols = []; for (const it of group) { let c = cols.findIndex((last) => last <= it.top); if (c < 0) { c = cols.length; cols.push(0); } cols[c] = it.bottom; it.col = c; } for (const it of group) it.n = cols.length; group = []; };
  for (const it of items) { if (group.length && it.top >= end) { close(); end = -1; } group.push(it); end = Math.max(end, it.bottom); }
  if (group.length) close();
  return items;
}

function timeView(days, list, ctx, pick) {
  const tz = ctx.tz(), today = todayKey(tz), n = days.length;
  const head = h('div.tv-head', { style: `--n:${n}` }, h('div.gut', h('small', tzShort(tz))), days.map((d) => h('button.tv-day' + (d === today ? '.today' : ''), { type: 'button', onclick: () => go(`#/day/${d}`) }, h('small', dayLabel(d, { weekday: 'short' })), h('b', String(keyParts(d)[2])))));
  // whole days and long events: bars across the days, in lanes
  const first = days[0], last = addDays(days[n - 1], 1);
  const bars = list.filter(longOne).map((o) => ({ o, a: Math.max(0, diffDays(first, o.startKey)), b: Math.min(n, diffDays(first, o.endKey)) })).filter((x) => x.b > x.a);
  const lanes = [];
  for (const x of bars.sort((p, q) => p.a - q.a || (q.b - q.a) - (p.b - p.a))) { let l = lanes.findIndex((end) => end <= x.a); if (l < 0) { l = lanes.length; lanes.push(0); } lanes[l] = x.b; x.lane = l; }
  const allRow = h('div.tv-all', { style: `--n:${n}` }, h('div.gut', h('small', t('all_day_s'))),
    h('div.tv-bars', { style: `--n:${n};--lanes:${Math.max(1, lanes.length)}` },
      days.map((d, i) => h('div.tv-allc', { style: `grid-column:${i + 1};grid-row:1 / span ${Math.max(1, lanes.length) + 1}`, onclick: () => (pick.on ? (pick.list.push({ day: d }), pick.redraw()) : quickCreate({ allDay: true, startKey: d, endKey: addDays(d, 1) }, ctx)) })),
      bars.map((x) => { const c = chip(x.o, ctx, { bar: true }); c.style.gridColumn = `${x.a + 1} / ${x.b + 1}`; c.style.gridRow = String(x.lane + 1); if (x.o.startKey < first) c.classList.add('cont-l'); if (x.o.endKey > last) c.classList.add('cont-r'); return c; }),
      pick.list.filter((p) => p.day && days.includes(p.day)).map((p) => h('div.pickbar', { style: `grid-column:${days.indexOf(p.day) + 1};grid-row:1` }, icon('check'), t('all_day')))));

  // the hours
  const hours = h('div.tv-hours', Array.from({ length: 24 }, (_, i) => (i ? h('span', { style: `top:${i * HH}px` }, hm(i * 60)) : null)));
  const cols = days.map((d) => {
    const col = h('div.tv-col' + (d === today ? '.today' : ''), { 'data-day': d });
    const s0 = startOfDay(d, tz), s1 = startOfDay(addDays(d, 1), tz), dayLen = (s1 - s0) / 60000;
    const items = list.filter((o) => !longOne(o) && o.en > s0 && o.s < s1 || (!longOne(o) && o.s === o.en && o.s >= s0 && o.s < s1)).map((o) => {
      const top = Math.max(0, (o.s - s0) / 60000), bottom = Math.min(dayLen, (o.en - s0) / 60000);
      return { o, top: top * 1440 / dayLen, bottom: Math.max(top + 22 * 60 / HH, bottom) * 1440 / dayLen, cut: { top: o.s < s0, bottom: o.en > s1 } };
    });
    for (const it of layout(items)) col.append(block(it, ctx, tz));
    for (const p of pick.list) if (p.start && Date.parse(p.start) >= s0 && Date.parse(p.start) < s1) {
      const a = (Date.parse(p.start) - s0) / 60000, b = (Date.parse(p.end) - s0) / 60000;
      col.append(h('button.pick', { type: 'button', style: `top:${a * HH / 60}px;height:${Math.max(18, (b - a) * HH / 60)}px`, title: t('remove'), onclick: (e) => { e.stopPropagation(); pick.list.splice(pick.list.indexOf(p), 1); pick.redraw(); } }, h('b', `${clock(Date.parse(p.start), tz)}–${clock(Date.parse(p.end), tz)}`), icon('x')));
    }
    drawOn(col, d, ctx, pick, tz);
    return col;
  });
  const body = h('div.tv-body', { style: `--n:${n};--hh:${HH}px;height:${24 * HH}px` }, hours, cols);
  const ti = days.indexOf(today);
  if (ti >= 0) { const p = parts(Date.now(), tz); body.append(h('div.now', { style: `--i:${ti};top:${(p.h * 60 + p.mi) * HH / 60}px` })); }
  const scroll = h('div.tv-scroll', body);
  requestAnimationFrame(() => { const p = parts(Date.now(), tz), start = ti >= 0 ? Math.max(0, p.h - 2) : (prefs().dayStart ?? 8); scroll.scrollTop = start * HH; });
  return h('div.tv' + (pick.on ? '.picking' : ''), head, allRow, scroll);
}
const diffDays = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const tzShort = (tz) => { try { return new Intl.DateTimeFormat(getLang(), { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((x) => x.type === 'timeZoneName')?.value || ''; } catch { return ''; } };

/** A timed event in its column: it opens, and (when it is ours and not repeated in a strange way) moves and stretches. */
function block(it, ctx, tz) {
  const o = it.o, short = it.bottom - it.top < 40;
  const b = h('div.blk' + (tentative(o) ? '.tent' : '') + (o.readOnly ? '.ro' : '') + (short ? '.short' : '') + (it.cut.top ? '.cut-t' : '') + (it.cut.bottom ? '.cut-b' : ''), {
    role: 'button', tabindex: 0, style: `--c:${o.color};top:${it.top * HH / 60}px;height:${(it.bottom - it.top) * HH / 60 - 2}px;left:calc(${(it.col / it.n) * 100}% + 2px);width:calc(${100 / it.n}% - 4px)`,
    title: `${o.title} · ${clock(o.s, tz)}–${clock(o.en, tz)}${o.readOnly ? ' · ' + t('read_only') : ''}`,
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItem(o, ctx); } }, soMenu: evMenu(o, ctx),
  }, h('b', o.title), h('small', `${clock(o.s, tz)}${short ? '' : ' – ' + clock(o.en, tz)}`), o.e.place && !short ? h('small', o.e.place) : null, h('span.blk-ic', srcIcon(o), lockOf(o)), o.readOnly ? null : h('div.rz', { 'aria-hidden': 'true' }));
  dragBlock(b, o, ctx, tz);
  return b;
}

/** Drawing on an empty column: a new event (or, while choosing dates for SavSchedules, an option). */
function drawOn(col, d, ctx, pick, tz) {
  const snap = 15;
  const minuteAt = (y) => Math.max(0, Math.min(1440, Math.round((y / HH * 60) / snap) * snap));
  col.addEventListener('pointerdown', (e) => {
    if (e.target !== col || e.button !== 0) return;
    const r = col.getBoundingClientRect(), a0 = minuteAt(e.clientY - r.top);
    if (e.pointerType === 'touch') { col.dataset.tap = a0; return; } // on touch screens a tap makes an hour: dragging scrolls
    e.preventDefault();
    let a = a0, b = a0 + snap, moved = false;
    const ghost = h('div.ghost', { style: `top:${a * HH / 60}px;height:${(b - a) * HH / 60}px` }, h('b'));
    const show = () => { ghost.style.top = `${Math.min(a, b) * HH / 60}px`; ghost.style.height = `${Math.max(snap, Math.abs(b - a)) * HH / 60}px`; ghost.firstChild.textContent = `${hm(Math.min(a, b))}–${hm(Math.max(a, b))}`; };
    col.append(ghost); show();
    try { col.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
    const move = (ev) => { const m = minuteAt(ev.clientY - r.top); if (m !== a0) moved = true; b = m === a0 ? a0 + snap : m; show(); };
    const up = () => {
      col.removeEventListener('pointermove', move); col.removeEventListener('pointerup', up); col.removeEventListener('pointercancel', up);
      let x = Math.min(a, b), y = Math.max(a, b);
      if (!moved) y = x + (pick.on ? 60 : (prefs().duration || 60));
      const [yy, mm, dd] = keyParts(d), s = zoned(yy, mm, dd, Math.floor(x / 60), x % 60, tz), en = s + (y - x) * 60000;
      if (pick.on) { ghost.remove(); pick.list.push({ start: iso(s), end: iso(en) }); pick.redraw(); return; }
      quickCreate({ start: s, end: en }, ctx, () => ghost.remove());
    };
    col.addEventListener('pointermove', move); col.addEventListener('pointerup', up); col.addEventListener('pointercancel', up);
  });
  col.addEventListener('click', (e) => {
    if (e.target !== col || col.dataset.tap === undefined) return;
    const x = +col.dataset.tap;
    delete col.dataset.tap;
    const [yy, mm, dd] = keyParts(d), s = zoned(yy, mm, dd, Math.floor(x / 60), x % 60, tz), en = s + 60 * 60000;
    if (pick.on) { pick.list.push({ start: iso(s), end: iso(en) }); pick.redraw(); return; }
    quickCreate({ start: s, end: en }, ctx);
  });
}

/** Moving a block (to another time or day) and stretching it from the bottom edge. A click opens it. */
function dragBlock(b, o, ctx, tz) {
  b.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const resize = e.target.classList.contains('rz');
    const x0 = e.clientX, y0 = e.clientY, top0 = parseFloat(b.style.top), h0 = parseFloat(b.style.height);
    const body = b.closest('.tv-body'), cols = [...body.querySelectorAll('.tv-col')], col0 = b.parentElement;
    let dy = 0, dcol = 0, dragging = false;
    const canMove = !o.readOnly && e.pointerType !== 'touch';
    const move = (ev) => {
      if (!canMove) return;
      if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      if (!dragging) { dragging = true; b.classList.add('dragging'); try { b.setPointerCapture(e.pointerId); } catch { /* gone */ } }
      dy = Math.round(((ev.clientY - y0) / HH * 60) / 15) * 15;
      if (resize) { b.style.height = `${Math.max(HH / 4, h0 + dy * HH / 60)}px`; return; }
      const at = cols.findIndex((c) => { const r = c.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX < r.right; });
      dcol = at < 0 ? dcol : at - cols.indexOf(col0);
      b.style.top = `${top0 + dy * HH / 60}px`;
      b.style.transform = `translateX(${dcol * col0.getBoundingClientRect().width}px)`;
    };
    const up = () => {
      b.removeEventListener('pointermove', move); b.removeEventListener('pointerup', up); b.removeEventListener('pointercancel', up);
      if (!dragging) { openItem(o, ctx); return; }
      if (!dy && !dcol) { b.classList.remove('dragging'); b.style.transform = ''; return; }
      const days = dcol * 864e5;
      // across a change of summer time a day is not 24 hours: the move keeps the wall clock of the view
      const shift = (ms) => { if (!days) return ms + dy * 60000; const p = parts(ms, tz), k = addDays(dayKey(ms, tz), dcol), [y, m, d] = keyParts(k); return zoned(y, m, d, p.h, p.mi, tz) + dy * 60000; };
      const s = resize ? o.s : shift(o.s), en = resize ? Math.max(o.s + 15 * 60000, o.en + dy * 60000) : shift(o.en);
      moveEvent(o, s, en, ctx).catch(fail).finally(() => ctx.changed());
    };
    b.addEventListener('pointermove', move); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  });
}

void errText; void drop;
