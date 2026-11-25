/**
 * PDF. The slides are laid out by the browser off screen (so lines break exactly as on screen), then every word is
 * written at its place with the real typeface: the text stays selectable and searchable, shapes stay vectors.
 */
import { slideNode, sorted, decorOf, mediaUrl } from './render.js';
import { slideContext, gradient, styleOf } from './themes.js';
import { shapePath, lineHeads } from './shapes.js';
import { deflate } from './zip.js';
import { face } from './ttf.js';
import { okLink } from './richtext.js';

const n = (v) => (Math.abs(v) < 1e-4 ? '0' : String(Math.round(v * 1000) / 1000));
const rgb = (hex) => [1, 3, 5].map((i) => n(parseInt(hex.slice(i, i + 2), 16) / 255)).join(' ');
const alphaOf = (hex) => (hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1);
const te = new TextEncoder();

export async function loadImage(src) {
  const im = new Image();
  im.src = src;
  await im.decode();
  return im;
}

export async function exportPdf(deck, ctx, { onProgress, onlyVisible = true } = {}) {
  const objs = []; // index + 1 = number of the object
  const add = (dict, stream) => { objs.push({ dict, stream }); return objs.length; };
  const fonts = new Map(), images = new Map(), gs = new Map(), shadings = new Map();
  const k = 0.75, W = ctx.W * k, H = ctx.H * k; // CSS px -> points
  const pagesId = add(''), pages = [];
  const host = document.createElement('div');
  host.className = 'offscreen';
  document.body.append(host);
  await document.fonts.ready;

  const gsName = (a) => { const key = n(a); if (!gs.has(key)) gs.set(key, { name: 'G' + gs.size, id: add(`<< /Type /ExtGState /ca ${key} /CA ${key} >>`) }); return gs.get(key).name; };
  async function imageObj(src) {
    if (images.has(src)) return images.get(src);
    const im = await loadImage(mediaUrl(src)), c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let alpha = false;
    for (let i = 3; i < px.length; i += 4) if (px[i] < 255) { alpha = true; break; }
    const base = `/Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8`;
    let id;
    if (!alpha) {
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', .88));
      id = add(`<< ${base} /Filter /DCTDecode`, new Uint8Array(await blob.arrayBuffer()));
    } else {
      const co = new Uint8Array(c.width * c.height * 3), al = new Uint8Array(c.width * c.height);
      for (let i = 0, j = 0; i < px.length; i += 4, j++) { co[j * 3] = px[i]; co[j * 3 + 1] = px[i + 1]; co[j * 3 + 2] = px[i + 2]; al[j] = px[i + 3]; }
      const m = add(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, await deflate(al));
      id = add(`<< ${base} /SMask ${m} 0 R /Filter /FlateDecode`, await deflate(co));
    }
    const r = { name: 'I' + images.size, id, w: c.width, h: c.height };
    images.set(src, r);
    return r;
  }
  const pathOps = (cmds) => cmds.map(([c, ...v]) => v.map(n).join(' ') + ' ' + { M: 'm', L: 'l', C: 'c', Z: 'h' }[c]).join('\n');
  /** The fill of a path: colour or gradient (drawn through a clip). Coordinates are in px of the element's box. */
  function fillOps(fill, sc, w, h, path) {
    const g = gradient(fill);
    if (!g) { const c = sc.color(fill), a = alphaOf(c); return (a < 1 ? `/${gsName(a)} gs\n` : '') + `${rgb(c)} rg\n${path}\nf*\n` + (a < 1 ? `/${gsName(1)} gs\n` : ''); }
    const a = sc.color(g.a), b = sc.color(g.b), an = (g.ang - 90) * Math.PI / 180, len = Math.abs(w * Math.sin(g.ang * Math.PI / 180)) + Math.abs(h * Math.cos(g.ang * Math.PI / 180)), dx = Math.cos(an) * len / 2, dy = Math.sin(an) * len / 2;
    const co = [w / 2 - dx, h / 2 - dy, w / 2 + dx, h / 2 + dy].map(n).join(' '), key = [co, a, b].join();
    const al = [alphaOf(a), alphaOf(b)];
    const mk = (space, c0, c1) => add(`<< /ShadingType 2 /ColorSpace /${space} /Coords [${co}] /Function << /FunctionType 2 /Domain [0 1] /C0 [${c0}] /C1 [${c1}] /N 1 >> /Extend [true true] >>`);
    if (!shadings.has(key)) {
      const s = { name: 'S' + shadings.size, id: mk('DeviceRGB', rgb(a), rgb(b)) };
      if (al[0] < 1 || al[1] < 1) {
        // a gradient that fades: a soft mask with the two opacities
        const ms = mk('DeviceGray', n(al[0]), n(al[1]));
        const f = add(`<< /Type /XObject /Subtype /Form /BBox [-9999 -9999 9999 9999] /Group << /S /Transparency /CS /DeviceGray >> /Resources << /Shading << /M ${ms} 0 R >> >>`, te.encode('/M sh'));
        s.mask = 'M' + shadings.size;
        gs.set('mask' + key, { name: s.mask, id: add(`<< /Type /ExtGState /SMask << /S /Luminosity /G ${f} 0 R >> >>`) });
      }
      shadings.set(key, s);
    }
    const s = shadings.get(key);
    return `q\n${path}\nW* n\n${s.mask ? `/${s.mask} gs\n` : ''}/${s.name} sh\nQ\n`;
  }
  const strokeOps = (el, sc, path, sw) => `${rgb(sc.color(el.stroke || '@fg'))} RG\n${n(sw)} w\n1 j\n${el.dash === 'dash' ? `[${n(sw * 3)} ${n(sw * 2)}] 0 d\n` : el.dash === 'dot' ? `1 J\n[0 ${n(sw * 2)}] 0 d\n` : ''}${path}\nS\n[] 0 d\n0 J\n`;

  /** Text: every word is measured in the laid-out slide and written there. */
  async function textOps(node, origin, sc) {
    let out = '';
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), runs = [];
    while (walker.nextNode()) runs.push(walker.currentNode);
    const box = origin.getBoundingClientRect();
    const m = new DOMMatrix(getComputedStyle(origin).transform), rotated = m.b || m.c;
    if (rotated) origin.style.transform = 'none'; // measured straight, turned in the PDF
    const o = rotated ? origin.getBoundingClientRect() : box;
    for (const tn of runs) {
      if (!tn.nodeValue.trim()) continue;
      const cs = getComputedStyle(tn.parentElement), size = parseFloat(cs.fontSize);
      const fam = Object.keys(FAM()).find((id) => cs.fontFamily.includes('"' + FAM()[id] + '"') || cs.fontFamily.startsWith(FAM()[id])) || 'inter';
      const f = await face(fam, +cs.fontWeight >= 600, cs.fontStyle === 'italic');
      if (!fonts.has(f.key)) fonts.set(f.key, { name: 'F' + fonts.size, f });
      const fn = fonts.get(f.key).name, col = cs.color.match(/[\d.]+/g).map(Number), hex = '#' + col.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
      const upper = cs.textTransform === 'uppercase', asc = f.ascent / 1000, desc = -f.descent / 1000;
      const re = /\S+/g;
      let w;
      while ((w = re.exec(tn.nodeValue))) {
        // a long word can still break over two lines: one piece for each rectangle
        const r = document.createRange();
        let i = w.index;
        const end = w.index + w[0].length;
        while (i < end) {
          let j = end;
          r.setStart(tn, i); r.setEnd(tn, j);
          if (r.getClientRects().length > 1) { j = i + 1; r.setEnd(tn, i + 1); const top = r.getBoundingClientRect().top; while (j < end) { r.setStart(tn, j); r.setEnd(tn, j + 1); if (Math.abs(r.getBoundingClientRect().top - top) > 2) break; j++; } r.setStart(tn, i); r.setEnd(tn, j); }
          const b = r.getBoundingClientRect(), raw = tn.nodeValue.slice(i, j), s = upper ? raw.toUpperCase() : raw, chars = [...s];
          i = j;
          if (!b.width) continue;
          let nat = 0, hexs = '';
          for (const ch of chars) { const g = f.glyph(ch.codePointAt(0)); nat += f.width(g); hexs += g.toString(16).padStart(4, '0'); }
          const natural = nat * size / 1000, tc = chars.length > 1 ? (b.width - natural) / chars.length : 0;
          // the rectangle of a text is ascent + descent of the typeface, whatever the line height
          const base = b.top - o.top + (b.height - (asc + desc) * size) / 2 + asc * size, x = b.left - o.left;
          const rise = 0;
          if (cs.backgroundColor && !/, 0\)$/.test(cs.backgroundColor) && cs.backgroundColor !== 'transparent') { const bc = cs.backgroundColor.match(/[\d.]+/g).map(Number); out += `${bc.slice(0, 3).map((v) => n(v / 255)).join(' ')} rg\n${n(x)} ${n(b.top - o.top)} ${n(b.width)} ${n(b.height)} re f\n`; }
          out += `BT\n${rgb(hex)} rg\n/${fn} ${n(size)} Tf\n${n(tc)} Tc\n1 0 0 -1 ${n(x)} ${n(base - rise)} Tm\n<${hexs}> Tj\nET\n`;
          const deco = (y) => `${rgb(hex)} rg\n${n(x)} ${n(y)} ${n(b.width)} ${n(Math.max(1, size * .06))} re f\n`;
          for (let p = tn.parentElement; p && p !== origin; p = p.parentElement) { const d = getComputedStyle(p).textDecorationLine; if (d.includes('underline')) { out += deco(base + size * .12); break; } }
          for (let p = tn.parentElement; p && p !== origin; p = p.parentElement) if (getComputedStyle(p).textDecorationLine.includes('line-through')) { out += deco(base - size * .28); break; }
        }
      }
    }
    // bullets and numbers of the lists
    for (const li of node.querySelectorAll('li')) {
      const cs = getComputedStyle(li), size = parseFloat(cs.fontSize), r = document.createRange();
      r.selectNodeContents(li);
      const first = [...r.getClientRects()].find((x) => x.width > 0) || li.getBoundingClientRect();
      const col = cs.color.match(/[\d.]+/g).map(Number), hex = '#' + col.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
      const fam = Object.keys(FAM()).find((id) => cs.fontFamily.includes(FAM()[id])) || 'inter', f = await face(fam, +cs.fontWeight >= 600, false);
      if (!fonts.has(f.key)) fonts.set(f.key, { name: 'F' + fonts.size, f });
      const ol = li.parentElement.tagName === 'OL', label = ol ? [...li.parentElement.children].indexOf(li) + 1 + '.' : '•';
      let hexs = '', wd = 0;
      for (const ch of label) { const g = f.glyph(ch.codePointAt(0)); hexs += g.toString(16).padStart(4, '0'); wd += f.width(g) * size / 1000; }
      const base = first.top - o.top + (first.height - (f.ascent - f.descent) / 1000 * size) / 2 + f.ascent / 1000 * size;
      out += `BT\n${rgb(hex)} rg\n/${fonts.get(f.key).name} ${n(size)} Tf\n0 Tc\n1 0 0 -1 ${n(li.getBoundingClientRect().left - o.left - wd - size * .45)} ${n(base)} Tm\n<${hexs}> Tj\nET\n`;
    }
    if (rotated) origin.style.transform = '';
    return out;
  }

  async function elementOps(el, node, sc) {
    let s = `q\n`;
    const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
    if (el.r) { const a = el.r * Math.PI / 180, c = Math.cos(a), d = Math.sin(a); s += `${n(c)} ${n(d)} ${n(-d)} ${n(c)} ${n(cx - c * cx + d * cy)} ${n(cy - d * cx - c * cy)} cm\n`; }
    if (el.o != null && el.o < 1) s += `/${gsName(el.o)} gs\n`;
    s += `1 0 0 1 ${n(el.x)} ${n(el.y)} cm\n`;
    const { w, h } = el;
    if (el.t === 'shape') {
      const sw = el.sw ?? (el.shape === 'line' ? 3 * sc.s : 0);
      if (el.shape === 'line') {
        const l = lineHeads(el, w, h, sw), c = { ...el, stroke: el.stroke || el.fill || '@fg' };
        s += strokeOps(c, sc, `${n(l.x1)} ${n(l.y)} m ${n(l.x2)} ${n(l.y)} l`, sw);
        for (const hd of l.heads) s += `${rgb(sc.color(c.stroke))} rg\n${pathOps(hd)}\nf\n`;
      } else {
        const p = pathOps(shapePath(el.shape || 'rect', w, h, el.rad || 0));
        if (el.flip) s += `q\n-1 0 0 1 ${n(w)} 0 cm\n`;
        if (el.fill) s += fillOps(el.fill, sc, w, h, p);
        if (sw) s += strokeOps(el, sc, p, sw);
        if (el.flip) s += 'Q\n';
      }
    } else if (el.t === 'text') {
      const p = pathOps(shapePath('rect', w, h, el.rad || 0));
      if (el.fill) s += fillOps(el.fill, sc, w, h, p);
      if (el.sw && el.stroke) s += strokeOps(el, sc, p, el.sw);
    } else {
      const src = el.t === 'video' ? el.poster : el.src, p = pathOps(shapePath(el.mask || 'rect', w, h, el.rad || 0));
      if (el.fill || !src) s += fillOps(el.fill || (el.t === 'video' ? '#14181b' : '@surface'), sc, w, h, p);
      if (src) try {
        const im = await imageObj(src), f = el.fit === 'contain' ? Math.min(w / im.w, h / im.h) : Math.max(w / im.w, h / im.h), z = el.zoom || 1, fx = el.fx ?? .5, fy = el.fy ?? .5;
        const iw = im.w * f, ih = im.h * f, ox = (w - iw) * fx, oy = (h - ih) * fy, px = fx * w, py = fy * h;
        s += `q\n${p}\nW* n\n`;
        if (el.flip) s += `-1 0 0 1 ${n(2 * px)} 0 cm\n`;
        s += `${n(iw * z)} 0 0 ${n(-ih * z)} ${n(px + (ox - px) * z)} ${n(py + (oy - py) * z + ih * z)} cm\n/${im.name} Do\nQ\n`;
      } catch { /* a missing picture leaves its place empty */ }
      if (el.t === 'video') { const c = Math.min(w, h) * .13; s += `/${gsName(.85)} gs\n1 1 1 rg\n${pathOps([['M', w / 2 - c * .7, h / 2 - c], ['L', w / 2 + c, h / 2], ['L', w / 2 - c * .7, h / 2 + c], ['Z']])}\nf\n`; }
      if (el.sw && el.stroke) s += strokeOps(el, sc, p, el.sw);
    }
    const rt = node.querySelector('.rt');
    if (rt) s += await textOps(rt, node, sc);
    return s + 'Q\n';
  }

  const list = deck.order().filter((s) => !onlyVisible || !s.d.hide), links = [];
  for (const [i, s] of list.entries()) {
    onProgress?.(i / list.length);
    const sc = slideContext(ctx, s.d), node = slideNode(s.d, ctx, { mode: 'export', index: deck.index(s.sid), count: deck.slides.size });
    host.replaceChildren(node);
    await document.fonts.load('16px "SP Inter"');
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    let c = `${n(k)} 0 0 ${n(-k)} 0 ${n(H)} cm\n`;
    const b = sc.bg, full = `0 0 ${n(ctx.W)} ${n(ctx.H)} re`;
    if (b.t === 'g') c += fillOps(`g|${b.ang ?? 135}|${b.a}|${b.b}`, sc, ctx.W, ctx.H, full);
    else if (b.t === 'i') {
      c += `${rgb(sc.colors.bg)} rg\n${full} f\n`;
      try { const im = await imageObj(b.src), f = Math.max(ctx.W / im.w, ctx.H / im.h); c += `q\n${full} W n\n${n(im.w * f)} 0 0 ${n(-im.h * f)} ${n((ctx.W - im.w * f) * (b.fx ?? .5))} ${n((ctx.H - im.h * f) * (b.fy ?? .5) + im.h * f)} cm\n/${im.name} Do\nQ\n`; } catch { /* missing */ }
      if (b.dim) c += `q\n/${gsName(b.dim)} gs\n${rgb(sc.colors.bg)} rg\n${full} f\nQ\n`;
    } else c += `${rgb(sc.color(b.c || '@bg'))} rg\n${full} f\n`;
    const { under, over } = decorOf(s.d, sc, deck.index(s.sid), deck.slides.size), els = sorted(s.d);
    const nodes = [...node.children].filter((x) => x.classList.contains('el')), all = [...under, ...els, ...over];
    for (const [j, el] of all.entries()) c += await elementOps(el, nodes[j], sc);
    // links: of whole elements and of words
    const nr = node.getBoundingClientRect(), annots = [], rect = (r) => `[${n((r.left - nr.left) * k)} ${n(H - (r.bottom - nr.top) * k)} ${n((r.right - nr.left) * k)} ${n(H - (r.top - nr.top) * k)}]`;
    const link = (r, href) => { if (okLink(href)) annots.push({ r: rect(r), href }); };
    for (const [j, el] of all.entries()) { if (el.link) link(nodes[j].getBoundingClientRect(), el.link); if (el.t === 'video' && el.vid) link(nodes[j].getBoundingClientRect(), el.kind === 'youtube' ? 'https://youtu.be/' + el.vid : el.kind === 'vimeo' ? 'https://vimeo.com/' + el.vid : el.vid); }
    for (const a of node.querySelectorAll('a')) for (const r of a.getClientRects()) link(r, a.getAttribute('href'));
    const cid = add('<< /Filter /FlateDecode', await deflate(te.encode(c)));
    pages.push({ cid, annots, sid: s.sid, pid: add('') });
  }
  host.remove();

  // typefaces, reduced to what was used
  let fontRes = '';
  for (const { name, f } of fonts.values()) {
    const data = f.subset(), ff = add(`<< /Length1 ${data.length} /Filter /FlateDecode`, await deflate(data)), ps = 'SAVPRE+' + f.key.replace(/[^a-z-]/g, '');
    const gl = [...f.used].sort((a, b) => a[0] - b[0]);
    const desc = add(`<< /Type /FontDescriptor /FontName /${ps} /Flags 4 /FontBBox [${f.bbox.join(' ')}] /ItalicAngle 0 /Ascent ${n(f.ascent)} /Descent ${n(f.descent)} /CapHeight ${n(f.ascent * .7)} /StemV 80 /FontFile2 ${ff} 0 R >>`);
    const cid = add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${ps} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${desc} 0 R /CIDToGIDMap /Identity /W [${gl.map(([g]) => `${g} [${n(f.width(g))}]`).join(' ')}] >>`);
    const hex4 = (x) => x.toString(16).padStart(4, '0'), u = gl.filter(([g, ch]) => g && ch).map(([g, ch]) => `<${hex4(g)}> <${ch > 0xffff ? hex4(0xd800 + ((ch - 0x10000) >> 10)) + hex4(0xdc00 + ((ch - 0x10000) & 1023)) : hex4(ch)}>`);
    let blocks = '';
    for (let i = 0; i < u.length; i += 100) blocks += `${Math.min(100, u.length - i)} beginbfchar\n${u.slice(i, i + 100).join('\n')}\nendbfchar\n`;
    const tu = add('<< /Filter /FlateDecode', await deflate(te.encode(`/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CMapName /SP def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <ffff>\nendcodespacerange\n${blocks}endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`)));
    fontRes += `/${name} ${add(`<< /Type /Font /Subtype /Type0 /BaseFont /${ps} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tu} 0 R >>`)} 0 R `;
    f.used = new Map([[0, 0]]);
  }
  const dict = (m) => [...m.values()].map((x) => `/${x.name} ${x.id} 0 R`).join(' ');
  const res = add(`<< /Font << ${fontRes}>> /XObject << ${dict(images)} >> /ExtGState << ${dict(gs)} >> /Shading << ${dict(shadings)} >> >>`);
  const str = (x) => '<feff' + [...x].flatMap((ch) => { const o = []; for (let i = 0; i < ch.length; i++) o.push(ch.charCodeAt(i).toString(16).padStart(4, '0')); return o; }).join('') + '>';
  for (const p of pages) {
    const an = p.annots.map((a) => { if (a.href.startsWith('#s:')) { const to = pages.find((x) => x.sid === a.href.slice(3)); return to ? add(`<< /Type /Annot /Subtype /Link /Rect ${a.r} /Border [0 0 0] /Dest [${to.pid} 0 R /Fit] >>`) : 0; } return add(`<< /Type /Annot /Subtype /Link /Rect ${a.r} /Border [0 0 0] /A << /S /URI /URI (${a.href.replace(/[\\()]/g, (c) => '\\' + c).replace(/[^\x20-\x7e]/g, (c) => encodeURIComponent(c))}) >> >>`); }).filter(Boolean);
    objs[p.pid - 1].dict = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(W)} ${n(H)}] /Contents ${p.cid} 0 R /Resources ${res} 0 R${an.length ? ` /Annots [${an.map((x) => x + ' 0 R').join(' ')}]` : ''} >>`;
  }
  objs[pagesId - 1].dict = `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((p) => p.pid + ' 0 R').join(' ')}] >>`;
  const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R /PageLayout /SinglePage >>`), info = add(`<< /Title ${str(deck.title)} /Creator (SavPresentations) /Producer (SavPresentations) >>`);
  const out = [], off = [];
  let pos = 0;
  const w = (x) => { const b = typeof x === 'string' ? te.encode(x) : x; out.push(b); pos += b.length; };
  w('%PDF-1.5\n'); w(new Uint8Array([37, 226, 227, 207, 211, 10]));
  objs.forEach((o, i) => { off.push(pos); w(`${i + 1} 0 obj\n`); if (o.stream) { w(`${o.dict} /Length ${o.stream.length} >>\nstream\n`); w(o.stream); w('\nendstream'); } else w(o.dict); w('\nendobj\n'); });
  const xref = pos;
  w(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(out, { type: 'application/pdf' });
}
import { FONTS } from './themes.js';
let fam;
const FAM = () => (fam ||= Object.fromEntries(Object.entries(FONTS).map(([id, f]) => [id, 'SP ' + f[0]])));
void styleOf;
