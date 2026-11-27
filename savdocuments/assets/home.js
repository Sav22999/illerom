/** Home: documents, folders, templates, shared ones, trash. */
import { ask, btn, confirm, copyText, dialog, drop, empty, fail, h, icon, iconBtn, item, mobile, primary, put, select, tile, toast } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { S, api, keep, local, offline } from './store.js';
import { brand, commands, credit, go, prefs, setPrefs, settings, userMenu } from './account.js';
import { catName, fromTemplate, TEMPLATES, TPL_CATS, tplName } from './templates.js';
import { LOOKS, SIZES } from './settings.js';
import { fluidMini } from './thumbs.js';
import { importFile } from './actions.js';
import { reportDialog, shareDialog } from './share.js';
import { can } from './actions.js';
import { download, fileName, imageIds, toEpub, toHtml, toMarkdown, toSavdoc, toText } from './files.js';

const tplDoc = (id) => fromTemplate(id, id === 'blank' ? prefs().defaults || {} : {});
const imgUrl = (id) => `api/?r=img&id=${id}`;

export async function create(tp, { folder, title, over } = {}) {
  const d = { title: title || (tp === 'blank' ? t('untitled') : tplName(tp)), ...fromTemplate(tp, prefs().defaults || {}, over || {}) };
  const id = await keep(d, { folder });
  // the general access chosen in the settings for new documents
  const p = prefs();
  if (p.access === 'link' && !id.startsWith('local-')) await api('share.visibility', { doc: id, visibility: 'link', role: p.linkRole || 'viewer' }).catch(() => {});
  go('#/d/' + id);
}
/** The pages of the fan on the first page: real templates, the title on top (it is the part that shows). */
export const heroPages = () => ['report', 'flyer', 'cv', 'letter', 'invoice', 'recipe', 'invite'].filter((k) => TEMPLATES[k]).map((k) => fluidMini(tplDoc(k)));
export const tplCard = (id, onclick, o = {}) => tile(tplName(id), onclick, { class: 'tpl', 'data-t': id, ...o }, h('div.tthumb', id === 'blank' ? h('div.mini-wrap.blankt', icon('plus')) : fluidMini(tplDoc(id))), h('span', tplName(id)));

/** New document: name, template, page, look, folder. */
export function newDialog(folders, folder, start = 'blank', mine = []) {
  let chosen = start, size = '', land = '', look = '';
  const name = h('sav-input', { label: t('rename_doc'), placeholder: t('untitled'), maxlength: 160, autofocus: true }), fol = folders?.length ? select(t('folder_l'), [['', t('no_folder')], ...folders.map((f) => [String(f.id), f.name])], folder ? String(folder) : '', null, { size: 'md' }) : null;
  const grid = h('div.tplpick'), cards = {};
  const cat = h('sav-chip-group', { label: t('templates'), required: true, value: 'all' }, h('sav-chip', { value: 'all', selected: true }, t('all')), mine.length ? h('sav-chip', { value: 'mine' }, t('my_templates')) : null, TPL_CATS.map((c) => h('sav-chip', { value: c }, catName(c))));
  const mark = () => Object.entries(cards).forEach(([k, c]) => c.classList.toggle('on', k === chosen));
  for (const d of mine) grid.append((cards[d.id] = tile(d.title, () => { chosen = d.id; mark(); }, { class: 'tpl', 'data-c': 'mine' }, h('div.tthumb', d.pv ? fluidMini(d.pv, imgUrl) : h('div.mini-wrap', { style: 'aspect-ratio:210/297' })), h('span', d.title))));
  for (const id of Object.keys(TEMPLATES)) grid.append((cards[id] = tplCard(id, () => { chosen = id; mark(); }, { 'data-c': TEMPLATES[id].cat })));
  cat.addEventListener('change', (e) => { const v = e.detail?.value || cat.value || 'all'; for (const c of grid.children) c.hidden = v !== 'all' && c.dataset.c !== v; });
  mark();
  const run = async () => {
    const title = name.value.trim();
    if (!TEMPLATES[chosen]) { const r = await api('doc.duplicate', { doc: chosen, title: title || mine.find((x) => x.id === chosen)?.title }); if (fol?.value) await api('doc.move', { doc: r.doc.id, folder: +fol.value }); go('#/d/' + r.doc.id); return; }
    await create(chosen, { title, folder: fol?.value ? +fol.value : undefined, over: { ...(look ? LOOKS[look] : {}), ...(size ? { size } : {}), ...(land ? { landscape: land === '1' } : {}) } });
  };
  const d = dialog({ title: t('new_doc'), width: '58rem', cls: 'newdlg', body: h('div.form', h('div.grid2', name, fol), cat, grid, h('div.grid3', select(t('o_size'), [['', t('of_template')], ...Object.keys(SIZES).map((k) => [k, `${k} · ${SIZES[k].join(' × ')} mm`])], '', (v) => { size = v; }, { size: 'md' }), select(t('o_orient'), [['', t('of_template')], ['0', t('portrait')], ['1', t('landscape')]], '', (v) => { land = v; }, { size: 'md' }), select(t('look'), [['', t('of_template')], ...Object.keys(LOOKS).map((k) => [k, t('look_' + k)])], '', (v) => { look = v; }, { size: 'md' }))), actions: [{ label: t('cancel') }, { label: t('create'), icon: 'plus', primary: true, run }] });
  grid.addEventListener('dblclick', () => d.primary.click());
  setTimeout(() => grid.querySelector('.on')?.scrollIntoView({ block: 'nearest' }), 250);
}

export async function home(root, view = '', arg = '') {
  const docs = [], folders = [], previews = new Map(), space = { used: 0, quota: 0 };
  const main = h('main.hmain'), side = h('nav.hside', { 'aria-label': t('home') });
  let mode = prefs().view || 'grid', sort = prefs().sort || 'updated', term = '', locals = [];
  const q = h('sav-input', { type: 'search', placeholder: t('search_docs'), 'aria-label': t('search'), clearable: true, pill: true }, icon('search', { slot: 'prefix' }));
  q.addEventListener('input', () => { term = q.value.trim().toLowerCase(); draw(); });
  q.addEventListener('sav-clear', () => { term = ''; draw(); });
  put(root, h('div.home', h('header.htop', brand(), h('div.hsearch', q), h('div.spacer'), userMenu()), h('div.hbody', side, main), credit()));
  put(main, h('div.wait', h('sav-spinner', { style: 'font-size:2rem' })));

  /** The list comes from the account, or (offline) from the copy of the last visit. */
  async function load() {
    locals = await local.list().catch(() => []);
    let d;
    try {
      d = await api('doc.list');
      S.offline = false;
      offline.put('list', d);
    } catch (e) {
      if (e.code !== 'network') throw e;
      d = (await offline.get('list')) || { docs: [], folders: [] };
      S.offline = true;
    }
    docs.splice(0, docs.length, ...d.docs);
    folders.splice(0, folders.length, ...d.folders);
    Object.assign(space, { used: d.used || 0, quota: d.quota || 0 });
    if (S.offline) { const have = new Set(await offline.docs()); for (const x of docs) x.away = !have.has(x.id); }
  }
  const reload = async () => { await load(); draw(); };
  await load();
  // documents written offline go to the account as soon as there is a connection; the recent ones are kept for the next time
  const sendLocals = async () => { const mine = locals.filter((l) => l.user && l.user === S.user?.id); if (S.offline || !mine.length) return; for (const l of mine) await toAccount(l.id).catch(() => {}); reload(); };
  sendLocals();
  setTimeout(() => offline.warm(docs.filter((d) => !d.deleted).sort((a, b) => ((b.opened || b.updated) > (a.opened || a.updated) ? 1 : -1))), 1500);
  // the editor is loaded ahead, so it opens even if the connection goes away (the service worker keeps it for the next visits)
  setTimeout(() => import('./write.js').catch(() => {}), 2500);
  const onLine = () => reload().then(sendLocals).catch(() => {});
  addEventListener('online', onLine);

  const V = { '': ['my_docs', 'layout-grid', () => docs.filter((d) => d.mine && !d.deleted)], starred: ['starred', 'star', () => docs.filter((d) => d.starred && !d.deleted)], shared: ['shared', 'users', () => docs.filter((d) => !d.mine)], templates: ['templates', 'layout-template', () => []], trash: ['trash', 'trash', () => docs.filter((d) => d.mine && d.deleted)] };
  const folder = view === 'f' ? folders.find((f) => f.id === +arg) : null;
  if (view !== 'f' && !V[view]) view = '';

  // previews are asked only for what is seen, a few at a time
  const wanted = new Set();
  let pvT = 0;
  const seen = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { seen.unobserve(e.target); wanted.add(e.target); } clearTimeout(pvT); pvT = setTimeout(ask24, 60); }, { rootMargin: '200px' });
  async function ask24() {
    const list = [...wanted].slice(0, 24);
    if (!list.length) return;
    list.forEach((x) => wanted.delete(x));
    let got = {};
    try { got = (await api('doc.previews', undefined, { ids: list.map((x) => x.dataset.id).join(',') })).previews; } catch { for (const x of list) { const c = await offline.get('doc:' + x.dataset.id); if (c) got[x.dataset.id] = { settings: c.content.settings, blocks: c.content.blocks.slice(0, 12).map((b) => b.h) }; } }
    for (const x of list) { const pv = got[x.dataset.id]; previews.set(x.dataset.id, pv || null); if (pv) x.replaceWith(fluidMini(pv, imgUrl)); }
    if (wanted.size) ask24();
  }
  const thumb = (d) => { const pv = d.pv || previews.get(d.id); if (pv) return fluidMini(pv, d.local ? null : imgUrl); const b = h('div.mini-wrap.nopv', { 'data-id': d.id, style: 'aspect-ratio:210/297' }, icon('file-text')); if (!d.local) seen.observe(b); return b; };

  function drawSide() {
    const it = (v, n) => { const x = item(v, V[v][1], t(V[v][0])); x.toggleAttribute('current', view === v && !folder); if (n) x.append(h('sav-badge', { slot: 'suffix', appearance: 'soft', variant: 'neutral', pill: true }, String(n))); return x; };
    const menu = h('sav-menu', { label: t('home'), selectable: true }, it(''), it('starred', docs.filter((d) => d.starred && !d.deleted).length), it('shared', docs.filter((d) => !d.mine).length), it('templates'), it('trash', docs.filter((d) => d.mine && d.deleted).length));
    menu.addEventListener('sav-select', (e) => go('#/' + e.detail.value));
    const tree = h('sav-tree', { label: t('folders'), selectable: true }, folders.map((f) => h('sav-tree-item', { label: f.name, value: f.id, icon: 'folder', 'icon-open': 'folder-open', selected: folder?.id === f.id || null, 'data-folder': f.id })));
    tree.addEventListener('sav-select', (e) => go('#/f/' + e.detail.value));
    const pct = space.quota ? Math.min(100, (space.used / space.quota) * 100) : 0;
    put(side, primary(t('new_l'), { icon: 'plus', size: 'lg', block: true, class: 'newbtn', onclick: () => { newDialog(folders, folder?.id, 'blank', mineTpl()); } }), menu,
      h('div.navh', h('sav-label', { appearance: 'plain', case: 'normal', variant: 'neutral' }, t('folders')), S.offline ? null : iconBtn('folder-plus', t('new_folder'), () => newFolder())), folders.length ? tree : h('small.muted.nofold', t('folders_empty')),
      space.quota ? h('div.quota', h('sav-progress-bar', { value: pct, style: '--height:6px', label: t('space') }), h('small', t('space_used', { a: bytes(space.used), b: bytes(space.quota) }))) : null);
    for (const el of tree.querySelectorAll('[data-folder]')) dropOn(el, +el.dataset.folder);
    dropOn(menu.firstElementChild, null);
  }
  async function newFolder() { const n = await ask(t('new_folder'), t('folder_name'), '', t('create')); if (n) { await api('folder.create', { name: n }); reload(); } }
  /** A document dragged onto a folder (or onto "My documents") moves there. */
  function dropOn(el, id) {
    if (!el) return;
    el.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/sd-doc')) { e.preventDefault(); el.classList.add('over'); } });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', async (e) => { e.preventDefault(); el.classList.remove('over'); const pid = e.dataTransfer.getData('text/sd-doc'); if (pid) { try { await api('doc.move', { doc: pid, folder: id }); toast(t('moved'), 'success'); reload(); } catch (x) { fail(x); } } });
  }
  const mineTpl = () => (prefs().templates || []).map((id) => docs.find((d) => d.id === id && !d.deleted)).filter(Boolean).map((d) => ({ ...d, pv: previews.get(d.id) }));
  const SORT = { updated: (a, b) => (a.updated < b.updated ? 1 : -1), opened: (a, b) => ((a.opened || a.updated) < (b.opened || b.updated) ? 1 : -1), name: (a, b) => a.title.localeCompare(b.title, getLang(), { numeric: true }), words: (a, b) => (b.words || 0) - (a.words || 0) };
  const QUICK = ['blank', 'letter', 'report', 'minutes', 'essay', 'cv', 'invoice', 'flyer'];

  function draw() {
    drawSide();
    // the search of actions (⌘J / Ctrl+J): new from a template, the views and folders, the documents to open
    commands([t('new_l'), [['plus', t('new_doc'), () => newDialog(folders, folder?.id, 'blank', mineTpl())], ...Object.keys(TEMPLATES).map((id) => ['file-text', tplName(id), () => newDialog(folders, folder?.id, id, mineTpl()), null, catName(TEMPLATES[id].cat)]), ['file-up', t('open_file'), () => importFile(folder?.id)]]],
      [t('home'), [...Object.keys(V).map((v) => [V[v][1], t(V[v][0]), '#/' + v]), ...folders.map((f) => ['folder', f.name, '#/f/' + f.id, null, t('folders')])]],
      [t('recent'), docs.filter((d) => !d.deleted).slice(0, 80).map((d) => ['file-text', d.title, () => go('#/d/' + d.id), null, d.mine ? '' : d.owner || ''])]);
    let list = term ? docs.filter((d) => !d.deleted && (d.title + ' ' + (d.owner || '')).toLowerCase().includes(term)) : folder ? docs.filter((d) => d.mine && !d.deleted && d.folder === folder.id) : V[view][2]();
    list = [...list].sort(SORT[sort] || SORT.updated);
    const title = term ? t('search') : folder ? folder.name : t(V[view][0]);
    const sortMenu = drop(h('sav-button', { appearance: 'ghost', variant: 'neutral', size: 'sm', caret: true }, t('sort_' + sort)), () => ['updated', 'opened', 'name', 'words'].map((k) => [null, t('sort_' + k), () => { sort = k; setPrefs({ sort: k }).catch(() => {}); draw(); }, { check: sort === k }]), { placement: 'bottom-end' });
    const viewBtn = iconBtn(mode === 'grid' ? 'list' : 'layout-grid', t(mode === 'grid' ? 'view_list' : 'view_grid'), () => { mode = mode === 'grid' ? 'list' : 'grid'; setPrefs({ view: mode }).catch(() => {}); draw(); });
    const head = h('div.hhead', h('h1', title), folder ? folderMenu(folder) : null, h('div.spacer'),
      view === 'templates' && !term ? null : [sortMenu, viewBtn],
      view === 'trash' && !term ? (list.length ? btn(t('empty_trash'), { size: 'sm', variant: 'danger', appearance: 'outline', onclick: async () => { if (!(await confirm(t('empty_trash'), t('empty_trash_t', { n: list.length }), t('delete_forever')))) return; try { await api('doc.empty_trash', {}); } catch (e) { fail(e); } reload(); } }) : null)
        : btn(t('open_file'), { size: 'sm', icon: 'file-up', appearance: 'outline', variant: 'neutral', onclick: () => importFile(folder?.id) }));
    const body = [];
    if (S.offline) body.push(h('sav-alert.offbar', { variant: 'warning', heading: t('offline_on') }, t('offline_on_t')));
    if (locals.length && !term && view === '') body.push(h('section', h('h2', t(S.offline ? 'waiting_net' : 'on_device')), S.offline ? null : h('p.muted.small.tnote', t('on_device_t')), h('div.grid', locals.map((l) => card({ id: l.id, title: l.title, local: true, mine: true, updated: new Date(l.updated).toISOString(), words: null, pv: { settings: l.content.settings, blocks: l.content.blocks.map((b) => b.h) } })))));
    if (view === 'templates' && !term) body.push(...templates());
    else {
      if (view === '' && !term && !folder) body.push(h('sav-card.quick', { appearance: 'elevated' }, h('div.qhead', h('h2', t('start_doc')), btn(t('all_templates'), { size: 'sm', appearance: 'ghost', 'icon-end': 'arrow-right', onclick: () => go('#/templates') })), h('div.qrow', QUICK.slice(0, mobile() ? 6 : 8).map((k) => tplCard(k, (e) => { const c = e.currentTarget; if (c.dataset.busy) return; c.dataset.busy = 1; create(k).catch((x) => { delete c.dataset.busy; fail(x); }); })))));
      if (view === '' && !term && !folder && list.length) body.push(h('h2', t('recent')));
      if (view === 'trash' && !term) body.push(h('p.muted.small.tnote', t('trash_note')));
      if (list.length) body.push(h(mode === 'grid' ? 'div.grid' : 'div.rows', list.map(card)));
      else body.push(empty(view === 'trash' && !term ? 'trash' : view === 'shared' ? 'users' : 'file-text', t(term ? 'empty_search' : view === 'trash' ? 'trash_is_empty' : view === 'shared' ? 'empty_shared' : 'empty_docs'), term || view === 'trash' || view === 'shared' ? '' : t('empty_docs_text'), view === 'trash' || view === 'shared' || term ? null : primary(t('new_l'), { icon: 'plus', onclick: () => newDialog(folders, folder?.id, 'blank', mineTpl()) })));
    }
    put(main, head, body);
  }
  function templates() {
    const mine = mineTpl(), use = (id) => newDialog(folders, null, id, mine);
    return [h('p.muted', t('templates_n', { n: Object.keys(TEMPLATES).length })), ...TPL_CATS.flatMap((c) => [h('h2', catName(c)), h('div.grid.tpls', Object.keys(TEMPLATES).filter((k) => TEMPLATES[k].cat === c).map((k) => tplCard(k, () => use(k))))]), h('h2', t('my_templates')), mine.length ? h('div.grid.tpls', mine.map((d) => tile(d.title, () => use(d.id), { class: 'tpl' }, h('div.tthumb', thumb(d)), h('span', d.title)))) : h('p.muted', t('my_templates_hint'))];
  }
  function folderMenu(f) {
    return drop(h('sav-button', { icon: 'ellipsis', label: t('more'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true }), [['pencil', t('rename'), async () => { const n = await ask(t('rename'), t('folder_name'), f.name); if (n) { await api('folder.rename', { id: f.id, name: n }); reload(); } }], '-', ['trash', t('delete'), async () => { if (await confirm(f.name, t('folder_delete_text'), t('delete'))) { await api('folder.delete', { id: f.id }); go('#/'); } }, { danger: true }]]);
  }
  const info = (d) => [d.mine === false ? d.owner : null, d.local ? null : when(d.updated), d.words !== null && d.words !== undefined ? `${d.words.toLocaleString(getLang())} ${t(d.words === 1 ? 'word' : 'words')}` : null, d.suspended ? t('suspended') : null, d.away ? t('not_offline') : null].filter(Boolean).join(' · ');
  const stop = (n) => { n.addEventListener('click', (e) => e.stopPropagation()); n.addEventListener('keydown', (e) => e.stopPropagation()); return n; };
  // the favourite button of SavComponents, the same in SavPresentations and SavSchedules: the star fills when it is on
  const star = (d) => {
    if (d.local || d.deleted) return null;
    const b = stop(h('sav-favourite-button.starb', { icon: 'star', appearance: 'ghost', size: 'sm', label: t('starred'), pressed: !!d.starred, class: d.starred ? 'on' : '' }));
    b.addEventListener('change', async (e) => { const on = !!e.detail?.pressed; d.starred = on; b.classList.toggle('on', on); try { await api('doc.star', { doc: d.id, on }); } catch (x) { d.starred = !on; fail(x); } setTimeout(draw, 300); });
    return b;
  };
  const more = (d) => stop(drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true }), () => cardMenu(d), { placement: 'bottom-end', label: d.title }));
  const open = async (d) => {
    if (d.deleted) { if (await confirm(t('in_trash'), t('in_trash_t'), t('restore'), false)) { await api('doc.restore', { doc: d.id }).catch(fail); reload(); } return; }
    go('#/d/' + d.id);
  };
  function card(d) {
    const th = h('div.cthumb', thumb(d), d.visibility === 'link' && !d.deleted ? h('sav-icon.cglobe', { name: 'globe', label: t('v_link'), title: t('v_link') }) : null, d.people > 0 ? h('sav-icon.cglobe', { name: 'users', label: t('sh_people'), title: t('sh_people'), class: d.visibility === 'link' ? 'second' : '' }) : null, d.suspended ? h('sav-badge.cbadge', { variant: 'danger' }, t('suspended')) : null);
    const c = tile(d.title, (e) => { if (!e.target.closest?.('sav-dropdown, .starb')) open(d); }, { class: 'card' + (d.away ? ' away' : ''), draggable: d.mine && !d.deleted && !d.local ? 'true' : null }, th, h('div.cinfo', h('div', h('b', d.title), h('small', info(d))), star(d), more(d)));
    c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/sd-doc', d.id); e.dataTransfer.effectAllowed = 'move'; });
    return c;
  }
  function cardMenu(d) {
    const act = (r, b, msg) => api(r, { doc: d.id, ...b }).then(() => { if (msg) toast(msg, 'success'); return reload(); }).catch(fail);
    if (d.local) return [['file-text', t('open'), () => open(d)], S.offline ? null : ['cloud-upload', t('save_account'), () => toAccount(d.id).then(reload)], '-', ['trash', t('delete_forever'), async () => { if (await confirm(d.title, t('delete_sure'), t('delete'))) { await local.remove(d.id); reload(); } }, { danger: true }]];
    if (d.deleted) return [['rotate-cw', t('restore'), () => act('doc.restore')], ['trash', t('delete_forever'), async () => { if (await confirm(t('delete_forever'), t('delete_sure'), t('delete_forever'))) await act('doc.delete'); }, { danger: true }]];
    const isT = (prefs().templates || []).includes(d.id), own = d.mine;
    return [['file-text', t('open'), () => open(d)], own ? ['share-2', t('share'), () => shareDialog({ pid: d.id, title: d.title })] : null, can(d.role, 'editor') ? ['pencil', t('rename'), async () => { const n = await ask(t('rename'), t('rename_doc'), d.title); if (n) await act('doc.rename', { title: n }); }] : null, ['copy', t('duplicate'), () => act('doc.duplicate', { title: `${t('copy_of')} ${d.title}`.slice(0, 160) })], own ? ['folder', t('move_to'), () => moveDialog(d)] : null,
      own ? ['layout-template', t(isT ? 'not_template' : 'as_template'), async () => { const l = new Set(prefs().templates || []); if (isT) l.delete(d.id); else l.add(d.id); await setPrefs({ templates: [...l].slice(-30) }); toast(t(isT ? 'settings_saved' : 'as_template_done'), 'success'); draw(); }] : null,
      ['download', t('download'), () => downloadDialog(d)], ['link', t('copy_link'), () => copyText(`${location.origin}${location.pathname}#/d/${d.id}`, t('link_copied'))], own ? null : ['flag', t('report'), () => reportDialog(d.id)], '-',
      own ? ['trash', t('to_trash'), () => act('doc.trash', {}, t('moved_trash')), { danger: true }] : ['log-out', t('leave'), () => act('doc.leave'), { danger: true }]];
  }
  function moveDialog(d) { const s = select(t('folders'), [['', t('no_folder')], ...folders.map((f) => [String(f.id), f.name])], d.folder ? String(d.folder) : '', null, { size: 'md' }); dialog({ title: t('move_to'), width: '26rem', body: s, actions: [{ label: t('cancel') }, { label: t('apply'), primary: true, run: async () => { await api('doc.move', { doc: d.id, folder: s.value ? +s.value : null }); reload(); } }] }); }
  draw();
  document.title = (folder ? folder.name : t(V[view][0])) + ' – SavDocuments';
  return () => { seen.disconnect(); removeEventListener('online', onLine); };
}

const bytes = (n) => (n < 1e6 ? `${Math.round(n / 1e3)} KB` : n < 1e9 ? `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)} MB` : `${(n / 1e9).toFixed(1)} GB`).replace('.', getLang() === 'it' ? ',' : '.');

/** Download from the home, without opening the document: the formats that do not need the pages on screen. */
function downloadDialog(d) {
  const run = async (kind) => {
    const n = toast(t('preparing'), 'neutral', { duration: 0 });
    try {
      const g = await api('doc.get', undefined, { doc: d.id, quiet: 1 }), images = {};
      for (const id of imageIds(g.content.blocks)) { const r = await fetch(imgUrl(id)).catch(() => null); if (r?.ok) images[id] = await r.blob(); }
      const b = { title: g.doc.title, settings: g.content.settings, blocks: g.content.blocks, images };
      const make = { docx: async () => (await import('./docx.js')).toDocx(b), savdoc: () => toSavdoc(b), html: () => toHtml(b), epub: () => toEpub(b), md: () => toMarkdown(b), txt: () => toText(b) };
      download(await make[kind](), fileName(b.title, kind));
    } catch (e) { fail(e); } finally { n.remove(); }
  };
  const k = (kind, ic, label) => tile(label, () => { dl.hide(); run(kind); }, { class: 'dlk' }, h('div.bigt', icon(ic), label));
  const dl = dialog({ title: t('download'), width: '30rem', body: h('div.form', h('p.muted', d.title), h('div.grid3', k('docx', 'file-text', t('dl_docx')), k('savdoc', 'file-down', t('dl_savdoc')), k('epub', 'book-open', t('dl_epub')), k('html', 'globe', t('dl_html')), k('md', 'hash', t('dl_md')), k('txt', 'file', t('dl_txt')))), actions: [{ label: t('close') }] });
}

async function toAccount(id) {
  const d = await local.get(id), images = {};
  for (const i of d.images || []) { const b = await local.image(i); if (b) images[i] = b; }
  await keep({ title: d.title, settings: d.content.settings, blocks: d.content.blocks, images });
  await local.remove(id);
  toast(t('saved_account'), 'success');
}
