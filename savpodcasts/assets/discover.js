/**
 * Discover: search the open catalogue (fyyd, or Podcast Index when the server has its keys), the podcasts listened to
 * most right now in a language, and any feed by its address. #/discover/<words> searches at once (the box of the bar).
 */
import { btn, dialog, empty, fail, h, icon, put, segmented } from './ui.js';
import { MAIN_CATS, catName, getLang, t } from './i18n.js';
import { S, api } from './store.js';
import { commands, go, prefs, setPrefs } from './account.js';
import { frame, head, section } from './shell.js';
import { openFeed, podCard } from './eps.js';
import { importOpml } from './library.js';

/** The address of a feed, typed by hand. */
export function addFeed(value = '') {
  const url = h('sav-input', { label: t('feed_url'), type: 'url', value, placeholder: 'https://…', autofocus: true, help: t('add_feed_t') }, icon('rss', { slot: 'prefix' }));
  dialog({ title: t('add_feed'), width: '30rem', body: url, actions: [{ label: t('cancel') }, { label: t('open'), primary: true, run: async () => { if (!url.value.trim()) return false; await openFeed(url.value.trim()); } }] });
}

const credit = () => h('p.catalog', S.catalog === 'podcastindex'
  ? h('a', { href: 'https://podcastindex.org', target: '_blank', rel: 'noopener' }, t('catalog_podcastindex'))
  : h('a', { href: 'https://fyyd.de', target: '_blank', rel: 'noopener' }, t('catalog_fyyd')));

export function discoverScreen(root, words = '') {
  words = decodeURIComponent(words || '');
  const results = h('div.dres'), pop = h('div.dpop');
  const cats = h('div.catrow', MAIN_CATS.map((c) => h('a.catchip', { href: '#/category/' + encodeURIComponent(c) }, catName(c))));
  frame(root, 'discover', head(t('nav_discover'), btn(t('add_feed'), { size: 'sm', icon: 'rss', onclick: () => addFeed() }), btn(t('import_opml'), { size: 'sm', icon: 'file-up', onclick: () => importOpml() })),
    results, section(t('categories')), cats, pop, credit());
  document.title = t('nav_discover') + ' – SavPodcasts';
  commands([t('nav_discover'), [['rss', t('add_feed'), () => addFeed()], ['file-up', t('import_opml'), () => importOpml()]]]);

  const grid = (list) => h('div.pgrid', list.map((p) => podCard(p, { details: true })));

  async function search() {
    if (!words) { put(results); return; }
    put(results, section(t('results')), h('div.wait.small', h('sav-spinner')));
    try {
      const r = await api('pod.search', undefined, { q: words, lang: getLang() });
      if (r.url) { put(results); await openFeed(r.url); return; }
      put(results, section(t('results')), r.results.length ? grid(r.results) : empty('search', t('nothing_found'), t('nothing_found_t'), btn(t('add_feed'), { icon: 'rss', onclick: () => addFeed() })));
    } catch (e) { put(results, section(t('results')), empty('cloud-off', t('cant_reach'), '')); if (e.code !== 'network' && e.code !== 'server') fail(e); }
  }

  let lang = prefs().popLang ?? (getLang() === 'it' ? 'it' : 'en');
  async function popular() {
    const pick = segmented(t('popular_in'), lang || 'all', [['it', '=' + t('lang_it'), t('lang_it')], ['en', '=' + t('lang_en'), t('lang_en')], ['all', '=' + t('lang_all'), t('lang_all')]], (v) => { lang = v === 'all' ? '' : v; setPrefs({ popLang: lang }).catch(() => {}); popular(); });
    put(pop, section(t('popular'), pick), h('div.wait.small', h('sav-spinner')));
    try {
      const r = await api('pod.popular', undefined, { lang });
      put(pop, section(t('popular'), pick), r.results.length ? grid(r.results) : empty('podcast', t('nothing_found'), ''));
    } catch { put(pop, section(t('popular'), pick), empty('cloud-off', t('cant_reach'), '')); }
  }
  search();
  popular();
}

export const goSearch = (q) => go('#/discover/' + encodeURIComponent(q));

/**
 * The podcasts of an author (#/author/<name>) or of a category (#/category/<name>, as written in the feeds): the ones
 * already known here and the ones of the open catalogue. A category can be narrowed to a language.
 */
export function browseScreen(root, by, value) {
  value = decodeURIComponent(value || '');
  const isCat = by === 'category';
  const title = isCat ? catName(value) : t('by_author', { a: value });
  const box = h('div.dres'), count = h('span.muted.small');
  const note = !isCat && S.catalog !== 'podcastindex' ? h('p.catalog', t('browse_fyyd')) : null;
  let lang = isCat ? (prefs().popLang ?? (getLang() === 'it' ? 'it' : 'en')) : '';
  const pick = isCat ? segmented(t('popular_in'), lang || 'all', [['it', '=' + t('lang_it'), t('lang_it')], ['en', '=' + t('lang_en'), t('lang_en')], ['all', '=' + t('lang_all'), t('lang_all')]], (v) => { lang = v === 'all' ? '' : v; setPrefs({ popLang: lang }).catch(() => {}); load(); }) : null;
  frame(root, 'discover', h('div.bhead', h('span.bkind', icon(isCat ? 'library' : 'user'), t(isCat ? 'category_l' : 'author_l')), head(title, pick)), h('p.muted.bsub', t(isCat ? 'in_category_t' : 'by_author_t', { a: value }), ' ', count), box, note, credit(),
    isCat ? [section(t('categories')), h('div.catrow', MAIN_CATS.filter((c) => c !== value).map((c) => h('a.catchip', { href: '#/category/' + encodeURIComponent(c) }, catName(c))))] : null);
  document.title = title + ' – SavPodcasts';
  commands();
  async function load() {
    put(box, h('div.wait.small', h('sav-spinner')));
    count.textContent = '';
    try {
      const r = await api('pod.browse', undefined, { by, v: value, lang: isCat ? lang : getLang() });
      count.textContent = r.results.length ? '· ' + (r.results.length === 1 ? t('podcasts_1') : t('podcasts_n', { n: r.results.length })) : '';
      put(box, r.results.length ? h('div.pgrid', r.results.map((p) => podCard(p, { details: true }))) : empty(isCat ? 'library' : 'user', t('browse_none'), t('browse_none_t')));
    } catch (e) { put(box, empty('cloud-off', t('cant_reach'), '')); if (e.code !== 'network' && e.code !== 'server') fail(e); }
  }
  load();
}
