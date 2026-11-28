/** Home: the papers to start a new notebook, the notebooks of the account as covers on a shelf (grid or list, search, sort) and the trash. */
import { btn, confirm, dialog, drop, empty, fail, h, icon, iconBtn, item, mobile, primary, put, ask, tile, toast } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { S, api } from './store.js';
import { brand, commands, credit, go, prefs, setPrefs, userMenu } from './account.js';
import { COVERS, SIZES, TEMPLATES, defaultSettings, isDark, pageSize } from './model.js';
import { paperSVG } from './render.js';
import { readSavnot, saveSavnot } from './files.js';

/** A small piece of paper: its colour with its watermark. */
function paper(s, w = 160, hh = 110) {
  const p = paperSVG('tp' + Math.random().toString(36).slice(2, 7), { ...s, pc: '' }, w, hh, .8);
  return h('div.paper' + (isDark(s.bg) ? '.dk' : ''), { html: `<svg viewBox="0 0 ${w} ${hh}" preserveAspectRatio="xMidYMid slice"><defs>${p.defs}</defs>${p.body}</svg>` });
}

/** The cover of a notebook: its colour, the elastic band, a label with the title and the edge of the sheets inside. */
function cover(b) {
  const [w, hh] = pageSize(b), dark = isDark(b.cover);
  return h('div.cover' + (dark ? '' : '.light'), { style: `--cv:${b.cover};aspect-ratio:${w}/${hh}` },
    h('span.cpages'), h('span.cspine'), h('span.cband'),
    h('div.clabel', h('b', b.title), h('small', b.sheets === 1 ? t('sheets_1') : t('sheets_n', { n: b.sheets }))),
    h('div.cpaper', paper(b.paper || { bg: '#ffffff', pat: 'lines', gap: 30 }, 60, 30)));
}

export async function create(settings, title = '', sheets = []) {
  const r = await api('nb.create', { title: title || t('untitled'), settings, sheets, lang: getLang() });
  S.notebooks.unshift({ ...r.notebook, list: undefined, settings: undefined });
  go('#/n/' + r.notebook.id);
}

export async function openFile(file) {
  const b = await readSavnot(file);
  await create(b.settings, b.title, b.sheets);
  toast(t('opened_file'), 'success');
}

/** A new notebook: title, cover, size of the sheets and paper. */
export function newNotebook(paperPick) {
  const p = prefs(), s = defaultSettings({ ...(p.nb || {}), paper: paperPick || p.nb?.paper });
  s.cover = COVERS[Math.floor(Math.random() * COVERS.length)];
  const name = h('sav-input', { label: t('title_l'), placeholder: t('untitled'), maxlength: 160, autofocus: true });
  const covers = h('sav-radio-group.sws', { appearance: 'buttons', size: 'sm', value: s.cover, 'aria-label': t('cover') }, COVERS.map((c) => h('sav-radio', { value: c, title: c, 'aria-label': c }, h('span.sw', { style: `--c:${c}` }))));
  const size = h('sav-select', { label: t('page_size'), value: s.size, size: 'sm' }, Object.keys(SIZES).map((k) => h('option', { value: k }, t('size_' + k))));
  const orient = h('sav-radio-group', { appearance: 'buttons', size: 'sm', value: s.orient, label: t('orient') }, h('sav-radio', { value: 'p' }, t('portrait')), h('sav-radio', { value: 'l' }, t('landscape')));
  let pick = TEMPLATES.find(([, , x]) => x.pat === s.paper.pat && x.bg === s.paper.bg)?.[0] || TEMPLATES[0][0];
  const papers = h('div.ppick', TEMPLATES.map(([k, , x]) => { const b = tile(t('t_' + k), () => { pick = k; papers.querySelectorAll('.tile').forEach((y) => y.classList.toggle('on', y === b)); }, { class: 'tpl' + (k === pick ? ' on' : '') }, paper(x), h('span.tname', t('t_' + k))); return b; }));
  const preview = h('div.npreview');
  const show = () => put(preview, cover({ title: name.value.trim() || t('untitled'), cover: covers.value, size: size.value, orient: orient.value, sheets: 1, paper: TEMPLATES.find((x) => x[0] === pick)[2] }));
  for (const x of [name, covers, size, orient]) { x.addEventListener('input', show); x.addEventListener('change', show); }
  papers.addEventListener('click', () => setTimeout(show));
  show();
  dialog({ title: t('new_notebook'), width: '40rem', cls: 'newnb', body: h('div.nform', h('div.form', name, h('div', h('span.flabel', t('cover')), covers), h('div.grid2', size, orient), h('div', h('span.flabel', t('paper')), papers)), preview),
    actions: [{ label: t('cancel') }, { label: t('create'), primary: true, run: async () => {
      const st = { ...s, cover: covers.value, size: size.value, orient: orient.value, paper: { ...TEMPLATES.find((x) => x[0] === pick)[2], pc: '' } };
      setPrefs({ nb: { size: st.size, orient: st.orient, paper: st.paper } }).catch(() => {});
      await create(st, name.value.trim());
    } }] });
}

export function homeScreen(root, view = '') {
  const p = prefs(), trash = view === 'trash';
  let q = '', sort = p.sort || 'updated', asList = !!p.list;
  const list = h('div');
  const search = h('sav-input', { type: 'search', placeholder: t('search_notebooks'), clearable: true, pill: true, 'aria-label': t('search_notebooks') }, icon('search', { slot: 'prefix' }));
  search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); draw(); });
  search.addEventListener('sav-clear', () => { q = ''; draw(); });

  const pickFile = () => { const f = h('input', { type: 'file', accept: '.savnot,application/vnd.savnotes.notebook+zip,application/json' }); f.addEventListener('change', () => f.files[0] && openFile(f.files[0]).catch(fail)); f.click(); };
  const quick = (k, s) => create({ ...defaultSettings({ ...(p.nb || {}), paper: s }), cover: COVERS[Math.floor(Math.random() * COVERS.length)] }, '').catch(fail);
  // as in SavDocuments and SavPresentations: a few papers, and all of them (with cover and size) in the New window
  const starts = h('sav-card.quick', { appearance: 'elevated' }, h('div.qhead', h('h2', t('start_with')), btn(t('all_templates'), { size: 'sm', appearance: 'ghost', 'icon-end': 'arrow-right', onclick: () => newNotebook() })),
    h('div.qrow', TEMPLATES.slice(0, mobile() ? 6 : 8).map(([k, , s]) => tile(t('t_' + k), () => quick(k, s), { class: 'tpl' }, paper(s), h('span.tname', t('t_' + k))))));

  const card = (b) => {
    const menu = drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true }), trash ? [
      ['rotate-ccw', t('restore'), async () => { await api('nb.restore', { ids: [b.id] }); b.trashed = null; toast(t('restored'), 'success'); draw(); }],
      ['trash', t('delete_forever'), async () => { if (!(await confirm(t('delete_forever'), t('delete_forever_t'), t('delete_forever')))) return; await api('nb.delete', { ids: [b.id] }); S.notebooks = S.notebooks.filter((x) => x !== b); draw(); }, { danger: true }],
    ] : [
      ['pencil', t('rename'), async () => { const v = await ask(t('rename'), t('title_l'), b.title); if (!v || v === b.title) return; const r = await api('nb.save', { id: b.id, base: b.version, title: v, lang: getLang() }); b.version = r.version; b.title = v; draw(); }],
      ['copy-plus', t('duplicate'), async () => { const r = await api('nb.duplicate', { id: b.id, lang: getLang() }); S.notebooks.unshift(r.notebook); draw(); }],
      ['file-down', t('save_savnot'), async () => { const r = await api('nb.get', undefined, { id: b.id, quiet: 1 }); await saveSavnot({ title: r.notebook.title, settings: r.notebook.settings, sheets: r.notebook.list }); }],
      '-', ['trash', t('to_trash'), async () => { await api('nb.trash', { ids: [b.id] }); b.trashed = new Date().toISOString(); toast(t('trashed'), 'neutral', { duration: 5000 }); draw(); }, { danger: true }],
    ], { placement: 'bottom-end', label: b.title });
    const info = (b.sheets === 1 ? t('sheets_1') : t('sheets_n', { n: b.sheets })) + ' · ' + t('changed_w', { w: when(b.updated) });
    return h('div.nbcard' + (trash ? '.away' : ''), { tabindex: trash ? null : '0', role: trash ? null : 'link', 'aria-label': b.title, onclick: (e) => { if (!trash && !e.composedPath().some((x) => x.localName === 'sav-dropdown')) go('#/n/' + b.id); }, onkeydown: (e) => { if (!trash && e.key === 'Enter' && e.target === e.currentTarget) go('#/n/' + b.id); } },
      h('div.cwrap', cover(b)), h('div.cinfo', h('div', h('b', b.title), h('small', info)), menu));
  };

  function draw() {
    let nbs = S.notebooks.filter((b) => !!b.trashed === trash && (!q || b.title.toLowerCase().includes(q)));
    nbs = nbs.sort(sort === 'title' ? (a, b) => a.title.localeCompare(b.title, getLang()) : sort === 'opened' ? (a, b) => String(b.opened || '').localeCompare(String(a.opened || '')) : (a, b) => String(b.updated).localeCompare(String(a.updated)));
    const head = h('div.hhead', h('h1', trash ? t('trash') : q ? t('results_for', { q }) : t('my_notebooks')), h('span.spacer'),
      trash ? (nbs.length ? btn(t('empty_trash'), { icon: 'trash', size: 'sm', variant: 'danger', appearance: 'soft', onclick: async () => { if (!(await confirm(t('empty_trash'), t('empty_trash_t'), t('delete_forever')))) return; await api('nb.empty_trash', {}); S.notebooks = S.notebooks.filter((b) => !b.trashed); draw(); } }) : null)
        : [drop(h('sav-button', { caret: true, appearance: 'ghost', variant: 'neutral', size: 'sm' }, t('sort_' + sort)), ['updated', 'opened', 'title'].map((k) => ['', t('sort_' + k), () => { sort = k; setPrefs({ sort }).catch(() => {}); draw(); }, { check: sort === k }]), { placement: 'bottom-end' }),
          iconBtn(asList ? 'layout-grid' : 'list', t(asList ? 'as_grid' : 'as_list'), () => { asList = !asList; setPrefs({ list: asList }).catch(() => {}); draw(); }),
          btn(t('open_file'), { size: 'sm', icon: 'file-up', appearance: 'outline', variant: 'neutral', onclick: pickFile })]);
    // the search of actions (⌘J / Ctrl+J)
    commands([t('new_l'), [['plus', t('new_notebook'), () => newNotebook()], ...TEMPLATES.map(([k, ic, s]) => [ic, t('t_' + k), () => quick(k, s)]), ['file-up', t('open_file'), () => pickFile()]]],
      [t('home'), [['notebook', t('my_notebooks'), '#/'], ['trash', t('trash'), '#/trash']]],
      [t('recent'), S.notebooks.filter((b) => !b.trashed).slice(0, 80).map((b) => ['notebook', b.title, '#/n/' + b.id])]);
    // as in SavDocuments and SavPresentations: the title, the box to start a new one, then "Recent"
    put(list, head, trash || q ? null : starts, !trash && !q && nbs.length ? h('h2', t('recent')) : null, trash ? h('p.muted.tnote', t('trash_t', { n: S.trashDays })) : null,
      nbs.length ? h('div.' + (asList ? 'rows' : 'shelf'), nbs.map(card))
        : trash ? empty('trash', t('trash_empty'), '') : q ? empty('search', t('nothing_found'), '') : empty('notebook', t('none_yet'), t('none_yet_t')));
  }

  const it = (v, ic, label) => { const x = item(v, ic, label); x.toggleAttribute('current', (v === 'trash') === trash); return x; };
  const menu = h('sav-menu', { label: t('my_notebooks'), selectable: true }, it('all', 'notebook', t('my_notebooks')), it('trash', 'trash', t('trash')));
  menu.addEventListener('sav-select', (e) => go(e.detail.value === 'trash' ? '#/trash' : '#/'));
  const nav = h('nav.hside', { 'aria-label': t('my_notebooks') }, primary(t('new_l'), { icon: 'plus', size: 'lg', block: true, class: 'newbtn', onclick: () => newNotebook() }), menu);
  // phones and tablets: the places in the bar at the bottom of SavOffice (the menu on the side is left out)
  const bnav = window.SavOffice?.bottomNav?.({ label: t('my_notebooks'), current: trash ? 'trash' : 'all', items: [{ value: 'all', icon: 'notebook', label: t('my_notebooks'), href: '#/' }, { value: 'trash', icon: 'trash', label: t('trash'), href: '#/trash' }] });
  put(root, h('div.home', h('header.htop', brand(), h('div.hsearch', search), h('div.spacer'), userMenu()),
    h('div.hbody', nav, h('main.hmain', list)), credit(), bnav));
  document.title = (trash ? t('trash') + ' – ' : '') + 'SavNotes';
  draw();
}
