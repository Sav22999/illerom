/**
 * The staff area. Moderators: what waits for them and the products they look after. Administrators: also products,
 * criteria, categories, people, awards and the audit log. The master administrator: also administrators and certificates.
 */
import { h, put, icon, btn, primary, face, dialog, confirm, ask, toast, fail, empty, go, day, ago, num1, ring, tone, logo, field, area as textArea, select, sw, val, countries, copyText } from './ui.js';
import { t, getLang } from './i18n.js';
import { basedIn } from './public.js';
import { S, api, isAdmin, isMaster, loadMeta } from './store.js';

const TABS = [['queue', 'inbox', 'st_queue', 3], ['products', 'box', 'st_products', 3], ['criteria', 'list-checks', 'st_criteria', 5], ['categories', 'layout-grid', 'st_categories', 5],
  ['users', 'users', 'st_users', 5], ['awards', 'trophy', 'st_awards', 5], ['certificates', 'badge-check', 'st_certificates', 10], ['audit', 'history', 'st_audit', 5]];

export async function area(root, tab, id) {
  document.title = t('staff_area') + ' · SavAwards';
  const body = h('div.st-body');
  const allowed = TABS.filter((x) => S.user.role >= x[3]);
  const navTab = tab === 'product' ? 'products' : tab;
  put(root, h('div.staff',
    h('nav.st-nav', { 'aria-label': t('staff_area') }, h('div.st-who', icon('shield-check'), h('span', t('role_' + S.user.role))),
      allowed.map(([k, ic, label]) => h('a', { href: '#/staff/' + k, 'aria-current': navTab === k ? 'page' : null }, icon(ic), h('span', t(label))))),
    body));
  const v = { queue, products, product, criteria, categories, users, awards, certificates, audit }[tab];
  const need = TABS.find((x) => x[0] === navTab)?.[3] ?? 99;
  if (!v || S.user.role < need) { put(body, empty('lock', t('forbidden'), '')); return; }
  return await v(body, id);
}

const head = (title, text, ...right) => h('div.st-head', h('div', h('h1', title), text ? h('p.muted', text) : null), h('div.row.wrap', right));
const reload = () => go(location.hash);

// ------------------------------------------------------------------ queue

async function queue(root) {
  const d = await api('staff.queue');
  const reqCard = (r) => h('sav-card.q', {},
    h('div.row.wrap', h('a', { href: '#/p/' + r.product.slug }, h('strong', r.product.name)), h('sav-tag', { size: 'sm', appearance: 'soft' }, t('rf_' + r.field)), h('span.grow'), h('small.muted', r.user || t('deleted_user'), ' · ', ago(r.created))),
    h('pre.q-text', r.proposal), r.reason ? h('p.small.muted', h('b', t('why_source')), ': ', r.reason) : null,
    h('div.row.wrap.right', btn(t('edit_product'), { size: 'sm', appearance: 'ghost', icon: 'pencil', href: '#/staff/product/' + r.product.id }),
      btn(t('reject'), { size: 'sm', variant: 'danger', icon: 'x', onclick: () => decide('staff.request', r.id, false) }), primary(t('accept_btn'), { size: 'sm', icon: 'check', onclick: () => decide('staff.request', r.id, true) })));
  const repCard = (r) => h('sav-card.q', {},
    h('div.row.wrap', h('sav-tag', { size: 'sm', variant: 'danger', appearance: 'soft' }, icon('flag', { slot: 'prefix' }), t(r.kind === 'review' ? 'review' : 'comment'), ' · ', t('reports_n', { n: r.n })), h('a', { href: '#/p/' + r.product.slug }, r.product.name), h('span.grow'), h('small.muted', r.author || '')),
    h('pre.q-text', r.body), r.reasons.length ? h('ul.small', r.reasons.map((x) => h('li', x))) : null,
    h('div.row.wrap.right', btn(t('dismiss'), { size: 'sm', onclick: async () => { await api('staff.report', { kind: r.kind, id: r.id, action: 'dismiss' }); reload(); } }),
      btn(t('hide'), { size: 'sm', variant: 'danger', appearance: 'solid', icon: 'eye-off', onclick: async () => { await api('staff.report', { kind: r.kind, id: r.id, action: 'hide' }); reload(); } })));
  const sugCard = (s) => h('sav-card.q', {},
    h('div.row.wrap', h('strong', s.name), s.website ? h('a', { href: s.website, target: '_blank', rel: 'noopener nofollow' }, s.website) : null, h('span.grow'), h('small.muted', s.user || t('deleted_user'), ' · ', ago(s.created))),
    s.alternativeTo ? h('p.small', t('alternative_to'), ': ', s.alternativeTo) : null, s.reason ? h('p.small', s.reason) : null,
    h('div.row.wrap.right', btn(t('reject'), { size: 'sm', variant: 'danger', icon: 'x', onclick: () => decide('staff.suggestion', s.id, false) }),
      btn(t('accept_btn'), { size: 'sm', icon: 'check', onclick: () => decide('staff.suggestion', s.id, true) }),
      primary(t('accept_draft'), { size: 'sm', icon: 'plus', onclick: () => decide('staff.suggestion', s.id, true, true) })));
  put(root, head(t('st_queue'), t('queue_text')),
    h('h2', t('edit_requests'), ' ', h('sav-badge', { appearance: 'soft' }, String(d.requests.length))), d.requests.length ? d.requests.map(reqCard) : h('p.muted', t('nothing_waiting')),
    h('h2', t('reports'), ' ', h('sav-badge', { appearance: 'soft' }, String(d.reports.length))), d.reports.length ? d.reports.map(repCard) : h('p.muted', t('nothing_waiting')),
    isAdmin() ? [h('h2', t('suggestions'), ' ', h('sav-badge', { appearance: 'soft' }, String(d.suggestions.length))), d.suggestions.length ? d.suggestions.map(sugCard) : h('p.muted', t('nothing_waiting'))] : null);
}

async function decide(route, id, accept, draft = false) {
  const reply = await ask(accept ? t('accept_btn') : t('reject'), t('reply_optional'), '', accept ? t('accept_btn') : t('reject'), { multi: true, optional: true, max: 1000, text: t('reply_text') });
  if (reply === null) return;
  const r = await api(route, { id, accept, reply, draft });
  toast(t('done'), 'success');
  if (r.product) go('#/staff/product/' + r.product); else reload();
}

// ------------------------------------------------------------------ products

async function products(root) {
  const d = await api('staff.products');
  // the filters, kept in this browser between visits
  const KEY = 'savawards-staff-filters';
  let f = {};
  try { f = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* none */ }
  f = { q: '', cats: [], status: '', area: '', sort: 'name', todo: [], ...f };
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify({ ...f, q: '' })); } catch { /* private mode */ } };
  const q = h('sav-search', { placeholder: t('search_products_ph'), label: t('search'), value: f.q });
  const used = new Set(d.products.map((p) => p.category?.slug || ''));
  const cats = h('sav-select', { label: t('categories'), multiple: true, searchable: true, placeholder: t('all_categories'), 'max-chips': 3, size: 'sm', value: f.cats.join(',') },
    S.meta.categories.filter((c) => used.has(c.slug)).map((c) => h('option', { value: c.slug }, c.name)), used.has('') ? h('option', { value: '_none' }, t('no_category')) : null);
  const status = select(t('status'), [['', t('any_status')], ['draft', t('draft')], ['published', t('published')]], f.status, { size: 'sm' });
  const area = select(t('area'), [['', t('any_area')], ['eu', t('region_eu')], ['efta', t('region_efta')], ['uk', t('region_uk')], ['europe', t('region_europe')], ['world', t('area_world')], ['none', t('area_none')]], f.area, { size: 'sm' });
  const sort = select(t('sort'), [['name', t('sort_name')], ['updated', t('sort_updated')], ['score', t('sort_score')], ['shots', t('sort_shots')]], f.sort, { size: 'sm' });
  const TODO = [['unanalysed', 'filter_unanalysed', 'history'], ['unscored', 'filter_unscored', 'list-checks'], ['noshots', 'filter_noshots', 'image'], ['notested', 'filter_notagline', 'pencil'], ['author', 'feat_by_author', 'info'], ['os', 'open_source', 'code']];
  const chips = h('div.chips', TODO.map(([k, label, ic]) => { const c = h('sav-chip', { selected: f.todo.includes(k) }, icon(ic, { slot: 'prefix' }), t(label)); c.addEventListener('click', () => { const on = !f.todo.includes(k); f.todo = on ? [...f.todo, k] : f.todo.filter((x) => x !== k); c.selected = on; keep(); draw(); }); c.dataset.k = k; return c; }));
  const clear = btn(t('clear_filters'), { size: 'sm', appearance: 'ghost', icon: 'x', onclick: () => { f = { q: '', cats: [], status: '', area: '', sort: 'name', todo: [] }; keep(); q.value = ''; cats.value = ''; status.value = ''; area.value = ''; sort.value = 'name'; chips.querySelectorAll('sav-chip').forEach((c) => { c.selected = false; }); draw(); } });
  const count = h('p.count', { role: 'status' });
  const list = h('div.list');
  const multi = (el) => { const v = el.value; return (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => x.trim()).filter(Boolean); };
  const test = {
    unanalysed: (p) => !p.reviewed, unscored: (p) => p.score === null, noshots: (p) => !p.shots, notested: (p) => !p.tagline,
    author: (p) => (p.features || []).includes('by_author'), os: (p) => p.openSource,
  };
  const draw = () => {
    const s = (q.value || '').toLowerCase().trim();
    let rows = d.products.filter((p) => (!s || (p.name + ' ' + (p.alternativesTo || []).join(' ') + ' ' + (p.tagline || '')).toLowerCase().includes(s))
      && (!f.cats.length || f.cats.includes(p.category?.slug || '_none'))
      && (!f.status || p.status === f.status)
      && (!f.area || (f.area === 'none' ? !p.country : p.region === f.area))
      && f.todo.every((k) => test[k](p)));
    const by = { name: (a, b) => a.name.localeCompare(b.name), updated: (a, b) => String(b.updated || '').localeCompare(String(a.updated || '')),
      score: (a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name), shots: (a, b) => (b.shots || 0) - (a.shots || 0) || a.name.localeCompare(b.name) }[f.sort] || ((a, b) => a.name.localeCompare(b.name));
    rows = rows.sort(by);
    const active = f.cats.length + (f.status ? 1 : 0) + (f.area ? 1 : 0) + f.todo.length;
    put(count, t('showing', { n: rows.length, m: d.products.length }), active ? [' · ', t('filters_n', { n: active })] : null);
    clear.hidden = !active && !s;
    put(list, rows.slice(0, 400).map((p) => h('a.li.pli', { href: '#/staff/product/' + p.id }, logo(p, 36),
      h('div.pli-n', h('strong', p.name), h('small.muted', p.category?.name || t('no_category'))),
      h('span.grow'),
      h('div.pli-tags', basedIn(p), (p.features || []).includes('by_author') ? h('sav-tag', { size: 'sm', variant: 'warning', appearance: 'soft' }, icon('info', { slot: 'prefix' }), t('by_author_short')) : null,
        p.shots ? h('sav-tag', { size: 'sm', appearance: 'soft', title: t('shots') }, icon('image', { slot: 'prefix' }), String(p.shots)) : null,
        p.status === 'draft' ? h('sav-tag', { size: 'sm', variant: 'warning', appearance: 'soft' }, t('draft')) : h('sav-tag', { size: 'sm', variant: 'success', appearance: 'soft' }, t('published'))),
      h('b.pli-s', { 'data-tone': tone(p.score) }, num1(p.score)), h('small.muted.pli-d', p.reviewed ? day(p.reviewed) : t('never_analysed')))),
      rows.length > 400 ? h('p.muted.small', t('first_400')) : null);
    if (!rows.length) put(list, empty('search', t('no_results'), t('no_results_filters'), active || s ? btn(t('clear_filters'), { size: 'sm', icon: 'x', onclick: () => clear.click() }) : null));
  };
  let timer = 0;
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(draw, 150); });
  cats.addEventListener('change', () => { f.cats = multi(cats); keep(); draw(); });
  status.addEventListener('change', () => { f.status = status.value; keep(); draw(); });
  area.addEventListener('change', () => { f.area = area.value; keep(); draw(); });
  sort.addEventListener('change', () => { f.sort = sort.value || 'name'; keep(); draw(); });
  const importBtn = isAdmin() && d.starter ? btn(t('import_starter', { n: d.starter }), { icon: 'download', onclick: async () => {
    if (!(await confirm(t('import_starter_title'), t('import_starter_q', { n: d.starter }), t('import_btn'), false))) return;
    const r = await api('staff.import', {});
    toast(t('import_done', { a: r.added, s: r.skipped }), 'success');
    await loadMeta();
    reload();
  } }) : null;
  put(root, head(t('st_products'), d.all ? t('products_all') : t('products_scope'), importBtn, isAdmin() ? primary(t('new_product'), { icon: 'plus', href: '#/staff/product/new' }) : null),
    h('div.filters', q, h('div.frow4', cats, status, area, sort), chips, h('div.row.wrap', count, h('span.grow'), clear)), list);
  draw();
}

async function product(root, id) {
  const isNew = id === 'new';
  if (isNew && !isAdmin()) { put(root, empty('lock', t('forbidden'), '')); return; }
  const [d, al] = await Promise.all([isNew ? { product: null, criteria: S.meta.criteria, categories: S.meta.categories } : api('staff.product', null, { id }), api('staff.alternatives')]);
  const p = d.product || { name: '', slug: '', status: 'draft', raw: {}, scores: d.criteria.map((c) => ({ criterion: c.id, name: c.name, icon: c.icon, score: null, note_it: '', note_en: '' })), platforms: [], features: [], alternativesTo: [], openSource: false, selfHost: false, pricing: 'free', country: '' };
  const r = p.raw || {};
  const F = {
    name: field(t('product_name'), p.name, { maxlength: 90, required: true, placeholder: 'e.g. Proton Mail' }),
    slug: field(t('slug'), p.slug, { maxlength: 90, help: t('slug_help') }),
    category_id: select(t('category'), [['', t('no_category')], ...d.categories.map((c) => [String(c.id), c.name])], r.category_id ? String(r.category_id) : ''),
    status: isAdmin() ? h('sav-radio-group', { appearance: 'buttons', value: p.status, label: t('status'), class: 'wide' }, h('sav-radio', { value: 'draft' }, t('draft')), h('sav-radio', { value: 'published' }, t('published'))) : null,
    tagline_it: field(t('tagline') + ' · IT', r.tagline_it, { maxlength: 200 }), tagline_en: field(t('tagline'), r.tagline_en, { maxlength: 200, help: t('tagline_help') }),
    website: field(t('website'), r.website, { type: 'url', maxlength: 300, placeholder: 'https://' }), source_url: field(t('source_code'), r.source_url, { type: 'url', maxlength: 300, placeholder: 'https://', help: t('source_help') }),
    licence: select(t('licence'), [['', '—'], ...[...al.licences, ...(r.licence && !al.licences.includes(r.licence) ? [r.licence] : [])].map((l) => [l, l === 'Proprietary' ? t('lic_proprietary') : l === 'Mixed' ? t('lic_mixed') : l])], r.licence || '', { help: t('licence_help') }),
    open_source: sw(t('open_source'), p.openSource), self_host: sw(t('self_host'), p.selfHost),
    pricing: select(t('pricing'), S.meta.pricing.map((x) => [x, t('price_' + x)]), p.pricing),
    country: h('sav-country-choice', { label: t('based_in_label'), value: p.country || '', code: 'alpha2', locale: 'en-GB', help: t('based_in_help') }),
    alternatives_to: altPicker(p.alternativesTo || [], al.names),
    review_it: textArea(t('our_review') + ' · IT', r.review_it, { rows: 8, maxlength: 20000 }), review_en: textArea(t('our_review'), r.review_en, { rows: 9, maxlength: 20000, help: t('review_help') }),
    pros_it: textArea(t('pros') + ' · IT', r.pros_it), pros_en: textArea(t('pros'), r.pros_en, { help: t('one_per_line') }),
    cons_it: textArea(t('cons') + ' · IT', r.cons_it), cons_en: textArea(t('cons'), r.cons_en, { help: t('one_per_line') }),
    tested_on: textArea(t('tested_on'), r.tested_on, { rows: 4, maxlength: 3000, help: t('tested_on_help'), placeholder: 'Google Pixel 8 · Android 15 · app 4.2\nMacBook Air M2 · macOS 15 · Firefox 133' }),
    tested_version: field(t('tested_version'), r.tested_version, { maxlength: 60 }),
    tested_at: field(t('tested_at'), r.tested_at, { type: 'date' }),
  };
  // a free licence switches "open source" on, a proprietary one off
  F.licence.addEventListener('change', () => { const l = F.licence.value; if (al.openLicences.includes(l)) F.open_source.checked = true; else if (l === 'Proprietary') F.open_source.checked = false; });
  // the address follows the name until it is changed by hand
  let slugTouched = !isNew && !!p.slug;
  const slugify = (x) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\+/g, ' plus ').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  const slugPrev = h('code.slug-prev');
  const showSlug = () => { slugPrev.textContent = location.origin + location.pathname + '#/p/' + (F.slug.value || slugify(F.name.value) || '…'); };
  F.name.addEventListener('input', () => { if (!slugTouched) F.slug.value = slugify(F.name.value); showSlug(); });
  F.slug.addEventListener('input', () => { slugTouched = true; showSlug(); });
  showSlug();
  const chips = (label, all, on, text, tip) => h('sav-chip-group', { multiple: true, label }, all.map((x) => h('sav-chip', { value: x, selected: on.has(x), title: tip ? tip(x) : null }, text(x))));
  const platChips = chips(t('platforms'), S.meta.platforms, new Set(p.platforms || []), (x) => t('pf_' + x));
  const featChips = chips(t('badges'), S.meta.features || [], new Set(p.features || []), (x) => t('feat_' + x), (x) => t('feat_' + x + '_t'));
  const picked = (g) => [...g.querySelectorAll('sav-chip')].filter((c) => c.selected).map((c) => c.getAttribute('value'));
  // logo
  let logoData; // undefined = unchanged, '' = removed, data URL = new
  const logoPrev = h('div.logo-prev', logo(p, 72));
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', hidden: true });
  file.addEventListener('change', async () => { const f = file.files[0]; if (!f) return; try { logoData = await shrink(f); put(logoPrev, h('img.logo', { src: logoData, width: 72, height: 72, alt: '', style: '--s:72px' })); dirty(); } catch (e) { fail(e); } });
  const logoBox = h('div.logo-box', logoPrev, h('div.stack.tight', btn(t('upload_logo'), { icon: 'upload', size: 'sm', onclick: () => file.click() }),
    btn(t('remove_logo'), { size: 'sm', appearance: 'ghost', onclick: () => { logoData = ''; put(logoPrev, logo({ name: F.name.value || '?' }, 72)); dirty(); } }), h('small.muted', t('logo_help'))), file);
  // screenshots: up to 10, made smaller in the browser, reordered by dragging, uploaded one by one when saving
  const MAX_SHOTS = 10;
  const shotList = h('sav-sortable.shots-ed', { label: t('shots') });
  const shotCount = h('sav-badge', { appearance: 'soft' });
  const shotFile = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, hidden: true });
  const shotItems = () => [...shotList.children];
  const countShots = () => { shotCount.textContent = `${shotItems().length}/${MAX_SHOTS}`; addShotBtn.disabled = shotItems().length >= MAX_SHOTS; };
  const shotEl = (sh) => {
    const cap = h('sav-input', { size: 'sm', value: sh.caption || '', maxlength: 160, placeholder: t('shot_caption'), 'aria-label': t('shot_caption') });
    const el = h('div.shot-ed', h('img', { src: sh.url || sh.data, alt: '', loading: 'lazy' }), cap,
      h('sav-button', { size: 'xs', appearance: 'ghost', variant: 'danger', square: true, icon: 'trash', label: t('remove'), class: 'shot-rm', onclick: () => { el.remove(); countShots(); dirty(); } }));
    el.shot = sh;
    el.caption = () => cap.value;
    return el;
  };
  const addShots = async (files) => {
    for (const f of [...files]) {
      if (shotItems().length >= MAX_SHOTS) { toast(t('shots_max'), 'warning'); break; }
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) continue;
      try { shotList.append(shotEl({ data: await shrinkImage(f, 1920, 0.85), caption: '' })); } catch (e) { fail(e); }
    }
    countShots();
    dirty();
  };
  shotFile.addEventListener('change', () => { addShots(shotFile.files); shotFile.value = ''; });
  const addShotBtn = btn(t('add_shots'), { icon: 'image', size: 'sm', onclick: () => shotFile.click() });
  (p.shots || []).forEach((sh) => shotList.append(shotEl(sh)));
  const shotDrop = h('div.shot-drop', h('div.row.wrap', addShotBtn, shotCount, h('small.muted', t('shots_help'))), shotList, shotFile);
  shotDrop.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); shotDrop.classList.add('over'); } });
  shotDrop.addEventListener('dragleave', () => shotDrop.classList.remove('over'));
  shotDrop.addEventListener('drop', (e) => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); shotDrop.classList.remove('over'); addShots(e.dataTransfer.files); });
  shotList.addEventListener('sav-sort', () => dirty());
  countShots();
  // scores: a compact row per criterion, the note right under it
  const total = h('div.st-total');
  const scoreInputs = p.scores.map((sc) => {
    const n = h('sav-number-input', { 'aria-label': sc.name, min: 0, max: 10, step: 0.5, value: sc.score ?? '', size: 'sm', placeholder: t('na'), class: 'sc-num' });
    const it = textArea(t('note') + ' · IT', sc.note_it, { rows: 2, maxlength: 2000, size: 'sm' }), en = textArea(t('note'), sc.note_en, { rows: 2, maxlength: 2000, size: 'sm', placeholder: t('note_ph') });
    return { s: sc, n, it, en, el: h('div.st-score', h('div.st-sh', icon(sc.icon), h('strong', sc.name), n), en) };
  });
  const readScore = (n) => { const v = parseFloat(String(n.value).replace(',', '.')); return Number.isFinite(v) ? Math.max(0, Math.min(10, Math.round(v * 2) / 2)) : null; };
  // ready to publish: what a public page needs, ticked while filling in
  const lines = (x) => String(x || '').split('\n').filter((l) => l.trim()).length;
  const CHECKS = [
    ['chk_identity', () => F.name.value.trim() && F.category_id.value && F.tagline_en.value.trim()],
    ['chk_country', () => !!F.country.value],
    ['chk_licence', () => !!F.licence.value && !!F.website.value.trim()],
    ['chk_platforms', () => picked(platChips).length > 0],
    ['chk_alternatives', () => F.alternatives_to.values().length > 0],
    ['chk_review', () => F.review_en.value.trim().length >= 200 && lines(F.pros_en.value) > 0 && lines(F.cons_en.value) > 0],
    ['chk_tested', () => lines(F.tested_on.value) > 0 && !!F.tested_at.value],
    ['chk_scores', () => scoreInputs.filter((x) => readScore(x.n) !== null).length >= Math.ceil(scoreInputs.length / 2)],
  ];
  const checklist = h('ul.checklist');
  const ready = h('div.ready-h');
  const savebarInfo = h('span.sb-info');
  const unsaved = h('sav-tag', { size: 'sm', variant: 'warning', appearance: 'soft', hidden: true }, t('unsaved'));
  const missing = () => CHECKS.filter(([, ok]) => !ok()).map(([k]) => t(k));
  const refresh = () => {
    const v = scoreInputs.map((x) => readScore(x.n)).filter((x) => x !== null);
    const avg = v.length ? v.reduce((a, b2) => a + b2, 0) / v.length : null;
    put(total, ring(avg, 64), h('div', h('strong', t('total_preview')), h('small.muted', t('avg_of', { n: v.length }))));
    const done = CHECKS.filter(([, ok]) => ok()).length;
    put(ready, h('strong', t('ready_title')), h('sav-badge', { appearance: 'soft', variant: done === CHECKS.length ? 'success' : 'neutral' }, `${done}/${CHECKS.length}`));
    put(checklist, CHECKS.map(([k, ok]) => h('li' + (ok() ? '.ok' : ''), icon(ok() ? 'circle-check' : 'circle'), h('span', t(k)))));
    savebarInfo.textContent = `${t('ready_title')}: ${done}/${CHECKS.length}${isDirty ? ' · ' + t('unsaved') : ''}`;
  };
  let isDirty = false;
  const dirty = () => { isDirty = true; unsaved.hidden = false; refresh(); };
  const reviewed = sw(t('mark_analysed'), isNew);
  const doSave = async () => {
    const status = F.status?.value || p.status;
    const miss = missing();
    if (status === 'published' && miss.length && !(await confirm(t('publish_incomplete_title'), t('publish_incomplete_q', { x: miss.join(', ') }), t('publish_anyway'), false))) return;
    const b = { id: isNew ? 0 : p.id, platforms: picked(platChips), features: picked(featChips), reviewed: reviewed.checked,
      scores: scoreInputs.map((x) => ({ criterion: x.s.criterion, score: readScore(x.n), note_it: x.it.value, note_en: x.en.value })) };
    for (const [k, el] of Object.entries(F)) if (el) b[k] = k === 'alternatives_to' ? el.values() : val(el);
    b.status = status;
    b.slug = F.slug.value || slugify(F.name.value);
    b.country = String(F.country.value || '').slice(0, 2).toUpperCase();
    if (logoData !== undefined) b.logo = logoData;
    const res = await api('staff.product.save', b);
    const pid = res.id;
    for (const el of shotItems()) {
      if (el.shot.id) continue;
      const r2 = await api('staff.shot.add', { product: pid, data: el.shot.data, caption: el.caption() });
      el.shot.id = r2.id;
    }
    await api('staff.shots.save', { product: pid, items: shotItems().map((el) => ({ id: el.shot.id, caption: el.caption() })) });
    isDirty = false;
    toast(t('saved'), 'success');
    loadMeta().catch(() => {});
    if (isNew) go('#/staff/product/' + res.id); else reload();
  };
  const saveBtn = (o = {}) => primary(t('save'), { icon: 'save', onclick: doSave, ...o });
  const del = isAdmin() && !isNew ? btn(t('delete'), { icon: 'trash', variant: 'danger', appearance: 'ghost', onclick: async () => { if (!(await confirm(t('delete_product'), t('delete_product_q', { p: p.name }), t('delete')))) return; await api('staff.product.delete', { id: p.id }); isDirty = false; toast(t('deleted'), 'success'); go('#/staff/products'); } }) : null;
  const sec = (n, title, text, ...kids) => h('sav-card.st-card.st-sec', {}, h('div.sec-h', h('span.sec-n', String(n)), h('div', h('h2', title), text ? h('p.muted.small', text) : null)), h('div.form', kids));
  put(root,
    head(isNew ? t('new_product') : p.name, isNew ? t('new_product_text') : (p.updated ? t('last_change', { d: day(p.updated) }) : ''), btn(t('back'), { icon: 'arrow-left', appearance: 'ghost', href: '#/staff/products' }),
      !isNew && p.status === 'published' ? btn(t('view_page'), { icon: 'external-link', href: '#/p/' + p.slug }) : null, del),
    h('div.st-cols',
      h('div.st-main',
        sec(1, t('sec_identity'), t('sec_identity_t'), h('div.ident', logoBox, h('div.form', F.name, F.category_id)), F.tagline_en, h('div.g2', F.website, F.source_url),
          h('sav-details', { summary: t('address'), appearance: 'plain' }, h('div.form', F.slug, slugPrev))),
        sec(2, t('sec_facts'), t('sec_facts_t'), h('div.g2', F.country, F.pricing), h('div.g2', F.licence, h('div.stack.sw-stack', F.open_source, F.self_host)), featChips, h('p.small.muted', t('badges_help')), platChips, F.alternatives_to),
        sec(3, t('our_review'), t('review_guide'), F.review_en, h('div.g2', F.pros_en, F.cons_en)),
        sec(4, t('tested_on'), t('tested_guide'), F.tested_on, devicePicker(F.tested_on, al.devices || []), h('div.g2', F.tested_version, F.tested_at)),
        sec(5, t('shots'), t('shots_guide'), shotDrop),
        sec(6, t('scores'), t('scores_guide'), h('div.scores-ed', scoreInputs.map((x) => x.el)))),
      h('aside.st-side',
        h('sav-card.st-card.sticky.pub-card', {}, h('div.pub-h', h('h2', t('publish_box')), unsaved), F.status, total, ready, checklist, reviewed, h('p.small.muted', t('mark_analysed_help')), saveBtn({ block: true })))),
    h('div.st-savebar', savebarInfo, saveBtn()));
  // every change: the checklist and the total follow, and leaving asks first
  for (const ev of ['input', 'change', 'sav-remove']) root.addEventListener(ev, (e) => { if (e.target.closest?.('.st-cols')) dirty(); });
  root.addEventListener('click', (e) => { if (e.target.closest?.('sav-chip')) setTimeout(dirty, 0); });
  refresh();
  const leave = (e) => { if (isDirty) { e.preventDefault(); e.returnValue = ''; } };
  addEventListener('beforeunload', leave);
  return () => removeEventListener('beforeunload', leave);
}

/**
 * "Alternative to": the names chosen as tags, and a button that opens a dialog to search the names already known (the
 * well-known services and the ones of the other products). A new name is added only on purpose, and a similar one is
 * pointed out first, so the same service is never written in two ways.
 */
function altPicker(initial, known) {
  let chosen = [...initial];
  const key = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
  const tags = h('div.chips.alt-tags');
  const drawTags = () => put(tags, chosen.length ? chosen.map((n) => { const tg = h('sav-tag', { size: 'sm', removable: true, appearance: 'soft' }, n); tg.addEventListener('sav-remove', () => { chosen = chosen.filter((x) => x !== n); drawTags(); }); return tg; }) : h('span.muted.small', t('alt_none_chosen')));
  const open = () => {
    const sel = new Set(chosen);
    const q = h('sav-search', { placeholder: t('alt_search_ph'), label: t('search'), autofocus: true });
    const list = h('div.alt-list');
    const draw = () => {
      const s = String(q.value || '').trim(), k = key(s);
      const names = known.filter((x) => !k || key(x.name).includes(k)).slice(0, 120);
      const exact = known.some((x) => key(x.name) === k);
      const similar = !exact && k.length > 2 ? known.filter((x) => key(x.name).includes(k) || k.includes(key(x.name))).slice(0, 3) : [];
      put(list,
        names.map((x) => { const c = h('sav-checkbox', { checked: sel.has(x.name) }, x.name, x.n ? h('small.muted', ` · ${t('alt_used', { n: x.n })}`) : null); c.addEventListener('change', () => (c.checked ? sel.add(x.name) : sel.delete(x.name))); return c; }),
        s && !exact ? h('div.alt-new', similar.length ? h('p.small.muted', t('alt_similar', { x: similar.map((x) => x.name).join(', ') })) : null,
          btn(t('alt_add_new', { x: s }), { size: 'sm', icon: 'plus', onclick: () => { const n = s.replace(/\s+/g, ' ').slice(0, 40); known.push({ name: n, n: 0 }); sel.add(n); q.value = ''; draw(); } })) : null,
        !names.length && !s ? h('p.muted', t('nothing_yet')) : null);
    };
    q.addEventListener('input', draw);
    draw();
    dialog({ title: t('alternative_to'), width: '30rem', body: h('div.form', h('p.small.muted', t('alt_dialog_text')), q, list),
      actions: [{ label: t('cancel') }, { label: t('done_btn'), primary: true, run: () => { chosen = known.map((x) => x.name).filter((n) => sel.has(n)); drawTags(); } }] });
  };
  drawTags();
  const el = h('div.alt-pick', h('span.flabel', t('alternative_to')), h('div.row.wrap', tags, btn(t('alt_choose'), { size: 'sm', icon: 'search', onclick: open })), h('p.small.muted', t('alt_help')));
  el.values = () => chosen;
  return el;
}

/**
 * The test devices are mostly the same ones: a dialog to tick those already written for other products, or to write a new
 * one (device · system · version or browser). The lines are added to the field, which can still be edited by hand.
 */
function devicePicker(field, known) {
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const lower = (s) => norm(s).toLowerCase();
  const current = () => String(field.value || '').split('\n').map(norm).filter(Boolean);
  const open = () => {
    const have = new Set(current().map(lower)), sel = new Set();
    const q = h('sav-search', { placeholder: t('dev_search_ph'), label: t('search') });
    const list = h('div.alt-list.dev-list');
    const draw = () => {
      const k = lower(String(q.value || ''));
      const rows = known.filter((x) => !k || x.line.toLowerCase().includes(k)).slice(0, 150);
      put(list, rows.length ? rows.map((x) => {
        const had = have.has(x.line.toLowerCase());
        const c = h('sav-checkbox', { checked: had || sel.has(x.line), disabled: had }, x.line, h('small.muted', ' · ' + (had ? t('dev_listed') : !x.n ? t('dev_just_added') : t(x.n === 1 ? 'dev_used_1' : 'dev_used', { n: x.n }))));
        c.addEventListener('change', () => (c.checked ? sel.add(x.line) : sel.delete(x.line)));
        return c;
      }) : h('p.small.muted', known.length ? t('dev_no_match') : t('dev_none_yet')));
    };
    q.addEventListener('input', draw);
    draw();
    const dv = field_(t('dev_device'), 'Google Pixel 8', 80), sy = field_(t('dev_system'), 'Android 15', 60), ve = field_(t('dev_version'), 'Firefox 133', 60);
    dialog({ title: t('dev_title'), width: '34rem',
      body: h('div.form', known.length ? [h('p.small.muted', t('dev_text')), known.length > 6 ? q : null, list] : null,
        h('div.dev-new', h('span.flabel', t('dev_new')), h('div.dev-g', dv, sy, ve), h('p.small.muted', t('dev_new_help')))),
      actions: [{ label: t('cancel') }, { label: t('dev_add_btn'), primary: true, icon: 'plus', run: () => {
        const add = [...sel];
        const d = norm(String(dv.value || ''));
        if (d) {
          const line = [d, norm(String(sy.value || '')), norm(String(ve.value || ''))].filter(Boolean).join(' · ');
          add.push(line);
          if (!known.some((x) => x.line.toLowerCase() === line.toLowerCase())) known.unshift({ line, n: 0 });
        } else if (norm(String(sy.value || '') + String(ve.value || ''))) { toast(t('dev_name_needed'), 'warning'); return false; }
        if (!add.length) { toast(t('dev_pick'), 'warning'); return false; }
        const lines = current(), seen = new Set(lines.map(lower));
        for (const l of add) if (!seen.has(lower(l))) { lines.push(l); seen.add(lower(l)); }
        field.value = lines.join('\n');
        field.dispatchEvent(new Event('input', { bubbles: true }));
        return undefined;
      } }] });
    setTimeout(() => (known.length > 6 ? q : dv).focus?.(), 200);
  };
  return h('div.row.wrap.dev-pick', btn(t('dev_choose'), { size: 'sm', icon: 'smartphone', onclick: open }));
}
const field_ = (label, placeholder, maxlength) => field(label, '', { placeholder, maxlength, size: 'sm' });

const chipValues = (el) => { const v = el.value; return Array.isArray(v) ? v : String(v || el.getAttribute('value') || '').split(',').map((x) => x.trim()).filter(Boolean); };

/** A screenshot made smaller in the browser: max px on the longer side, WebP (or JPEG where WebP is not available). */
function shrinkImage(f, max, quality) {
  return new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width || max, img.height || max));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * s));
      c.height = Math.max(1, Math.round(img.height * s));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      let out = c.toDataURL('image/webp', quality);
      if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', quality);
      URL.revokeObjectURL(img.src);
      out.length > 1200000 ? no(Object.assign(new Error(), { code: 'shot_too_big' })) : ok(out);
    };
    img.onerror = () => no(Object.assign(new Error(), { code: 'shot_invalid' }));
    img.src = URL.createObjectURL(f);
  });
}

/** A logo made small in the browser: 256 px at most, PNG (with transparency) or WebP. */
function shrink(f) {
  return new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 256 / Math.max(img.width || 256, img.height || 256));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round((img.width || 256) * s));
      c.height = Math.max(1, Math.round((img.height || 256) * s));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      let out = c.toDataURL('image/webp', 0.9);
      if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/png');
      URL.revokeObjectURL(img.src);
      out.length > 160000 ? no(Object.assign(new Error(), { code: 'logo_too_big' })) : ok(out);
    };
    img.onerror = () => no(Object.assign(new Error(), { code: 'logo_invalid' }));
    img.src = URL.createObjectURL(f);
  });
}

// ------------------------------------------------------------------ criteria and categories (lists edited as a whole)

function listEditor(root, { title, text, items, fields, blank, save, removable }) {
  const box = h('div.ledit');
  const removed = [];
  const rowOf = (it) => {
    const els = Object.fromEntries(fields.map(([k, label, kind]) => [k, kind === 'switch' ? sw(label, it[k] ?? true) : kind === 'area' ? textArea(label, it[k], { rows: 2, maxlength: 2000, size: 'sm' }) : field(label, it[k], { size: 'sm', maxlength: 80 })]));
    const row = h('sav-card.lrow', {},
      h('div.lrow-h', h('sav-icon', { name: els.icon ? els.icon.value || 'box' : 'box', class: 'lic' }), h('strong', it.name_en || it.name || t('new_item')), h('span.grow'),
        btn('', { icon: 'chevron-up', size: 'xs', appearance: 'ghost', label: t('move_up'), onclick: () => row.previousElementSibling && box.insertBefore(row, row.previousElementSibling) }),
        btn('', { icon: 'chevron-down', size: 'xs', appearance: 'ghost', label: t('move_down'), onclick: () => row.nextElementSibling && box.insertBefore(row.nextElementSibling, row) }),
        removable && it.id ? btn('', { icon: 'trash', size: 'xs', appearance: 'ghost', variant: 'danger', label: t('delete'), onclick: async () => { if (await confirm(t('delete'), t('delete_item_q'), t('delete'))) { removed.push(it.id); row.remove(); } } }) : null),
      h('div.g2', Object.values(els)));
    els.icon?.addEventListener('input', () => { row.querySelector('.lic').setAttribute('name', els.icon.value || 'box'); });
    row._read = () => ({ id: it.id || 0, ...Object.fromEntries(Object.entries(els).map(([k, el]) => [k, val(el)])) });
    return row;
  };
  put(box, items.map(rowOf));
  put(root, head(title, text, btn(t('add'), { icon: 'plus', onclick: () => box.append(rowOf({ ...blank })) }), primary(t('save'), { icon: 'save', onclick: async () => { await save([...box.children].map((r) => r._read()), removed); toast(t('saved'), 'success'); await loadMeta(); reload(); } })), box);
}

async function criteria(root) {
  const { criteria: all } = await api('staff.criteria'); // the switched-off ones too
  listEditor(root, { title: t('st_criteria'), text: t('criteria_text'), items: all,
    fields: [['name_en', t('name')], ['desc_en', t('description'), 'area'], ['icon', t('icon')], ['slug', t('slug')], ['active', t('active'), 'switch']],
    blank: { name_it: '', name_en: '', desc_it: '', desc_en: '', icon: 'circle-check', active: true },
    save: (list) => api('staff.criteria.save', { items: list }) });
}

async function categories(root) {
  listEditor(root, { title: t('st_categories'), text: t('categories_text'), items: S.meta.categories, removable: true,
    fields: [['name_en', t('name')], ['icon', t('icon')], ['slug', t('slug')]],
    blank: { name_it: '', name_en: '', icon: 'box' },
    save: (list, removed) => api('staff.categories.save', { items: list, delete: removed }) });
}

// ------------------------------------------------------------------ people

async function users(root) {
  const [d, prods] = await Promise.all([api('staff.users'), api('staff.products')]);
  const q = h('sav-search', { placeholder: t('search_users'), label: t('search') });
  const list = h('div.list');
  const roleTag = (r) => h('sav-tag', { size: 'sm', appearance: r >= 5 ? 'solid' : 'soft', variant: r >= 10 ? 'warning' : r >= 5 ? 'primary' : r >= 3 ? 'success' : 'neutral' }, t('role_' + r));
  const draw = () => {
    const s = (q.value || '').toLowerCase();
    put(list, d.users.filter((u) => (u.name + ' ' + u.email).toLowerCase().includes(s)).map((u) => h('div.li', face(u.name, 34),
      h('div', h('strong', u.name), h('small.muted', u.email)), h('span.grow'),
      !u.verified ? h('sav-tag', { size: 'sm', variant: 'warning', appearance: 'soft' }, t('unverified_short')) : null,
      u.status !== 'active' ? h('sav-tag', { size: 'sm', variant: 'danger', appearance: 'soft' }, t('disabled')) : null,
      roleTag(u.role), u.role === 3 ? h('small.muted', u.scope === 'all' ? t('scope_all') : t('scope_n', { n: u.scope.length })) : null,
      h('small.muted', u.lastLogin ? day(u.lastLogin) : '—'),
      u.id !== d.me && u.role <= (isMaster() ? 5 : 3) ? btn(t('edit'), { size: 'sm', icon: 'pencil', onclick: () => editUser(u, prods.products) }) : null)));
  };
  q.addEventListener('input', draw);
  put(root, head(t('st_users'), isMaster() ? t('users_text_master') : t('users_text')), q, list);
  draw();
}

function editUser(u, products) {
  const roles = [1, 3, 5].filter((r) => r <= (isMaster() ? 5 : 3));
  const role = select(t('role'), roles.map((r) => [String(r), t('role_' + r)]), String(u.role));
  const status = select(t('status'), [['active', t('active')], ['disabled', t('disabled')]], u.status);
  const all = sw(t('scope_all_label'), u.scope === 'all');
  const picked = new Set(u.scope === 'all' ? [] : u.scope);
  const q = h('sav-search', { placeholder: t('search'), label: t('search'), size: 'sm' });
  const plist = h('div.plist');
  const drawList = () => { const s = (q.value || '').toLowerCase(); put(plist, products.filter((p) => p.name.toLowerCase().includes(s)).slice(0, 80).map((p) => { const c = h('sav-checkbox', { checked: picked.has(p.id) }, p.name); c.addEventListener('change', () => (c.checked ? picked.add(p.id) : picked.delete(p.id))); return c; })); };
  q.addEventListener('input', drawList);
  drawList();
  const scopeBox = h('div.scope', h('p.small.muted', t('scope_text')), all, h('div.scope-list', q, plist));
  const sync = () => { scopeBox.hidden = role.value !== '3'; scopeBox.querySelector('.scope-list').hidden = all.checked; };
  role.addEventListener('change', sync);
  all.addEventListener('change', sync);
  sync();
  dialog({ title: u.name, width: '34rem', body: h('div.form', h('p.muted.small', u.email), role, status, scopeBox),
    actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => { await api('staff.user.save', { id: u.id, role: +role.value, status: status.value, scope: all.checked ? 'all' : [...picked] }); toast(t('saved'), 'success'); reload(); } }] });
}

async function audit(root) {
  const d = await api('staff.audit');
  put(root, head(t('st_audit'), t('audit_text')), d.items.length ? h('div.list.audit', d.items.map((a) => h('div.li', h('small.muted.when', day(a.at)), h('strong', a.user || '—'), h('code', a.action),
    a.product ? h('a', { href: '#/p/' + a.product.slug }, a.product.name) : h('span.muted', `${a.type} #${a.target}`), h('span.grow'), a.detail ? h('small.muted.detail', JSON.stringify(a.detail)) : null))) : empty('history', t('nothing_yet'), ''));
}

// ------------------------------------------------------------------ awards

async function awards(root, id) {
  if (id) return edition(root, id);
  const d = await api('staff.editions');
  put(root, head(t('st_awards'), t('awards_staff_text'), primary(t('new_edition'), { icon: 'plus', onclick: () => editionDialog(null) })),
    d.editions.length ? h('div.list', d.editions.map((e) => h('a.li', { href: '#/staff/awards/' + e.id }, h('b.ed-y', String(e.year)), h('strong', e.title), h('span.grow'), h('sav-tag', { size: 'sm', appearance: 'soft', variant: e.status === 'published' ? 'success' : e.status === 'draft' ? 'warning' : 'primary' }, t('eds_' + e.status)), icon('chevron-right')))) : empty('trophy', t('no_editions'), ''));
}

function editionDialog(e) {
  const r = e?.raw || {};
  const year = h('sav-number-input', { label: t('year'), value: e?.year || new Date().getFullYear(), min: 2000, max: 2100, step: 1 });
  const ti = field(t('title') + ' · IT', r.title_it, { maxlength: 120, placeholder: 'SavAwards ' + (e?.year || new Date().getFullYear()) }), te = field(t('title'), r.title_en, { maxlength: 120 });
  const ii = textArea(t('intro') + ' · IT', r.intro_it, { maxlength: 4000 }), ie = textArea(t('intro'), r.intro_en, { maxlength: 4000 });
  const status = select(t('status'), ['draft', 'nominees', 'voting', 'published'].map((s) => [s, t('eds_' + s)]), e?.status || 'draft', { help: t('eds_help') });
  const until = field(t('vote_until'), e?.voteUntil ? e.voteUntil.slice(0, 16) : '', { type: 'datetime-local' });
  dialog({ title: e ? t('edit_edition') : t('new_edition'), width: '38rem', body: h('div.form', h('div.g2', year, status), te, ie, until),
    actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => {
      const res = await api('staff.edition.save', { id: e?.id || 0, year: +year.value, title_it: ti.value, title_en: te.value, intro_it: ii.value, intro_en: ie.value, status: status.value, vote_until: until.value ? new Date(until.value).toISOString() : '' });
      await loadMeta(); go('#/staff/awards/' + res.id); reload();
    } }] });
}

async function edition(root, id) {
  const [{ edition: e }, prods] = await Promise.all([api('staff.edition', null, { id }), api('staff.products')]);
  put(root,
    head(e.title, `${t('eds_' + e.status)}${e.voteUntil ? ' · ' + t('vote_until') + ' ' + day(e.voteUntil) : ''}`,
      btn(t('back'), { icon: 'arrow-left', appearance: 'ghost', href: '#/staff/awards' }), btn(t('view_page'), { icon: 'external-link', href: '#/awards/' + e.year }),
      btn(t('edit'), { icon: 'pencil', onclick: () => editionDialog(e) }),
      btn(t('delete'), { icon: 'trash', variant: 'danger', appearance: 'ghost', onclick: async () => { if (!(await confirm(t('delete_edition'), t('delete_edition_q'), t('delete')))) return; await api('staff.edition.delete', { id: e.id }); await loadMeta(); go('#/staff/awards'); } }),
      primary(t('add_award'), { icon: 'plus', onclick: () => acatDialog(e, null) })),
    e.status !== 'published' ? h('sav-alert', { variant: 'neutral' }, icon('info', { slot: 'icon' }), t('ed_unpublished_help')) : null,
    e.categories.length ? e.categories.map((c) => nomineesCard(e, c, prods.products)) : empty('trophy', t('no_categories'), t('add_award_text')));
}

function acatDialog(e, c) {
  const r = c?.raw || {};
  const ni = field(t('award_name') + ' · IT', r.name_it, { maxlength: 120 }), ne = field(t('award_name'), r.name_en, { maxlength: 120, placeholder: 'Best open-source email' });
  const di = textArea(t('description') + ' · IT', r.desc_it, { rows: 2 }), de = textArea(t('description'), r.desc_en, { rows: 2 });
  const kind = select(t('award_kind'), [['jury', t('jury_award')], ['public', t('peoples_choice')]], c?.kind || 'jury', { help: t('award_kind_help') });
  const sort = h('sav-number-input', { label: t('order'), value: c?.sort ?? (e.categories.length * 10), step: 1, size: 'sm' });
  dialog({ title: c ? t('edit_award') : t('add_award'), width: '36rem', body: h('div.form', ne, de, h('div.g2', kind, sort)),
    actions: [c ? { label: t('delete'), danger: true, run: async () => { if (!(await confirm(t('delete'), t('delete_award_q'), t('delete')))) return false; await api('staff.acat.delete', { id: c.id }); reload(); } } : null,
      { label: t('cancel') }, { label: t('save'), primary: true, run: async () => { await api('staff.acat.save', { id: c?.id || 0, edition: e.id, name_it: ni.value, name_en: ne.value, desc_it: di.value, desc_en: de.value, kind: kind.value, sort: +sort.value || 0 }); reload(); } }].filter(Boolean) });
}

function nomineesCard(e, c, products) {
  const rows = h('div.noms-ed');
  const addRow = (n) => {
    const prod = select(t('product'), products.map((p) => [String(p.id), p.name + (p.status === 'draft' ? ` (${t('draft')})` : '')]), n ? String(n.id) : '', { size: 'sm', searchable: true, placeholder: t('choose_product') });
    const place = select(t('place'), [['', t('nominee')], ['1', t('place_1')], ['2', t('place_2')], ['3', t('place_3')]], n?.place ? String(n.place) : '', { size: 'sm' });
    const mi = textArea(t('motivation') + ' · IT', n?.raw?.motivation_it, { rows: 2, size: 'sm' }), me = textArea(t('motivation'), n?.raw?.motivation_en, { rows: 2, size: 'sm' });
    const row = h('div.nrow', h('div.g3', prod, place, h('div.row', n?.votes !== null && n?.votes !== undefined ? h('small.muted', t('votes_n', { n: n.votes })) : null, n?.certCode ? h('sav-tag', { size: 'sm', variant: n.certRevoked ? 'danger' : 'success', appearance: 'soft' }, icon('badge-check', { slot: 'prefix' }), n.certCode) : null, h('span.grow'),
      btn('', { icon: 'trash', size: 'xs', appearance: 'ghost', variant: 'danger', label: t('remove'), onclick: () => row.remove() }))), me);
    row._read = () => ({ product: +prod.value, place: place.value ? +place.value : null, motivation_it: mi.value, motivation_en: me.value });
    rows.append(row);
  };
  c.nominees.forEach(addRow);
  return h('sav-card.st-card', {},
    h('div.row.wrap', h('h2', c.name), c.kind === 'public' ? h('sav-tag', { size: 'sm', variant: 'primary', appearance: 'soft' }, t('peoples_choice')) : h('sav-tag', { size: 'sm', appearance: 'soft' }, t('jury_award')), h('span.grow'),
      btn(t('edit'), { size: 'sm', icon: 'pencil', appearance: 'ghost', onclick: () => acatDialog(e, c) })),
    c.desc ? h('p.muted.small', c.desc) : null, rows,
    h('div.row.wrap', btn(t('add_nominee'), { size: 'sm', icon: 'plus', onclick: () => addRow(null) }), h('span.grow'),
      primary(t('save_nominees'), { size: 'sm', icon: 'save', onclick: async () => { await api('staff.nominees.save', { category: c.id, nominees: [...rows.children].map((r) => r._read()).filter((x) => x.product) }); toast(t('saved'), 'success'); reload(); } })));
}

// ------------------------------------------------------------------ certificates (master administrator)

const kindTag = (k) => h('sav-tag', { size: 'sm', appearance: 'soft', variant: k === 'public' ? 'success' : 'primary' }, t(k === 'public' ? 'peoples_choice' : 'jury_award'));
async function certificates(root) {
  const d = await api('staff.certs');
  put(root, head(t('st_certificates'), t('certs_text')),
    h('h2', t('certs_pending')), d.pending.length ? h('div.list', d.pending.map((x) => h('div.li', h('b.ed-y', String(x.year)), h('strong', x.product.name), h('span', x.award), kindTag(x.kind), h('sav-badge', { appearance: 'soft' }, t('place_' + x.place)), h('span.grow'),
      primary(t('issue_cert'), { size: 'sm', icon: 'badge-check', onclick: async () => {
        if (!(await confirm(t('issue_cert'), t('issue_cert_q', { p: x.product.name, a: x.award, y: x.year }), t('issue_cert'), false))) return;
        const r = await api('staff.cert.issue', { category: x.category, product: x.product.id });
        dialog({ title: t('cert_issued'), body: h('div.form', h('p', t('cert_issued_text')), h('sav-input', { label: t('cert_code'), value: r.code, readonly: true }), h('sav-input', { label: t('public_link'), value: r.url, readonly: true })),
          actions: [{ label: t('copy_link'), run: () => copyText(r.url) }, { label: t('open'), primary: true, run: () => { window.open(r.url, '_blank', 'noopener'); } }], onclose: reload });
      } })))) : h('p.muted', t('certs_none_pending')),
    h('h2', t('certs_issued')), d.certificates.length ? h('div.list', d.certificates.map((c) => h('div.li' + (c.revoked ? '.revoked' : ''), h('code', c.code), h('strong', c.product), h('span', `${c.award} · ${c.year}`), kindTag(c.kind), h('sav-badge', { appearance: 'soft' }, t('place_' + c.place)), h('span.grow'),
      c.revoked ? h('sav-tag', { size: 'sm', variant: 'danger', appearance: 'soft', title: c.reason }, t('revoked_on', { d: day(c.revoked) })) : h('small.muted', day(c.issued)),
      btn(t('open'), { size: 'sm', icon: 'external-link', appearance: 'ghost', href: c.url, target: '_blank' }),
      c.revoked ? btn(t('restore'), { size: 'sm', onclick: async () => { await api('staff.cert.restore', { id: c.id }); reload(); } })
        : btn(t('revoke'), { size: 'sm', variant: 'danger', onclick: async () => { const reason = await ask(t('revoke'), t('revoke_reason'), '', t('revoke'), { text: t('revoke_text'), max: 300 }); if (!reason) return; await api('staff.cert.revoke', { id: c.id, reason }); reload(); } })))) : h('p.muted', t('certs_none')));
}
