/** Small pictures of documents: the first page, drawn with the same styles of the editor. */
import { blockEl, esc } from './clean.js';
import { tableGrid } from './editor.js';
import { applySettings, sheetHtml } from './page.js';
import { cleanObject, drawObject } from './objects.js';
import { mathml } from './math.js';
import { DEFAULTS, fontStack, MM, pageMM } from './settings.js';
import { useFonts } from './fonts.js';
import { h } from './ui.js';

/** Dresses blocks that are only looked at. */
export function dress(root, s, imageUrl) {
  const look = { accent: s.accent || '#0f6e56', ink: s.color, font: fontStack(s.font) };
  for (const i of root.querySelectorAll('img[data-i]')) { const u = imageUrl?.(i.dataset.i); if (u) { i.src = u; i.loading = 'lazy'; } else i.replaceWith(h('span.noimg')); }
  for (const f of root.querySelectorAll('figure')) {
    let v = f.querySelector('img,.noimg');
    if (f.dataset.o) { const o = cleanObject(f.dataset.o); if (o) { v = h('span', { 'data-ui': 'obj', html: drawObject(o, look) }); f.prepend(v); } }
    if (v) (f.parentNode.matches?.('.beside') ? f : v).style.width = (f.dataset.w || 100) + '%';
  }
  for (const m of root.querySelectorAll('span.math')) m.innerHTML = mathml(m.dataset.m || '', m.parentNode.matches('.eq'));
  for (const t of root.querySelectorAll('table')) {
    const n = tableGrid(t)[0]?.length || 1, w = [...t.querySelectorAll(':scope > colgroup > col')].map((c) => parseFloat(c.style.width) || 0);
    t.style.setProperty('--cols', w.length === n && w.every(Boolean) ? w.map((x) => `minmax(0,${x}fr)`).join(' ') : `repeat(${n}, minmax(0,1fr))`);
    t.classList.toggle('rs', !!t.querySelector('[rowspan]'));
    for (const c of t.querySelectorAll('td,th')) if (c.colSpan > 1) c.style.gridColumn = `span ${c.colSpan}`;
  }
  const n = [0, 0, 0, 0], heads = [...root.children].filter((x) => /^h[1-4]$/.test(x.localName));
  for (const x of heads) { const l = +x.localName[1] - 1; n[l]++; n.fill(0, l + 1); if (s.numbered && l < 3) x.dataset.num = n.slice(0, l + 1).map((y) => y || 1).join('.') + (l ? '' : '.'); }
  for (const t of root.querySelectorAll('.toc')) t.innerHTML = heads.filter(() => t.dataset.k !== 'f').slice(0, 14).map((x) => `<a class="l${x.localName[1]}" data-p=" "><span>${esc((x.dataset.num ? x.dataset.num + ' ' : '') + x.textContent)}</span><i></i></a>`).join('');
  [...root.querySelectorAll('sup.fn')].forEach((x, i) => { x.dataset.k = i + 1; });
}

/** The first page, w pixels wide. blocks: html. */
export function miniPage({ settings, blocks }, w, imageUrl) {
  useFonts(settings);
  const s = { ...DEFAULTS, ...settings }, [pw, ph] = pageMM(s), k = w / (pw * MM);
  const page = h('div.psheet', { html: sheetHtml(s, 1, 1, '') }), flow = h('div.flow'), body = h('div.ed.doc');
  for (const b of blocks) { const html = b.h || b; if (/class="pb"/.test(html)) break; body.append(blockEl(html)); if (body.children.length > 26) break; }
  const rest = h('div.doc');
  for (const b of blocks) { const html = b.h || b; if (/^<h[1-4]/.test(html)) rest.append(blockEl(html)); }
  dress(body, s, imageUrl);
  if (rest.children.length) { dress(rest, s); for (const t of body.querySelectorAll('.toc:not([data-k])')) t.innerHTML = [...rest.children].filter((x) => +x.localName[1] <= (+t.dataset.l || 3)).slice(0, 16).map((x) => `<a class="l${x.localName[1]}" data-p=" "><span>${esc((x.dataset.num ? x.dataset.num + ' ' : '') + x.textContent)}</span><i></i></a>`).join(''); }
  flow.append(body);
  page.append(flow);
  const paper = h('div.paper.mini', { style: `zoom:${k}` }, page);
  applySettings(paper, s);
  return h('div.mini-box', { style: `aspect-ratio:${pw}/${ph}`, 'aria-hidden': 'true', inert: true }, paper);
}

/** A page that fills the width it is given. */
export function fluidMini(doc, imageUrl) {
  const box = h('div.mini-wrap');
  const go = () => { const w = box.clientWidth; if (!w || Math.abs(w - (box._w || 0)) < 3) return; box._w = w; box.replaceChildren(miniPage(doc, w, imageUrl)); };
  const ro = new ResizeObserver(go);
  ro.observe(box);
  const [pw, ph] = pageMM({ ...DEFAULTS, ...doc.settings });
  box.style.aspectRatio = `${pw}/${ph}`;
  return box;
}
