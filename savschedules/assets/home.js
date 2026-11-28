/** Home: own schedules, the ones answered with this account, ready-made starts, trash. As in SavDocuments and SavPresentations. */
import { btn, confirm, copyText, dialog, drop, empty, fail, h, icon, iconBtn, item, primary, put, tile, toast, ask } from './ui.js';
import { t, when, getLang } from './i18n.js';
import { S, api } from './store.js';
import { brand, commands, credit, go, prefs, setPrefs, userMenu } from './account.js';
import { COLORS, KINDS, PRESETS } from './plan.js';
import { download, fileName, readSavsch, toSavsch } from './files.js';

import { publicUrl } from './share.js';

/** A .savsch from the device becomes a new schedule (without its answers). */
export async function importFile(file) {
  try {
    const d = await readSavsch(file);
    const r = await api('sch.create', d);
    toast(t('imported'), 'success');
    go('#/e/' + r.schedule.id);
  } catch (e) { fail(e); }
}
export function pickFile() {
  const i = h('input', { type: 'file', accept: '.savsch,application/json', hidden: true });
  i.addEventListener('change', () => { if (i.files[0]) importFile(i.files[0]); i.remove(); });
  document.body.append(i);
  i.click();
}

/** New: a name, then a poll, a sheet of slots, an assignment or one of the templates; "Create". As in SavDocuments and SavPresentations. */
export function newDialog(start = 'poll') {
  let chosen = start;
  const kindOf = (k) => (PRESETS[k] ? PRESETS[k].kind : k);
  const name = h('sav-input', { label: t('sch_name'), placeholder: t('untitled_' + kindOf(chosen)), maxlength: 160, autofocus: true });
  const cards = {};
  const mark = () => { Object.entries(cards).forEach(([k, c]) => c.classList.toggle('on', k === chosen)); name.placeholder = PRESETS[chosen] ? t('p_' + chosen) : t('untitled_' + chosen); };
  const pick = (k) => () => { chosen = k; mark(); };
  const big = (k) => (cards[k] = tile(t('k_' + k), pick(k), { class: 'kindt k-' + k }, h('div.kpic', icon(KINDS[k].icon)), h('div.ktext', h('strong', t('k_' + k)), h('span.muted', t('k_' + k + '_t')))));
  const pre = (k) => (cards[k] = tile(t('p_' + k), pick(k), { class: 'pret' }, icon(PRESETS[k].icon), h('div', h('strong', t('p_' + k)), h('small.muted', t('k_' + PRESETS[k].kind)))));
  const run = () => { S.newTitle = name.value.trim(); go('#/new/' + chosen); };
  const body = h('div.form', name, h('div.kinds', big('poll'), big('slots'), big('assign')), h('sav-label', { appearance: 'plain', case: 'normal', variant: 'neutral' }, t('ready_made')), h('div.presets', Object.keys(PRESETS).map(pre)),
    h('div', btn(t('open_file'), { icon: 'file-up', size: 'sm', appearance: 'ghost', onclick: () => { d.hide(); pickFile(); } })));
  mark();
  const d = dialog({ title: t('new_schedule'), width: '44rem', body, actions: [{ label: t('cancel') }, { label: t('create'), icon: 'plus', primary: true, run }] });
  body.addEventListener('dblclick', (e) => { if (e.target.closest('.kindt, .pret')) d.primary?.click(); });
}

const shortDate = (iso) => new Date(iso).toLocaleDateString(getLang(), { day: 'numeric', month: 'short' });
function thumb(s) {
  const c = COLORS[s.color] || COLORS.blue, first = s.first ? new Date(s.first) : null;
  const tear = h('div.tear', h('b', first ? first.toLocaleDateString(getLang(), { month: 'short' }) : '—'), h('span', first ? String(first.getDate()) : '?'));
  let stat;
  if (s.kind === 'slots' && s.places) stat = h('div.tstat', h('strong', `${s.taken}/${s.places}`), h('small', t('places_taken')), h('sav-progress-bar', { value: Math.round((s.taken / s.places) * 100), style: `--height:6px;--sav-color-primary:${c}`, 'aria-label': t('places_taken') }));
  else if (s.kind === 'assign' && s.expected) stat = h('div.tstat', h('strong', `${s.answers}/${s.expected}`), h('small', t('answers_n')), h('sav-progress-bar', { value: Math.min(100, Math.round((s.answers / s.expected) * 100)), style: `--height:6px;--sav-color-primary:${c}`, 'aria-label': t('answers_n') }));
  else stat = h('div.tstat', h('strong', String(s.answers ?? 0)), h('small', t(s.answers === 1 ? 'answer_1' : 'answers_n')));
  return h('div.cthumb', { style: `--c:${c}` }, tear, stat, h('span.ckind', icon(KINDS[s.kind].icon)));
}

export async function home(root, view = '') {
  let list = [], answered = [], term = '';
  const mode = () => prefs().view || 'grid';
  const main = h('main.hmain'), side = h('nav.hside', { 'aria-label': t('home') });
  const q = h('sav-input', { type: 'search', placeholder: t('search_sch'), 'aria-label': t('search'), clearable: true, pill: true }, icon('search', { slot: 'prefix' }));
  q.addEventListener('input', () => { term = q.value.trim().toLowerCase(); draw(); });
  q.addEventListener('sav-clear', () => { term = ''; draw(); });
  put(root, h('div.home', h('header.htop', brand(), h('div.hsearch', q), h('div.spacer'), userMenu()), h('div.hbody', side, main), credit()));
  put(main, h('div.wait', h('sav-spinner', { style: 'font-size:2rem' })));
  const load = async () => { const d = await api('sch.list'); list = d.schedules; answered = d.answered; };
  const reload = async () => { await load(); draw(); };
  await load();

  const V = {
    '': ['all_sch', 'layout-grid', () => list.filter((s) => !s.deleted)],
    polls: ['polls', 'vote', () => list.filter((s) => !s.deleted && s.kind === 'poll')],
    slots: ['slot_sheets', 'ticket', () => list.filter((s) => !s.deleted && s.kind === 'slots')],
    assign: ['assign_sheets', 'shuffle', () => list.filter((s) => !s.deleted && s.kind === 'assign')],
    starred: ['starred', 'star', () => list.filter((s) => !s.deleted && s.starred)],
    answered: ['answered', 'user-check', () => answered],
    trash: ['trash', 'trash', () => list.filter((s) => s.deleted)],
  };
  if (!V[view]) view = '';
  // phones and tablets: the views (then the folders) in the bar at the bottom of SavOffice, the ones that do not fit under "More"
  // (an action sheet); the menu on the side is left out
  const bnav = window.SavOffice?.bottomNav?.({ label: t('home'), current: view,
    items: [...Object.keys(V).map((v) => ({ value: v, icon: V[v][1], label: t(V[v][0]), href: '#/' + v }))] });
  if (bnav) root.firstElementChild?.append(bnav);

  function drawSide() {
    const count = { starred: V.starred[2]().length, answered: answered.length, trash: V.trash[2]().length };
    const it = (v) => { const x = item(v, V[v][1], t(V[v][0])); x.toggleAttribute('current', view === v); if (count[v]) x.append(h('sav-badge', { slot: 'suffix', appearance: 'soft', variant: 'neutral', pill: true }, String(count[v]))); return x; };
    const menu = h('sav-menu', { label: t('home'), selectable: true }, it(''), it('polls'), it('slots'), it('assign'), it('starred'), it('answered'), it('trash'));
    menu.addEventListener('sav-select', (e) => go('#/' + e.detail.value));
    const open = list.filter((s) => !s.deleted && !s.closed).length, fresh = list.reduce((a, s) => a + (s.deleted ? 0 : s.fresh), 0);
    put(side, primary(t('new_l'), { icon: 'plus', size: 'lg', block: true, class: 'newbtn', onclick: () => newDialog() }), menu,
      h('div.sidebox', h('div', h('strong', String(open)), h('small.muted', t('open_now'))), h('div', h('strong', String(fresh)), h('small.muted', t('new_answers')))));
  }

  function menuOf(s) {
    const url = publicUrl(s.id);
    if (s.deleted) return [['rotate-cw', t('restore'), async () => { await api('sch.restore', { id: s.id }); reload(); }], ['trash', t('delete_forever'), async () => { if (await confirm(t('delete_forever'), t('delete_forever_t'), t('delete'))) { await api('sch.delete', { id: s.id }); reload(); } }, { danger: true }]];
    return [['chart-column', t('see_answers'), () => go('#/r/' + s.id)], ['pencil', t('edit'), () => go('#/e/' + s.id)], ['external-link', t('open_as_guest'), () => window.open(url, '_blank', 'noopener')], ['link', t('copy_link'), () => copyText(url, t('link_copied'))], '-',
      ['copy', t('duplicate'), async () => { const n = await ask(t('duplicate'), t('title_l'), t('copy_of', { t: s.title }), t('create')); if (n) { const r = await api('sch.duplicate', { id: s.id, title: n }); go('#/e/' + r.id); } }],
      [s.closed ? 'lock-open' : 'lock', t(s.status === 'open' ? 'close_sch' : 'reopen'), async () => { await api('sch.status', { id: s.id, open: s.status !== 'open' }); reload(); }],
      ['download', t('download_savsch'), async () => { const x = (await api('sch.get', undefined, { id: s.id })).schedule; download(await toSavsch(x), fileName(x.title, 'savsch')); }], '-',
      ['trash', t('to_trash'), async () => { await api('sch.trash', { id: s.id }); toast(t('trashed'), 'neutral'); reload(); }, { danger: true }]];
  }
  function badges(s) {
    const b = [];
    if (s.fresh && !s.deleted) b.push(h('sav-badge', { variant: 'primary', pill: true }, t('n_new', { n: s.fresh })));
    if (s.final) b.push(h('sav-badge', { variant: 'success', appearance: 'soft', pill: true }, icon('calendar-check'), ' ', t(s.kind === 'assign' ? 'asg_done' : 'date_set')));
    else if (s.status === 'suspended') b.push(h('sav-badge', { variant: 'danger', appearance: 'soft', pill: true }, t('suspended')));
    else if (s.closed) b.push(h('sav-badge', { variant: 'neutral', appearance: 'soft', pill: true }, icon('lock'), ' ', t('closed')));
    return b.length ? h('div.cbadges', b) : null;
  }
  function card(s, own = true) {
    const meta = own ? [t('k_' + s.kind), s.deadline && !s.closed ? t('until', { d: shortDate(s.deadline) }) : s.lastAnswer ? t('last_answer', { w: when(s.lastAnswer) }) : t('created_w', { w: when(s.created) })].join(' · ') : t('by_owner', { n: s.owner }) + ' · ' + when(s.at);
    // the click stops at the menu, not at its button: the menu listens inside itself, after the button, and the card must not open
    const more = own ? drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', size: 'sm', square: true }), menuOf(s), { placement: 'bottom-end' }) : null;
    more?.addEventListener('click', (e) => e.stopPropagation());
    // the favourite button of SavComponents, as in SavDocuments and SavPresentations: the star fills when it is on
    const star = own && !s.deleted ? h('sav-favourite-button.starb', { icon: 'star', appearance: 'ghost', size: 'sm', label: t('starred'), pressed: !!s.starred, class: s.starred ? 'on' : '', onclick: (e) => e.stopPropagation(), onkeydown: (e) => e.stopPropagation() }) : null;
    star?.addEventListener('change', async (e) => { const on = !!e.detail?.pressed; star.classList.toggle('on', on); try { await api('sch.star', { id: s.id, on }); } catch (x) { fail(x); } setTimeout(reload, 300); });
    const open = () => go(own ? (s.deleted ? '#/trash' : '#/r/' + s.id) : '#/s/' + s.id);
    return tile(s.title, open, { class: 'card' + (s.deleted ? ' away' : '') }, own ? thumb(s) : h('div.cthumb.guest', { style: `--c:${COLORS[s.color] || COLORS.blue}` }, icon(KINDS[s.kind].icon), h('span', t('you_answered'))), badges(s), h('div.cinfo', h('div', h('b', s.title), h('small', meta)), star, more));
  }

  function quick() {
    const tl = (k, ic, label, sub) => tile(label, () => go('#/new/' + k), { class: 'qt' }, h('div.qpic', icon(ic)), h('div', h('strong', label), h('small.muted', sub)));
    return h('sav-card.quick', h('div.qhead', h('h2', t('start_new')), btn(t('all_templates'), { size: 'sm', appearance: 'ghost', 'icon-end': 'arrow-right', onclick: () => newDialog() })),
      h('div.qrow', tl('poll', 'vote', t('k_poll'), t('k_poll_s')), tl('slots', 'ticket', t('k_slots'), t('k_slots_s')), tl('assign', 'shuffle', t('k_assign'), t('k_assign_s')), Object.keys(PRESETS).slice(0, 3).map((k) => tl(k, PRESETS[k].icon, t('p_' + k), t('k_' + PRESETS[k].kind)))));
  }

  function draw() {
    drawSide();
    let shown = V[view][2]();
    if (term) shown = shown.filter((s) => (s.title + ' ' + (s.place || '') + ' ' + (s.owner || '')).toLowerCase().includes(term));
    const sort = prefs().sort || 'updated';
    if (view !== 'answered') shown = [...shown].sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title) : sort === 'date' ? String(a.first || '9').localeCompare(String(b.first || '9')) : b.updated.localeCompare(a.updated)));
    const sorter = drop(h('sav-button', { caret: true, appearance: 'ghost', variant: 'neutral', size: 'sm' }, t('sort_' + sort)), ['updated', 'date', 'title'].map((k) => ['', t('sort_' + k), () => setPrefs({ sort: k }).then(draw).catch(fail), { check: sort === k }]), { placement: 'bottom-end' });
    const viewBtn = iconBtn(mode() === 'grid' ? 'list' : 'layout-grid', t(mode() === 'grid' ? 'as_list' : 'as_grid'), () => setPrefs({ view: mode() === 'grid' ? 'list' : 'grid' }).then(draw));
    const head = h('div.hhead', h('h1', term ? t('results_for', { q: term }) : t(V[view][0])), h('div.spacer'), view === 'trash' && shown.length ? btn(t('empty_trash'), { size: 'sm', variant: 'danger', appearance: 'outline', onclick: async () => { if (await confirm(t('empty_trash'), t('delete_forever_t'), t('delete'))) { await api('sch.empty_trash', {}); reload(); } } }) : null, view !== 'answered' ? sorter : null, viewBtn, view === 'trash' ? null : btn(t('open_file'), { size: 'sm', icon: 'file-up', appearance: 'outline', variant: 'neutral', onclick: pickFile }));
    const grid = h('div.' + (mode() === 'grid' ? 'grid' : 'rows'), shown.map((s) => card(s, view !== 'answered')));
    const none = view === 'trash' ? empty('trash', t('trash_empty'), t('trash_t')) : view === 'answered' ? empty('user-check', t('answered_empty'), t('answered_t')) : term ? empty('search', t('nothing_found'), '') : empty('calendar-plus', t('none_yet'), t('none_yet_t'), primary(t('new_l'), { icon: 'plus', onclick: () => newDialog() }));
    // as in SavDocuments and SavPresentations: the title, the box to start a new one, then "Recent"
    // the search of actions (⌘J / Ctrl+J)
    commands([t('new_l'), [['plus', t('new_schedule'), () => newDialog()], ...['poll', 'slots', 'assign'].map((k) => [KINDS[k].icon, t('k_' + k), '#/new/' + k]), ...Object.keys(PRESETS).map((k) => [PRESETS[k].icon, t('p_' + k), '#/new/' + k, null, t('k_' + PRESETS[k].kind)]), ['file-up', t('open_file'), () => pickFile()]]],
      [t('home'), Object.keys(V).map((v) => [V[v][1], t(V[v][0]), '#/' + v])],
      [t('recent'), list.filter((s) => !s.deleted).slice(0, 80).map((s) => [KINDS[s.kind].icon, s.title, '#/r/' + s.id, null, t('k_' + s.kind)])]);
    put(main, head, view === '' && !term ? quick() : null, view === '' && !term && shown.length ? h('h2', t('recent')) : null, view === 'trash' && shown.length ? h('p.muted.tnote', t('trash_t')) : null, shown.length ? grid : none);
  }
  draw();
  document.title = t(V[view][0]) + ' – SavSchedules';
  const onFocus = () => { if (document.visibilityState === 'visible') reload().catch(() => {}); };
  document.addEventListener('visibilitychange', onFocus);
  return () => document.removeEventListener('visibilitychange', onFocus);
}
