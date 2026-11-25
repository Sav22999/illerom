/** Home: presentations, folders, templates, shared ones, trash. */
import { state, api, get, h, icon, btn, iconBtn, item, go, oops, ok, ago, dialog, confirmBox, promptBox, pickFile, userSetting, fmtBytes, copyText, mobile } from './core.js';
import { t, lang } from './i18n.js';
import { brand, credit, logout } from './auth.js';
import { fluidThumb } from './render.js';
import { context, FORMATS } from './themes.js';
import { fixSlide } from './model.js';
import { TEMPLATES, fromTemplate, tplName } from './templates.js';
import { openFile, downloadAs } from './files.js';
import { shareDialog } from './share.js';

export function userMenu() {
  const u = state.user;
  const d = h('sav-dropdown', { placement: 'bottom-end', 'sheet-on-mobile': true, label: u.name }, h('sav-avatar', { 'auto-text': true, slot: 'trigger', label: u.name, button: true, style: `--size:36px;background:${u.color};color:#fff;border-radius:50%` }),
    h('sav-menu-label', u.email), item('settings', 'settings', t('settings')), u.master && item('admin', 'shield', t('admin')), h('sav-divider'), item('out', 'log-out', t('sign_out')));
  d.addEventListener('sav-select', (e) => ({ settings: () => go('?p=settings'), admin: () => go('?p=admin'), out: logout })[e.detail.value]?.());
  return d;
}

const metaCtx = (c) => context({ format: c.format, theme: { colors: {}, fonts: {}, ...c.theme }, opts: {} });

export async function homeScreen(app, q) {
  document.body.classList.add('home');
  let data, view = q.get('v') || 'recent', folder = +(q.get('f') || 0), mode = userSetting('view', 'grid'), search = '', sort = 'updated';
  const main = h('main.hmain'), side = h('nav.hside', { 'aria-label': t('home') });
  const searchBox = h('sav-input', { type: 'search', placeholder: t('search_decks'), clearable: true, pill: true, oninput: (e) => { search = e.target.value.trim().toLowerCase(); draw(); }, 'onsav-clear': () => { search = ''; draw(); } }, icon('search', { slot: 'prefix' }));
  app.append(h('header.htop', brand(), h('div.hsearch', searchBox), h('div.spacer'), userMenu()), h('div.hbody', side, main), credit());

  const load = async () => { data = await get('home.list'); draw(); };
  const set = (v, f = 0) => { view = v; folder = f; history.replaceState(null, '', v === 'recent' ? './' : `?v=${v}${f ? '&f=' + f : ''}`); draw(); };

  function drawSide() {
    const it = (v, ic, label, n) => h('button.nav', { class: view === v && !folder ? 'on' : '', onclick: () => set(v), type: 'button' }, icon(ic), h('span', label), n ? h('em', n) : null);
    const tree = (parent, depth) => data.folders.filter((f) => f.parent === parent).flatMap((f) => [
      h('button.nav.fold', { type: 'button', class: folder === f.id ? 'on' : '', style: `--d:${depth}`, 'data-folder': f.id, onclick: () => set('folder', f.id) }, icon(folder === f.id ? 'folder-open' : 'folder'), h('span', f.name)), ...tree(f.id, depth + 1)]);
    const active = data.decks.filter((d) => d.status === 'active');
    side.replaceChildren(h('sav-button', { icon: 'plus', block: true, size: 'lg', class: 'newbtn', onclick: () => newDialog(folder || 0, data) }, t('new')),
      it('recent', 'layout-grid', t('my_decks')), it('shared', 'users', t('shared'), data.shared.length), it('templates', 'layout-template', t('templates')), it('trash', 'trash', t('trash'), data.decks.filter((d) => d.status === 'trashed').length),
      h('div.navh', h('span', t('folders')), iconBtn('folder-plus', t('new_folder'), () => newFolder(), { size: 'sm' })), ...tree(null, 0),
      h('div.quota', h('sav-progress-bar', { value: Math.min(100, data.used / data.quota * 100), style: '--height:6px', label: t('space') }), h('small', t('space_used', { a: fmtBytes(data.used), b: fmtBytes(data.quota) }))));
    for (const el of side.querySelectorAll('[data-folder], .nav:nth-of-type(1)')) drop(el, +(el.dataset.folder || 0));
  }
  function drop(el, id) {
    el.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/sp-deck')) { e.preventDefault(); el.classList.add('over'); } });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', async (e) => { e.preventDefault(); el.classList.remove('over'); const uid = e.dataTransfer.getData('text/sp-deck'); if (uid) try { await api('deck.move', { d: uid, folder: id }); ok(t('moved')); load(); } catch (x) { oops(x); } });
  }
  async function newFolder() { const name = await promptBox(t('new_folder'), t('name'), '', t('create'), 80); if (name) try { await api('folder.create', { name, parent: folder }); load(); } catch (e) { oops(e); } }

  function draw() {
    if (!data) return;
    drawSide();
    const f = data.folders.find((x) => x.id === folder);
    let list = view === 'shared' ? data.shared : view === 'trash' ? data.decks.filter((d) => d.status === 'trashed') : view === 'templates' ? data.decks.filter((d) => d.template && d.status !== 'trashed') : data.decks.filter((d) => d.status !== 'trashed' && !d.template && (search ? true : view === 'folder' ? d.folder === folder : true));
    if (search) list = [...(view === 'trash' ? list : [...list, ...(view === 'recent' ? data.shared : [])])].filter((d) => (d.title + ' ' + d.owner).toLowerCase().includes(search));
    list = [...list].sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title) : a[sort] < b[sort] ? 1 : -1));
    const subs = view === 'folder' ? data.folders.filter((x) => x.parent === folder) : [];
    const title = view === 'folder' ? f?.name || t('folders') : t({ recent: 'my_decks', shared: 'shared', templates: 'templates', trash: 'trash' }[view]);
    const viewBtn = iconBtn(mode === 'grid' ? 'list' : 'layout-grid', mode === 'grid' ? t('view_list') : t('view_grid'), () => { mode = mode === 'grid' ? 'list' : 'grid'; api('auth.settings', { settings: { view: mode } }).then((r) => (state.user = r.user)).catch(() => {}); draw(); });
    const sortMenu = h('sav-dropdown', { placement: 'bottom-end' }, h('sav-button', { slot: 'trigger', appearance: 'ghost', variant: 'neutral', size: 'sm', caret: true }, t('sort_' + sort)), ...['updated', 'created', 'title'].map((s) => item(s, null, t('sort_' + s))));
    sortMenu.addEventListener('sav-select', (e) => { sort = e.detail.value; draw(); });
    const head = h('div.hhead', h('h1', title), view === 'folder' && folderMenu(f), h('div.spacer'), sortMenu, viewBtn, btn(t('open_file'), async () => { const [file] = await pickFile('.savpre,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation'); if (file) openFile(file, folder); }, { icon: 'file-up', appearance: 'outline', variant: 'neutral', size: 'sm' }));
    const body = [];
    if (view === 'recent' && !search) body.push(h('section.quick', h('h2', t('start_new')), h('div.qrow', ...TEMPLATES.slice(0, mobile() ? 5 : 7).map((x) => tplCard(x, () => newDialog(0, data, x))), h('button.tpl.more', { type: 'button', onclick: () => set('templates') }, icon('layout-template'), h('span', t('all_templates'))))));
    if (view === 'templates') body.push(h('div.grid.tpls', ...TEMPLATES.map((x) => tplCard(x, () => newDialog(0, data, x)))), h('h2', t('my_templates')), !list.length && h('p.muted', t('my_templates_hint')));
    if (view === 'recent' && !search && list.length) body.push(h('h2', t('recent')));
    if (subs.length) body.push(h('div.folders', ...subs.map((x) => { const el = h('button.foldcard', { type: 'button', onclick: () => set('folder', x.id) }, icon('folder'), h('span', x.name)); drop(el, x.id); return el; })));
    if (list.length) body.push(h(`div.${mode === 'grid' || view === 'templates' ? 'grid' : 'rows'}`, ...list.map(card)));
    else if (view !== 'templates') body.push(h('sav-empty-state', { heading: t('empty_' + view), text: search ? t('empty_search') : t('empty_' + view + '_t'), icon: view === 'trash' ? 'trash' : view === 'shared' ? 'users' : 'presentation' }, view !== 'trash' && view !== 'shared' && btn(t('new'), () => newDialog(folder, data), { icon: 'plus' })));
    if (view === 'trash' && list.length) head.append(btn(t('empty_trash'), async () => { if (!(await confirmBox(t('empty_trash'), t('empty_trash_t', { n: list.length }), t('delete_forever')))) return; try { for (const d of list) await api('deck.purge', { d: d.uid }); } catch (e) { oops(e); } load(); }, { variant: 'danger', appearance: 'outline', size: 'sm' }));
    main.replaceChildren(head, ...body.filter(Boolean));
  }
  function folderMenu(f) {
    if (!f) return null;
    const d = h('sav-dropdown', h('sav-button', { slot: 'trigger', icon: 'ellipsis', appearance: 'ghost', variant: 'neutral', size: 'sm', square: true, label: t('more') }), item('new', 'folder-plus', t('new_folder')), item('ren', 'pencil', t('rename')), item('del', 'trash', t('delete'), { variant: 'danger' }));
    d.addEventListener('sav-select', async (e) => {
      try {
        if (e.detail.value === 'new') return newFolder();
        if (e.detail.value === 'ren') { const n = await promptBox(t('rename'), t('name'), f.name, t('save'), 80); if (n) await api('folder.rename', { id: f.id, name: n }); }
        if (e.detail.value === 'del') { if (!(await confirmBox(t('delete_folder'), t('delete_folder_t', { name: f.name }), t('delete')))) return; await api('folder.delete', { id: f.id }); set(f.parent ? 'folder' : 'recent', f.parent || 0); }
        load();
      } catch (x) { oops(x); }
    });
    return d;
  }
  function card(d) {
    const open = () => (d.status === 'trashed' ? toastTrash(d) : go('?d=' + d.uid));
    const menu = cardMenu(d);
    const th = h('div.cthumb', d.first ? fluidThumb(fixSlide(d.first), metaCtx(d), { index: 0, count: d.slides }) : null, d.status === 'suspended' && h('sav-badge.cbadge', { variant: 'danger' }, t('suspended')), d.access === 'link' && d.status === 'active' && h('span.cglobe', { title: t('access_link') }, icon('globe')), d.shared > 0 && h('span.cglobe.two', { title: t('shared') }, icon('users')));
    const c = h('article.card', { tabindex: 0, draggable: d.role === 'owner', onclick: (e) => { if (!e.target.closest('sav-dropdown')) open(); }, onkeydown: (e) => { if (e.key === 'Enter' && e.target === c) open(); } }, th, h('div.cinfo', h('div', h('b', d.title), h('small', d.role === 'owner' ? '' : d.owner + ' · ', t('n_slides', { n: d.slides }), ' · ', ago(d.updated))), menu));
    c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/sp-deck', d.uid); e.dataTransfer.effectAllowed = 'move'; });
    return c;
  }
  async function toastTrash(d) { if (await confirmBox(t('in_trash'), t('in_trash_t'), t('restore'), false)) try { await api('deck.restore', { d: d.uid }); load(); } catch (e) { oops(e); } }
  function cardMenu(d) {
    const own = d.role === 'owner', tr = d.status === 'trashed';
    const m = h('sav-dropdown', { placement: 'bottom-end', 'sheet-on-mobile': true, label: d.title }, h('sav-button', { slot: 'trigger', icon: 'ellipsis-vertical', appearance: 'ghost', variant: 'neutral', size: 'sm', square: true, label: t('more') }),
      ...(tr ? [item('restore', 'rotate-cw', t('restore')), item('purge', 'trash', t('delete_forever'), { variant: 'danger' })] : [item('open', 'presentation', t('open')), own && item('share', 'share-2', t('share')), (own || d.role === 'editor') && item('rename', 'pencil', t('rename')), item('copy', 'copy', t('duplicate')), own && item('move', 'folder', t('move_to')),
        own && item('tpl', 'layout-template', d.template ? t('not_template') : t('make_template')), item('dl', 'download', t('download')), h('sav-divider'), own ? item('trash', 'trash', t('move_trash'), { variant: 'danger' }) : item('leave', 'log-out', t('leave'), { variant: 'danger' })]));
    m.addEventListener('sav-select', async (e) => {
      try {
        switch (e.detail.value) {
          case 'open': return go('?d=' + d.uid);
          case 'share': return shareDialog(d.uid, d.title);
          case 'rename': { const n = await promptBox(t('rename'), t('title'), d.title); if (!n) return; await api('deck.rename', { d: d.uid, title: n }); break; }
          case 'copy': await api('deck.duplicate', { d: d.uid, title: t('copy_of', { title: d.title }) }); break;
          case 'move': { const to = await pickFolder(d.folder); if (to === null) return; await api('deck.move', { d: d.uid, folder: to }); break; }
          case 'tpl': await api('deck.template', { d: d.uid, on: !d.template }); ok(d.template ? t('saved') : t('template_saved')); break;
          case 'dl': return downloadAs(d.uid);
          case 'trash': await api('deck.trash', { d: d.uid }); ok(t('in_trash')); break;
          case 'restore': await api('deck.restore', { d: d.uid }); break;
          case 'purge': if (!(await confirmBox(t('delete_forever'), t('delete_forever_t', { title: d.title }), t('delete_forever')))) return; await api('deck.purge', { d: d.uid }); break;
          case 'leave': if (!(await confirmBox(t('leave'), t('leave_t', { title: d.title }), t('leave')))) return; await api('deck.leave', { d: d.uid }); break;
        }
        load();
      } catch (x) { oops(x); }
    });
    return m;
  }
  function pickFolder(cur) {
    const sel = h('sav-select', { label: t('folder'), value: String(cur || 0) }, h('option', { value: '0' }, t('no_folder')), ...data.folders.map((f) => h('option', { value: f.id }, path(data.folders, f))));
    return dialog(t('move_to'), sel, [[t('cancel'), null, { appearance: 'outline', variant: 'neutral' }], [t('move'), () => ({ v: +sel.value })]], { width: '26rem' }).then((r) => (r ? r.v : null));
  }
  // a file dropped anywhere opens it
  const over = (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
  const dropped = (e) => { const f = e.dataTransfer?.files?.[0]; if (f && /\.(savpre|pptx)$/i.test(f.name)) { e.preventDefault(); openFile(f, folder); } };
  addEventListener('dragover', over); addEventListener('drop', dropped);
  main.append(h('div.center', h('sav-spinner')));
  try { await load(); } catch (e) { oops(e); }
  return { leave: () => { removeEventListener('dragover', over); removeEventListener('drop', dropped); } };
}

const path = (all, f) => { const p = all.find((x) => x.id === f.parent); return (p ? path(all, p) + ' / ' : '') + f.name; };
export function tplCard(x, onclick) {
  const { meta, slides } = fromTemplate(x);
  return h('button.tpl', { type: 'button', onclick }, x.id === 'blank' ? h('div.thumb.blankt', icon('plus')) : fluidThumb(slides[0].d, context(meta)), h('span', tplName(x)));
}

/** New presentation: name, template (or blank), format, folder. Enter creates it at once. */
export async function newDialog(folder, data, tpl = TEMPLATES[0]) {
  const name = h('sav-input', { label: t('deck_name'), placeholder: t('untitled'), maxlength: 150 });
  let format = userSetting('format', '16-9');
  const formats = formatPicker(format, (f) => { format = f; });
  const sel = data.folders.length ? h('sav-select', { label: t('folder'), value: String(folder || 0) }, h('option', { value: '0' }, t('no_folder')), ...data.folders.map((f) => h('option', { value: f.id }, path(data.folders, f)))) : null;
  const mine = (data.decks || []).filter((d) => d.template && d.status === 'active');
  let chosen = tpl;
  const cards = [];
  const mark = () => cards.forEach(([c, x]) => c.classList.toggle('on', x === chosen));
  const row = h('div.tplpick', ...TEMPLATES.map((x) => { const c = tplCard(x, () => { chosen = x; mark(); }); cards.push([c, x]); return c; }), ...mine.map((d) => { const c = h('button.tpl', { type: 'button', onclick: () => { chosen = d; mark(); } }, fluidThumb(fixSlide(d.first), metaCtx(d)), h('span', d.title)); cards.push([c, d]); return c; }));
  mark();
  let dlg;
  const create = async () => {
    const title = name.value.trim() || t('untitled');
    let uid;
    if (chosen.uid) uid = (await api('deck.duplicate', { d: chosen.uid, title })).uid;
    else {
      const fonts = {}; if (userSetting('head')) fonts.head = userSetting('head'); if (userSetting('body')) fonts.body = userSetting('body');
      const d = fromTemplate(chosen, { format, theme: chosen.id === 'blank' ? userSetting('theme') || undefined : undefined, fonts: chosen.id === 'blank' ? fonts : {}, opts: { tr: userSetting('tr', 'fade'), numbers: userSetting('numbers', false) } });
      uid = (await api('deck.create', { title, folder: sel ? +sel.value : 0, ...d })).uid;
    }
    go('?d=' + uid);
  };
  name.addEventListener('keydown', async (e) => { if (e.key === 'Enter') { e.preventDefault(); try { await create(); dlg.close(true); } catch (x) { oops(x); } } });
  const body = h('div.newdlg', h('div.two', name, sel), h('label.lbl', t('template')), row, h('label.lbl', t('format')), formats);
  const p = dialog(t('new_deck'), body, [[t('cancel'), null, { appearance: 'outline', variant: 'neutral' }], [t('create'), create, { icon: 'plus' }]], { width: '54rem', ref: (d) => (dlg = d) });
  setTimeout(() => { name.focus(); row.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, 200);
  return p;
}

export function formatPicker(value, onpick) {
  const box = h('div.formats', { role: 'radiogroup', 'aria-label': t('format') });
  for (const [id, [w, hh]] of Object.entries(FORMATS)) {
    const k = 34 / Math.max(w, hh);
    box.append(h('button.fmt', { type: 'button', role: 'radio', 'aria-checked': String(id === value), class: id === value ? 'on' : '', onclick: (e) => { box.querySelectorAll('.fmt').forEach((x) => { x.classList.toggle('on', x === e.currentTarget); x.setAttribute('aria-checked', x === e.currentTarget); }); onpick(id); } }, h('i', { style: `width:${w * k}px;height:${hh * k}px` }), h('span', t('fmt_' + id))));
  }
  return box;
}
