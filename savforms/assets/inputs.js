/**
 * The control of one question, for answering (fill.js), for the preview inside the editor (disabled) and to show an
 * answer already given (read-only). A works like the answers of the server: by question id, choices by option id,
 * "other" as OTHER with its text in A[id + OTHER], a grid as {row: col} ({row: [cols]} for checkgrid), a ranking as ids.
 */
import { h, icon } from './ui.js';
import { t } from './i18n.js';
import { OTHER } from './models.js';

/** The options in the order shown: shuffled once per page when the question asks for it ("other" stays last). */
const orders = new Map();
export function shown(q, shuffle) {
  if (!shuffle || !q.shuffle) return q.opts;
  const key = q.id + ':' + q.opts.map((o) => o.id).join();
  if (!orders.has(key)) { const a = [...q.opts]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } orders.set(key, a); }
  return orders.get(key);
}

/**
 * The control of a question. o: {onChange(), disabled, readOnly, shuffle, correct: [ids] (a quiz looked at again)}.
 * Every change writes into A and calls onChange.
 */
export function control(q, A, o = {}) {
  const id = q.id, off = !!(o.disabled || o.readOnly), change = () => o.onChange?.(q);
  const set = (v) => { if (v === undefined || v === '' || v === null || (Array.isArray(v) && !v.length)) delete A[id]; else A[id] = v; change(); };
  const otherBox = () => {
    const i = h('sav-input.otherin', { size: 'sm', value: A[id + OTHER] || '', placeholder: t('other_ph'), disabled: off || null, maxlength: 300, 'aria-label': t('other') });
    i.addEventListener('input', () => { A[id + OTHER] = i.value; if (q.t === 'single' && i.value && A[id] !== OTHER) { A[id] = OTHER; group?.setAttribute('value', OTHER); if (group) group.value = OTHER; } if (q.t === 'multi' && i.value && !(A[id] || []).includes(OTHER)) { set([...(A[id] || []), OTHER]); boxOther && (boxOther.checked = true); return; } change(); });
    return i;
  };
  let group = null, boxOther = null;
  const right = (oid) => (o.correct ? (o.correct.includes(oid) ? ' right' : '') : '');
  switch (q.t) {
    case 'short':
    case 'email':
    case 'number': {
      const i = h('sav-input', { value: A[id] ?? '', type: q.t === 'short' ? 'text' : q.t, inputmode: q.t === 'number' ? 'decimal' : null, step: q.t === 'number' ? (q.int ? 1 : 'any') : null, min: q.t === 'number' && q.min != null ? q.min : null, max: q.t === 'number' && q.max != null ? q.max : null,
        maxlength: q.t === 'short' && q.max ? q.max : null, placeholder: t(q.t === 'email' ? 'email_ph' : q.t === 'number' ? 'number_ph' : 'answer_ph'), disabled: o.disabled || null, readonly: o.readOnly || null, autocomplete: q.t === 'email' ? 'email' : 'off', 'aria-label': q.title || t('k_' + q.t) });
      i.addEventListener('input', () => set(q.t === 'number' ? (i.value === '' ? undefined : String(i.value).replace(',', '.')) : i.value));
      const help = q.t === 'number' && (q.min != null || q.max != null) ? h('small.muted.qhelp', q.min != null && q.max != null ? t('between', { a: q.min, b: q.max }) : q.min != null ? t('at_least', { a: q.min }) : t('at_most', { b: q.max })) : null;
      return h('div.qctl', i, help);
    }
    case 'long': {
      const i = h('sav-textarea', { value: A[id] ?? '', rows: 3, resize: 'auto', maxlength: q.max || null, counter: q.max ? true : null, placeholder: t('answer_ph'), disabled: o.disabled || null, readonly: o.readOnly || null, 'aria-label': q.title || t('k_long') });
      i.addEventListener('input', () => set(i.value));
      return h('div.qctl', i);
    }
    case 'date': {
      const i = h('sav-date-picker', { 'sheet-on-mobile': true, value: A[id] ?? '', placeholder: t('date_ph'), disabled: off || null, 'aria-label': q.title || t('k_date') });
      i.addEventListener('change', () => set(i.value || undefined));
      return h('div.qctl.narrow', i);
    }
    case 'time': {
      const i = h('sav-time-picker', { 'sheet-on-mobile': true, value: A[id] ?? '', placeholder: t('time_ph'), step: 5, 'hour-cycle': 24, disabled: off || null, 'aria-label': q.title || t('k_time') });
      i.addEventListener('change', () => set(i.value || undefined));
      return h('div.qctl.narrow', i);
    }
    case 'single': {
      group = h('sav-radio-group', { value: A[id] ?? '', 'aria-label': q.title || t('k_single'), disabled: off || null },
        shown(q, o.shuffle).map((x) => h('sav-radio', { value: x.id, class: right(x.id) }, x.label || t('option_empty'))), q.other ? h('sav-radio', { value: OTHER }, t('other')) : null);
      group.addEventListener('change', () => set(group.value));
      return h('div.qctl.choices', group, q.other ? otherBox() : null);
    }
    case 'multi': {
      const val = () => [...(A[id] || [])];
      const box = (x) => { const c = h('sav-checkbox', { checked: val().includes(x) || null, disabled: off || null, class: right(x) }); c.addEventListener('change', () => { const v = val().filter((y) => y !== x); if (c.checked) v.push(x); set(v); }); return c; };
      const list = shown(q, o.shuffle).map((x) => { const c = box(x.id); c.append(x.label || t('option_empty')); return c; });
      if (q.other) { boxOther = box(OTHER); boxOther.append(t('other')); }
      const lim = q.min && q.max ? t('choose_between', { a: q.min, b: q.max }) : q.min ? t('choose_least', { a: q.min }) : q.max ? t('choose_most', { b: q.max }) : '';
      return h('div.qctl.choices', lim ? h('small.muted.qhelp', lim) : null, h('div.checks', list, boxOther), q.other ? otherBox() : null);
    }
    case 'dropdown': {
      const s = h('sav-select', { 'sheet-on-mobile': true, value: A[id] ?? '', placeholder: t('choose'), disabled: off || null, clearable: !q.req || null, 'aria-label': q.title || t('k_dropdown') }, shown(q, o.shuffle).map((x) => h('option', { value: x.id }, x.label || t('option_empty'))));
      s.addEventListener('change', () => set(s.value || undefined));
      return h('div.qctl.narrow', s);
    }
    case 'scale': {
      const vals = []; for (let v = q.min; v <= q.max; v++) vals.push(v);
      const g = h('div.scale', { role: 'radiogroup', 'aria-label': q.title || t('k_scale') });
      const draw = () => g.querySelectorAll('button').forEach((b) => { const on = +b.dataset.v === A[id]; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.tabIndex = on || (A[id] == null && +b.dataset.v === q.min) ? 0 : -1; });
      for (const v of vals) g.append(h('button', { type: 'button', role: 'radio', 'data-v': v, disabled: off || null, onclick: () => { set(A[id] === v && !q.req ? undefined : v); draw(); },
        onkeydown: (e) => { const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]; if (!d) return; e.preventDefault(); const n = Math.max(q.min, Math.min(q.max, (A[id] ?? q.min - d) + d)); set(n); draw(); g.querySelector(`[data-v="${n}"]`)?.focus(); } }, String(v)));
      draw();
      return h('div.qctl', h('div.scalebox', { style: `--n:${vals.length}` }, g, q.minLabel || q.maxLabel ? h('div.scalelab', h('span', q.minLabel || ''), h('span', q.maxLabel || '')) : null));
    }
    case 'rating': {
      const r = h('sav-rating', { value: A[id] ?? 0, max: q.max, icon: q.icon === 'thumbs-up' ? 'thumbs-up' : q.icon === 'smile' ? 'smile' : q.icon, readonly: off || null, 'aria-label': q.title || t('k_rating'), style: '--size:2rem;--color:var(--fc)' });
      r.addEventListener('change', (e) => set(+(e.detail?.value ?? r.value) || undefined));
      return h('div.qctl', r);
    }
    case 'grid':
    case 'checkgrid': {
      const multi = q.t === 'checkgrid', cur = () => ({ ...(A[id] || {}) });
      const cell = (row, col) => {
        const v = cur()[row.id], on = multi ? (v || []).includes(col.id) : v === col.id;
        const i = h('input', { type: multi ? 'checkbox' : 'radio', name: 'g' + id + row.id, checked: on || null, disabled: off || null, 'aria-label': `${row.label} – ${col.label}` });
        i.addEventListener('change', () => { const g = cur(); if (multi) { const s = (g[row.id] || []).filter((c) => c !== col.id); if (i.checked) s.push(col.id); if (s.length) g[row.id] = q.cols.filter((c) => s.includes(c.id)).map((c) => c.id); else delete g[row.id]; } else g[row.id] = col.id; set(Object.keys(g).length ? g : undefined); });
        return h('td', h('label.gcell', i));
      };
      return h('div.qctl.gridwrap', h('table.qgrid', h('thead', h('tr', h('th'), q.cols.map((c) => h('th', { scope: 'col' }, c.label)))), h('tbody', q.rows.map((r) => h('tr', h('th', { scope: 'row' }, r.label), q.cols.map((c) => cell(r, c)))))));
    }
    case 'ranking': {
      const order = () => (A[id] && A[id].length === q.opts.length ? A[id] : shown(q, o.shuffle).map((x) => x.id));
      const label = (oid) => q.opts.find((x) => x.id === oid)?.label || '';
      const list = h('sav-sortable.rank', { grip: true, handle: 'grip' });
      const draw = () => {
        list.replaceChildren(...order().map((oid, i) => h('div.rrow', { 'data-id': oid }, h('b.rnum', String(i + 1)), h('span.grow', label(oid)),
          off ? null : h('span.rbtns', h('sav-button', { icon: 'chevron-up', label: t('move_up'), size: 'sm', appearance: 'ghost', square: true, disabled: i === 0 || null, onclick: () => move(i, -1) }), h('sav-button', { icon: 'chevron-down', label: t('move_down'), size: 'sm', appearance: 'ghost', square: true, disabled: i === q.opts.length - 1 || null, onclick: () => move(i, 1) })))));
      };
      const move = (i, d) => { const a = [...order()]; [a[i], a[i + d]] = [a[i + d], a[i]]; set(a); draw(); };
      if (!off) list.addEventListener('sav-sort', (e) => { const ids = e.detail?.order?.length ? e.detail.order : [...list.querySelectorAll('.rrow')].map((x) => x.dataset.id); set(ids.filter((x) => q.opts.some((y) => y.id === x))); draw(); });
      if (off) list.setAttribute('data-no-drag', '');
      draw();
      return h('div.qctl', h('small.muted.qhelp', t('rank_help')), list);
    }
  }
  return null;
}

/** Whether a question has an answer in A (for "required" and the progress). */
export function answered(q, A) {
  const v = A[q.id];
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return q.t === 'grid' || q.t === 'checkgrid' ? (q.req ? q.rows.every((r) => v[r.id] && (!Array.isArray(v[r.id]) || v[r.id].length)) : Object.keys(v).length > 0) : true;
  return true;
}

/** What is wrong with the answer of a question before sending (the server checks it again), as the key of a text, or ''. */
export function problem(q, A) {
  if (q.t === 'ranking' && q.req && !A[q.id]) A[q.id] = shown(q, true).map((x) => x.id); // the order shown is an answer
  if (!answered(q, A)) return q.req ? (q.t === 'grid' || q.t === 'checkgrid') && A[q.id] ? 'err_answer_rows' : 'err_answer_required' : '';
  const v = A[q.id];
  if (q.t === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'err_answer_email';
  if (q.t === 'number') { const n = Number(v); if (!Number.isFinite(n)) return 'err_answer_number'; if (q.int && !Number.isInteger(n)) return 'err_answer_int'; if ((q.min != null && n < q.min) || (q.max != null && n > q.max)) return 'err_answer_range'; }
  if ((q.t === 'single' && v === OTHER) || (q.t === 'multi' && v.includes(OTHER))) if (!(A[q.id + OTHER] || '').trim()) return 'err_answer_other';
  if (q.t === 'multi') { if (q.min && v.length < q.min) return 'err_answer_few'; if (q.max && v.length > q.max) return 'err_answer_many'; }
  return '';
}

/** An answer as text (the answers one by one, for questions without a control worth showing). */
export function answerText(q, A) {
  const v = A[q.id];
  if (v === undefined) return '';
  const lab = (oid) => (oid === OTHER ? t('other') + ': ' + (A[q.id + OTHER] || '') : q.opts?.find((x) => x.id === oid)?.label ?? '?');
  if (q.t === 'single' || q.t === 'dropdown') return lab(v);
  if (q.t === 'multi' || q.t === 'ranking') return v.map(lab).join(q.t === 'ranking' ? ' › ' : ', ');
  if (q.t === 'rating') return '★'.repeat(v) + ' (' + v + '/' + q.max + ')';
  if (q.t === 'grid' || q.t === 'checkgrid') return q.rows.filter((r) => v[r.id]).map((r) => r.label + ': ' + [].concat(v[r.id]).map((c) => q.cols.find((x) => x.id === c)?.label ?? '?').join(', ')).join(' · ');
  return String(v);
}

export const reqMark = () => h('span.req', { 'aria-hidden': 'true', title: t('required') }, '*');
export const kindChip = (ic, label) => h('span.kchip', icon(ic), label);
