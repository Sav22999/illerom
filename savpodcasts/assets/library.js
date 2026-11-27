/**
 * Library: the podcasts followed (covers, with how many new episodes), what is half listened, the starred episodes and
 * the history. Also OPML, the file every podcast app reads and writes: in (import) and out (export).
 */
import { btn, empty, fail, h, put, select, toast } from './ui.js';
import { t } from './i18n.js';
import { S, api, keep } from './store.js';
import { commands, go, prefs, setPrefs } from './account.js';
import { frame, head } from './shell.js';
import { epRow, podCard } from './eps.js';

/** An OPML file from the device: its podcasts are followed. Returns how many were added. */
export function importOpml() {
  return new Promise((done) => {
    const f = h('input', { type: 'file', accept: '.opml,.xml,text/x-opml,text/xml,application/xml' });
    f.addEventListener('change', async () => {
      const file = f.files[0];
      if (!file) return done(0);
      try {
        const r = await api('pod.import', { opml: await file.text() });
        S.subs = r.subs;
        S.pending = r.added;
        window.dispatchEvent(new CustomEvent('pod-subs'));
        toast(r.added ? t('imported', { n: r.added }) : t('imported_none'), 'success', { duration: 5000 });
        if (r.added) { const { refresh } = await import('./home.js'); refresh(true).catch(() => {}); }
        done(r.added);
      } catch (e) { fail(e); done(0); }
    });
    f.click();
  });
}
export function exportOpml() {
  const a = h('a', { href: 'api/?r=pod.export_opml', download: 'savpodcasts.opml' });
  document.body.append(a);
  a.click();
  a.remove();
}

const TABS = [['podcasts', 'podcast', 'lib_podcasts'], ['progress', 'history', 'lib_progress'], ['starred', 'star', 'lib_starred'], ['history', 'history', 'lib_history']];

export function libraryScreen(root, tab = 'podcasts') {
  if (!TABS.some((x) => x[0] === tab)) tab = 'podcasts';
  const panes = {};
  const tabs = h('sav-tabs.ltabs', { active: tab }, TABS.map(([k, ic, label]) => h('sav-tab', { name: k, label: t(label), icon: ic }, (panes[k] = h('div.lpane')))));
  tabs.addEventListener('sav-tab-show', (e) => { history.replaceState(null, '', '#/library/' + e.detail.name); draw(e.detail.name); });
  frame(root, 'library', head(t('nav_library'), btn(t('import_opml'), { size: 'sm', icon: 'file-up', onclick: () => importOpml().then((n) => n && draw('podcasts')) }), S.subs.length ? btn(t('export_opml'), { size: 'sm', icon: 'file-down', onclick: exportOpml }) : null), tabs);
  document.title = t('nav_library') + ' – SavPodcasts';
  commands([t('nav_library'), [['file-up', t('import_opml'), () => importOpml()], ['file-down', t('export_opml'), exportOpml], ...TABS.map(([k, ic, label]) => [ic, t(label), () => go('#/library/' + k)])]]);

  async function draw(k) {
    const pane = panes[k];
    if (k === 'podcasts') {
      let sort = prefs().libSort || 'latest';
      const grid = h('div.pgrid');
      const fill = () => {
        const list = [...S.subs].sort(sort === 'title' ? (a, b) => a.title.localeCompare(b.title) : sort === 'added' ? (a, b) => String(b.added).localeCompare(String(a.added)) : (a, b) => String(b.latest || '').localeCompare(String(a.latest || '')));
        put(grid, list.map((p) => podCard(p)));
      };
      fill();
      put(pane, S.subs.length ? [h('div.ltools', select(null, [['latest', t('sort_latest')], ['title', t('sort_title')], ['added', t('sort_added')]], sort, (v) => { sort = v; setPrefs({ libSort: v }).catch(() => {}); fill(); }, { 'aria-label': t('sort_latest') })), grid]
        : empty('podcast', t('none_following'), t('welcome_t'), btn(t('find_podcasts'), { icon: 'compass', variant: 'primary', appearance: 'solid', href: '#/discover' })));
      return;
    }
    put(pane, h('div.wait.small', h('sav-spinner')));
    try {
      let r = await api('pod.library', undefined, { tab: k });
      let eps = keep(r.episodes);
      const list = h('div.eplist', { role: 'list' });
      const more = h('div');
      const fill = () => {
        put(list, eps.map((e) => epRow(e, { podcast: true })));
        put(more, r.more ? btn(t('load_more'), { block: true, class: 'more', onclick: async () => { r = await api('pod.library', undefined, { tab: k, offset: eps.length }); eps = eps.concat(keep(r.episodes)); fill(); } }) : null);
      };
      fill();
      const none = { progress: ['history', t('none_progress'), ''], starred: ['star', t('none_starred'), t('none_starred_t')], history: ['history', t('none_history'), ''] }[k];
      put(pane, eps.length ? [list, more] : empty(...none));
    } catch (e) { fail(e); put(pane, empty('cloud-off', t('err_network'), '')); }
  }
  draw(tab);
}
