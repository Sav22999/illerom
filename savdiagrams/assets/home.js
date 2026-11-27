/** Home: the templates to start a new diagram, the diagrams of the account (grid or list, search, sort) and the trash. */
import { btn, confirm, dialog, drop, empty, fail, h, icon, iconBtn, item, mobile, primary, put, ask, tile, toast } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { S, api } from './store.js';
import { brand, commands, credit, go, prefs, setPrefs, userMenu } from './account.js';
import { TEMPLATES, defaultSettings } from './model.js';
import { diagramSVG } from './shapes.js';
import { layoutTree } from './layout.js';
import { ACCEPT, readDiagramFile, saveSavdia } from './files.js';

/** The items of a template, laid out when it is a tree (org chart, mind map). */
export function fromTemplate(k) {
  const tp = TEMPLATES.find((x) => x[0] === k) || TEMPLATES[0], d = tp[2](getLang() === 'it');
  let list = d.items;
  if (d.tree) {
    const { moves, ends } = layoutTree(list, d.tree.root, d.tree.dir);
    list = list.map((i) => (moves.has(i.id) ? { ...i, ...moves.get(i.id) } : ends.has(i.id) ? { ...i, ...ends.get(i.id) } : i));
  }
  return list;
}
const previews = new Map();
/** A small picture of a template, drawn once. */
function preview(k) {
  if (!previews.has(k)) previews.set(k, k === 'blank' ? '' : diagramSVG(fromTemplate(k), defaultSettings(), { pad: 24 }).replace(/width="\d+" height="\d+"/, 'width="100%" height="100%" preserveAspectRatio="xMidYMid meet"'));
  return h('div.paper.tplp', { html: previews.get(k) || `<svg viewBox="0 0 160 100"><rect width="160" height="100" fill="#fff"/><path d="M80 38v24M68 50h24" stroke="#4352d6" stroke-width="3" stroke-linecap="round"/></svg>` });
}

export async function create(settings, title = '', items = [], thumb = '') {
  const r = await api('dg.create', { title: title || t('untitled'), settings, items, thumb, lang: getLang() });
  S.diagrams.unshift({ ...r.diagram, list: undefined, settings: undefined });
  go('#/d/' + r.diagram.id);
}
const fromTpl = (k, title = '') => create(defaultSettings(prefs()), title || (k === 'blank' ? '' : t('t_' + k)), fromTemplate(k));

export async function openFile(file) {
  const d = await readDiagramFile(file);
  await create(d.settings, d.title, d.items);
  toast(t('opened_file'), 'success');
}

/**
 * From the sketch to the diagram: the boards of SavWhiteboard (same account, same session), one to pick; its shapes,
 * texts and arrows become a diagram (sketch.js). Resolves {title, items} or null.
 */
export function pickBoard() {
  return new Promise((res) => {
    let out = null;
    const grid = h('div.bpick', h('sav-spinner'));
    const d = dialog({ title: t('from_board'), width: '44rem', body: [h('p.muted', t('from_board_t')), grid], actions: [{ label: t('cancel') }], onclose: () => res(out) });
    fetch('../savwhiteboard/api/?r=wb.init', { cache: 'no-store', headers: { 'X-Lang': getLang() } }).then((r) => r.json()).then((r) => {
      const boards = (r.boards || []).filter((b) => !b.trashed);
      if (!r.ok || !boards.length) return put(grid, empty('whiteboard', t(r.ok ? 'no_boards' : 'boards_off'), '', btn('SavWhiteboard', { href: '../savwhiteboard/', target: '_blank', icon: 'external-link' })));
      put(grid, boards.map((b) => tile(b.title, async () => {
        try {
          const g = await fetch('../savwhiteboard/api/?r=wb.get&quiet=1&id=' + encodeURIComponent(b.id), { cache: 'no-store' }).then((x) => x.json());
          if (!g.ok) throw Object.assign(new Error(g.error), { code: g.error });
          const { fromBoard } = await import('./sketch.js');
          out = fromBoard({ title: g.board.title, items: g.board.list });
          d.hide();
        } catch (e) { fail(e); }
      }, { class: 'tpl' }, h('div.thumbw', { style: `background:${b.bg || '#fff'}` }, b.thumb ? h('img', { src: b.thumb, alt: '', loading: 'lazy' }) : null), h('span.tname', b.title))));
    }).catch(() => put(grid, empty('cloud-off', t('boards_off'), '')));
  });
}
export async function fromBoardScreen() {
  const d = await pickBoard();
  if (d) { await create(defaultSettings(prefs()), d.title, d.items); toast(t('sketch_done'), 'success'); }
}
/** #/from-board/<id>: SavWhiteboard sends a board here ("Turn into a diagram"). */
export async function convertBoard(bid) {
  const g = await fetch('../savwhiteboard/api/?r=wb.get&quiet=1&id=' + encodeURIComponent(bid), { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
  if (!g?.ok) throw Object.assign(new Error('board_missing'), { code: 'board_missing' });
  const { fromBoard } = await import('./sketch.js');
  const d = fromBoard({ title: g.board.title, items: g.board.list });
  history.replaceState(null, '', '#/');
  await create(defaultSettings(prefs()), d.title, d.items);
  toast(t('sketch_done'), 'success');
}

/** New: a name and a template, then Create. As in SavDocuments and SavPresentations; it is also "All templates". */
export function newDiagram(start) {
  let pick = start || TEMPLATES[0][0];
  const name = h('sav-input', { label: t('title_l'), placeholder: t('untitled'), maxlength: 160, autofocus: true });
  const cards = {};
  const mark = () => Object.entries(cards).forEach(([k, c]) => c.classList.toggle('on', k === pick));
  const grid = h('div.ppick', TEMPLATES.map(([k]) => (cards[k] = tile(t('t_' + k), () => { pick = k; mark(); }, { class: 'tpl' }, preview(k), h('span.tname', t('t_' + k))))));
  mark();
  const d = dialog({ title: t('new_diagram'), width: '46rem', body: h('div.form', name, h('div', h('span.flabel', t('template_l')), grid)), actions: [{ label: t('cancel') }, { label: t('create'), icon: 'plus', primary: true, run: () => fromTpl(pick, name.value.trim()) }] });
  grid.addEventListener('dblclick', () => d.primary?.click());
}

export function homeScreen(root, view = '') {
  const p = prefs(), trash = view === 'trash';
  let q = '', sort = p.sort || 'updated', asList = !!p.list;
  const list = h('div');
  const search = h('sav-input', { type: 'search', placeholder: t('search_diagrams'), clearable: true, pill: true, 'aria-label': t('search_diagrams') }, icon('search', { slot: 'prefix' }));
  search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); draw(); });
  search.addEventListener('sav-clear', () => { q = ''; draw(); });

  const pickFile = () => { const f = h('input', { type: 'file', accept: ACCEPT }); f.addEventListener('change', () => f.files[0] && openFile(f.files[0]).catch(fail)); f.click(); };
  const starts = h('sav-card.quick', { appearance: 'elevated' }, h('div.qhead', h('h2', t('start_with')), btn(t('all_templates'), { size: 'sm', appearance: 'ghost', 'icon-end': 'arrow-right', onclick: () => newDiagram() })),
    h('div.qrow', TEMPLATES.map(([k]) => tile(t('t_' + k), () => fromTpl(k).catch(fail), { class: 'tpl' }, preview(k), h('span.tname', t('t_' + k)))),
      tile(t('from_board'), () => fromBoardScreen().catch(fail), { class: 'tpl' }, h('div.paper.tplp.wbp', h('img', { src: '../savwhiteboard/icons/favicon.svg', alt: '', width: 40, height: 40 })), h('span.tname', t('from_board')))));

  const card = (b) => {
    const menu = drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true }), trash ? [
      ['rotate-ccw', t('restore'), async () => { await api('dg.restore', { ids: [b.id] }); b.trashed = null; toast(t('restored'), 'success'); draw(); }],
      ['trash', t('delete_forever'), async () => { if (!(await confirm(t('delete_forever'), t('delete_forever_t'), t('delete_forever')))) return; await api('dg.delete', { ids: [b.id] }); S.diagrams = S.diagrams.filter((x) => x !== b); draw(); }, { danger: true }],
    ] : [
      ['pencil', t('rename'), async () => { const v = await ask(t('rename'), t('title_l'), b.title); if (!v || v === b.title) return; await api('dg.save', { id: b.id, base: b.version, title: v, lang: getLang() }).then((r) => { b.version = r.version; b.title = v; draw(); }); }],
      ['copy-plus', t('duplicate'), async () => { const r = await api('dg.duplicate', { id: b.id, lang: getLang() }); S.diagrams.unshift(r.diagram); draw(); }],
      ['file-down', t('save_savdia'), async () => { const r = await api('dg.get', undefined, { id: b.id, quiet: 1 }); await saveSavdia({ title: r.diagram.title, settings: r.diagram.settings, items: r.diagram.list }); }],
      '-', ['trash', t('to_trash'), async () => { await api('dg.trash', { ids: [b.id] }); b.trashed = new Date().toISOString(); toast(t('trashed'), 'neutral', { duration: 5000 }); draw(); }, { danger: true }],
    ], { placement: 'bottom-end', label: b.title });
    const info = b.items === 0 ? t('items_0') : b.items === 1 ? t('items_1') : t('items_n', { n: b.items });
    const pic = h('div.thumbw', { style: `background:${b.bg}` }, b.thumb ? h('img', { src: b.thumb, alt: '', loading: 'lazy' }) : icon('workflow'));
    return h('sav-card.card' + (trash ? '.away' : ''), { interactive: !trash || null, onclick: (e) => { if (!trash && !e.composedPath().some((x) => x.localName === 'sav-dropdown')) go('#/d/' + b.id); } },
      h('div.cthumb', pic), h('div.cinfo', h('div', h('b', b.title), h('small', info + ' · ' + t('changed_w', { w: when(b.updated) }))), menu));
  };

  function draw() {
    let ds = S.diagrams.filter((b) => !!b.trashed === trash && (!q || b.title.toLowerCase().includes(q)));
    ds = ds.sort(sort === 'title' ? (a, b) => a.title.localeCompare(b.title, getLang()) : sort === 'opened' ? (a, b) => String(b.opened || '').localeCompare(String(a.opened || '')) : (a, b) => String(b.updated).localeCompare(String(a.updated)));
    const head = h('div.hhead', h('h1', trash ? t('trash') : q ? t('results_for', { q }) : t('my_diagrams')), h('span.spacer'),
      trash ? (ds.length ? btn(t('empty_trash'), { icon: 'trash', size: 'sm', variant: 'danger', appearance: 'soft', onclick: async () => { if (!(await confirm(t('empty_trash'), t('empty_trash_t'), t('delete_forever')))) return; await api('dg.empty_trash', {}); S.diagrams = S.diagrams.filter((b) => !b.trashed); draw(); } }) : null)
        : [drop(h('sav-button', { caret: true, appearance: 'ghost', variant: 'neutral', size: 'sm' }, t('sort_' + sort)), ['updated', 'opened', 'title'].map((k) => ['', t('sort_' + k), () => { sort = k; setPrefs({ sort }).catch(() => {}); draw(); }, { check: sort === k }]), { placement: 'bottom-end' }),
          iconBtn(asList ? 'layout-grid' : 'list', t(asList ? 'as_grid' : 'as_list'), () => { asList = !asList; setPrefs({ list: asList }).catch(() => {}); draw(); }),
          btn(t('open_file'), { size: 'sm', icon: 'file-up', appearance: 'outline', variant: 'neutral', onclick: pickFile, title: t('open_file_t') })]);
    commands([t('new_l'), [['plus', t('new_diagram'), () => newDiagram()], ...TEMPLATES.map(([k, ic]) => [ic, t('t_' + k), () => fromTpl(k).catch(fail)]), ['whiteboard', t('from_board'), () => fromBoardScreen().catch(fail)], ['file-up', t('open_file'), () => pickFile()]]],
      [t('home'), [['layout-grid', t('my_diagrams'), '#/'], ['trash', t('trash'), '#/trash']]],
      [t('recent'), S.diagrams.filter((b) => !b.trashed).slice(0, 80).map((b) => ['workflow', b.title, '#/d/' + b.id])]);
    put(list, head, trash || q ? null : starts, !trash && !q && ds.length ? h('h2', t('recent')) : null, trash ? h('p.muted.tnote', t('trash_t', { n: S.trashDays })) : null,
      ds.length ? h('div.' + (asList ? 'rows' : 'grid'), ds.map(card))
        : trash ? empty('trash', t('trash_empty'), '') : q ? empty('search', t('nothing_found'), '') : empty('workflow', t('none_yet'), t('none_yet_t')));
  }

  const it = (v, ic, label) => { const x = item(v, ic, label); x.toggleAttribute('current', (v === 'trash') === trash); return x; };
  const menu = h('sav-menu', { label: t('my_diagrams'), selectable: true }, it('all', 'layout-grid', t('my_diagrams')), it('trash', 'trash', t('trash')));
  menu.addEventListener('sav-select', (e) => go(e.detail.value === 'trash' ? '#/trash' : '#/'));
  const nav = h('nav.hside', { 'aria-label': t('my_diagrams') }, primary(t('new_l'), { icon: 'plus', size: 'lg', block: true, class: 'newbtn', onclick: () => newDiagram() }), menu);
  put(root, h('div.home', h('header.htop', brand(), h('div.hsearch', search), h('div.spacer'), userMenu()),
    h('div.hbody', nav, h('main.hmain', list)), credit()));
  document.title = (trash ? t('trash') + ' – ' : '') + 'SavDiagrams';
  draw();
  void mobile;
}
