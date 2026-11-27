/**
 * The forms of the account: a row of models to start a new one, then the forms as cards (answers, new ones, whether it
 * takes answers, the deadline), with a search and a few filters. As the homes of the other apps of SavOffice.
 */
import { btn, confirm, copyText, dialog, drop as dropDown, dropBtn, empty, fail, h, icon, iconBtn, item, mobile, primary, put, tile, toast } from './ui.js';
import { t, when } from './i18n.js';
import { S, api, drop, formLink, keep } from './store.js';
import { brand, commands, credit, go, prefs, setPrefs, userMenu } from './account.js';
import { models } from './models.js';
import { LOCAL_TZ, rel, shortMoment } from './time.js';

/** A new form from a model (or empty), then its editor. */
export async function createForm(make, color, title = '') {
  const m = make();
  if (title) m.title = title;
  const p = prefs();
  const settings = { ...(m.settings || {}) };
  if (p.notifyNew && settings.notify === undefined) settings.notify = true;
  const r = await api('forms.create', { title: m.title, descr: m.descr, items: m.items, settings, tz: p.tz || LOCAL_TZ, theme: color ? { color } : undefined });
  if (p.calNew === false) await api('forms.save', { id: r.form.id, inCalendar: false }).catch(() => {});
  keep(r.form);
  go('#/e/' + r.form.id);
}

export const stateBadge = (f) => {
  const [variant, ic, key] = { open: ['success', 'door-open', 'st_open'], closed: ['neutral', 'door-closed', f.why === 'deadline' ? 'st_ended' : 'st_closed'], soon: ['warning', 'calendar-clock', 'st_soon'], full: ['warning', 'ban', 'st_full'] }[f.state] || ['neutral', 'circle', 'st_closed'];
  return h('sav-badge', { variant, appearance: 'soft', pill: true }, icon(ic, { style: 'margin-right:.25rem' }), t(key));
};

/** What a form does next, in a few words: "closes in 3 days", "opens tomorrow", "ended 2 Dec". */
export function nextStep(f) {
  if (f.state === 'soon' && f.opens) return t('opens_w', { w: rel(f.opens) });
  if (f.state === 'open' && f.closes) return t('closes_w', { w: rel(f.closes) });
  if (f.why === 'deadline' && f.closes) return t('ended_w', { w: shortMoment(f.closes) });
  return t('changed_w', { w: when(f.updated) });
}

export function formMenu(f, after = () => {}) {
  return () => [
    ['pencil', t('edit'), () => go('#/e/' + f.id)],
    ['chart-column', t('see_answers'), () => go('#/r/' + f.id)],
    ['eye', t('preview'), () => window.open(formLink(f.id), '_blank', 'noopener')],
    ['link', t('copy_link'), () => copyText(formLink(f.id), t('link_copied'))],
    '-',
    [f.state === 'open' ? 'door-closed' : 'door-open', t(f.state === 'open' || f.state === 'full' ? 'stop_answers' : 'take_answers'), async () => { const r = await api('forms.save', { id: f.id, accepting: !(f.state === 'open' || f.state === 'full') }); keep(r.form); after(); }],
    ['copy-plus', t('duplicate'), async () => { const r = await api('forms.duplicate', { id: f.id }); keep(r.form); toast(t('duplicated'), 'success'); after(); }],
    ['download', t('download_savfor'), () => import('./files.js').then((m) => m.saveSavfor(f.id, false))],
    [f.archived ? 'inbox' : 'archive', t(f.archived ? 'unarchive' : 'archive'), async () => { const r = await api('forms.save', { id: f.id, archived: !f.archived }); keep(r.form); after(); }],
    '-',
    ['trash', t('delete'), async () => {
      if (!(await confirm(t('delete_form'), f.responses ? t('delete_form_answers', { n: f.responses }) : t('delete_form_text'), t('delete')))) return;
      await api('forms.delete', { id: f.id }); drop(f.id); toast(t('deleted'), 'success'); after();
    }, { danger: true }],
  ];
}

/** New: a name and a model, then Create. As in SavDocuments and SavPresentations; it is also "All templates". */
export function newForm() {
  const list = models();
  let pick = list[0][0];
  const name = h('sav-input', { label: t('form_name'), placeholder: t('untitled'), maxlength: 160, autofocus: true });
  const cards = {};
  const mark = () => Object.entries(cards).forEach(([k, c]) => c.classList.toggle('on', k === pick));
  const grid = h('div.mpick', list.map(([k, ic, color]) => (cards[k] = tile(t('m_' + k), () => { pick = k; mark(); }, { class: 'qt mtile', style: `--c:${color}` }, h('div.qpic', icon(ic)), h('div', h('strong', t('m_' + k)), h('small.muted', t('m_' + k + '_t')))))));
  mark();
  const run = () => { const [, , color, make] = list.find((x) => x[0] === pick); return createForm(make, color, name.value.trim()); };
  const d = dialog({ title: t('new_form'), width: '48rem', body: h('div.form', name, h('div', h('span.flabel', t('models_l')), grid)), actions: [{ label: t('cancel') }, { label: t('create'), icon: 'plus', primary: true, run }] });
  grid.addEventListener('dblclick', () => d.primary?.click());
}

export function homeScreen(root, wantNew = false) {
  let filter = 'all', query = '';
  const listBox = h('div'), main = h('main.hmain'), side = h('nav.hside', { 'aria-label': t('your_forms') });
  const sorts = { updated: (a, b) => (b.updated > a.updated ? 1 : -1), created: (a, b) => (b.created > a.created ? 1 : -1), title: (a, b) => a.title.localeCompare(b.title), answers: (a, b) => b.responses - a.responses };
  // the filters are the menu on the side, as the views of SavDocuments and SavSchedules
  const V = { all: ['your_forms', 'layout-grid'], open: ['f_open', 'door-open'], closed: ['f_closed', 'door-closed'], starred: ['f_starred', 'star'], archived: ['f_archived', 'archive'] };

  const card = (f) => {
    const star = iconBtn('star', t(f.starred ? 'unstar' : 'star'), async () => { const r = await api('forms.save', { id: f.id, starred: !f.starred }); keep(r.form); draw(); }, { class: 'starb' + (f.starred ? ' on' : '') });
    star.on(f.starred);
    return h('sav-card.card.formc' + (f.archived ? '.away' : ''), { style: `--c:${f.color}` },
      h('a.cthumb', { href: '#/e/' + f.id, 'aria-label': f.title || t('untitled') },
        h('div.fsheet', h('i.fband'), h('span', { style: 'width:72%' }), h('span', { style: 'width:46%' }), h('span.fopt'), h('span.fopt'), h('span', { style: 'width:58%' })),
        h('div.tstat', h('strong', String(f.responses)), h('small', t(f.responses === 1 ? 'answer_1' : 'answers_n')), f.new ? h('sav-badge', { variant: 'primary', appearance: 'solid', pill: true }, t('new_n', { n: f.new })) : null),
        h('div.cbadges', stateBadge(f), f.quiz ? h('sav-badge', { appearance: 'soft', pill: true }, icon('trophy')) : null)),
      h('div.cinfo', h('div', h('b', f.title || t('untitled')), h('small', nextStep(f))), star, dropBtn('ellipsis-vertical', t('more'), formMenu(f, draw), { caret: false, placement: 'bottom-end' })));
  };

  const quick = () => h('sav-card.quick', { appearance: 'elevated' }, h('div.qhead', h('h2', t('start_new')), btn(t('all_templates'), { size: 'sm', appearance: 'ghost', 'icon-end': 'arrow-right', onclick: () => newForm() })),
    h('div.qrow.mrow', models().slice(0, mobile() ? 4 : 6).map(([k, ic, color, make]) => tile(t('m_' + k), () => createForm(make, color).catch(fail), { class: 'qt mtile', style: `--c:${color}` }, h('div.qpic', icon(ic)), h('div', h('strong', t('m_' + k)), h('small.muted', t('m_' + k + '_t')))))));

  function drawSide() {
    const count = { starred: S.forms.filter((f) => f.starred && !f.archived).length, archived: S.forms.filter((f) => f.archived).length };
    const it = (v) => { const x = item(v, V[v][1], t(V[v][0])); x.toggleAttribute('current', filter === v); if (count[v]) x.append(h('sav-badge', { slot: 'suffix', appearance: 'soft', variant: 'neutral', pill: true }, String(count[v]))); return x; };
    const menu = h('sav-menu', { label: t('your_forms'), selectable: true }, Object.keys(V).map(it));
    menu.addEventListener('sav-select', (e) => { filter = e.detail.value; draw(); });
    const total = S.forms.reduce((a, f) => a + f.responses, 0), fresh = S.forms.reduce((a, f) => a + (f.new || 0), 0);
    put(side, primary(t('new_l'), { icon: 'plus', size: 'lg', block: true, class: 'newbtn', onclick: () => newForm() }), menu,
      h('div.sidebox', h('div', h('strong', String(total)), h('small.muted', t('answers_n'))), h('div', h('strong', String(fresh)), h('small.muted', t('new_answers')))));
  }

  function draw() {
    drawSide();
    const p = prefs(), sort = sorts[p.sort] ? p.sort : 'updated';
    let list = S.forms.filter((f) => (filter === 'archived' ? f.archived : !f.archived));
    if (filter === 'open') list = list.filter((f) => f.state === 'open');
    if (filter === 'closed') list = list.filter((f) => f.state !== 'open');
    if (filter === 'starred') list = list.filter((f) => f.starred);
    if (query) list = list.filter((f) => f.title.toLowerCase().includes(query.toLowerCase()));
    list.sort(sorts[sort]);
    const sorter = dropDown(h('sav-button', { caret: true, appearance: 'ghost', variant: 'neutral', size: 'sm' }, t('sort_' + sort)), Object.keys(sorts).map((k) => ['', t('sort_' + k), () => setPrefs({ sort: k }).then(draw).catch(fail), { check: sort === k }]), { placement: 'bottom-end' });
    const head = h('div.hhead', h('h1', query ? t('results_for', { q: query }) : t(V[filter][0])), h('div.spacer'), sorter, btn(t('open_file'), { size: 'sm', icon: 'file-up', appearance: 'outline', variant: 'neutral', onclick: () => import('./files.js').then((m) => m.openFileDialog()) }));
    const none = S.forms.length ? empty('search', t('nothing_found'), '') : empty('clipboard-list', t('no_forms'), t('no_forms_t'), primary(t('new_l'), { icon: 'plus', onclick: () => newForm() }));
    put(listBox, list.length ? h('div.grid', list.map(card)) : none);
    // the search of actions (⌘J / Ctrl+J): the filters are views of the same page
    commands([t('new_l'), [['plus', t('new_form'), () => newForm()], ...models().map(([k, ic, color, make]) => [ic, t('m_' + k), () => createForm(make, color).catch(fail), null, t('m_' + k + '_t')]), ['file-up', t('open_file'), () => import('./files.js').then((m) => m.openFileDialog())]]],
      [t('home'), Object.keys(V).map((v) => [V[v][1], t(V[v][0]), () => { filter = v; draw(); }])],
      [t('recent'), S.forms.filter((f) => !f.archived).slice(0, 80).map((f) => ['clipboard-list', f.title || t('untitled'), '#/e/' + f.id, null, nextStep(f)])]);
    // as in SavDocuments and SavPresentations: the title, the box to start a new one, then "Recent"
    const home = filter === 'all' && !query;
    put(main, head, home ? quick() : null, home && list.length ? h('h2', t('recent')) : null, listBox);
  }

  const search = h('sav-input', { type: 'search', placeholder: t('search_forms'), clearable: true, pill: true, 'aria-label': t('search_forms') }, icon('search', { slot: 'prefix' }));
  search.addEventListener('input', () => { query = search.value.trim(); draw(); });
  search.addEventListener('sav-clear', () => { query = ''; draw(); });

  put(root, h('div.home', h('header.htop', brand(), h('div.hsearch', search), h('div.spacer'), userMenu()), h('div.hbody', side, main), credit()));
  draw();
  if (wantNew) setTimeout(() => newForm(), 50);
  if (S.pendingFile) import('./files.js').then((m) => m.openPending());
  document.title = 'SavForms';
  return () => {};
}
