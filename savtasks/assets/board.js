/**
 * A list as a board (kanban): its columns side by side, the tasks as cards. A card is dragged to another place or column
 * (with a mouse at once, with a finger after holding it a moment, so the board still scrolls), or moved from its menu.
 * A column may be the one of done tasks: a card dropped there is ticked, and a ticked task goes there by itself.
 * On phones the columns are as wide as the screen and snap while scrolling sideways.
 */
import { btn, confirm, dialog, drop, fail, h, icon, put, toast } from './ui.js';
import { t } from './i18n.js';
import { S, api, keep, taskById } from './store.js';
import { prefs } from './account.js';
import { openTask } from './task.js';
import { PRIO_COLOR, defaultRemind, metaOf, toggleDone } from './tasks.js';

const tz = () => prefs().tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const byPos = (a, b) => a.position - b.position || (a.created < b.created ? -1 : 1);

export function boardView(l, tasks, ctx) {
  const cols = l.columns, doneCol = cols.find((c) => c.done)?.id;
  const showDone = prefs().showDone !== false;
  const colOf = (x) => (cols.some((c) => c.id === x.col) ? x.col : x.done && doneCol ? doneCol : cols[0].id);
  const board = h('div.board', { style: `--c:${l.color}` });
  for (const c of cols) {
    // in the column of done tasks only the last ones (all of them with "show done")
    let list = tasks.filter((x) => colOf(x) === c.id).sort((a, b) => (c.done ? (a.done < b.done ? 1 : -1) : byPos(a, b)));
    const hidden = c.done && !showDone ? list.length : c.done ? Math.max(0, list.length - 30) : 0;
    if (hidden) list = list.slice(0, list.length - hidden);
    const cards = h('div.bcards', { 'data-col': c.id }, list.map((x) => card(x, l, ctx)));
    board.append(h('section.bcol' + (c.done ? '.isdone' : ''), { 'data-col': c.id },
      h('header.bhead', c.done ? icon('circle-check', { class: 'bdone' }) : null, h('b', c.name), h('small.muted', String(tasks.filter((x) => colOf(x) === c.id).length)), h('div.spacer'), colMenu(l, c, ctx)),
      cards,
      hidden ? h('small.muted.bmore', t('done_hidden', { n: hidden })) : null,
      c.done ? null : addCard(l, c, ctx)));
  }
  board.append(h('section.bcol.addcol', btn(t('add_column'), { icon: 'plus', appearance: 'ghost', onclick: () => addColumn(l, ctx) })));
  dragging(board, l, ctx);
  return board;
}

function card(x, l, ctx) {
  const cb = h('sav-checkbox.tcheck', { checked: !!x.done || null, 'aria-label': t(x.done ? 'mark_open' : 'mark_done'), style: x.priority ? `--p:${PRIO_COLOR[x.priority]}` : null });
  cb.addEventListener('click', (e) => e.stopPropagation());
  cb.addEventListener('change', () => toggleDone(x, cb.checked, ctx, el));
  const menu = drop(h('sav-button.bmenu', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', size: 'sm', square: true }), () => [
    { head: t('move_to') }, ...l.columns.filter((c) => c.id !== x.col).map((c) => ['arrow-right', c.name, () => moveTo(x, l, c.id, null, ctx)]),
    '-', ['pencil', t('open'), () => openTask(x.id, ctx)]], { placement: 'bottom-end', label: t('more') });
  menu.addEventListener('click', (e) => e.stopPropagation());
  menu.addEventListener('pointerdown', (e) => e.stopPropagation());
  const meta = metaOf(x, {});
  const el = h('div.bcard' + (x.done ? '.done' : '') + (x.priority ? '.p' + x.priority : ''), { 'data-id': x.id, tabindex: 0, role: 'button', 'aria-label': x.title, style: x.priority ? `--p:${PRIO_COLOR[x.priority]}` : null,
    onclick: () => openTask(x.id, ctx), onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) openTask(x.id, ctx); } },
    h('div.btop', cb, h('div.ttitle', x.title || t('no_title')), menu), meta.length ? h('div.tmeta', meta) : null);
  return el;
}

/** "Add a card" at the bottom of a column: a line that becomes a task of that column. */
function addCard(l, c, ctx) {
  const box = h('div.badd');
  const closed = () => put(box, btn(t('add_card'), { icon: 'plus', size: 'sm', appearance: 'ghost', block: true, onclick: () => opened() }));
  const opened = () => {
    const i = h('sav-textarea', { rows: 2, resize: 'auto', maxlength: 255, placeholder: t('card_ph'), 'aria-label': t('add_card'), size: 'sm' });
    const go = async () => {
      const v = String(i.value).replace(/\s+/g, ' ').trim();
      if (!v) return closed();
      i.disabled = true;
      try { const r = await api('tasks.task.save', { title: v, list: l.id, col: c.id, end: true, tz: tz() }); keep(r.task); ctx.redraw(); requestAnimationFrame(() => document.querySelector(`.bcol[data-col="${c.id}"] .badd sav-button`)?.click()); } catch (e) { fail(e); i.disabled = false; }
    };
    i.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } if (e.key === 'Escape') closed(); });
    put(box, i, h('div.prow', btn(t('add'), { size: 'sm', variant: 'primary', appearance: 'solid', onclick: go }), btn(t('cancel'), { size: 'sm', appearance: 'ghost', onclick: closed })));
    requestAnimationFrame(() => i.focus());
  };
  closed();
  return box;
}

/** A card to a column (and a place in it): the server ticks it or takes the tick away when the column says so. */
async function moveTo(x, l, col, order, ctx) {
  const was = { col: x.col, done: x.done };
  x.col = col;
  if (order) order.forEach((id, i) => { const y = taskById(id); if (y) y.position = (i + 1) * 10; });
  else x.position = Math.max(0, ...S.tasks.filter((y) => y.list === l.id && y.col === col).map((y) => y.position)) + 10;
  ctx.redraw();
  try {
    const r = await api('tasks.task.move', { id: x.id, col, order: order || undefined, tz: tz() });
    keep(r.task); keep(r.next);
    if (!was.done && r.task.done) toast(r.next ? t('done_next', { d: r.next.due }) : t('done_one'), 'success');
  } catch (e) { Object.assign(x, was); fail(e); }
  ctx.redraw();
}

// ------------------------------------------------------------------ dragging

/** The card being dragged: one at a time, whatever board is on screen (the listeners of the window are set once). */
let st = null;
const reset = () => { if (!st) return; clearTimeout(st.timer); st.ghost?.remove(); st.ph?.remove(); st.el.classList.remove('lifted'); document.body.classList.remove('dragging'); cancelAnimationFrame(st.raf); st = null; };
function begin() {
  const r = st.el.getBoundingClientRect();
  st.on = true;
  st.dx = st.x - r.left; st.dy = st.y - r.top;
  st.ghost = st.el.cloneNode(true);
  st.ghost.classList.add('bghost');
  Object.assign(st.ghost.style, { width: r.width + 'px', left: r.left + 'px', top: r.top + 'px' });
  document.body.append(st.ghost);
  st.ph = h('div.bph', { style: `height:${r.height}px` });
  st.el.after(st.ph);
  st.el.classList.add('lifted');
  document.body.classList.add('dragging');
  navigator.vibrate?.(15);
  autoScroll();
}
/** The board and the column under the pointer scroll when it comes close to their edges. */
function autoScroll() {
  if (!st?.on) return;
  const br = st.board.getBoundingClientRect(), e = 60;
  if (st.x > br.right - e) st.board.scrollLeft += 14; else if (st.x < br.left + e) st.board.scrollLeft -= 14;
  const cards = st.ph?.parentElement;
  if (cards) { const cr = cards.getBoundingClientRect(); if (st.y > cr.bottom - e) cards.scrollTop += 10; else if (st.y < cr.top + e) cards.scrollTop -= 10; }
  st.raf = requestAnimationFrame(autoScroll);
}
function place() {
  st.ghost.style.left = st.x - st.dx + 'px';
  st.ghost.style.top = st.y - st.dy + 'px';
  st.ghost.style.visibility = 'hidden';
  const under = document.elementFromPoint(st.x, st.y);
  st.ghost.style.visibility = '';
  const cards = under?.closest('.bcards') || under?.closest('.bcol')?.querySelector('.bcards');
  if (!cards || !st.board.contains(cards)) return;
  const others = [...cards.querySelectorAll('.bcard')].filter((c) => c !== st.el);
  const before = others.find((c) => { const r = c.getBoundingClientRect(); return st.y < r.top + r.height / 2; });
  if (before) { if (before.previousElementSibling !== st.ph) cards.insertBefore(st.ph, before); } else if (cards.lastElementChild !== st.ph) cards.append(st.ph);
}
addEventListener('pointermove', (e) => {
  if (!st) return;
  st.x = e.clientX; st.y = e.clientY;
  const far = Math.hypot(st.x - st.sx, st.y - st.sy);
  if (!st.on) {
    if (st.touch) { if (far > 8) reset(); return; } // a scroll, not a drag
    if (far < 6) return;
    begin();
  }
  e.preventDefault();
  place();
}, { passive: false });
// while a card is held, the finger does not scroll the page
addEventListener('touchmove', (e) => { if (st?.on) e.preventDefault(); }, { passive: false });
addEventListener('pointerup', async () => {
  if (!st) return;
  if (!st.on) { reset(); return; }
  const { el, ph, l, ctx } = st;
  const cards = ph.parentElement, col = cards?.dataset.col;
  ph.replaceWith(el);
  const x = taskById(el.dataset.id);
  const order = cards ? [...cards.querySelectorAll('.bcard')].map((c) => c.dataset.id) : null;
  reset();
  // a drag is not a click on the card
  const eat = (c) => { c.stopPropagation(); c.preventDefault(); };
  el.addEventListener('click', eat, { capture: true, once: true });
  setTimeout(() => el.removeEventListener('click', eat, { capture: true }), 0);
  if (x && col) await moveTo(x, l, col, order, ctx);
});
addEventListener('pointercancel', () => reset());
addEventListener('keydown', (e) => { if (e.key === 'Escape' && st) { if (st.ph && st.el) st.ph.replaceWith(st.el); reset(); } });

function dragging(board, l, ctx) {
  board.addEventListener('pointerdown', (e) => {
    if (e.button || st) return;
    const el = e.target.closest('.bcard');
    if (!el || e.target.closest('sav-checkbox, sav-button, sav-dropdown, a, input, textarea')) return;
    st = { board, l, ctx, el, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, touch: e.pointerType !== 'mouse', on: false };
    // a finger lifts the card after holding it still for a moment; a mouse as soon as it moves
    if (st.touch) st.timer = setTimeout(() => { if (st && !st.on) begin(); }, 280);
  });
}

// ------------------------------------------------------------------ columns

function colMenu(l, c, ctx) {
  const i = l.columns.findIndex((x) => x.id === c.id);
  return drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('column'), appearance: 'ghost', size: 'sm', square: true }), () => [
    ['pencil', t('rename'), () => renameColumn(l, c, ctx)],
    ['circle-check', t(c.done ? 'col_not_done' : 'col_done'), () => saveColumns(l, l.columns.map((x) => ({ ...x, done: x.id === c.id ? !c.done : false })), ctx)],
    i > 0 ? ['arrow-left', t('move_left'), () => { const a = [...l.columns]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; saveColumns(l, a, ctx); }] : null,
    i < l.columns.length - 1 ? ['arrow-right', t('move_right'), () => { const a = [...l.columns]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; saveColumns(l, a, ctx); }] : null,
    '-', l.columns.length > 1 ? ['trash', t('delete_column'), async () => { if (!(await confirm(t('delete_column'), t('delete_column_t', { name: c.name, first: l.columns.find((x) => x.id !== c.id)?.name || '' }), t('delete')))) return; saveColumns(l, l.columns.filter((x) => x.id !== c.id), ctx); }, { danger: true }] : null,
  ], { placement: 'bottom-end', label: c.name });
}

async function saveColumns(l, columns, ctx) {
  try {
    const r = await api('tasks.list.save', { id: l.id, columns });
    Object.assign(l, r.list);
    await ctx.refresh();
  } catch (e) { fail(e); }
}

function renameColumn(l, c, ctx) {
  const i = h('sav-input', { label: t('name'), value: c.name, maxlength: 40, autofocus: true });
  i.addEventListener('keydown', (e) => e.stopPropagation());
  dialog({ title: t('rename'), width: '24rem', body: i, actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: () => { const v = i.value.trim(); if (!v) return false; saveColumns(l, l.columns.map((x) => (x.id === c.id ? { ...x, name: v } : x)), ctx); } }] });
}

function addColumn(l, ctx) {
  if (l.columns.length >= 12) return toast(t('err_too_many_columns'), 'warning');
  const i = h('sav-input', { label: t('name'), maxlength: 40, autofocus: true, placeholder: t('column_ph') });
  i.addEventListener('keydown', (e) => e.stopPropagation());
  dialog({ title: t('add_column'), width: '24rem', body: i, actions: [{ label: t('cancel') }, { label: t('add'), primary: true, run: () => {
    const v = i.value.trim();
    if (!v) return false;
    // a new column goes before the one of done tasks
    const a = [...l.columns], at = a.findIndex((x) => x.done);
    a.splice(at < 0 ? a.length : at, 0, { name: v, done: false });
    saveColumns(l, a, ctx);
  } }] });
}

/** All the columns of a board at once: names, order, which one holds the done tasks. */
export function columnsDialog(l, ctx) {
  const cols = l.columns.map((c) => ({ ...c }));
  const box = h('div.coledit');
  const paint = () => put(box, cols.map((c, i) => {
    const name = h('sav-input', { value: c.name, maxlength: 40, size: 'sm', 'aria-label': t('name') });
    name.addEventListener('keydown', (e) => e.stopPropagation());
    name.addEventListener('input', () => { c.name = name.value; });
    const done = h('sav-radio', { value: String(i), checked: c.done || null, 'aria-label': t('col_done') });
    done.addEventListener('click', () => { cols.forEach((x, j) => { x.done = j === i ? !c.done : false; }); paint(); });
    return h('div.colrow', name, h('sav-tooltip', { content: t('col_done') }, h('sav-button', { icon: 'circle-check', label: t('col_done'), size: 'sm', square: true, appearance: c.done ? 'soft' : 'ghost', variant: c.done ? 'success' : 'neutral', onclick: () => { cols.forEach((x, j) => { x.done = j === i ? !c.done : false; }); paint(); } })),
      h('sav-button', { icon: 'chevron-up', label: t('move_up'), size: 'sm', square: true, appearance: 'ghost', disabled: i === 0 || null, onclick: () => { [cols[i - 1], cols[i]] = [cols[i], cols[i - 1]]; paint(); } }),
      h('sav-button', { icon: 'chevron-down', label: t('move_down'), size: 'sm', square: true, appearance: 'ghost', disabled: i === cols.length - 1 || null, onclick: () => { [cols[i + 1], cols[i]] = [cols[i], cols[i + 1]]; paint(); } }),
      h('sav-button', { icon: 'trash', label: t('delete_column'), size: 'sm', square: true, appearance: 'ghost', variant: 'danger', disabled: cols.length <= 1 || null, onclick: () => { cols.splice(i, 1); paint(); } }));
    void done;
  }), cols.length < 12 ? btn(t('add_column'), { icon: 'plus', size: 'sm', appearance: 'ghost', onclick: () => { const at = cols.findIndex((x) => x.done); cols.splice(at < 0 ? cols.length : at, 0, { name: t('new_column'), done: false }); paint(); } }) : null);
  paint();
  dialog({ title: t('edit_columns'), width: '30rem', body: h('div.form', h('p.muted', t('edit_columns_t')), box), actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => {
    const clean = cols.map((c) => ({ ...c, name: c.name.trim() })).filter((c) => c.name);
    if (!clean.length) return false;
    await saveColumns(l, clean, ctx);
  } }] });
}
export { defaultRemind };
