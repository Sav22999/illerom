/**
 * The editor of a schedule. The calendar is the main surface: a press on the week adds a slot of the chosen length, a
 * drag draws a longer one; the month adds whole days. On the side: the list of what was added, the details, the rules.
 * Changes are saved by themselves (a new schedule is created at its first change).
 */
import { btn, confirm, dialog, drop, fail, h, icon, iconBtn, mobile, primary, put, select, segmented, toast, toggle } from './ui.js';
import { t } from './i18n.js';
import { S, api } from './store.js';
import { go, prefs, userMenu } from './account.js';
import { BASE, COLORS, KINDS, PRESETS, genSlots } from './plan.js';
import { addDays, byDay, byTime, dayKey, dayLabel, hm, keyParts, LOCAL_TZ, longDay, mondayOf, monthLabel, parts, place, span, todayKey, weekday, zoned, ZONES, zoneName } from './time.js';
import { shareDialog } from './share.js';

let HOUR = 44; // pixels of one hour in the week: taller when the slots are short, so that each one can be read
const isoZ = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
const LENGTHS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 480];

export async function editor(root, pid, start) {
  let s;
  if (pid) s = (await api('sch.get', undefined, { id: pid })).schedule;
  else {
    const preset = PRESETS[start], kind = preset ? preset.kind : start === 'slots' ? 'slots' : 'poll';
    const tz = prefs().defaults?.tz || LOCAL_TZ;
    const built = preset ? preset.build(tz) : { settings: {}, options: [] };
    s = { id: null, kind, title: preset ? t('p_' + start) : '', descr: '', place: '', settings: { ...BASE, tz, ...(prefs().defaults || {}), ...built.settings, tz }, options: built.options.map((o) => ({ ...o, start: o.start && isoZ(Date.parse(o.start)), end: o.end && isoZ(Date.parse(o.end)) })), status: 'open', responses: [] };
    if (kind === 'slots' && !built.settings.maxPer && built.settings.maxPer !== 0) s.settings.maxPer = 1;
  }
  const set = s.settings, slots = s.kind === 'slots';
  const tz = () => set.tz;
  let anchor = s.options.length ? (s.options[0].day || dayKey(Date.parse([...s.options].sort(byTime)[0].start), tz())) : todayKey(tz());
  let view = !slots && s.options.length && s.options.every((o) => o.day) ? 'month' : 'week';
  let edits = 0, saving = null, timer = 0, gone = false;

  // ------------------------------------------------------------------ saving
  const status = h('span.status', { 'data-s': s.id ? 'saved' : 'new' }, s.id ? t('saved') : t('not_saved'));
  const setStatus = (k) => { status.dataset.s = k; status.textContent = t({ saved: 'saved', saving: 'saving', new: 'not_saved', error: 'not_saved_err' }[k]); };
  const payload = () => ({ id: s.id, kind: s.kind, title: s.title.trim() || t(slots ? 'untitled_slots' : 'untitled_poll'), descr: s.descr, place: s.place, settings: set, options: s.options.map(({ id, start, end, day, label, cap }) => ({ id, start, end, day, label, cap })) });
  function changed() { edits++; setStatus('saving'); clearTimeout(timer); timer = setTimeout(save, 900); }
  async function save() {
    if (saving) { await saving; if (!edits) return; }
    const mark = edits;
    edits = 0;
    saving = (async () => {
      try {
        const r = await api(s.id ? 'sch.save' : 'sch.create', payload());
        const fresh = !s.id;
        s.id = r.schedule.id;
        // the new options get their ids (the same time and label, not yet claimed)
        const free = r.schedule.options.filter((o) => !s.options.some((x) => x.id === o.id));
        for (const o of s.options) if (!o.id) { const i = free.findIndex((x) => x.start === o.start && x.end === o.end && x.day === o.day && x.label === o.label); if (i >= 0) { o.id = free[i].id; free.splice(i, 1); } }
        for (const o of s.options) { const x = r.schedule.options.find((y) => y.id === o.id); if (x) { o.yes = x.yes; o.maybe = x.maybe; } }
        Object.assign(s, { status: r.schedule.status, closed: r.schedule.closed, responses: r.schedule.responses });
        if (fresh && !gone) { history.replaceState(null, '', '#/e/' + s.id); drawTop(); }
        setStatus(edits ? 'saving' : 'saved');
      } catch (e) { edits += mark; setStatus('error'); fail(e); }
    })();
    await saving;
    saving = null;
    if (edits && !gone) { clearTimeout(timer); timer = setTimeout(save, 900); }
  }
  const flush = async () => { clearTimeout(timer); if (edits || !s.id) await save(); };

  // ------------------------------------------------------------------ frame
  const title = h('sav-input.dtitle', { value: s.title, placeholder: t(slots ? 'untitled_slots' : 'untitled_poll'), maxlength: 160, 'aria-label': t('title_l') });
  title.addEventListener('input', () => { s.title = title.value; changed(); });
  const top = h('header.etop'), cal = h('div.cal'), side = h('aside.eside'), toolbar = h('div.ctools');
  put(root, h('div.edit', { style: `--c:${COLORS[set.color] || COLORS.blue}` }, top, h('div.ebody', h('section.emain', toolbar, cal), side)));
  function drawTop() {
    const answers = iconBtn('chart-column', t('see_answers'), async () => { await flush(); go('#/r/' + s.id); }, { disabled: !s.id || null });
    const preview = iconBtn('eye', t('preview'), async () => { await flush(); window.open('#/s/' + s.id, '_blank', 'noopener'); }, { disabled: !s.id || null });
    put(top, h('a.ehome', { href: '#/', title: t('home'), onclick: async (e) => { e.preventDefault(); await flush(); go('#/'); } }, h('img', { src: 'icons/favicon.svg', width: 34, height: 34, alt: t('home') })),
      h('div.etitle', title), h('sav-badge.kchip', { appearance: 'soft', variant: 'neutral', pill: true }, icon(KINDS[s.kind].icon), ' ', t('k_' + s.kind)), status, h('span.spacer'),
      preview, answers, primary(t('share'), { icon: 'share-2', size: 'sm', onclick: async () => { await flush(); if (!s.options.length) toast(t('add_first'), 'warning'); shareDialog({ ...s, settings: set }); } }), userMenu());
  }
  drawTop();

  // ------------------------------------------------------------------ calendar
  const days = () => (view === 'week' ? (mobile() ? 3 : 7) : 0);
  const firstDay = () => (days() === 7 ? mondayOf(anchor) : anchor);
  function drawTools() {
    const label = view === 'month' ? monthLabel(anchor) : (() => { const a = firstDay(), b = addDays(a, days() - 1); return keyParts(a)[1] === keyParts(b)[1] ? `${dayLabel(a, { day: 'numeric' })}–${dayLabel(b, { day: 'numeric', month: 'long', year: 'numeric' })}` : `${dayLabel(a, { day: 'numeric', month: 'short' })} – ${dayLabel(b, { day: 'numeric', month: 'short', year: 'numeric' })}`; })();
    const move = (n) => { if (view === 'month') { const [y, m] = keyParts(anchor); anchor = `${new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10)}`; } else anchor = addDays(anchor, n * days()); drawCal(); };
    const len = select(null, [...LENGTHS.map((m) => [String(m), m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m / 60} h`])], String(set.duration), (v) => { set.duration = +v; changed(); }, { 'aria-label': t('length'), class: 'lensel' });
    put(toolbar, h('div.prow0', iconBtn('chevron-left', t('previous'), () => move(-1)), btn(t('today'), { size: 'sm', appearance: 'outline', onclick: () => { anchor = todayKey(tz()); drawCal(); } }), iconBtn('chevron-right', t('next'), () => move(1))), h('strong.clabel', label),
      h('span.spacer'), view === 'week' ? h('label.lenwrap', h('span.muted.small', t('new_length')), len) : h('span.muted.small.hint', t(slots ? 'month_hint_slots' : 'month_hint')),
      segmented(t('view'), view, [['week', 'calendar-range', t('week')], ['month', 'calendar-days', t('month')]], (v) => { view = v; drawCal(); }),
      btn(t('series'), { icon: 'wand-sparkles', size: 'sm', appearance: 'soft', variant: 'primary', onclick: seriesDialog }));
  }
  function drawCal() {
    drawTools();
    if (view === 'month') return drawMonth();
    const n = days(), first = firstDay(), keys = Array.from({ length: n }, (_, i) => addDays(first, i)), today = todayKey(tz());
    const placed = s.options.map((o) => ({ o, p: place(o, tz()) }));
    const shortest = Math.min(set.duration, ...placed.filter((x) => !x.p.allDay && keys.includes(x.p.key)).map((x) => x.p.end - x.p.start));
    HOUR = Math.round(Math.max(44, Math.min(120, (24 * 60) / Math.max(5, shortest))));
    const head = h('div.wk-head', { style: `--n:${n}` }, h('span.gut', h('small', tz().split('/').pop().replace(/_/g, ' '))), keys.map((k) => h('div.wk-day' + (k === today ? '.today' : ''), h('small', dayLabel(k, { weekday: 'short' })), h('b', String(keyParts(k)[2])))));
    const allday = h('div.wk-all', { style: `--n:${n}` }, h('span.gut', h('small', t('all_day'))), keys.map((k) => {
      const mine = placed.filter((x) => x.p.allDay && x.p.key === k);
      const cell = h('div.wk-allc', { title: t('add_all_day'), onclick: (e) => { if (e.target === cell) addOption({ day: k }); } }, mine.map(({ o }) => block(o, true)));
      return cell;
    }));
    const hours = h('div.wk-hours', Array.from({ length: 24 }, (_, i) => h('span', { style: `top:${i * HOUR}px` }, i ? hm(i * 60) : '')));
    const cols = keys.map((k) => {
      const col = h('div.wk-col' + (k === today ? '.today' : ''), { 'data-k': k });
      for (const { o, p } of placed) if (!p.allDay && p.key === k) { const b = block(o); b.style.top = (p.start / 60) * HOUR + 'px'; b.style.height = Math.max(18, ((p.end - p.start) / 60) * HOUR - 2) + 'px'; col.append(b); }
      drawOn(col, k);
      return col;
    });
    const body = h('div.wk-body', { style: `--n:${n};--hh:${HOUR}px;height:${24 * HOUR}px` }, hours, cols);
    if (today >= first && today <= addDays(first, n - 1)) { const p = parts(Date.now(), tz()); body.append(h('div.now', { style: `top:${((p.h * 60 + p.mi) / 60) * HOUR}px;--i:${keys.indexOf(today)}` })); }
    const scroll = h('div.wk-scroll', body);
    put(cal, h('div.week', head, allday, scroll));
    // to the first slot of the week, or 8:00
    const starts = placed.filter((x) => !x.p.allDay && keys.includes(x.p.key)).map((x) => x.p.start), firstMin = starts.length ? Math.min(...starts) : 8 * 60;
    requestAnimationFrame(() => { scroll.scrollTop = Math.max(0, (firstMin / 60) * HOUR - HOUR / 2); });
  }
  /** A press adds a slot of the chosen length; a drag draws it. */
  function drawOn(col, k) {
    col.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target !== col) return;
      e.preventDefault();
      const r = col.getBoundingClientRect(), at = (y) => Math.max(0, Math.min(24 * 60, Math.round(((y - r.top) / HOUR) * 60 / 15) * 15));
      const a = Math.min(at(e.clientY), 24 * 60 - 15);
      let b = a, moved = false;
      const ghost = h('div.ghost', { style: `top:${(a / 60) * HOUR}px;height:${(set.duration / 60) * HOUR}px` }, h('b', hm(a) + '–' + hm(Math.min(a + set.duration, 1440))));
      col.append(ghost);
      col.setPointerCapture(e.pointerId);
      const mv = (ev) => { b = at(ev.clientY); if (Math.abs(b - a) >= 15) moved = true; if (moved) { const lo = Math.min(a, b), hi = Math.max(a, b, lo + 15); ghost.style.top = (lo / 60) * HOUR + 'px'; ghost.style.height = ((hi - lo) / 60) * HOUR + 'px'; ghost.firstChild.textContent = hm(lo) + '–' + hm(hi); } };
      const up = () => {
        col.removeEventListener('pointermove', mv);
        ghost.remove();
        let lo = a, hi = Math.min(a + set.duration, 1440);
        if (moved) { lo = Math.min(a, b); hi = Math.max(a, b, lo + 15); }
        const [y, m, d] = keyParts(k);
        // a long drag on a sheet of slots cuts the time into slots of the chosen length
        if (moved && slots && hi - lo > set.duration * 1.5) { addMany(genSlots({ from: k, to: k, start: lo, end: hi, len: set.duration, cap: set.cap, tz: tz() })); return; }
        addOption({ start: isoZ(zoned(y, m, d, Math.floor(lo / 60), lo % 60, tz())), end: isoZ(zoned(y, m, d, Math.floor(hi / 60), hi % 60, tz())) });
      };
      col.addEventListener('pointermove', mv);
      col.addEventListener('pointerup', up, { once: true });
      col.addEventListener('pointercancel', () => { col.removeEventListener('pointermove', mv); ghost.remove(); }, { once: true });
    });
  }
  function block(o, allDay = false) {
    const taken = (o.yes || 0) + (o.maybe || 0);
    const b = h('button.blk' + (allDay ? '.allday' : '') + (taken ? '.has' : ''), { type: 'button', title: t('edit_option'), onclick: (e) => { e.stopPropagation(); optionDialog(o); } },
      h('b', allDay ? t('all_day') : span(o, tz(), '')), o.label ? h('span', o.label) : null, slots && o.cap > 1 ? h('small', t('places_n', { n: o.cap })) : null, taken ? h('em', icon('user-check'), String(taken)) : null);
    return b;
  }
  function drawMonth() {
    const [y, m] = keyParts(anchor), first = `${y}-${String(m).padStart(2, '0')}-01`, startK = mondayOf(first), today = todayKey(tz());
    const counts = new Map(), whole = new Set();
    for (const o of s.options) { const p = place(o, tz()); if (p.allDay) whole.add(p.key); else counts.set(p.key, (counts.get(p.key) || 0) + 1); }
    const names = Array.from({ length: 7 }, (_, i) => h('small', dayLabel(addDays('2024-01-01', i), { weekday: 'short' })));
    const cells = Array.from({ length: 42 }, (_, i) => {
      const k = addDays(startK, i), inMonth = keyParts(k)[1] === m;
      const c = h('button.mday' + (inMonth ? '' : '.out') + (k === today ? '.today' : '') + (whole.has(k) ? '.on' : ''), { type: 'button', 'aria-pressed': String(whole.has(k)), 'aria-label': longDay(k),
        onclick: () => { if (slots) { anchor = k; view = 'week'; drawCal(); return; } const o = s.options.find((x) => x.day === k); if (o) removeOption(o); else addOption({ day: k }); } },
      h('b', String(keyParts(k)[2])), whole.has(k) ? icon('check') : null, counts.get(k) ? h('small.mcount', t('times_n', { n: counts.get(k) })) : null);
      return c;
    });
    put(cal, h('div.month', h('div.mnames', names), h('div.mgrid', cells)));
  }

  // ------------------------------------------------------------------ changing the options
  function addOption(o) { const x = { id: null, label: '', cap: slots ? set.cap : 1, yes: 0, maybe: 0, start: null, end: null, day: null, ...o }; if (s.options.some((y) => y.day === x.day && y.start === x.start && y.end === x.end && !x.label && !y.label)) return; s.options.push(x); changed(); drawCal(); drawSide(); }
  function addMany(list) {
    const room = 400 - s.options.length;
    if (room <= 0) return toast(t('err_too_many_options'), 'warning');
    const add = list.filter((x) => !s.options.some((y) => y.start === x.start && y.end === x.end && y.day === (x.day || null) && (y.label || '') === (x.label || ''))).slice(0, room);
    for (const x of add) s.options.push({ id: null, label: '', cap: slots ? set.cap : 1, yes: 0, maybe: 0, end: null, day: null, start: null, ...x });
    toast(t('added_n', { n: add.length }), 'success');
    changed(); drawCal(); drawSide();
  }
  async function removeOption(o, ask = true) {
    if (ask && (o.yes || o.maybe) && !(await confirm(t('remove_option'), t('remove_option_t', { n: (o.yes || 0) + (o.maybe || 0) }), t('remove')))) return;
    s.options = s.options.filter((x) => x !== o);
    changed(); drawCal(); drawSide();
  }
  function optionDialog(o) {
    const p = place(o, tz());
    const date = h('sav-date-picker', { label: t('date'), value: p.key, size: 'sm' });
    const allDay = h('sav-switch', { checked: p.allDay || null, size: 'sm' }, t('all_day'));
    const from = h('sav-time-picker', { label: t('from'), value: p.allDay ? '09:00' : hm(p.start), step: 5, size: 'sm' }), to = h('sav-time-picker', { label: t('to'), value: p.allDay ? '10:00' : hm(p.end % 1440), step: 5, size: 'sm' });
    const times = h('div.grid2', from, to);
    times.hidden = p.allDay;
    allDay.addEventListener('change', () => { times.hidden = allDay.checked; });
    const label = h('sav-input', { label: t('option_label'), value: o.label, maxlength: 120, size: 'sm', help: t(slots ? 'label_help_slots' : 'label_help') });
    const cap = slots ? h('sav-number-input', { label: t('places'), value: o.cap, min: 1, max: 500, size: 'sm' }) : null;
    const taken = (o.yes || 0) + (o.maybe || 0);
    dialog({ title: t('edit_option'), width: '26rem', body: h('div.form', date, allDay, times, label, cap, taken ? h('sav-alert', { variant: 'warning' }, t('option_has', { n: taken })) : null),
      actions: [{ label: t('remove'), danger: true, run: () => { removeOption(o); } }, { label: t('cancel') }, { label: t('save'), primary: true, run: () => {
        const [y, m, d] = keyParts(date.value || p.key);
        if (allDay.checked) Object.assign(o, { day: date.value || p.key, start: null, end: null });
        else {
          const [fh, fm] = (from.value || '09:00').split(':').map(Number), [th, tm] = (to.value || '10:00').split(':').map(Number);
          let a = zoned(y, m, d, fh, fm, tz()), b = zoned(y, m, d, th, tm, tz());
          if (b <= a) b += 86400000; // past midnight
          Object.assign(o, { day: null, start: isoZ(a), end: isoZ(b) });
        }
        o.label = label.value.trim();
        if (cap) o.cap = Math.max(1, Math.min(500, parseInt(cap.value, 10) || 1));
        changed(); drawCal(); drawSide();
      } }] });
  }
  /** A series: every few minutes between two times, on some days of the week, for a range of dates. */
  function seriesDialog() {
    const k0 = view === 'month' ? anchor : firstDay();
    const from = h('sav-date-picker', { label: t('from_day'), value: k0, size: 'sm' }), to = h('sav-date-picker', { label: t('to_day'), value: addDays(k0, slots ? 4 : 6), size: 'sm' });
    const wds = h('sav-chip-group', { label: t('weekdays'), multiple: true }, Array.from({ length: 7 }, (_, i) => h('sav-chip', { value: String(i), selected: i < 5 || null }, dayLabel(addDays('2024-01-01', i), { weekday: 'short' }))));
    const a = h('sav-time-picker', { label: t('from'), value: '09:00', step: 5, size: 'sm' }), b = h('sav-time-picker', { label: t('to'), value: slots ? '12:00' : '10:00', step: 5, size: 'sm' });
    const len = select(t('length'), LENGTHS.map((m) => [String(m), m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m / 60} h`]), String(set.duration), null, { size: 'sm' });
    const gap = select(t('gap'), [0, 5, 10, 15, 30, 60].map((m) => [String(m), m ? `${m} min` : t('no_gap')]), '0', null, { size: 'sm' });
    const cap = slots ? h('sav-number-input', { label: t('places'), value: set.cap, min: 1, max: 500, size: 'sm' }) : null;
    const label = h('sav-input', { label: t('option_label'), maxlength: 120, size: 'sm', placeholder: t(slots ? 'label_ph_slots' : 'label_ph') });
    const allDay = !slots ? h('sav-switch', { size: 'sm' }, t('series_days')) : null;
    const count = h('p.muted.small');
    const gen = () => {
      const wd = [...wds.querySelectorAll('sav-chip')].filter((c) => c.selected).map((c) => +c.value);
      if (allDay?.checked) { const out = []; for (let k = from.value, i = 0; k <= to.value && i < 400; k = addDays(k, 1), i++) if (wd.includes(weekday(k))) out.push({ day: k, label: label.value.trim() }); return out; }
      const [ah, am] = (a.value || '09:00').split(':').map(Number), [bh, bm] = (b.value || '10:00').split(':').map(Number);
      return genSlots({ from: from.value, to: to.value, weekdays: wd, start: ah * 60 + am, end: bh * 60 + bm, len: +len.value, gap: +gap.value, cap: cap ? Math.max(1, parseInt(cap.value, 10) || 1) : 1, label: label.value.trim(), tz: tz() });
    };
    const upd = () => { const n = gen().length; count.textContent = n ? t('will_add', { n }) : t('will_add_0'); };
    const times = h('div.stack', h('div.grid2', a, b), h('div.grid2', len, gap));
    allDay?.addEventListener('change', () => { times.hidden = allDay.checked; upd(); });
    const body = h('div.form', h('div.grid2', from, to), wds, allDay, times, h('div.grid2', cap, label), count);
    body.addEventListener('change', upd);
    body.addEventListener('sav-change', upd);
    body.addEventListener('input', upd);
    setTimeout(upd, 50);
    dialog({ title: t('series'), width: '32rem', body, actions: [{ label: t('cancel') }, { label: t('add'), icon: 'plus', primary: true, run: () => { const list = gen(); if (!list.length) return false; addMany(list.map((x) => ({ ...x, start: x.start && isoZ(Date.parse(x.start)), end: x.end && isoZ(Date.parse(x.end)) }))); } }] });
  }

  // ------------------------------------------------------------------ side: options, details, rules
  let tab = 'list';
  function drawSide() {
    const tabs = h('sav-tabs.stabs', { value: tab }, h('sav-tab', { label: t(slots ? 'tab_slots' : 'tab_dates') + ` (${s.options.length})`, value: 'list' }, listPane()), h('sav-tab', { label: t('tab_details'), value: 'details' }, detailsPane()), h('sav-tab', { label: t('tab_rules'), value: 'rules' }, rulesPane()));
    tabs.addEventListener('sav-tab-show', (e) => { tab = e.detail?.value || e.detail?.name || tab; });
    put(side, tabs);
  }
  function listPane() {
    if (!s.options.length) return h('div.stack.pane', h('sav-empty-state', { icon: slots ? 'ticket' : 'calendar-plus', heading: t(slots ? 'no_slots' : 'no_dates'), text: t(slots ? 'no_slots_t' : 'no_dates_t') }), btn(t('series'), { icon: 'wand-sparkles', onclick: seriesDialog }));
    const groups = byDay(s.options, tz());
    const copyDay = (k, list, n) => addMany(list.map((o) => (o.day ? { day: addDays(o.day, n), label: o.label } : { start: isoZ(Date.parse(o.start) + n * 864e5), end: o.end && isoZ(Date.parse(o.end) + n * 864e5), label: o.label, cap: o.cap })));
    const total = slots ? s.options.reduce((a, o) => a + o.cap, 0) : 0;
    return h('div.pane.olist', slots ? h('p.muted.small', t('slots_total', { n: s.options.length, p: total })) : null, groups.map(([k, list]) => h('div.oday',
      h('div.odhead', h('button.odlabel', { type: 'button', onclick: () => { anchor = k; if (!list[0].day || slots) view = 'week'; drawCal(); } }, h('b', dayLabel(k, { weekday: 'long', day: 'numeric', month: 'long' }))), h('span.spacer'),
        drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', size: 'sm', square: true }), [['copy-plus', t('copy_next_day'), () => copyDay(k, list, 1)], ['copy-plus', t('copy_next_week'), () => copyDay(k, list, 7)], '-', ['trash', t('remove_day'), async () => { const n = list.reduce((a, o) => a + (o.yes || 0) + (o.maybe || 0), 0); if (n && !(await confirm(t('remove_day'), t('remove_option_t', { n }), t('remove')))) return; s.options = s.options.filter((x) => !list.includes(x)); changed(); drawCal(); drawSide(); }, { danger: true }]], { placement: 'bottom-end' })),
      list.map((o) => h('div.orow', h('button.otime', { type: 'button', onclick: () => optionDialog(o) }, h('b', span(o, tz(), t('all_day'))), o.label ? h('small', o.label) : null),
        slots ? h('sav-badge', { appearance: 'soft', variant: o.yes >= o.cap ? 'warning' : 'neutral', pill: true, title: t('places') }, `${o.yes || 0}/${o.cap}`) : (o.yes || o.maybe) ? h('sav-badge', { appearance: 'soft', variant: 'success', pill: true }, String(o.yes || 0)) : null,
        h('sav-button', { icon: 'x', label: t('remove'), appearance: 'ghost', size: 'sm', square: true, onclick: () => removeOption(o) })))
    )));
  }
  function detailsPane() {
    const d = h('sav-textarea', { label: t('description'), value: s.descr, rows: 5, maxlength: 4000, resize: 'auto', placeholder: t('descr_ph') });
    d.addEventListener('input', () => { s.descr = d.value; changed(); });
    const pl = h('sav-input', { label: t('place'), value: s.place, maxlength: 200, placeholder: t('place_ph') }, icon('map-pin', { slot: 'prefix' }));
    pl.addEventListener('input', () => { s.place = pl.value; changed(); });
    const colors = h('div.colors', { role: 'radiogroup', 'aria-label': t('color') }, Object.entries(COLORS).map(([k, c]) => h('button.cdot' + (set.color === k ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': String(set.color === k), 'aria-label': t('c_' + k), title: t('c_' + k), style: `--c:${c}`, 'data-k': k,
      onclick: () => { set.color = k; root.querySelector('.edit').style.setProperty('--c', c); colors.querySelectorAll('.cdot').forEach((x) => { x.classList.toggle('on', x.dataset.k === k); x.setAttribute('aria-checked', String(x.dataset.k === k)); }); changed(); } })));
    return h('div.pane.form', d, pl, h('div', h('span.flabel', t('color')), colors, h('p.muted.small', t('color_t'))));
  }
  function rulesPane() {
    const sw = (k, label, help, after) => { const x = h('sav-switch', { checked: set[k] || null, help }, label); x.addEventListener('change', () => { set[k] = x.checked; changed(); after?.(); }); return x; };
    const access = h('sav-radio-group', { label: t('who_answers'), value: set.access }, h('sav-radio', { value: 'open' }, h('div.rlab', h('b', t('acc_open')), h('small', t('acc_open_t')))), h('sav-radio', { value: 'account' }, h('div.rlab', h('b', t('acc_account')), h('small', t('acc_account_t')))));
    const askEmail = select(t('ask_email'), [['no', t('email_no')], ['optional', t('email_optional')], ['required', t('email_required')]], set.askEmail, (v) => { set.askEmail = v; changed(); }, { size: 'md' });
    askEmail.hidden = set.access === 'account';
    access.addEventListener('change', () => { set.access = access.value; askEmail.hidden = set.access === 'account'; changed(); });
    const num = (k, label, help, min = 0) => { const n = h('sav-number-input', { label, help, value: set[k], min, max: 400, size: 'md' }); n.addEventListener('change', () => { set[k] = Math.max(min, Math.min(400, parseInt(n.value, 10) || 0)); changed(); }); return n; };
    // deadline: a day and a time in the zone of the schedule
    const dl = set.deadline ? parts(Date.parse(set.deadline), tz()) : null;
    const dlOn = h('sav-switch', { checked: !!dl || null }, t('deadline'));
    const dlDay = h('sav-date-picker', { label: t('date'), value: dl ? `${dl.y}-${String(dl.m).padStart(2, '0')}-${String(dl.d).padStart(2, '0')}` : addDays(todayKey(tz()), 7), size: 'sm' });
    const dlTime = h('sav-time-picker', { label: t('time'), value: dl ? hm(dl.h * 60 + dl.mi) : '23:59', step: 5, size: 'sm' });
    const dlRow = h('div.grid2', dlDay, dlTime);
    dlRow.hidden = !dl;
    const setDl = () => { dlRow.hidden = !dlOn.checked; if (!dlOn.checked) set.deadline = null; else { const [y, m, d] = keyParts(dlDay.value || todayKey(tz())), [hh, mm] = (dlTime.value || '23:59').split(':').map(Number); set.deadline = isoZ(zoned(y, m, d, hh, mm, tz())); } changed(); };
    dlOn.addEventListener('change', setDl); dlDay.addEventListener('change', setDl); dlTime.addEventListener('change', setDl);
    const zone = select(t('timezone'), ZONES.map((z) => [z, z.replace(/_/g, ' ')]), set.tz, (v) => { set.tz = v; changed(); drawCal(); drawSide(); }, { size: 'md', searchable: true, help: t('timezone_t') });
    const open = h('sav-switch', { checked: s.status === 'open' || null, disabled: !s.id || s.status === 'suspended' || null, help: t('accepting_t') }, t('accepting'));
    open.addEventListener('change', async () => { try { const r = await api('sch.status', { id: s.id, open: open.checked }); s.status = r.schedule.status; s.closed = r.schedule.closed; } catch (e) { fail(e); open.checked = !open.checked; } });
    return h('div.pane.form', h('section.rsec', h('h3', icon('users'), t('r_who')), access, askEmail, sw('note', t('allow_note'))),
      h('section.rsec', h('h3', icon(KINDS[s.kind].icon), t(slots ? 'r_slots' : 'r_poll')), slots ? [num('maxPer', t('max_per'), t('max_per_t')), num('cap', t('cap_default'), t('cap_default_t'), 1)] : [sw('maybe', t('allow_maybe'), t('allow_maybe_t')), num('minPer', t('min_per'), t('min_per_t'))], sw('hidden', t('hide_answers'), t(slots ? 'hide_answers_slots' : 'hide_answers_t'))),
      h('section.rsec', h('h3', icon('clock'), t('r_time')), open, dlOn, dlRow, zone),
      h('section.rsec', h('h3', icon('bell'), t('r_mail')), sw('notify', t('notify'), S.config.mailReady ? t('notify_t') : t('mail_off'))));
  }

  drawCal();
  drawSide();
  document.title = (s.title || t('k_' + s.kind)) + ' · SavSchedules';
  let lastMobile = mobile();
  const onResize = () => { if (mobile() !== lastMobile) { lastMobile = mobile(); drawCal(); } };
  addEventListener('resize', onResize);
  const beforeUnload = (e) => { if (edits || saving) { e.preventDefault(); e.returnValue = ''; } };
  addEventListener('beforeunload', beforeUnload);
  return () => { gone = true; removeEventListener('resize', onResize); removeEventListener('beforeunload', beforeUnload); if (edits) { clearTimeout(timer); save(); } };
}
