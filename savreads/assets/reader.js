/**
 * The reader: an article saved (#/a/<id>) or an article of a feed (#/i/<id>), on a page of its own.
 *
 * Its look is the reader's: font, size, line spacing, width and a light, sepia or dark page (the button Aa; the same
 * settings in Settings › Reading), kept in the account. Where the reading got to is sent while scrolling and comes back
 * on every device; at the end the article may go to the archive by itself.
 *
 * Highlights: select words in the text, choose a colour (or write a note). A highlight is kept as the words, a little of the
 * text before and after them and where they start in the text (offsets in the textContent of the article), so it is
 * found again even if the page was read again and moved a little. The text is HTML cleaned by the server (rd_clean):
 * links open apart and say nothing of where the reader comes from.
 */
import { btn, dialog, dropBtn, empty, errText, fail, favBtn, h, icon, iconBtn, put, segmented, toast } from './ui.js';
import { day, getLang, t } from './i18n.js';
import { S, api, minutes, setCounts } from './store.js';
import { commands, go, prefs, setPrefs, userMenu } from './account.js';
import { articleMenu, readTime, tagsDialog } from './list.js';
import { saveUrl } from './actions.js';

const COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'];
export const FONTS = { serif: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, Cambria, "Times New Roman", serif', sans: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif', mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace' };
export const WIDTHS = { narrow: '34em', medium: '40em', wide: '48em' };

/** The look of the reader, from the settings, on its element. */
export function applyLook(el, p = prefs()) {
  el.style.setProperty('--r-font', FONTS[p.rFont || 'serif']);
  el.style.setProperty('--r-size', (p.rSize || 19) + 'px');
  el.style.setProperty('--r-line', String(p.rLine || 1.65));
  el.style.setProperty('--r-width', WIDTHS[p.rWidth || 'medium']);
  el.dataset.page = p.rTheme || 'auto';
  el.classList.toggle('noimg', p.images === false);
}

/** The popover of the look (Aa). */
function lookPop(el) {
  const p = prefs();
  const set = (x) => { setPrefs(x).catch(() => {}); applyLook(el); };
  const range = (label, k, min, max, step, def, unit) => { const r = h('sav-range', { label, min, max, step, value: p[k] ?? def, 'show-value': true, unit }); r.addEventListener('input', () => set({ [k]: +r.value })); return r; };
  const trig = h('sav-button', { icon: 'type', label: t('appearance'), appearance: 'ghost', variant: 'neutral', square: true, size: 'sm', slot: 'trigger', title: t('appearance') });
  return h('sav-popover.lookp', { placement: 'bottom-end', 'sheet-on-mobile': true, heading: t('appearance'), style: '--width:20rem' }, trig,
    h('div.stack.look',
      h('div', h('span.flabel', t('font')), segmented(t('font'), p.rFont || 'serif', [['serif', '=Aa', t('f_serif')], ['sans', '=Aa', t('f_sans')], ['mono', '=Aa', t('f_mono')]], (v) => set({ rFont: v }), { class: 'wide fonts' })),
      range(t('size'), 'rSize', 14, 28, 1, 19, 'px'),
      range(t('line'), 'rLine', 1.3, 2.1, .05, 1.65, ''),
      h('div', h('span.flabel', t('width')), segmented(t('width'), p.rWidth || 'medium', [['narrow', '=' + t('w_narrow'), t('w_narrow')], ['medium', '=' + t('w_medium'), t('w_medium')], ['wide', '=' + t('w_wide'), t('w_wide')]], (v) => set({ rWidth: v }), { class: 'wide' })),
      h('div', h('span.flabel', t('page')), h('div.pages', ['auto', 'light', 'sepia', 'dark'].map((v) => h('button.pg.pg-' + v + ((p.rTheme || 'auto') === v ? '.on' : ''), { type: 'button', 'aria-pressed': String((p.rTheme || 'auto') === v), onclick: (e) => { e.currentTarget.parentNode.querySelectorAll('.pg').forEach((b) => { b.classList.toggle('on', b === e.currentTarget); b.setAttribute('aria-pressed', String(b === e.currentTarget)); }); set({ rTheme: v }); } }, h('span', 'Aa'), h('small', t('t_' + v))))))));
}

// ------------------------------------------------------------------ text positions and highlights

/** The text nodes of an element, in order, with where each one starts in its textContent. */
function textNodes(root) {
  const out = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  for (let n = w.nextNode(); n; n = w.nextNode()) { out.push([n, pos]); pos += n.nodeValue.length; }
  return out;
}
/** Where a point of the DOM (node, offset) is in the textContent of root. */
function offsetOf(root, node, offset) {
  if (node.nodeType !== 3) { const r = document.createRange(); r.setStart(root, 0); r.setEnd(node, offset); return r.toString().length; }
  for (const [n, pos] of textNodes(root)) if (n === node) return pos + offset;
  return -1;
}
/** Where a highlight is now: its place, or the same words with the most similar text around them; -1 when gone. */
function locate(text, hl) {
  const q = hl.quote;
  if (text.substr(hl.start, q.length) === q) return hl.start;
  let best = -1, score = -1;
  for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + 1)) {
    const pre = text.slice(Math.max(0, i - hl.prefix.length), i), suf = text.slice(i + q.length, i + q.length + hl.suffix.length);
    let s = 0;
    for (let k = 1; k <= pre.length && pre[pre.length - k] === hl.prefix[hl.prefix.length - k]; k++) s++;
    for (let k = 0; k < suf.length && suf[k] === hl.suffix[k]; k++) s++;
    s -= Math.abs(i - hl.start) / 100000;
    if (s > score) { score = s; best = i; }
  }
  return best;
}
/** Wraps [start, end) of the text of root in <mark> elements (one per text node it touches). */
function wrap(root, start, end, hl) {
  const marks = [];
  for (const [n, pos] of textNodes(root)) {
    const len = n.nodeValue.length, a = Math.max(start, pos), b = Math.min(end, pos + len);
    if (a >= b) continue;
    let node = n;
    if (a > pos) node = node.splitText(a - pos); // n keeps what comes before: its length is the old one no more
    if (b < pos + len) node.splitText(b - a);
    if (!node.nodeValue.trim() && marks.length === 0) continue;
    const m = h('mark.hl.hl-' + hl.color, { 'data-hl': hl.id, title: hl.note || null, tabindex: marks.length ? null : 0 });
    node.replaceWith(m);
    m.append(node);
    marks.push(m);
  }
  if (marks.length && hl.note) marks[marks.length - 1].classList.add('hasnote');
  return marks;
}
function unwrapAll(root) {
  root.querySelectorAll('mark.hl').forEach((m) => m.replaceWith(...m.childNodes));
  root.normalize();
}

// ------------------------------------------------------------------ the screen

export async function readerScreen(root, kind, id) {
  const isItem = kind === 'i';
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  id = String(id).split('?')[0];
  put(root, h('div.wait', h('sav-spinner')));
  const r = await api(isItem ? 'rd.item' : 'rd.get', null, { id });
  const a = isItem ? { ...r.item, url: r.item.link, site: r.item.feedTitle, cover: null, tags: [], highlights: [] } : r.article;
  let hls = isItem ? [] : r.highlights;
  const el = h('div.reader');
  applyLook(el);
  const bar = h('div.rprog', h('i'));
  const text = h('div.rtext', { lang: a.lang || null });
  const hlBadge = h('sav-badge', { pill: true, size: 'sm', variant: 'primary', hidden: !hls.length }, String(hls.length));

  // ------------------------------------------------------------- the content
  const fill = (html) => {
    text.innerHTML = html || '';
    // nothing of the original page runs or tells: links apart and without a referrer, pictures lazy
    text.querySelectorAll('script, style, iframe, object, embed, form').forEach((n) => n.remove());
    text.querySelectorAll('*').forEach((n) => { for (const at of [...n.attributes]) if (/^on/i.test(at.name) || at.name === 'style') n.removeAttribute(at.name); });
    text.querySelectorAll('a[href]').forEach((x) => { if (!/^(https?:|mailto:)/i.test(x.getAttribute('href'))) { x.removeAttribute('href'); return; } x.target = '_blank'; x.rel = 'noopener noreferrer nofollow'; x.referrerPolicy = 'no-referrer'; });
    text.querySelectorAll('img').forEach((x) => { x.loading = 'lazy'; x.decoding = 'async'; x.referrerPolicy = 'no-referrer'; x.onerror = () => (x.closest('figure') || x).remove(); });
    text.querySelectorAll('table').forEach((x) => { if (!x.parentNode.classList.contains('tscroll')) x.replaceWith(h('div.tscroll', x.cloneNode(true))); });
  };
  fill(a.content);
  // the picture of the page on top, unless the text starts with it already (the same picture: the same signed address)
  if (a.cover && [...text.querySelectorAll('img')].slice(0, 3).some((i) => i.getAttribute('src') === a.cover)) a.cover = null;

  const meta = h('div.rmeta', h('a.rsite', { href: a.url, target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer' }, a.site || (a.url ? new URL(a.url).hostname : '')), a.published || a.date ? [h('span.dot', '·'), h('time', { datetime: a.published || a.date }, day(a.published || a.date))] : null);
  const byline = h('p.rby', a.author ? h('span', t('by', { a: a.author })) : null, a.author && a.words ? h('span.dot', '·') : null, a.words ? h('span', readTime(a.words)) : null);
  const noText = !isItem && a.status !== 'ready' ? h('sav-alert.rnote', { variant: a.status === 'pending' ? 'neutral' : 'warning', appearance: 'soft', heading: t(a.status === 'pending' ? 'pending' : 'no_text') },
    h('p', t(a.status === 'pending' ? 'pending_t' : 'no_text_t')), h('div.prow.wrap', btn(t('open_original'), { icon: 'external-link', size: 'sm', variant: 'primary', appearance: 'solid', href: a.url, target: '_blank', rel: 'noopener noreferrer' }), btn(t('refetch'), { icon: 'refresh-cw', size: 'sm', onclick: refetch }))) : null;
  const fullBtn = isItem && a.link && a.words < 250 ? btn(t('full_article'), { icon: 'newspaper', size: 'sm', onclick: async (e, b) => { const x = await api('rd.preview', null, { url: a.link }); if (x.words > a.words) { fill(x.content); a.words = x.words; byline.lastChild && (byline.lastChild.textContent = readTime(x.words)); } b.replaceWith(h('span.muted.small', icon('check'), ' ', t('full_loaded'))); } }) : null;

  // ------------------------------------------------------------- the end of the article
  const tagsRow = h('div.rtags');
  const paintTags = () => put(tagsRow, isItem ? null : [a.tags.map((x) => h('a.ar-tag', { href: '#/tag/' + encodeURIComponent(x) }, '#' + x)), btn(t('edit_tags'), { icon: 'tag', size: 'sm', appearance: 'ghost', onclick: () => tagsDialog([a], (list) => { Object.assign(a, list[0]); paintTags(); }) })]);
  paintTags();
  const note = isItem ? null : h('sav-textarea.rnotef', { label: t('note'), placeholder: t('note_ph'), value: a.note || '', rows: 3, resize: 'auto', maxlength: 20000 });
  note?.addEventListener('change', async () => { try { await api('rd.update', { id: a.id, note: note.value }); a.note = note.value; toast(t('note_saved'), 'success'); } catch (e) { fail(e); } });
  note?.addEventListener('keydown', (e) => e.stopPropagation());
  const endBox = h('footer.rend', tagsRow, note,
    isItem ? null : h('div.prow.wrap', a.archived ? null : btn(t('end_archive'), { icon: 'archive', variant: 'primary', appearance: 'soft', onclick: async () => { await setA({ archived: true }); toast(t('archived'), 'success'); back(); } }),
      btn(t('open_original'), { icon: 'external-link', appearance: 'ghost', href: a.url, target: '_blank', rel: 'noopener noreferrer' })),
    isItem && a.link ? h('div.prow.wrap', saveBtn(), btn(t('open_original'), { icon: 'external-link', appearance: 'ghost', href: a.link, target: '_blank', rel: 'noopener noreferrer' })) : null);

  // ------------------------------------------------------------- the bar on top
  // back where the reader came from inside the app; opened from outside (a link, the share menu), to the list
  const back = () => { if (sessionStorage.getItem('savreads-inapp') === '1') history.back(); else go(isItem ? '#/feeds' : '#/'); };
  async function setA(x) { const u = await api('rd.update', { id: a.id, ...x }); setCounts(u); Object.assign(a, u.articles[0]); paintTop(); }
  async function refetch() { const u = await api('rd.refetch', { id: a.id }); toast(t('refetched'), 'success'); dispatchEvent(new HashChangeEvent('hashchange')); return u; }
  function saveBtn() {
    if (a.saved) return btn(t('open_saved'), { icon: 'bookmark', appearance: 'soft', variant: 'primary', href: '#/a/' + a.saved });
    return btn(t('save_later'), { icon: 'bookmark-plus', variant: 'primary', appearance: 'solid', onclick: async (e, b) => { const s = await saveUrl(a.link, { item: a.id, source: 'feed', title: a.title }); a.saved = s.id; b.replaceWith(saveBtn()); paintTop(); } });
  }
  const top = h('header.rtop');
  const panelBtn = !isItem ? h('span.hlb', iconBtn('highlighter', t('hl_panel'), () => openPanel()), hlBadge) : null;
  // the title bar: back and the logo on the left, ⋮, the apps and the account on the right (always); between them the buttons each
  // person chooses, in their order (⋮ → Customise the bars, kept with the account: a feed item and an article each have their own)
  const BARS = window.SavOffice?.bars, barKey = isItem ? 'titleItem' : 'title';
  const TITLE_ITEMS = isItem ? [['save', 'bookmark-plus', t('save_later')], ['unread', 'circle-dot', t('mark_unread')], ['original', 'external-link', t('open_original')], ['look', 'type', t('appearance')]]
    : [['star', 'star', t('star')], ['archive', 'archive', t('archive')], ['highlights', 'highlighter', t('hl_panel')], ['original', 'external-link', t('open_original')], ['look', 'type', t('appearance')]];
  const TITLE_DEF = isItem ? ['~', 'save', 'unread', 'original', 'look'] : ['~', 'star', 'archive', 'highlights', 'look'];
  const barPick = () => (BARS ? BARS.pick(prefs().bars?.[barKey], TITLE_DEF, TITLE_ITEMS) : TITLE_DEF);
  const accountEl = S.user ? userMenu() : null;
  function barsDialog() {
    BARS.dialog({ bars: [{ id: 'title', items: TITLE_ITEMS, def: TITLE_DEF, before: [['arrow-left', t('back')], [null, a.title]], after: [['ellipsis-vertical', t('more')], ['layout-grid', 'SavOffice'], ['user', t('account')]] }], value: { title: barPick() },
      save: async (v) => { await setPrefs({ bars: { ...(prefs().bars || {}), [barKey]: v.title } }); paintTop(); } });
  }
  function paintTop() {
    const T2 = isItem ? {
      save: a.link ? (a.saved ? iconBtn('bookmark', t('open_saved'), () => go('#/a/' + a.saved), { variant: 'primary', appearance: 'soft' }) : iconBtn('bookmark-plus', t('save_later'), async () => { const s = await saveUrl(a.link, { item: a.id, source: 'feed', title: a.title }); a.saved = s.id; paintTop(); })) : null,
      unread: iconBtn('circle-dot', t('mark_unread'), async () => { const u = await api('rd.items.read', { ids: [a.id], read: false }); setCounts(u); toast(t('mark_unread'), 'success'); }),
      original: a.link ? iconBtn('external-link', t('open_original'), () => window.open(a.link, '_blank', 'noopener,noreferrer')) : null,
      look: lookPop(el),
    } : {
      star: favBtn(a.starred, async (on) => { const u = await api('rd.update', { id: a.id, starred: on }); setCounts(u); Object.assign(a, u.articles[0]); }),
      archive: iconBtn(a.archived ? 'inbox' : 'archive', t(a.archived ? 'unarchive' : 'archive'), async () => { const was = a.archived; await setA({ archived: !was }); toast(t(was ? 'unarchived' : 'archived'), 'success'); if (!was) back(); }),
      highlights: panelBtn,
      original: a.url ? iconBtn('external-link', t('open_original'), () => window.open(a.url, '_blank', 'noopener,noreferrer')) : null,
      look: lookPop(el),
    };
    const custom = !matchMedia('(max-width: 900px)').matches && BARS ? ['settings-2', BARS.menuLabel(), () => barsDialog()] : null;
    const more = isItem ? (custom ? dropBtn('ellipsis-vertical', t('more'), () => [custom], { caret: false, placement: 'bottom-end' }) : null)
      : dropBtn('ellipsis-vertical', t('more'), () => [...articleMenu(a, { onChange: paintTop, onDelete: () => go('#/'), highlights: () => hls })(), ...(custom ? ['-', custom] : [])], { caret: false, placement: 'bottom-end' });
    put(top, iconBtn('arrow-left', t('back'), back, { kbd: 'Esc' }), h('a.rbrand', { href: isItem ? '#/feeds' : '#/', title: 'SavReads' }, h('img', { src: 'icons/favicon.svg', alt: 'SavReads', width: 28, height: 28 })),
      (BARS ? BARS.layout(barPick()) : TITLE_DEF).map((k) => (k === '|' ? h('span.rsep.so-sep') : k === '_' ? h('i.bgap') : k === '~' ? h('span.spacer') : T2[k])), more, accountEl);
  }

  paintTop();
  // a right click (a long press) on a bar or on one of its buttons: «Customise…», the window of the bars on that bar
  BARS?.attach?.({ title: top }, barsDialog);

  const page = h('article.rpage', meta, h('h1.rtitle', a.title), byline, a.cover ? h('figure.rcover', h('img', { src: a.cover, alt: '', referrerpolicy: 'no-referrer', onerror: (e) => e.target.parentNode.remove() })) : null, noText, fullBtn, text, endBox);
  put(root, h('div.rwrap', el));
  el.append(top, bar, h('main.rmain', page));
  document.title = a.title + ' – SavReads';
  if (S.offline) toast(t('offline_now'), 'neutral');

  // ------------------------------------------------------------- highlights
  const paintHls = () => {
    unwrapAll(text);
    const full = text.textContent;
    for (const x of [...hls].sort((p, q) => q.start - p.start)) { // from the end, so earlier positions do not move
      const at = locate(full, x);
      x.lost = at < 0;
      x.at = at < 0 ? Infinity : at;
      if (at >= 0) wrap(text, at, at + x.quote.length, x);
    }
    hlBadge.textContent = String(hls.length);
    hlBadge.hidden = !hls.length;
  };
  if (!isItem) paintHls();

  const hlBar = h('div.hlbar', { role: 'toolbar', 'aria-label': t('hl_add'), hidden: true },
    COLORS.map((c) => h('button.hlc.hl-' + c, { type: 'button', title: t('hl_add'), 'aria-label': t('hl_add') + ' · ' + c, onmousedown: (e) => e.preventDefault(), onclick: () => addHl(c) })),
    h('span.hlsep'), iconBtn('message-square-text', t('hl_note'), () => addHl(prefs().hlColor || 'yellow', true), { place: 'top' }), iconBtn('copy', t('hl_copy'), () => { navigator.clipboard.writeText(String(getSelection())).then(() => toast(t('copied'), 'success')); hideBar(); }, { place: 'top' }));
  hlBar.addEventListener('mousedown', (e) => e.preventDefault());
  if (!isItem) el.append(hlBar);
  let selRange = null;
  const hideBar = () => { hlBar.hidden = true; selRange = null; };
  const onSel = () => {
    if (isItem) return;
    const s = getSelection();
    if (!s.rangeCount || s.isCollapsed) { if (!hlBar.matches(':hover')) hideBar(); return; }
    const rg = s.getRangeAt(0);
    if (!text.contains(rg.commonAncestorContainer) || !String(s).trim()) { hideBar(); return; }
    selRange = rg.cloneRange();
    const rc = rg.getBoundingClientRect(), touch = matchMedia('(pointer: coarse)').matches;
    hlBar.hidden = false;
    const w = hlBar.offsetWidth, x = Math.max(8, Math.min(innerWidth - w - 8, rc.left + rc.width / 2 - w / 2));
    // under the selection on touch screens (the system menu sits above it), above with a mouse
    const y = touch ? rc.bottom + 12 : rc.top - hlBar.offsetHeight - 10;
    hlBar.style.left = x + 'px';
    hlBar.style.top = Math.max(8, Math.min(innerHeight - hlBar.offsetHeight - 8, y < 60 ? rc.bottom + 12 : y)) + 'px';
  };
  let selT;
  const selLater = () => { clearTimeout(selT); selT = setTimeout(onSel, 180); };
  document.addEventListener('selectionchange', selLater);
  async function addHl(color, withNote = false) {
    if (!selRange) return;
    const full = text.textContent;
    let s = offsetOf(text, selRange.startContainer, selRange.startOffset), e = offsetOf(text, selRange.endContainer, selRange.endOffset);
    if (s < 0 || e <= s) return hideBar();
    while (s < e && /\s/.test(full[s])) s++;
    while (e > s && /\s/.test(full[e - 1])) e--;
    const quote = full.slice(s, e);
    getSelection().removeAllRanges();
    hideBar();
    setPrefs({ hlColor: color }).catch(() => {});
    try {
      const x = await api('rd.hl.add', { article: a.id, quote, prefix: full.slice(Math.max(0, s - 40), s), suffix: full.slice(e, e + 40), start: s, color });
      hls.push(x.highlight);
      paintHls();
      if (withNote) editHl(x.highlight);
    } catch (err) { fail(err); }
  }
  function editHl(x) {
    const ta = h('sav-textarea', { label: t('hl_note'), placeholder: t('hl_note_ph'), value: x.note || '', rows: 4, autofocus: true, maxlength: 8000 });
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    let color = x.color;
    const dots = h('div.hlcolors', COLORS.map((c) => h('button.hlc.hl-' + c + (c === color ? '.on' : ''), { type: 'button', 'aria-label': c, onclick: (e) => { color = c; dots.querySelectorAll('.hlc').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } })));
    dialog({ title: t('nav_highlights'), width: '28rem', body: h('div.form', h('blockquote.hlq.hl-' + x.color, x.quote), dots, ta), actions: [
      { label: t('hl_delete'), icon: 'trash-2', run: async () => { await api('rd.hl.delete', { id: x.id }); hls = hls.filter((y) => y.id !== x.id); paintHls(); paintPanel(); } },
      { label: t('save'), primary: true, run: async () => { const u = await api('rd.hl.update', { id: x.id, note: ta.value, color }); Object.assign(x, u.highlight); paintHls(); paintPanel(); } },
    ] });
  }
  text.addEventListener('click', (e) => { const m = e.target.closest('mark.hl'); if (m && String(getSelection()).length === 0) { const x = hls.find((y) => String(y.id) === m.dataset.hl); if (x) editHl(x); } });
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('mark.hl')) e.target.click(); });

  // the highlights and notes of the article: a dialog in the middle (a sheet from the bottom on phones), as the details of the other apps
  let drawer = null;
  const panelList = h('div.hpanel');
  function paintPanel() {
    put(panelList, hls.length ? [...hls].sort((p, q) => (p.at ?? p.start) - (q.at ?? q.start)).map((x) => h('button.hpi.hl-' + x.color + (x.lost ? '.lost' : ''), { type: 'button', onclick: () => { const m = text.querySelector(`mark[data-hl="${x.id}"]`); if (m) { drawer?.hide(); m.scrollIntoView({ behavior: 'smooth', block: 'center' }); m.classList.add('flash'); setTimeout(() => m.classList.remove('flash'), 1600); } else editHl(x); } },
      h('span.hpq', x.quote), x.note ? h('span.hpn', icon('message-square-text'), x.note) : null, x.lost ? h('small.muted', t('hl_lost')) : null)) : h('p.muted', t('hl_none')));
  }
  function openPanel() {
    paintPanel();
    if (drawer?.isConnected) return;
    drawer = dialog({ title: t('hl_panel'), width: '34rem', cls: 'hdlg', body: panelList, onclose: () => { drawer = null; } });
  }

  // ------------------------------------------------------------- where the reading got to
  const scrollable = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const span = () => { const r = text.getBoundingClientRect(), s = scrollY + r.top - innerHeight * .3; return [Math.max(0, s), Math.max(s + 1, Math.min(scrollable(), scrollY + r.bottom - innerHeight * .7))]; };
  const progressNow = () => { const [s, e] = span(); return Math.max(0, Math.min(1, (scrollY - s) / (e - s))); };
  let sent = a.progress || 0, timer = null, moved = false, archivedAtEnd = false;
  const send = (final) => {
    if (isItem) return;
    const p = Math.round(progressNow() * 1000) / 1000;
    if (Math.abs(p - sent) < .01 && !(p >= .98 && sent < .98)) return;
    sent = p;
    a.progress = p;
    api('rd.progress', { id: a.id, progress: p }).catch(() => {});
    if (p >= .98 && prefs().autoArchive && !a.archived && !archivedAtEnd && !final) { archivedAtEnd = true; setA({ archived: true }).then(() => toast(t('auto_archived'), 'success')).catch(() => {}); }
  };
  const onScroll = () => {
    moved = true;
    const [s, e] = span();
    bar.firstChild.style.width = Math.max(0, Math.min(100, ((scrollY - s) / (e - s)) * 100)) + '%';
    clearTimeout(timer);
    timer = setTimeout(send, 1500);
  };
  addEventListener('scroll', onScroll, { passive: true });
  const restore = () => { if (moved || isItem) return; const target = qs.get('hl') && text.querySelector(`mark[data-hl="${qs.get('hl')}"]`); if (target) { target.scrollIntoView({ block: 'center' }); target.classList.add('flash'); return; } if (a.progress > .01 && a.progress < .98) { const [s, e] = span(); scrollTo(0, s + (e - s) * a.progress); } moved = false; };
  requestAnimationFrame(restore);
  setTimeout(() => { restore(); onScroll(); moved = false; }, 400);

  // an article of a feed opened is read
  if (isItem && a.unread && prefs().openRead !== false) api('rd.items.read', { ids: [a.id], read: true }).then(setCounts).catch(() => {});

  const onKey = (e) => {
    if (e.target.closest?.('sav-input, sav-textarea, input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape' && !document.querySelector('sav-dialog[open], sav-drawer[open], sav-popover[open]')) { e.preventDefault(); back(); }
  };
  addEventListener('keydown', onKey);
  const leaveVisible = () => { if (document.visibilityState === 'hidden') send(true); };
  document.addEventListener('visibilitychange', leaveVisible);
  commands([t('appearance'), [['external-link', t('open_original'), () => window.open(a.url || a.link, '_blank', 'noopener,noreferrer')], !isItem ? ['highlighter', t('hl_panel'), () => openPanel()] : null, !isItem ? ['archive', t(a.archived ? 'unarchive' : 'archive'), () => setA({ archived: !a.archived })] : null]]);
  return () => {
    clearTimeout(timer);
    send(true);
    removeEventListener('scroll', onScroll);
    removeEventListener('keydown', onKey);
    document.removeEventListener('selectionchange', selLater);
    document.removeEventListener('visibilitychange', leaveVisible);
    drawer?.hide?.();
    hlBar.remove();
  };
}

export { empty, errText, getLang, minutes };
