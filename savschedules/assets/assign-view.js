/**
 * Kind "assign", for the owner: the recommended way of giving each person a slot of their own, the other possible
 * solutions, the people who cannot be placed (with the choice of forcing them), changes by hand and the confirmation.
 * Once confirmed, the assignment is kept on the server and everybody sees their slot on the page of the schedule.
 */
import { btn, confirm, dialog, drop, face, fail, h, icon, primary, put, toast } from './ui.js';
import { t, tn } from './i18n.js';
import { S, api } from './store.js';
import { byDay, longDay, span } from './time.js';
import { changes, solver } from './assign.js';

// what was being looked at survives the redraws of the page (a refresh, a new answer of the same people)
let memo = { key: '', force: false, alts: [], cur: null, editing: false, sv: null };

const AV = { 2: ['check', 'success', 'av_yes'], 1: ['circle-help', 'warning', 'av_maybe'], 0: ['x', 'danger', 'st_forced'] };

/** s: the schedule (owner view); onSaved(schedule) after a confirmation or a cancellation. Returns {panel, best} */
export function assignView(s, { tz, onSaved }) {
  const people = s.responses.map((r) => ({ id: r.id, name: r.name, choices: Object.fromEntries(Object.entries(r.choices).map(([k, v]) => [+k, v])) }));
  const options = s.options;
  const key = s.id + '|' + JSON.stringify([people.map((p) => [p.id, p.choices]), options.map((o) => o.id), s.assignment]);
  if (memo.key !== key) memo = { key, force: memo.key.split('|')[0] === s.id && memo.force, alts: [], cur: null, editing: !s.assigned, sv: null };
  const byP = new Map(people.map((p) => [p.id, p])), byO = new Map(options.map((o) => [o.id, o]));
  const saved = new Map((s.assignment || []).map((a) => [a.response, a.option]));
  const optText = (o) => (o.day ? longDay(o.day) : longDay(byDay([o], tz)[0][0]) + ' · ' + span(o, tz, '')) + (o.label ? ' · ' + o.label : '');
  const av = (p, o) => p.choices[o] || 0;

  const compute = () => {
    memo.sv = solver(people, options, { force: memo.force });
    memo.alts = [];
    if (!memo.cur || memo.cur.kind !== 'custom') memo.cur = { kind: 'best', map: new Map(memo.sv.best.map) };
  };
  if (!memo.sv) compute();
  if (!memo.editing && s.assigned) memo.cur = { kind: 'saved', map: saved };
  const sv = () => memo.sv;

  const panel = h('div.asgwrap');
  const draw = () => put(panel, mainCard(), memo.editing ? altsCard() : null);

  // ------------------------------------------------------------------ the assignment shown
  function mainCard() {
    const map = memo.cur.map, d = sv().describe(map), n = people.length;
    const kind = memo.cur.kind, isSaved = kind === 'saved';
    const title = { best: t('sol_rec'), alt: t('sol_n', { n: (memo.cur.idx || 0) + 2 }), custom: t('sol_custom'), saved: t('sol_saved') }[kind];
    const chip = (ic, variant, text) => h('sav-badge', { appearance: 'soft', variant, pill: true }, icon(ic), ' ', text);
    const chips = h('div.achips', chip('users', d.out.length ? 'warning' : 'success', t('placed_n', { a: d.placed, b: n })), d.available ? chip('check', 'success', tn('av_n', d.available)) : null,
      d.maybe ? chip('circle-help', 'warning', tn('maybe_free_n', d.maybe)) : null, d.forced ? chip('triangle-alert', 'danger', tn('forced_n', d.forced)) : null);
    const occupant = new Map([...map].map(([p, o]) => [o, p]));
    const rows = options.map((o) => {
      const pid = occupant.get(o.id), p = pid != null ? byP.get(pid) : null;
      const who = p ? h('div.aperson', face(p.name, null, 28), h('b', p.name), status(p, o.id)) : h('span.muted.small.afree', t('free'));
      return h('div.arow' + (p ? '' : '.empty') + (p && !av(p, o.id) ? '.forced' : ''), h('div.aslot', h('b', o.day ? longDay(o.day) : longDay(byDay([o], tz)[0][0])), h('small', [o.day ? t('all_day') : span(o, tz, ''), o.label].filter(Boolean).join(' · '))),
        who, memo.editing ? personMenu(o) : null);
    });
    const outRows = d.out.map((pid) => { const p = byP.get(pid); return h('div.arow.out', h('div.aperson', face(p.name, null, 28), h('b', p.name), h('sav-badge', { appearance: 'soft', variant: 'danger', pill: true }, icon('user-x'), ' ', t('without_slot'))), memo.editing ? slotMenu(p) : null); });
    const warn = [];
    if (s.settings.expected && n < s.settings.expected) warn.push(h('sav-alert', { variant: 'neutral' }, icon('hourglass', { slot: 'icon' }), tn('waiting_n', s.settings.expected - n)));
    if (memo.editing && options.length < n) warn.push(h('sav-alert', { variant: 'warning' }, icon('triangle-alert', { slot: 'icon' }), t('fewer_slots', { n: options.length, p: n })));
    if (memo.editing && sv().best.out.length && kind !== 'custom') {
      const sw = h('sav-switch', { checked: memo.force || null, help: t('force_t') }, t('force_l'));
      sw.addEventListener('change', () => { memo.force = sw.checked; memo.cur = null; compute(); draw(); });
      warn.push(h('sav-alert', { variant: 'warning', heading: t('out_title', { n: sv().best.out.length }) }, icon('user-x', { slot: 'icon' }), h('p', t('out_t', { names: sv().best.out.map((id) => byP.get(id).name).join(', ') })), sw));
    } else if (memo.editing && memo.force && kind !== 'custom') {
      const sw = h('sav-switch', { checked: true, help: t('force_t') }, t('force_l'));
      sw.addEventListener('change', () => { memo.force = sw.checked; memo.cur = null; compute(); draw(); });
      warn.push(h('sav-alert', { variant: 'neutral' }, icon('triangle-alert', { slot: 'icon' }), sw));
    }
    const actions = isSaved
      ? [btn(t('asg_change'), { icon: 'pencil', size: 'sm', onclick: () => { memo.editing = true; memo.cur = { kind: 'custom', map: new Map(saved) }; draw(); } }), btn(t('asg_undo'), { icon: 'undo-2', size: 'sm', appearance: 'ghost', variant: 'danger', onclick: undo })]
      : [primary(t('confirm_asg'), { icon: 'calendar-check', size: 'sm', disabled: !map.size || s.status === 'suspended' || null, onclick: () => save(map) }),
        kind !== 'best' ? btn(t('asg_reset'), { icon: 'rotate-ccw', size: 'sm', appearance: 'ghost', onclick: () => { memo.cur = { kind: 'best', map: new Map(sv().best.map) }; draw(); } }) : null,
        s.assigned ? btn(t('cancel'), { size: 'sm', appearance: 'ghost', onclick: () => { memo.editing = false; draw(); } }) : null];
    return h('sav-card.asg' + (isSaved ? '.saved' : ''),
      h('div.ahead', h('div.grow', h('h2', title, kind === 'best' ? h('sav-badge', { appearance: 'solid', variant: 'primary', pill: true }, icon('sparkles'), ' ', t('recommended')) : null), kind === 'best' ? h('small.muted', t('sol_why')) : isSaved ? h('small.muted', t('sol_saved_t')) : null)),
      chips, warn, h('div.alist2', rows, outRows.length ? [h('h3.aout', t('without_slot')), outRows] : null), h('div.aact', actions));
  }
  function status(p, o) {
    const [ic, variant, label] = AV[av(p, o)] || AV[0];
    return h('sav-badge', { appearance: 'soft', variant, pill: true }, icon(ic), ' ', t(label));
  }

  // ------------------------------------------------------------------ changes by hand
  /** Puts person pid in slot oid: whoever was there takes the old slot of pid (or stays out). */
  function place(pid, oid) {
    const map = new Map(memo.cur.map), occupant = [...map].find(([, o]) => o === oid)?.[0], before = map.get(pid);
    if (oid == null) map.delete(pid); else map.set(pid, oid);
    if (occupant != null && occupant !== pid) { if (before != null) map.set(occupant, before); else map.delete(occupant); }
    memo.cur = { kind: 'custom', map };
    draw();
  }
  const ranked = (list, score) => [...list].sort((a, b) => score(b) - score(a));
  function personMenu(o) {
    const items = () => {
      const map = memo.cur.map, occupant = [...map].find(([, x]) => x === o.id)?.[0];
      return [{ head: optText(o) }, ...ranked(people, (p) => av(p, o.id)).map((p) => {
        const [ic, , label] = AV[av(p, o.id)] || AV[0], other = map.get(p.id);
        const extra = p.id === occupant ? ' ✓' : other != null && occupant != null ? ' · ' + t('swap_with', { n: byP.get(occupant).name }) : '';
        return [ic, `${p.name} · ${t(label)}${extra}`, () => place(p.id, o.id), { disabled: p.id === occupant }];
      }), occupant != null ? '-' : null, occupant != null ? ['circle-minus', t('leave_free'), () => place(occupant, null)] : null];
    };
    return drop(h('sav-button', { icon: 'arrow-left-right', label: t('change_person'), appearance: 'ghost', size: 'sm', square: true }), items, { placement: 'bottom-end' });
  }
  function slotMenu(p) {
    const items = () => {
      const occupant = new Map([...memo.cur.map].map(([pp, o]) => [o, pp]));
      return [{ head: p.name }, ...ranked(options, (o) => av(p, o.id) * 10 - (occupant.has(o.id) ? 1 : 0)).map((o) => {
        const [ic, , label] = AV[av(p, o.id)] || AV[0], who = occupant.get(o.id);
        return [ic, `${optText(o)} · ${t(label)}${who != null ? ' · ' + t('instead_of', { n: byP.get(who).name }) : ''}`, () => place(p.id, o.id)];
      })];
    };
    return drop(h('sav-button', { icon: 'plus', size: 'sm', appearance: 'outline' }, t('put_in')), items, { placement: 'bottom-end' });
  }

  // ------------------------------------------------------------------ the other solutions
  function altsCard() {
    const list = h('div.altlist');
    const fill = () => {
      if (!memo.alts.length && !sv().done()) memo.alts.push(...sv().more(10));
      const best = sv().best.map;
      put(list, memo.alts.length ? memo.alts.map((a, i) => {
        const on = memo.cur.kind === 'alt' && memo.cur.idx === i;
        return h('div.altrow' + (on ? '.on' : ''), h('div.grow', h('b', t('sol_n', { n: i + 2 })), h('small.muted', [t('placed_n', { a: a.placed, b: people.length }), a.maybe ? tn('maybe_free_n', a.maybe) : t('all_av'), a.forced ? tn('forced_n', a.forced) : '', tn('changes_n', changes(best, a.map))].filter(Boolean).join(' · '))),
          on ? h('sav-badge', { appearance: 'soft', variant: 'primary', pill: true }, t('shown')) : btn(t('see'), { size: 'sm', appearance: 'outline', icon: 'eye', onclick: () => { memo.cur = { kind: 'alt', idx: i, map: new Map(a.map) }; draw(); panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }));
      }) : h('p.muted.small', t('no_other')),
      !sv().done() ? h('div', btn(t('show_more'), { icon: 'plus', size: 'sm', appearance: 'ghost', onclick: () => { const more = sv().more(10); memo.alts.push(...more); fill(); if (!more.length && sv().done()) toast(t('no_more'), 'neutral'); } })) : null);
    };
    const det = h('sav-details.altd', { summary: t('other_sols'), appearance: 'plain' }, h('div.stack', h('p.muted.small', t('other_sols_t')), list));
    // the solutions are looked for when the list is opened the first time (a big schedule takes a moment)
    let built = false;
    det.addEventListener('sav-show', () => { if (!built) { built = true; fill(); } });
    if (memo.alts.length || memo.cur.kind === 'alt') { det.setAttribute('open', ''); built = true; fill(); }
    return h('sav-card.alts', det);
  }

  // ------------------------------------------------------------------ saving
  function save(map) {
    const d = sv().describe(map);
    const withMail = s.responses.some((r) => (r.email || r.account) && map.has(r.id));
    const notify = h('sav-switch', { checked: withMail || null, disabled: !withMail || !S.config.mailReady || null, help: S.config.mailReady ? t('asg_mail_t') : t('mail_off') }, t('asg_mail'));
    dialog({ title: t('confirm_asg'), width: '30rem', body: h('div.form', h('p', t('confirm_asg_t')),
      d.forced ? h('sav-alert', { variant: 'warning' }, icon('triangle-alert', { slot: 'icon' }), tn('asg_forced_warn', d.forced)) : null,
      d.out.length ? h('sav-alert', { variant: 'warning' }, icon('user-x', { slot: 'icon' }), t('asg_out_warn', { names: d.out.map((id) => byP.get(id).name).join(', ') })) : null, notify),
    actions: [{ label: t('cancel') }, { label: t('confirm_asg'), icon: 'calendar-check', primary: true, run: async () => {
      const r = await api('sch.assign', { id: s.id, assign: Object.fromEntries(map), notify: notify.checked });
      memo.editing = false;
      toast(t('asg_done'), 'success');
      onSaved(r.schedule);
    } }] });
  }
  async function undo() {
    if (!(await confirm(t('asg_undo'), t('asg_undo_t'), t('asg_undo')))) return;
    try { const r = await api('sch.assign', { id: s.id, assign: null }); memo.editing = true; memo.cur = null; onSaved(r.schedule); } catch (e) { fail(e); }
  }

  draw();
  return { panel, best: sv().best, current: () => memo.cur.map };
}
