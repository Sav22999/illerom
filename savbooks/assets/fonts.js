/**
 * Typefaces. Three sources, all open and free:
 *   - included: served by SavBooks (assets/fonts.css, fonts/), nothing to download;
 *   - Bunny Fonts: the whole catalog of fonts.bunny.net searched inside the app, loaded from there when a document uses one;
 *   - from file: TrueType, OpenType, WOFF, WOFF2 up to 5 MB, kept in the account (api font.*).
 * A document lists in settings.fonts the typefaces that are not included, so it looks the same for everybody who opens it.
 */
import { btn, dialog, empty, fail, h, iconBtn, primary, put, select, toast } from './ui.js';
import { getLang, t } from './i18n.js';
import { S, api } from './store.js';
import { BUILTIN, FONTS, KINDS, fontStack } from './settings.js';
import { pickFile } from './actions.js';

const BUNNY = 'https://fonts.bunny.net';
export const KIND_LIST = ['sans-serif', 'serif', 'display', 'handwriting', 'monospace'];
const loaded = new Set();

/** Makes a typeface usable on the page (and remembers its kind for the fallback). */
export function loadFont(f) {
  if (!f?.n || BUILTIN[f.n]) return;
  KINDS[f.n] = f.c || 'sans-serif';
  const key = f.b ? 'b:' + f.b : 'f:' + f.f;
  if (!f.b && !f.f) return;
  if (loaded.has(key)) return;
  loaded.add(key);
  if (f.b) document.head.append(h('link', { rel: 'stylesheet', href: `${BUNNY}/css?family=${encodeURIComponent(f.b)}:400,400i,700,700i&display=swap` }));
  else if ('FontFace' in window) new FontFace(f.n, `url(api/?r=font&id=${f.f})`, { display: 'swap' }).load().then((x) => document.fonts.add(x)).catch(() => loaded.delete(key));
}
export const useFonts = (s) => (s?.fonts || []).forEach(loadFont);
/** The list of a document with one more typeface (the included ones are never listed). */
export const withFont = (list, f) => (BUILTIN[f.n] ? list || [] : [...(list || []).filter((x) => x.n !== f.n), { n: f.n, c: f.c || 'sans-serif', ...(f.b ? { b: f.b } : { f: f.f }) }].slice(-24));
/** Options for a typeface menu: included ones, then those of the document, then "More typefaces…". */
export const fontOptions = (docFonts = []) => [...FONTS.map((f) => [f, f, `font-family:${fontStack(f)}`]), ...docFonts.filter((f) => !BUILTIN[f.n]).map((f) => [f.n, f.n, `font-family:${fontStack(f.n)}`]), ['__more', t('more_fonts'), 'font-weight:600']];

let catalog = null;
/** The catalog of Bunny Fonts (about 2000 families), asked once per visit. */
function bunnyList() {
  catalog ||= fetch(`${BUNNY}/list`).then((r) => { if (!r.ok) throw new Error(); return r.json(); })
    .then((d) => Object.entries(d).map(([b, v]) => ({ b, n: v.familyName, c: KIND_LIST.includes(v.category) ? v.category : 'sans-serif' })).filter((x) => /^[A-Za-z0-9][A-Za-z0-9 -]{0,59}$/.test(x.n)).sort((a, b) => a.n.localeCompare(b.n)))
    .catch((e) => { catalog = null; throw Object.assign(e, { code: 'network' }); });
  return catalog;
}

const kindName = (c) => t('fk_' + c.replace('-', '_'));
const bytes = (n) => `${(n / 1048576).toFixed(n < 1048576 ? 2 : 1)} MB`.replace('.', getLang() === 'it' ? ',' : '.');

/**
 * Choosing a typeface: included, Bunny Fonts, from file. onpick({n, c, b?|f?}) receives the choice; the caller adds it to the
 * document (withFont) and uses it.
 */
export function fontDialog({ current = '', used = [], onpick }) {
  let d = null;
  // the choice is used once the dialog has closed: while it is open the rest of the page is inert (no selection, no focus)
  let picked = null;
  const pick = (f) => { loadFont(f); picked = f; d?.hide(); };
  const row = (f, extra) => h('sav-menu-item', { value: f.n, current: f.n === current || null, style: `font-family:${fontStack(f.n)};font-size:1.05rem` }, f.n, h('span', { slot: 'suffix', class: 'fkind' }, extra || kindName(f.c || BUILTIN[f.n] || 'sans-serif')));
  const menu = (list, label, map) => { const m = h('sav-menu', { label }, list.map((f) => row(f))); m.addEventListener('sav-select', (e) => { const f = map.get(e.detail.value); if (f) pick(f); }); return m; };

  // included, with those of the document first
  const mine = used.filter((f) => !BUILTIN[f.n]), inc = FONTS.map((n) => ({ n, c: BUILTIN[n] }));
  const incMap = new Map([...mine, ...inc].map((f) => [f.n, f]));
  const included = h('div.form', mine.length ? [h('h4', t('fonts_doc')), menu(mine, t('fonts_doc'), incMap), h('h4', t('fonts_inc'))] : null, h('div.flist', menu(inc, t('fonts_inc'), incMap)));

  // Bunny Fonts
  const q = h('sav-input', { type: 'search', placeholder: t('fonts_search'), clearable: true, 'aria-label': t('fonts_search') }), kind = select(null, [['', t('all')], ...KIND_LIST.map((c) => [c, kindName(c)])], '', () => draw(), { 'aria-label': t('kind'), size: 'md' });
  const list = h('div.flist'), seen = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { seen.unobserve(e.target); const f = e.target._f; if (f && !BUILTIN[f.n]) { KINDS[f.n] = f.c; if (!loaded.has('p:' + f.b) && !loaded.has('b:' + f.b)) { loaded.add('p:' + f.b); document.head.append(h('link', { rel: 'stylesheet', href: `${BUNNY}/css?family=${encodeURIComponent(f.b)}:400&display=swap` })); } } } }), { root: null, rootMargin: '120px' });
  let all = [], shown = 60;
  async function draw() {
    if (!all.length) { put(list, h('div.wait.small', h('sav-spinner'))); try { all = await bunnyList(); } catch (e) { put(list, empty('cloud-off', t('fonts_off'), '')); return; } }
    const w = q.value.trim().toLowerCase(), k = kind.value, hits = all.filter((f) => (!k || f.c === k) && (!w || f.n.toLowerCase().includes(w)));
    const map = new Map(hits.slice(0, shown).map((f) => [f.n, f])), m = menu(hits.slice(0, shown), 'Bunny Fonts', map);
    [...m.children].forEach((el, i) => { el._f = hits[i]; seen.observe(el); });
    put(list, hits.length ? m : empty('search', t('empty_search'), ''), hits.length > shown ? btn(t('show_more', { n: hits.length - shown }), { size: 'sm', appearance: 'ghost', onclick: () => { shown += 60; draw(); } }) : null);
  }
  let qT = 0;
  q.addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { shown = 60; draw(); }, 180); });
  q.addEventListener('sav-clear', () => { shown = 60; draw(); });
  const bunny = h('div.form', h('p.muted.small', t('fonts_bunny_t')), h('div.prow', h('div.grow', q), kind), list);

  // from file
  const files = h('div'), name = h('sav-input', { label: t('font_name'), maxlength: 60, placeholder: t('font_name_ph') }), fkind = select(t('kind'), KIND_LIST.map((c) => [c, kindName(c)]), 'sans-serif', null, { size: 'md' });
  let file = null;
  const chosen = h('span.muted.small');
  const choose = async () => { const [f] = await pickFile('.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2'); if (!f) return; if (f.size > 5242880) return toast(t('err_font_big'), 'danger'); file = f; put(chosen, `${f.name} · ${bytes(f.size)}`); if (!name.value) name.value = f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60); };
  const upload = async () => {
    if (!file) return choose();
    const r = await fetch(`api/?r=font.upload&name=${encodeURIComponent(name.value.trim())}`, { method: 'POST', headers: { 'X-CSRF-Token': S.csrf, 'Content-Type': 'application/octet-stream' }, body: file }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: 'network' };
    if (!j.ok) throw Object.assign(new Error(j.error), { code: j.error || 'network' });
    pick({ n: j.font.name, c: fkind.value, f: j.font.id });
  };
  async function drawFiles() {
    let l = [];
    try { l = (await api('font.list')).fonts; } catch { /* offline */ }
    l.forEach((f) => loadFont({ n: f.name, f: f.id, c: KINDS[f.name] || 'sans-serif' }));
    put(files, l.length ? h('div.plist', l.map((f) => h('div.person', h('div.pinfo', h('b', { style: `font-family:${fontStack(f.name)}` }, f.name), h('small', bytes(f.bytes))), btn(t('use'), { size: 'sm', appearance: 'outline', onclick: () => pick({ n: f.name, c: KINDS[f.name] || 'sans-serif', f: f.id }) }), iconBtn('trash', t('delete'), async () => { await api('font.delete', { id: f.id }).catch(fail); drawFiles(); })))) : h('p.muted.small', t('fonts_none')));
  }
  const fromFile = h('div.form', h('p.muted.small', t('fonts_file_t')), h('div.prow.wrap', btn(t('font_choose'), { icon: 'file-up', appearance: 'outline', onclick: () => choose().catch(fail) }), chosen), h('div.grid2', name, fkind), h('div', primary(t('font_add'), { icon: 'plus', onclick: () => upload().catch(fail) })), h('h4', t('fonts_mine')), files);

  const tabs = h('sav-tabs', h('sav-tab', { label: t('fonts_inc') }, included), h('sav-tab', { label: 'Bunny Fonts' }, bunny), S.user ? h('sav-tab', { label: t('fonts_file') }, fromFile) : null);
  // the catalog is asked to fonts.bunny.net only when its tab is opened
  let bunnyOn = false;
  tabs.addEventListener('sav-tab-show', (e) => { if (!bunnyOn && e.detail?.index === 1) { bunnyOn = true; draw(); } });
  d = dialog({ title: t('fonts_title'), width: '36rem', cls: 'fontdlg', body: tabs, actions: [{ label: t('close') }], onclose: () => { seen.disconnect(); if (picked) onpick(picked); } });
  if (S.user) drawFiles();
  return d;
}
