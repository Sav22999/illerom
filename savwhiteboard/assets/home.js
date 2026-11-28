/** Home: the papers to start a new board, the boards of the account (grid or list, search, sort) and the trash. */
import { btn, confirm, dialog, drop, empty, fail, h, icon, iconBtn, item, mobile, primary, put, ask, tile, toast } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { S, api } from './store.js';
import { brand, commands, credit, go, prefs, setPrefs, userMenu } from './account.js';
import { TEMPLATES, defaultSettings, isDark } from './model.js';
import { patternSVG } from './render.js';
import { readSavwhi, saveSavwhi, toServer } from './files.js';

/** A small square of paper: the background with its watermark. */
function paper(s, cls = '') {
  const pat = patternSVG('tp' + Math.random().toString(36).slice(2, 7), { ...s, pc: '' }, s.gap * .7, .9);
  const id = pat ? /id="([^"]+)"/.exec(pat)[1] : '';
  return h('div.paper' + cls, { html: `<svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice"><defs>${pat}</defs><rect width="160" height="100" fill="${s.bg}"/>${pat ? `<rect width="160" height="100" fill="url(#${id})"/>` : ''}</svg>` });
}

export async function create(settings, title = '', items = [], thumb = '') {
  const r = await api('wb.create', { title: title || t('untitled'), settings, items, thumb, lang: getLang() });
  S.boards.unshift({ ...r.board, list: undefined, settings: undefined });
  go('#/b/' + r.board.id);
}

export async function openFile(file) {
  const b = await readSavwhi(file);
  await create(b.settings, b.title, await toServer(b.items)); // its pictures become pictures of the account
  toast(t('opened_file'), 'success');
}

/** New: a name and a paper, then Create. As in SavDocuments and SavPresentations; it is also "All templates". */
export function newBoard(start) {
  let pick = start || TEMPLATES[0][0];
  const name = h('sav-input', { label: t('title_l'), placeholder: t('untitled'), maxlength: 160, autofocus: true });
  const cards = {};
  const mark = () => Object.entries(cards).forEach(([k, c]) => c.classList.toggle('on', k === pick));
  const grid = h('div.ppick', TEMPLATES.map(([k, , st]) => (cards[k] = tile(t('t_' + k), () => { pick = k; mark(); }, { class: 'tpl' }, paper(st, isDark(st.bg) ? '.dk' : ''), h('span.tname', t('t_' + k))))));
  mark();
  const run = () => create({ ...defaultSettings(prefs()), ...TEMPLATES.find((x) => x[0] === pick)[2] }, name.value.trim());
  const d = dialog({ title: t('new_board'), width: '44rem', body: h('div.form', name, h('div', h('span.flabel', t('paper_l')), grid)), actions: [{ label: t('cancel') }, { label: t('create'), icon: 'plus', primary: true, run }] });
  grid.addEventListener('dblclick', () => d.primary?.click());
}

export function homeScreen(root, view = '') {
  const p = prefs(), trash = view === 'trash';
  let q = '', sort = p.sort || 'updated', asList = !!p.list;
  const list = h('div');
  const search = h('sav-input', { type: 'search', placeholder: t('search_boards'), clearable: true, pill: true, 'aria-label': t('search_boards') }, icon('search', { slot: 'prefix' }));
  search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); draw(); });
  search.addEventListener('sav-clear', () => { q = ''; draw(); });

  const pickFile = () => { const f = h('input', { type: 'file', accept: '.savwhi,application/vnd.savwhiteboard.board+zip,application/json' }); f.addEventListener('change', () => f.files[0] && openFile(f.files[0]).catch(fail)); f.click(); };
  // as in SavDocuments and SavPresentations: a few papers, and all of them in the New window
  const starts = h('sav-card.quick', { appearance: 'elevated' }, h('div.qhead', h('h2', t('start_with')), btn(t('all_templates'), { size: 'sm', appearance: 'ghost', 'icon-end': 'arrow-right', onclick: () => newBoard() })),
    h('div.qrow', TEMPLATES.slice(0, mobile() ? 6 : 8).map(([k, , s]) => tile(t('t_' + k), () => create({ ...defaultSettings(), ...s }, '').catch(fail), { class: 'tpl' }, paper(s, isDark(s.bg) ? '.dk' : ''), h('span.tname', t('t_' + k))))));

  const card = (b) => {
    const menu = drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true }), trash ? [
      ['rotate-ccw', t('restore'), async () => { await api('wb.restore', { ids: [b.id] }); b.trashed = null; toast(t('restored'), 'success'); draw(); }],
      ['trash', t('delete_forever'), async () => { if (!(await confirm(t('delete_forever'), t('delete_forever_t'), t('delete_forever')))) return; await api('wb.delete', { ids: [b.id] }); S.boards = S.boards.filter((x) => x !== b); draw(); }, { danger: true }],
    ] : [
      ['pencil', t('rename'), async () => { const v = await ask(t('rename'), t('title_l'), b.title); if (!v || v === b.title) return; await api('wb.save', { id: b.id, base: b.version, title: v, lang: getLang() }).then((r) => { b.version = r.version; b.title = v; draw(); }); }],
      ['copy-plus', t('duplicate'), async () => { const r = await api('wb.duplicate', { id: b.id, lang: getLang() }); S.boards.unshift(r.board); draw(); }],
      ['file-down', t('save_savwhi'), async () => { const r = await api('wb.get', undefined, { id: b.id, quiet: 1 }); await saveSavwhi({ title: r.board.title, settings: r.board.settings, items: r.board.list }); }],
      '-', ['trash', t('to_trash'), async () => { await api('wb.trash', { ids: [b.id] }); b.trashed = new Date().toISOString(); toast(t('trashed'), 'neutral', { duration: 5000 }); draw(); }, { danger: true }],
    ], { placement: 'bottom-end', label: b.title });
    const info = b.items === 0 ? t('items_0') : b.items === 1 ? t('items_1') : t('items_n', { n: b.items });
    const pic = b.thumb ? h('div.thumbw', { style: `background:${b.bg}` }, h('img', { src: b.thumb, alt: '', loading: 'lazy' })) : paper({ bg: b.bg, pat: b.pat, gap: 24 }, isDark(b.bg) ? '.dk' : '');
    return h('sav-card.card' + (trash ? '.away' : ''), { interactive: !trash || null, onclick: (e) => { if (!trash && !e.composedPath().some((x) => x.localName === 'sav-dropdown')) go('#/b/' + b.id); } },
      h('div.cthumb', pic), h('div.cinfo', h('div', h('b', b.title), h('small', info + ' · ' + t('changed_w', { w: when(b.updated) }))), menu));
  };

  function draw() {
    let boards = S.boards.filter((b) => !!b.trashed === trash && (!q || b.title.toLowerCase().includes(q)));
    boards = boards.sort(sort === 'title' ? (a, b) => a.title.localeCompare(b.title, getLang()) : sort === 'opened' ? (a, b) => String(b.opened || '').localeCompare(String(a.opened || '')) : (a, b) => String(b.updated).localeCompare(String(a.updated)));
    const head = h('div.hhead', h('h1', trash ? t('trash') : q ? t('results_for', { q }) : t('my_boards')), h('span.spacer'),
      trash ? (boards.length ? btn(t('empty_trash'), { icon: 'trash', size: 'sm', variant: 'danger', appearance: 'soft', onclick: async () => { if (!(await confirm(t('empty_trash'), t('empty_trash_t'), t('delete_forever')))) return; await api('wb.empty_trash', {}); S.boards = S.boards.filter((b) => !b.trashed); draw(); } }) : null)
        : [drop(h('sav-button', { caret: true, appearance: 'ghost', variant: 'neutral', size: 'sm' }, t('sort_' + sort)), ['updated', 'opened', 'title'].map((k) => ['', t('sort_' + k), () => { sort = k; setPrefs({ sort }).catch(() => {}); draw(); }, { check: sort === k }]), { placement: 'bottom-end' }),
          iconBtn(asList ? 'layout-grid' : 'list', t(asList ? 'as_grid' : 'as_list'), () => { asList = !asList; setPrefs({ list: asList }).catch(() => {}); draw(); }),
          btn(t('open_file'), { size: 'sm', icon: 'file-up', appearance: 'outline', variant: 'neutral', onclick: pickFile })]);
    // the search of actions (⌘J / Ctrl+J)
    commands([t('new_l'), [['plus', t('new_board'), () => newBoard()], ...TEMPLATES.map(([k, ic, st]) => [ic, t('t_' + k), () => create({ ...defaultSettings(), ...st }, '').catch(fail)]), ['file-up', t('open_file'), () => pickFile()]]],
      [t('home'), [['layout-grid', t('my_boards'), '#/'], ['trash', t('trash'), '#/trash']]],
      [t('recent'), S.boards.filter((b) => !b.trashed).slice(0, 80).map((b) => ['whiteboard', b.title, '#/b/' + b.id])]);
    // as in SavDocuments and SavPresentations: the title, the box to start a new one, then "Recent"
    put(list, head, trash || q ? null : starts, !trash && !q && boards.length ? h('h2', t('recent')) : null, trash ? h('p.muted.tnote', t('trash_t', { n: S.trashDays })) : null,
      boards.length ? h('div.' + (asList ? 'rows' : 'grid'), boards.map(card))
        : trash ? empty('trash', t('trash_empty'), '') : q ? empty('search', t('nothing_found'), '') : empty('whiteboard', t('none_yet'), t('none_yet_t')),
      // the boards of others shared with this person: open, or a copy of one's own
      !trash && sharedList().length ? [h('h2', t('shared_with_me')), h('div.' + (asList ? 'rows' : 'grid'), sharedList().map(sharedCard))] : null);
  }
  const sharedList = () => (S.shared || []).filter((b) => !q || b.title.toLowerCase().includes(q));
  const sharedCard = (b) => {
    const menu = drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true }), [
      ['square-arrow-out-up-right', t('open'), () => go('#/b/' + b.id)],
      ['copy-plus', t('duplicate'), async () => { const r = await api('wb.duplicate', { id: b.id, lang: getLang() }); S.boards.unshift(r.board); draw(); }],
    ], { placement: 'bottom-end', label: b.title });
    const pic = b.thumb ? h('div.thumbw', { style: `background:${b.bg}` }, h('img', { src: b.thumb, alt: '', loading: 'lazy' })) : paper({ bg: b.bg, pat: b.pat, gap: 24 }, isDark(b.bg) ? '.dk' : '');
    return h('sav-card.card', { interactive: true, onclick: (e) => { if (!e.composedPath().some((x) => x.localName === 'sav-dropdown')) go('#/b/' + b.id); } },
      h('div.cthumb', pic), h('div.cinfo', h('div', h('b', b.title), h('small', t(b.role === 'viewer' ? 'shared_by_view' : 'shared_by_edit', { n: b.owner || '' }) + ' · ' + t('changed_w', { w: when(b.updated) }))), menu));
  };

  const it = (v, ic, label) => { const x = item(v, ic, label); x.toggleAttribute('current', (v === 'trash') === trash); return x; };
  const menu = h('sav-menu', { label: t('my_boards'), selectable: true }, it('all', 'layout-grid', t('my_boards')), it('trash', 'trash', t('trash')));
  menu.addEventListener('sav-select', (e) => go(e.detail.value === 'trash' ? '#/trash' : '#/'));
  const nav = h('nav.hside', { 'aria-label': t('my_boards') }, primary(t('new_l'), { icon: 'plus', size: 'lg', block: true, class: 'newbtn', onclick: () => newBoard() }), menu);
  put(root, h('div.home', h('header.htop', brand(), h('div.hsearch', search), h('div.spacer'), userMenu()),
    h('div.hbody', nav, h('main.hmain', list)), credit()));
  document.title = (trash ? t('trash') + ' – ' : '') + 'SavWhiteboard';
  draw();
  void mobile;
}
