/** Home: documents, folders, templates, shared ones, trash. */
import { ask, btn, confirm, copyText, dialog, drop, empty, fail, h, icon, iconBtn, item, primary, put, select, segmented, tile, toast } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { S, api, keep, local } from './store.js';
import { brand, credit, go, prefs, setPrefs, settings, userMenu } from './account.js';
import { catName, fromTemplate, TEMPLATES, TPL_CATS, tplName } from './templates.js';
import { LOOKS, SIZES } from './settings.js';
import { fluidMini } from './thumbs.js';
import { importFile } from './actions.js';
import { reportDialog, shareDialog } from './share.js';
import { can } from './actions.js';

const tplDoc = (id) => fromTemplate(id, id === 'blank' ? prefs().defaults || {} : {});
const imgUrl = (id) => `api/?r=img&id=${id}`;

export async function create(tp, { folder, title, over } = {}) {
  const d = { title: title || (tp === 'blank' ? t('untitled') : tplName(tp)), ...fromTemplate(tp, prefs().defaults || {}, over || {}) };
  go('#/d/' + (await keep(d, { folder })));
}
export const tplCard = (id, onclick, o = {}) => tile(tplName(id), onclick, { class: 'tpl', 'data-t': id, ...o }, h('div.stack', id === 'blank' ? h('div.mini-wrap.blankt', { style: 'aspect-ratio:210/297' }, icon('plus')) : fluidMini(tplDoc(id)), h('span.tname', tplName(id))));

/** New document: name, template, page, look, folder. */
export function newDialog(folders, folder, start = 'blank', mine = []) {
  let chosen = start, size = '', land = '', look = '';
  const name = h('sav-input', { label: t('rename_doc'), placeholder: t('untitled'), maxlength: 160, autofocus: true }), fol = folders?.length ? select(t('folder_l'), [['', t('no_folder')], ...folders.map((f) => [String(f.id), f.name])], folder ? String(folder) : '', null, { size: 'md' }) : null;
  const grid = h('div.tplpick'), cards = {};
  const cat = h('sav-chip-group', { label: t('templates'), required: true, value: 'all' }, h('sav-chip', { value: 'all', selected: true }, t('all')), mine.length ? h('sav-chip', { value: 'mine' }, t('my_templates')) : null, TPL_CATS.map((c) => h('sav-chip', { value: c }, catName(c))));
  const mark = () => Object.entries(cards).forEach(([k, c]) => c.classList.toggle('on', k === chosen));
  for (const d of mine) grid.append((cards[d.id] = tile(d.title, () => { chosen = d.id; mark(); }, { class: 'tpl', 'data-c': 'mine' }, h('div.stack', d.pv ? fluidMini(d.pv, imgUrl) : h('div.mini-wrap', { style: 'aspect-ratio:210/297' }), h('span.tname', d.title)))));
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
  const docs = [], folders = [], previews = new Map();
  const main = h('main.hmain'), side = h('nav.hside', { 'aria-label': t('home') });
  let mode = prefs().view || 'grid', sort = prefs().sort || 'updated', term = '';
  const q = h('sav-input', { type: 'search', placeholder: t('search_docs'), 'aria-label': t('search'), clearable: true, pill: true }, icon('search', { slot: 'prefix' }));
  q.addEventListener('input', () => { term = q.value.trim().toLowerCase(); draw(); });
  q.addEventListener('sav-clear', () => { term = ''; draw(); });
  put(root, h('div.home', h('header.htop', brand(), h('div.hsearch', q), h('div.spacer'), S.user ? null : iconBtn('settings', t('settings'), () => settings()), S.user ? userMenu() : btn(t('sign_in'), { size: 'sm', href: '#/signin' })), h('div.hbody', side, main), credit()));
  const locals = await local.list().catch(() => []);
  if (S.user) { put(main, h('div.wait', h('sav-spinner', { style: 'font-size:2rem' }))); const d = await api('doc.list'); docs.push(...d.docs); folders.push(...d.folders); }
  const reload = async () => { const d = S.user ? await api('doc.list') : null; if (d) { docs.splice(0, docs.length, ...d.docs); folders.splice(0, folders.length, ...d.folders); } locals.splice(0, locals.length, ...(await local.list().catch(() => []))); draw(); };
  const V = { '': ['all_docs', 'layout-grid', () => docs.filter((d) => d.mine && !d.deleted)], recent: ['recent', 'clock', () => docs.filter((d) => d.opened && !d.deleted)], starred: ['starred', 'star', () => docs.filter((d) => d.starred && !d.deleted)], shared: ['shared', 'users', () => docs.filter((d) => !d.mine)], templates: ['templates', 'layout-template', () => []], local: ['on_device', 'smartphone', () => locals.map((d) => ({ id: d.id, title: d.title, local: true, updated: new Date(d.updated).toISOString(), words: null, pv: { settings: d.content.settings, blocks: d.content.blocks } }))], trash: ['trash', 'trash', () => docs.filter((d) => d.mine && d.deleted)] };
  if (!S.user && view !== 'templates') view = 'local';
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
    try { const r = await api('doc.previews', undefined, { ids: list.map((x) => x.dataset.id).join(',') }); for (const x of list) { const pv = r.previews[x.dataset.id]; previews.set(x.dataset.id, pv || null); if (pv) x.replaceWith(fluidMini(pv, imgUrl)); } } catch { /* the cards stay without a picture */ }
    if (wanted.size) ask24();
  }
  const thumb = (d) => { const pv = d.pv || previews.get(d.id); if (pv) return fluidMini(pv, d.local ? null : imgUrl); const b = h('div.mini-wrap.nopv', { 'data-id': d.id, style: 'aspect-ratio:210/297' }, icon('file-text')); if (!d.local) seen.observe(b); return b; };

  function drawSide() {
    const it = (v, n) => { const x = item(v, V[v][1], t(V[v][0])); x.toggleAttribute('current', view === v && !folder); if (n) x.append(h('sav-badge', { slot: 'suffix', appearance: 'soft', variant: 'neutral', pill: true }, String(n))); return x; };
    const menu = h('sav-menu', { label: t('home'), selectable: true }, S.user ? [it(''), it('recent'), it('starred', docs.filter((d) => d.starred && !d.deleted).length), it('shared', docs.filter((d) => !d.mine).length)] : null, it('templates'), locals.length || !S.user ? it('local', locals.length) : null, S.user ? it('trash') : null);
    menu.addEventListener('sav-select', (e) => go('#/' + e.detail.value));
    const tree = h('sav-tree', { label: t('folders'), selectable: true }, folders.map((f) => h('sav-tree-item', { label: f.name, value: f.id, icon: 'folder', selected: folder?.id === f.id })));
    tree.addEventListener('sav-select', (e) => go('#/f/' + e.detail.value));
    put(side, primary(t('new_l'), { icon: 'plus', size: 'lg', block: true, class: 'newbtn', onclick: () => { newDialog(folders, folder?.id, 'blank', mineTpl()); } }), menu, S.user ? h('div.nhead', t('folders'), iconBtn('folder-plus', t('new_folder'), async () => { const n = await ask(t('new_folder'), t('folder_name'), '', t('create')); if (n) { await api('folder.create', { name: n }); reload(); } })) : null, folders.length ? tree : S.user ? h('p.muted.hint', t('folders_empty')) : null);
  }
  const mineTpl = () => (prefs().templates || []).map((id) => docs.find((d) => d.id === id && !d.deleted)).filter(Boolean).map((d) => ({ ...d, pv: previews.get(d.id) }));
  const SORT = { updated: (a, b) => (a.updated < b.updated ? 1 : -1), name: (a, b) => a.title.localeCompare(b.title, getLang(), { numeric: true }), opened: (a, b) => ((a.opened || '') < (b.opened || '') ? 1 : -1), words: (a, b) => (b.words || 0) - (a.words || 0) };

  function draw() {
    drawSide();
    if (view === 'templates' && !term) return drawTemplates();
    const list = (term ? [...docs.filter((d) => !d.deleted), ...V.local[2]()].filter((d) => d.title.toLowerCase().includes(term)) : folder ? docs.filter((d) => d.mine && !d.deleted && d.folder === folder.id) : V[view][2]()).sort(view === 'recent' && sort === 'updated' ? SORT.opened : SORT[sort]);
    const starts = !term && (['', 'local', 'recent'].includes(view) || folder), name = term ? t('search') : folder ? folder.name : t(V[view][0]);
    const tools = h('div.htools', folder ? drop(h('sav-button', { icon: 'ellipsis', label: t('more'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true }), [['pencil', t('rename'), async () => { const n = await ask(t('rename'), t('folder_name'), folder.name); if (n) { folder.name = n; await api('folder.rename', { id: folder.id, name: n }); reload(); } }], ['trash', t('delete'), async () => { if (await confirm(folder.name, t('folder_delete_text'), t('delete'))) { await api('folder.delete', { id: folder.id }); go('#/'); } }, { danger: true }]]) : null,
      h('div.w9', select(null, [['updated', t('sort_updated')], ['name', t('sort_name')], ['words', t('sort_words')]], sort, (v) => { sort = v; setPrefs({ sort: v }).catch(() => {}); draw(); }, { 'aria-label': t('sort_by') })), segmented(t('view'), mode, [['grid', 'layout-grid', t('view_grid')], ['list', 'rows-3', t('view_list')]], (v) => { mode = v; setPrefs({ view: v }).catch(() => {}); draw(); }), view === 'trash' && !term ? (list.length ? btn(t('empty_trash'), { size: 'sm', icon: 'trash-2', variant: 'danger', appearance: 'outline', onclick: async () => { if (!(await confirm(t('empty_trash'), t('empty_trash_t', { n: list.length }), t('delete_forever')))) return; try { await api('doc.empty_trash', {}); } catch (e) { fail(e); } reload(); } }) : null) : btn(t('open_file'), { size: 'sm', icon: 'upload', onclick: () => importFile(folder?.id) }));
    put(main, starts ? h('section', h('div.lhd', h('h2', t('start_from')), h('span.grow'), btn(t('all_templates'), { size: 'sm', appearance: 'ghost', 'icon-end': 'chevron-right', onclick: () => go('#/templates') })), h('div.tps', ['blank', 'letter', 'report', 'minutes', 'essay', 'cv', 'invoice', 'flyer', 'recipe', 'invite'].map((k) => tplCard(k, (e) => { const c = e.currentTarget; if (c.dataset.busy) return; c.dataset.busy = 1; create(k, { folder: folder?.id }).catch((x) => { delete c.dataset.busy; fail(x); }); })))) : null,
      h('section', h('div.lhd', h('h2', name), view === 'trash' ? h('span.muted.small', t('trash_note')) : view === 'local' ? h('span.muted.small', t('try_hint')) : null, h('span.grow'), tools),
        list.length ? h(mode === 'grid' ? 'div.dgridv' : 'div.dlist', list.map(mode === 'grid' ? card : line)) : empty(view === 'trash' && !term ? 'trash-2' : 'file-text', t(term ? 'empty_search' : view === 'trash' ? 'trash_is_empty' : 'empty_docs'), term || view === 'trash' || view === 'shared' ? '' : t('empty_docs_text'))));
    return undefined;
  }
  const info = (d) => [d.mine === false ? d.owner : null, when(d.updated), d.words !== null ? `${d.words.toLocaleString(getLang())} ${t(d.words === 1 ? 'word' : 'words')}` : null, d.suspended ? t('suspended') : null].filter(Boolean).join(' · ');
  const badge = (d) => (d.visibility === 'link' ? icon('globe', { label: t('v_link') }) : d.people ? icon('users', { label: t('sh_people') }) : null);
  const star = (d) => (d.local || d.deleted ? null : iconBtn('star', t(d.starred ? 'unstar' : 'star'), async (b, e) => { e.stopPropagation(); d.starred = !d.starred; draw(); await api('doc.star', { doc: d.id, on: d.starred }); }, { class: d.starred ? 'starred' : '' }));
  const stop = (n) => { n.addEventListener('click', (e) => e.stopPropagation()); n.addEventListener('keydown', (e) => e.stopPropagation()); return n; };
  const more = (d) => stop(drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true }), () => rowMenu(d), { placement: 'bottom-end', label: d.title }));
  const open = (d) => go('#/d/' + d.id);
  const card = (d) => tile(d.title, () => open(d), { class: 'doccard' }, h('div.stack', thumb(d), h('div.dcinfo', h('div.grow', h('strong', d.title), h('span.muted.small', badge(d), info(d))), stop(h('span.prow0', star(d), more(d))))));
  const line = (d) => tile(d.title, () => open(d), { class: 'docline' }, h('div.prow', h('span.fi', icon('file-text')), h('div.grow.dt', h('strong', d.title), h('span.muted.small', info(d))), badge(d), stop(h('span.prow0', star(d), more(d)))));
  function drawTemplates() {
    const mine = mineTpl(), use = (id) => newDialog(folders, null, id, mine);
    put(main, h('div.lhd', h('h2', t('templates')), h('span.muted.small', t('templates_n', { n: Object.keys(TEMPLATES).length }))), mine.length ? h('section', h('h3', t('my_templates')), h('div.tgridv', mine.map((d) => tile(d.title, () => use(d.id), { class: 'tpl' }, h('div.stack', thumb(d), h('span.tname', d.title)))))) : null, TPL_CATS.map((c) => h('section', h('h3', catName(c)), h('div.tgridv', Object.keys(TEMPLATES).filter((k) => TEMPLATES[k].cat === c).map((k) => tplCard(k, () => use(k)))))));
  }
  function rowMenu(d) {
    const act = (r, body, msg) => api(r, { doc: d.id, ...body }).then(() => { if (msg) toast(msg, 'neutral'); return reload(); });
    if (d.local) return [['pencil', t('rename'), async () => { const n = await ask(t('rename'), t('rename_doc'), d.title); if (n) { await local.put({ ...(await local.get(d.id)), title: n }); reload(); } }], S.user?.verified ? ['cloud-upload', t('save_account'), () => toAccount(d.id).then(reload)] : null, '-', ['trash', t('delete_forever'), async () => { if (await confirm(d.title, t('delete_sure'), t('delete'))) { await local.remove(d.id); reload(); } }, { danger: true }]];
    if (d.deleted) return [['rotate-ccw', t('restore'), () => act('doc.restore')], ['trash', t('delete_forever'), async () => { if (await confirm(d.title, t('delete_sure'), t('delete'))) await act('doc.delete'); }, { danger: true }]];
    const isT = (prefs().templates || []).includes(d.id);
    return [can(d.role, 'editor') ? ['pencil', t('rename'), async () => { const n = await ask(t('rename'), t('rename_doc'), d.title); if (n) await act('doc.rename', { title: n }); }] : null, ['copy', t('duplicate'), () => act('doc.duplicate', { title: `${t('copy_of')} ${d.title}`.slice(0, 160) })], d.mine ? ['folder', t('move'), () => moveDialog(d)] : null, d.mine ? ['layout-template', t(isT ? 'not_template' : 'as_template'), async () => { const l = new Set(prefs().templates || []); if (isT) l.delete(d.id); else l.add(d.id); await setPrefs({ templates: [...l].slice(-30) }); toast(t(isT ? 'settings_saved' : 'as_template_done'), 'success'); draw(); }] : null, d.mine ? ['user-plus', t('share'), () => shareDialog({ pid: d.id })] : null, ['link-2', t('copy_link'), () => copyText(`${location.origin}${location.pathname}#/d/${d.id}`, t('link_copied'))], d.mine ? null : ['flag', t('report'), () => reportDialog(d.id)], '-', d.mine ? ['trash', t('to_trash'), () => act('doc.trash', {}, t('moved_trash')), { danger: true }] : ['x', t('leave'), () => act('doc.leave'), { danger: true }]];
  }
  function moveDialog(d) { const s = select(t('folders'), [['', t('no_folder')], ...folders.map((f) => [String(f.id), f.name])], d.folder ? String(d.folder) : '', null, { size: 'md' }); dialog({ title: t('move'), width: '26rem', body: s, actions: [{ label: t('cancel') }, { label: t('apply'), primary: true, run: async () => { await api('doc.move', { doc: d.id, folder: s.value ? +s.value : null }); reload(); } }] }); }
  draw();
  return () => seen.disconnect();
}

async function toAccount(id) {
  const d = await local.get(id), images = {};
  for (const i of d.images || []) { const b = await local.image(i); if (b) images[i] = b; }
  await keep({ title: d.title, settings: d.content.settings, blocks: d.content.blocks, images });
  await local.remove(id);
  toast(t('saved_account'), 'success');
}
