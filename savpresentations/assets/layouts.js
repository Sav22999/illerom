/** Slide layouts: where the titles, texts and pictures of each kind of slide go, for any format. */
import { uid } from './core.js';
import { textToHtml, esc } from './richtext.js';
import { t } from './i18n.js';

export const LAYOUTS = ['cover', 'section', 'title-body', 'two-cols', 'three-cards', 'statement', 'quote', 'image-left', 'image-right', 'image-full', 'caption', 'number', 'numbers', 'timeline', 'compare', 'gallery', 'list', 'agenda', 'closing', 'blank'];
const VARIANT = { cover: 'cover', closing: 'cover', section: 'section', statement: 'content', blank: 'content', 'image-full': 'plain' };

/** Elements of a layout: [slot, element]. Slots are the names the templates fill in. */
function build(id, ctx) {
  const { W, H, s } = ctx, mx = W * .075, cw = W - 2 * mx, portrait = H > W, top = H * .1, gap = 28 * s;
  const tx = (role, x, y, w, h, ph, more) => ({ t: 'text', role, x, y, w, h, ph, ...more });
  const im = (x, y, w, h, more) => ({ t: 'image', src: '', x, y, w, h, rad: 10 * s, ...more });
  const sh = (shape, x, y, w, h, fill, more) => ({ t: 'shape', shape, x, y, w, h, fill, ...more });
  const head = (w = cw) => ['title', tx('heading', mx, top, w, 92 * s, 'ph_title')];
  const y0 = top + 112 * s, bh = H - y0 - H * .1;
  switch (id) {
    case 'cover': return [['title', tx('title', mx, H * .24, portrait ? cw : cw * .68, H * .3, 'ph_title', { va: 'bottom' })], ['subtitle', tx('subtitle', mx, H * .57, portrait ? cw : cw * .6, 100 * s, 'ph_subtitle')]];
    case 'closing': return [['title', tx('title', mx, H * .3, portrait ? cw : cw * .62, H * .24, 'ph_thanks', { va: 'bottom' })], ['subtitle', tx('subtitle', mx, H * .57, portrait ? cw : cw * .6, 100 * s, 'ph_contacts')]];
    case 'section': return [['label', tx('label', mx, H * .36 - 44 * s, cw * .6, 34 * s, 'ph_label')], ['title', tx('title', mx, H * .36, portrait ? cw : cw * .7, H * .28, 'ph_section', { va: 'top' })]];
    case 'title-body': return [head(), ['body', tx('body', mx, y0, cw, bh, 'ph_text')]];
    case 'list': return [head(), ['body', tx('body', mx, y0, cw, bh, 'ph_list', { lh: 1.75 })]];
    case 'agenda': { const n = 4, rh = Math.min(bh / n, 110 * s), out = [head()]; for (let i = 0; i < n; i++) { const y = y0 + i * rh; out.push([null, tx('big', mx, y, 84 * s, rh - 14 * s, '', { size: 40 * s, html: `<p>${i + 1}</p>` })], ['item' + (i + 1), tx('body', mx + 96 * s, y, cw - 96 * s, rh - 14 * s, 'ph_item', { va: 'middle' })]); if (i < n - 1) out.push([null, sh('rect', mx, y + rh - 9 * s, cw, 1.5 * s, '@surface')]); } return out; }
    case 'two-cols': { if (portrait) return [head(), ['left', tx('body', mx, y0, cw, bh / 2 - gap, 'ph_text')], ['right', tx('body', mx, y0 + bh / 2, cw, bh / 2, 'ph_text')]]; const w = (cw - gap * 1.6) / 2; return [head(), ['left', tx('body', mx, y0, w, bh, 'ph_text')], ['right', tx('body', mx + w + gap * 1.6, y0, w, bh, 'ph_text')]]; }
    case 'compare': { const w = portrait ? cw : (cw - gap) / 2, hh = portrait ? (bh - gap) / 2 : bh, out = [head()]; ['a', 'b'].forEach((k, i) => { const x = mx + (portrait ? 0 : i * (w + gap)), y = y0 + (portrait ? i * (hh + gap) : 0); out.push([null, sh('rect', x, y, w, hh, '@surface', { rad: 16 * s })], [null, sh('rect', x, y, w, 7 * s, i ? '@accent2' : '@accent', { rad: 3 * s })], [k + 't', tx('label', x + 28 * s, y + 28 * s, w - 56 * s, 36 * s, 'ph_label', { size: 24 * s, color: i ? '@accent2' : '@accent' })], [k, tx('body', x + 28 * s, y + 80 * s, w - 56 * s, hh - 108 * s, 'ph_text', { size: 21 * s })]); }); return out; }
    case 'three-cards': { const w = portrait ? cw : (cw - 2 * gap) / 3, hh = portrait ? (bh - 2 * gap) / 3 : bh, out = [head()]; for (let i = 0; i < 3; i++) { const x = mx + (portrait ? 0 : i * (w + gap)), y = y0 + (portrait ? i * (hh + gap) : 0); out.push([null, sh('rect', x, y, w, hh, '@surface', { rad: 18 * s })], [null, sh('ellipse', x + 28 * s, y + 28 * s, 54 * s, 54 * s, i === 1 ? '@accent2' : '@accent', { html: `<p>${i + 1}</p>`, bold: 1, size: 22 * s, pad: 0 })], ['c' + (i + 1) + 't', tx('label', x + 28 * s, y + 98 * s, w - 56 * s, 36 * s, 'ph_label', { size: 23 * s, color: '@fg' })], ['c' + (i + 1), tx('body', x + 28 * s, y + 142 * s, w - 56 * s, hh - 166 * s, 'ph_text', { size: 19 * s })]); } return out; }
    case 'statement': return [['title', tx('title', mx, H * .2, cw, H * .6, 'ph_statement', { align: 'center', size: 62 * s })]];
    case 'quote': return [[null, tx('big', mx, H * .14, 140 * s, 130 * s, '', { html: '<p>“</p>', size: 160 * s, va: 'top', lh: 1 })], ['quote', tx('quote', mx, H * .3, portrait ? cw : cw * .86, H * .36, 'ph_quote')], ['author', tx('label', mx, H * .7, cw, 40 * s, 'ph_author')]];
    case 'image-left': return portrait ? [['image', im(0, 0, W, H * .46, { rad: 0 })], ['title', tx('heading', mx, H * .52, cw, 92 * s, 'ph_title')], ['body', tx('body', mx, H * .52 + 110 * s, cw, H * .38 - 110 * s, 'ph_text')]] : [['image', im(0, 0, W * .46, H, { rad: 0 })], ['title', tx('heading', W * .52, top, W * .48 - mx, 120 * s, 'ph_title')], ['body', tx('body', W * .52, top + 142 * s, W * .48 - mx, H - top - 142 * s - H * .1, 'ph_text')]];
    case 'image-right': return portrait ? [['title', tx('heading', mx, top, cw, 92 * s, 'ph_title')], ['body', tx('body', mx, y0, cw, H * .48 - y0, 'ph_text')], ['image', im(0, H * .52, W, H * .48, { rad: 0 })]] : [['title', tx('heading', mx, top, W * .48 - mx, 120 * s, 'ph_title')], ['body', tx('body', mx, top + 142 * s, W * .48 - mx, H - top - 142 * s - H * .1, 'ph_text')], ['image', im(W * .54, 0, W * .46, H, { rad: 0 })]];
    case 'image-full': return [['image', im(0, 0, W, H, { rad: 0 })], [null, sh('rect', 0, H * .45, W, H * .55, 'g|180|#00000000|#000000cc')], ['title', tx('title', mx, H * .6, cw, H * .28, 'ph_title', { color: '#ffffff', va: 'bottom', size: 54 * s })]];
    case 'caption': return [['image', im(mx, top, cw, H * .66, {})], ['caption', tx('caption', mx, top + H * .66 + 18 * s, cw, 60 * s, 'ph_caption', { size: 20 * s })]];
    case 'number': return [['big', tx('big', mx, H * .2, cw, H * .34, '100%', { size: 190 * s })], ['body', tx('body', mx, H * .58, portrait ? cw : cw * .7, H * .24, 'ph_text', { size: 30 * s })]];
    case 'numbers': { const out = [head()], w = portrait ? cw : (cw - 2 * gap) / 3, hh = portrait ? bh / 3 : bh; for (let i = 0; i < 3; i++) { const x = mx + (portrait ? 0 : i * (w + gap)), y = y0 + (portrait ? i * hh : 0); out.push(['n' + (i + 1), tx('big', x, y + (portrait ? 0 : 30 * s), w, 116 * s, '24', { size: 88 * s, color: i === 1 ? '@accent2' : '@accent' })], ['n' + (i + 1) + 't', tx('body', x, y + (portrait ? 116 : 156) * s, w, Math.max(60 * s, hh - 170 * s), 'ph_text', { size: 21 * s })]); } return out; }
    case 'timeline': { const out = [head()], n = 4; if (portrait) { const st = bh / n; out.push([null, sh('rect', mx + 10 * s, y0 + 12 * s, 4 * s, bh - st + 4 * s, '@accent', { o: .35 })]); for (let i = 0; i < n; i++) { const y = y0 + i * st; out.push([null, sh('ellipse', mx, y, 24 * s, 24 * s, i === n - 1 ? '@accent2' : '@accent')], ['t' + (i + 1) + 't', tx('label', mx + 48 * s, y - 6 * s, cw - 48 * s, 34 * s, 'ph_label')], ['t' + (i + 1), tx('body', mx + 48 * s, y + 32 * s, cw - 48 * s, st - 40 * s, 'ph_text', { size: 19 * s })]); } return out; } const w = cw / n, ly = y0 + bh * .28; out.push([null, sh('rect', mx, ly, cw, 4 * s, '@accent', { o: .35 })]); for (let i = 0; i < n; i++) { const x = mx + i * w; out.push([null, sh('ellipse', x, ly - 11 * s, 26 * s, 26 * s, i === n - 1 ? '@accent2' : '@accent')], ['t' + (i + 1) + 't', tx('label', x, ly - 66 * s, w - 20 * s, 40 * s, 'ph_label', { size: 22 * s })], ['t' + (i + 1), tx('body', x, ly + 34 * s, w - 24 * s, bh * .58, 'ph_text', { size: 18 * s })]); } return out; }
    case 'gallery': { const out = [head()], g2 = 16 * s; if (portrait) { const w = (cw - g2) / 2, hh = (bh - g2) / 2; for (let i = 0; i < 4; i++) out.push(['image' + (i + 1), im(mx + (i % 2) * (w + g2), y0 + (i / 2 | 0) * (hh + g2), w, hh)]); return out; } const w1 = cw * .48, w2 = (cw - w1 - 2 * g2) / 2, hh = (bh - g2) / 2; out.push(['image1', im(mx, y0, w1, bh)]); for (let i = 0; i < 4; i++) out.push(['image' + (i + 2), im(mx + w1 + g2 + (i % 2) * (w2 + g2), y0 + (i / 2 | 0) * (hh + g2), w2, hh)]); return out; }
    default: return [];
  }
}

/** A new slide: {sid, d}. fill: texts by slot (lines become paragraphs, lines that start with "- " a list). */
export function makeSlide(id, ctx, fill = {}) {
  const els = {};
  build(id, ctx).forEach(([slot, el], i) => {
    const e = { ...el, z: i + 1 };
    if (e.ph) e.ph = t(e.ph);
    for (const k of ['x', 'y', 'w', 'h', 'size', 'rad']) if (e[k] !== undefined) e[k] = Math.round(e[k] * 10) / 10;
    if (slot && fill[slot] !== undefined) { if (e.t === 'image') e.src = fill[slot]; else e.html = richLines(fill[slot]); }
    els[uid()] = e;
  });
  return { sid: uid(), d: { layout: id, variant: VARIANT[id] || 'content', els } };
}
export function richLines(txt) {
  const lines = String(txt).split('\n');
  if (!lines.some((l) => l.startsWith('- '))) return txt ? textToHtml(txt) : '';
  let out = '', open = false;
  for (const l of lines) {
    if (l.startsWith('- ')) { if (!open) { out += '<ul>'; open = true; } out += `<li>${esc(l.slice(2))}</li>`; } else { if (open) { out += '</ul>'; open = false; } out += `<p>${esc(l)}</p>`; }
  }
  return out + (open ? '</ul>' : '');
}

/** Another layout for a slide that already has content: texts and pictures move to the slots of the same kind. */
export function relayout(d, id, ctx) {
  const next = makeSlide(id, ctx).d;
  const kind = (e) => (e.t === 'image' || e.t === 'video' ? 'media' : e.t === 'text' ? (/^(title|heading|quote|big)$/.test(e.role) ? 'head' : 'text') : 'shape');
  const old = Object.entries(d.els).map(([k, e]) => ({ k, e })).filter(({ e }) => e.t !== 'shape' && (e.html || e.src || e.poster)).sort((a, b) => (a.e.z || 0) - (b.e.z || 0));
  const slots = Object.entries(next.els).sort((a, b) => a[1].z - b[1].z);
  const used = new Set();
  const take = (o, want) => { const s = slots.find(([k, e]) => !used.has(k) && !e.html && want.includes(kind(e))); if (!s) return false; used.add(s[0]); if (kind(o.e) === 'media') { const { x, y, w, h, z } = s[1]; next.els[s[0]] = { ...o.e, x, y, w, h, z, rad: s[1].rad, r: undefined }; } else s[1].html = o.e.html; return true; };
  const extra = [];
  for (const o of old) { const k = kind(o.e); if (!(k === 'media' ? take(o, ['media']) : k === 'head' ? take(o, ['head']) || take(o, ['text']) : take(o, ['text']) || take(o, ['head']))) extra.push(o); }
  // what has no slot stays where it is: nothing is lost by trying a layout
  for (const o of extra) next.els[o.k] = { ...o.e, z: (o.e.z || 0) + 100 };
  for (const k in next.els) for (const f in next.els[k]) if (next.els[k][f] === undefined) delete next.els[k][f];
  return next;
}
