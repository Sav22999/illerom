/**
 * SavBooks — what turns a document into a book.
 *   chapters     every heading of the first level starts a chapter; what comes before the first one is the opening
 *   details      settings.book: author, subtitle, series, publisher, ISBN, description, keywords, licence, dedication…
 *   cover        drawn on a canvas (6 designs, the colour and the typeface of the book) or a picture of your own
 *   pages        title page, copyright page, dedication and contents are made from the details: they are not in the text
 *   preview      the book as an e-reader shows it (phone, e-reader, tablet), page by page
 *   check        what to fix before publishing
 *   EPUB 3       with the cover, the pages above, contents (nav and NCX for older readers), notes at the end
 * The preview and the EPUB come from the same parts (bookParts), so what you see is what you publish.
 */
import { btn, colorField, confirm, dialog, empty, fail, field, h, icon, iconBtn, menuAt, mobile, primary, put, sec, select, segmented, tile, toast, toggle } from './ui.js';
import { getLang, has, t, when } from './i18n.js';
import { esc, newId } from './clean.js';
import { fontStack } from './settings.js';
import { fontOptions } from './fonts.js';
import { shrink } from './store.js';
import { pickFile } from './actions.js';
import { download, fileName, standalone, webCss } from './files.js';
import { zip } from './zip.js';

export const BOOK = {
  sub: '', author: '', series: '', seriesNo: '', publisher: '', date: '', isbn: '', desc: '', subjects: '', rights: '', dedication: '',
  cover: '', cv: 'classic', cc: '#8a2346', cf: '', // the picture of the cover, its design, colour and typeface
  titlePage: true, copyPage: true, tocPage: true, chap: '', indent: false, uid: '',
};
export const book = (s) => ({ ...BOOK, ...(s?.book || {}) });
/** How a new book is laid out on paper (for the PDF): a trade paperback, chapters on a new page. */
export const BOOK_PAGE = { size: 'Trade', mt: 20, mb: 22, ml: 19, mr: 17, footer: { l: '', c: '{page}', r: '' }, header: { l: '', c: '', r: '' }, firstPage: false, gap: 4 };

const W_ = (lang) => (lang || '').startsWith('it');
const CHAP_WORD = (lang) => (W_(lang) ? 'Capitolo' : 'Chapter');
const UNITS = { en: 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' '), it: 'zero uno due tre quattro cinque sei sette otto nove dieci undici dodici tredici quattordici quindici sedici diciassette diciotto diciannove'.split(' ') };
const TENS = { en: ',,twenty,thirty,forty,fifty,sixty,seventy,eighty,ninety'.split(','), it: ',,venti,trenta,quaranta,cinquanta,sessanta,settanta,ottanta,novanta'.split(',') };
function spell(n, lang) {
  const k = W_(lang) ? 'it' : 'en';
  if (n < 20) return UNITS[k][n];
  if (n >= 100) return String(n);
  const u = n % 10, d = TENS[k][Math.floor(n / 10)];
  if (k === 'en') return u ? `${d}-${UNITS.en[u]}` : d;
  return u ? (u === 1 || u === 8 ? d.slice(0, -1) : d) + (u === 3 ? 'tré' : UNITS.it[u]) : d;
}
const roman = (n) => [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].reduce((s, [v, r]) => { while (n >= v) { s += r; n -= v; } return s; }, '');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** The words over the title of a chapter: "Chapter 3", "Chapter Three", "Chapter III" or "3". */
export function chapLabel(kind, n, lang) {
  if (!kind) return '';
  if (kind === 'o') return String(n);
  return `${CHAP_WORD(lang)} ${kind === 'w' ? cap(spell(n, lang)) : kind === 'r' ? roman(n) : n}`;
}

// ------------------------------------------------------------------ chapters

const hasText = (n) => !!(n.textContent.trim() || n.querySelector?.('img,figure,svg,.math') || n.matches?.('figure,table,hr'));
/** The chapters of the text: {id of the heading, title, nodes}; the opening (before the first chapter) has no id. */
export function chapters(ed) {
  const list = [];
  let cur = { id: '', title: '', nodes: [], open: true };
  for (const b of ed.ed.children) {
    if (b.localName === 'h1') { list.push(cur); cur = { id: b.id, title: b.textContent.trim(), nodes: [b] }; } else cur.nodes.push(b);
  }
  list.push(cur);
  // a page break just before a chapter belongs to it
  for (let i = 1; i < list.length; i++) { const prev = list[i - 1].nodes; while (prev.length && prev.at(-1).matches('.pb')) list[i].nodes.unshift(prev.pop()); }
  return list.filter((c) => !c.open || c.nodes.some(hasText));
}
const words = (nodes) => nodes.reduce((n, b) => n + (b.matches('.toc,.pb') ? 0 : (b.innerText.match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}’'-]*/gu) || []).length), 0);

/** The words over every chapter heading, on screen (they are not part of the text). */
export function dressChapters(ed, paper) {
  const bk = book(ed.settings);
  paper.classList.toggle('bk-indent', !!bk.indent);
  let n = 0;
  ed.quiet(() => { for (const b of ed.ed.querySelectorAll(':scope > h1')) { const l = chapLabel(bk.chap, ++n, ed.settings.lang); if ((b.dataset.label || '') !== l) { if (l) b.dataset.label = l; else delete b.dataset.label; } } });
}

/** The panel on the left: the chapters in order, to open, rename, move (drag them) and add. */
export function chapterPanel(W, close) {
  const ed = W.ed, list = chapters(ed), bk = book(ed.settings), lang = ed.settings.lang;
  const goTo = (c) => { const n = c.nodes.find((x) => !x.matches('.pb')) || c.nodes[0]; n?.scrollIntoView({ behavior: 'smooth', block: 'start' }); if (W.editable && n) { ed.ed.focus({ preventScroll: true }); ed.collapse(n); } if (mobile()) close(); };
  const reorder = (ids) => {
    const now = chapters(ed), open = now.filter((c) => c.open), by = Object.fromEntries(now.filter((c) => !c.open).map((c) => [c.id, c]));
    const order = ids.map((id) => by[id]).filter(Boolean);
    if (order.length !== now.length - open.length) return;
    ed.do(() => {
      const nodes = [...open.flatMap((c) => c.nodes), ...order.flatMap((c, i) => { const ns = [...c.nodes]; // the first chapter needs no page break when nothing comes before it
        if (i === 0 && !open.length) while (ns[0]?.matches('.pb')) ns.shift(); else if (!ns[0]?.matches('.pb') && (i > 0 || open.length)) ns.unshift(Object.assign(document.createElement('div'), { className: 'pb' }));
        return ns; })];
      ed.ed.append(...nodes);
    });
    W.drawLeft?.(true);
  };
  const move = (c, d) => { const ids = list.filter((x) => !x.open).map((x) => x.id), i = ids.indexOf(c.id), j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; reorder(ids); };
  const remove = async (c) => {
    if (!(await confirm(t('ch_delete'), t('ch_delete_t', { name: c.title || '…' }), t('delete')))) return;
    ed.do(() => { c.nodes.forEach((n) => n.remove()); if (!ed.ed.children.length) ed.ed.append(Object.assign(document.createElement('p'), { innerHTML: '<br>' })); });
    W.drawLeft?.(true);
  };
  const rename = (c) => { const n = c.nodes.find((x) => x.localName === 'h1'); if (!n) return; n.scrollIntoView({ block: 'center' }); ed.ed.focus({ preventScroll: true }); const r = document.createRange(); r.selectNodeContents(n); getSelection().removeAllRanges(); getSelection().addRange(r); };
  let k = 0;
  const rows = list.map((c) => {
    const no = c.open ? '' : ++k, label = c.open ? t('ch_opening') : c.title || t('ch_untitled');
    const menu = W.editable && !c.open ? iconBtn('ellipsis', t('more'), (e) => { const r = e.currentTarget.getBoundingClientRect(); menuAt(r.left, r.bottom, [['pencil', t('rename'), () => rename(c)], ['arrow-up', t('ch_up'), () => move(c, -1), { disabled: no === 1 }], ['arrow-down', t('ch_down'), () => move(c, 1), { disabled: no === k && c === list.at(-1) }], '-', ['trash', t('delete'), () => remove(c), { danger: true }]]); }, { size: 'sm' }) : null;
    return h('div.chrow' + (c.open ? '.open' : ''), { 'data-id': c.id || null },
      W.editable && !c.open ? icon('grip-vertical', { class: 'grip' }) : h('span.grip'),
      h('button.chgo', { type: 'button', onclick: () => goTo(c), title: label }, h('span.chno', c.open ? icon('book-open') : bk.chap === 'r' ? roman(no) : String(no)), h('span.chtt', label), h('small.muted', `${words(c.nodes).toLocaleString(getLang())} ${t('words')}`)), menu);
  });
  const opening = rows.filter((r) => r.classList.contains('open')), rest = rows.filter((r) => !r.classList.contains('open'));
  const sortable = h('sav-sortable.chlist', { handle: '.grip', 'aria-label': t('chapters') }, rest);
  sortable.addEventListener('sav-sort', (e) => reorder(e.detail.order));
  const add = W.editable ? btn(t('ch_add'), { icon: 'plus', size: 'sm', block: true, onclick: () => addChapter(W) }) : null;
  const total = words([...ed.ed.children]);
  return [h('div.phead', h('h2', t('chapters')), iconBtn('panel-left-close', t('close'), () => close())),
    h('div.outl.chapters', opening, list.some((c) => !c.open) ? sortable : h('p.muted.hint', t('ch_none')), add, h('p.muted.small.chsum', t('ch_total', { n: list.filter((c) => !c.open).length, w: total.toLocaleString(getLang()) })))];
}

/** A new chapter at the end of the book: a page break, its heading (selected, ready to be named) and an empty paragraph. */
export function addChapter(W) {
  const ed = W.ed, n = chapters(ed).filter((c) => !c.open).length + 1, lang = ed.settings.lang;
  ed.do(() => {
    const last = ed.ed.lastElementChild, empty = last && last.localName === 'p' && !hasText(last);
    const hd = Object.assign(document.createElement('h1'), { textContent: `${CHAP_WORD(lang)} ${n}` }), p = Object.assign(document.createElement('p'), { innerHTML: '<br>' });
    const nodes = [ed.ed.querySelector(':scope > h1') || [...ed.ed.children].some(hasText) ? Object.assign(document.createElement('div'), { className: 'pb' }) : null, hd, p].filter(Boolean);
    if (empty && ed.ed.children.length === 1) last.replaceWith(...nodes.filter((x) => !x.matches('.pb'))); else { if (empty) last.remove(); ed.ed.append(...nodes); }
    hd.scrollIntoView({ block: 'center' });
    ed.ed.focus({ preventScroll: true });
    const r = document.createRange(); r.selectNodeContents(hd); getSelection().removeAllRanges(); getSelection().addRange(r);
  });
  W.drawLeft?.(true);
}

// ------------------------------------------------------------------ cover

export const DESIGNS = ['classic', 'modern', 'band', 'minimal', 'bold', 'photo', 'art'];
export const COVER_W = 1600, COVER_H = 2560;
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, k) => { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
const lum = (c) => { const [r, g, b] = hex(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const authorsOf = (s) => String(s || '').split(/\s*(?:;|&|\n)\s*/).map((x) => x.trim()).filter(Boolean);

function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const tryL = line ? line + ' ' + w : w;
      if (ctx.measureText(tryL).width <= maxW || !line) line = tryL; else { out.push(line); line = w; }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [''];
}
/** The biggest size at which the text fits the box. */
function fit(ctx, text, font, maxW, maxH, max, min, lh = 1.1, maxLines = 6) {
  for (let s = max; s > min; s -= Math.max(2, s * 0.04)) {
    ctx.font = font(s);
    const L = wrap(ctx, text, maxW);
    if (L.length <= maxLines && L.length * s * lh <= maxH && L.every((l) => ctx.measureText(l).width <= maxW)) return { s, L };
  }
  ctx.font = font(min);
  return { s: min, L: wrap(ctx, text, maxW).slice(0, maxLines + 2) };
}
function write(ctx, { s, L }, x, y, lh = 1.1, align = 'center', down = true) {
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const total = L.length * s * lh;
  let yy = down ? y + s : y - total + s;
  for (const l of L) { ctx.fillText(l, x, yy); yy += s * lh; }
  return down ? y + total : y;
}
const spaced = (ctx, v) => { if ('letterSpacing' in ctx) ctx.letterSpacing = v; };
function cover(ctx, img, x, y, w, hh) {
  const r = Math.max(w / img.width, hh / img.height), iw = img.width * r, ih = img.height * r;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, hh); ctx.clip();
  ctx.drawImage(img, x + (w - iw) / 2, y + (hh - ih) / 2, iw, ih);
  ctx.restore();
}

/** Draws the cover: meta {title, sub, author, series, seriesNo}, design and colour from the book. */
export function drawCover(canvas, meta, bk, s, img, scale = 1) {
  const ctx = canvas.getContext('2d'), Wd = COVER_W, Ht = COVER_H;
  canvas.width = Math.round(Wd * scale); canvas.height = Math.round(Ht * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const c = /^#[0-9a-f]{6}$/i.test(bk.cc) ? bk.cc : '#8a2346', face = fontStack(bk.cf || s.headFont || 'Playfair Display'), body = fontStack(s.font || 'Lora');
  const F = (w, st = '') => (n) => `${st} ${w} ${n}px ${face}`.trim(), B = (w, st = '') => (n) => `${st} ${w} ${n}px ${body}`.trim();
  const title = meta.title || t('untitled'), sub = meta.sub || '', author = authorsOf(meta.author).join(' · '), series = meta.series ? `${meta.series}${meta.seriesNo ? ' · ' + meta.seriesNo : ''}` : '';
  const light = lum(c) > 0.42, ink = light ? '#1d1714' : '#fffaf2';
  let d = bk.cv;
  if ((d === 'art' || d === 'photo') && !img) d = 'classic';
  ctx.clearRect(0, 0, Wd, Ht);
  spaced(ctx, '0px');
  if (d === 'art') { cover(ctx, img, 0, 0, Wd, Ht); return canvas; }
  if (d === 'classic') {
    ctx.fillStyle = c; ctx.fillRect(0, 0, Wd, Ht);
    const g = ctx.createRadialGradient(Wd / 2, Ht * 0.38, 100, Wd / 2, Ht / 2, Ht * 0.75); g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(1, 'rgba(0,0,0,.22)'); ctx.fillStyle = g; ctx.fillRect(0, 0, Wd, Ht);
    const gold = light ? mix(c, '#000000', 0.55) : mix(c, '#f3dca4', 0.72);
    ctx.strokeStyle = gold; ctx.lineWidth = 7; ctx.strokeRect(80, 80, Wd - 160, Ht - 160); ctx.lineWidth = 2.5; ctx.strokeRect(108, 108, Wd - 216, Ht - 216);
    ctx.fillStyle = gold;
    if (series) { ctx.font = B('600')(52); spaced(ctx, '10px'); ctx.textAlign = 'center'; ctx.fillText(series.toUpperCase(), Wd / 2, 330); spaced(ctx, '0px'); }
    ctx.fillStyle = ink;
    let y = write(ctx, fit(ctx, title, F('700'), Wd - 360, 900, 220, 70, 1.08), Wd / 2, 560, 1.08);
    ctx.fillStyle = gold; y += 80;
    ctx.fillRect(Wd / 2 - 160, y, 120, 4); ctx.fillRect(Wd / 2 + 40, y, 120, 4); ctx.save(); ctx.translate(Wd / 2, y + 2); ctx.rotate(Math.PI / 4); ctx.fillRect(-14, -14, 28, 28); ctx.restore();
    if (sub) { ctx.fillStyle = ink; ctx.globalAlpha = 0.85; write(ctx, fit(ctx, sub, B('400', 'italic'), Wd - 420, 300, 76, 40, 1.25, 3), Wd / 2, y + 90, 1.25); ctx.globalAlpha = 1; }
    if (author) { ctx.fillStyle = gold; spaced(ctx, '8px'); write(ctx, fit(ctx, author.toUpperCase(), B('600'), Wd - 400, 200, 74, 36, 1.2, 2), Wd / 2, 2180, 1.2, 'center', false); }
  } else if (d === 'modern') {
    ctx.fillStyle = c; ctx.fillRect(0, 0, Wd, Ht);
    ctx.fillStyle = light ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.arc(Wd * 0.92, Ht * 0.18, 620, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(Wd * 0.05, Ht * 0.08, 260, 0, 7); ctx.fill();
    ctx.fillStyle = ink; ctx.globalAlpha = 0.9;
    if (author) write(ctx, fit(ctx, author, B('600'), Wd - 260, 180, 70, 36, 1.2, 2), 130, 200, 1.2, 'left');
    ctx.globalAlpha = 1;
    ctx.fillStyle = light ? mix(c, '#000000', 0.6) : mix(c, '#ffffff', 0.62); ctx.fillRect(130, 1120, 240, 24);
    ctx.fillStyle = ink;
    const y = write(ctx, fit(ctx, title, F('800'), Wd - 260, 900, 270, 80, 1.02), 130, 1210, 1.02, 'left');
    if (sub) { ctx.globalAlpha = 0.82; write(ctx, fit(ctx, sub, B('400'), Wd - 300, 260, 70, 36, 1.25, 3), 130, y + 60, 1.25, 'left'); ctx.globalAlpha = 1; }
    if (series) { ctx.globalAlpha = 0.75; ctx.font = B('600')(48); spaced(ctx, '6px'); ctx.textAlign = 'left'; ctx.fillText(series.toUpperCase(), 130, Ht - 150); ctx.globalAlpha = 1; }
  } else if (d === 'band') {
    const paper = '#f7f2e8', top = 1430, low = 2010;
    ctx.fillStyle = paper; ctx.fillRect(0, 0, Wd, Ht);
    if (img) cover(ctx, img, 0, 0, Wd, top);
    else { ctx.save(); ctx.strokeStyle = mix(c, paper, 0.7); ctx.lineWidth = 18; for (let x = -Ht; x < Wd + Ht; x += 90) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + top, top); ctx.stroke(); } ctx.restore(); }
    ctx.fillStyle = c; ctx.fillRect(0, top, Wd, low - top);
    ctx.fillStyle = ink;
    const box = fit(ctx, title, F('700'), Wd - 240, (low - top) - (sub ? 210 : 120), 190, 60, 1.05, 3);
    const yy = write(ctx, box, Wd / 2, top + ((low - top) - box.L.length * box.s * 1.05 - (sub ? 110 : 0)) / 2 - 10, 1.05);
    if (sub) { ctx.globalAlpha = 0.85; write(ctx, fit(ctx, sub, B('400', 'italic'), Wd - 300, 110, 62, 34, 1.2, 2), Wd / 2, yy + 26, 1.2); ctx.globalAlpha = 1; }
    ctx.fillStyle = mix(c, '#000000', 0.35);
    if (author) { spaced(ctx, '6px'); write(ctx, fit(ctx, author.toUpperCase(), B('600'), Wd - 260, 220, 72, 36, 1.2, 2), Wd / 2, 2140, 1.2); }
    if (series) { spaced(ctx, '4px'); ctx.globalAlpha = 0.7; ctx.font = B('500')(44); ctx.textAlign = 'center'; ctx.fillText(series, Wd / 2, Ht - 110); ctx.globalAlpha = 1; }
  } else if (d === 'minimal') {
    ctx.fillStyle = '#fbfaf7'; ctx.fillRect(0, 0, Wd, Ht);
    ctx.fillStyle = '#1d1b19';
    const y = write(ctx, fit(ctx, title, F('500'), Wd - 400, 800, 170, 60, 1.12), Wd / 2, 760, 1.12);
    ctx.fillStyle = c; ctx.fillRect(Wd / 2 - 90, y + 70, 180, 8);
    if (sub) { ctx.fillStyle = '#4a4540'; write(ctx, fit(ctx, sub, B('400', 'italic'), Wd - 440, 260, 64, 34, 1.3, 3), Wd / 2, y + 150, 1.3); }
    ctx.fillStyle = c;
    if (author) { spaced(ctx, '7px'); write(ctx, fit(ctx, author.toUpperCase(), B('500'), Wd - 400, 200, 60, 32, 1.2, 2), Wd / 2, 2200, 1.2, 'center', false); }
    if (series) { spaced(ctx, '5px'); ctx.fillStyle = '#7a736b'; ctx.font = B('500')(42); ctx.textAlign = 'center'; ctx.fillText(series.toUpperCase(), Wd / 2, 420); }
  } else if (d === 'bold') {
    ctx.fillStyle = c; ctx.fillRect(0, 0, Wd, Ht);
    ctx.fillStyle = mix(c, '#000000', 0.32); ctx.beginPath(); ctx.moveTo(0, Ht * 0.72); ctx.lineTo(Wd, Ht * 0.52); ctx.lineTo(Wd, Ht); ctx.lineTo(0, Ht); ctx.fill();
    ctx.fillStyle = light ? '#15110f' : '#ffffff';
    const y = write(ctx, fit(ctx, title.toUpperCase(), F('900'), Wd - 240, 1250, 330, 90, 0.98, 6), 120, 220, 0.98, 'left');
    if (sub) { ctx.globalAlpha = 0.85; write(ctx, fit(ctx, sub, B('500'), Wd - 260, 260, 70, 36, 1.2, 3), 120, y + 50, 1.2, 'left'); ctx.globalAlpha = 1; }
    ctx.fillStyle = '#ffffff';
    if (author) { spaced(ctx, '5px'); write(ctx, fit(ctx, author.toUpperCase(), B('700'), Wd - 240, 220, 80, 36, 1.15, 2), 120, Ht - 170, 1.15, 'left', false); }
    if (series) { spaced(ctx, '5px'); ctx.globalAlpha = 0.8; ctx.font = B('600')(44); ctx.textAlign = 'right'; ctx.fillText(series.toUpperCase(), Wd - 120, Ht - 170); ctx.globalAlpha = 1; }
  } else { // photo
    cover(ctx, img, 0, 0, Wd, Ht);
    const g = ctx.createLinearGradient(0, Ht * 0.45, 0, Ht); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.55, 'rgba(0,0,0,.62)'); g.addColorStop(1, 'rgba(0,0,0,.86)'); ctx.fillStyle = g; ctx.fillRect(0, 0, Wd, Ht);
    ctx.fillStyle = mix(c, '#ffffff', 0.35); ctx.fillRect(120, 1620, 200, 16);
    ctx.fillStyle = '#ffffff';
    const y = write(ctx, fit(ctx, title, F('800'), Wd - 240, 560, 220, 70, 1.04, 4), 120, 1680, 1.04, 'left');
    if (sub) { ctx.globalAlpha = 0.86; write(ctx, fit(ctx, sub, B('400'), Wd - 260, 200, 64, 34, 1.2, 2), 120, y + 34, 1.2, 'left'); ctx.globalAlpha = 1; }
    if (author) { spaced(ctx, '6px'); write(ctx, fit(ctx, author.toUpperCase(), B('600'), Wd - 240, 140, 62, 32, 1.2, 2), 120, Ht - 130, 1.2, 'left', false); }
    if (series) { spaced(ctx, '6px'); ctx.font = B('600')(44); ctx.textAlign = 'left'; ctx.fillText(series.toUpperCase(), 120, 190); }
  }
  spaced(ctx, '0px');
  return canvas;
}
async function fontsReady(bk, s) {
  const f = [bk.cf || s.headFont, s.font].filter(Boolean);
  await Promise.all(f.flatMap((x) => ['400', '700', '900', 'italic 400'].map((w) => document.fonts.load(`${w} 80px "${x}"`).catch(() => {}))));
}
const loadImg = (src) => new Promise((ok) => { if (!src) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
const toBlob = (cv, type = 'image/jpeg', q = 0.9) => new Promise((ok) => cv.toBlob(ok, type, q));
/** The cover as a JPEG file of 1600 × 2560 (the size the shops ask for). */
export async function coverBlob(meta, bk, s, imgSrc) {
  await fontsReady(bk, s);
  const img = await loadImg(imgSrc);
  return toBlob(drawCover(document.createElement('canvas'), meta, bk, s, img), 'image/jpeg', 0.9);
}
/** A small cover, for the home and the first page. */
export async function coverCanvas(meta, bk, s, imgSrc, scale = 0.2) {
  await fontsReady(bk, s);
  return drawCover(document.createElement('canvas'), meta, bk, s, await loadImg(imgSrc), scale);
}

// ------------------------------------------------------------------ parts of the book (preview and EPUB)

const LICENCES = {
  arr: ['All rights reserved.', 'Tutti i diritti riservati.'],
  by: ['This work is licensed under Creative Commons Attribution 4.0 (CC BY 4.0).', 'Quest’opera è distribuita con licenza Creative Commons Attribuzione 4.0 (CC BY 4.0).'],
  bysa: ['This work is licensed under Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0).', 'Quest’opera è distribuita con licenza Creative Commons Attribuzione - Condividi allo stesso modo 4.0 (CC BY-SA 4.0).'],
  bync: ['This work is licensed under Creative Commons Attribution-NonCommercial 4.0 (CC BY-NC 4.0).', 'Quest’opera è distribuita con licenza Creative Commons Attribuzione - Non commerciale 4.0 (CC BY-NC 4.0).'],
  byncnd: ['This work is licensed under Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 (CC BY-NC-ND 4.0).', 'Quest’opera è distribuita con licenza Creative Commons Attribuzione - Non commerciale - Non opere derivate 4.0 (CC BY-NC-ND 4.0).'],
  cc0: ['Dedicated to the public domain (CC0 1.0).', 'Dedicata al pubblico dominio (CC0 1.0).'],
};
export const licence = (k, lang) => LICENCES[k]?.[W_(lang) ? 1 : 0] || '';
const BW = { contents: ['Contents', 'Indice'], notes: ['Notes', 'Note'], cover: ['Cover', 'Copertina'], title: ['Title page', 'Frontespizio'], copy: ['Copyright', 'Colophon'], dedi: ['Dedication', 'Dedica'], opening: ['Opening', 'Apertura'], by: ['by', 'di'] };
const bw = (k, lang) => BW[k][W_(lang) ? 1 : 0];

export const isbnOk = (v) => {
  const d = String(v || '').replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{13}$/.test(d)) return [...d].reduce((s, x, i) => s + +x * (i % 2 ? 3 : 1), 0) % 10 === 0;
  if (/^\d{9}[\dX]$/.test(d)) return [...d].reduce((s, x, i) => s + (x === 'X' ? 10 : +x) * (10 - i), 0) % 11 === 0;
  return false;
};

/**
 * The book in pieces: [{id, kind, title, body, label}] in reading order, plus the notes.
 * src(id) gives the address of a picture. Links between chapters become "<file>#id".
 */
export function bookParts(d, src) {
  const s = d.settings, bk = book(s), lang = s.lang;
  // the contents are made by SavBooks: the ones written in the text would be there twice
  const body = standalone({ ...d, blocks: d.blocks.filter((b) => !/^<div class="toc"/.test(b.h)) }, src);
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${body}</body>`, 'text/html');
  let notes = [];
  const last = doc.body.lastElementChild;
  if (last?.localName === 'ol' && last.querySelector('li[id^="nota"]')) { notes = [...last.children].map((li) => li.innerHTML); if (last.previousElementSibling?.localName === 'hr') last.previousElementSibling.remove(); last.remove(); }
  const groups = [{ open: true, nodes: [] }];
  for (const n of [...doc.body.children]) { if (n.localName === 'h1') groups.push({ nodes: [n] }); else groups.at(-1).nodes.push(n); }
  const parts = [], meta = { title: d.title, sub: bk.sub, author: bk.author, series: bk.series, seriesNo: bk.seriesNo };
  const authors = authorsOf(bk.author);
  parts.push({ id: 'cover', kind: 'cover', title: bw('cover', lang), body: '' });
  if (bk.titlePage) parts.push({ id: 'title', kind: 'titlepage', title: bw('title', lang), body: `<section class="titlepage" epub:type="titlepage">${bk.series ? `<p class="bser">${esc(bk.series)}${bk.seriesNo ? ' · ' + esc(bk.seriesNo) : ''}</p>` : ''}<h1 class="bt">${esc(d.title)}</h1>${bk.sub ? `<p class="bs">${esc(bk.sub)}</p>` : ''}${authors.length ? `<p class="ba">${authors.map(esc).join('<br/>')}</p>` : ''}${bk.publisher ? `<p class="bp">${esc(bk.publisher)}</p>` : ''}</section>` });
  if (bk.copyPage) {
    const year = (bk.date || '').slice(0, 4) || String(new Date().getFullYear()), rights = licence(bk.rights, lang) || bk.rights;
    parts.push({ id: 'copyright', kind: 'copyright', title: bw('copy', lang), body: `<section class="copy" epub:type="copyright-page"><p><strong>${esc(d.title)}</strong>${bk.sub ? '<br/>' + esc(bk.sub) : ''}</p>${authors.length ? `<p>© ${year} ${authors.map(esc).join(', ')}</p>` : ''}${rights ? `<p>${esc(rights)}</p>` : ''}${bk.isbn ? `<p>ISBN ${esc(bk.isbn)}</p>` : ''}${bk.publisher ? `<p>${esc(bk.publisher)}</p>` : ''}</section>` });
  }
  if (bk.dedication.trim()) parts.push({ id: 'dedication', kind: 'dedication', title: bw('dedi', lang), body: `<section class="dedi" epub:type="dedication">${bk.dedication.trim().split(/\n+/).map((l) => `<p>${esc(l)}</p>`).join('')}</section>` });
  const tocAt = parts.length;
  let n = 0;
  const ser = (nodes) => nodes.map((x) => x.outerHTML).join('\n');
  for (const g of groups) {
    if (g.open) { if (!g.nodes.some((x) => x.textContent.trim() || x.querySelector('img,svg,math'))) continue; const hd = g.nodes.find((x) => /^h[2-4]$/.test(x.localName)); parts.push({ id: 'c0', kind: 'opening', title: hd?.textContent.trim() || bw('opening', lang), body: `<section epub:type="preface">${ser(g.nodes)}</section>`, ids: g.nodes }); continue; }
    const label = chapLabel(bk.chap, ++n, lang), hd = g.nodes[0];
    parts.push({ id: 'c' + n, kind: 'chapter', label, title: hd.textContent.trim() || String(n), body: `<section epub:type="chapter" role="doc-chapter">${label ? `<p class="chap-label">${esc(label)}</p>` : ''}${ser(g.nodes)}</section>`, ids: g.nodes });
  }
  const content = parts.filter((p) => p.kind === 'chapter' || p.kind === 'opening');
  if (bk.tocPage && content.length) parts.splice(tocAt, 0, { id: 'contents', kind: 'toc', title: bw('contents', lang), body: `<nav class="ctoc" epub:type="toc"><h2>${bw('contents', lang)}</h2><ol>${content.map((p) => `<li><a href="${p.id}.xhtml">${p.label ? `<span class="cl">${esc(p.label)}</span> ` : ''}${esc(p.title)}</a></li>`).join('')}</ol>${notes.length ? `<p><a href="notes.xhtml">${bw('notes', lang)}</a></p>` : ''}</nav>` });
  if (notes.length) parts.push({ id: 'notes', kind: 'notes', title: bw('notes', lang), body: `<section epub:type="endnotes" role="doc-endnotes"><h2>${bw('notes', lang)}</h2><ol>${notes.map((x, i) => `<li id="nota${i + 1}" epub:type="endnote" role="doc-endnote">${x}</li>`).join('')}</ol></section>` });
  // where every id lives, then the links
  const home = {};
  for (const p of parts) for (const m of p.body.matchAll(/ id="([^"]+)"/g)) home[m[1]] ||= p.id;
  for (const p of parts) {
    p.body = p.body.replace(/href="#([^"]+)"/g, (m, id) => (home[id] ? `href="${home[id] === p.id ? '' : home[id] + '.xhtml'}#${id}"` : m))
      .replace(/<sup><a href="([^"]*#nota\d+)"/g, '<sup><a epub:type="noteref" role="doc-noteref" href="$1"');
    delete p.ids;
  }
  return { parts, meta, bk, lang, notes: notes.length };
}

/** The style of the book: the look of the text (typefaces, colours, tables…) without page sizes, for reflowing text. */
export function bookCss(s, bk) {
  const head = fontStack(s.headFont), text = fontStack(s.font), acc = s.accent || '#8a2346';
  return '@namespace epub "http://www.idpf.org/2007/ops";\n' + webCss(s).replace(/^body\{[^}]*\}/, '') + `
body{font-family:${text};line-height:${s.line || 1.5};color:${s.color || '#1c1c1c'};margin:0 4%;}
h1,h2,h3,h4{font-family:${head};color:${s.headColor || 'inherit'};line-height:1.2;page-break-after:avoid;break-after:avoid}
h1{font-size:1.7em;text-align:center;margin:1.6em 0 1.4em}
section[epub|type~="chapter"],section[role="doc-chapter"]{page-break-before:always;break-before:page}
.chap-label{margin:3em 0 .4em;text-align:center;font-size:.8em;letter-spacing:.18em;text-transform:uppercase;color:${acc};text-indent:0}
.chap-label+h1{margin-top:.2em}
p{margin:0 0 .7em}
${bk.indent ? 'p{margin:0;text-indent:1.4em}h1+p,h2+p,h3+p,h4+p,hr+p,figure+p,table+p,blockquote+p,ul+p,ol+p,.chap-label,.title,.subtitle,.eq,section>p:first-child,.titlepage p,.copy p,.dedi p,.ctoc p{text-indent:0}' : ''}
.titlepage{text-align:center;margin-top:28%}.titlepage .bt{font-size:2.1em;margin:0 0 .4em}.titlepage .bs{font-size:1.15em;font-style:italic;margin-bottom:2.5em}.titlepage .ba{font-size:1.1em;letter-spacing:.06em;text-transform:uppercase}.titlepage .bp{margin-top:5em;font-size:.85em}.titlepage .bser{font-size:.8em;letter-spacing:.15em;text-transform:uppercase;color:${acc}}
.copy{margin-top:45%;font-size:.8em}.copy p{margin:0 0 .8em}
.dedi{margin-top:35%;text-align:center;font-style:italic}
.ctoc ol{list-style:none;padding:0}.ctoc li{margin:.55em 0}.ctoc a{text-decoration:none;color:inherit}.ctoc .cl{color:${acc};font-size:.85em}
a{color:${acc}}
img,svg{max-width:100%;height:auto}figure{page-break-inside:avoid;break-inside:avoid}
.cover{margin:0;padding:0;text-align:center}.cover svg{height:100%;width:100%}`;
}

const xhtml = (title, body, lang, css = true) => `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${esc(lang)}" xml:lang="${esc(lang)}"><head><meta charset="utf-8"/><title>${esc(title)}</title>${css ? '<link rel="stylesheet" type="text/css" href="style.css"/>' : ''}</head><body>${body}</body></html>`;
/** HTML as XHTML: closed tags, entities that XML knows. */
function toXml(html) {
  const d = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');
  const s = new XMLSerializer();
  return [...d.body.childNodes].map((n) => s.serializeToString(n)).join('').replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
}
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

/** The e-book (EPUB 3, readable by EPUB 2 readers too). d: {title, settings, blocks, images}. */
export async function toBookEpub(d) {
  const path = {}, media = [];
  for (const [id, b] of Object.entries(d.images)) { if (id === book(d.settings).cover) continue; const ext = EXT[b.type] || 'png'; path[id] = `images/${id}.${ext}`; media.push([`OEBPS/images/${id}.${ext}`, new Uint8Array(await b.arrayBuffer()), { store: true }, b.type, 'i' + id]); }
  const { parts, meta, bk, lang } = bookParts(d, (id) => path[id] || '');
  const coverSrc = d.images[bk.cover] ? URL.createObjectURL(d.images[bk.cover]) : '';
  const cv = await coverBlob(meta, bk, d.settings, coverSrc).finally(() => coverSrc && URL.revokeObjectURL(coverSrc));
  const cvType = cv.type || 'image/jpeg', cvName = 'images/cover.' + (EXT[cvType] || 'jpg');
  const ids = isbnOk(bk.isbn) ? 'urn:isbn:' + bk.isbn.replace(/[\s-]/g, '') : 'urn:uuid:' + (bk.uid || crypto.randomUUID());
  const now = new Date().toISOString().replace(/\.\d+Z/, 'Z'), date = /^\d{4}(-\d\d(-\d\d)?)?$/.test(bk.date) ? bk.date : now.slice(0, 10);
  const files = parts.map((p) => ({ ...p, file: p.id + '.xhtml', xml: p.kind === 'cover' ? '' : toXml(p.body) }));
  for (const f of files) if (f.kind === 'cover') f.xml = `<div class="cover" epub:type="cover"><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" viewBox="0 0 ${COVER_W} ${COVER_H}" preserveAspectRatio="xMidYMid meet"><image width="${COVER_W}" height="${COVER_H}" xlink:href="${cvName}"/></svg></div>`;
  const props = (f) => { const p = [f.kind === 'cover' || /<svg/.test(f.xml) ? 'svg' : '', /<math/.test(f.xml) ? 'mathml' : ''].filter(Boolean).join(' '); return p ? ` properties="${p}"` : ''; };
  const content = files.filter((f) => ['chapter', 'opening', 'notes'].includes(f.kind)), first = content[0] || files.at(-1);
  const authors = authorsOf(bk.author), subjects = String(bk.subjects || '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  const rights = licence(bk.rights, lang) || bk.rights;
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${esc(lang)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
<dc:identifier id="bookid">${esc(ids)}</dc:identifier>
<dc:title id="t1">${esc(d.title)}</dc:title><meta refines="#t1" property="title-type">main</meta>
${bk.sub ? `<dc:title id="t2">${esc(bk.sub)}</dc:title><meta refines="#t2" property="title-type">subtitle</meta>` : ''}
${authors.map((a, i) => `<dc:creator id="a${i}">${esc(a)}</dc:creator><meta refines="#a${i}" property="role" scheme="marc:relators">aut</meta>`).join('\n')}
<dc:language>${esc(lang)}</dc:language>
<dc:date>${esc(date)}</dc:date>
${bk.publisher ? `<dc:publisher>${esc(bk.publisher)}</dc:publisher>` : ''}
${bk.desc ? `<dc:description>${esc(bk.desc)}</dc:description>` : ''}
${subjects.map((x) => `<dc:subject>${esc(x)}</dc:subject>`).join('')}
${rights ? `<dc:rights>${esc(rights)}</dc:rights>` : ''}
${bk.series ? `<meta property="belongs-to-collection" id="series">${esc(bk.series)}</meta><meta refines="#series" property="collection-type">series</meta>${bk.seriesNo ? `<meta refines="#series" property="group-position">${esc(bk.seriesNo)}</meta>` : ''}` : ''}
<meta property="dcterms:modified">${now}</meta>
<meta name="cover" content="cover-image"/>
<meta name="generator" content="SavBooks"/>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
<item id="cover-image" href="${cvName}" media-type="${cvType}" properties="cover-image"/>
${files.map((f) => `<item id="${f.id}" href="${f.file}" media-type="application/xhtml+xml"${props(f)}/>`).join('\n')}
${media.map((m) => `<item id="${m[4]}" href="${m[0].slice(6)}" media-type="${m[3]}"/>`).join('\n')}
</manifest>
<spine toc="ncx">
${files.map((f) => `<itemref idref="${f.id}"${f.kind === 'cover' ? ' linear="yes"' : ''}/>`).join('\n')}
</spine>
<guide><reference type="cover" title="${esc(bw('cover', lang))}" href="cover.xhtml"/>${files.find((f) => f.kind === 'toc') ? `<reference type="toc" title="${esc(bw('contents', lang))}" href="contents.xhtml"/>` : ''}<reference type="text" title="${esc(first.title)}" href="${first.file}"/></guide>
</package>`;
  const navList = content.map((f) => `<li><a href="${f.file}">${esc(f.label ? f.label + ': ' + f.title : f.title)}</a></li>`).join('');
  const nav = xhtml(bw('contents', lang), `<nav epub:type="toc" id="toc"><h1>${esc(bw('contents', lang))}</h1><ol>${navList}</ol></nav><nav epub:type="landmarks" hidden="hidden"><ol><li><a epub:type="cover" href="cover.xhtml">${esc(bw('cover', lang))}</a></li>${files.find((f) => f.kind === 'titlepage') ? `<li><a epub:type="titlepage" href="title.xhtml">${esc(bw('title', lang))}</a></li>` : ''}${files.find((f) => f.kind === 'toc') ? `<li><a epub:type="toc" href="contents.xhtml">${esc(bw('contents', lang))}</a></li>` : ''}<li><a epub:type="bodymatter" href="${first.file}">${esc(first.title)}</a></li></ol></nav>`, lang);
  const ncx = `<?xml version="1.0" encoding="utf-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="${esc(lang)}"><head><meta name="dtb:uid" content="${esc(ids)}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head><docTitle><text>${esc(d.title)}</text></docTitle>${authors.map((a) => `<docAuthor><text>${esc(a)}</text></docAuthor>`).join('')}<navMap>${content.map((f, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(f.label ? f.label + ': ' + f.title : f.title)}</text></navLabel><content src="${f.file}"/></navPoint>`).join('')}</navMap></ncx>`;
  return zip([['mimetype', 'application/epub+zip', { store: true }],
    ['META-INF/container.xml', '<?xml version="1.0" encoding="utf-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
    ['OEBPS/content.opf', opf], ['OEBPS/nav.xhtml', nav], ['OEBPS/toc.ncx', ncx], ['OEBPS/style.css', bookCss(d.settings, bk)],
    ['OEBPS/' + cvName, new Uint8Array(await cv.arrayBuffer()), { store: true }],
    ...files.map((f) => ['OEBPS/' + f.file, xhtml(f.title, f.xml, lang, f.kind !== 'cover').replace('<head>', f.kind === 'cover' ? '<head><style>html,body{margin:0;padding:0;height:100%}svg{display:block;width:100%;height:100%}</style>' : '<head>')]),
    ...media.map((m) => m.slice(0, 3))], 'application/epub+zip');
}

// ------------------------------------------------------------------ the Book panel

const LANGS = [['it', 'Italiano'], ['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español'], ['pt', 'Português'], ['nl', 'Nederlands'], ['ca', 'Català'], ['ro', 'Română'], ['pl', 'Polski'], ['sv', 'Svenska'], ['da', 'Dansk'], ['fi', 'Suomi'], ['el', 'Ελληνικά'], ['la', 'Latina']];

/** The details of the book, its cover, the pages made from them, and the way to publish it. */
export function bookPanel(W) {
  const ed = W.ed, s = () => ed.settings, bk = () => book(s()), ro = !W.editable;
  const set = (p) => { W.setSettings({ book: { ...bk(), ...p } }); paintCover(); };
  const meta = () => ({ title: ed.title, sub: bk().sub, author: bk().author, series: bk().series, seriesNo: bk().seriesNo });
  const coverSrc = () => (bk().cover ? W.store.imageUrl(bk().cover) : '');
  // the cover, drawn again a moment after each change
  const big = h('canvas.bkcover', { width: 320, height: 512, role: 'img', 'aria-label': t('bk_cover') });
  const designs = h('div.bkdesigns', { role: 'radiogroup', 'aria-label': t('bk_design') });
  let pt = 0;
  const paintCover = () => { clearTimeout(pt); pt = setTimeout(async () => {
    const b = bk(), src = coverSrc();
    await fontsReady(b, s());
    const img = await loadImg(src);
    drawCover(big, meta(), b, s(), img, 0.2);
    put(designs, DESIGNS.map((k) => { const c = drawCover(document.createElement('canvas'), meta(), { ...b, cv: k }, s(), img, 0.06); const need = (k === 'photo' || k === 'art') && !img; return h('button.bkdesign' + (b.cv === k ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': String(b.cv === k), disabled: ro || null, title: t('cv_' + k) + (need ? ' · ' + t('cv_needs') : ''), onclick: () => set({ cv: k }) }, c, h('small', t('cv_' + k))); }));
  }, 120); };
  W.paintCover = paintCover;
  big.addEventListener('click', () => coverDialog(W));
  const upload = async () => { const [f] = await pickFile('image/*'); if (!f) return; const n = toast(t('img_adding'), 'neutral', { duration: 0 }); try { const id = await W.store.addImage(await shrink(f)); set({ cover: id, cv: ['photo', 'art', 'band'].includes(bk().cv) ? bk().cv : 'photo' }); drawImgBtns(); } catch (e) { fail(e); } finally { n.remove(); } };
  const imgBtns = h('div.stack.bkimg');
  const drawImgBtns = () => put(imgBtns, ro ? null : [btn(bk().cover ? t('bk_img_change') : t('bk_img_add'), { size: 'sm', icon: 'image-plus', block: true, onclick: upload }), bk().cover ? btn(t('bk_img_remove'), { size: 'sm', appearance: 'ghost', block: true, onclick: () => { set({ cover: '', cv: ['photo', 'art'].includes(bk().cv) ? 'classic' : bk().cv }); drawImgBtns(); } }) : null],
    btn(t('bk_cover_dl'), { size: 'sm', appearance: 'ghost', icon: 'download', block: true, onclick: async () => download(await coverBlob(meta(), bk(), s(), coverSrc()), fileName(ed.title + ' – cover', 'jpg')) }));
  drawImgBtns();
  W.coverButtons = drawImgBtns;
  const coverBox = sec(t('bk_cover'), h('div.bkcoverrow', big, h('div.stack.grow', ro ? null : colorField(t('bk_color'), bk().cc, (v) => set({ cc: v || '#8a2346' }), { list: ['#8a2346', '#1d3557', '#0f6e56', '#2b2d42', '#7b5434', '#c45a0c', '#5b4cf0', '#b3261e', '#3a5a40', '#111111', '#e9c46a', '#f1ece2'] }), imgBtns)),
    h('span.flabel', t('bk_design')), designs,
    ro ? null : select(t('bk_face'), [['', t('bk_face_doc')], ...fontOptions(s().fonts)], bk().cf, (v) => set({ cf: v }), { searchable: true }),
    h('p.muted.hint', t('bk_cover_hint')));

  // details
  const F = (label, key, { max = 160, ...o } = {}) => field(label, bk()[key], (v) => set({ [key]: v.trim ? v.trim() : v }), { readonly: ro, maxlength: max, ...o });
  const titleF = field(t('bk_title'), ed.title, (v) => { const x = v.trim() || t('untitled'); W.rename?.(x); paintCover(); }, { readonly: ro, maxlength: 160 });
  const isbn = F('ISBN', 'isbn', { max: 20, placeholder: '978-…', help: t('bk_isbn_h') });
  const isbnHelp = () => { const v = isbn.value.trim(); isbn.setAttribute('help', v && !isbnOk(v) ? t('ck_isbn') : t('bk_isbn_h')); };
  isbn.addEventListener('change', isbnHelp);
  isbnHelp();
  const desc = h('sav-textarea', { label: t('bk_desc'), value: bk().desc, rows: 4, maxlength: 4000, size: 'sm', readonly: ro, help: t('bk_desc_h') });
  desc.addEventListener('keydown', (e) => e.stopPropagation());
  desc.addEventListener('change', () => set({ desc: desc.value.trim() }));
  const rightsF = F(t('bk_rights_t'), 'rights', { max: 300 });
  const rightsSel = select(t('bk_rights'), [['', t('bk_rights_pick')], ...Object.keys(LICENCES).map((k) => [k, licence(k, getLang()).replace(/^This work is licensed under |^Quest’opera è distribuita con licenza /, '').replace(/\.$/, '')]), ['custom', t('bk_rights_own')]], LICENCES[bk().rights] ? bk().rights : bk().rights ? 'custom' : '', (v) => { rightsF.hidden = v !== 'custom'; if (v !== 'custom') set({ rights: v }); else { set({ rights: rightsF.value || '' }); setTimeout(() => rightsF.focus?.(), 50); } }, { disabled: ro });
  rightsF.hidden = !bk().rights || !!LICENCES[bk().rights];
  const lang = select(t('bk_lang'), LANGS.some(([k]) => k === s().lang) ? LANGS : [[s().lang, s().lang], ...LANGS], s().lang, (v) => { W.setSettings({ lang: v }); W.drawLeft?.(true); }, { disabled: ro, searchable: true });
  const dedi = h('sav-textarea', { label: t('bk_dedication'), value: bk().dedication, rows: 2, maxlength: 600, size: 'sm', readonly: ro, placeholder: t('bk_dedication_ph') });
  dedi.addEventListener('keydown', (e) => e.stopPropagation());
  dedi.addEventListener('change', () => set({ dedication: dedi.value }));
  const details = sec(t('bk_details'), titleF, F(t('bk_sub'), 'sub'), F(t('bk_author'), 'author', { help: t('bk_author_h') }),
    h('div.prow', F(t('bk_series'), 'series', { class: 'grow' }), F(t('bk_series_no'), 'seriesNo', { max: 8, style: 'max-width:6rem' })),
    h('div.prow', lang, F(t('bk_date'), 'date', { type: 'date', max: 12 })), F(t('bk_publisher'), 'publisher'), isbn, desc, F(t('bk_subjects'), 'subjects', { max: 300, help: t('bk_subjects_h') }), rightsSel, rightsF);

  // pages made from the details, and the chapters
  const pages = sec(t('bk_pages'), h('p.muted.hint', t('bk_pages_h')), toggle(t('bk_titlepage'), bk().titlePage, (v) => set({ titlePage: v })), toggle(t('bk_copypage'), bk().copyPage, (v) => set({ copyPage: v })), toggle(t('bk_tocpage'), bk().tocPage, (v) => set({ tocPage: v })), dedi,
    select(t('bk_chap'), [['', t('bk_chap_none')], ['n', chapLabel('n', 3, s().lang)], ['w', chapLabel('w', 3, s().lang)], ['r', chapLabel('r', 3, s().lang)], ['o', '3']], bk().chap, (v) => { set({ chap: v }); W.dressBook?.(); W.drawLeft?.(true); }, { disabled: ro }),
    toggle(t('bk_indent'), bk().indent, (v) => { set({ indent: v }); W.dressBook?.(); }));
  for (const x of pages.querySelectorAll('sav-switch')) x.disabled = ro;

  const publish = sec(t('bk_publish'), h('div.stack', primary(t('bk_epub'), { icon: 'book-down', block: true, onclick: () => W.saveAs('epub') }), btn(t('bk_preview'), { icon: 'tablet-smartphone', block: true, onclick: () => readerDialog(W) }), btn(t('bk_check'), { icon: 'list-checks', block: true, onclick: () => checkDialog(W) })), h('p.muted.hint', t('bk_publish_h')));
  paintCover();
  return h('div.bkpanel', publish, coverBox, details, pages);
}

/** The cover, big, with a button to download it. */
async function coverDialog(W) {
  const ed = W.ed, bk = book(ed.settings), src = bk.cover ? W.store.imageUrl(bk.cover) : '';
  const c = await coverCanvas({ title: ed.title, sub: bk.sub, author: bk.author, series: bk.series, seriesNo: bk.seriesNo }, bk, ed.settings, src, 0.32);
  c.className = 'bkcoverbig';
  dialog({ title: t('bk_cover'), width: '34rem', body: h('div.bkcoverwrap', c), actions: [{ label: t('close') }, { label: t('bk_cover_dl'), icon: 'download', primary: true, keep: true, run: async () => { download(await coverBlob({ title: ed.title, sub: bk.sub, author: bk.author, series: bk.series, seriesNo: bk.seriesNo }, bk, ed.settings, src), fileName(ed.title + ' – cover', 'jpg')); return false; } }] });
}

// ------------------------------------------------------------------ check before publishing

export function checkBook(W) {
  const ed = W.ed, bk = book(ed.settings), out = [], list = chapters(ed), real = list.filter((c) => !c.open);
  const add = (lvl, k, v = {}, go) => out.push({ lvl, text: t('ck_' + k, v), go });
  const goPanel = () => W.setTab('book', true);
  if (!ed.title || ed.title === t('untitled')) add('err', 'title', {}, goPanel);
  if (!bk.author.trim()) add('err', 'author', {}, goPanel);
  if (!real.length) add('err', 'chapters', {}, () => addChapter(W));
  for (const [i, c] of real.entries()) { if (!c.title) add('warn', 'chap_title', { n: i + 1 }, () => c.nodes[0].scrollIntoView({ block: 'center' })); if (words(c.nodes) < 1) add('warn', 'chap_empty', { name: c.title || i + 1 }, () => c.nodes[0].scrollIntoView({ block: 'center' })); else if (words(c.nodes) > 30000) add('info', 'chap_long', { name: c.title || i + 1 }, () => c.nodes[0].scrollIntoView({ block: 'center' })); }
  if (!bk.desc.trim()) add('warn', 'desc', {}, goPanel);
  if ((bk.cv === 'photo' || bk.cv === 'art') && !bk.cover) add('warn', 'cover_img', {}, goPanel);
  if (bk.isbn && !isbnOk(bk.isbn)) add('err', 'isbn', {}, goPanel);
  if (!bk.rights) add('info', 'rights', {}, goPanel);
  if (!bk.subjects.trim()) add('info', 'subjects', {}, goPanel);
  const noAlt = [...ed.ed.querySelectorAll('img')].filter((i) => !i.getAttribute('alt')?.trim());
  if (noAlt.length) add('warn', 'alt', { n: noAlt.length }, () => { noAlt[0].scrollIntoView({ block: 'center' }); ed.select(noAlt[0].closest('figure')); W.setTab('format', true); });
  const skip = [...ed.ed.children].find((b, i, a) => /^h[3-4]$/.test(b.localName) && !a.slice(0, i).some((x) => x.localName === 'h' + (+b.localName[1] - 1)));
  if (skip) add('info', 'levels', {}, () => skip.scrollIntoView({ block: 'center' }));
  const empties = [...ed.ed.querySelectorAll(':scope > p')].filter((p) => !hasText(p));
  if (empties.length > 8) add('info', 'empty_p', { n: empties.length });
  if (!out.some((x) => x.lvl === 'err' || x.lvl === 'warn')) out.unshift({ lvl: 'ok', text: t('ck_ok') });
  return out;
}
function checkDialog(W) {
  const list = checkBook(W), ic = { err: 'circle-x', warn: 'triangle-alert', info: 'info', ok: 'circle-check' }, va = { err: 'danger', warn: 'warning', info: 'neutral', ok: 'success' };
  let d = null;
  d = dialog({ title: t('bk_check'), width: '32rem', body: h('div.stack.cklist', list.map((x) => h('sav-alert', { variant: va[x.lvl], icon: ic[x.lvl] }, h('div.prow', h('span.grow', x.text), x.go ? btn(t('ck_fix'), { size: 'sm', appearance: 'ghost', onclick: () => { d.hide(); setTimeout(x.go, 120); } }) : null)))), actions: [{ label: t('close') }, { label: t('bk_epub'), icon: 'book-down', primary: true, run: () => W.saveAs('epub') }] });
}

// ------------------------------------------------------------------ preview as an e-reader

const DEVICES = { phone: [360, 640, 'smartphone'], ereader: [460, 620, 'tablet'], tablet: [640, 860, 'tablet-smartphone'] };
const THEMES = { light: ['#ffffff', '#1c1c1c'], sepia: ['#f6eedb', '#3b2f22'], night: ['#121212', '#d9d4cc'] };

export async function readerDialog(W, startAt) {
  const n0 = toast(t('preparing'), 'neutral', { duration: 0 });
  let b;
  try { b = await W.bundle(); } finally { n0.remove(); }
  const src = (id) => W.store.imageUrl(id), { parts, meta, bk } = bookParts(b, src), lang = b.settings.lang;
  const cvSrc = bk.cover ? W.store.imageUrl(bk.cover) : '';
  const cover = await coverCanvas(meta, bk, b.settings, cvSrc, 0.3);
  const st = { dev: localStorage.getItem('savbooks-rdev') || (mobile() ? 'phone' : 'ereader'), theme: localStorage.getItem('savbooks-rtheme') || 'light', size: +localStorage.getItem('savbooks-rsize') || 100, part: 0, page: 0, pages: 1 };
  if (startAt) st.part = Math.max(0, parts.findIndex((p) => p.id === startAt));
  const host = h('div.rdev'), shell = host.attachShadow({ mode: 'open' });
  const css = bookCss(b.settings, bk);
  const view = document.createElement('div'); view.className = 'v';
  const flow = document.createElement('div'); flow.className = 'flow';
  view.append(flow);
  const style = document.createElement('style');
  shell.append(style, view);
  const where = h('span.muted.small.rwhere'), chapSel = select(null, parts.map((p, i) => [String(i), (p.label ? p.label + ' · ' : '') + p.title]), '0', (v) => openPart(+v, 0), { 'aria-label': t('chapters'), class: 'rchap' });
  const paint = () => {
    const [w, hh] = DEVICES[st.dev], [bg, fg] = THEMES[st.theme];
    host.style.setProperty('--w', w + 'px'); host.style.setProperty('--h', hh + 'px');
    host.dataset.dev = st.dev;
    // the device fits the window: smaller, never bigger
    host.style.zoom = Math.max(0.4, Math.min(1, (innerHeight - (innerWidth < 700 ? 430 : 250)) / (hh + 70), (Math.min(innerWidth, 930) - (innerWidth < 700 ? 50 : 70)) / (w + 40))).toFixed(3);
    style.textContent = `:host{all:initial;display:block}
.v{width:${w}px;height:${hh}px;overflow:hidden;background:${bg};color:${fg};position:relative;box-sizing:border-box}
.flow{box-sizing:border-box;height:${hh}px;padding:28px 0;column-width:${w - 56}px;column-gap:56px;column-fill:auto;margin:0 28px;font-size:${st.size}%;transition:transform .28s cubic-bezier(.2,.7,.2,1)}
.flow img,.flow svg,.flow figure>div{max-width:100%;max-height:${hh - 80}px;object-fit:contain}
${css.replace(/body\{/g, '.flow{').replace(/color:#[0-9a-f]{3,6};margin:0 4%;/, `color:${fg};`)}
.flow section[epub\\:type~="chapter"],.flow section{break-before:auto}
.flow .titlepage{margin-top:22%}.flow .copy{margin-top:30%}
${st.theme === 'night' ? '.flow h1,.flow h2,.flow h3,.flow h4{color:inherit}.flow table td,.flow table th{border-color:#555}.flow pre{background:#222}' : ''}
.cv{height:100%;display:flex;align-items:center;justify-content:center}.cv canvas{max-width:100%;max-height:${hh - 56}px;box-shadow:0 4px 18px rgba(0,0,0,.25)}
a{pointer-events:auto}`;
  };
  function layout() {
    const [w] = DEVICES[st.dev], step = w;
    st.pages = Math.max(1, Math.round(flow.scrollWidth / step));
    st.page = Math.max(0, Math.min(st.page === Infinity ? st.pages - 1 : st.page, st.pages - 1));
    flow.style.transform = `translateX(${-st.page * step}px)`;
    where.textContent = t('rd_where', { p: st.page + 1, n: st.pages });
    if (chapSel.value !== String(st.part)) chapSel.value = String(st.part);
  }
  function openPart(i, page = 0) {
    st.part = Math.max(0, Math.min(parts.length - 1, i));
    const p = parts[st.part];
    flow.style.transition = 'none';
    flow.style.transform = 'translateX(0)';
    if (p.kind === 'cover') { flow.replaceChildren(Object.assign(document.createElement('div'), { className: 'cv' })); flow.firstChild.append(cover); } else flow.innerHTML = p.body;
    st.page = page;
    requestAnimationFrame(() => { layout(); requestAnimationFrame(() => { flow.style.transition = ''; }); });
    Promise.all([...flow.querySelectorAll('img')].map((x) => x.decode?.().catch(() => {}))).then(layout);
  }
  const next = () => { if (st.page < st.pages - 1) { st.page++; layout(); } else if (st.part < parts.length - 1) openPart(st.part + 1, 0); };
  const prev = () => { if (st.page > 0) { st.page--; layout(); } else if (st.part > 0) openPart(st.part - 1, Infinity); };
  view.addEventListener('click', (e) => {
    const a = e.composedPath().find((x) => x.localName === 'a');
    if (a) { e.preventDefault(); const [file, id] = (a.getAttribute('href') || '').split('#'); if (/^https?:/.test(file)) { window.open(file, '_blank', 'noopener'); return; } const i = file ? parts.findIndex((p) => p.id + '.xhtml' === file) : st.part; if (i >= 0) { openPart(i, 0); if (id) setTimeout(() => { const el = flow.querySelector('#' + CSS.escape(id)); if (el) { st.page = Math.floor((el.offsetLeft) / DEVICES[st.dev][0]); layout(); } }, 60); } return; }
    const r = view.getBoundingClientRect(); if (e.clientX - r.left < r.width * 0.35) prev(); else next();
  });
  let sx = null;
  view.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  view.addEventListener('pointerup', (e) => { if (sx !== null && Math.abs(e.clientX - sx) > 40) { e.stopPropagation(); if (e.clientX < sx) next(); else prev(); } sx = null; });
  const keys = (e) => { if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); } };
  const save = () => { localStorage.setItem('savbooks-rdev', st.dev); localStorage.setItem('savbooks-rtheme', st.theme); localStorage.setItem('savbooks-rsize', st.size); };
  const re = () => { save(); paint(); const p = st.page / Math.max(1, st.pages); requestAnimationFrame(() => { layout(); st.page = Math.round(p * st.pages); layout(); }); };
  const bar = h('div.rbar', chapSel,
    segmented(t('rd_device'), st.dev, Object.entries(DEVICES).map(([k, [, , ic]]) => [k, ic, t('rd_' + k)]), (v) => { st.dev = v; re(); }),
    segmented(t('rd_theme'), st.theme, Object.keys(THEMES).map((k) => [k, { light: 'sun', sepia: 'coffee', night: 'moon' }[k], t('rd_' + k)]), (v) => { st.theme = v; re(); }),
    h('div.prow', iconBtn('a-arrow-down', t('rd_smaller'), () => { st.size = Math.max(70, st.size - 10); re(); }), iconBtn('a-arrow-up', t('rd_bigger'), () => { st.size = Math.min(180, st.size + 10); re(); })));
  const foot = h('div.rfoot', iconBtn('chevron-left', t('previous'), prev), where, iconBtn('chevron-right', t('next'), next));
  addEventListener('keydown', keys);
  const fitR = () => paint();
  addEventListener('resize', fitR);
  dialog({ title: t('bk_preview'), width: '58rem', cls: 'rdlg', body: h('div.rwrap', bar, h('div.rstage', host), foot, h('p.muted.small.rnote', t('rd_note'))), actions: [{ label: t('close') }, { label: t('bk_epub'), icon: 'book-down', primary: true, keep: true, run: () => { W.saveAs('epub'); return false; } }], onclose: () => { removeEventListener('keydown', keys); removeEventListener('resize', fitR); } });
  paint();
  setTimeout(() => openPart(st.part, 0), 60);
  void lang;
}

// ------------------------------------------------------------------ from a document (SavDocuments, Word…) to a book

const strip = (h) => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
/**
 * A document becomes a book: its title and subtitle at the beginning become the details (the title page is made from them),
 * its contents go (SavBooks makes them), the headings move up a level when there is no chapter, and each chapter starts on a new page.
 */
export function toBook(d, opt = {}) {
  let blocks = d.blocks.map((b) => ({ ...b }));
  const s = d.settings || {}, prev = book(s), bk = { ...BOOK, ...prev };
  let title = d.title;
  while (blocks.length) {
    const b = blocks[0], m = b.h.match(/^<(\w+)([^>]*)>/) || [], cls = (m[2] || '').match(/class="([^"]*)"/)?.[1] || '', txt = strip(b.h);
    if (m[1] === 'p' && !txt && !/<(img|figure|span class="math)/.test(b.h)) { blocks.shift(); continue; }
    if (/\btitle\b/.test(cls) && !opt.keepTitle) { title = txt || title; blocks.shift(); continue; }
    if (/\bsubtitle\b/.test(cls) && !bk.sub) { bk.sub = txt; blocks.shift(); continue; }
    break;
  }
  blocks = blocks.filter((b) => !/^<div class="toc"/.test(b.h));
  if (!blocks.some((b) => /^<h1/.test(b.h))) {
    if (blocks.some((b) => /^<h2/.test(b.h))) blocks = blocks.map((b) => ({ ...b, h: b.h.replace(/^<h([2-4])/, (m, n) => `<h${n - 1}`).replace(/<\/h([2-4])>$/, (m, n) => `</h${n - 1}>`) }));
    else blocks.unshift({ id: newId(), h: `<h1>${esc(title || t('untitled'))}</h1>` });
  }
  const out = [];
  blocks.forEach((b, i) => { if (/^<h1/.test(b.h) && i > 0 && !/^<div class="pb"/.test(out.at(-1)?.h || '')) out.push({ id: newId(), h: '<div class="pb"></div>' }); out.push(b); });
  while (out.length && /^<div class="pb"/.test(out[0].h)) out.shift();
  const settings = { ...s, ...BOOK_PAGE, book: bk, numbered: false };
  return { ...d, title: title || d.title, settings, blocks: out.length ? out : [{ id: newId(), h: '<p><br></p>' }] };
}

// ------------------------------------------------------------------ SavDocuments, next door

const SD = () => new URL('../savdocuments/', location.href.split('#')[0]);
async function sd(r, q = {}, blob = false) {
  const u = new URL('api/', SD());
  u.searchParams.set('r', r);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  let res;
  try { res = await fetch(u, { credentials: 'same-origin', cache: 'no-store', headers: { 'X-Lang': getLang() } }); } catch { throw Object.assign(new Error('network'), { code: 'network' }); }
  if (blob) { if (!res.ok) throw Object.assign(new Error('server'), { code: 'server' }); return res.blob(); }
  let j;
  try { j = await res.json(); } catch { throw Object.assign(new Error('server'), { code: 'server' }); }
  if (!res.ok || j.ok === false) throw Object.assign(new Error(j.error), { code: j.error || 'server', status: res.status });
  return j;
}
/** A document of SavDocuments (by its id), with its pictures, ready to become a book. */
export async function fetchSavDocument(pid) {
  const g = await sd('doc.get', { doc: pid, quiet: 1 }), images = {};
  for (const id of new Set(g.content.blocks.flatMap((b) => [...b.h.matchAll(/data-i="([a-f0-9]{24})"/g)].map((m) => m[1])))) { try { images[id] = await sd('img', { id }, true); } catch { /* a picture that cannot be read stays out */ } }
  return toBook({ title: g.doc.title, settings: { lang: getLang(), ...g.content.settings }, blocks: g.content.blocks, images });
}
/** Choose one of your documents of SavDocuments: it becomes a new book (the document does not change). */
export function savDocumentsDialog(onpick, onfile) {
  const body = h('div.sdpick'), q = h('sav-input', { type: 'search', placeholder: t('sd_search'), clearable: true, size: 'sm', 'aria-label': t('search') }, icon('search', { slot: 'prefix' }));
  let d = null, docs = [];
  const open = () => window.open(new URL('#/signin', SD()).href, '_blank', 'noopener');
  const draw = () => {
    const term = (q.value || '').trim().toLowerCase(), list = docs.filter((x) => !term || x.title.toLowerCase().includes(term));
    put(body, q, list.length ? h('div.sdlist', list.map((x) => tile(x.title, async () => { d.hide(); await onpick(x.id); }, { class: 'sditem' }, h('div.sdrow', h('span.sdic', h('img', { src: '../savdocuments/icons/favicon.svg', width: 28, height: 28, alt: '' })), h('span.grow', h('strong', x.title), h('small.muted', `${x.words.toLocaleString(getLang())} ${t('words')} · ${when(x.updated)}${x.mine ? '' : ' · ' + (x.owner || '')}`)), icon('chevron-right'))))) : empty('file-text', docs.length ? t('empty_search') : t('sd_none'), docs.length ? '' : t('sd_none_t')));
  };
  q.addEventListener('input', draw); q.addEventListener('sav-clear', draw); q.addEventListener('keydown', (e) => e.stopPropagation());
  d = dialog({ title: t('sd_title'), width: '36rem', body: h('div.form', h('p.muted', t('sd_text')), body), actions: [{ label: t('sd_file'), icon: 'file-up', appearance: 'ghost', run: () => onfile() }, { label: t('cancel') }] });
  put(body, h('div.wait.small', h('sav-spinner')));
  (async () => {
    try {
      const me = await sd('auth.me');
      if (!me.user) return put(body, empty('log-in', t('sd_signin'), t('sd_signin_t'), h('div.prow', primary(t('sd_open'), { icon: 'external-link', onclick: open }), btn(t('retry'), { onclick: () => { d.hide(); savDocumentsDialog(onpick, onfile); } }))));
      const r = await sd('doc.list');
      docs = r.docs.filter((x) => !x.deleted && !x.suspended).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
      draw();
      setTimeout(() => q.focus?.(), 60);
    } catch (e) {
      put(body, empty('cloud-off', t('sd_down'), e.code === 'not_installed' || e.code === 'server' ? t('sd_down_t') : has('err_' + e.code) ? t('err_' + e.code) : t('err_server'), primary(t('sd_file'), { icon: 'file-up', onclick: () => { d.hide(); onfile(); } })));
    }
  })();
  return d;
}

/** A small cover for the home: drawn as soon as its typefaces are there. */
export function coverThumb(title, settings, src, scale = 0.14) {
  const box = h('div.covmini'), s = settings || {}, bk = book(s);
  coverCanvas({ title, sub: bk.sub, author: bk.author, series: bk.series, seriesNo: bk.seriesNo }, bk, s, src && bk.cover ? src(bk.cover) : '', scale).then((c) => box.append(c)).catch(() => {});
  return box;
}
