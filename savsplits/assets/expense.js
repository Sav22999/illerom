/**
 * An expense being written or read: what kind (an expense, a payback, money received), how much and in which currency
 * (with the rate of the European Central Bank), who paid (one or more people) and for whom (equal, shares, percent,
 * exact amounts or a table of thousandths). The parts are shown as they will be saved; the server checks them again.
 */
import { btn, dialog, face, fail, h, icon, put, select, segmented, toast } from './ui.js';
import { t, when } from './i18n.js';
import { S, api, canWrite, groupCall, meId, memberName, photoUrl, uploadPhoto } from './store.js';
import { CATS, catName, curOptions, dec, isSum, money, parseAmount, previewSplit, toInput } from './money.js';
import { longDay, todayKey } from './time.js';
import { redraw } from './group.js';

const MODES = [['equal', 'equal'], ['shares', 'split'], ['percent', 'percent'], ['exact', 'hash'], ['table', 'building']];

export function expenseDialog(e, preset = {}) {
  if (e && !canWrite()) return readOnly(e);
  const d = S.G, g = d.group, me = meId();
  const active = d.members.filter((m) => m.active || (e && (e.payers[m.id] !== undefined || e.split.parts[m.id] !== undefined)));
  const tables = g.tables || [];
  // a personal group: only the account, so nobody to choose (who paid, for whom) and no paybacks
  const alone = g.kind === 'personal' && !!me;
  // the state of the form: amounts in minor units of the expense currency
  const st = {
    kind: e?.kind || preset.kind || 'expense',
    cur: e?.currency || g.currency,
    rate: e?.rate || 1,
    multi: e ? Object.keys(e.payers).length > 1 : false,
    payer: e ? Object.keys(e.payers)[0] : (me && active.some((m) => m.id === me) ? me : active[0]?.id),
    payers: e ? { ...e.payers } : {},
    mode: e?.split.mode || (g.kind === 'condo' && tables.length ? 'table' : 'equal'),
    table: e?.split.table || tables[0]?.id || '',
    parts: e ? { ...e.split.parts } : Object.fromEntries(active.filter((m) => m.active).map((m) => [m.id, g.kind === 'couple' || m.weight === 1 ? 1 : m.weight])),
    to: e?.kind === 'transfer' ? Object.keys(e.alloc)[0] : preset.to || active.find((m) => m.id !== (me || active[0]?.id))?.id,
    photos: (e?.photos || []).map((p) => ({ ...p })),
  };
  // the parts of the "shares" split start from the default share of each person
  if (!e && st.mode === 'equal' && active.some((m) => m.weight !== 1)) st.mode = 'shares';
  if (!e && st.mode === 'shares') st.parts = Object.fromEntries(active.filter((m) => m.active && m.weight > 0).map((m) => [m.id, m.weight]));
  if (!e && st.mode === 'table') st.parts = {};
  if (alone) { st.payer = me; st.multi = false; st.mode = 'equal'; st.parts = { [me]: 1 }; if (st.kind === 'transfer') st.kind = 'expense'; }

  // ---------------------------------------------------------------- fields
  const kind = segmented(t('kind'), st.kind, [['expense', 'receipt', t('k_expense')], ['transfer', 'arrow-right-left', t('k_transfer')], ['income', 'banknote', t('k_income')]], (v) => { st.kind = v; paint(); }, { class: 'ekind', show: false });
  kind.querySelectorAll('sav-radio').forEach((r) => r.append(' ', h('span.lbl', r.getAttribute('title'))));
  const title = h('sav-input', { label: t('what'), value: e?.title || '', maxlength: 120, autofocus: !e });
  const amount = h('sav-input', { label: t('amount'), value: e ? toInput(e.amount, e.currency) : '', inputmode: 'decimal', autocomplete: 'off', class: 'eamount', help: ' ' });
  const curSel = select(t('currency'), curOptions(), st.cur, (v) => { st.cur = v || g.currency; askRate(); paint(); }, { searchable: true, class: 'ecur' });
  const rate = h('sav-input', { value: String(st.rate), inputmode: 'decimal', size: 'sm', class: 'erate', 'aria-label': t('rate') });
  const rateNote = h('small.muted');
  const rateRow = h('div.raterow', h('span.rl'), rate, h('span.rr'), btn(t('rate_ecb'), { size: 'sm', appearance: 'ghost', icon: 'refresh', onclick: () => askRate(true) }), rateNote);
  const day = h('sav-date-picker', { 'sheet-on-mobile': true, label: t('day'), value: e?.day || preset.day || todayKey(), size: 'md' });
  const cat = select(t('category'), [['', t('cat_none')], ...CATS.map(([c]) => [c, catName(c)])], e?.category ?? '', null, { searchable: true });
  const notes = h('sav-textarea', { label: t('notes'), value: e?.notes || '', maxlength: 2000, rows: 2, resize: 'auto' });
  const repeat = select(t('repeat'), [['', t('rep_none')], ['week', t('rep_week')], ['month', t('rep_month')], ['quarter', t('rep_quarter')], ['year', t('rep_year')]], e?.repeat || '', null, { help: e?.repeatNext ? t('rep_next', { d: longDay(e.repeatNext) }) : t('rep_t') });
  const who = h('div.ewho'), split = h('div.esplit'), sumNote = h('div.esum');
  for (const n of [title, amount, rate]) n.addEventListener('keydown', (ev) => ev.stopPropagation());
  amount.addEventListener('input', () => paintSums());
  amount.addEventListener('change', () => { const v = parseAmount(amount.value, st.cur); if (v !== null && isSum(amount.value)) amount.value = toInput(v, st.cur); paintSums(); });
  rate.addEventListener('input', () => { const v = parseFloat(String(rate.value).replace(',', '.')); if (v > 0) st.rate = v; paintSums(); });

  const amt = () => parseAmount(amount.value, st.cur);
  async function askRate(force) {
    if (st.cur === g.currency) { st.rate = 1; return; }
    if (!force && e && e.currency === st.cur) return;
    try {
      const r = await api('splits.rate', undefined, { from: st.cur, to: g.currency, ...(d.src.code ? { code: d.src.code } : {}) });
      if (r.rate) { st.rate = r.rate.rate; rate.value = String(+r.rate.rate.toFixed(6)); rateNote.textContent = t('rate_from', { d: r.rate.day ? longDay(r.rate.day) : '' }); } else rateNote.textContent = t('rate_none');
      paintSums();
    } catch (x) { rateNote.textContent = t('rate_none'); }
  }

  // ---------------------------------------------------------------- who paid
  const amountBox = (id, value, onset) => {
    const n = h('sav-input', { value: value ? toInput(value, st.cur) : '', inputmode: 'decimal', size: 'sm', 'aria-label': memberName(id), class: 'pin' });
    n.addEventListener('keydown', (ev) => ev.stopPropagation());
    n.addEventListener('input', () => { onset(parseAmount(n.value, st.cur) || 0); paintSums(); });
    n.addEventListener('change', () => { if (isSum(n.value)) { const v = parseAmount(n.value, st.cur); if (v !== null) n.value = toInput(v, st.cur); } });
    return n;
  };
  function paintWho() {
    if (alone) { put(who); return; }
    const opts = active.map((m) => [m.id, m.name + (m.id === me ? ' (' + t('you') + ')' : '')]);
    if (st.kind === 'transfer') {
      const from = select(t('from_who'), opts, st.payer, (v) => { st.payer = v; if (st.to === v) st.to = active.find((m) => m.id !== v)?.id; paintWho(); });
      const to = select(t('to_who'), opts.filter(([id]) => id !== st.payer), st.to, (v) => { st.to = v; });
      put(who, h('div.ftr', from, h('span.farr', icon('arrow-right')), to));
      return;
    }
    const lbl = st.kind === 'income' ? t('received_by_l') : t('paid_by_l');
    if (!st.multi) {
      put(who, h('div.prow.end', select(lbl, opts, st.payer, (v) => { st.payer = v; }), btn(t('more_payers'), { size: 'sm', appearance: 'ghost', icon: 'users', onclick: () => { st.multi = true; const a = amt(); if (a && st.payer) st.payers = { [st.payer]: a }; paintWho(); paintSums(); } })));
      return;
    }
    put(who, h('div.mhead', h('span.flabel', lbl), btn(t('one_payer'), { size: 'sm', appearance: 'ghost', onclick: () => { st.multi = false; paintWho(); paintSums(); } })),
      h('div.plist2', active.map((m) => h('div.pr', face(m.name, null, 26), h('span.grow', m.name), amountBox(m.id, st.payers[m.id], (v) => { if (v > 0) st.payers[m.id] = v; else delete st.payers[m.id]; })))));
  }

  // ---------------------------------------------------------------- for whom
  function paintSplit() {
    if (st.kind === 'transfer' || alone) { put(split); return; }
    const modes = MODES.filter(([m]) => m !== 'table' || tables.length);
    const seg = segmented(t('split_how'), st.mode, modes.map(([m, ic]) => [m, ic, t('mode_' + m)]), (v) => {
      // the parts of the new way start from the ones chosen: the same people
      const chosen = active.filter((m) => st.parts[m.id] > 0).map((m) => m.id);
      st.mode = v;
      if (v === 'equal') st.parts = Object.fromEntries(chosen.map((id) => [id, 1]));
      else if (v === 'shares') st.parts = Object.fromEntries(chosen.map((id) => [id, active.find((m) => m.id === id)?.weight || 1]));
      else if (v === 'percent') { const n = chosen.length || 1; st.parts = Object.fromEntries(chosen.map((id, i) => [id, Math.round(10000 / n) / 100 + (i === 0 ? Math.round((100 - Math.round(10000 / n) / 100 * n) * 100) / 100 : 0)])); }
      else if (v === 'exact') { const a = amt() || 0, p = previewSplit(a, { mode: 'equal', parts: Object.fromEntries(chosen.map((id) => [id, 1])) }, active); st.parts = p.parts; }
      else st.parts = {};
      paintSplit(); paintSums();
    }, { class: 'emode', show: false });
    seg.querySelectorAll('sav-radio').forEach((r) => r.append(' ', h('span.lbl', r.getAttribute('title'))));
    const tableSel = st.mode === 'table' ? select(t('table'), tables.map((x) => [x.id, x.name]), st.table, (v) => { st.table = v; paintSums(); }) : null;
    const rows = active.map((m) => {
      // exact and percent: a person chosen with nothing written yet keeps a 0 (the key is there)
      const free = st.mode === 'exact' || st.mode === 'percent';
      const on = st.mode === 'table' ? (!Object.keys(st.parts).length || st.parts[m.id] > 0) && +(m.quotas?.[st.table] || 0) > 0 : free ? m.id in st.parts : st.parts[m.id] > 0;
      const box = h('sav-checkbox', { checked: on || null, 'aria-label': m.name });
      box.addEventListener('change', () => {
        if (st.mode === 'table') {
          // nobody chosen = everybody with a share; a box taken away chooses the others
          if (!Object.keys(st.parts).length) for (const x of active) if (+(x.quotas?.[st.table] || 0) > 0) st.parts[x.id] = 1;
          if (box.checked) st.parts[m.id] = 1; else delete st.parts[m.id];
        } else if (box.checked) st.parts[m.id] = st.mode === 'shares' ? (m.weight || 1) : free ? 0 : 1;
        else delete st.parts[m.id];
        paintSplit(); paintSums();
      });
      let input = null;
      if (st.mode === 'shares' || st.mode === 'percent') {
        input = h('sav-number-input', { value: st.parts[m.id] || '', min: 0, step: st.mode === 'percent' ? 5 : 1, size: 'sm', limits: 'never', 'aria-label': m.name, class: 'pin' });
        input.addEventListener('keydown', (ev) => ev.stopPropagation());
        input.addEventListener('input', () => { const v = parseFloat(String(input.value).replace(',', '.')) || 0; if (v > 0 || free) st.parts[m.id] = Math.max(0, v); else delete st.parts[m.id]; box.checked = free ? m.id in st.parts : v > 0; paintSums(); });
      } else if (st.mode === 'exact') input = amountBox(m.id, st.parts[m.id], (v) => { st.parts[m.id] = Math.max(0, v); box.checked = true; });
      else if (st.mode === 'table') input = h('small.muted.q', (m.quotas?.[st.table] || 0) + ' ‰');
      return h('label.sr' + (on ? '.on' : ''), box, face(m.name, null, 26), h('span.grow', m.name, m.id === me ? h('small.muted', ' · ' + t('you')) : null), input, h('b.part', { 'data-id': m.id }));
    });
    const all = btn(t('all'), { size: 'sm', appearance: 'ghost', onclick: () => {
      if (st.mode === 'table') st.parts = {};
      else for (const m of active.filter((x) => x.active)) if (!(st.parts[m.id] > 0)) st.parts[m.id] = st.mode === 'shares' ? m.weight || 1 : st.mode === 'equal' ? 1 : 0;
      paintSplit(); paintSums();
    } });
    const none = btn(t('none'), { size: 'sm', appearance: 'ghost', onclick: () => { st.parts = st.mode === 'table' ? { _: 0 } : {}; paintSplit(); paintSums(); } });
    put(split, h('div.mhead', h('span.flabel', st.kind === 'income' ? t('for_whom_income') : t('for_whom')), h('span.spacer'), all, none), seg, tableSel, h('div.slist', rows));
  }

  /** The parts as they will be saved, the totals that do not add up, the amount in the currency of the group. */
  function paintSums() {
    const a = amt() || 0;
    amount.setAttribute('help-text', isSum(amount.value) && a ? '= ' + money(a, st.cur) : ' ');
    rateRow.hidden = st.cur === g.currency;
    rateRow.querySelector('.rl').textContent = `1 ${st.cur} =`;
    rateRow.querySelector('.rr').textContent = g.currency + (a && st.cur !== g.currency ? ' · ' + money(Math.round(a / 10 ** dec(st.cur) * st.rate * 10 ** dec(g.currency)), g.currency) : '');
    const msgs = [];
    if (st.kind !== 'transfer' && st.multi) {
      const paid = Object.values(st.payers).reduce((x, y) => x + y, 0);
      if (paid !== a) msgs.push(paid < a ? t('payers_left', { a: money(a - paid, st.cur) }) : t('payers_over', { a: money(paid - a, st.cur) }));
    }
    if (st.kind !== 'transfer') {
      const parts = st.mode === 'table' && st.parts._ === 0 ? { _: 0 } : Object.fromEntries(Object.entries(st.parts).filter(([k]) => k !== '_'));
      const p = previewSplit(a, { mode: st.mode, parts, table: st.table }, active, tables);
      for (const n of split.querySelectorAll('.part')) { const v = p.parts[n.dataset.id]; n.textContent = v ? money(v, st.cur) : ''; n.closest('.sr')?.classList.toggle('on', !!v); }
      if (st.mode === 'exact' && p.left) msgs.push(p.left > 0 ? t('exact_left', { a: money(p.left, st.cur) }) : t('exact_over', { a: money(-p.left, st.cur) }));
      if (st.mode === 'percent' && p.error) msgs.push(p.left > 0 ? t('percent_left', { n: p.left }) : t('percent_over', { n: -p.left }));
      if (p.error === 'table_empty') msgs.push(t('err_table_empty'));
    }
    put(sumNote, ...msgs.map((m) => h('span', icon('circle-alert'), ' ', m)));
    sumNote.hidden = !msgs.length;
  }

  function paint() {
    kind.hidden = alone;
    title.hidden = st.kind === 'transfer';
    title.setAttribute('placeholder', t(st.kind === 'income' ? 'what_income_ph' : 'what_ph'));
    cat.hidden = st.kind === 'transfer';
    repeat.hidden = st.kind === 'transfer';
    paintWho(); paintSplit(); paintSums();
  }
  paint();
  if (st.cur !== g.currency && !e) askRate();

  // ---------------------------------------------------------------- photos (a receipt, a bill): up to 6, 5 MB each
  const photos = h('div.ephotos');
  const pick = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  let busy = 0;
  async function addFiles(files) {
    for (const f of [...files].filter((x) => /^image\//.test(x.type) || /\.(jpe?g|png|webp|gif|heic)$/i.test(x.name))) {
      if (st.photos.length + busy >= 6) { toast(t('err_too_many_photos'), 'danger'); break; }
      if (f.size > 5 * 1048576) { toast(t('photo_too_big', { n: f.name }), 'danger'); continue; }
      busy++; paintPhotos();
      try { st.photos.push(await uploadPhoto(f)); } catch (x) { fail(x); } finally { busy--; paintPhotos(); }
    }
  }
  pick.addEventListener('change', () => { addFiles(pick.files); pick.value = ''; });
  function paintPhotos() {
    const tiles = st.photos.map((p, i) => h('div.ph', h('sav-image', { src: photoUrl(p.id), ratio: '1', fit: 'cover', zoom: true, alt: t('photo_n', { n: i + 1 }) }),
      h('sav-button.phx', { icon: 'x', label: t('remove_photo'), size: 'sm', square: true, appearance: 'solid', variant: 'neutral', onclick: () => { st.photos.splice(i, 1); paintPhotos(); } })));
    for (let i = 0; i < busy; i++) tiles.push(h('div.ph.wait', h('sav-spinner')));
    const add = st.photos.length + busy < 6 ? h('button.phadd', { type: 'button', onclick: () => pick.click() }, icon('camera'), h('span', t('add_photo'))) : null;
    put(photos, h('div.mhead', h('span.flabel', t('photos')), h('small.muted', t('photos_t'))), h('div.phgrid', tiles, add), pick);
  }
  paintPhotos();
  // a photo dropped on the dialog or pasted (a screenshot of a receipt) is attached too
  photos.addEventListener('dragover', (ev) => { ev.preventDefault(); photos.classList.add('over'); });
  photos.addEventListener('dragleave', () => photos.classList.remove('over'));
  photos.addEventListener('drop', (ev) => { ev.preventDefault(); photos.classList.remove('over'); addFiles(ev.dataTransfer.files); });

  const save = async () => {
    if (busy) throw Object.assign(new Error(), { code: 'photo_wait' });
    const a = amt();
    if (!a || a <= 0) throw Object.assign(new Error(), { code: 'amount_required' });
    const body = { eid: e?.id, photos: st.photos.map((p) => p.id), kind: st.kind, title: title.value, category: st.kind === 'transfer' ? '' : cat.value, day: day.value || todayKey(), amount: a, currency: st.cur, rate: st.rate, notes: notes.value, repeat: st.kind === 'transfer' ? '' : repeat.value };
    if (st.kind === 'transfer') { body.payers = { [st.payer]: a }; body.split = { mode: 'exact', parts: { [st.to]: a } }; }
    else {
      body.payers = st.multi ? st.payers : { [st.payer]: a };
      const parts = Object.fromEntries(Object.entries(st.parts).filter(([k, v]) => k !== '_' && v > 0));
      body.split = { mode: st.mode, parts, table: st.table };
    }
    const r = await groupCall('splits.expense.save', body);
    toast(t(e ? 'expense_saved' : 'expense_added'), 'success');
    redraw();
    // a monthly cap of My spending passed with this expense: a note (assets/budget.js)
    const mine = S.user && r.eid && r.me ? S.G.expenses.find((x) => x.id === r.eid)?.alloc[r.me] : 0;
    if (body.kind === 'expense' && body.category && mine > 0) import('./budget.js').then((m) => m.capCheck(body.category, body.day, mine, S.G.group.currency)).catch(() => {});
  };
  const actions = [{ label: t('cancel') }, { label: t(e ? 'save' : 'add'), primary: true, run: save }];
  if (e) actions.unshift({ label: t('delete'), danger: true, icon: 'trash', run: async () => { await removeExpense(e); } });
  const dlg = dialog({ title: e ? t('edit_expense') : t(st.kind === 'transfer' ? 'add_transfer' : 'add_expense'), width: '40rem', cls: 'edlg',
    body: h('div.form.eform', kind, title, h('div.amtrow', amount, curSel), rateRow, who, split, sumNote, h('div.grid2', day, cat), photos, repeat, h('sav-details.efold', { summary: t('notes'), appearance: 'plain', open: !!e?.notes || null }, notes),
      e ? h('small.muted.emeta', t('created_by', { n: e.by || t('someone'), w: when(e.created) })) : null),
    actions });
  dlg.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); dlg.primary?.click(); } });
  dlg.addEventListener('paste', (ev) => { const f = [...(ev.clipboardData?.files || [])]; if (f.length) { ev.preventDefault(); addFiles(f); } });
}

/** Deleted, with the chance to bring it back at once. */
export async function removeExpense(e) {
  await groupCall('splits.expense.delete', { eid: e.id });
  redraw();
  const note = toast(t('expense_deleted', { n: e.title || t('k_' + e.kind) }), 'neutral', { duration: 8000 });
  note?.append(' ', btn(t('undo'), { size: 'sm', appearance: 'outline', icon: 'undo', onclick: async () => { note.remove(); try { await groupCall('splits.expense.restore', { eid: e.id }); redraw(); toast(t('expense_back'), 'success'); } catch (x) { fail(x); } } }));
}

/** An expense for whoever may only look: everything about it, and each one's part. */
function readOnly(e) {
  const d = S.G, cur = d.group.currency;
  const row = (l, v) => h('div.drow', h('span.muted', l), h('b', v));
  const parts = Object.entries(e.alloc).map(([id, v]) => h('div.pr', face(memberName(id), null, 24), h('span.grow', memberName(id)), h('b', money(Math.abs(v), cur))));
  dialog({ title: e.title || t('k_' + e.kind), width: '30rem', body: h('div.form',
    row(t('amount'), money(e.amount, e.currency) + (e.currency !== cur ? ` · ${money(e.base, cur)}` : '')), row(t('day'), longDay(e.day)), e.category ? row(t('category'), catName(e.category)) : null,
    row(e.kind === 'income' ? t('received_by_l') : e.kind === 'transfer' ? t('from_who') : t('paid_by_l'), Object.entries(e.payers).map(([id, v]) => memberName(id) + (Object.keys(e.payers).length > 1 ? ' ' + money(v, e.currency) : '')).join(', ')),
    h('div', h('span.flabel', e.kind === 'transfer' ? t('to_who') : t('for_whom')), h('div.plist2', parts)), e.notes ? h('p.enotes', e.notes) : null,
    e.photos?.length ? h('div', h('span.flabel', t('photos')), h('div.phgrid', e.photos.map((p, i) => h('div.ph', h('sav-image', { src: photoUrl(p.id), ratio: '1', fit: 'cover', zoom: true, alt: t('photo_n', { n: i + 1 }) }))))) : null,
    h('small.muted', t('created_by', { n: e.by || t('someone'), w: when(e.created) }))), actions: [{ label: t('close') }] });
}

