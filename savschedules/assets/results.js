/**
 * The answers, for the owner. A poll: the dates in order of preference, the table of who said what, the choice of the
 * date. A sheet of slots: day by day, who took which place, what is still free. Both can be downloaded and printed.
 */
import { btn, confirm, copyText, dialog, drop, empty, face, fail, h, icon, iconBtn, primary, put, toast } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { S, api } from './store.js';
import { brand, credit, go, userMenu } from './account.js';
import { COLORS, KINDS } from './plan.js';
import { byDay, dayLabel, longDay, span } from './time.js';
import { download, fileName, toCsv, toIcs, toSavsch } from './files.js';
import { publicUrl, shareDialog } from './share.js';

export async function results(root, pid) {
  let s = (await api('sch.get', undefined, { id: pid })).schedule;
  api('sch.seen', { id: pid }).catch(() => {});
  const tz = () => s.settings.tz;
  const slots = () => s.kind === 'slots';
  const page = h('div.home.resp');
  put(root, page);
  const reload = async () => { s = (await api('sch.get', undefined, { id: pid })).schedule; draw(); };
  const score = (o) => o.yes * 2 + o.maybe;
  const optText = (o) => (o.day ? longDay(o.day) : longDay(byDay([o], tz())[0][0]) + ' · ' + span(o, tz(), '')) + (o.label ? ' · ' + o.label : '');

  function csv() {
    const opts = s.options;
    const head = [t('name'), t('email'), t('note_l'), t('answered_at'), ...opts.map((o) => (o.day || byDay([o], tz())[0][0]) + ' ' + span(o, tz(), t('all_day')) + (o.label ? ' ' + o.label : ''))];
    const rows = s.responses.map((r) => [r.name, r.email || '', r.note, r.at ? new Date(r.at).toLocaleString(getLang()) : '', ...opts.map((o) => (r.choices[o.id] === 2 ? (slots() ? 'X' : t('yes')) : r.choices[o.id] === 1 ? t('maybe') : ''))]);
    download(toCsv([head, ...rows]), fileName(s.title, 'csv'));
  }
  async function setFinal(o) {
    if (!o) { s = (await api('sch.final', { id: s.id, option: null })).schedule; draw(); return; }
    const withMail = s.responses.some((r) => r.email || r.account);
    const notify = h('sav-switch', { checked: withMail || null, disabled: !withMail || !S.config.mailReady || null, help: S.config.mailReady ? t('final_mail_t') : t('mail_off') }, t('final_mail'));
    dialog({ title: t('choose_date'), width: '28rem', body: h('div.form', h('sav-card.finpick', h('strong', optText(o)), h('small.muted', t('yes_n', { n: o.yes }) + (o.maybe ? ' · ' + t('maybe_n', { n: o.maybe }) : ''))), h('p.muted', t('choose_date_t')), notify),
      actions: [{ label: t('cancel') }, { label: t('choose'), icon: 'calendar-check', primary: true, run: async () => { s = (await api('sch.final', { id: s.id, option: o.id, notify: notify.checked })).schedule; toast(t('date_set'), 'success'); draw(); } }] });
  }
  async function removeResp(r) {
    if (!(await confirm(t('remove_answer'), t('remove_answer_t', { n: r.name }), t('remove')))) return;
    s = (await api('resp.delete', { id: s.id, response: r.id })).schedule;
    draw();
  }

  function stats() {
    const st = (label, value, ic) => h('sav-card.stat', h('div.sti', icon(ic)), h('div', h('small.muted', label), h('strong', value)));
    if (slots()) {
      const places = s.options.reduce((a, o) => a + o.cap, 0), taken = s.options.reduce((a, o) => a + Math.min(o.yes, o.cap), 0), fullN = s.options.filter((o) => o.yes >= o.cap).length;
      return h('div.stats', st(t('people'), String(s.responses.length), 'users'), st(t('places_taken_l'), `${taken} / ${places}`, 'ticket'), st(t('slots_full'), `${fullN} / ${s.options.length}`, 'lock'), st(t('status'), statusText(), s.closed ? 'lock' : 'circle-check'));
    }
    const best = [...s.options].sort((a, b) => score(b) - score(a))[0];
    return h('div.stats', st(t('people'), String(s.responses.length), 'users'), st(t('dates'), String(s.options.length), 'calendar-days'), st(t('best_date'), best && score(best) ? (best.day ? dayLabel(best.day) : dayLabel(byDay([best], tz())[0][0]) + ' ' + span(best, tz(), '')) : '—', 'sparkles'), st(t('status'), statusText(), s.closed ? 'lock' : 'circle-check'));
  }
  const statusText = () => (s.status === 'suspended' ? t('suspended') : s.final ? t('date_set') : s.closed ? t('closed') : t('open_l'));

  function pollView() {
    const n = s.responses.length || 1, max = Math.max(1, ...s.options.map(score));
    const ranked = [...s.options].sort((a, b) => score(b) - score(a) || (a.day || a.start).localeCompare(b.day || b.start));
    const rank = h('sav-card.rank', h('h2', t('ranking')), ranked.length ? h('ol.ranklist', ranked.map((o, i) => {
      const fin = s.final === o.id;
      return h('li' + (fin ? '.fin' : '') + (i === 0 && score(o) ? '.top' : ''), h('div.rtext', h('b', o.day ? longDay(o.day) : dayLabel(byDay([o], tz())[0][0], { weekday: 'long', day: 'numeric', month: 'long' })), h('small', [o.day ? t('all_day') : span(o, tz(), ''), o.label].filter(Boolean).join(' · '))),
        h('div.rbar', h('span.y', { style: `width:${(o.yes / n) * 100}%` }), h('span.m', { style: `width:${(o.maybe / n) * 100}%` })), h('div.rnum', h('b', String(o.yes)), o.maybe ? h('small', `+${o.maybe}`) : null),
        fin ? btn(t('undo_choice'), { size: 'sm', appearance: 'ghost', icon: 'undo-2', onclick: () => setFinal(null) }) : btn(t('choose'), { size: 'sm', appearance: score(o) === max ? 'solid' : 'outline', variant: score(o) === max ? 'primary' : 'neutral', icon: 'calendar-check', onclick: () => setFinal(o), disabled: s.status === 'suspended' || null }));
    })) : empty('calendar-x', t('no_options'), ''));
    return [rank, tableView()];
  }
  function tableView() {
    if (!s.responses.length) return h('sav-card.tablec', empty('inbox', t('no_answers'), t('no_answers_t'), primary(t('share'), { icon: 'share-2', onclick: () => shareDialog(s) })));
    const opts = [...s.options].sort((a, b) => (a.day || a.start).localeCompare(b.day || b.start));
    const cell = (v) => h('td.c' + (v || 0), v ? icon(v === 2 ? 'check' : 'circle-help') : '');
    return h('sav-card.tablec', h('div.tch', h('h2', t('who_said'))), h('div.tscroll', h('table.grid-t', h('thead', h('tr', h('th', t('name')), opts.map((o) => h('th', { class: s.final === o.id ? 'best' : '' }, h('small', dayLabel(o.day || byDay([o], tz())[0][0], { weekday: 'short', day: 'numeric', month: 'short' })), h('b', span(o, tz(), t('all_day_s'))))), h('th', ''))),
      h('tbody', s.responses.map((r) => h('tr', h('th', face(r.name, null, 26), h('span.pn', h('b', r.name), r.email ? h('small', r.email) : r.account ? h('small', t('with_account')) : null, r.note ? h('small.note', '“' + r.note + '”') : null)), opts.map((o) => cell(r.choices[o.id])),
        h('td.act', drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', size: 'sm', square: true }), [r.email ? ['mail', t('write_email'), () => { location.href = 'mailto:' + r.email + '?subject=' + encodeURIComponent(s.title); }] : null, ['trash', t('remove_answer'), () => removeResp(r), { danger: true }]], { placement: 'bottom-end' }))))),
      h('tfoot', h('tr', h('th', t('total')), opts.map((o) => h('td', String(o.yes), o.maybe ? h('small', ` (+${o.maybe})`) : null)), h('td'))))));
  }
  function slotsView() {
    if (!s.options.length) return h('sav-card', empty('ticket', t('no_slots'), t('no_slots_t'), primary(t('edit'), { href: '#/e/' + s.id })));
    const by = new Map();
    for (const r of s.responses) for (const [k, v] of Object.entries(r.choices)) if (v === 2) { if (!by.has(+k)) by.set(+k, []); by.get(+k).push(r); }
    return byDay(s.options, tz()).map(([k, list]) => h('sav-card.sday', h('h2', h('span.dnum', String(+k.slice(8))), h('span', dayLabel(k, { weekday: 'long', day: 'numeric', month: 'long' })), h('small.muted', t('booked_of', { a: list.reduce((x, o) => x + Math.min(o.yes, o.cap), 0), b: list.reduce((x, o) => x + o.cap, 0) }))),
      h('div.srows', list.map((o) => { const who = by.get(o.id) || []; return h('div.srow' + (who.length >= o.cap ? '.full' : ''), h('div.st', h('b', span(o, tz(), t('all_day'))), o.label ? h('small', o.label) : null, h('small.muted', `${who.length}/${o.cap}`)),
        h('div.sp', who.length ? who.map((r) => h('div.person', face(r.name, null, 28), h('div.grow', h('b', r.name), h('small', [r.email, r.note ? '“' + r.note + '”' : ''].filter(Boolean).join(' · ') || (r.account ? t('with_account') : ''))),
          drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', size: 'sm', square: true }), [r.email ? ['mail', t('write_email'), () => { location.href = 'mailto:' + r.email + '?subject=' + encodeURIComponent(s.title); }] : null, ['trash', t('free_place'), () => removeResp(r), { danger: true }]], { placement: 'bottom-end' }))) : h('span.muted.small', t('free')))); }))));
  }

  function draw() {
    const url = publicUrl(s.id);
    const more = drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'outline', size: 'sm', square: true }), [
      ['external-link', t('open_as_guest'), () => window.open(url, '_blank', 'noopener')], ['link', t('copy_link'), () => copyText(url, t('link_copied'))], '-',
      ['table-properties', t('download_csv'), csv], ['calendar-plus', t('download_ics'), () => { const list = slots() ? s.options.filter((o) => o.yes) : s.final ? s.options.filter((o) => o.id === s.final) : s.options; download(toIcs(list.map((o) => ({ option: o, title: s.title, descr: s.descr, place: s.place, url, uid: s.id }))), fileName(s.title, 'ics')); }],
      ['download', t('download_savsch'), async () => download(await toSavsch(s), fileName(s.title, 'savsch'))], ['download', t('download_savsch_all'), async () => download(await toSavsch(s, true), fileName(s.title, 'savsch'))], ['printer', t('print'), () => print()], '-',
      [s.status === 'open' ? 'lock' : 'lock-open', t(s.status === 'open' ? 'close_sch' : 'reopen'), async () => { s = (await api('sch.status', { id: s.id, open: s.status !== 'open' })).schedule; draw(); }, { disabled: s.status === 'suspended' }],
      ['copy-plus', t('duplicate'), async () => { const r = await api('sch.duplicate', { id: s.id, title: t('copy_of', { t: s.title }) }); go('#/e/' + r.id); }],
      ['trash', t('to_trash'), async () => { await api('sch.trash', { id: s.id }); toast(t('trashed'), 'neutral'); go('#/'); }, { danger: true }]], { placement: 'bottom-end' });
    page.style.setProperty('--c', COLORS[s.settings.color] || COLORS.blue);
    put(page, h('header.htop', brand(), h('div.spacer'), userMenu()),
      h('main.rmain', h('div.rhead', btn(t('home'), { icon: 'arrow-left', appearance: 'ghost', size: 'sm', onclick: () => go('#/') }), h('span.spacer'), iconBtn('rotate-ccw', t('refresh'), reload), btn(t('edit'), { icon: 'pencil', size: 'sm', onclick: () => go('#/e/' + s.id) }), primary(t('share'), { icon: 'share-2', size: 'sm', onclick: () => shareDialog(s) }), more),
        h('div.rtitle', h('span.rk', icon(KINDS[s.kind].icon), t('k_' + s.kind)), h('h1', s.title), h('p.muted', [s.place, s.settings.deadline ? t('answers_until', { d: new Date(s.settings.deadline).toLocaleString(getLang(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }) : '', t('updated_w', { w: when(s.updated) })].filter(Boolean).join(' · '))),
        s.status === 'suspended' ? h('sav-alert', { variant: 'danger' }, t('sch_suspended_t')) : null,
        stats(), h('div.rbody' + (slots() ? '.slots' : ''), slots() ? [slotsView(), s.responses.length ? null : h('sav-card.tablec', empty('inbox', t('no_answers'), t('no_answers_t'), primary(t('share'), { icon: 'share-2', onclick: () => shareDialog(s) })))] : pollView())),
      credit());
    document.title = s.title + ' · SavSchedules';
  }
  draw();
  // new answers arrive while the page is open
  const tick = setInterval(() => { if (document.visibilityState === 'visible' && !document.querySelector('sav-dialog')) api('sch.get', undefined, { id: pid }).then((r) => { if (JSON.stringify(r.schedule.responses) !== JSON.stringify(s.responses)) { s = r.schedule; draw(); api('sch.seen', { id: pid }).catch(() => {}); } }).catch(() => {}); }, 20000);
  return () => clearInterval(tick);
}
