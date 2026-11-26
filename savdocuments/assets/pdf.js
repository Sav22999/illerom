/**
 * PDF of a document, written in the browser (no print window). Every page is drawn exactly as it prints — the same lines, typefaces,
 * objects, formulas, header, footer and watermark — into a sharp picture (the browser lays it out: SVG foreignObject), and over the
 * picture goes the text, invisible, word by word at its place: it can be selected, copied and searched. Links stay links (also the ones
 * of the table of contents, to their page) and the headings become the bookmarks of the file.
 * Why a picture: the included typefaces are WOFF2, which a browser can draw but cannot unpack to put inside a PDF.
 */

const SCALE = 2.2; // about 210 dpi: sharp on screen and on paper
const te = new TextEncoder();
const n = (v) => (Math.abs(v) < 1e-4 ? '0' : String(Math.round(v * 100) / 100));

async function deflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const dataUrl = (blob) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(blob); });
const fetchData = async (url) => { const r = await fetch(url, { credentials: 'same-origin' }); if (!r.ok) throw new Error('fetch'); return dataUrl(await r.blob()); };

// ------------------------------------------------------------------ what the pictures need: the styles of the page and its typefaces

const familiesOf = (root) => {
  const out = new Set();
  for (const el of [root, ...root.querySelectorAll('*')]) for (const f of getComputedStyle(el).fontFamily.split(',')) out.add(f.trim().replace(/^["']|["']$/g, '').toLowerCase());
  return out;
};

/** The CSS of the document (doc.css, app.css, the typefaces of the page as data: an SVG picture cannot load anything else). */
async function styles(root, settings) {
  const used = familiesOf(root), css = [], faces = [];
  const fontRule = (r, base) => {
    const fam = r.style.getPropertyValue('font-family').trim().replace(/^["']|["']$/g, '').toLowerCase();
    if (!used.has(fam)) return;
    const m = r.style.getPropertyValue('src').match(/url\(\s*["']?([^"')]+)["']?\s*\)/);
    if (m) faces.push({ text: r.cssText, url: new URL(m[1], base).href, raw: m[0] });
  };
  for (const sh of document.styleSheets) {
    let rules;
    try { rules = sh.cssRules; } catch { continue; } // another site: read below if it is Bunny Fonts
    const base = sh.href || location.href, keep = !sh.href || /\/(doc|app|fonts)\.css/.test(sh.href);
    for (const r of rules) {
      if (r instanceof CSSFontFaceRule) fontRule(r, base);
      else if (keep && !(r instanceof CSSImportRule)) css.push(r.cssText);
    }
  }
  // typefaces of Bunny Fonts: their CSS is read as text
  for (const l of document.querySelectorAll('link[rel=stylesheet][href^="https://fonts.bunny.net/"]')) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(await (await fetch(l.href)).text());
      for (const r of sheet.cssRules) if (r instanceof CSSFontFaceRule) fontRule(r, l.href);
    } catch { /* without it: a typeface of the same kind */ }
  }
  // typefaces from file (loaded with FontFace, not with CSS)
  for (const f of settings.fonts || []) if (f.f && used.has(f.n.toLowerCase())) faces.push({ text: `@font-face { font-family: "${f.n}"; src: url(api/?r=font&id=${f.f}); }`, url: new URL(`api/?r=font&id=${f.f}`, location.href).href, raw: `url(api/?r=font&id=${f.f})` });
  const seen = new Map();
  for (const f of faces) {
    try {
      if (!seen.has(f.url)) seen.set(f.url, await fetchData(f.url));
      css.unshift(f.text.replace(f.raw, `url(${seen.get(f.url)})`));
    } catch { /* missing: the fallback typeface */ }
  }
  return css.join('\n');
}

/** One page as a picture (JPEG bytes). */
async function picture(wrap, page, css, w, h) {
  const box = wrap.cloneNode(false);
  box.removeAttribute('id');
  box.style.cssText += ';display:block;position:static;margin:0';
  const copy = page.cloneNode(true);
  // pictures as data, the only kind an SVG picture shows
  const imgs = [...page.querySelectorAll('img')], cimgs = [...copy.querySelectorAll('img')];
  await Promise.all(imgs.map(async (im, i) => { try { if (im.currentSrc && !im.currentSrc.startsWith('data:')) cimgs[i].src = await fetchData(im.currentSrc); } catch { cimgs[i].removeAttribute('src'); } cimgs[i].removeAttribute('loading'); cimgs[i].removeAttribute('srcset'); }));
  box.append(copy);
  const html = new XMLSerializer().serializeToString(box);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><foreignObject x="0" y="0" width="${w}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;overflow:hidden;margin:0"><style>${css.replace(/<\/style/gi, '<\\/style')}</style>${html}</div></foreignObject></svg>`;
  const im = new Image();
  im.decoding = 'sync';
  im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await im.decode();
  const c = document.createElement('canvas');
  c.width = Math.round(w * SCALE);
  c.height = Math.round(h * SCALE);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.scale(SCALE, SCALE);
  g.drawImage(im, 0, 0, w, h);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.9));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), pw: c.width, ph: c.height };
}

// ------------------------------------------------------------------ the text, invisible, over the picture

// widths of Helvetica (1/1000 of the size) for the characters 32–126; the others count as an average letter
const HW = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const width = (s) => [...s].reduce((a, ch) => { const c = ch.codePointAt(0); return a + (c >= 32 && c <= 126 ? HW[c - 32] : 556); }, 0);
// WinAnsi: the letters of Western languages; the others lose their accent (ń → n), or become "?"
const WIN = { 0x20ac: 128, 0x201a: 130, 0x192: 131, 0x201e: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135, 0x2c6: 136, 0x2030: 137, 0x160: 138, 0x2039: 139, 0x152: 140, 0x17d: 142, 0x2018: 145, 0x2019: 146, 0x201c: 147, 0x201d: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151, 0x2dc: 152, 0x2122: 153, 0x161: 154, 0x203a: 155, 0x153: 156, 0x17e: 158, 0x178: 159 };
const ansi = (s) => [...s].map((ch) => { let c = ch.codePointAt(0); if (!(c < 128 || (c >= 160 && c < 256) || WIN[c])) c = ch.normalize('NFD').codePointAt(0); const b = c < 128 || (c >= 160 && c < 256) ? c : WIN[c] || 63; return b === 40 || b === 41 || b === 92 ? '\\' + String.fromCharCode(b) : b < 32 || b > 126 ? '\\' + b.toString(8).padStart(3, '0') : String.fromCharCode(b); }).join('');

/** The words of a page: [{x, y, w, h, text}] in px of the page, and the links. */
function words(page) {
  const P = page.getBoundingClientRect(), out = [], links = [], range = document.createRange();
  const walk = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    const el = t.parentElement;
    if (!el || !t.data.trim() || el.closest('svg style, style, script')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    for (const m of t.data.matchAll(/\S+/g)) {
      range.setStart(t, m.index);
      range.setEnd(t, m.index + m[0].length);
      const rs = [...range.getClientRects()].filter((r) => r.width > 0.3 && r.height > 0.3);
      if (!rs.length) continue;
      const r = rs[0], last = rs.at(-1), wd = rs.length > 1 && Math.abs(last.top - r.top) < 2 ? last.right - r.left : r.width;
      if (r.right < P.left || r.left > P.right || r.bottom < P.top || r.top > P.bottom) continue;
      out.push({ x: r.left - P.left, y: r.top - P.top, w: wd, h: r.height, text: m[0] + ' ' });
    }
  }
  for (const a of page.querySelectorAll('a[href]')) for (const r of a.getClientRects()) if (r.width > 1) links.push({ x: r.left - P.left, y: r.top - P.top, w: r.width, h: r.height, href: a.getAttribute('href') });
  return { out, links };
}

// ------------------------------------------------------------------ the file

/**
 * pages: the element made by Pager.printable (already in the page, laid out off screen); title of the document.
 * onProgress(0…1) while the pages are drawn.
 */
export async function toPdf(pages, title, settings, onProgress) {
  await document.fonts.ready;
  const sheets = [...pages.querySelectorAll(':scope > .psheet')];
  if (!sheets.length) throw new Error('no pages');
  const css = await styles(pages, settings);
  const objs = [], add = (dict, stream) => { objs.push({ dict, stream }); return objs.length; };
  const pagesId = add(''), fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const list = [], marks = [];
  for (const [i, sh] of sheets.entries()) {
    onProgress?.(i / sheets.length);
    const r = sh.getBoundingClientRect(), w = r.width, h = r.height, k = 0.75; // CSS px -> points
    const pic = await picture(pages, sh, css, w, h);
    const imId = add(`<< /Type /XObject /Subtype /Image /Width ${pic.pw} /Height ${pic.ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, pic.bytes);
    const { out, links } = words(sh);
    let c = `q\n${n(w * k)} 0 0 ${n(h * k)} 0 0 cm\n/Im Do\nQ\nBT\n3 Tr\n`;
    for (const x of out) {
      const size = Math.max(1, x.h * 0.78), natural = (width(x.text) - width(' ')) / 1000 * size;
      c += `/F1 ${n(size * k)} Tf\n${n(natural > 0 ? Math.max(1, Math.min(500, x.w / natural * 100)) : 100)} Tz\n1 0 0 1 ${n(x.x * k)} ${n((h - x.y - x.h * 0.8) * k)} Tm\n(${ansi(x.text)}) Tj\n`;
    }
    c += 'ET\n';
    const cid = add('<< /Filter /FlateDecode', await deflate(te.encode(c)));
    list.push({ cid, imId, w, h, links, pid: add(''), sheet: sh });
    for (const hd of sh.querySelectorAll('h1, h2')) { const q = hd.getBoundingClientRect(), text = hd.textContent.trim(); if (text && !hd.closest('.toc')) marks.push({ page: list.length - 1, y: q.top - r.top, text: text.slice(0, 120), level: hd.localName === 'h1' ? 1 : 2 }); }
  }
  onProgress?.(1);
  // links: to a site, or (the table of contents) to the page of a heading
  const where = (id) => { for (const [i, p] of list.entries()) { const el = p.sheet.querySelector('#' + CSS.escape(id)); if (el) return { i, y: el.getBoundingClientRect().top - p.sheet.getBoundingClientRect().top }; } return null; };
  const uri = (s) => s.replace(/[\\()]/g, (ch) => '\\' + ch).replace(/[^\x20-\x7e]/g, (ch) => encodeURIComponent(ch));
  for (const p of list) {
    const k = 0.75, annots = [];
    for (const l of p.links) {
      const rect = `[${n(l.x * k)} ${n((p.h - l.y - l.h) * k)} ${n((l.x + l.w) * k)} ${n((p.h - l.y) * k)}]`;
      if (/^(https?:|mailto:)/i.test(l.href)) annots.push(add(`<< /Type /Annot /Subtype /Link /Rect ${rect} /Border [0 0 0] /A << /S /URI /URI (${uri(l.href)}) >> >>`));
      else if (l.href.startsWith('#')) { const to = where(l.href.slice(1)); if (to) annots.push(add(`<< /Type /Annot /Subtype /Link /Rect ${rect} /Border [0 0 0] /Dest [${list[to.i].pid} 0 R /XYZ 0 ${n((list[to.i].h - to.y + 8) * k)} null] >>`)); }
    }
    objs[p.pid - 1].dict = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(p.w * k)} ${n(p.h * k)}] /Contents ${p.cid} 0 R /Resources << /XObject << /Im ${p.imId} 0 R >> /Font << /F1 ${fontId} 0 R >> >>${annots.length ? ` /Annots [${annots.map((a) => a + ' 0 R').join(' ')}]` : ''} >>`;
  }
  objs[pagesId - 1].dict = `<< /Type /Pages /Count ${list.length} /Kids [${list.map((p) => p.pid + ' 0 R').join(' ')}] >>`;
  const str = (x) => '<feff' + [...x].flatMap((ch) => [...ch].map((_, i) => ch.charCodeAt(i).toString(16).padStart(4, '0'))).join('') + '>';
  let outline = '';
  if (marks.length) {
    const root = add(''), first = objs.length + 1;
    marks.forEach((m, i) => add(`<< /Title ${str(m.text)} /Parent ${root} 0 R /Dest [${list[m.page].pid} 0 R /XYZ 0 ${n((list[m.page].h - m.y + 8) * 0.75)} null]${i ? ` /Prev ${first + i - 1} 0 R` : ''}${i < marks.length - 1 ? ` /Next ${first + i + 1} 0 R` : ''} >>`));
    objs[root - 1].dict = `<< /Type /Outlines /First ${first} 0 R /Last ${first + marks.length - 1} 0 R /Count ${marks.length} >>`;
    outline = ` /Outlines ${root} 0 R /PageMode /UseOutlines`;
  }
  const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R${outline}${settings.lang ? ` /Lang (${settings.lang})` : ''} >>`);
  const info = add(`<< /Title ${str(title)} /Creator (SavDocuments) /Producer (SavDocuments) >>`);
  const parts = [];
  let pos = 0;
  const w = (x) => { const b = typeof x === 'string' ? te.encode(x) : x; parts.push(b); pos += b.length; };
  const off = [];
  w('%PDF-1.5\n');
  w(new Uint8Array([37, 226, 227, 207, 211, 10]));
  objs.forEach((o, i) => {
    off.push(pos);
    w(`${i + 1} 0 obj\n`);
    if (o.stream) { w(`${o.dict} /Length ${o.stream.length} >>\nstream\n`); w(o.stream); w('\nendstream'); } else w(o.dict);
    w('\nendobj\n');
  });
  const xref = pos;
  w(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}
