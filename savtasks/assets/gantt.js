/**
 * A list as a Gantt chart: every task is a row, its bar goes from its start day to its due day on a timeline of days
 * (or of weeks, zoomed out). A task with only a due day is a milestone (a diamond). The bar is dragged to move the task,
 * its edges to change the start or the due day (the right handle of a milestone stretches it into a bar); the reminder
 * moves with the due day. A task without dates gets one with a press on its row, on the day pressed. The inner fill of a
 * bar is how much of its checklist is done. With a finger, a bar is held a moment before it moves (the chart still scrolls).
 */
import { btn, fail, h, icon, put, segmented, toast } from './ui.js';
import { getLang, t } from './i18n.js';
import { api, keep, taskById } from './store.js';
import { prefs, setPrefs } from './account.js';
import { addDays, dayLabel, daysBetween, keyParts, todayKey, weekday } from './time.js';
import { openTask } from './task.js';
import { addDialog } from './add.js';
import { PRIO_COLOR, toggleDone } from './tasks.js';

const tz = () => prefs().tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const today = () => todayKey(tz());
const SCALES = { day: 36, week: 13 };
const ROW = 40;
const scrolls = new Map(); // where each chart was scrolled to, kept across redraws

/** A row of the chart: [first day, last day] of its bar (a milestone: the same day twice). */
const spanOf = (x) => [x.start || x.due, x.due];

export function ganttView(l, tasks, ctx) {
  const showDone = prefs().showDone !== false;
  const scale = prefs().ganttScale === 'week' ? 'week' : 'day', dw = SCALES[scale];
  const list = tasks.filter((x) => showDone || !x.done);
  const dated = list.filter((x) => x.due).sort((a, b) => spanOf(a)[0].localeCompare(spanOf(b)[0]) || a.due.localeCompare(b.due) || a.position - b.position);
  const undated = list.filter((x) => !x.due).sort((a, b) => !!a.done - !!b.done || a.position - b.position);

  // the days shown: from a week before the first bar (or today) to six weeks after the last one, Monday to Sunday
  const k = today();
  let from = dated.reduce((m, x) => (spanOf(x)[0] < m ? spanOf(x)[0] : m), k), to = dated.reduce((m, x) => (x.due > m ? x.due : m), k);
  from = addDays(from, -7); from = addDays(from, -weekday(from));
  to = addDays(to, 42); to = addDays(to, 6 - weekday(to));
  if (daysBetween(from, to) > 800) to = addDays(from, 800);
  const n = daysBetween(from, to) + 1, at = (d) => daysBetween(from, d);

  // the head: months, then days (or the Mondays when zoomed out)
  const months = [], days = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(from, i), [, , dd] = keyParts(d), wd = weekday(d);
    if (i === 0 || dd === 1) months.push(h('div.gmon', { style: `left:${i * dw}px` }, dayLabel(d, { month: scale === 'week' ? 'short' : 'long', year: 'numeric' })));
    if (scale === 'day') days.push(h('div.gday' + (wd > 4 ? '.we' : '') + (d === k ? '.now' : ''), { style: `left:${i * dw}px;width:${dw}px` }, h('small', dayLabel(d, { weekday: 'narrow' })), h('b', String(dd))));
    else if (wd === 0) days.push(h('div.gday.wk' + (daysBetween(d, k) >= 0 && daysBetween(d, k) < 7 ? '.now' : ''), { style: `left:${i * dw}px;width:${dw * 7}px` }, h('b', String(dd))));
  }
  // the columns behind the rows: weekends shaded, today marked
  const cols = [];
  for (let i = 0; i < n; i++) { const d = addDays(from, i); if (weekday(d) > 4 && scale === 'day') cols.push(h('i.gwe', { style: `left:${i * dw}px;width:${dw}px` })); }
  const width = n * dw;

  const rows = dated.map((x) => row(x, l, ctx, at, dw, from)).concat(undated.length ? [h('div.gsep', h('div.gname', t('g_undated')), h('div.gtrack', h('small.muted', t('g_undated_t'))))] : [], undated.map((x) => row(x, l, ctx, at, dw, from)));
  const head = h('div.gthead', h('div.gcorner', h('b', t('g_task'))), h('div.gtime', { style: `width:${width}px` }, h('div.gmonths', months), h('div.gdays', days)));
  // the last row adds an item (the dialog in the middle, with this list chosen): a press on its name or anywhere on its line
  const add = () => addDialog(l, ctx);
  rows.push(h('div.grow.gaddr', { role: 'button', tabindex: 0, onclick: add, onkeydown: (e) => { if (e.key === 'Enter') add(); } }, h('div.gname.gaddname', icon('plus'), h('span', t('add_item'))), h('div.gtrack', { title: t('add_item') })));
  const body = h('div.gbody', { style: `--w:${width}px` }, h('div.gcols', { style: `width:${width}px` }, cols, at(k) >= 0 && at(k) < n ? h('i.gnow', { style: `left:${at(k) * dw + dw / 2}px` }) : null), rows);
  const scroll = h('div.gscroll', head, body, list.length ? null : h('div.gempty', h('sav-empty-state', { icon: 'calendar-range', heading: t('g_empty'), text: t('g_empty_t') })));
  // (a chart taken off the screen resets its scroll: that is not remembered)
  scroll.addEventListener('scroll', () => { if (scroll.isConnected && scroll.clientWidth) scrolls.set(l.id + scale, scroll.scrollLeft); }, { passive: true });

  const goToday = (smooth) => scroll.scrollTo({ left: Math.max(0, at(k) * dw - scroll.clientWidth * 0.3), behavior: smooth ? 'smooth' : 'auto' });
  const bar = h('div.gtools',
    segmented(t('g_scale'), scale, [['day', '=' + t('g_days'), t('g_days')], ['week', '=' + t('g_weeks'), t('g_weeks')]], (v) => setPrefs({ ganttScale: v }).then(() => ctx.redraw()).catch(fail)),
    btn(t('today'), { size: 'sm', icon: 'sun', onclick: () => goToday(true) }),
    h('small.muted.ghint', t('g_hint')));
  const box = h('div.gantt', { style: `--dw:${dw}px;--row:${ROW}px;--c:${l.color}` }, bar, scroll);
  requestAnimationFrame(() => { const s = scrolls.get(l.id + scale); if (s !== undefined) scroll.scrollLeft = s; else goToday(false); });
  return box;
}

function row(x, l, ctx, at, dw, from) {
  const cb = h('sav-checkbox.tcheck', { checked: !!x.done || null, 'aria-label': t(x.done ? 'mark_open' : 'mark_done'), style: x.priority ? `--p:${PRIO_COLOR[x.priority]}` : null });
  cb.addEventListener('click', (e) => e.stopPropagation());
  cb.addEventListener('change', () => toggleDone(x, cb.checked, ctx));
  const name = h('div.gname', { role: 'button', tabindex: 0, title: x.title, onclick: () => openTask(x.id, ctx), onkeydown: (e) => { if (e.key === 'Enter') openTask(x.id, ctx); } }, cb, h('span', x.title || t('no_title')));
  const track = h('div.gtrack', { 'data-id': x.id });
  if (x.due) {
    const [a, b] = spanOf(x), left = at(a) * dw, len = (daysBetween(a, b) + 1) * dw;
    const cl = x.checklist.length, prog = x.done ? 100 : cl ? Math.round((x.checklist.filter((c) => c.d).length / cl) * 100) : 0;
    const label = h('span.glabel', x.title || t('no_title'));
    const when = x.start ? `${dayLabel(a, { day: 'numeric', month: 'short' })} – ${dayLabel(b, { day: 'numeric', month: 'short' })}` : dayLabel(b, { weekday: 'short', day: 'numeric', month: 'short' });
    if (x.start) track.append(...[h('div.gb' + (x.done ? '.done' : ''), { 'data-id': x.id, style: `left:${left}px;width:${len}px`, title: `${x.title} · ${when}`, tabindex: 0, role: 'button', 'aria-label': `${x.title}, ${when}` },
      h('i.gfill', { style: `width:${prog}%` }), h('span.gh.l', { 'data-edge': 'l', 'aria-hidden': 'true' }), len >= 90 ? label : null, h('span.gh.r', { 'data-edge': 'r', 'aria-hidden': 'true' })), len < 90 ? h('span.glabel.out', { style: `left:${left + len + 6}px` }, x.title) : null].filter(Boolean));
    else track.append(h('div.gm' + (x.done ? '.done' : ''), { 'data-id': x.id, style: `left:${left + dw / 2}px`, title: `${x.title} · ${when}`, tabindex: 0, role: 'button', 'aria-label': `${x.title}, ${when}` }, h('i.gdia'), h('span.gh.r', { 'data-edge': 'r', 'aria-hidden': 'true' })),
      h('span.glabel.out', { style: `left:${left + dw / 2 + 14}px` }, x.title));
  } else {
    // a task without dates: a press on its row gives it that day as its due day
    const ghost = h('i.gghost', { hidden: true });
    track.append(ghost);
    track.classList.add('free');
    track.addEventListener('pointermove', (e) => { const i = Math.floor((e.clientX - track.getBoundingClientRect().left) / dw); ghost.hidden = false; ghost.style.left = i * dw + 'px'; ghost.style.width = dw + 'px'; });
    track.addEventListener('pointerleave', () => { ghost.hidden = true; });
    track.addEventListener('click', async (e) => {
      const i = Math.floor((e.clientX - track.getBoundingClientRect().left) / dw), d = addDays(from, i);
      try { keep((await api('tasks.task.save', { id: x.id, due: d, tz: tz() })).task); toast(t('g_planned', { d: dayLabel(d, { weekday: 'long', day: 'numeric', month: 'long' }) }), 'success'); ctx.redraw(); } catch (err) { fail(err); }
    });
  }
  const el = h('div.grow' + (x.done ? '.done' : ''), { 'data-id': x.id }, name, track);
  el._g = { l, ctx, dw, from };
  return el;
}

// ------------------------------------------------------------------ dragging the bars

/** The bar being dragged: one at a time (the listeners of the window are set once). */
let st = null;
const end = () => { if (!st) return; clearTimeout(st.timer); st.tip?.remove(); st.el.classList.remove('gdrag'); document.body.classList.remove('dragging'); st = null; };
/** The new days of a task for a drag of d days: [start or null, due]. */
function moved(x, edge, d) {
  const [a, b] = spanOf(x);
  if (edge === 'move') return [x.start ? addDays(a, d) : null, addDays(b, d)];
  if (edge === 'l') { const s = addDays(a, d) > b ? b : addDays(a, d); return [s === b ? null : s, b]; }
  const e = addDays(b, d); // the right edge (of a milestone too: it becomes a bar)
  const s = e < a ? e : a, z = e < a ? a : e;
  return [s === z ? null : s, z];
}
function paint() {
  const { x, edge, d, el, g } = st;
  const [s, z] = moved(x, edge, d), a = s || z, left = daysBetween(g.from, a) * g.dw, len = (daysBetween(a, z) + 1) * g.dw;
  if (el.classList.contains('gm') && !s) el.style.left = left + g.dw / 2 + 'px';
  else { el.style.left = left + 'px'; el.style.width = len + 'px'; if (el.classList.contains('gm')) { el.classList.replace('gm', 'gb'); el.replaceChildren(h('i.gfill'), h('span.gh.l'), h('span.gh.r')); } }
  const lbl = el.parentElement?.querySelector('.glabel.out');
  if (lbl) lbl.hidden = true;
  const f = (k) => dayLabel(k, { weekday: 'short', day: 'numeric', month: 'short' });
  st.tip.textContent = s ? `${f(s)} → ${f(z)} · ${t('g_days_n', { n: daysBetween(s, z) + 1 })}` : f(z);
  const r = el.getBoundingClientRect();
  Object.assign(st.tip.style, { left: Math.max(8, Math.min(innerWidth - 220, (edge === 'l' ? r.left : edge === 'r' ? r.right - 200 : r.left))) + 'px', top: r.top - 34 + 'px' });
}
function begin() {
  st.on = true;
  st.tip = h('div.gtip');
  document.body.append(st.tip);
  st.el.classList.add('gdrag');
  document.body.classList.add('dragging');
  navigator.vibrate?.(15);
  paint();
}
addEventListener('pointermove', (e) => {
  if (!st) return;
  const far = Math.hypot(e.clientX - st.sx, e.clientY - st.sy);
  if (!st.on) {
    if (st.touch) { if (far > 8) end(); return; } // a scroll, not a drag
    if (far < 4) return;
    begin();
  }
  e.preventDefault();
  const d = Math.round((e.clientX - st.sx) / st.g.dw);
  if (d !== st.d) { st.d = d; paint(); }
}, { passive: false });
addEventListener('touchmove', (e) => { if (st?.on) e.preventDefault(); }, { passive: false });
addEventListener('pointerup', async () => {
  if (!st) return;
  const { x, edge, d, on, g } = st;
  end();
  if (!on) return openTask(x.id, g.ctx); // a press, not a drag
  if (!d && edge === 'move') return g.ctx.redraw();
  const [s, z] = moved(x, edge, d);
  if (s === (x.start || null) && z === x.due) return g.ctx.redraw();
  // the reminder moves by as many days as the due day
  const shift = daysBetween(x.due, z), body = { id: x.id, start: s, due: z, tz: tz() };
  if (x.remind && shift) { const r = Date.parse(x.remind) + shift * 864e5; body.remind = r > Date.now() ? new Date(r).toISOString() : null; }
  const was = { start: x.start, due: x.due };
  Object.assign(x, { start: s, due: z });
  g.ctx.redraw();
  try { keep((await api('tasks.task.save', body)).task); } catch (err) { Object.assign(x, was); fail(err); }
  g.ctx.redraw();
});
addEventListener('pointercancel', () => end());
addEventListener('keydown', (e) => { if (e.key === 'Escape' && st) { const c = st.g.ctx; end(); c.redraw(); } });
// the bars of every chart on screen
addEventListener('pointerdown', (e) => {
  if (e.button || st) return;
  const el = e.target.closest?.('.gb, .gm');
  const rowEl = el?.closest('.grow');
  if (!el || !rowEl?._g) return;
  const x = taskById(el.dataset.id);
  if (!x) return;
  e.preventDefault();
  const edge = e.target.closest('[data-edge]')?.dataset.edge || 'move';
  st = { x, el, edge, d: 0, g: rowEl._g, sx: e.clientX, sy: e.clientY, touch: e.pointerType !== 'mouse', on: false };
  // a finger moves a bar after holding it still for a moment; a mouse as soon as it moves
  if (st.touch) st.timer = setTimeout(() => { if (st && !st.on) begin(); }, 280);
});
// with the keyboard: Enter opens the task, the arrows move it by a day (with Shift: the due day only)
addEventListener('keydown', async (e) => {
  const el = document.activeElement?.closest?.('.gb, .gm');
  if (!el || !['ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) return;
  const g = el.closest('.grow')?._g, x = taskById(el.dataset.id);
  if (!g || !x) return;
  e.preventDefault();
  if (e.key === 'Enter') return openTask(x.id, g.ctx);
  const [s, z] = moved(x, e.shiftKey ? 'r' : 'move', e.key === 'ArrowRight' ? 1 : -1);
  try { keep((await api('tasks.task.save', { id: x.id, start: s, due: z, tz: tz() })).task); g.ctx.redraw(); requestAnimationFrame(() => document.querySelector(`.gb[data-id="${x.id}"], .gm[data-id="${x.id}"]`)?.focus()); } catch (err) { fail(err); }
});
export { getLang, icon, put };
