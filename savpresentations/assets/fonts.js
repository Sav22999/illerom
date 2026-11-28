/**
 * Choosing a typeface (the same as in SavDocuments): included ones, the catalog of Bunny Fonts searched inside the app
 * (loaded from fonts.bunny.net when a presentation uses one), and typefaces from file kept in the account (5 MB at most).
 * The ones that are not included go into meta.fonts of the presentation, so it looks the same for everybody.
 */
import { api, btn, dialog, get, h, iconBtn, oops, pickFile, state, toast } from './core.js';
import { t } from './i18n.js';
import { EXTRA, FONTS, registerFonts } from './themes.js';

const BUNNY = 'https://fonts.bunny.net';
const KINDS = ['sans-serif', 'serif', 'display', 'cursive', 'monospace'];
const kindName = (c) => t({ 'sans-serif': 'f_sans', serif: 'f_serif', display: 'f_display', cursive: 'f_script', monospace: 'f_mono' }[c] || 'f_sans');
const stack = (id) => (FONTS[id] ? `"SP ${FONTS[id][0]}", ${FONTS[id][1]}` : EXTRA[id] ? `"${EXTRA[id][0]}", sans-serif` : '');
const mb = (n) => `${(n / 1048576).toFixed(n < 1048576 ? 2 : 1)} MB`;

let catalog = null;
/** The catalog of Bunny Fonts (about 2000 families), asked once per visit and only when its tab is opened. */
function bunnyList() {
  catalog ||= fetch(`${BUNNY}/list`).then((r) => { if (!r.ok) throw new Error('network'); return r.json(); })
    .then((d) => Object.entries(d).map(([slug, v]) => ({ id: 'b:' + slug, n: v.familyName, c: v.category === 'handwriting' ? 'cursive' : KINDS.includes(v.category) ? v.category : 'sans-serif' }))
      .filter((x) => /^[A-Za-z0-9][A-Za-z0-9 -]{0,59}$/.test(x.n) && /^b:[a-z0-9][a-z0-9-]{0,59}$/.test(x.id)).sort((a, b) => a.n.localeCompare(b.n)))
    .catch((e) => { catalog = null; throw e; });
  return catalog;
}

/** Adds a typeface to the presentation (if it is not included and not there yet). */
export function addDeckFont(deck, f) {
  if (!f || FONTS[f.id] || (deck.meta.fonts || []).some((x) => x.id === f.id)) return;
  deck.do({ k: 'deck.set', p: { fonts: [...(deck.meta.fonts || []), { id: f.id, n: f.n, c: f.c || 'sans-serif' }].slice(-24) } });
}

/** The dialog. Resolves with {id, n, c} or null; the choice is returned once the dialog has closed (so the page has its focus back). */
export function fontDialog({ current = '', used = [] } = {}) {
  let d = null;
  const pick = (f) => { registerFonts([f]); d?.close(f); };
  const row = (f) => h('sav-menu-item', { value: f.id, current: f.id === current || null, style: `font-family:${stack(f.id) || `"${f.n}"`};font-size:1.05rem` }, f.n, h('span', { slot: 'suffix', class: 'fkind' }, kindName(f.c)));
  const menu = (list, label) => { const map = new Map(list.map((f) => [f.id, f])), m = h('sav-menu', { label }, ...list.map(row)); m.addEventListener('sav-select', (e) => { const f = map.get(e.detail.value); if (f) pick(f); }); return m; };

  // included, with those of the presentation first
  registerFonts(used);
  const inc = Object.entries(FONTS).map(([id, f]) => ({ id, n: f[0], c: f[1] })), mine = used.filter((f) => !FONTS[f.id]);
  const included = h('div.stack', ...(mine.length ? [h('h4', t('fonts_deck')), menu(mine, t('fonts_deck')), h('h4', t('fonts_inc'))] : []), h('div.flist', menu(inc, t('fonts_inc'))));

  // Bunny Fonts
  const q = h('sav-input', { type: 'search', placeholder: t('fonts_search'), clearable: true, size: 'sm', 'aria-label': t('fonts_search'), class: 'grow' });
  const kind = h('sav-select', { 'sheet-on-mobile': true, value: 'all', size: 'sm', class: 'rolesel', 'aria-label': t('f_kind') }, h('option', { value: 'all' }, t('all')), ...KINDS.map((c) => h('option', { value: c }, kindName(c))));
  const list = h('div.flist'), preview = new Set();
  const seen = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    seen.unobserve(e.target);
    const id = e.target.getAttribute('value');
    if (!id || preview.has(id)) return;
    preview.add(id);
    document.head.append(h('link', { rel: 'stylesheet', href: `${BUNNY}/css?family=${id.slice(2)}:400&display=swap` }));
  }), { rootMargin: '120px' });
  let all = [], shown = 60;
  async function draw() {
    if (!all.length) { list.replaceChildren(h('div.center', h('sav-spinner'))); try { all = await bunnyList(); } catch { list.replaceChildren(h('sav-empty-state', { heading: t('fonts_off'), icon: 'cloud-off' })); return; } }
    const w = q.value.trim().toLowerCase(), k = kind.value, hits = all.filter((f) => (k === 'all' || f.c === k) && (!w || f.n.toLowerCase().includes(w)));
    const m = menu(hits.slice(0, shown), 'Bunny Fonts');
    [...m.children].forEach((el) => seen.observe(el));
    list.replaceChildren(hits.length ? m : h('sav-empty-state', { heading: t('empty_search'), icon: 'search' }), hits.length > shown ? btn(t('show_more', { n: hits.length - shown }), () => { shown += 60; draw(); }, { size: 'sm', appearance: 'ghost', variant: 'neutral' }) : '');
  }
  let qT = 0;
  q.addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { shown = 60; draw(); }, 180); });
  q.addEventListener('sav-clear', () => { shown = 60; draw(); });
  kind.addEventListener('change', () => { shown = 60; draw(); });
  const bunny = h('div.stack', h('p.muted', t('fonts_bunny_t')), h('div.row.inv', q, kind), list);

  // from file
  const files = h('div.stack'), name = h('sav-input', { label: t('font_name'), maxlength: 60, placeholder: t('font_name_ph'), size: 'sm' });
  const fkind = h('sav-select', { 'sheet-on-mobile': true, label: t('f_kind'), value: 'sans-serif', size: 'sm' }, ...KINDS.map((c) => h('option', { value: c }, kindName(c))));
  const chosen = h('small.muted');
  let file = null;
  const choose = async () => {
    const [f] = await pickFile('.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2');
    if (!f) return;
    if (f.size > 5242880) return void toast(t('err_font_big'), 'danger');
    file = f;
    chosen.textContent = `${f.name} · ${mb(f.size)}`;
    if (!name.value) name.value = f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  };
  const upload = async () => {
    if (!file) return choose();
    let j;
    try {
      const r = await fetch(`api/?r=font.upload&name=${encodeURIComponent(name.value.trim())}`, { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': state.csrf, 'Content-Type': 'application/octet-stream' }, body: file });
      j = await r.json().catch(() => ({}));
    } catch { j = { error: 'network' }; }
    if (!j.ok) return void toast(t('err_' + (j.error || 'network')), 'danger');
    pick({ id: 'f:' + j.font.id, n: j.font.name, c: fkind.value });
  };
  async function drawFiles() {
    let l = [];
    try { l = (await get('font.list')).fonts; } catch { /* offline */ }
    registerFonts(l.map((f) => ({ id: 'f:' + f.id, n: f.name, c: EXTRA['f:' + f.id]?.[1] || 'sans-serif' })));
    files.replaceChildren(...(l.length ? l.map((f) => h('div.person', h('div.pinfo', h('b', { style: `font-family:"${f.name}"` }, f.name), h('small', mb(f.bytes))),
      btn(t('use'), () => pick({ id: 'f:' + f.id, n: f.name, c: EXTRA['f:' + f.id]?.[1] || 'sans-serif' }), { size: 'sm', appearance: 'outline', variant: 'neutral' }),
      iconBtn('trash', t('delete'), async () => { try { await api('font.delete', { id: f.id }); drawFiles(); } catch (e) { oops(e); } }, { size: 'sm' }))) : [h('p.muted', t('fonts_none'))]));
  }
  const fromFile = h('div.stack', h('p.muted', t('fonts_file_t')), h('div.row', btn(t('font_choose'), () => choose(), { icon: 'file-up', size: 'sm', appearance: 'outline', variant: 'neutral' }), chosen), h('div.two', name, fkind), h('div', btn(t('font_add'), () => upload(), { icon: 'plus', size: 'sm' })), h('h4', t('fonts_mine')), files);

  const tabs = h('sav-tabs', h('sav-tab', { label: t('fonts_inc') }, included), h('sav-tab', { label: 'Bunny Fonts' }, bunny), state.user ? h('sav-tab', { label: t('fonts_file') }, fromFile) : null);
  let bunnyOn = false;
  tabs.addEventListener('sav-tab-show', (e) => { if (!bunnyOn && e.detail?.index === 1) { bunnyOn = true; draw(); } });
  if (state.user) drawFiles();
  const done = dialog(t('fonts_title'), tabs, [[t('close'), null, { appearance: 'outline', variant: 'neutral' }]], { width: '36rem', class: 'fontdlg', ref: (x) => { d = x; } });
  return done.then((v) => { seen.disconnect(); return v && v.id ? v : null; });
}
