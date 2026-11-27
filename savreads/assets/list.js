/**
 * The lists of articles: to read (the home), favourites, archive, a tag, a search; and every highlight together.
 * A row: the site and when it was saved, the title, the start of the text, the time it takes and how far the reading got,
 * the tags; a picture on the right. A press opens the reader. "Select" turns the rows into choices (as in SavDrive): a bar
 * takes the place of the header, with what can be done to all of them at once.
 */
import { btn, confirm, dialog, drop, dropBtn, empty, fail, h, icon, iconBtn, put, toast } from './ui.js';
import { day, t, when } from './i18n.js';
import { S, api, minutes, setCounts } from './store.js';
import { commands, go, prefs, setPrefs } from './account.js';
import { frame, head } from './shell.js';
import { readPending, saveDialog, toNotes, toTasks } from './actions.js';
import { keepOffline } from './offline.js';

const TITLES = { unread: 'nav_unread', starred: 'nav_starred', archive: 'nav_archive' };

export const readTime = (w) => (!w ? '' : minutes(w) < 1 ? t('less_min') : t('min_read', { n: minutes(w) }));

/** Tags of an article: a dialog with the tags it has, and the ones there are. */
export function tagsDialog(articles, after) {
  const have = new Set(articles.flatMap((a) => a.tags));
  const input = h('sav-chip-input', { label: t('edit_tags'), placeholder: t('add_tag'), value: [...have].join(','), suggestions: S.counts.tags.map((x) => x.name).join(',') });
  dialog({ title: t('edit_tags'), width: '28rem', body: input, actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => {
    const tags = String(input.value ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const r = await api('rd.update', { ids: articles.map((a) => a.id), tags });
    setCounts(r);
    after?.(r.articles);
  } }] });
}

/** What can be done to one article (the menu ⋮ of a row, of the reader). */
export function articleMenu(a, { onChange, onDelete, highlights } = {}) {
  const set = async (x, msg) => { const r = await api('rd.update', { id: a.id, ...x }); setCounts(r); Object.assign(a, r.articles[0]); onChange?.(a); if (msg) toast(t(msg), 'success'); };
  return () => [
    ['external-link', t('open_original'), () => window.open(a.url, '_blank', 'noopener,noreferrer')],
    ['copy', t('copy_link'), () => navigator.clipboard.writeText(a.url).then(() => toast(t('copied'), 'success'))],
    navigator.share ? ['share-2', t('share'), () => navigator.share({ title: a.title, url: a.url }).catch(() => {})] : null,
    '-',
    [a.starred ? 'star' : 'star', t(a.starred ? 'unstar' : 'star'), () => set({ starred: !a.starred })],
    [a.archived ? 'inbox' : 'archive', t(a.archived ? 'unarchive' : 'archive'), () => set({ archived: !a.archived }, a.archived ? 'unarchived' : 'archived')],
    ['tag', t('edit_tags'), () => tagsDialog([a], (list) => { Object.assign(a, list[0]); onChange?.(a); })],
    ['pencil', t('edit_title'), () => { const i = h('sav-input', { label: t('title'), value: a.title, maxlength: 400, autofocus: true }); dialog({ title: t('edit_title'), body: i, actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: () => set({ title: i.value.trim() }) }] }); }],
    '-',
    { head: 'SavOffice' },
    [null, t('to_tasks'), () => toTasks(a), { img: '../savtasks/icons/favicon.svg' }],
    [null, t('to_notes'), () => toNotes(a, highlights?.() || []), { img: '../savnotes/icons/favicon.svg' }],
    '-',
    ['trash-2', t('delete_article'), async () => { if (!(await confirm(t('delete_one_q'), t('delete_t'), t('delete')))) return; const r = await api('rd.delete', { ids: [a.id] }); setCounts(r); toast(t('deleted'), 'success'); onDelete?.(a); }, { danger: true }],
  ];
}

/** A row of a list of articles. */
export function articleRow(a, ctx) {
  const row = h('article.arow' + (a.archived && ctx.view !== 'archive' ? '.done' : ''), { 'data-id': a.id });
  const paint = () => {
    const pc = Math.round((a.progress || 0) * 100);
    const meta = h('div.ar-meta', h('span.ar-site', a.site || new URL(a.url).hostname), h('span.dot', '·'), h('span', { title: day(a.added) }, when(a.added)),
      a.status === 'pending' ? [h('span.dot', '·'), h('span.ar-st', h('sav-spinner'), t('pending'))] : a.status === 'failed' ? [h('span.dot', '·'), h('span.ar-st.bad', icon('external-link'), t('failed'))] : null);
    const foot = h('div.ar-foot', a.words ? h('span.ar-time', icon('clock'), readTime(a.words)) : null,
      pc >= 98 ? h('span.ar-fin', icon('circle-check'), t('finished')) : pc > 0 ? h('span.ar-prog', { title: t('read_pc', { n: pc }) }, h('i', { style: `width:${pc}%` })) : null,
      a.hl ? h('span.ar-hl', icon('highlighter'), String(a.hl)) : null,
      a.starred ? icon('star', { class: 'ar-star', label: t('star') }) : null,
      a.tags.slice(0, 4).map((x) => h('a.ar-tag', { href: '#/tag/' + encodeURIComponent(x), onclick: (e) => e.stopPropagation() }, '#' + x)));
    const pick = h('sav-checkbox.pick', { checked: ctx.sel.has(a.id) || null, 'aria-label': t('select'), onclick: (e) => e.stopPropagation(), onchange: (e) => ctx.toggle(a.id, e.target.checked) });
    const acts = h('div.ar-act', { onclick: (e) => e.stopPropagation() },
      iconBtn('star', t(a.starred ? 'unstar' : 'star'), () => quick({ starred: !a.starred }), { variant: a.starred ? 'primary' : 'neutral', appearance: a.starred ? 'soft' : 'ghost' }),
      iconBtn(a.archived ? 'inbox' : 'archive', t(a.archived ? 'unarchive' : 'archive'), () => quick({ archived: !a.archived }, true)),
      dropBtn('ellipsis-vertical', t('more'), articleMenu(a, { onChange: () => paint(), onDelete: () => ctx.remove(a.id) }), { caret: false, placement: 'bottom-end' }));
    put(row, pick,
      h('a.ar-main', { href: '#/a/' + a.id }, meta, h('h3.ar-title', a.title), a.excerpt ? h('p.ar-ex', a.excerpt) : null),
      a.image ? h('a.ar-img', { href: '#/a/' + a.id, tabindex: -1, 'aria-hidden': 'true' }, h('img', { src: a.image, alt: '', loading: 'lazy', onerror: (e) => e.target.parentNode.remove() })) : null,
      foot, acts);
  };
  // star and archive straight from the row; archive (or back) takes the row away from the list it no longer belongs to
  const quick = async (x, leaves) => {
    const r = await api('rd.update', { id: a.id, ...x });
    setCounts(r);
    Object.assign(a, r.articles[0]);
    if (leaves && (ctx.view === 'unread' || ctx.view === 'archive')) {
      ctx.remove(a.id);
      toast(t(a.archived ? 'archived' : 'unarchived'), 'success', { action: btn(t('undo'), { size: 'sm', appearance: 'ghost', onclick: async () => { const u = await api('rd.update', { id: a.id, archived: !a.archived }); setCounts(u); ctx.reload(); } }) });
    } else if (x.starred === false && ctx.view === 'starred') ctx.remove(a.id);
    else paint();
  };
  row.addEventListener('click', (e) => { if (ctx.selecting()) { e.preventDefault(); ctx.toggle(a.id, !ctx.sel.has(a.id)); row.querySelector('.pick').checked = ctx.sel.has(a.id); } });
  paint();
  return row;
}

/** view: unread | starred | archive | tag | search; arg: the tag or the words. */
export async function listScreen(root, view, arg = '') {
  const sel = new Set();
  let items = [], offset = 0, more = false;
  const sort = () => prefs()['sort_' + view] || '';
  const title = view === 'tag' ? '#' + arg : view === 'search' ? t('search_for', { q: arg }) : t(TITLES[view]);
  const main = frame(root, view === 'tag' ? 'tag:' + arg : view, h('div.wait.small', h('sav-spinner')));
  const headBox = h('div'), list = h('div.alist'), foot = h('div.more');
  document.title = title + ' – SavReads';
  const ctx = {
    view, sel,
    selecting: () => main.classList.contains('selecting'),
    toggle: (id, on) => { if (on) sel.add(id); else sel.delete(id); paintHead(); },
    remove: (id) => { items = items.filter((x) => x.id !== id); sel.delete(id); list.querySelector(`.arow[data-id="${id}"]`)?.remove(); if (!items.length) paintList(); paintHead(); },
    reload: () => load(true),
  };
  const bulk = async (x, msg) => { const ids = [...sel]; const r = await api('rd.update', { ids, ...x }); setCounts(r); toast(t(msg), 'success'); stopSel(); load(true); };
  const stopSel = () => { sel.clear(); main.classList.remove('selecting'); list.querySelectorAll('.pick').forEach((p) => { p.checked = false; }); paintHead(); };
  function paintHead() {
    if (ctx.selecting()) {
      put(headBox, h('div.dhead.selbar', iconBtn('x', t('cancel'), stopSel), h('h1', t('selected', { n: sel.size })), h('span.spacer'),
        btn(t('select_all'), { size: 'sm', appearance: 'ghost', onclick: () => { items.forEach((a) => sel.add(a.id)); list.querySelectorAll('.pick').forEach((p) => { p.checked = true; }); paintHead(); } }),
        sel.size ? [
          view === 'archive' ? iconBtn('inbox', t('unarchive'), () => bulk({ archived: false }, 'unarchived')) : iconBtn('archive', t('archive'), () => bulk({ archived: true }, 'archived')),
          iconBtn('star', t('star'), () => bulk({ starred: view !== 'starred' }, 'settings_saved')),
          iconBtn('tag', t('edit_tags'), () => tagsDialog(items.filter((a) => sel.has(a.id)), () => { stopSel(); load(true); })),
          iconBtn('trash-2', t('delete'), async () => { if (!(await confirm(t('delete_q', { n: sel.size }), t('delete_t'), t('delete')))) return; const r = await api('rd.delete', { ids: [...sel] }); setCounts(r); toast(t('deleted'), 'success'); stopSel(); load(true); }, { variant: 'danger' }),
        ] : null));
      return;
    }
    const sortMenu = dropBtn('arrow-down-up', t('sort'), () => [['', 'sort_new'], ['old', 'sort_old'], ['short', 'sort_short'], ['long', 'sort_long']].map(([v, k]) => [null, t(k), () => { setPrefs({ ['sort_' + view]: v }); load(true); }, { check: sort() === v }]), { placement: 'bottom-end', text: !matchMedia('(max-width: 640px)').matches });
    const tagMenu = view === 'tag' ? dropBtn('ellipsis-vertical', t('more'), [
      ['pencil', t('rename_tag'), () => { const i = h('sav-input', { label: t('rename_tag'), value: arg, maxlength: 40, autofocus: true }); dialog({ title: t('rename_tag'), body: i, actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => { const r = await api('rd.tags.rename', { from: arg, to: i.value.trim() }); setCounts(r); go('#/tag/' + encodeURIComponent(i.value.trim())); } }] }); }],
      ['trash-2', t('delete_tag'), async () => { if (!(await confirm(t('delete_tag'), t('delete_tag_t'), t('delete')))) return; const r = await api('rd.tags.delete', { from: arg }); setCounts(r); go('#/'); }, { danger: true }],
    ], { caret: false, placement: 'bottom-end' }) : null;
    put(headBox, head(title, items.length ? btn(t('select'), { icon: 'check-check', size: 'sm', appearance: 'ghost', class: 'selb', onclick: () => { main.classList.add('selecting'); paintHead(); } }) : null, sortMenu, tagMenu));
  }
  function paintList() {
    if (!items.length) {
      const e = { unread: ['inbox', 'empty_unread', 'empty_unread_t'], starred: ['star', 'empty_starred', 'empty_starred_t'], archive: ['archive', 'empty_archive', 'empty_archive_t'], tag: ['tag', 'empty_tag', ''], search: ['search', 'empty_search', 'empty_search_t'] }[view];
      put(list, empty(e[0], t(e[1]), e[2] ? t(e[2]) : '', view === 'unread' ? h('div.prow.center', btn(t('save_article'), { variant: 'primary', appearance: 'solid', icon: 'bookmark-plus', onclick: () => saveDialog() }), btn(t('import_title'), { icon: 'file-up', href: '#/settings/import' })) : null));
      put(foot);
      return;
    }
    put(list, items.map((a) => articleRow(a, ctx)));
    put(foot, more ? btn(t('load_more'), { onclick: () => load(false) }) : null);
  }
  async function load(fresh) {
    if (fresh) { offset = 0; items = []; }
    const r = await api('rd.list', null, { view: view === 'search' ? 'all' : view, tag: view === 'tag' ? arg : '', q: view === 'search' ? arg : '', sort: sort(), offset });
    items = items.concat(r.articles);
    offset += r.articles.length;
    more = r.more;
    paintHead();
    paintList();
  }
  await load(true);
  const pending = items.some((a) => a.status === 'pending') && S.counts.pending ? h('sav-alert.pendb', { variant: 'neutral', appearance: 'soft' }, h('sav-spinner', { slot: 'icon' }), t('importing_left', { n: S.counts.pending })) : null;
  put(main, headBox, pending, list, foot);
  // the articles of an import arrive while the list is open
  const onPending = () => { if (!main.isConnected) return removeEventListener('rd-pending', onPending); if (pending) { pending.lastChild.textContent = t('importing_left', { n: S.counts.pending }); if (!S.counts.pending) pending.remove(); } load(true); };
  addEventListener('rd-pending', onPending);
  const onSaved = () => { if (!main.isConnected) return removeEventListener('rd-saved', onSaved); if (view === 'unread') load(true); };
  addEventListener('rd-saved', onSaved);
  if (S.counts.pending) readPending();
  if (view === 'unread' && !S.offline) keepOffline(items);
  commands([t('places'), [['bookmark-plus', t('save_article'), () => saveDialog()], ['check-check', t('select'), () => { main.classList.add('selecting'); paintHead(); }]]]);
}

// ------------------------------------------------------------------ highlights, all together

export async function highlightsScreen(root) {
  const main = frame(root, 'highlights', h('div.wait.small', h('sav-spinner')));
  document.title = t('nav_highlights') + ' – SavReads';
  let offset = 0, more = false;
  const list = h('div.hlist'), foot = h('div.more');
  const card = (x) => h('article.hcard.hl-' + x.color, h('blockquote', x.quote), x.note ? h('p.hc-note', icon('message-square-text'), x.note) : null,
    h('div.hc-src', h('a', { href: '#/a/' + x.article + '?hl=' + x.id }, x.title), h('span.muted', ' · ' + (x.site || '') + ' · ' + when(x.created))));
  const load = async () => {
    const r = await api('rd.highlights', null, { offset });
    offset += r.highlights.length;
    more = r.more;
    list.append(...r.highlights.map(card));
    put(foot, more ? btn(t('load_more'), { onclick: load }) : null);
    return r.highlights.length;
  };
  const n = await load();
  put(main, head(t('nav_highlights')), n ? [list, foot] : empty('highlighter', t('empty_hl'), t('empty_hl_t')));
}

export { drop };
