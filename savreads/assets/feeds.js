/**
 * The feeds: the articles of all of them (#/feeds), of a folder (#/feeds/d/<folder>), of one feed (#/feeds/f/<id>), or the
 * ones with some words (#/feeds/q/<words>). Unread first by choice (Settings › Feeds); an article opens in the reader and
 * counts as read; any of them can be saved to the reading list. On phones the feed or folder is chosen at the top of the
 * page (the side becomes a row of places there, as in SavDrive).
 */
import { btn, confirm, dialog, dropBtn, empty, h, icon, iconBtn, put, segmented, select, toast } from './ui.js';
import { t, when } from './i18n.js';
import { S, api, setCounts } from './store.js';
import { commands, go, prefs, setPrefs } from './account.js';
import { frame, head } from './shell.js';
import { addFeed, folderPicker, importFile, pickFile, refreshFeeds, saveUrl } from './actions.js';
import { readTime } from './list.js';

export async function feedsScreen(root, kind = '', arg = '') {
  const feed = kind === 'f' ? S.subs.find((f) => String(f.id) === arg) : null;
  const folder = kind === 'd' ? decodeURIComponent(arg) : null;
  const term = kind === 'q' ? decodeURIComponent(arg) : '';
  if (kind === 'f' && !feed) throw Object.assign(new Error(), { code: 'not_found' });
  const active = feed ? 'f' + feed.id : folder !== null ? 'd' + folder : 'feeds';
  const main = frame(root, active, h('div.wait.small', h('sav-spinner')));
  const title = feed ? feed.title : folder !== null ? folder : term ? t('search_for', { q: term }) : t('nav_feeds');
  document.title = title + ' – SavReads';
  let unread = !term && prefs().feedsUnread !== false, offset = 0, more = false, items = [];
  const list = h('div.ilist'), foot = h('div.more'), headBox = h('div');

  if (!S.subs.length) {
    put(main, head(t('nav_feeds')), empty('rss', t('empty_feeds'), t('empty_feeds_t'), h('div.prow.center.wrap', btn(t('add_feed'), { variant: 'primary', appearance: 'solid', icon: 'rss', onclick: () => addFeed() }), btn(t('import_opml'), { icon: 'file-up', onclick: async () => { const r = await importFile('opml', await pickFile('.opml,.xml,text/xml,text/x-opml')); if (r) go('#/feeds'); } }))));
    commands([t('feeds'), [['rss', t('add_feed'), () => addFeed()]]]);
    return;
  }

  const query = () => ({ feed: feed?.id, folder: folder ?? undefined, unread: unread ? 1 : '', q: term, offset });
  const row = (x) => {
    const r = h('article.irow' + (x.unread ? '.unread' : ''), { 'data-id': x.id });
    const paint = () => {
      r.classList.toggle('unread', x.unread);
      put(r, h('a.ir-main', { href: '#/i/' + x.id },
        h('div.ar-meta', x.icon ? h('img.fic', { src: x.icon, alt: '', width: 16, height: 16, loading: 'lazy', onerror: (e) => e.target.replaceWith(icon('rss', { class: 'fic' })) }) : icon('rss', { class: 'fic' }), h('span.ar-site', x.feedTitle), h('span.dot', '·'), h('time', { datetime: x.date }, when(x.date)), x.words > 30 ? [h('span.dot', '·'), h('span', readTime(x.words))] : null),
        h('h3.ar-title', x.unread ? h('span.udot', { 'aria-label': t('only_unread') }) : null, x.title), x.summary && x.summary !== x.title ? h('p.ar-ex', x.summary) : null),
        x.image ? h('a.ar-img', { href: '#/i/' + x.id, tabindex: -1, 'aria-hidden': 'true' }, h('img', { src: x.image, alt: '', loading: 'lazy', onerror: (e) => e.target.parentNode.remove() })) : null,
        h('div.ar-act', { onclick: (e) => e.stopPropagation() },
          x.link ? (x.saved ? iconBtn('bookmark', t('open_saved'), () => go('#/a/' + x.saved), { variant: 'primary', appearance: 'soft' }) : iconBtn('bookmark-plus', t('save_later'), async () => { const a = await saveUrl(x.link, { item: x.id, source: 'feed', title: x.title }); x.saved = a.id; paint(); })) : null,
          iconBtn(x.unread ? 'check' : 'circle-dot', t(x.unread ? 'mark_read' : 'mark_unread'), async () => { const u = await api('rd.items.read', { ids: [x.id], read: x.unread }); x.unread = !x.unread; setCounts(u); paint(); })));
    };
    paint();
    return r;
  };
  async function load(fresh) {
    if (fresh) { offset = 0; items = []; }
    const r = await api('rd.items', null, query());
    items = items.concat(r.items);
    offset += r.items.length;
    more = r.more;
    if (fresh) put(list, items.length ? items.map(row) : empty(unread ? 'check-check' : 'rss', t(unread ? 'empty_items' : 'empty_items_all'), unread ? t('empty_items_t') : '', unread ? btn(t('all'), { size: 'sm', onclick: () => { unread = false; paintHead(); load(true); } }) : null));
    else list.append(...r.items.map(row));
    put(foot, more ? btn(t('load_more'), { onclick: () => load(false) }) : null);
  }

  const markAll = async () => {
    const u = await api('rd.items.read_all', feed ? { feed: feed.id } : folder !== null ? { folder } : {});
    setCounts(u);
    toast(t('marked_all'), 'success');
    load(true);
  };
  const refresh = async (b) => {
    if (b) b.loading = true;
    try {
      if (feed) { const u = await api('rd.feeds.refresh', { id: feed.id }); setCounts(u); } else await refreshFeeds(true);
      toast(t('up_to_date'), 'success');
      load(true);
    } finally { if (b) b.loading = false; }
  };
  const feedMenu = () => feed ? [
    ['pencil', t('rename'), () => { const i = h('sav-input', { label: t('name'), value: feed.title, maxlength: 300, autofocus: true }); dialog({ title: t('rename'), body: i, actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => { const u = await api('rd.feeds.update', { id: feed.id, title: i.value.trim() }); setCounts(u); dispatchEvent(new HashChangeEvent('hashchange')); } }] }); }],
    ['folder', t('move_to'), () => { const fp = folderPicker(feed.folder); dialog({ title: t('move_to'), body: fp, actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => { const u = await api('rd.feeds.update', { id: feed.id, folder: fp.value() }); setCounts(u); dispatchEvent(new HashChangeEvent('hashchange')); } }] }); }],
    feed.link ? ['external-link', t('feed_site'), () => window.open(feed.link, '_blank', 'noopener,noreferrer')] : null,
    ['copy', t('feed_address'), () => navigator.clipboard.writeText(feed.url).then(() => toast(t('copied'), 'success'))],
    '-',
    ['x', t('unsub'), async () => { if (!(await confirm(t('unsub_q', { t: feed.title }), t('unsub_t'), t('unsub')))) return; const u = await api('rd.feeds.remove', { id: feed.id }); setCounts(u); go('#/feeds'); }, { danger: true }],
  ] : folder !== null ? [
    ['pencil', t('rename_folder'), () => { const i = h('sav-input', { label: t('folder_name'), value: folder, maxlength: 80, autofocus: true }); dialog({ title: t('rename_folder'), body: i, actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => { const u = await api('rd.folder.rename', { from: folder, to: i.value.trim() }); setCounts(u); go('#/feeds/d/' + encodeURIComponent(i.value.trim())); } }] }); }],
    ['folder', t('ungroup'), async () => { if (!(await confirm(t('ungroup'), t('ungroup_t'), t('ungroup'), false))) return; const u = await api('rd.folder.rename', { from: folder, to: '' }); setCounts(u); go('#/feeds'); }],
  ] : [['rss', t('add_feed'), () => addFeed()], ['file-up', t('import_opml'), async () => importFile('opml', await pickFile('.opml,.xml,text/xml,text/x-opml'))], ['file-down', t('export_opml'), () => { location.href = 'api/?r=rd.opml.export'; }]];

  // on phones: which feed or folder, at the top of the page
  const chooser = () => {
    const folders = [...new Set(S.subs.map((f) => f.folder).filter(Boolean))].sort();
    const opts = [['all', t('nav_feeds') + (S.subs.some((f) => f.unread) ? ` (${S.subs.reduce((a, f) => a + f.unread, 0)})` : '')], ...folders.map((d) => ['d:' + d, '▸ ' + d]), ...S.subs.map((f) => ['f:' + f.id, (f.folder ? '   ' : '') + f.title + (f.unread ? ` (${f.unread})` : '')])];
    return select(null, opts, feed ? 'f:' + feed.id : folder !== null ? 'd:' + folder : 'all', (v) => go(v === 'all' ? '#/feeds' : v.startsWith('d:') ? '#/feeds/d/' + encodeURIComponent(v.slice(2)) : '#/feeds/f/' + v.slice(2)), { class: 'fchoose', 'aria-label': t('choose_feed'), size: 'md' });
  };
  function paintHead() {
    put(headBox, head(title,
      term ? null : segmented(t('only_unread'), unread ? 'u' : 'a', [['u', '=' + t('only_unread'), t('only_unread')], ['a', '=' + t('all'), t('all')]], (v) => { unread = v === 'u'; setPrefs({ feedsUnread: unread }).catch(() => {}); load(true); }),
      iconBtn('refresh-cw', t('refresh'), (b) => refresh(b)),
      iconBtn('check-check', t('mark_all'), markAll),
      dropBtn('ellipsis-vertical', t('more'), feedMenu, { caret: false, placement: 'bottom-end' })), chooser(),
    feed && !feed.ready ? h('sav-alert.fstat', { variant: feed.error ? 'warning' : 'neutral', appearance: 'soft' }, feed.error ? t('feed_error', { e: feed.error }) : t('feed_waiting')) : feed?.error ? h('sav-alert.fstat', { variant: 'warning', appearance: 'soft' }, t('feed_error', { e: feed.error })) : null);
  }
  paintHead();
  await load(true);
  put(main, headBox, list, foot);
  // new articles while the page is open
  const onFeeds = () => { if (!main.isConnected) return removeEventListener('rd-feeds', onFeeds); load(true); };
  addEventListener('rd-feeds', onFeeds);
  commands([t('feeds'), [['rss', t('add_feed'), () => addFeed()], ['check-check', t('mark_all'), markAll], ['refresh-cw', t('refresh'), () => refresh()]]]);
}
