/** The public pages: home, catalogue, product, comparison, alternatives, awards, methodology, independence, certificates. */
import { h, put, icon, btn, primary, link, dialog, confirm, ask, toast, fail, empty, face, num1, day, ago, country, ring, bar, tone, logo, go, copyText, area, field, select, errText } from './ui.js';
import { t, getLang } from './i18n.js';
import { S, api, isMod } from './store.js';

const meta = () => S.meta || { categories: [], criteria: [], platforms: [], europe: [], alternatives: [], editions: [] };
const PLATFORM_ICON = { web: 'globe', android: 'smartphone', ios: 'smartphone', windows: 'monitor', macos: 'laptop', linux: 'terminal' };
const title = (s) => { document.title = s ? `${s} · SavAwards` : 'SavAwards'; };
const section = (heading, ...kids) => h('section.sec', heading ? h('sav-heading', { level: 2, size: 'md', marker: true }, heading) : null, kids);
const needSignIn = () => { sessionStorage.setItem('savawards-next', location.hash); go('#/signin'); };

// ------------------------------------------------------------------ pieces

const platformChips = (list) => h('span.plats', list.map((p) => h('span.plat', { title: t('pf_' + p) }, icon(PLATFORM_ICON[p] || 'box'), h('span.sr', t('pf_' + p)))));

/** The facts of a product as small chips: Europe, open source, price, self-hosting. */
const FEATURE_ICON = { green: 'sprout', e2ee: 'lock', no_ads: 'ban', no_tracking: 'eye-off', by_author: 'info' };
/** Where a product is based: its flag and its area (European Union, EFTA, United Kingdom, Europe) or, outside Europe, its country. */
export function basedIn(p) {
  if (!p.country) return null;
  const area = p.region && p.region !== 'world' ? t('region_' + p.region) : country(p.country);
  return h('sav-tag', { size: 'sm', variant: p.europe ? 'primary' : 'neutral', appearance: 'soft', title: t('based_in', { c: country(p.country) }), class: 'based' },
    h('sav-flag', { code: p.country.toLowerCase(), slot: 'prefix', label: country(p.country) }), area);
}
/** The badges of a product: where it is based, open source, the free plan, self-hosting, renewable energy and the others. */
function facts(p, o = {}) {
  return h('div.facts',
    basedIn(p),
    p.openSource ? h('sav-tag', { size: 'sm', variant: 'success', appearance: 'soft' }, icon('code', { slot: 'prefix' }), o.all && p.licence ? p.licence : t('open_source')) : (o.all && p.licence ? h('sav-tag', { size: 'sm', appearance: 'soft' }, p.licence) : null),
    h('sav-tag', { size: 'sm', appearance: 'soft', variant: p.freePlan ? 'success' : 'warning' }, icon('coins', { slot: 'prefix' }), t('price_' + p.pricing)),
    p.selfHost ? h('sav-tag', { size: 'sm', appearance: 'soft' }, icon('server', { slot: 'prefix' }), t('self_host')) : null,
    (p.features || []).map((f) => h('sav-tag', { size: 'sm', appearance: f === 'by_author' ? 'solid' : 'soft', variant: f === 'green' ? 'success' : f === 'by_author' ? 'warning' : 'neutral', title: t('feat_' + f + '_t') }, icon(FEATURE_ICON[f] || 'check', { slot: 'prefix' }), t('feat_' + f))));
}

/** A card of the catalogue. */
export function card(p, o = {}) {
  const inTray = tray().includes(p.slug);
  const a = h('a.pcard', { href: '#/p/' + encodeURIComponent(p.slug) },
    h('div.pc-top', logo(p, 52), h('div.pc-name', h('strong', p.name), h('small', p.category?.name || '')), ring(p.score, 54, t('score_of', { p: p.name }))),
    p.place ? h('div.pc-place', placeBadge(p.place)) : null,
    h('p.pc-tag', p.tagline || ''),
    facts(p));
  const cmp = o.compare === false ? null : h('sav-button', { size: 'sm', appearance: inTray ? 'soft' : 'ghost', variant: inTray ? 'primary' : 'neutral', icon: 'git-compare', square: true, class: 'pc-cmp', title: t('compare'), label: t('compare') });
  cmp?.addEventListener('click', (e) => { e.preventDefault(); toggleTray(p.slug); cmp.appearance = tray().includes(p.slug) ? 'soft' : 'ghost'; cmp.variant = tray().includes(p.slug) ? 'primary' : 'neutral'; });
  const foot = h('div.pc-foot', { slot: 'footer' }, platformChips(p.platforms || []), h('span.grow'),
    p.community ? h('span.pc-comm', { title: t('community_avg') }, icon('users'), ' ', num1(p.community.avg), h('small', ` (${p.community.n})`)) : null,
    p.wins ? h('span.pc-wins', { title: t('awards_won', { n: p.wins }) }, icon('trophy'), ' ', String(p.wins)) : null, cmp);
  return h('sav-card.pc', a, foot);
}
const grid = (list, o) => h('div.pgrid', list.map((p) => card(p, o)));
export const placeBadge = (place) => h('sav-badge', { variant: place === 1 ? 'warning' : 'neutral', appearance: place === 1 ? 'solid' : 'soft', class: 'place p' + place }, icon(place === 1 ? 'trophy' : 'medal', { slot: 'prefix' }), t('place_' + place));

// ------------------------------------------------------------------ compare tray (kept in this browser)

export const tray = () => { try { return JSON.parse(sessionStorage.getItem('savawards-compare') || '[]'); } catch { return []; } };
function toggleTray(slug) {
  let l = tray();
  if (l.includes(slug)) l = l.filter((x) => x !== slug);
  else { if (l.length >= 4) { toast(t('compare_max'), 'warning'); return; } l.push(slug); }
  sessionStorage.setItem('savawards-compare', JSON.stringify(l));
  compareTray();
}
export function compareTray() {
  let bar = document.querySelector('.ctray');
  const l = tray();
  if (!l.length || location.hash.startsWith('#/compare')) { bar?.remove(); return; }
  if (!bar) { bar = h('div.ctray', { role: 'region', 'aria-label': t('compare') }); document.body.append(bar); }
  put(bar, icon('git-compare'), h('span', t('compare_n', { n: l.length })),
    primary(t('compare'), { size: 'sm', href: '#/compare/' + l.map(encodeURIComponent).join(','), disabled: l.length < 2 }),
    h('sav-button', { size: 'sm', appearance: 'ghost', square: true, icon: 'x', label: t('clear'), onclick: () => { sessionStorage.removeItem('savawards-compare'); compareTray(); document.querySelectorAll('.pc-cmp').forEach((b) => { b.appearance = 'ghost'; b.variant = 'neutral'; }); } }));
}
addEventListener('hashchange', () => compareTray());

// ------------------------------------------------------------------ home

export async function home(root) {
  title('');
  const d = await api('pub.home');
  const search = h('sav-search', { placeholder: t('search_ph'), label: t('search'), size: 'lg', class: 'hsearch' });
  const doSearch = () => go('#/products?q=' + encodeURIComponent(search.value || ''));
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  search.addEventListener('sav-search', doSearch);
  const cats = meta().categories.filter((c) => c.n > 0);
  const stat = (v, k, ic) => h('sav-stat', { value: String(v), label: t(k), icon: ic, appearance: 'card' });
  put(root,
    h('section.hero',
      h('div.hero-t',
        h('sav-tag', { variant: 'primary', appearance: 'soft' }, icon('badge-check', { slot: 'prefix' }), t('hero_kicker')),
        h('h1', t('hero_title')),
        h('p.lead', t('hero_text')),
        search,
        h('div.hero-cta', primary(t('browse'), { href: '#/products', icon: 'layout-grid' }), btn(t('see_awards'), { href: '#/awards', icon: 'trophy' }), link(t('how_we_test'), '#/methodology', { icon: 'scale' }))),
      h('div.hero-art', { 'aria-hidden': 'true' }, heroArt())),
    h('div.stats', stat(d.stats.products, 'stat_products', 'box'), stat(d.stats.europe, 'st_europe', 'map-pin'), stat(d.stats.criteria, 'stat_criteria', 'list-checks'), stat(d.stats.reviews, 'st_reviews', 'users')),
    d.voting ? h('sav-alert', { variant: 'primary', class: 'vote-alert' }, icon('vote', { slot: 'icon' }), h('strong', t('voting_open', { y: d.voting.year })), ' ', t('voting_text'), ' ', h('a', { href: '#/awards/' + d.voting.year }, t('vote_now'))) : null,
    d.current?.categories.length ? contenders(d.current) : null,
    cats.length ? section(t('by_category'), h('div.cats', cats.map((c) => h('a.cat', { href: '#/products?cat=' + c.slug }, icon(c.icon), h('span', c.name), h('small', String(c.n)))))) : null,
    d.top.length ? section(t('best_tech'), h('p.muted.sec-sub', t('best_tech_sub')), grid(d.top), h('div.more', link(t('see_all'), '#/products', { icon: 'arrow-right', 'icon-placement': 'end' }))) : section(t('best_tech'), empty('box', t('no_products'), t('no_products_text'))),
    d.community?.length ? section(t('best_comm'), h('p.muted.sec-sub', t('best_comm_sub')), grid(d.community), h('div.more', link(t('see_all'), '#/products?sort=community', { icon: 'arrow-right', 'icon-placement': 'end' }))) : null,
    d.latest && d.latest.winners.length ? section(t('latest_winners', { y: d.latest.year }), h('div.winners', d.latest.winners.map((w) => h('a.winner', { href: '#/p/' + w.product.slug }, h('span.w-award', icon(w.kind === 'public' ? 'users' : 'trophy'), w.award), h('div.w-p', logo(w.product, 40), h('strong', w.product.name))))),
      h('div.more', link(t('see_edition'), '#/awards/' + d.latest.year, { icon: 'arrow-right', 'icon-placement': 'end' }))) : null,
    d.recent.length ? section(t('recently_reviewed'), grid(d.recent)) : null,
    section(t('why_title'), h('div.why',
      ...[['badge-check', 'why_indep'], ['list-checks', 'why_manual'], ['smartphone', 'why_devices'], ['history', 'why_history']].map(([ic, k]) => h('sav-card.whyc', { appearance: 'flat' }, icon(ic), h('h3', t(k)), h('p', t(k + '_t')))))),
    h('section.cta', h('div', h('h2', t('cta_title')), h('p', t('cta_text'))), S.user ? primary(t('suggest_product'), { href: '#/suggest', icon: 'lightbulb' }) : primary(t('sign_up'), { href: '#/signup', icon: 'user' })));
}

/** This year's contenders, by category, until the winners are published. */
function contenders(e) {
  const chip = (n) => h('a.cnt-p', { href: '#/p/' + encodeURIComponent(n.slug) }, logo(n, 30), h('span', n.name), n.score !== null ? h('b', { 'data-tone': tone(n.score) }, num1(n.score)) : null);
  return h('section.sec.contenders',
    h('div.cnt-head', h('div', h('sav-heading', { level: 2, size: 'md', marker: true }, t('contenders_title', { y: e.year })), h('p.muted', e.status === 'voting' ? t('contenders_vote') : t('contenders_text'))),
      primary(e.status === 'voting' ? t('vote_now') : t('all_nominees'), { href: '#/awards/' + e.year, icon: e.status === 'voting' ? 'vote' : 'trophy', size: 'sm' })),
    h('div.cnt-grid', e.categories.map((c) => h('sav-card.cnt', {}, h('div.cnt-cat', icon(c.kind === 'public' ? 'users' : 'trophy'), h('strong', c.name)), h('div.cnt-list', c.nominees.map(chip))))));
}

/** The picture of the home page: a stack of score cards leaning as in the Tilt style. */
function heroArt() {
  const mini = (name, s, h_, tag) => h('div.ha-card', { style: `--h:${h_}` }, h('span.logo.mono', { style: `--s:38px;--h:${h_}` }, name.slice(0, 2)), h('div', h('b', name), h('small', tag)), h('span.ha-score', { 'data-tone': tone(s) }, num1(s)));
  return h('div.ha', h('div.ha-trophy', icon('trophy')), mini('Mailbox', 8.9, 210, t('cat_email')), mini('Cryptpad', 8.4, 150, t('cat_office')), mini('Nextbox', 7.6, 30, t('cat_cloud')),
    h('div.ha-bars', ...[9, 7, 8.5, 6, 9.5].map((v) => h('i', { style: `height:${v * 10}%` }))));
}

// ------------------------------------------------------------------ catalogue

export async function catalogue(root, qs) {
  title(t('nav_catalogue'));
  const f = Object.fromEntries(qs);
  const setQ = (patch) => { const n = { ...f, ...patch }; Object.keys(n).forEach((k) => (n[k] === '' || n[k] === '0' || n[k] === false) && delete n[k]); go('#/products' + (Object.keys(n).length ? '?' + new URLSearchParams(n) : '')); };
  const search = h('sav-search', { placeholder: t('search_ph'), label: t('search'), value: f.q || '' });
  let timer = 0;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => setQ({ q: search.value }), 450); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(timer); setQ({ q: search.value }); } });
  const chip = (k, label, ic) => { const c = h('sav-chip', { selected: !!f[k] }, icon(ic, { slot: 'prefix' }), label); c.addEventListener('click', () => setQ({ [k]: f[k] ? '' : '1' })); return c; };
  const cat = select(t('category'), [['', t('all_categories')], ...meta().categories.map((c) => [c.slug, `${c.name} (${c.n})`])], f.cat || '', { size: 'sm' });
  cat.addEventListener('change', () => setQ({ cat: cat.value }));
  const plat = select(t('platform'), [['', t('any_platform')], ...meta().platforms.map((p) => [p, t('pf_' + p)])], f.platform || '', { size: 'sm' });
  plat.addEventListener('change', () => setQ({ platform: plat.value }));
  const sort = select(t('sort'), [['score', t('sort_score')], ['community', t('sort_community')], ['recent', t('sort_recent')], ['name', t('sort_name')]], f.sort || 'score', { size: 'sm' });
  sort.addEventListener('change', () => setQ({ sort: sort.value === 'score' ? '' : sort.value }));
  const d = await api('pub.products', null, f);
  const altName = f.alt ? (meta().alternatives.find((a) => a.key === f.alt)?.name || f.alt) : '';
  put(root,
    h('div.page-head', h('h1', altName ? t('alt_to', { x: altName }) : f.cat ? (meta().categories.find((c) => c.slug === f.cat)?.name || t('nav_catalogue')) : t('nav_catalogue')), h('p.muted', t('catalogue_text'))),
    h('div.filters', search, h('div.frow', cat, plat, sort),
      h('div.chips', chip('europe', t('f_europe'), 'map-pin'), chip('os', t('f_os'), 'code'), chip('free', t('f_free'), 'coins'), chip('selfhost', t('f_selfhost'), 'server'), chip('green', t('f_green'), 'sprout'),
        altName ? h('sav-chip', { selected: true, removable: true, onclick: () => setQ({ alt: '' }) }, t('alt_to', { x: altName })) : null)),
    h('p.count', { role: 'status' }, t('results', { n: d.products.length })),
    d.products.length ? grid(d.products) : empty('search', t('no_results'), t('no_results_text'), S.user ? btn(t('suggest_product'), { href: '#/suggest', icon: 'lightbulb' }) : null));
}

// ------------------------------------------------------------------ a product

export async function product(root, slug) {
  const { product: p } = await api('pub.product', null, { slug });
  title(p.name);
  const crit = p.scores.filter((s) => s.score !== null);
  const fav = h('sav-favourite-button', { icon: 'heart', pressed: !!p.mine?.fav, label: t('favourite') }, t('favourite'));
  fav.addEventListener('sav-change', async (e) => {
    if (!S.user) { e.preventDefault(); needSignIn(); return; }
    try { await api('me.fav', { product: p.id, on: e.detail.pressed }); toast(e.detail.pressed ? t('fav_added') : t('fav_removed'), 'success'); } catch (x) { e.preventDefault(); fail(x); }
  });
  const inTray = tray().includes(p.slug);
  const cmp = btn(inTray ? t('in_compare') : t('compare'), { icon: 'git-compare', size: 'sm', appearance: inTray ? 'soft' : 'outline', variant: inTray ? 'primary' : 'neutral', onclick: (e, b) => { toggleTray(p.slug); const on = tray().includes(p.slug); b.textContent = on ? t('in_compare') : t('compare'); b.appearance = on ? 'soft' : 'outline'; b.variant = on ? 'primary' : 'neutral'; } });
  const req = btn(t('suggest_change'), { icon: 'pencil', size: 'sm', appearance: 'ghost', onclick: () => (S.user ? requestDialog(p) : needSignIn()) });
  const share = btn(t('share'), { icon: 'link', size: 'sm', appearance: 'ghost', onclick: () => copyText(location.href.split('#')[0] + '#/p/' + p.slug, t('link_copied')) });

  put(root,
    p.status !== 'published' ? h('sav-alert', { variant: 'warning' }, icon('eye-off', { slot: 'icon' }), t('draft_notice')) : null,
    h('nav.crumbs', { 'aria-label': t('breadcrumb') }, h('a', { href: '#/products' }, t('nav_catalogue')), p.category ? [' / ', h('a', { href: '#/products?cat=' + p.category.slug }, p.category.name)] : null),
    h('section.phero',
      h('div.ph-id', logo(p, 84), h('div',
        h('h1', p.name),
        h('p.lead', p.tagline),
        facts(p, { all: true }),
        h('div.ph-plat', platformChips(p.platforms)),
        h('div.ph-actions',
          p.website ? primary(t('website'), { href: p.website, target: '_blank', rel: 'noopener nofollow', icon: 'external-link', size: 'sm' }) : null,
          p.sourceUrl ? btn(t('source_code'), { href: p.sourceUrl, target: '_blank', rel: 'noopener nofollow', icon: 'code', size: 'sm' }) : null,
          fav, cmp, share, req,
          p.mine?.canEdit ? btn(t('edit'), { icon: 'settings', size: 'sm', variant: 'primary', appearance: 'soft', href: '#/staff/product/' + p.id }) : null))),
      h('aside.ph-score',
        h('div.ps-main', ring(p.score, 104, t('score_of', { p: p.name })), h('div', h('strong', t('our_score')), h('small', t('avg_of', { n: crit.length })))),
        h('div.ps-comm', icon('users'), p.community ? h('span', h('b', num1(p.community.avg)), ' ', t('community_n', { n: p.community.n })) : h('span.muted', t('no_community'))),
        h('sav-tag', { variant: 'success', appearance: 'soft', class: 'indep-tag' }, icon('badge-check', { slot: 'prefix' }), t('independent_review')),
        p.reviewed ? h('small.muted', t('analysed_on', { d: day(p.reviewed) })) : null)),
    p.awards.length ? h('div.pawards', p.awards.map((a) => h(a.certificate ? 'a.paward' : 'div.paward', { href: a.certificate ? 'c/' + a.certificate + '/' + p.slug : null, title: a.certificate ? t('open_certificate') : null },
      a.place ? placeBadge(a.place) : h('sav-badge', { appearance: 'soft' }, t('nominee')), h('span', h('b', a.award), ' · ', String(a.year)), a.certificate ? icon('badge-check') : null))) : null,
    h('div.pcols',
      h('div.pmain',
        p.review ? section(t('our_review'), h('div.prose', p.review.split(/\n{2,}/).map((para) => h('p', para)))) : null,
        p.pros.length || p.cons.length ? h('div.pc2', h('sav-card.pros', { appearance: 'flat' }, h('h3', icon('thumbs-up'), ' ', t('pros')), h('ul', p.pros.map((x) => h('li', x)))),
          h('sav-card.cons', { appearance: 'flat' }, h('h3', icon('triangle-alert'), ' ', t('cons')), h('ul', p.cons.map((x) => h('li', x))))) : null,
        p.shots?.length ? section(t('shots'), gallery(p)) : null,
        section(t('scores'), scoreTable(p)),
        crit.length >= 3 ? h('div.radar', h('sav-chart-radar', { data: JSON.stringify({ labels: crit.map((s) => s.name), series: [{ name: p.name, values: crit.map((s) => s.score) }] }), max: 10, levels: 5, height: 340, label: t('scores') })) : null),
      h('aside.pside',
        testedBox(p),
        (p.features || []).includes('by_author') ? authorBox() : null,
        disclaimerBox(p.name),
        p.alternativesTo.length ? h('sav-card.altbox', h('h3', icon('arrow-left-right'), ' ', t('alternative_to')), h('div.chips', p.alternativesTo.map((a) => h('a.altchip', { href: '#/alternatives/' + encodeURIComponent(slugify(a)) }, a)))) : null)),
    community(p));
}

/** The screenshots in a row; one opens big in a dialog, with the previous and next ones. */
function gallery(p) {
  const open = (i) => {
    const img = h('img.shot-big', { alt: '' });
    const cap = h('p.muted.center.small');
    const show = (k) => { i = (k + p.shots.length) % p.shots.length; const s = p.shots[i]; img.src = s.url; img.alt = s.caption || p.name; cap.textContent = s.caption || `${i + 1} / ${p.shots.length}`; };
    const nav = p.shots.length > 1 ? h('div.row.center-row', btn('', { icon: 'chevron-left', label: t('previous'), square: true, onclick: () => show(i - 1) }), btn('', { icon: 'chevron-right', label: t('next'), square: true, onclick: () => show(i + 1) })) : null;
    const d = dialog({ title: p.name, width: '72rem', body: h('div.shot-view', img, cap, nav), actions: [{ label: t('close') }] });
    d.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') show(i + 1); if (e.key === 'ArrowLeft') show(i - 1); });
    show(i);
  };
  return h('div.shots', p.shots.map((s, i) => h('button.shot', { type: 'button', title: s.caption || t('open_shot'), 'aria-label': s.caption || t('open_shot'), onclick: () => open(i) },
    h('img', { src: s.url, alt: s.caption || '', loading: 'lazy', width: s.w || null, height: s.h || null }), s.caption ? h('span', s.caption) : null)));
}

function scoreTable(p) {
  return h('div.scores', p.scores.map((s) => h('div.srow',
    h('div.sname', icon(s.icon), h('span', s.name)),
    bar(s.score),
    h('b.sval', { 'data-tone': tone(s.score) }, s.score === null ? t('na') : num1(s.score)),
    s.note ? h('p.snote', s.note) : null)),
    h('p.muted.small', t('score_explain'), ' ', h('a', { href: '#/methodology' }, t('how_we_test'))));
}

function testedBox(p) {
  return h('sav-card.tested',
    h('h3', icon('smartphone'), ' ', t('tested_on')),
    p.tested.on.length ? h('ul.devices', p.tested.on.map((d) => h('li', icon(/android|iphone|ios|pixel|galaxy|phone/i.test(d) ? 'smartphone' : /ipad|tablet/i.test(d) ? 'tablet' : /mac|book|laptop/i.test(d) ? 'laptop' : 'monitor'), h('span', d)))) : h('p.muted', t('tested_none')),
    h('dl', p.tested.version ? [h('dt', t('tested_version')), h('dd', p.tested.version)] : null, p.tested.at ? [h('dt', t('tested_at')), h('dd', day(p.tested.at))] : null),
    h('p.small.muted', t('tested_note')));
}

/** A product made by the author of SavAwards: said plainly, as the independence notes promise. */
function authorBox() {
  return h('sav-card.disc.own', {}, h('h3', icon('info'), ' ', t('own_title')), h('p', t('own_text')), h('a', { href: '#/independence' }, t('read_full_notes')));
}

export function disclaimerBox(name) {
  return h('sav-card.disc', { appearance: 'flat' },
    h('h3', icon('scale'), ' ', t('disc_title')),
    h('p', t('disc_short', { p: name || t('the_product') })),
    h('a', { href: '#/independence' }, t('read_full_notes')));
}

/** Reviews of the members, comments, history of the scores. */
function community(p) {
  const myReview = p.reviews.find((r) => r.mine);
  const reviews = h('div.reviews',
    h('div.rv-head', h('p.muted', t('reviews_intro')), S.user ? primary(myReview ? t('edit_my_review') : t('write_review'), { icon: 'pencil', size: 'sm', onclick: () => reviewDialog(p, myReview) }) : btn(t('signin_to_review'), { size: 'sm', onclick: needSignIn })),
    p.reviews.length ? p.reviews.map((r) => reviewCard(p, r)) : empty('message-circle', t('no_reviews'), t('no_reviews_text')));
  const box = h('div.comments', p.comments.length ? p.comments.map((c) => commentRow(p, c)) : h('p.muted', t('no_comments')));
  const input = h('sav-textarea', { label: t('add_comment'), rows: 2, resize: 'auto', maxlength: 2000 });
  const send = primary(t('send'), { icon: 'send', size: 'sm', onclick: async () => { await api('me.comment', { product: p.id, body: input.value }); toast(t('comment_sent'), 'success'); go(location.hash); } });
  const comments = h('div', box, S.user ? h('div.cform', input, h('div.right', send), h('p.small.muted', t('comment_rules'))) : h('p', btn(t('signin_to_comment'), { size: 'sm', onclick: needSignIn })));
  const history = p.history.length ? h('sav-timeline', p.history.map((x) => h('sav-timeline-item', { time: day(x.at), datetime: x.at, icon: 'history' },
    h('span', x.criterion ? h('b', x.criterion) : h('b', t('total')), ': ', x.old === null ? '–' : num1(x.old), ' → ', x.new === null ? '–' : num1(x.new))))) : h('p.muted', t('no_history'));
  return h('section.sec.comm',
    h('sav-tabs', { label: t('community') },
      h('sav-tab', { label: `${t('member_reviews')} (${p.reviews.filter((r) => !r.hidden).length})`, icon: 'star' }, reviews),
      h('sav-tab', { label: `${t('comments')} (${p.comments.filter((c) => !c.hidden).length})`, icon: 'message-circle' }, comments),
      h('sav-tab', { label: t('score_history'), icon: 'history' }, h('p.muted.small', t('history_intro')), history)));
}

function reviewCard(p, r) {
  const help = r.mine ? null : h('sav-button', { size: 'sm', appearance: r.voted ? 'soft' : 'ghost', variant: r.voted ? 'primary' : 'neutral', icon: 'thumbs-up' }, `${t('helpful')} · ${r.helpful}`);
  help?.addEventListener('click', async () => { if (!S.user) return needSignIn(); try { await api('me.helpful', { review: r.id, on: !r.voted }); r.voted = !r.voted; r.helpful += r.voted ? 1 : -1; help.textContent = `${t('helpful')} · ${r.helpful}`; help.appearance = r.voted ? 'soft' : 'ghost'; help.variant = r.voted ? 'primary' : 'neutral'; } catch (e) { fail(e); } });
  return h('sav-card.rv' + (r.hidden ? '.hid' : ''),
    h('div.rv-top', face(r.user, 34), h('div', h('strong', r.user), h('small.muted', ago(r.updated), r.usedOn ? [' · ', icon('smartphone'), ' ', r.usedOn] : null)), h('span.grow'), h('span.rv-score', { 'data-tone': tone(r.rating) }, `${r.rating}/10`)),
    r.hidden ? h('sav-tag', { size: 'sm', variant: 'danger', appearance: 'soft' }, t('hidden')) : null,
    r.title ? h('h4', r.title) : null,
    h('p.rv-body', r.body),
    h('div.rv-act', help, h('span.grow'), r.mine ? null : reportBtn('review', r.id), p.mine?.canEdit ? modBtn('review', r) : null));
}

function commentRow(p, c) {
  return h('div.cm' + (c.hidden ? '.hid' : ''), face(c.user, 30),
    h('div.cm-b', h('div.cm-h', h('strong', c.user), c.staff ? h('sav-tag', { size: 'sm', variant: 'primary', appearance: 'soft' }, t('staff')) : null, h('small.muted', ago(c.created)), c.hidden ? h('sav-tag', { size: 'sm', variant: 'danger', appearance: 'soft' }, t('hidden')) : null),
      h('p', c.body),
      h('div.cm-a', c.mine || p.mine?.canEdit ? btn(t('delete'), { size: 'xs', appearance: 'ghost', icon: 'trash', onclick: async () => { if (await confirm(t('delete_comment'), t('delete_comment_q'), t('delete'))) { await api('me.comment.delete', { id: c.id }); go(location.hash); } } }) : null,
        !c.mine ? reportBtn('comment', c.id) : null, p.mine?.canEdit ? modBtn('comment', c) : null)));
}

const reportBtn = (kind, id) => btn(t('report'), { size: 'xs', appearance: 'ghost', icon: 'flag', onclick: async () => {
  if (!S.user) return needSignIn();
  const reason = await ask(t('report'), t('report_reason'), '', t('report'), { text: t('report_text'), multi: true, max: 500 });
  if (reason === null) return;
  await api('me.report', { kind, id, reason });
  toast(t('report_sent'), 'success');
} });
const modBtn = (kind, x) => btn(x.hidden ? t('restore') : t('hide'), { size: 'xs', appearance: 'ghost', variant: 'danger', icon: x.hidden ? 'eye' : 'eye-off', onclick: async () => { await api('staff.moderate', { kind, id: x.id, action: x.hidden ? 'restore' : 'hide' }); go(location.hash); } });

function reviewDialog(p, mine) {
  const rating = h('sav-range', { label: t('your_rating'), min: 0, max: 10, step: 1, value: mine ? mine.rating : 7, 'show-value': true, unit: '/10' });
  const ttl = field(t('review_title'), mine?.title, { maxlength: 120 });
  const body = area(t('review_body'), mine?.body, { maxlength: 4000, rows: 6, help: t('review_body_help') });
  const used = field(t('used_on'), mine?.usedOn, { maxlength: 120, placeholder: t('used_on_ph') });
  dialog({ title: mine ? t('edit_my_review') : t('write_review'), width: '36rem',
    body: h('div.form', h('p.muted.small', t('review_rules')), rating, ttl, body, used),
    actions: [mine ? { label: t('delete'), danger: true, run: async () => { if (!(await confirm(t('delete_review'), t('delete_review_q'), t('delete')))) return false; await api('me.review.delete', { product: p.id }); go(location.hash); } } : null,
      { label: t('cancel') }, { label: t('publish'), primary: true, run: async () => { await api('me.review', { product: p.id, rating: +rating.value, title: ttl.value, body: body.value, usedOn: used.value }); toast(t('review_saved'), 'success'); go(location.hash); } }].filter(Boolean) });
}

function requestDialog(p) {
  const fields = meta().requestFields || [];
  const fieldSel = select(t('what_to_change'), fields.map((f) => [f, t('rf_' + f)]), 'review');
  const proposal = area(t('proposal'), '', { maxlength: 4000, help: t('proposal_help') });
  const reason = area(t('why_source'), '', { maxlength: 2000, rows: 2, help: t('why_source_help') });
  dialog({ title: t('suggest_change'), width: '34rem', body: h('div.form', h('p.muted.small', t('request_intro', { p: p.name })), fieldSel, proposal, reason),
    actions: [{ label: t('cancel') }, { label: t('send_request'), primary: true, run: async () => { await api('me.request', { product: p.id, field: fieldSel.value, proposal: proposal.value, reason: reason.value }); toast(t('request_sent'), 'success'); } }] });
}

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\+/g, ' plus ').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ------------------------------------------------------------------ compare

export async function compare(root, slugs) {
  title(t('compare'));
  if (slugs.length < 2) { put(root, h('div.page-head', h('h1', t('compare'))), empty('git-compare', t('compare_empty'), t('compare_empty_text'), primary(t('browse'), { href: '#/products' }))); return; }
  const d = await api('pub.compare', null, { slugs: slugs.join(',') });
  const ps = d.products;
  const best = (vals) => { const n = vals.filter((v) => v !== null); return n.length ? Math.max(...n) : null; };
  const row = (label, cells, o = {}) => h('tr', o.cls ? { class: o.cls } : {}, h('th', { scope: 'row' }, label), cells.map((c) => h('td', c)));
  const scoreRow = (label, vals, ic) => { const b = best(vals); return row(h('span.cmp-l', ic ? icon(ic) : null, label), vals.map((v) => h('span.cmp-v' + (v !== null && v === b && vals.filter((x) => x === b).length < vals.length ? '.best' : ''), { 'data-tone': tone(v) }, v === null ? t('na') : num1(v), v !== null ? bar(v) : null))); };
  const yes = (v) => (v ? h('span.yes', icon('check'), t('yes')) : h('span.no', icon('x'), t('no')));
  put(root,
    h('div.page-head', h('h1', t('compare')), h('p.muted', t('compare_text'))),
    h('div.cmp-wrap', h('table.cmp',
      h('thead', h('tr', h('td'), ps.map((p) => h('th', { scope: 'col' }, h('a.cmp-p', { href: '#/p/' + p.slug }, logo(p, 44), h('strong', p.name)), h('sav-button', { size: 'xs', appearance: 'ghost', icon: 'x', label: t('remove'), onclick: () => { const l = slugs.filter((s) => s !== p.slug); sessionStorage.setItem('savawards-compare', JSON.stringify(l)); go('#/compare/' + l.join(',')); } }))))),
      h('tbody',
        scoreRow(t('our_score'), ps.map((p) => p.score), 'trophy'),
        row(t('community_avg'), ps.map((p) => (p.community ? `${num1(p.community.avg)} (${p.community.n})` : '–'))),
        row(t('based_in_label'), ps.map((p) => basedIn(p) || '–')),
        row(t('open_source'), ps.map((p) => [yes(p.openSource), p.licence ? h('small', ' ' + p.licence) : null])),
        row(t('pricing'), ps.map((p) => t('price_' + p.pricing))),
        row(t('self_host'), ps.map((p) => yes(p.selfHost))),
        ...['green', 'e2ee', 'no_ads', 'no_tracking'].map((f) => row(t('feat_' + f), ps.map((p) => yes((p.features || []).includes(f))))),
        row(t('platforms'), ps.map((p) => platformChips(p.platforms))),
        row(t('tested_on'), ps.map((p) => (p.tested.on.length ? h('ul.devices.small', p.tested.on.map((x) => h('li', x))) : '–'))),
        h('tr.cmp-sep', h('th', { colspan: ps.length + 1 }, t('scores'))),
        ...d.criteria.map((c) => scoreRow(c.name, ps.map((p) => p.scores.find((s) => s.criterion === c.id)?.score ?? null), c.icon)),
        row(t('awards'), ps.map((p) => (p.awards.length ? p.awards.filter((a) => a.place).map((a) => h('div.small', placeBadge(a.place), ' ', a.award, ' ', String(a.year))) : '–')))))),
    ps.length >= 2 && d.criteria.length >= 3 ? h('div.radar', h('sav-chart-radar', { data: JSON.stringify({ labels: d.criteria.map((c) => c.name), series: ps.map((p) => ({ name: p.name, values: d.criteria.map((c) => p.scores.find((s) => s.criterion === c.id)?.score ?? 0) })) }), max: 10, levels: 5, height: 380, label: t('scores') })) : null,
    disclaimerBox(''));
}

// ------------------------------------------------------------------ alternatives

export async function alternatives(root, key) {
  if (key) return catalogue(root, new URLSearchParams({ alt: key }));
  title(t('nav_alternatives'));
  const list = meta().alternatives;
  const q = h('sav-search', { placeholder: t('alt_search_ph'), label: t('search') });
  const box = h('div.alts');
  const draw = () => { const s = (q.value || '').toLowerCase(); put(box, list.filter((a) => a.name.toLowerCase().includes(s)).map((a) => h('a.alt', { href: '#/alternatives/' + a.key }, h('span', t('alt_to_short'), ' ', h('b', a.name)), h('sav-badge', { appearance: 'soft' }, String(a.n))))); if (!box.children.length) put(box, empty('search', t('no_results'), t('alt_none'))); };
  q.addEventListener('input', draw);
  put(root, h('div.page-head', h('h1', t('nav_alternatives')), h('p.muted', t('alternatives_text'))), q, box);
  draw();
}

// ------------------------------------------------------------------ awards

export async function awards(root, year) {
  const eds = meta().editions;
  if (!year) {
    title(t('nav_awards'));
    put(root, h('div.page-head', h('h1', t('nav_awards')), h('p.muted', t('awards_text'))),
      eds.length ? h('div.editions', eds.map((e) => h('a.edition', { href: '#/awards/' + e.year }, h('span.ed-year', String(e.year)), h('div', h('strong', e.title), h('small', t('ed_' + e.status))), icon('chevron-right')))) : empty('trophy', t('no_editions'), t('no_editions_text')),
      section(t('how_awards'), h('div.why', ...[['list-checks', 'aw_how_1'], ['users', 'aw_how_2'], ['badge-check', 'aw_how_3']].map(([ic, k]) => h('sav-card.whyc', { appearance: 'flat' }, icon(ic), h('h3', t(k)), h('p', t(k + '_t')))))));
    return;
  }
  const { edition: e } = await api('pub.edition', null, { year });
  title(e.title);
  put(root,
    h('div.page-head.ed-head', h('span.ed-big', icon('trophy'), String(e.year)), h('div', h('h1', e.title), e.intro ? h('p.lead', e.intro) : null,
      e.status === 'voting' ? h('sav-alert', { variant: e.votingOpen ? 'primary' : 'neutral' }, icon('vote', { slot: 'icon' }), e.votingOpen ? t('voting_until', { d: e.voteUntil ? day(e.voteUntil) : '…' }) : t('voting_closed')) : null,
      e.status === 'nominees' ? h('sav-alert', { variant: 'primary' }, icon('trophy', { slot: 'icon' }), t('ed_nominees_notice')) : null,
      e.status === 'draft' ? h('sav-alert', { variant: 'warning' }, t('ed_draft')) : null)),
    e.categories.length ? e.categories.map((c) => awardCategory(e, c)) : empty('trophy', t('no_categories'), ''),
    disclaimerBox(''));
}

function awardCategory(e, c) {
  const pub_ = e.status === 'published' || e.status === 'draft';
  const winners = c.nominees.filter((n) => n.place).sort((a, b) => a.place - b.place);
  const others = c.nominees.filter((n) => !n.place);
  const voteBtn = (n) => {
    if (c.kind !== 'public' || !e.votingOpen) return null;
    const mine = c.myVote === n.id;
    return btn(mine ? t('your_vote') : t('vote'), { size: 'sm', icon: mine ? 'circle-check' : 'vote', appearance: mine ? 'solid' : 'outline', variant: mine ? 'success' : 'primary', onclick: async () => { if (!S.user) return needSignIn(); await api('me.vote', { category: c.id, product: n.id }); toast(t('vote_saved'), 'success'); go(location.hash); } });
  };
  return h('section.sec.acat',
    h('div.acat-h', h('sav-heading', { level: 2, size: 'md', marker: true }, c.name), c.kind === 'public' ? h('sav-tag', { variant: 'primary', appearance: 'soft' }, icon('users', { slot: 'prefix' }), t('peoples_choice')) : h('sav-tag', { appearance: 'soft' }, icon('scale', { slot: 'prefix' }), t('jury_award'))),
    c.desc ? h('p.muted', c.desc) : null,
    winners.length && pub_ ? h('div.podium', winners.map((n) => h('sav-card.pod.p' + n.place, { appearance: n.place === 1 ? 'elevated' : null },
      placeBadge(n.place),
      h('a.pod-p', { href: '#/p/' + n.slug }, logo(n, 56), h('div', h('strong', n.name), h('small', n.tagline))),
      n.motivation ? h('p.pod-m', n.motivation) : null,
      h('div.pod-f', ring(n.score, 46), n.votes !== null ? h('small', t('votes_n', { n: n.votes })) : null, h('span.grow'),
        n.certificate ? btn(t('certificate'), { size: 'sm', icon: 'badge-check', href: 'c/' + n.certificate + '/' + n.slug }) : null)))) : null,
    (pub_ ? others : c.nominees).length ? h('div', h('h3.nom-h', t(pub_ && winners.length ? 'other_nominees' : 'nominees')),
      h('div.noms', (pub_ ? others : c.nominees).map((n) => h('div.nom', h('a', { href: '#/p/' + n.slug }, logo(n, 36), h('span', n.name)), n.votes !== null && e.status === 'published' ? h('small', t('votes_n', { n: n.votes })) : null, h('span.grow'), voteBtn(n))))) : null);
}

// ------------------------------------------------------------------ methodology, independence

export function methodology(root) {
  title(t('nav_method'));
  put(root, h('div.page-head', h('h1', t('nav_method')), h('p.lead', t('method_lead'))),
    h('div.prose', t('method_text').split('\n\n').map((x) => h('p', x))),
    section(t('criteria'), h('div.crit', meta().criteria.map((c) => h('sav-card.critc', h('h3', icon(c.icon), ' ', c.name), h('p', c.desc))))),
    section(t('scale_title'), h('div.scale', [[10, 'scale_10'], [8, 'scale_8'], [6, 'scale_6'], [4, 'scale_4'], [2, 'scale_2'], [0, 'scale_0']].map(([v, k]) => h('div.scl', h('span.sval', { 'data-tone': tone(v) }, v === 0 ? '0–1' : `${v}–${v + 1}`.replace('10–11', '10')), h('span', t(k))))), h('p.muted', t('scale_na'))),
    section(t('process_title'), h('ol.steps', [1, 2, 3, 4, 5].map((i) => h('li', h('strong', t('proc_' + i)), h('span', t('proc_' + i + '_t')))))),
    disclaimerBox(''));
}

export function independence(root) {
  title(t('independence'));
  const block = (ic, k) => h('sav-card.legal', h('h2', icon(ic), ' ', t(k)), t(k + '_t').split('\n\n').map((x) => h('p', x)));
  put(root, h('div.page-head', h('h1', t('independence')), h('p.lead', t('indep_lead'))),
    h('div.legals', block('badge-check', 'lg_indep'), block('smartphone', 'lg_devices'), block('scale', 'lg_opinion'), block('shield', 'lg_liability'), block('flag', 'lg_trademarks'), block('pencil', 'lg_corrections'), block('users', 'lg_community'), block('trophy', 'lg_certs')));
}

export function verifyForm(root) {
  title(t('verify_certificate'));
  const code = h('sav-input', { label: t('cert_code'), placeholder: 'SA-2026-XXXX-XXXX', autofocus: true, class: 'mono' });
  const out = h('div');
  const run = async () => {
    const d = await api('pub.verify', null, { code: code.value });
    if (!d.found) { put(out, h('sav-alert', { variant: 'danger' }, icon('circle-x', { slot: 'icon' }), t('cert_not_found'))); return; }
    put(out, h('sav-alert', { variant: d.revoked ? 'danger' : 'success' }, icon(d.revoked ? 'circle-x' : 'badge-check', { slot: 'icon' }),
      h('strong', d.revoked ? t('cert_revoked') : t('cert_valid')), ' ', `${d.product} · ${d.award} · ${d.year} (${t('place_' + d.place)})`, ' ', h('a', { href: d.url }, t('open_certificate'))));
  };
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') run().catch(fail); });
  put(root, h('div.narrow', h('div.page-head', h('h1', t('verify_certificate')), h('p.muted', t('verify_text'))), h('div.form', code, primary(t('verify'), { icon: 'badge-check', onclick: run })), out));
}

export const notFound = () => h('div.narrow', empty('search', t('not_found'), t('not_found_text'), primary(t('go_home'), { href: '#/' })));
export const errorBox = (e) => h('div.narrow', empty(e?.code === 'forbidden' ? 'lock' : 'triangle-alert', e?.code === 'forbidden' ? t('forbidden') : t('error'), errText(e), btn(t('retry'), { onclick: () => go(location.hash) })));
