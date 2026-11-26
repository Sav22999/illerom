/**
 * One event: what it says (and, when it cannot be changed here, why), the editor, the quick box of a new one, moving
 * and deleting with the choice "only this / this and the following / all" for repetitions, the dialog that turns the
 * dates chosen in the calendar into a poll or a sheet of slots of SavSchedules, and the search.
 */
import { btn, colorPop, confirm, copyText, dialog, empty, fail, h, icon, primary, select, toast, toggle } from './ui.js';
import { t, getLang } from './i18n.js';
import { S, api, calById, taskDone } from './store.js';
import { prefs } from './account.js';
import { addDays, clock, dayKey, keyParts, longDay, parts, zoned, ZONES, dayLabel, weekday } from './time.js';
import { describe, parseRule, ruleText, DAYS } from './rrule.js';

const CAL_COLORS = ['#c93a2f', '#e0532f', '#c27a06', '#0f8a63', '#0b8494', '#1f56d1', '#6a2cf0', '#c2307a', '#4a5875', '#7a5c3e'];
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
const own = () => S.calendars.filter((c) => c.kind === 'local');
const pad = (n) => String(n).padStart(2, '0');

// ------------------------------------------------------------------ reading

/** "Tuesday 1 December · 09:00 – 10:00", whole days and events over more days too. */
export function whenText(o, tz) {
  if (o.allDay) { const last = addDays(o.endKey, -1); return last === o.startKey ? longDay(o.startKey) : `${dayLabel(o.startKey, { day: 'numeric', month: 'long' })} – ${longDay(last)}`; }
  const a = dayKey(o.s, tz), b = dayKey(Math.max(o.s, o.en - 1), tz);
  if (a === b) return `${longDay(a)} · ${clock(o.s, tz)}${o.en > o.s ? ' – ' + clock(o.en, tz) : ''}`;
  return `${dayLabel(a, { weekday: 'short', day: 'numeric', month: 'short' })} ${clock(o.s, tz)} – ${dayLabel(b, { weekday: 'short', day: 'numeric', month: 'short' })} ${clock(o.en, tz)}`;
}

/** Why an item cannot be changed here, and where it can: {text, link, label, icon}. Null for one's own events. */
export function readOnlyWhy(o) {
  if (!o.readOnly) return null;
  const e = o.e;
  if (o.source === 'cal') {
    const c = o.cal;
    return { text: t('ro_sub', { name: c?.name || '' }), icon: 'rss', refresh: c?.id };
  }
  if (o.source === 'schedules') {
    const v = { title: e.title, owner: e.owner || '', taken: e.taken ?? 0, cap: e.capacity ?? 1 };
    return { text: t('ro_sch_' + e.why, v), link: e.link, label: t(['final', 'proposal', 'slot'].includes(e.why) ? 'open_in_sch' : 'open_answer'), icon: 'vote' };
  }
  if (o.source === 'newsletters') return { text: t('ro_nl_' + (e.why || 'scheduled'), { group: e.descr || e.group || '' }), link: e.link, label: t('open_in_nl'), icon: 'mail' };
  if (o.source === 'tasks') return { text: t('ro_task', { list: e.list || '' }), link: e.link, label: t('open_in_tasks'), icon: 'list-checks' };
  if (o.source === 'forms') return { text: t('ro_form'), link: e.link, label: t('open_in_forms'), icon: 'chart-column' };
  return { text: t('read_only'), icon: 'lock' };
}

/** The text of a description with its links clickable (nothing else is read as HTML). */
const linkify = (s) => h('p.edescr', String(s).split(/(https?:\/\/[^\s<>"]+)/g).map((x, i) => (i % 2 ? h('a', { href: x, target: '_blank', rel: 'noopener noreferrer' }, x) : x)));

export function openItem(o, ctx) {
  const tz = ctx.tz(), e = o.e, why = readOnlyWhy(o);
  const rule = e.rrule ? describe(e.rrule, t, getLang()) : e.recurId ? t('changed_occurrence') : '';
  const srcName = o.source === 'schedules' ? 'SavSchedules' : o.source === 'newsletters' ? 'SavNewsletters' : o.source === 'tasks' ? 'SavTasks · ' + (e.list || '') : o.source === 'forms' ? 'SavForms' : o.cal?.name || '';
  const otherTz = !o.allDay && e.tz && e.tz !== tz ? `${clock(o.s, e.tz)} – ${clock(o.en, e.tz)} ${t('in_zone', { z: e.tz.replace(/_/g, ' ') })}` : '';
  const line = (ic, ...kids) => h('div.eline', icon(ic), h('div', ...kids));
  const extra = [];
  if (o.source === 'schedules' && e.why === 'slot') extra.push(line('users', t('slot_taken_n', { n: e.taken ?? 0, c: e.capacity ?? 1 })));
  if (o.source === 'schedules' && ['proposal', 'final'].includes(e.why) && e.yes !== undefined) extra.push(line('vote', t('yes_n', { n: e.yes })));
  if (o.source === 'schedules' && e.mine) extra.push(line('user-check', t(e.mine === 2 ? 'you_said_yes' : 'you_said_maybe')));
  if (o.source === 'tasks') extra.push(line(e.done ? 'circle-check' : 'hourglass', t(e.done ? 'task_is_done' : 'task_to_do'), e.repeats ? h('small.muted', ' · ' + t('task_repeats')) : null));
  if (o.source === 'forms') extra.push(line('chart-column', t('form_answers_n', { n: e.answers ?? 0 }), e.accepting === false ? h('small.muted', ' · ' + t('form_stopped')) : null));
  const body = h('div.edetail', { style: `--c:${o.color}` },
    h('div.ehead', h('span.esw'), h('div', h('h2', o.title), h('div.muted', whenText(o, tz)), otherTz ? h('small.muted', otherTz) : null)),
    why ? h('sav-alert.ro-why', { variant: 'neutral', appearance: 'soft' }, icon('lock', { slot: 'icon' }), h('div', h('b', t('read_only_because')), ' ', why.text),
      why.link ? btn(why.label, { size: 'sm', icon: 'external-link', appearance: 'outline', href: why.link, target: o.source === 'cal' ? null : '_self', class: 'ro-go' }) : null,
      why.refresh ? btn(t('refresh_now'), { size: 'sm', icon: 'refresh-cw', appearance: 'outline', class: 'ro-go', onclick: async () => { await api('cal.refresh', { id: why.refresh }); toast(t('refreshed'), 'success'); d.hide(); ctx.changed(); } }) : null) : null,
    rule ? line('repeat', rule) : null,
    e.place ? line('map-pin', e.place) : null,
    e.url ? line('link', h('a', { href: e.url, target: '_blank', rel: 'noopener noreferrer' }, e.url)) : null,
    ...extra,
    tentativeText(o) ? line('circle-alert', tentativeText(o)) : null,
    e.descr ? line('text', linkify(e.descr)) : null,
    line(o.source === 'cal' ? (o.cal?.kind === 'sub' ? 'rss' : 'calendar') : o.source === 'schedules' ? 'vote' : o.source === 'tasks' ? 'list-checks' : o.source === 'forms' ? 'hourglass' : 'mail', srcName, o.source === 'cal' && e.busy === false ? h('small.muted', ' · ' + t('shown_free')) : null));
  const actions = [];
  if (!o.readOnly) {
    actions.push({ label: t('delete'), icon: 'trash', run: async () => { if (await deleteItem(o, ctx)) return; return false; } });
    actions.push({ label: t('duplicate'), icon: 'copy', run: () => { editEvent(null, { ...fromOcc(o), title: o.title, copyOf: e }, ctx); } });
    actions.push({ label: t('edit'), icon: 'pencil', primary: true, run: () => { editEvent(o, null, ctx); } });
  } else if (o.source === 'tasks') {
    // a task is ticked from here too (by SavTasks itself: a repeating one plans the next)
    actions.push({ label: t('close') });
    actions.push({ label: t(e.done ? 'task_reopen' : 'task_done'), icon: 'circle-check', primary: true, run: async () => { const r = await taskDone(e.tid, !e.done); toast(t(e.done ? 'task_reopened' : r.next ? 'task_done_next' : 'task_done_ok'), 'success'); ctx.changed(); } });
  } else actions.push({ label: t('close'), primary: true });
  const d = dialog({ title: t(o.source === 'tasks' ? 'task' : o.source === 'forms' ? 'form_deadline' : 'event'), width: '30rem', body, actions, cls: 'edlg' });
}
function tentativeText(o) {
  if (o.source === 'cal' && o.e.status === 'tentative') return t('tentative');
  if (o.source === 'schedules' && ['proposal', 'voted'].includes(o.e.why)) return t(o.e.why === 'voted' ? 'still_open_voted' : 'still_open');
  return '';
}
const fromOcc = (o) => (o.allDay ? { allDay: true, startKey: o.startKey, endKey: o.endKey } : { start: o.s, end: o.en });

// ------------------------------------------------------------------ the scope of a change to a repetition

function askScope(title, text, following = true) {
  return new Promise((res) => {
    let out = null;
    const g = h('sav-radio-group', { value: 'one', 'aria-label': title }, h('sav-radio', { value: 'one' }, t('scope_one')), following ? h('sav-radio', { value: 'following' }, t('scope_following')) : null, h('sav-radio', { value: 'all' }, t('scope_all')));
    dialog({ title, width: '24rem', body: h('div.form', text ? h('p.muted', text) : null, g), actions: [{ label: t('cancel') }, { label: t('ok'), primary: true, run: () => { out = g.value || 'one'; } }], onclose: () => res(out) });
  });
}
const isSeries = (o) => !!(o.e.rrule || o.e.recurId);
/** The occurrence of a repetition as the server knows it (its original start). */
const occOf = (o) => (o.e.recurId || o.occ || null);

/** What cal.event.save needs, from an event and some changes. */
function payload(e, x = {}) {
  return { id: e.id, cal: e.cal, title: e.title, descr: e.descr, place: e.place, url: e.url, allDay: e.allDay, start: e.start, end: e.end, tz: e.tz, rrule: e.rrule, exdates: e.exdates, status: e.status, busy: e.busy, color: e.color || '', ...x };
}

/**
 * The times of the whole series when one occurrence is moved to [s, en): the start of the series moves by the same
 * amount (in the wall clock of the zone of the event, so a weekly 9:00 becomes a weekly 10:00 for ever).
 */
function seriesShift(o, x) {
  const e = o.e;
  if (e.allDay) { const delta = Math.round((Date.parse(x.start + 'T00:00:00Z') - Date.parse(o.startKey + 'T00:00:00Z')) / 864e5), len = Math.round((Date.parse(x.end + 'T00:00:00Z') - Date.parse(x.start + 'T00:00:00Z')) / 864e5); const a = addDays(e.start, delta); return { start: a, end: addDays(a, len) }; }
  const tz = e.tz || 'UTC', p0 = parts(o.s, tz), p1 = parts(Date.parse(x.start), tz), ps = parts(Date.parse(e.start), tz);
  const days = Math.round((Date.UTC(p1.y, p1.m - 1, p1.d) - Date.UTC(p0.y, p0.m - 1, p0.d)) / 864e5), mins = (p1.h * 60 + p1.mi) - (p0.h * 60 + p0.mi);
  const k = addDays(`${ps.y}-${pad(ps.m)}-${pad(ps.d)}`, days), [y, m, d] = keyParts(k), total = ps.h * 60 + ps.mi + mins;
  const s = zoned(y, m, d, 0, 0, tz) + total * 60000;
  // the weekday of a weekly series moves with it
  let rrule = x.rrule ?? e.rrule;
  const r = parseRule(rrule);
  if (r && days && r.freq === 'WEEKLY' && r.byday.length) { r.byday = r.byday.map((b) => ({ ...b, wd: (b.wd + days % 7 + 7) % 7 })); rrule = ruleText(r); }
  return { start: iso(s), end: iso(s + (Date.parse(x.end) - Date.parse(x.start))), rrule };
}

/** Saves a change: asks the scope for a repetition. Resolves to the saved event, or null when cancelled. */
async function saveChange(o, x, ctx, title = t('edit_repeating')) {
  if (!o || !isSeries(o)) return api('cal.event.save', payload(o ? o.e : {}, x));
  if (o.e.recurId) return api('cal.event.save', payload(o.e, { ...x, rrule: '' }));
  const scope = await askScope(title, t('edit_repeating_t'));
  if (!scope) return null;
  if (scope === 'one') return api('cal.event.save', payload(o.e, { ...x, rrule: '', exdates: [], scope: 'one', occurrence: occOf(o) }));
  if (scope === 'following') return api('cal.event.save', payload(o.e, { ...x, scope: 'following', occurrence: occOf(o) }));
  return api('cal.event.save', payload(o.e, { ...x, ...seriesShift(o, x) }));
}

export async function moveEvent(o, s, en, ctx) {
  if (o.readOnly) { toast(readOnlyWhy(o)?.text || t('read_only'), 'neutral'); return; }
  const r = await saveChange(o, { start: iso(s), end: iso(en) }, ctx, t('move_repeating'));
  if (r) toast(t('moved'), 'success');
}

export async function deleteItem(o, ctx) {
  if (isSeries(o) && !o.e.recurId) {
    const scope = await askScope(t('delete_repeating'), '');
    if (!scope) return false;
    await api('cal.event.delete', { id: o.e.id, scope, occurrence: occOf(o) });
  } else {
    if (!(await confirm(t('delete_event'), t('delete_event_t', { t: o.title }), t('delete')))) return false;
    await api('cal.event.delete', { id: o.e.id, scope: o.e.recurId ? 'one' : 'all' });
  }
  toast(t('deleted'), 'neutral');
  ctx.changed();
  return true;
}

// ------------------------------------------------------------------ quick box of a new event

export function quickCreate(init, ctx, onclose) {
  const tz = ctx.tz(), cals = own();
  const defCal = cals.find((c) => c.id === prefs().defaultCal && c.visible) || cals.find((c) => c.visible) || cals[0];
  const name = h('sav-input', { label: t('title_l'), maxlength: 255, autofocus: true, placeholder: t('title_ph') });
  const cal = select(t('calendar'), cals.map((c) => [c.id, c.name]), defCal?.id, null, { size: 'md' });
  const o = init.allDay ? { allDay: true, startKey: init.startKey, endKey: init.endKey } : { s: init.start, en: init.end };
  const when = whenText(o, tz);
  let done = false;
  const save = async () => {
    const x = init.allDay ? { allDay: true, start: init.startKey, end: init.endKey } : { start: iso(init.start), end: iso(init.end), tz };
    await api('cal.event.save', { cal: cal.value, title: name.value.trim(), ...x });
    done = true;
    toast(t('saved'), 'success');
    ctx.changed();
  };
  const d = dialog({ title: t('new_event'), width: '27rem', cls: 'qdlg', onclose: () => onclose?.(),
    body: h('div.form', name, h('div.qwhen', icon('clock'), h('span', when)), cal,
      h('div.qmore', btn(t('more_options'), { size: 'sm', appearance: 'ghost', icon: 'sliders-horizontal', onclick: () => { d.hide(); editEvent(null, { ...init, title: name.value, cal: cal.value }, ctx); } }),
        btn(t('find_date'), { size: 'sm', appearance: 'ghost', icon: 'vote', title: t('find_date_t'), onclick: () => { d.hide(); ctx.startPick(init.allDay ? { day: init.startKey } : { start: iso(init.start), end: iso(init.end) }); } }))),
    actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: save }] });
  void done;
}

// ------------------------------------------------------------------ the editor

const REPEATS = ['', 'DAILY', 'WEEKLY', 'WEEKDAYS', 'MONTHLY', 'MONTHLY_N', 'YEARLY', 'CUSTOM'];

/**
 * o: the occurrence being changed (null: a new event). init: {start, end (ms) | allDay, startKey, endKey, title, cal,
 * copyOf} for a new one. The times are typed in the zone of the event.
 */
export function editEvent(o, init, ctx) {
  const e = o?.e || init?.copyOf || {};
  const viewTz = ctx.tz();
  let tz = e.tz || viewTz;
  let allDay = o ? o.allDay : !!init?.allDay;
  // the times shown: the occurrence that was opened (not the first of the series)
  let sMs = o ? o.s : init?.start ?? Date.now(), eMs = o ? o.en : init?.end ?? sMs + 3600e3;
  let sKey = o ? o.startKey : init?.startKey || dayKey(sMs, tz), eKey = o ? addDays(o.endKey, -1) : init?.endKey ? addDays(init.endKey, -1) : sKey;
  const ps = parts(sMs, tz), pe = parts(eMs, tz);

  const title = h('sav-input.etitle', { label: t('title_l'), value: o ? e.title : init?.title || '', maxlength: 255, autofocus: !o, placeholder: t('title_ph') });
  const allSw = h('sav-switch', { checked: allDay || null, size: 'sm' }, t('all_day'));
  const d1 = h('sav-date-picker', { label: t('start'), value: allDay ? sKey : `${ps.y}-${pad(ps.m)}-${pad(ps.d)}`, size: 'sm' });
  const t1 = h('sav-time-picker', { label: t('time'), value: `${pad(ps.h)}:${pad(ps.mi)}`, step: 5, size: 'sm' });
  const d2 = h('sav-date-picker', { label: t('end'), value: allDay ? eKey : `${pe.y}-${pad(pe.m)}-${pad(pe.d)}`, size: 'sm' });
  const t2 = h('sav-time-picker', { label: t('time'), value: `${pad(pe.h)}:${pad(pe.mi)}`, step: 5, size: 'sm' });
  const zone = select(t('timezone'), ZONES.map((z) => [z, z.replace(/_/g, ' ')]), tz, (v) => { tz = v; }, { searchable: true });
  const times = () => { t1.hidden = t2.hidden = zoneBox.hidden = allSw.checked; };
  allSw.addEventListener('change', times);
  // the end follows the start, keeping the length
  let lastStart = null;
  const startMs = () => { const [y, m, d] = keyParts(d1.value || sKey); const [hh, mi] = String(t1.value || '09:00').split(':').map(Number); return zoned(y, m, d, hh, mi, tz); };
  const endMs = () => { const [y, m, d] = keyParts(d2.value || d1.value || sKey); const [hh, mi] = String(t2.value || '10:00').split(':').map(Number); return zoned(y, m, d, hh, mi, tz); };
  const follow = () => { const a = startMs(); if (lastStart !== null) { const len = endMs() - lastStart; const b = a + Math.max(0, len); const p = parts(b, tz); d2.value = `${p.y}-${pad(p.m)}-${pad(p.d)}`; t2.value = `${pad(p.h)}:${pad(p.mi)}`; } lastStart = a; };
  lastStart = startMs();
  d1.addEventListener('change', follow); t1.addEventListener('change', follow);

  // repetition
  const r0 = parseRule(e.rrule);
  const wdOf = () => weekday(d1.value || sKey), dayOf = () => keyParts(d1.value || sKey)[2];
  const nthOf = () => { const d = dayOf(); return d + 7 > new Date(Date.UTC(...keyParts(d1.value || sKey).slice(0, 2), 0)).getUTCDate() ? -1 : Math.ceil(d / 7); };
  const kindOf = (r) => {
    if (!r) return '';
    if (r.interval > 1 || r.count || r.until || r.bymonth.length || r.bysetpos) return 'CUSTOM';
    if (r.freq === 'DAILY' && !r.byday.length) return 'DAILY';
    if (r.freq === 'WEEKLY' && r.byday.map((b) => b.wd).sort().join() === '0,1,2,3,4') return 'WEEKDAYS';
    if (r.freq === 'WEEKLY' && (!r.byday.length || (r.byday.length === 1 && r.byday[0].wd === wdOf()))) return 'WEEKLY';
    if (r.freq === 'MONTHLY' && !r.byday.length && !r.bymonthday.length) return 'MONTHLY';
    if (r.freq === 'MONTHLY' && r.byday.length === 1 && r.byday[0].n) return 'MONTHLY_N';
    if (r.freq === 'YEARLY' && !r.byday.length && !r.bymonthday.length) return 'YEARLY';
    return 'CUSTOM';
  };
  const repLabel = (k) => {
    const wd = new Intl.DateTimeFormat(getLang(), { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + wdOf())));
    return { '': t('rep_none'), DAILY: t('rep_daily'), WEEKLY: t('rep_weekly', { d: wd }), WEEKDAYS: t('rep_weekdays'), MONTHLY: t('rep_monthly', { n: dayOf() }), MONTHLY_N: t('rep_monthly_n', { n: t(nthOf() === -1 ? 'ord_last' : 'ord_' + nthOf()), d: wd }), YEARLY: t('rep_yearly', { d: dayLabel(d1.value || sKey, { day: 'numeric', month: 'long' }) }), CUSTOM: t('rep_custom') }[k];
  };
  let custom = r0 ? { ...r0 } : { freq: 'WEEKLY', interval: 1, byday: [{ n: 0, wd: wdOf() }], bymonthday: [], bymonth: [], wkst: 0 };
  const rep = select(t('repeat'), REPEATS.map((k) => [k, repLabel(k)]), kindOf(r0), () => drawCustom(), {});
  const refreshRep = () => { const v = rep.value; rep.replaceChildren(...REPEATS.map((k) => h('option', { value: k === '' ? '~' : k }, repLabel(k)))); rep.value = v; };
  d1.addEventListener('change', refreshRep);
  const customBox = h('div.custom');
  function drawCustom() {
    customBox.hidden = rep.value !== 'CUSTOM';
    if (customBox.hidden) return;
    const every = h('sav-number-input', { label: t('every'), value: custom.interval, min: 1, max: 99, size: 'sm' });
    every.addEventListener('change', () => { custom.interval = Math.max(1, parseInt(every.value, 10) || 1); });
    const unit = select(t('unit'), [['DAILY', t('u_days')], ['WEEKLY', t('u_weeks')], ['MONTHLY', t('u_months')], ['YEARLY', t('u_years')]], custom.freq, (v) => { custom.freq = v; drawCustom(); });
    const wds = custom.freq === 'WEEKLY' ? h('div.wdpick', Array.from({ length: 7 }, (_, i) => { const on = custom.byday.some((b) => b.wd === i); return h('button.wd' + (on ? '.on' : ''), { type: 'button', 'aria-pressed': String(on), title: new Intl.DateTimeFormat(getLang(), { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i))), onclick: () => { custom.byday = on ? custom.byday.filter((b) => b.wd !== i) : [...custom.byday, { n: 0, wd: i }]; if (!custom.byday.length) custom.byday = [{ n: 0, wd: wdOf() }]; drawCustom(); } }, new Intl.DateTimeFormat(getLang(), { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i)))); })) : null;
    const endKind = custom.count ? 'count' : custom.until ? 'until' : 'never';
    const ends = select(t('ends'), [['never', t('ends_never')], ['until', t('ends_until')], ['count', t('ends_count')]], endKind, (v) => { if (v === 'never') { delete custom.count; delete custom.until; } if (v === 'count') { delete custom.until; custom.count = custom.count || 10; } if (v === 'until') { delete custom.count; custom.until = (addDays(d1.value || sKey, 90)).replace(/-/g, ''); } drawCustom(); });
    const untilPick = endKind === 'until' ? h('sav-date-picker', { label: t('ends_until'), value: `${custom.until.slice(0, 4)}-${custom.until.slice(4, 6)}-${custom.until.slice(6, 8)}`, size: 'sm' }) : null;
    untilPick?.addEventListener('change', () => { if (untilPick.value) custom.until = untilPick.value.replace(/-/g, ''); });
    const countIn = endKind === 'count' ? h('sav-number-input', { label: t('times'), value: custom.count, min: 1, max: 999, size: 'sm' }) : null;
    countIn?.addEventListener('change', () => { custom.count = Math.max(1, parseInt(countIn.value, 10) || 1); });
    customBox.replaceChildren(h('div.grid2', every, unit), wds, h('div.grid2', ends, untilPick || countIn || h('span')));
  }
  const ruleNow = () => {
    const k = rep.value, wd = wdOf();
    if (!k) return '';
    const R = (x) => ruleText({ interval: 1, byday: [], bymonthday: [], bymonth: [], ...x });
    if (k === 'DAILY') return R({ freq: 'DAILY' });
    if (k === 'WEEKLY') return R({ freq: 'WEEKLY', byday: [{ n: 0, wd }] });
    if (k === 'WEEKDAYS') return R({ freq: 'WEEKLY', byday: [0, 1, 2, 3, 4].map((x) => ({ n: 0, wd: x })) });
    if (k === 'MONTHLY') return R({ freq: 'MONTHLY' });
    if (k === 'MONTHLY_N') return R({ freq: 'MONTHLY', byday: [{ n: nthOf(), wd }] });
    if (k === 'YEARLY') return R({ freq: 'YEARLY' });
    const c = { ...custom };
    if (c.freq !== 'WEEKLY') c.byday = c.byday.filter((b) => b.n);
    // UNTIL of a timed series: the end of that day in the zone of the event, in UTC (as RFC 5545 asks)
    if (c.until && c.until.length === 8 && !allSw.checked) { const [y, m, d] = [c.until.slice(0, 4), c.until.slice(4, 6), c.until.slice(6, 8)].map(Number); c.until = new Date(zoned(y, m, d, 23, 59, tz)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
    return ruleText(c);
  };

  const cals = own();
  const calSel = select(t('calendar'), cals.map((c) => [c.id, c.name]), o ? e.cal : init?.cal || (cals.find((c) => c.id === prefs().defaultCal) || cals.find((c) => c.visible) || cals[0])?.id, null);
  let color = e.color || '';
  const colorBtn = colorPop(t('color'), color || calById(calSel.value)?.color, (v) => { color = v; }, { list: CAL_COLORS, none: t('calendar_color') });
  const place = h('sav-input', { label: t('place'), value: e.place || '', maxlength: 255 }, icon('map-pin', { slot: 'prefix' }));
  const url = h('sav-input', { label: t('link'), value: e.url || '', type: 'url', maxlength: 500, placeholder: 'https://' }, icon('link', { slot: 'prefix' }));
  const descr = h('sav-textarea', { label: t('description'), value: e.descr || '', rows: 3, resize: 'auto', maxlength: 8000 });
  let busy = e.busy !== false, tent = e.status === 'tentative';
  const zoneBox = h('div', zone);
  if (e.recurId) { rep.hidden = true; customBox.hidden = true; } // a changed occurrence is one event: it does not repeat
  const body = h('div.form.eform', title, h('div.erow', allSw), h('div.grid2', d1, t1), h('div.grid2', d2, t2), zoneBox, rep, customBox, h('div.prow.end', calSel, h('div.cf', h('span.flabel', t('color')), colorBtn)), place,
    h('sav-details.pfold', { summary: t('more_details'), appearance: 'plain' }, h('div.stack', url, descr, toggle(t('show_busy'), busy, (v) => { busy = v; }), toggle(t('tentative_l'), tent, (v) => { tent = v; }))));
  times();
  drawCustom();
  if (e.recurId) customBox.hidden = true;
  for (const x of [title, place, url, descr]) x.addEventListener('keydown', (ev) => ev.stopPropagation());

  const save = async () => {
    const all = allSw.checked;
    let start, end;
    if (all) { start = d1.value; end = addDays(d2.value && d2.value >= d1.value ? d2.value : d1.value, 1); }
    else { const a = startMs(), b = endMs(); if (b < a) throw Object.assign(new Error(), { code: 'end_before' }); start = iso(a); end = iso(b); }
    if (!start) throw Object.assign(new Error(), { code: 'bad_time' });
    const x = { cal: calSel.value, title: title.value.trim(), allDay: all, start, end, tz, rrule: ruleNow(), place: place.value.trim(), url: url.value.trim(), descr: descr.value, busy, status: tent ? 'tentative' : 'confirmed', color };
    if (!o) { await api('cal.event.save', x); toast(t('saved'), 'success'); ctx.changed(); return; }
    const r = await saveChange(o, x, ctx);
    if (!r) return false;
    toast(t('saved'), 'success');
    ctx.changed();
  };
  dialog({ title: t(o ? 'edit_event' : 'new_event'), width: '34rem', body, cls: 'eedit', actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: save }] });
  void viewTz;
}

// ------------------------------------------------------------------ SavSchedules from the calendar

/** The dates chosen in the calendar become a poll or a sheet of slots (the same account), then open in SavSchedules. */
export function scheduleDialog(kind, picks, tz, done) {
  const name = h('sav-input', { label: t('title_l'), maxlength: 160, autofocus: true, placeholder: t(kind === 'poll' ? 'poll_ph' : 'slots_ph') });
  const place = h('sav-input', { label: t('place'), maxlength: 200 });
  const cap = h('sav-number-input', { label: t('places_each'), value: 1, min: 1, max: 500, size: 'sm' });
  const list = [...picks].sort((a, b) => String(a.day || a.start).localeCompare(String(b.day || b.start)));
  const items = h('ul.picklist', list.map((p) => h('li', icon(p.day ? 'calendar' : 'clock'), h('span', p.day ? longDay(p.day) : `${longDay(dayKey(Date.parse(p.start), tz))} · ${clock(Date.parse(p.start), tz)}–${clock(Date.parse(p.end), tz)}`))));
  for (const x of [name, place]) x.addEventListener('keydown', (ev) => ev.stopPropagation());
  dialog({ title: t(kind === 'poll' ? 'new_poll' : 'new_slots'), width: '30rem', body: h('div.form', h('p.muted', t(kind === 'poll' ? 'new_poll_t' : 'new_slots_t')), name, place, kind === 'slots' ? cap : null, h('sav-label', { appearance: 'plain', case: 'normal', variant: 'neutral' }, t('chosen_n', { n: list.length })), items),
    actions: [{ label: t('cancel') }, { label: t('create_open'), primary: true, run: async () => {
      if (!name.value.trim()) throw Object.assign(new Error(), { code: 'title_required' });
      const c = Math.max(1, parseInt(cap.value, 10) || 1);
      const r = await api('cal.sch.create', { kind, title: name.value.trim(), place: place.value.trim(), tz, options: list.map((p) => (p.day ? { day: p.day } : { start: p.start, end: p.end, cap: c })), settings: { color: 'blue' } });
      done?.();
      // open it here: the session is the same, so SavSchedules opens signed in, in its editor
      dialog({ title: t('created'), width: '26rem', body: h('div.form', empty(kind === 'poll' ? 'vote' : 'ticket', t('created_sch'), t('created_sch_t'))),
        actions: [{ label: t('stay_here') }, { label: t('open_in_sch'), primary: true, run: () => { location.href = r.edit; } }] });
    } }] });
}

// ------------------------------------------------------------------ search

export async function searchDialog(term, goDay) {
  const tz = prefs().tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const r = await api('cal.search', undefined, { q: term }).catch((e) => { fail(e); return null; });
  if (!r) return;
  const rows = r.events.map((e) => {
    const k = e.allDay ? e.start : dayKey(Date.parse(e.start), tz), c = calById(e.cal);
    return h('button.srow', { type: 'button', style: `--c:${e.color || c?.color || '#888'}`, onclick: () => { d.hide(); goDay(k); } }, h('i.dot'), h('div', h('b', e.title || t('no_title')), h('small.muted', `${longDay(k)}${e.allDay ? '' : ' · ' + clock(Date.parse(e.start), tz)}${e.rrule ? ' · ' + t('repeats') : ''} · ${c?.name || ''}`)));
  });
  const d = dialog({ title: t('results_for', { q: term }), width: '30rem', body: rows.length ? h('div.slist', rows) : empty('search', t('nothing_found'), ''), actions: [{ label: t('close') }] });
}

void copyText; void primary;
