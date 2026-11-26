/**
 * The page of a schedule for the people who answer: no account needed (unless the owner asks for one). A poll asks yes,
 * if need be or no for each date; a sheet of slots lets each person take free places. The answer can be changed or
 * withdrawn later from the same browser, or from the private link (also sent by email).
 */
import { btn, confirm, copyText, dialog, empty, errText, face, fail, h, icon, primary, put, toast } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { S, api, guest, keys } from './store.js';
import { brand, credit, langButton, userMenu } from './account.js';
import { COLORS } from './plan.js';
import { byDay, dayLabel, LOCAL_TZ, longDay, span, zoneName } from './time.js';
import { download, fileName, toIcs } from './files.js';
import { publicUrl } from './share.js';

const keyFromUrl = (pid, k) => { if (/^[a-f0-9]{48}$/.test(k || '')) { keys.set(pid, k); history.replaceState(null, '', '#/s/' + pid); } return keys.get(pid); };

export async function answerPage(root, pid, urlKey) {
  let key = keyFromUrl(pid, urlKey), s, me = null, choices = {}, editing = true, busy = false, poll = 0;
  const tz = LOCAL_TZ;
  const load = async () => { const d = await api('pub.get', undefined, { id: pid, key }); s = d.schedule; me = d.me; };
  put(root, h('div.wait', h('sav-spinner', { style: 'font-size:2rem' })));
  try { await load(); } catch (e) {
    put(root, h('div.pub', header(), h('main.pmain', h('div.wait', empty(e.code === 'suspended' ? 'shield' : 'calendar-x', t(e.code === 'suspended' ? 'sch_suspended' : 'sch_missing'), t(e.code === 'suspended' ? 'sch_suspended_t' : 'sch_missing_t'), primary(t('make_own'), { href: '#/welcome' })))), credit()));
    return () => {};
  }
  const mineResp = () => (s.responses || []).find((r) => r.mine);
  const resetChoices = () => { const m = mineResp(); choices = m ? Object.fromEntries(Object.entries(m.choices).map(([k, v]) => [k, v])) : {}; editing = !m; };
  resetChoices();
  const slots = () => s.kind === 'slots';
  const color = () => COLORS[s.settings.color] || COLORS.blue;
  const canAnswer = () => !s.closed && (s.settings.access === 'open' || me);

  const page = h('div.pub'), main = h('main.pmain');
  put(root, page);
  function header() {
    return h('header.phead', brand(S.user ? '#/' : '#/welcome'), h('span.spacer'), langButton(), S.user ? userMenu() : btn(t('sign_in'), { size: 'sm', appearance: 'ghost', icon: 'log-in', href: '#/signin', onclick: () => sessionStorage.setItem('savschedules-next', '#/s/' + pid) }));
  }

  // ------------------------------------------------------------------ pieces
  function hero() {
    const st = s.settings, chips = [];
    if (s.place) chips.push(h('span.pchip', icon('map-pin'), s.place));
    if (st.deadline && !s.closed) chips.push(h('span.pchip', icon('hourglass'), t('answers_until', { d: new Date(st.deadline).toLocaleString(getLang(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })));
    if (slots()) chips.push(h('span.pchip', icon('ticket'), st.maxPer === 1 ? t('pick_one') : st.maxPer ? t('pick_up_to', { n: st.maxPer }) : t('pick_any')));
    else chips.push(h('span.pchip', icon('vote'), st.maybe ? t('vote_hint_maybe') : t('vote_hint')));
    chips.push(h('span.pchip', icon('globe'), t('times_in', { z: zoneName(tz) })));
    if (st.access === 'account') chips.push(h('span.pchip', icon('lock'), t('signed_in_only')));
    return h('section.phero', h('div.pband'), h('div.ptext', h('span.kicker', t(slots() ? 'invite_slots' : 'invite_poll', { n: s.owner })), h('h1', s.title), s.descr ? h('p.pdescr', s.descr) : null, h('div.pchips', chips)));
  }
  function finalBox() {
    const o = s.options.find((x) => x.id === s.final);
    if (!o) return null;
    return h('sav-card.final', h('div.fin', h('div.ficon', icon('calendar-check')), h('div.grow', h('small', t('date_is_set')), h('strong', o.day ? longDay(o.day) : longDay(byDay([o], tz)[0][0]) + ' · ' + span(o, tz, '')), o.label ? h('span.muted', o.label) : null),
      btn(t('add_calendar'), { icon: 'calendar-plus', size: 'sm', onclick: () => download(toIcs([{ option: o, title: s.title, descr: s.descr, place: s.place, url: publicUrl(s.id), uid: s.id }]), fileName(s.title, 'ics')) })));
  }
  function notices() {
    const out = [];
    if (s.status === 'suspended') out.push(h('sav-alert', { variant: 'danger' }, icon('shield', { slot: 'icon' }), t('sch_suspended_t')));
    else if (s.closed && !s.final) out.push(h('sav-alert', { variant: 'neutral' }, icon('lock', { slot: 'icon' }), t('closed_t')));
    if (!s.closed && s.settings.access === 'account' && !me) out.push(h('sav-alert', { variant: 'primary', heading: t('signin_to_answer') }, icon('log-in', { slot: 'icon' }), t('signin_to_answer_t'), h('div.prow', { style: 'margin-top:.6rem' }, primary(t('sign_in'), { size: 'sm', href: '#/signin', onclick: () => sessionStorage.setItem('savschedules-next', '#/s/' + pid) }), btn(t('sign_up'), { size: 'sm', href: '#/signup', onclick: () => sessionStorage.setItem('savschedules-next', '#/s/' + pid) }))));
    if (s.settings.hidden && !s.isOwner) out.push(h('p.muted.small.hiddenn', icon('eye-off'), ' ', t(slots() ? 'hidden_note_slots' : 'hidden_note')));
    if (s.isOwner) out.push(h('sav-alert', { variant: 'neutral' }, icon('info', { slot: 'icon' }), t('owner_view'), h('div.prow', { style: 'margin-top:.5rem' }, btn(t('see_answers'), { size: 'sm', href: '#/r/' + s.id }), btn(t('edit'), { size: 'sm', href: '#/e/' + s.id }))));
    return out;
  }
  /** The answer already given, with what can be done with it. */
  function mineBox() {
    const m = mineResp();
    if (!m || editing) return null;
    const chosen = s.options.filter((o) => m.choices[o.id]);
    const yes = chosen.filter((o) => m.choices[o.id] === 2);
    const link = key ? publicUrl(s.id).replace('#/s/' + s.id, '#/s/' + s.id + '/' + key) : '';
    return h('sav-card.mine', h('div.mhead', icon('circle-check'), h('div.grow', h('strong', t('your_answer')), h('small.muted', t('saved_as', { n: m.name, w: when(m.at) })))),
      h('ul.mlist', chosen.length ? chosen.map((o) => h('li', h('span.mv.v' + m.choices[o.id], icon(m.choices[o.id] === 2 ? 'check' : 'circle-help')), h('b', (o.day ? longDay(o.day) : dayLabel(byDay([o], tz)[0][0], { weekday: 'long', day: 'numeric', month: 'long' })) + (o.day ? '' : ' · ' + span(o, tz, ''))), o.label ? h('span.muted', ' · ' + o.label) : null)) : h('li.muted', t('nothing_yet'))),
      m.note ? h('p.mnote', '“' + m.note + '”') : null,
      h('div.prow.wrap', !s.closed ? primary(t('change_answer'), { icon: 'pencil', size: 'sm', onclick: () => { editing = true; draw(); } }) : null,
        yes.length ? btn(t('add_calendar'), { icon: 'calendar-plus', size: 'sm', onclick: () => download(toIcs(yes.map((o) => ({ option: o, title: s.title, descr: s.descr, place: s.place, url: publicUrl(s.id), uid: m.id }))), fileName(s.title, 'ics')) }) : null,
        link ? btn(t('private_link'), { icon: 'link', size: 'sm', onclick: () => privateLink(link) }) : null,
        !s.closed ? btn(t('withdraw'), { icon: 'undo-2', size: 'sm', variant: 'danger', appearance: 'ghost', onclick: withdraw }) : null));
  }
  function privateLink(link) {
    dialog({ title: t('private_link'), width: '30rem', body: h('div.form', h('p', t('private_link_t')), h('div.linkrow', h('code', link), btn(t('copy'), { icon: 'copy', size: 'sm', onclick: () => copyText(link) })), h('sav-alert', { variant: 'warning' }, t('private_link_warn'))), actions: [{ label: t('done'), primary: true }] });
  }
  async function withdraw() {
    if (!(await confirm(t('withdraw'), t(slots() ? 'withdraw_slots_t' : 'withdraw_t'), t('withdraw')))) return;
    try { const r = await api('pub.withdraw', { id: s.id, key }); s = r.schedule; keys.set(pid, ''); key = ''; resetChoices(); toast(t('withdrawn'), 'neutral'); draw(); } catch (e) { fail(e); }
  }

  // ------------------------------------------------------------------ choosing
  const yesCount = () => Object.values(choices).filter((v) => v === 2).length;
  function pickSlot(o) {
    if (!editing || !canAnswer()) return;
    const max = s.settings.maxPer;
    if (choices[o.id]) delete choices[o.id];
    else {
      if (max === 1) choices = {};
      else if (max && yesCount() >= max) return toast(t('max_reached', { n: max }), 'warning');
      choices[o.id] = 2;
    }
    drawOptions();
    drawForm();
  }
  function slotTile(o) {
    const mine = mineResp(), heldByMe = mine && mine.choices[o.id] === 2;
    const others = (o.yes || 0) - (heldByMe ? 1 : 0), left = o.cap - others, on = choices[o.id] === 2, full = left <= 0 && !on;
    const names = (s.responses || []).filter((r) => r.choices[o.id] === 2 && !r.mine).map((r) => r.name);
    const state = on ? 'on' : full ? 'full' : 'free';
    const sub = on ? (heldByMe && !editing ? t('yours') : t('selected')) : full ? (names.length ? names.join(', ') : t('taken')) : o.cap > 1 ? t('left_n', { n: left, c: o.cap }) : t('free');
    return h('button.stile.' + state, { type: 'button', disabled: (full || !editing || !canAnswer()) && !on ? true : null, 'aria-pressed': String(on), onclick: () => pickSlot(o) },
      h('span.sic', icon(on ? 'check' : full ? 'lock' : 'plus')), h('span.stx', h('b', span(o, tz, t('all_day'))), o.label ? h('small.slab', o.label) : null, h('small', sub)),
      o.cap > 1 ? h('span.sbar', { style: `--p:${Math.min(100, ((others + (on ? 1 : 0)) / o.cap) * 100)}%` }) : null);
  }
  function voteRow(o) {
    const v = choices[o.id] || 0, set = (x) => { if (!editing || !canAnswer()) return; if (x) choices[o.id] = x; else delete choices[o.id]; drawOptions(); drawForm(); };
    const who = (s.responses || []).filter((r) => !r.mine && r.choices[o.id]);
    const total = (s.responses || []).filter((r) => !r.mine).length || 1;
    const showNums = !(s.settings.hidden && !s.isOwner);
    const opt = (x, ic, label) => h('button.vb.v' + x + (v === x ? '.on' : ''), { type: 'button', 'aria-pressed': String(v === x), title: label, disabled: !editing || !canAnswer() || null, onclick: () => set(v === x ? 0 : x) }, icon(ic), h('span', label));
    return h('div.vrow' + (s.final === o.id ? '.final' : ''), h('div.vtime', h('b', span(o, tz, t('all_day'))), o.label ? h('small', o.label) : null),
      showNums ? h('div.vbar', { title: t('yes_n', { n: o.yes }) + (o.maybe ? ' · ' + t('maybe_n', { n: o.maybe }) : '') }, h('span.y', { style: `width:${((o.yes - (mineResp()?.choices[o.id] === 2 ? 1 : 0)) / total) * 100}%` }), h('span.m', { style: `width:${((o.maybe - (mineResp()?.choices[o.id] === 1 ? 1 : 0)) / total) * 100}%` }), h('small', String(who.filter((r) => r.choices[o.id] === 2).length))) : h('span'),
      h('div.vbtns', { role: 'group', 'aria-label': span(o, tz, t('all_day')) }, opt(2, 'check', t('yes')), s.settings.maybe ? opt(1, 'circle-help', t('maybe')) : null, opt(-1, 'x', t('no'))));
  }
  const optionsBox = h('div.popts'), formBox = h('div.pform');
  function drawOptions() {
    const groups = byDay(s.options, tz);
    if (!groups.length) return put(optionsBox, empty('calendar-x', t('no_options'), t('no_options_t')));
    put(optionsBox, h('h2.psec', t(slots() ? 'choose_slots' : 'choose_dates')), groups.map(([k, list]) => h('section.pday', h('h3', h('span.dnum', String(+k.slice(8))), h('span', dayLabel(k, { weekday: 'long' }), h('small', dayLabel(k, { month: 'long', year: 'numeric' })))),
      slots() ? h('div.sgrid2', list.map(slotTile)) : h('div.vlist', list.map(voteRow)))));
  }
  /** The answers of the others (a poll whose answers are not hidden): one row per person, as on paper. */
  function table() {
    if (slots() || s.settings.hidden && !s.isOwner) return null;
    const people = (s.responses || []).filter((r) => !r.mine);
    if (!people.length) return null;
    const opts = [...s.options].sort((a, b) => (a.day || a.start) < (b.day || b.start) ? -1 : 1);
    const best = Math.max(...opts.map((o) => o.yes * 2 + o.maybe));
    const cell = (v) => h('td.c' + (v || 0), v ? icon(v === 2 ? 'check' : 'circle-help') : '');
    return h('section.ptable', h('h2.psec', t('answers_so_far', { n: people.length })), h('div.tscroll', h('table.grid-t', h('thead', h('tr', h('th', ''), opts.map((o) => h('th', { class: o.yes * 2 + o.maybe === best && best > 0 ? 'best' : '' }, h('small', dayLabel(o.day || byDay([o], tz)[0][0], { weekday: 'short', day: 'numeric', month: 'short' })), h('b', span(o, tz, t('all_day_s'))))))),
      h('tbody', people.map((r) => h('tr', h('th', face(r.name, null, 24), h('span', r.name)), opts.map((o) => cell(r.choices[o.id]))))),
      h('tfoot', h('tr', h('th', t('total')), opts.map((o) => h('td', { class: o.yes * 2 + o.maybe === best && best > 0 ? 'best' : '' }, String(o.yes), o.maybe ? h('small', ` (+${o.maybe})`) : null)))))));
  }

  // ------------------------------------------------------------------ name and sending
  const g = guest.get();
  const nameI = h('sav-input', { label: t('your_name'), maxlength: 80, autocomplete: 'name', required: true });
  const emailI = h('sav-input', { label: t(s.settings.askEmail === 'required' ? 'your_email_req' : 'your_email'), type: 'email', maxlength: 190, autocomplete: 'email', help: t('email_why') });
  const noteI = h('sav-input', { label: t('note_l'), maxlength: 500, placeholder: t('note_ph') });
  const fill = () => { const m = s.mine; nameI.value = m?.name || (me ? me.name : g.name || ''); emailI.value = m?.email || g.email || ''; noteI.value = m?.note || ''; };
  fill();
  function drawForm() {
    if (!editing || !canAnswer() || !s.options.length) return put(formBox);
    const n = Object.keys(choices).length, mine = mineResp();
    const summary = slots() ? (n ? t('n_selected', { n }) : t('select_slot')) : n ? t('n_answered', { n, m: s.options.length }) : t('answer_each');
    const send = primary(mine ? t('save_changes') : slots() ? t('book') : t('send_answer'), { icon: slots() ? 'ticket' : 'send', disabled: !n || null, onclick: submit });
    put(formBox, h('sav-card.sendc', h('div.sendgrid', me ? h('div.asme', face(me.name, null, 34), h('div', h('small.muted', t('answering_as')), h('b', me.name))) : nameI, !me && s.settings.askEmail !== 'no' ? emailI : null, s.settings.note ? noteI : null),
      h('div.sendbar', h('span.muted.small', summary), h('span.spacer'), mine ? btn(t('cancel'), { size: 'md', onclick: () => { resetChoices(); draw(); } }) : null, send)));
  }
  async function submit() {
    if (busy) return;
    busy = true;
    try {
      const name = me ? me.name : nameI.value.trim();
      if (!name) { nameI.focus?.(); throw Object.assign(new Error(), { code: 'name_required' }); }
      const body = { id: s.id, key, name, email: me ? '' : emailI.value.trim(), note: noteI.value.trim(), lang: getLang(), choices: Object.fromEntries(Object.entries(choices).filter(([, v]) => v > 0)) };
      if (!Object.keys(body.choices).length && !slots()) throw Object.assign(new Error(), { code: 'need_yes' });
      const r = await api('pub.answer', body);
      if (r.key) { key = r.key; keys.set(pid, key); }
      if (!me) guest.set({ name, email: body.email });
      s = r.schedule;
      resetChoices();
      draw();
      scrollTo({ top: 0, behavior: 'smooth' });
      toast(t(slots() ? 'booked' : 'answer_saved'), 'success');
    } catch (e) {
      if (e.code === 'slot_taken' && e.data?.schedule) {
        s = e.data.schedule;
        for (const id of e.data.taken || []) delete choices[id];
        draw();
        toast(t('err_slot_taken'), 'warning', { duration: 6000 });
      } else fail(e);
    } finally { busy = false; }
  }

  function draw() {
    page.style.setProperty('--c', color());
    put(page, header(), h('main.pmain', hero(), finalBox(), notices(), mineBox(), optionsBox, formBox, table(), h('p.preport', h('button.linkish', { type: 'button', onclick: report }, icon('flag'), ' ', t('report')))), credit());
    drawOptions();
    drawForm();
    document.title = s.title + ' – SavSchedules';
  }
  function report() {
    const reason = h('sav-radio-group', { label: t('report_why'), value: 'spam' }, ['spam', 'scam', 'offensive', 'other'].map((k) => h('sav-radio', { value: k }, t('rep_' + k))));
    const note = h('sav-textarea', { label: t('report_note'), maxlength: 1000, rows: 3 });
    dialog({ title: t('report'), width: '28rem', body: h('div.form', reason, note), actions: [{ label: t('cancel') }, { label: t('send'), primary: true, run: async () => { await api('report.add', { id: s.id, reason: reason.value, note: note.value }); toast(t('report_sent'), 'success'); } }] });
  }
  draw();
  // the places of a sheet change while it is open: they are read again every few seconds (not while sending)
  const tick = async () => { if (document.visibilityState !== 'visible' || busy) return; try { const before = JSON.stringify(s.options); await load(); if (JSON.stringify(s.options) !== before) { if (!editing) resetChoices(); drawOptions(); const t2 = table(); page.querySelector('.ptable')?.replaceWith(t2 || ''); } } catch { /* later */ } };
  poll = setInterval(tick, slots() ? 12000 : 30000);
  return () => clearInterval(poll);
}
