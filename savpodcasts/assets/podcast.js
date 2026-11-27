/**
 * A podcast: its cover and details, Follow, its own settings (speed, skips), its episodes (search, newest or oldest first,
 * only those not played; 100 at a time). Opening a podcast followed marks its episodes as seen (no longer "new").
 */
import { btn, confirm, copyText, dialog, drop, empty, fail, h, icon, primary, put, select, toast } from './ui.js';
import { catName, getLang, t } from './i18n.js';
import { S, api, keep } from './store.js';
import { commands, prefs } from './account.js';
import { frame } from './shell.js';
import { cover, epRow, follow } from './eps.js';
import { SPEEDS, epChanged, play } from './player.js';

/** The notes of a podcast or an episode: HTML already cleaned by the server, cleaned once more here (only known tags, only links). */
export function notes(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html || '');
  const ok = new Set(['P', 'BR', 'STRONG', 'EM', 'U', 'S', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'H4', 'A']);
  const walk = (n) => {
    for (const c of [...n.childNodes]) {
      if (c.nodeType === 1) {
        if (!ok.has(c.tagName)) { c.replaceWith(...c.childNodes); continue; }
        for (const a of [...c.attributes]) if (!(c.tagName === 'A' && a.name === 'href')) c.removeAttribute(a.name);
        if (c.tagName === 'A') { if (!/^(https?:|mailto:)/i.test(c.getAttribute('href') || '')) { c.replaceWith(...c.childNodes); continue; } c.target = '_blank'; c.rel = 'noopener noreferrer nofollow'; }
        walk(c);
      } else if (c.nodeType !== 3) c.remove();
    }
  };
  walk(tpl.content);
  return tpl.content;
}

/** The settings of one podcast followed: speed, skip the start, skip the end. */
function podSettings(p, sub) {
  const s = { ...(sub.settings || {}) };
  const def = prefs().speed || 1;
  const secs = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180];
  const sp = select(t('def_speed'), [['', t('speed_default', { v: def })], ...SPEEDS.map((v) => [String(v), `${v}×`])], s.speed ? String(s.speed) : '', null);
  const sk = select(t('skip_intro'), secs.map((n) => [String(n), n ? t('sec_n', { n }) : t('none')]), String(s.skip || 0), null, { help: t('skip_intro_t') });
  const se = select(t('skip_end'), secs.map((n) => [String(n), n ? t('sec_n', { n }) : t('none')]), String(s.skipEnd || 0), null, { help: t('skip_end_t') });
  dialog({ title: t('pod_settings'), width: '28rem', body: h('div.form', h('p.muted', t('pod_settings_t')), sp, sk, se), actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => {
    const set = {};
    if (sp.value) set.speed = +sp.value;
    if (+sk.value) set.skip = +sk.value;
    if (+se.value) set.skipEnd = +se.value;
    const r = await api('pod.sub_settings', { id: p.id, settings: set });
    sub.settings = r.settings;
    const local = S.subs.find((x) => x.id === p.id);
    if (local) local.settings = r.settings;
    toast(t('settings_saved'), 'success');
  } }] });
}

export async function podcastScreen(root, id) {
  const body = h('div.podb', h('div.wait', h('sav-spinner')));
  frame(root, 'p' + id, body);
  let r = await api('pod.podcast', undefined, { id });
  let p = r.podcast, eps = keep(r.episodes), total = r.total;
  let sort = 'new', only = '', q = '';
  document.title = p.title + ' – SavPodcasts';

  const list = h('div.eplist', { role: 'list' }), count = h('span.muted.small');
  const moreBox = h('div');
  const fill = () => {
    put(list, eps.length ? eps.map((e) => epRow(e, { podcast: false, summary: true })) : empty('podcast', t('no_eps'), ''));
    count.textContent = total === 1 ? t('episodes_1') : t('episodes_n', { n: total.toLocaleString(getLang()) });
    put(moreBox, eps.length < total ? btn(t('load_more'), { block: true, class: 'more', onclick: async () => { const x = await api('pod.podcast', undefined, { id, offset: eps.length, sort, only, q, quick: 1 }); eps = eps.concat(keep(x.episodes)); total = x.total; fill(); } }) : null);
  };
  const reload = async () => { const x = await api('pod.podcast', undefined, { id, sort, only, q, quick: 1 }); eps = keep(x.episodes); total = x.total; fill(); };

  const followBtn = () => {
    const b = p.sub ? btn(t('followed'), { icon: 'check', appearance: 'soft', variant: 'primary', onclick: async () => { if (!(await confirm(t('unfollow'), p.title, t('unfollow'), false))) return; await follow(p, false); p.sub = false; drawHead(); } })
      : primary(t('follow'), { icon: 'plus', onclick: async () => { await follow(p, true); p.sub = true; drawHead(); } });
    return b;
  };
  const menuItems = () => [
    p.sub ? ['sliders-horizontal', t('pod_settings'), () => podSettings(p, S.subs.find((x) => x.id === p.id) || { settings: p.settings })] : null,
    ['circle-check', t('mark_all'), async () => { if (!(await confirm(t('mark_all'), t('mark_all_t'), t('mark_all'), false))) return; await api('pod.mark_all', { id: p.id, done: true }); eps.forEach((e) => { e.done = true; e.pos = 0; epChanged(e.id); }); S.subs.forEach((x) => { if (x.id === p.id) x.new = 0; }); }],
    ['circle', t('unmark_all'), async () => { await api('pod.mark_all', { id: p.id, done: false }); eps.forEach((e) => { e.done = false; e.pos = 0; epChanged(e.id); }); }],
    '-',
    p.link ? ['external-link', t('website'), () => window.open(p.link, '_blank', 'noopener')] : null,
    ...(p.funding || []).map((f) => ['hand-heart', f.text || t('support'), () => window.open(f.url, '_blank', 'noopener')]),
    ['rss', t('copy_feed'), () => copyText(p.url)],
  ];
  const headBox = h('section.phead');
  function drawHead() {
    const firstNew = eps.find((e) => !e.done) || eps[0];
    put(headBox, h('div.ph-cv', cover(p.image, p.title, 'lg')),
      h('div.ph-t', h('h1', p.title), p.author ? h('a.ph-a', { href: '#/author/' + encodeURIComponent(p.author), title: t('by_author', { a: p.author }) }, p.author) : null,
        h('div.ph-tags', p.cats.slice(0, 4).map((c) => h('a.ph-tag', { href: '#/category/' + encodeURIComponent(c), title: catName(c) }, h('sav-tag', { size: 'sm', appearance: 'soft' }, catName(c)))), p.explicit ? h('sav-tag', { size: 'sm', variant: 'warning', appearance: 'soft' }, t('explicit')) : null, p.complete ? h('sav-tag', { size: 'sm', appearance: 'soft' }, t('complete')) : null),
        h('div.prow.wrap.ph-act', followBtn(), firstNew ? btn(t('play'), { icon: 'play', onclick: () => play(firstNew) }) : null,
          (p.funding || [])[0] ? btn(t('support'), { icon: 'hand-heart', appearance: 'ghost', onclick: () => window.open(p.funding[0].url, '_blank', 'noopener') }) : null,
          drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', variant: 'neutral', square: true }), menuItems, { placement: 'bottom-end', label: p.title })),
        p.descr ? h('sav-details.ph-d', { summary: t('about'), appearance: 'plain' }, h('div.notes', notes(p.descr))) : null));
  }
  drawHead();

  const search = h('sav-input', { type: 'search', size: 'sm', placeholder: t('search_eps'), clearable: true, pill: true, 'aria-label': t('search_eps') }, icon('search', { slot: 'prefix' }));
  let timer = 0;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { q = search.value.trim(); reload().catch(fail); }, 300); });
  search.addEventListener('sav-clear', () => { q = ''; reload().catch(fail); });
  const sortSel = select(null, [['new', t('sort_new')], ['old', t('sort_old')]], sort, (v) => { sort = v; reload().catch(fail); }, { 'aria-label': t('sort_new') });
  const onlySel = select(null, [['', t('all_eps')], ['unplayed', t('only_unplayed')]], only, (v) => { only = v; reload().catch(fail); }, { 'aria-label': t('only_unplayed') });

  put(body, headBox, p.problem && p.ready ? h('sav-alert', { variant: 'warning', appearance: 'soft', class: 'ph-warn' }, t('feed_problem')) : null,
    h('div.eptools', search, sortSel, onlySel, count), list, moreBox);
  fill();
  commands([p.title, [['play', t('play'), () => eps[0] && play(eps.find((e) => !e.done) || eps[0])], ['rss', t('copy_feed'), () => copyText(p.url)]]]);
  // seen: its episodes so far are no longer new
  if (p.sub) {
    api('pod.seen', { id: p.id }).catch(() => {});
    const local = S.subs.find((x) => x.id === p.id);
    if (local?.new) { local.new = 0; window.dispatchEvent(new CustomEvent('pod-subs')); }
  }
}
