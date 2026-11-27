/**
 * The time tracked (lib/track.php).
 *
 * - The timer: one at a time for the account, kept on the server with the moment it started, so it goes on across reloads
 *   and devices. While it runs it is always in the bar (timerBar), with what it is on and a stop button.
 * - A task shows its time in its detail (taskTime): the timer, the total and its spans.
 * - Spans written by hand (entryDialog): a day and from–to, or only a length; a note; billable or not.
 * - The view "Time" (#/time, timeView): the spans of a week, a month or the days chosen, by project or client (a list:
 *   the hierarchy SavTasks already has, with an optional hourly rate) and by task, with the totals of hours and
 *   amounts; saved as CSV, or opened in SavSpreadsheets: a .savspr is put into SavDrive and opened from there, the way
 *   SavDrive opens its files in the apps (../savspreadsheets/?savdrive=<id>).
 */
import { btn, confirm, dialog, dropBtn, empty, fail, h, icon, iconBtn, num, primary, put, segmented, select, toast } from './ui.js';
import { getLang, t } from './i18n.js';
import { S, api, listById } from './store.js';
import { prefs, setPrefs } from './account.js';
import { addDays, clock, dayLabel, keyParts, mondayOf, monthLabel, parts, todayKey, zoned } from './time.js';
import { zip } from './zip.js';
import { csvCell, download, fileName } from './files.js';

const tz = () => prefs().tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const today = () => todayKey(tz());
const pad = (n) => String(n).padStart(2, '0');
const stop = (n) => { n.addEventListener('keydown', (e) => e.stopPropagation()); return n; };
const COLOR = '#6a2cf0';

// ------------------------------------------------------------------ numbers

/** The currencies SavSpreadsheets knows too (settings of a workbook). */
export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CNY', 'INR', 'BRL', 'SEK', 'PLN'];
export const currency = () => (CURRENCIES.includes(prefs().currency) ? prefs().currency : 'EUR');
const locale = () => (getLang() === 'it' ? 'it-IT' : 'en-GB');
export const money = (n) => new Intl.NumberFormat(locale(), { style: 'currency', currency: currency() }).format(n || 0);
/** 0:42:07, the timer that runs. */
export const ticking = (sec) => { sec = Math.max(0, Math.floor(sec)); return `${Math.floor(sec / 3600)}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`; };
/** "2 h 05" or "45 min": a length. */
export const dur = (sec) => { const m = Math.round(sec / 60); return m < 60 ? t('tt_min', { n: m }) : t('tt_hm', { h: Math.floor(m / 60), m: pad(m % 60) }); };
/** Hours with two decimals (the files). */
const hoursOf = (sec) => Math.round(sec / 36) / 100;
/** The seconds of a span (the timer: until now). */
export const elapsed = (e) => (e.running ? Math.max(0, (Date.now() - Date.parse(e.start)) / 1000) : e.seconds);
const rateOf = (e) => (e.list && listById(e.list)?.rate) || 0;
const amountOf = (e) => (e.billable ? (elapsed(e) / 3600) * rateOf(e) : 0);
const projectName = (id) => (id && listById(id)?.name) || t('tt_no_project');

// ------------------------------------------------------------------ the timer

/** The time of a task, all of it (the timer included while it runs on it). */
export const taskTotal = (id) => (S.timeTotals?.[id] || 0) + (S.timer?.task === id ? elapsed(S.timer) : 0);
const bump = (e, sign = 1) => { if (e?.task && !e.running) { S.timeTotals[e.task] = Math.max(0, (S.timeTotals[e.task] || 0) + sign * e.seconds); } };
const changed = () => { paintTimers(); dispatchEvent(new CustomEvent('savtasks-timer')); };

let ticker = 0;
/** Every second, while a timer runs: the clocks on screen (in the bar, in the rows, in the detail). */
function tick() {
  if (!S.timer) { clearInterval(ticker); ticker = 0; return; }
  const s = ticking(elapsed(S.timer));
  document.querySelectorAll('.ttclock').forEach((n) => { if (n.textContent !== s) n.textContent = s; });
}
const startTicking = () => { if (S.timer && !ticker) ticker = setInterval(tick, 1000); };

export async function startTimer(o = {}) {
  const r = await api('tasks.time.start', { task: o.task || undefined, list: o.task ? undefined : o.list || undefined, tz: tz() });
  bump(r.stopped);
  S.timer = r.timer;
  changed();
  return r;
}
export async function stopTimer() {
  const r = await api('tasks.time.stop', {});
  S.timer = null;
  if (r.entry) { bump(r.entry); toast(t('tt_stopped', { d: dur(r.entry.seconds) }), 'success'); }
  changed();
  return r;
}

/** The timer in the bar: what it is on (pressed: its task), how long, and stop; hidden while nothing runs. */
export function timerBar(redraw) {
  const el = h('div.ttimer', { hidden: true });
  el.redraw = redraw;
  paintBar(el);
  return el;
}
function paintBar(el) {
  const x = S.timer;
  el.hidden = !x;
  if (!x) return put(el);
  const name = x.title || (x.list && listById(x.list)?.name) || t('tt_no_task');
  const open = h('sav-button.ttgo', { size: 'sm', variant: 'primary', appearance: 'soft', title: t('tt_running_on', { t: name }), 'aria-label': t('tt_running_on', { t: name }),
    onclick: () => { location.hash = x.task ? '#/t/' + x.task : '#/time'; } }, icon('timer', { slot: 'prefix' }), h('span.ttname', name), h('b.ttclock', ticking(elapsed(x))));
  const end = iconBtn('square', t('tt_stop'), async (b) => { if (b.loading) return; b.loading = true; try { await stopTimer(); el.redraw?.(); } finally { b.loading = false; } }, { variant: 'danger', appearance: 'soft', class: 'ttstop' });
  put(el, open, end);
}
/** The bar again (the timer started, stopped, or came from another device with the data read again). */
export function paintTimers() {
  document.querySelectorAll('.ttimer').forEach(paintBar);
  startTicking();
}

/** In the row of a task: start the timer on it, or stop it when it runs there. */
export function rowTimer(x, redraw) {
  const on = S.timer?.task === x.id;
  const b = h('sav-button.tplay' + (on ? '.on' : ''), { icon: on ? 'square' : 'play', label: t(on ? 'tt_stop' : 'tt_start'), title: t(on ? 'tt_stop' : 'tt_start'), appearance: on ? 'soft' : 'ghost', variant: on ? 'danger' : 'neutral', size: 'sm', square: true });
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (b.loading) return;
    b.loading = true;
    try { if (on) await stopTimer(); else { await startTimer({ task: x.id }); toast(t('tt_started_on', { t: x.title }), 'success'); } redraw?.(); } catch (err) { fail(err); } finally { b.loading = false; }
  });
  b.addEventListener('keydown', (e) => e.stopPropagation());
  return b;
}
/** The meta of a row: the time of the task (the clock while the timer runs on it). */
export function timeMeta(x) {
  const on = S.timer?.task === x.id, total = taskTotal(x.id);
  if (!on && total < 60) return null;
  return h('span.m.mtime' + (on ? '.on' : ''), { title: t('tt_time') + ': ' + dur(total) }, icon('timer'), on ? h('span.ttclock', ticking(elapsed(S.timer))) : dur(total));
}

// ------------------------------------------------------------------ one span

/** A span in a list: what (or the note), when, how long, the amount. */
function entryRow(e, after, o = {}) {
  const span = e.running ? t('tt_running') : e.start && e.end ? clock(Date.parse(e.start), tz()) + '–' + clock(Date.parse(e.end), tz()) : '';
  const what = o.inTask ? (e.note || t('tt_no_note')) : (e.title || projectName(e.list));
  const sub = [o.inTask ? dayLabel(e.day) : e.note, span, !o.inTask && e.title && e.list ? projectName(e.list) : null].filter(Boolean).join(' · ');
  const amt = amountOf(e);
  const open = () => entryDialog(e, {}, after);
  return h('div.terow' + (e.running ? '.on' : ''), { role: 'button', tabindex: 0, onclick: open, onkeydown: (ev) => { if (ev.key === 'Enter' && ev.target === ev.currentTarget) open(); } },
    h('i.tedot', { style: `--c:${(e.list && listById(e.list)?.color) || 'var(--sav-color-border-strong, #9aa)'}` }),
    h('div.teinfo', h('b', what), sub ? h('small.muted', sub) : null),
    e.billable ? h('sav-tag', { size: 'sm', appearance: 'soft', variant: 'success', title: t('tt_billable') }, amt ? money(amt) : t('tt_billable')) : null,
    h('span.tedur', e.running ? h('span.ttclock', ticking(elapsed(e))) : dur(e.seconds)));
}

/**
 * A span written by hand, or a change to one (also the timer that runs: what it is on, its note, when it started).
 * init: {task, list, day} for a new one. after(entry or null) once saved or deleted.
 */
export function entryDialog(e, init = {}, after) {
  const isNew = !e, running = !!e?.running;
  let listId = e ? e.list || '' : init.list || '', taskId = e ? e.task || '' : init.task || '';
  const lists = S.lists.filter((l) => (!l.archived && l.view !== 'habits') || l.id === listId);
  const taskBox = h('div');
  const paintTasks = () => {
    const mine = S.tasks.filter((x) => x.list === listId && (!x.done || x.id === taskId)).sort((a, b) => a.title.localeCompare(b.title, getLang()));
    const opts = [['', t('tt_no_task')], ...mine.map((x) => [x.id, x.title || t('no_title')])];
    if (taskId && !opts.some(([v]) => v === taskId)) opts.push([taskId, e?.title || t('no_title')]); // a task done long ago
    put(taskBox, select(t('task'), opts, taskId, (v) => { taskId = v; }));
  };
  const bill = h('sav-switch', { checked: (e ? e.billable : !!listById(listId)?.rate) || null, size: 'sm' }, t('tt_billable'));
  const listSel = select(t('tt_project'), [['', t('tt_no_project')], ...lists.map((l) => [l.id, l.name + (l.rate ? ' · ' + money(l.rate) + '/h' : '')])], listId, (v) => {
    listId = v; taskId = ''; paintTasks();
    if (isNew) bill.checked = !!listById(v)?.rate;
  });
  paintTasks();
  const now = Date.now(), round = (ms) => Math.floor(ms / 300000) * 300000;
  const day = stop(h('sav-date-picker', { label: t('day'), value: e?.day || init.day || today(), size: 'sm' }));
  const hasSpan = e ? running || !!(e.start && e.end) : true;
  let mode = hasSpan ? 'span' : 'len';
  const from = stop(h('sav-time-picker', { label: t(running ? 'tt_started_at' : 'from'), value: e?.start ? clock(Date.parse(e.start), tz()) : clock(round(now) - 3600000, tz()), size: 'sm', step: 5 }));
  const to = stop(h('sav-time-picker', { label: t('tt_to'), value: e?.end ? clock(Date.parse(e.end), tz()) : clock(round(now), tz()), size: 'sm', step: 5 }));
  const hh = num(t('tt_hours'), e && !hasSpan ? Math.floor(e.seconds / 3600) : 1, () => {}, { min: 0, max: 24 });
  const mm = num(t('tt_minutes'), e && !hasSpan ? Math.round(e.seconds / 60) % 60 : 0, () => {}, { min: 0, max: 59, step: 5 });
  const spanBox = h('div.grid2', from, running ? null : to), lenBox = h('div.grid2', hh, mm);
  const upd = () => { spanBox.hidden = mode !== 'span'; lenBox.hidden = mode !== 'len'; };
  const how = running ? null : segmented(t('tt_how'), mode, [['span', '=' + t('tt_from_to'), t('tt_from_to')], ['len', '=' + t('tt_length'), t('tt_length')]], (v) => { mode = v; upd(); }, { class: 'wide' });
  upd();
  const note = stop(h('sav-input', { label: t('tt_note'), value: e?.note || '', maxlength: 500, placeholder: t('tt_note_ph') }));
  const save = async () => {
    if (!day.value) throw Object.assign(new Error(), { code: 'bad_time' });
    const body = { task: taskId || null, list: taskId ? null : listId || null, day: day.value, note: note.value.trim(), billable: !!bill.checked, tz: tz() };
    if (e) body.id = e.id;
    if (running) body.start = from.value || undefined;
    else if (mode === 'span') { if (!from.value || !to.value) throw Object.assign(new Error(), { code: 'bad_time' }); body.start = from.value; body.end = to.value; } else body.minutes = (parseFloat(String(hh.value).replace(',', '.')) || 0) * 60 + (parseFloat(String(mm.value).replace(',', '.')) || 0);
    const r = await api('tasks.time.save', body);
    bump(e, -1); bump(r.entry);
    if (r.entry.running) S.timer = r.entry;
    changed();
    toast(t('tt_saved'), 'success');
    after?.(r.entry);
  };
  const remove = async () => {
    if (!(await confirm(t('tt_delete'), t('tt_delete_t'), t('delete')))) return false;
    await api('tasks.time.delete', { id: e.id });
    bump(e, -1);
    toast(t('tt_deleted'), 'success');
    after?.(null);
    return undefined;
  };
  dialog({ title: t(isNew ? 'tt_new' : running ? 'tt_running_t' : 'tt_edit'), width: '30rem', cls: 'tedlg',
    body: h('div.form', h('div.grid2', listSel, taskBox), day, how, spanBox, lenBox, note, bill),
    actions: [isNew || running ? null : { label: t('delete'), icon: 'trash', run: remove }, { label: t('cancel') }, { label: t(isNew ? 'add' : 'save'), primary: true, run: save }].filter(Boolean) });
}

// ------------------------------------------------------------------ in the detail of a task

/** The time of a task: the timer, the total, add by hand, and its spans (newest first). */
export function taskTime(x, ctx) {
  const box = h('section.dsec.dtime');
  let entries = null;
  const load = async () => { try { entries = (await api('tasks.time.list', undefined, { task: x.id })).entries.filter((e) => !e.running); } catch { entries = entries || []; } paint(); };
  const after = () => { load(); ctx.redraw(); };
  const paint = () => {
    const on = S.timer?.task === x.id;
    const go = on
      ? btn([t('tt_stop'), ' ', h('b.ttclock', ticking(elapsed(S.timer)))], { icon: 'square', variant: 'danger', appearance: 'soft', size: 'sm', onclick: async () => { await stopTimer(); after(); } })
      : primary(t('tt_start'), { icon: 'play', size: 'sm', onclick: async () => { await startTimer({ task: x.id }); ctx.redraw(); paint(); } });
    const add = btn(t('tt_add'), { icon: 'plus', size: 'sm', appearance: 'ghost', onclick: () => entryDialog(null, { task: x.id, list: x.list }, after) });
    const rows = (entries || []).map((e) => entryRow(e, after, { inTask: true }));
    put(box, h('sav-label', { appearance: 'plain', case: 'normal', variant: 'neutral' }, t('tt_time')),
      h('div.dtt', go, h('span.dttot', h('small.muted', t('tt_total')), h('b', dur(taskTotal(x.id)))), add),
      entries === null ? h('sav-spinner') : rows.length ? h('div.telist', rows.slice(0, 5), rows.length > 5 ? h('sav-details', { summary: t('tt_more', { n: rows.length - 5 }), appearance: 'plain' }, h('div.telist', rows.slice(5))) : null) : null);
  };
  const onTimer = () => { if (!box.isConnected) return removeEventListener('savtasks-timer', onTimer); paint(); };
  addEventListener('savtasks-timer', onTimer);
  paint();
  load();
  return box;
}

// ------------------------------------------------------------------ the view "Time"

const VIEW_KEY = 'savtasks-time-view';
const tv = (() => { let v = {}; try { v = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}') || {}; } catch { /* private mode */ } return { mode: ['week', 'month', 'range'].includes(v.mode) ? v.mode : 'week', list: v.list || '', bill: v.bill || '', anchor: null, from: null, to: null }; })();
const keepView = () => { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ mode: tv.mode, list: tv.list, bill: tv.bill })); } catch { /* private mode */ } };
const lastOfMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The days of the view: [from, to]. */
function period() {
  const k = tv.anchor || today();
  if (tv.mode === 'week') { const a = mondayOf(k); return [a, addDays(a, 6)]; }
  if (tv.mode === 'month') { const [y, m] = keyParts(k); return [`${y}-${pad(m)}-01`, `${y}-${pad(m)}-${pad(lastOfMonth(y, m))}`]; }
  const b = tv.to || today(), a = tv.from || addDays(b, -29);
  return a <= b ? [a, b] : [b, a];
}
function periodText([a, b]) {
  if (tv.mode === 'month') return monthLabel(a);
  const [ya] = keyParts(a), [yb] = keyParts(b);
  return dayLabel(a, { day: 'numeric', month: 'short', year: ya !== yb ? 'numeric' : undefined }) + ' – ' + dayLabel(b, { day: 'numeric', month: 'short', year: 'numeric' });
}
function shift(dir) {
  const k = tv.anchor || today();
  if (tv.mode === 'week') tv.anchor = addDays(k, 7 * dir);
  else { const [y, m] = keyParts(k); const d = new Date(Date.UTC(y, m - 1 + dir, 1)); tv.anchor = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`; }
}

let cache = { key: '', entries: null };

/** The spans of the view, with the filters (project or client, billable). */
const filtered = (entries) => entries.filter((e) => (!tv.list || (tv.list === '-' ? !e.list : e.list === tv.list)) && (!tv.bill || (tv.bill === 'yes') === !!e.billable));

/** Totals: all, by project (list), by task, by day. */
function totals(entries) {
  const all = { sec: 0, bill: 0, amount: 0 }, byList = new Map(), byTask = new Map(), byDay = new Map();
  for (const e of entries) {
    const sec = elapsed(e), amt = amountOf(e);
    all.sec += sec; all.amount += amt; if (e.billable) all.bill += sec;
    const lk = e.list || '';
    if (!byList.has(lk)) byList.set(lk, { list: lk, sec: 0, bill: 0, amount: 0 });
    const L = byList.get(lk); L.sec += sec; L.amount += amt; if (e.billable) L.bill += sec;
    const tk = e.task || '~' + lk + '~' + (e.title || '');
    if (!byTask.has(tk)) byTask.set(tk, { task: e.task, title: e.title || t('tt_no_task'), list: lk, sec: 0, amount: 0 });
    const T = byTask.get(tk); T.sec += sec; T.amount += amt;
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day).push(e);
  }
  const bySec = (a, b) => b.sec - a.sec;
  return { all, lists: [...byList.values()].sort(bySec), tasks: [...byTask.values()].sort(bySec), days: [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)) };
}

/** #/time: the reports of the time tracked. */
export function timeView(main, ctx) {
  const per = period(), key = per.join('/');
  const redraw = () => { keepView(); timeView(main, ctx); };
  const add = primary(t('tt_add'), { icon: 'plus', size: 'sm', onclick: () => entryDialog(null, { list: tv.list && tv.list !== '-' ? tv.list : '', day: per[1] < today() ? per[1] : today() }, () => { cache.key = ''; redraw(); }) });
  const exp = dropBtn('download', t('tt_export'), () => [
    ['file-down', t('tt_csv'), () => saveCsv(filtered(cache.entries || []), per)],
    ['file-spreadsheet', t('tt_sheets'), () => openInSheets(filtered(cache.entries || []), per)],
  ], { text: true, appearance: 'outline', placement: 'bottom-end' });
  const rates = iconBtn('coins', t('tt_rates'), () => ratesDialog(redraw));
  const head = h('div.vhead', { style: `--c:${COLOR}` },
    h('span.vicon', icon('timer')),
    h('div.vtitle', h('h1', t('v_time')), h('small.muted', periodText(per))),
    h('div.spacer'), h('div.prow.tvacts', rates, exp, add));

  const modeSel = segmented(t('tt_period'), tv.mode, [['week', '=' + t('tt_week'), t('tt_week')], ['month', '=' + t('tt_month'), t('tt_month')], ['range', '=' + t('tt_range'), t('tt_range')]], (v) => { tv.mode = v; tv.anchor = null; redraw(); }, { class: 'tvmode' });
  let nav;
  if (tv.mode === 'range') {
    const a = stop(h('sav-date-picker', { label: t('from'), value: per[0], size: 'sm' })), b = stop(h('sav-date-picker', { label: t('tt_to'), value: per[1], size: 'sm' }));
    const set = () => { if (a.value && b.value) { tv.from = a.value; tv.to = b.value; redraw(); } };
    a.addEventListener('change', set); b.addEventListener('change', set);
    nav = h('div.tvrange', a, b);
  } else {
    const isNow = per[0] <= today() && today() <= per[1];
    nav = h('div.tvnav', iconBtn('chevron-left', t('tt_prev'), () => { shift(-1); redraw(); }), iconBtn('chevron-right', t('tt_next'), () => { shift(1); redraw(); }),
      isNow ? null : btn(t(tv.mode === 'week' ? 'tt_this_week' : 'tt_this_month'), { size: 'sm', appearance: 'ghost', onclick: () => { tv.anchor = null; redraw(); } }));
  }
  const lists = S.lists.filter((l) => l.view !== 'habits');
  const listSel = select(null, [['', t('tt_all_projects')], ...lists.map((l) => [l.id, l.name]), ['-', t('tt_no_project')]], tv.list, (v) => { tv.list = v; redraw(); }, { 'aria-label': t('tt_project'), class: 'tvsel' });
  const billSel = select(null, [['', t('tt_all')], ['yes', t('tt_only_bill')], ['no', t('tt_only_nonbill')]], tv.bill, (v) => { tv.bill = v; redraw(); }, { 'aria-label': t('tt_billable'), class: 'tvsel' });
  const tools = h('div.tvtools', modeSel, nav, h('div.spacer'), listSel, billSel);
  const body = h('div.vbody.tvbody');
  put(main, head, tools, body);

  const draw = () => {
    if (cache.key !== key || !cache.entries) return put(body, h('div.wait', h('sav-spinner', { style: 'font-size:1.6rem' })));
    put(body, report(filtered(cache.entries), ctx, () => { cache.key = ''; redraw(); }));
  };
  draw();
  api('tasks.time.list', undefined, { from: per[0], to: per[1] }).then((r) => {
    cache = { key, entries: r.entries };
    if (JSON.stringify(r.timer) !== JSON.stringify(S.timer)) { S.timer = r.timer; paintTimers(); }
    if (main.contains(body)) draw();
  }).catch((e) => { fail(e); if (main.contains(body)) put(body, empty('circle-alert', t('err_server'), '')); });
}

function report(entries, ctx, after) {
  if (!entries.length) return empty('timer', t('tt_empty'), t('tt_empty_t'));
  const T = totals(entries), cur = currency();
  const anyRate = T.lists.some((x) => x.list && listById(x.list)?.rate);
  const stat = (label, value, ic) => h('sav-stat', { label, value, icon: ic });
  const table = (cols, rows, foot) => h('sav-table', { compact: true, hover: true },
    h('table', h('thead', h('tr', cols.map(([l, c]) => h('th' + (c ? '.' + c : ''), l)))), h('tbody', rows), foot ? h('tfoot', foot) : null));
  const swatch = (id) => h('i.tedot', { style: `--c:${(id && listById(id)?.color) || '#9aa29d'}` });
  const projRows = T.lists.map((x) => { const l = x.list && listById(x.list); return h('tr', h('td', h('span.tvname', swatch(x.list), projectName(x.list))), h('td.tvn', dur(x.sec)), h('td.tvn', dur(x.bill)), h('td.tvn', l?.rate ? money(l.rate) + '/h' : '—'), h('td.tvn', x.amount ? money(x.amount) : '—')); });
  const projFoot = h('tr.tvtot', h('td', t('tt_total')), h('td.tvn', dur(T.all.sec)), h('td.tvn', dur(T.all.bill)), h('td.tvn', ''), h('td.tvn', money(T.all.amount)));
  const taskRows = T.tasks.map((x) => h('tr', h('td', x.task ? h('a.tvlink', { href: '#/t/' + x.task }, x.title) : h('span.muted', x.title)), h('td', h('span.tvname', swatch(x.list), projectName(x.list))), h('td.tvn', dur(x.sec)), h('td.tvn', x.amount ? money(x.amount) : '—')));
  return [
    h('div.tvstats', stat(t('tt_hours_total'), dur(T.all.sec), 'clock'), stat(t('tt_billable_h'), dur(T.all.bill), 'circle-check'), stat(t('tt_amount') + ' (' + cur + ')', money(T.all.amount), 'coins')),
    !anyRate ? h('p.muted.small.tvhint', icon('info'), ' ', t('tt_no_rates')) : null,
    h('section.tgroup', h('h2.ghead', t('tt_by_project')), table([[t('tt_project')], [t('tt_hours'), 'tvn'], [t('tt_billable_h'), 'tvn'], [t('tt_rate'), 'tvn'], [t('tt_amount'), 'tvn']], projRows, projFoot)),
    h('section.tgroup', h('h2.ghead', t('tt_by_task')), table([[t('task')], [t('tt_project')], [t('tt_hours'), 'tvn'], [t('tt_amount'), 'tvn']], taskRows)),
    h('section.tgroup', h('h2.ghead', t('tt_entries'), h('small', String(entries.length)))),
    T.days.map(([d, list]) => h('section.tvday', h('h3.ghead', dayLabel(d, { weekday: 'long', day: 'numeric', month: 'long' }), h('small', dur(list.reduce((n, e) => n + elapsed(e), 0)))),
      h('div.telist', list.map((e) => entryRow(e, () => { after(); ctx.redraw(); }))))),
  ];
}

/** The hourly rates of the lists (projects and clients) and the currency, in one dialog. */
function ratesDialog(after) {
  const cur = select(t('tt_currency'), CURRENCIES.map((c) => [c, c]), currency());
  const lists = S.lists.filter((l) => !l.archived && l.view !== 'habits');
  const fields = lists.map((l) => { const n = num(l.name, l.rate ?? '', () => {}, { min: 0, max: 100000, step: 1, empty: true, unit: '/h', placeholder: '—' }); n.dataset.id = l.id; return n; });
  dialog({ title: t('tt_rates'), width: '28rem', body: h('div.form', h('p.muted', t('tt_rates_t')), cur, h('div.trates', fields)), actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => {
    if (cur.value && cur.value !== currency()) await setPrefs({ currency: cur.value });
    for (const n of fields) {
      const l = listById(n.dataset.id), raw = String(n.value ?? '').trim(), v = raw === '' ? null : parseFloat(raw.replace(',', '.'));
      if (raw !== '' && !Number.isFinite(v)) throw Object.assign(new Error(), { code: 'bad_rate' });
      const rate = v && v > 0 ? Math.round(v * 100) / 100 : null;
      if (rate !== (l.rate ?? null)) Object.assign(l, (await api('tasks.list.save', { id: l.id, rate })).list);
    }
    after();
  } }] });
}

// ------------------------------------------------------------------ files

const fileTitle = ([a, b]) => `SavTasks ${t('v_time')} ${a} ${b}`;
const spanOf = (e) => [e.start ? clock(Date.parse(e.start), tz()) : '', e.end ? clock(Date.parse(e.end), tz()) : ''];
const sortOld = (entries) => [...entries].sort((a, b) => (a.day + (a.start || '')).localeCompare(b.day + (b.start || '')));

/** The spans of the view as CSV: one row each, then the totals by project and of all. */
function saveCsv(entries, per) {
  const yes = t('tt_yes'), no = t('tt_no'), cur = currency();
  const rows = [[t('day'), t('from'), t('tt_to'), t('tt_hours'), t('tt_project'), t('task'), t('tt_note'), t('tt_billable'), t('tt_rate') + ` (${cur}/h)`, t('tt_amount') + ` (${cur})`]];
  for (const e of sortOld(entries)) { const [a, b] = spanOf(e); rows.push([e.day, a, b, hoursOf(elapsed(e)).toFixed(2), e.list ? projectName(e.list) : '', e.title, e.note, e.billable ? yes : no, rateOf(e) ? rateOf(e).toFixed(2) : '', amountOf(e).toFixed(2)]); }
  const T = totals(entries);
  rows.push([]);
  for (const x of T.lists) rows.push([t('tt_total') + ': ' + projectName(x.list), '', '', hoursOf(x.sec).toFixed(2), x.list ? projectName(x.list) : '', '', '', hoursOf(x.bill).toFixed(2), '', x.amount.toFixed(2)]);
  rows.push([t('tt_total'), '', '', hoursOf(T.all.sec).toFixed(2), '', '', '', hoursOf(T.all.bill).toFixed(2), '', T.all.amount.toFixed(2)]);
  download(new Blob(['﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }), fileName(fileTitle(per), 'csv'));
}

/**
 * The spans of the view as a workbook of SavSpreadsheets (.savspr: see ../savspreadsheets/assets/files.js): a sheet with
 * the spans (hours, rate, amount as formulas) and their total, and a sheet with the totals by project and by task
 * (SUMIF over the first sheet), so they follow any change made there.
 */
async function workbook(entries, per) {
  const L = getLang() === 'it' ? 'it' : 'en', cur = currency();
  const hx = (sec) => sec / 3600; // exact hours: the sheet shows two decimals, its sums and amounts stay right
  const sym = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', JPY: '¥', CNY: '¥', INR: '₹', BRL: 'R$', SEK: 'kr', PLN: 'zł' }[cur];
  const nfMoney = L === 'it' && !['$', '£'].includes(sym) ? `#,##0.00 "${sym}"` : `"${sym}"#,##0.00`;
  const serial = (k) => { const [y, m, d] = keyParts(k); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5; };
  const frac = (iso) => { const p = parts(Date.parse(iso), tz()); return (p.h * 60 + p.mi) / 1440; };
  const dateFmt = 'dd/mm/yyyy', head = { b: 1, bg: '#ede9fe' }, bold = { b: 1 };
  const E = t('tt_sheet_entries'), list = sortOld(entries), n = list.length, last = n + 1;
  const noTask = t('tt_no_task');
  // the spans: A day, B from, C to, D hours, E project, F task, G note, H billable, I rate, J amount, K billable hours
  const c1 = {};
  [t('day'), t('from'), t('tt_to'), t('tt_hours'), t('tt_project'), t('task'), t('tt_note'), t('tt_billable'), t('tt_rate'), t('tt_amount'), t('tt_billable_h')].forEach((v, i) => { c1[String.fromCharCode(65 + i) + 1] = { v, s: head }; });
  list.forEach((e, i) => {
    const r = i + 2, hrs = hx(elapsed(e)), rate = rateOf(e);
    c1['A' + r] = { v: serial(e.day), s: { nf: dateFmt } };
    if (e.start) c1['B' + r] = { v: frac(e.start), s: { nf: 'hh:mm' } };
    if (e.end) c1['C' + r] = { v: frac(e.end), s: { nf: 'hh:mm' } };
    c1['D' + r] = { v: hrs, s: { nf: '0.00' } };
    c1['E' + r] = { v: projectName(e.list) };
    c1['F' + r] = { v: e.title || noTask };
    if (e.note) c1['G' + r] = { v: e.note };
    c1['H' + r] = { v: !!e.billable };
    if (rate) c1['I' + r] = { v: rate, s: { nf: nfMoney } };
    c1['J' + r] = { f: `=IF(H${r},D${r}*I${r},0)`, v: e.billable ? Math.round(hrs * rate * 100) / 100 : 0, s: { nf: nfMoney } };
    c1['K' + r] = { f: `=IF(H${r},D${r},0)`, v: e.billable ? hrs : 0, s: { nf: '0.00' } };
  });
  const T = totals(entries), tr = last + 1;
  c1['A' + tr] = { v: t('tt_total'), s: bold };
  c1['D' + tr] = { f: `=SUM(D2:D${last})`, v: hx(T.all.sec), s: { b: 1, nf: '0.00' } };
  c1['J' + tr] = { f: `=SUM(J2:J${last})`, v: Math.round(T.all.amount * 100) / 100, s: { b: 1, nf: nfMoney } };
  c1['K' + tr] = { f: `=SUM(K2:K${last})`, v: hx(T.all.bill), s: { b: 1, nf: '0.00' } };
  const col = (k) => `${E}!$${k}$2:$${k}$${last}`;
  // the totals: by project, then by task
  const c2 = { A1: { v: t('tt_report_title', { a: dayLabel(per[0], { day: 'numeric', month: 'long', year: 'numeric' }), b: dayLabel(per[1], { day: 'numeric', month: 'long', year: 'numeric' }) }), s: { b: 1, fz: 14 } } };
  let r = 3;
  [t('tt_project'), t('tt_hours'), t('tt_billable_h'), t('tt_rate'), t('tt_amount')].forEach((v, i) => { c2[String.fromCharCode(65 + i) + r] = { v, s: head }; });
  const p0 = r + 1;
  for (const x of T.lists) {
    r++;
    const rate = x.list && listById(x.list)?.rate;
    c2['A' + r] = { v: projectName(x.list) };
    c2['B' + r] = { f: `=SUMIF(${col('E')},A${r},${col('D')})`, v: hx(x.sec), s: { nf: '0.00' } };
    c2['C' + r] = { f: `=SUMIF(${col('E')},A${r},${col('K')})`, v: hx(x.bill), s: { nf: '0.00' } };
    if (rate) c2['D' + r] = { v: rate, s: { nf: nfMoney } };
    c2['E' + r] = { f: `=SUMIF(${col('E')},A${r},${col('J')})`, v: Math.round(x.amount * 100) / 100, s: { nf: nfMoney } };
  }
  r++;
  c2['A' + r] = { v: t('tt_total'), s: bold };
  c2['B' + r] = { f: `=SUM(B${p0}:B${r - 1})`, v: hx(T.all.sec), s: { b: 1, nf: '0.00' } };
  c2['C' + r] = { f: `=SUM(C${p0}:C${r - 1})`, v: hx(T.all.bill), s: { b: 1, nf: '0.00' } };
  c2['E' + r] = { f: `=SUM(E${p0}:E${r - 1})`, v: Math.round(T.all.amount * 100) / 100, s: { b: 1, nf: nfMoney } };
  r += 2;
  [t('task'), t('tt_project'), t('tt_hours'), t('tt_amount')].forEach((v, i) => { c2[String.fromCharCode(65 + i) + r] = { v, s: head }; });
  for (const x of T.tasks) {
    r++;
    c2['A' + r] = { v: x.title };
    c2['B' + r] = { v: projectName(x.list) };
    c2['C' + r] = { f: `=SUMIFS(${col('D')},${col('F')},A${r},${col('E')},B${r})`, v: hx(x.sec), s: { nf: '0.00' } };
    c2['D' + r] = { f: `=SUMIFS(${col('J')},${col('F')},A${r},${col('E')},B${r})`, v: Math.round(x.amount * 100) / 100, s: { nf: nfMoney } };
  }
  const w = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { w: v }]));
  const book = { format: 'savspr', version: 1, title: fileTitle(per), settings: { lang: L, currency: cur, accent: '#6a2cf0' },
    sheets: [
      { id: 'sumr', name: t('tt_sheet_summary'), cells: c2, cols: w({ A: 260, B: 150, C: 110, D: 100, E: 120 }) },
      { id: 'ents', name: E, cells: c1, cols: w({ A: 92, B: 64, C: 64, D: 64, E: 160, F: 220, G: 240, H: 92, I: 96, J: 110, K: 110 }), freeze: { r: 1, c: 0 } },
    ] };
  const MIME = 'application/vnd.savspreadsheets.workbook+zip';
  return new Blob([await zip([['mimetype', MIME, { store: true }], ['workbook.json', JSON.stringify(book)]], MIME)], { type: MIME });
}

/**
 * "Open in SavSpreadsheets": the workbook goes into SavDrive (My drive, the account of SavDrive signed in in this
 * browser) and opens in SavSpreadsheets from there, as SavDrive opens a file. Without SavDrive the file is downloaded.
 */
async function openInSheets(entries, per) {
  // now, while the press is still fresh (no blocked window); not in the Android app, whose WebView would load it in place
  const win = /SavTasksApp\/Android/.test(navigator.userAgent) ? null : window.open('about:blank', '_blank');
  let blob, name;
  try { blob = await workbook(entries, per); name = fileName(fileTitle(per), 'savspr'); } catch (e) { win?.close(); throw e; }
  const drive = (r) => '../savdrive/api/?r=' + r;
  const me = await fetch(drive('auth.me'), { credentials: 'same-origin', cache: 'no-store' }).then((r) => r.json()).catch(() => null);
  if (!me?.user?.activated || !me.csrf) {
    win?.close();
    download(blob, name);
    const a = toast(t('tt_sheet_nodrive'), 'warning', { duration: 9000 });
    a?.append(h('sav-button', { size: 'sm', appearance: 'outline', variant: 'neutral', slot: 'action', style: 'margin-left:.6rem', href: '../savdrive/', target: '_blank' }, 'SavDrive'));
    return;
  }
  const post = async (r, body, q = '') => {
    const raw = body instanceof Blob;
    const res = await fetch(drive(r) + q, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': raw ? 'application/octet-stream' : 'application/json', 'X-CSRF-Token': me.csrf }, body: raw ? body : JSON.stringify(body) });
    const d = await res.json().catch(() => ({ ok: false, error: 'server' }));
    if (!res.ok && d.error !== 'offset') throw Object.assign(new Error(d.error || 'server'), { code: d.error || 'server' });
    return d;
  };
  try {
    const st = await post('upload.start', { name, size: blob.size, mime: blob.type, folder: null, replace: null, conflict: 'rename' });
    let d = st, off = 0;
    while (!d.done) { d = await post('upload.chunk', blob.slice(off, off + (st.chunk || 4194304)), `&id=${st.upload}&offset=${off}`); off = d.received ?? off; }
    const url = '../savspreadsheets/?savdrive=' + encodeURIComponent(d.item.id);
    if (win) win.location.href = url; else location.href = url;
    toast(t('tt_sheet_saved', { n: d.item.name }), 'success', { duration: 6000 });
  } catch (e) {
    win?.close();
    download(blob, name);
    toast(e.code === 'quota' ? t('err_quota') : t('tt_sheet_fail'), 'danger', { duration: 8000 });
  }
}
