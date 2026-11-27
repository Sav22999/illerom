/**
 * OpenDocument text (.odt) and Word 97-2003 (.doc), writing and reading, without libraries.
 *   .odt  written from the clean HTML of the document (standalone in files.js): paragraphs, headings, lists, tables,
 *         pictures (objects become pictures), footnotes, page size, margins, header and footer. Read back the same way.
 *   .doc  written as Word opens it: a web page in one file (MHTML) with its pictures. Read: the binary files of Word 97-2003
 *         (the text and its paragraphs and tables: the formatting of those files is not kept), and the .doc files that are
 *         in fact web pages, MHTML or RTF.
 */
import { text, unzip, zip } from './zip.js';
import { cleanBlocks, esc, newId } from './clean.js';
import { DEFAULTS, MM, SIZES, pageMM } from './settings.js';
import { cleanObject, label, objectPng } from './objects.js';
import { standalone } from './files.js';
import { cfb } from './cfb.js';

const ODT = 'application/vnd.oasis.opendocument.text';
const unesc = (v) => new DOMParser().parseFromString(v, 'text/html').body.textContent;
const hexId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
const x = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const cm = (mm) => (mm / 10).toFixed(3) + 'cm';

/** Pictures every program shows (PNG or JPEG), with their size; objects (charts, diagrams…) drawn as pictures. */
async function prepare(d) {
  const images = { ...d.images }, look = { accent: d.settings.accent || '#8a2346', ink: d.settings.color }, done = {};
  const blocks = [];
  for (const b of d.blocks) {
    let h = b.h;
    for (const [all, raw] of [...h.matchAll(/<figure([^>]*) data-o="([^"]*)"([^>]*)>/g)].map((m) => [m[0], m[2]])) {
      const json = unesc(raw);
      if (done[json] === undefined) {
        done[json] = null;
        try { const o = cleanObject(JSON.parse(json)); if (o) { const r = await objectPng(o, look, 3), id = hexId(); images[id] = r.blob; done[json] = { id, alt: label(o) }; } } catch { /* left out */ }
      }
      const p = done[json];
      h = h.replace(all, all.replace(/ data-o="[^"]*"/, '') + (p ? `<img data-i="${p.id}" alt="${esc(p.alt)}">` : ''));
    }
    // footnotes stay notes (not the list at the end of a web page); formulas as their text
    // page breaks are kept (a web page drops them)
    h = h.replace(/<div class="pb"><\/div>/g, '<div class="pb" data-keep="1"></div>');
    h = h.replace(/<sup class="fn" data-n="([^"]*)"><\/sup>/g, '<sup data-note="$1"></sup>').replace(/<span class="math" data-m="([^"]*)"><\/span>/g, (m, t) => `<em>${t}</em>`);
    blocks.push({ ...b, h });
  }
  const pics = {};
  for (const [id, blob] of Object.entries(images)) {
    try {
      const bmp = await createImageBitmap(blob);
      let out = blob;
      if (!/image\/(png|jpeg)/.test(blob.type)) { const c = new OffscreenCanvas(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0); out = await c.convertToBlob({ type: 'image/png' }); }
      pics[id] = { w: bmp.width, h: bmp.height, ext: out.type === 'image/png' ? 'png' : 'jpg', mime: out.type, data: new Uint8Array(await out.arrayBuffer()) };
    } catch { /* a picture that cannot be read is left out */ }
  }
  return { blocks, pics };
}

// ------------------------------------------------------------------ writing .odt

export async function toOdt(d) {
  const s = { ...DEFAULTS, ...d.settings }, [pw, ph] = pageMM(s), textW = pw - s.ml - s.mr;
  const { blocks, pics } = await prepare(d);
  const html = standalone({ settings: s, blocks }, (id) => 'pic:' + id);
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const tstyles = new Map(), pstyles = new Map(), used = new Set();
  let frames = 0, notes = 0;
  const tStyle = (k) => { const key = JSON.stringify(k); if (!tstyles.has(key)) tstyles.set(key, { name: 'T' + (tstyles.size + 1), k }); return tstyles.get(key).name; };
  const pStyle = (parent, align) => { if (!align || align === 'start' || align === 'left') return parent; const key = parent + '|' + align; if (!pstyles.has(key)) pstyles.set(key, { name: 'P' + (pstyles.size + 1), parent, align }); return pstyles.get(key).name; };
  const textOf = (str) => x(str).replace(/ {2,}/g, (m) => ` <text:s text:c="${m.length - 1}"/>`).replace(/\t/g, '<text:tab/>').replace(/\n/g, '<text:line-break/>');
  const frame = (img) => {
    const id = (img.getAttribute('src') || '').replace(/^pic:/, ''), p = pics[id];
    if (!p) return '';
    used.add(id);
    const fig = img.closest('figure'), pct = +(fig?.getAttribute('data-w') || 0), wmm = Math.min(textW, pct ? (textW * pct) / 100 : p.w * 0.2646), hmm = (wmm * p.h) / p.w;
    return `<draw:frame draw:style-name="Fr" draw:name="Picture${++frames}" text:anchor-type="as-char" svg:width="${cm(wmm)}" svg:height="${cm(hmm)}"><draw:image xlink:href="Pictures/${id}.${p.ext}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/><svg:desc>${x(img.getAttribute('alt') || '')}</svg:desc></draw:frame>`;
  };
  const inline = (node, k = {}) => {
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { const t = n.data.replace(/\s+/g, ' '); out += Object.keys(k).length ? `<text:span text:style-name="${tStyle(k)}">${textOf(t)}</text:span>` : textOf(t); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.localName, st = n.style || {}, k2 = { ...k };
      if (tag === 'br') { out += '<text:line-break/>'; continue; }
      if (tag === 'img') { out += frame(n); continue; }
      if (tag === 'sup' && n.hasAttribute('data-note')) { notes++; out += `<text:note text:id="ftn${notes}" text:note-class="footnote"><text:note-citation>${notes}</text:note-citation><text:note-body><text:p text:style-name="Footnote">${textOf(n.getAttribute('data-note'))}</text:p></text:note-body></text:note>`; continue; }
      if (tag === 'strong' || tag === 'b') k2.b = 1;
      if (tag === 'em' || tag === 'i') k2.i = 1;
      if (tag === 'u') k2.u = 1;
      if (tag === 's' || tag === 'strike' || tag === 'del') k2.s = 1;
      if (tag === 'sub') k2.pos = 'sub';
      if (tag === 'sup') k2.pos = 'super';
      if (tag === 'code') k2.mono = 1;
      if (st.color) k2.color = st.color;
      if (st.backgroundColor) k2.bg = st.backgroundColor;
      if (st.fontSize) k2.size = st.fontSize;
      if (st.fontWeight && +st.fontWeight >= 600) k2.b = 1;
      if (st.fontStyle === 'italic') k2.i = 1;
      if (/underline/.test(st.textDecoration || '')) k2.u = 1;
      if (/line-through/.test(st.textDecoration || '')) k2.s = 1;
      const inner = inline(n, k2);
      out += tag === 'a' && n.getAttribute('href') && !n.getAttribute('href').startsWith('#') ? `<text:a xlink:type="simple" xlink:href="${x(n.getAttribute('href'))}">${inner}</text:a>` : inner;
    }
    return out;
  };
  const isBlock = (n) => n.nodeType === 1 && /^(p|h[1-6]|ul|ol|table|figure|blockquote|pre|div|hr|figcaption)$/.test(n.localName);
  const para = (style, n) => `<text:p text:style-name="${pStyle(style, n.style?.textAlign)}">${inline(n)}</text:p>`;
  const blocksOf = (node, style = 'Standard') => [...node.childNodes].map((n) => (n.nodeType === 3 ? (n.data.trim() ? `<text:p text:style-name="${style}">${textOf(n.data.trim())}</text:p>` : '') : block(n, style))).join('');
  const list = (n, level = 1) => `<text:list text:style-name="${n.localName === 'ol' ? 'LNum' : 'LBul'}">${[...n.children].filter((li) => li.localName === 'li').map((li) => {
    const own = [...li.childNodes].filter((c) => !(c.nodeType === 1 && /^(ul|ol)$/.test(c.localName))), sub = [...li.children].filter((c) => /^(ul|ol)$/.test(c.localName));
    const box = document.createElement('p');
    own.forEach((c) => box.append(c.cloneNode(true)));
    return `<text:list-item><text:p text:style-name="List">${li.dataset.c ? '☑ ' : li.closest('ul.check') ? '☐ ' : ''}${inline(box)}</text:p>${sub.map((u) => list(u, level + 1)).join('')}</text:list-item>`;
  }).join('')}</text:list>`;
  const table = (n) => {
    const rows = [...n.querySelectorAll(':scope > tbody > tr, :scope > tr, :scope > thead > tr')], cols = Math.max(1, ...rows.map((r) => [...r.children].reduce((a, c) => a + (+c.getAttribute('colspan') || 1), 0)));
    return `<table:table table:style-name="Tbl"><table:table-column table:style-name="Col" table:number-columns-repeated="${cols}"/>${rows.map((r) => `<table:table-row>${[...r.children].map((c) => {
      const span = +c.getAttribute('colspan') || 1, head = c.localName === 'th';
      const cell = `<table:table-cell table:style-name="Cell"${span > 1 ? ` table:number-columns-spanned="${span}"` : ''} office:value-type="string">${[...c.childNodes].some(isBlock) ? blocksOf(c, head ? 'TableHead' : 'TableText') : `<text:p text:style-name="${head ? 'TableHead' : 'TableText'}">${inline(c)}</text:p>`}</table:table-cell>`;
      return cell + '<table:covered-table-cell/>'.repeat(span - 1);
    }).join('')}</table:table-row>`).join('')}</table:table>`;
  };
  function block(n, style = 'Standard') {
    if (n.nodeType !== 1) return '';
    const tag = n.localName, cls = n.classList;
    if (/^h[1-6]$/.test(tag)) { const l = Math.min(4, +tag[1]); return `<text:h text:style-name="${pStyle('Heading_20_' + l, n.style.textAlign)}" text:outline-level="${l}">${inline(n)}</text:h>`; }
    if (tag === 'p') return para(cls.contains('title') ? 'Title' : cls.contains('subtitle') ? 'Subtitle' : cls.contains('lead') ? 'Lead' : cls.contains('small') ? 'Small' : style, n);
    if (tag === 'ul' || tag === 'ol') return list(n);
    if (tag === 'table') return table(n);
    if (tag === 'hr') return '<text:p text:style-name="Rule"/>';
    if (tag === 'pre') return `<text:p text:style-name="Preformatted_20_Text">${textOf(n.textContent)}</text:p>`;
    if (tag === 'blockquote') return [...n.childNodes].some(isBlock) ? blocksOf(n, 'Quotations') : para('Quotations', n);
    if (tag === 'figure') { const img = n.querySelector('img'), cap = n.querySelector('figcaption'); return (img ? `<text:p text:style-name="${pStyle('Figure', { l: 'start', r: 'end' }[n.getAttribute('data-a')] || 'center')}">${frame(img)}</text:p>` : '') + (cap && cap.textContent.trim() ? `<text:p text:style-name="Caption">${inline(cap)}</text:p>` : ''); }
    if (tag === 'figcaption') return `<text:p text:style-name="Caption">${inline(n)}</text:p>`;
    if (tag === 'div' && cls.contains('pb')) return '<text:p text:style-name="PageBreak"/>';
    if (tag === 'div' && cls.contains('callout')) return [...n.childNodes].some(isBlock) ? blocksOf(n, 'Callout') : para('Callout', n);
    if (tag === 'div' || tag === 'section') return blocksOf(n, style);
    if (tag === 'img') return `<text:p text:style-name="Figure">${frame(n)}</text:p>`;
    return para(style, n);
  }
  const content = blocksOf(body);
  // automatic styles: the formatting of words, the alignment of paragraphs
  const tprops = (k) => [k.b && 'fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"', k.i && 'fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"', k.u && 'style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"', k.s && 'style:text-line-through-style="solid"', k.pos && `style:text-position="${k.pos} 58%"`, k.mono && 'style:font-name="Courier New"', k.color && `fo:color="${x(hexOf(k.color))}"`, k.bg && `fo:background-color="${x(hexOf(k.bg))}"`, k.size && `fo:font-size="${x(sizeOf(k.size))}"`].filter(Boolean).join(' ');
  const auto = [...tstyles.values()].map((t) => `<style:style style:name="${t.name}" style:family="text"><style:text-properties ${tprops(t.k)}/></style:style>`).join('')
    + [...pstyles.values()].map((p) => `<style:style style:name="${p.name}" style:family="paragraph" style:parent-style-name="${p.parent}"><style:paragraph-properties fo:text-align="${{ center: 'center', right: 'end', end: 'end', justify: 'justify' }[p.align] || 'start'}"/></style:style>`).join('');
  const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0" office:version="1.3"';
  const fonts = [...new Set([s.font, s.headFont, 'Courier New'].filter(Boolean))];
  const fontDecls = `<office:font-face-decls>${fonts.map((f) => `<style:font-face style:name="${x(f)}" svg:font-family="'${x(f)}'"/>`).join('')}</office:font-face-decls>`;
  const contentXml = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS}>${fontDecls}<office:automatic-styles>${auto}<style:style style:name="Tbl" style:family="table"><style:table-properties style:width="${cm(textW)}" table:align="margins" fo:margin-bottom="0.3cm"/></style:style><style:style style:name="Col" style:family="table-column"/><style:style style:name="Cell" style:family="table-cell"><style:table-cell-properties fo:padding="0.12cm" fo:border="0.5pt solid #b9c4bd"/></style:style><style:style style:name="Fr" style:family="graphic"><style:graphic-properties style:vertical-pos="top" style:vertical-rel="baseline"/></style:style></office:automatic-styles><office:body><office:text>${content || '<text:p/>'}</office:text></office:body></office:document-content>`;
  // named styles, page, header and footer
  const ink = hexOf(s.color) || '#1c1c1c', head = hexOf(s.headColor) || ink, accent = hexOf(s.accent) || '#8a2346', fs = s.fontSize || 11, gap = s.gap ?? 6, lh = Math.round((s.line || 1.5) * 100);
  const P = (name, display, parent, para, txt, extra = '') => `<style:style style:name="${name}" style:display-name="${display}" style:family="paragraph"${parent ? ` style:parent-style-name="${parent}"` : ''}${extra}><style:paragraph-properties ${para}/><style:text-properties ${txt}/></style:style>`;
  const hsize = [0, 1.9, 1.5, 1.25, 1.1];
  const named = P('Standard', 'Standard', '', `fo:margin-top="0cm" fo:margin-bottom="${gap}pt" fo:line-height="${lh}%"${s.justify ? ' fo:text-align="justify"' : ''}`, `style:font-name="${x(s.font)}" fo:font-size="${fs}pt" fo:color="${ink}"`)
    + [1, 2, 3, 4].map((l) => P('Heading_20_' + l, 'Heading ' + l, 'Standard', `fo:margin-top="${Math.round(fs * (l < 3 ? 1.3 : 1))}pt" fo:margin-bottom="${Math.round(fs * 0.4)}pt" fo:keep-with-next="always"`, `style:font-name="${x(s.headFont || s.font)}" fo:font-size="${(fs * hsize[l]).toFixed(1)}pt" fo:font-weight="bold" fo:color="${head}"`, ` style:default-outline-level="${l}"`)).join('')
    + P('Title', 'Title', 'Standard', 'fo:margin-bottom="4pt"', `style:font-name="${x(s.headFont || s.font)}" fo:font-size="${(fs * 2.6).toFixed(1)}pt" fo:font-weight="bold" fo:color="${head}"`)
    + P('Subtitle', 'Subtitle', 'Standard', `fo:margin-bottom="${fs}pt"`, `fo:font-size="${(fs * 1.35).toFixed(1)}pt" fo:color="${accent}"`)
    + P('Lead', 'Lead', 'Standard', '', `fo:font-size="${(fs * 1.2).toFixed(1)}pt"`) + P('Small', 'Small', 'Standard', '', `fo:font-size="${(fs * 0.85).toFixed(1)}pt"`)
    + P('Quotations', 'Quotations', 'Standard', `fo:margin-left="0.8cm" fo:padding-left="0.3cm" fo:border-left="2pt solid ${accent}"`, 'fo:font-style="italic"')
    + P('Preformatted_20_Text', 'Preformatted Text', 'Standard', 'fo:background-color="#f2f4f3" fo:padding="0.15cm"', `style:font-name="Courier New" fo:font-size="${(fs * 0.9).toFixed(1)}pt"`)
    + P('Callout', 'Callout', 'Standard', `fo:background-color="#eef4f8" fo:padding="0.2cm" fo:border-left="3pt solid ${accent}"`, '')
    + P('List', 'List', 'Standard', 'fo:margin-bottom="2pt"', '') + P('Figure', 'Figure', 'Standard', 'fo:text-align="center" fo:margin-bottom="2pt"', '')
    + P('Caption', 'Caption', 'Standard', 'fo:text-align="center"', `fo:font-size="${(fs * 0.85).toFixed(1)}pt" fo:font-style="italic" fo:color="#5f6660"`)
    + P('Footnote', 'Footnote', 'Standard', 'fo:margin-bottom="0cm"', `fo:font-size="${(fs * 0.8).toFixed(1)}pt"`)
    + P('TableText', 'Table Contents', 'Standard', 'fo:margin-bottom="0cm"', '') + P('TableHead', 'Table Heading', 'TableText', '', 'fo:font-weight="bold"')
    + P('Rule', 'Horizontal Line', 'Standard', 'fo:border-bottom="0.75pt solid #b9c4bd" fo:padding-bottom="2pt" fo:margin-bottom="8pt"', 'fo:font-size="4pt"')
    + P('PageBreak', 'Page Break', 'Standard', 'fo:break-after="page" fo:margin-bottom="0cm"', 'fo:font-size="2pt"')
    + P('HeaderFooter', 'Header and Footer', 'Standard', 'fo:margin-bottom="0cm"', `fo:font-size="${(fs * 0.82).toFixed(1)}pt" fo:color="#666666"`, '').replace('<style:paragraph-properties fo:margin-bottom="0cm"/>', `<style:paragraph-properties fo:margin-bottom="0cm"><style:tab-stops><style:tab-stop style:position="${cm(textW / 2)}" style:type="center"/><style:tab-stop style:position="${cm(textW)}" style:type="right"/></style:tab-stops></style:paragraph-properties>`);
  const lists = `<text:list-style style:name="LBul">${[1, 2, 3, 4, 5].map((l) => `<text:list-level-style-bullet text:level="${l}" text:bullet-char="${['•', '◦', '▪', '•', '◦'][l - 1]}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${(0.63 * l).toFixed(2)}cm" fo:text-indent="-0.63cm" fo:margin-left="${(0.63 * l).toFixed(2)}cm"/></style:list-level-properties></text:list-level-style-bullet>`).join('')}</text:list-style>`
    + `<text:list-style style:name="LNum">${[1, 2, 3, 4, 5].map((l) => `<text:list-level-style-number text:level="${l}" style:num-suffix="." style:num-format="${['1', 'a', 'i', '1', 'a'][l - 1]}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${(0.63 * l).toFixed(2)}cm" fo:text-indent="-0.63cm" fo:margin-left="${(0.63 * l).toFixed(2)}cm"/></style:list-level-properties></text:list-level-style-number>`).join('')}</text:list-style>`;
  const band = (z) => {
    if (!(z?.l || z?.c || z?.r)) return '';
    const f = (t) => x(t || '').replace(/\{page\}/g, '<text:page-number text:select-page="current">1</text:page-number>').replace(/\{pages\}/g, '<text:page-count>1</text:page-count>').replace(/\{title\}/g, x(d.title)).replace(/\{date\}/g, x(new Date().toLocaleDateString(s.lang)));
    return `<text:p text:style-name="HeaderFooter">${f(z.l)}<text:tab/>${f(z.c)}<text:tab/>${f(z.r)}</text:p>`;
  };
  const hasH = !!(s.header?.l || s.header?.c || s.header?.r), hasF = !!(s.footer?.l || s.footer?.c || s.footer?.r);
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${NS}>${fontDecls}<office:styles><style:default-style style:family="paragraph"><style:paragraph-properties style:writing-mode="lr-tb"/><style:text-properties style:font-name="${x(s.font)}" fo:font-size="${fs}pt" fo:language="${x((s.lang || 'en').slice(0, 2))}"/></style:default-style>${named}${lists}<text:notes-configuration text:note-class="footnote" style:num-format="1" text:start-value="0" text:footnotes-position="page" text:start-numbering-at="document"/></office:styles><office:automatic-styles><style:page-layout style:name="PL"><style:page-layout-properties fo:page-width="${cm(pw)}" fo:page-height="${cm(ph)}" style:print-orientation="${s.landscape ? 'landscape' : 'portrait'}" fo:margin-top="${cm(hasH ? s.mt / 2 : s.mt)}" fo:margin-bottom="${cm(hasF ? s.mb / 2 : s.mb)}" fo:margin-left="${cm(s.ml)}" fo:margin-right="${cm(s.mr)}"${s.bg && s.bg !== '#ffffff' ? ` fo:background-color="${x(s.bg)}"` : ''}/><style:header-style><style:header-footer-properties fo:min-height="0cm" fo:margin-bottom="${cm(s.mt / 2 - 4)}"/></style:header-style><style:footer-style><style:header-footer-properties fo:min-height="0cm" fo:margin-top="${cm(s.mb / 2 - 4)}"/></style:footer-style></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="PL">${hasH ? `<style:header>${band(s.header)}</style:header>${s.firstPage ? '' : '<style:header-first/>'}` : ''}${hasF ? `<style:footer>${band(s.footer)}</style:footer>${s.firstPage ? '' : '<style:footer-first/>'}` : ''}</style:master-page></office:master-styles></office:document-styles>`;
  const metaXml = `<?xml version="1.0" encoding="UTF-8"?><office:document-meta ${NS}><office:meta><meta:generator>SavBooks</meta:generator><dc:title>${x(d.title)}</dc:title><dc:language>${x(s.lang || 'en')}</dc:language></office:meta></office:document-meta>`;
  const files = [...used].map((id) => [`Pictures/${id}.${pics[id].ext}`, pics[id]]);
  const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${ODT}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>${files.map(([path, p]) => `<manifest:file-entry manifest:full-path="${path}" manifest:media-type="${p.mime}"/>`).join('')}</manifest:manifest>`;
  return zip([['mimetype', ODT, { store: true }], ['content.xml', contentXml], ['styles.xml', stylesXml], ['meta.xml', metaXml], ['META-INF/manifest.xml', manifest], ...files.map(([path, p]) => [path, p.data, { store: true }])], ODT);
}

function hexOf(c) {
  if (!c) return '';
  let m = String(c).match(/^#([0-9a-f]{3})$/i);
  if (m) return '#' + [...m[1]].map((y) => y + y).join('');
  if ((m = String(c).match(/^#([0-9a-f]{6})/i))) return '#' + m[1];
  if ((m = String(c).match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/))) return '#' + m.slice(1, 4).map((y) => (+y).toString(16).padStart(2, '0')).join('');
  return '';
}
const sizeOf = (v) => (/px$/.test(v) ? (parseFloat(v) * 0.75).toFixed(1) + 'pt' : /pt$/.test(v) ? v : /em$/.test(v) ? Math.round(parseFloat(v) * 100) + '%' : v);

// ------------------------------------------------------------------ reading .odt

export async function fromOdt(buf) {
  const z = await unzip(buf);
  const xml = async (n) => (z.has(n) ? new DOMParser().parseFromString(text(await z.get(n)()), 'application/xml').documentElement : null);
  const content = await xml('content.xml'), styles = await xml('styles.xml'), meta = await xml('meta.xml');
  if (!content) throw new Error('file_invalid');
  const kids = (n) => [...(n?.children || [])];
  const att = (n, k) => n?.getAttribute(k) || '';
  // styles: what a style makes of the words (bold, italic…) and of paragraphs (heading, alignment), following the parents
  const S = {}, L = {};
  for (const root of [styles, content]) {
    for (const st of root?.getElementsByTagName('style:style') || []) {
      const tp = st.getElementsByTagName('style:text-properties')[0], pp = st.getElementsByTagName('style:paragraph-properties')[0];
      S[att(st, 'style:name')] = {
        parent: att(st, 'style:parent-style-name'), display: att(st, 'style:display-name') || att(st, 'style:name'), outline: +att(st, 'style:default-outline-level') || 0,
        b: tp && /bold|[6-9]00/.test(att(tp, 'fo:font-weight')), i: tp && att(tp, 'fo:font-style') === 'italic', u: tp && att(tp, 'style:text-underline-style') && att(tp, 'style:text-underline-style') !== 'none',
        s: tp && att(tp, 'style:text-line-through-style') && att(tp, 'style:text-line-through-style') !== 'none', pos: tp && att(tp, 'style:text-position'), color: tp && att(tp, 'fo:color'), bg: tp && att(tp, 'fo:background-color'),
        align: pp && att(pp, 'fo:text-align'), brk: pp && (att(pp, 'fo:break-before') === 'page'), brkAfter: pp && (att(pp, 'fo:break-after') === 'page'),
      };
    }
    for (const ls of root?.getElementsByTagName('text:list-style') || []) L[att(ls, 'style:name')] = !!kids(ls)[0] && kids(ls)[0].nodeName === 'text:list-level-style-number';
  }
  const up = (name, k) => { for (let n = name, i = 0; n && S[n] && i < 12; n = S[n].parent, i++) if (S[n][k]) return S[n][k]; return ''; };
  const named = (name) => { const out = []; for (let n = name, i = 0; n && S[n] && i < 12; n = S[n].parent, i++) out.push(S[n].display.replace(/_20_/g, ' ')); return out.join('|'); };
  // pictures
  const images = {}, made = {};
  const picture = async (href) => {
    if (!href || /^https?:/.test(href)) return '';
    const path = href.replace(/^\.\//, '');
    if (made[path] !== undefined) return made[path];
    const ext = path.split('.').pop().toLowerCase(), mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[ext];
    made[path] = '';
    if (!mime || !z.has(path)) return '';
    const id = hexId();
    images[id] = new Blob([await z.get(path)()], { type: mime });
    return (made[path] = id);
  };
  const figs = [];
  const inline = async (node) => {
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { out += esc(n.data); continue; }
      if (n.nodeType !== 1) continue;
      const nm = n.nodeName;
      if (nm === 'text:s') out += ' '.repeat(+att(n, 'text:c') || 1).replace(/ /g, '&nbsp;');
      else if (nm === 'text:tab') out += '&emsp;';
      else if (nm === 'text:line-break') out += '<br>';
      else if (nm === 'text:note') out += `<sup class="fn" data-n="${esc(n.getElementsByTagName('text:note-body')[0]?.textContent.trim() || '')}"></sup>`;
      else if (nm === 'text:a') out += `<a href="${esc(att(n, 'xlink:href'))}">${await inline(n)}</a>`;
      else if (nm === 'draw:frame') { const img = n.getElementsByTagName('draw:image')[0], id = img && (await picture(att(img, 'xlink:href'))); if (id) figs.push({ id, alt: n.getElementsByTagName('svg:desc')[0]?.textContent || att(n, 'draw:name') }); }
      else if (nm === 'text:span') {
        const st = att(n, 'text:style-name');
        let h = await inline(n);
        if (up(st, 'b')) h = `<strong>${h}</strong>`;
        if (up(st, 'i')) h = `<em>${h}</em>`;
        if (up(st, 'u')) h = `<u>${h}</u>`;
        if (up(st, 's')) h = `<s>${h}</s>`;
        const pos = up(st, 'pos');
        if (/^(super|[1-9])/.test(pos)) h = `<sup>${h}</sup>`; else if (/^(sub|-)/.test(pos)) h = `<sub>${h}</sub>`;
        const color = up(st, 'color'), bg = up(st, 'bg');
        if ((color && !/^#0{6}$/i.test(color)) || (bg && bg !== 'transparent')) h = `<span style="${color ? 'color:' + color + ';' : ''}${bg && bg !== 'transparent' ? 'background-color:' + bg : ''}">${h}</span>`;
        out += h;
      } else if (!/^(text:bookmark|text:soft-page-break|office:annotation|text:reference-mark|text:alphabetical-index-mark)/.test(nm)) out += await inline(n);
    }
    return out;
  };
  const flush = () => figs.splice(0).map((f) => `<figure data-a="c"><img data-i="${f.id}" alt="${esc(f.alt || '')}"></figure>`).join('');
  const alignOf = (st) => { const a = up(st, 'align'); return a === 'center' ? ' style="text-align:center"' : a === 'end' || a === 'right' ? ' style="text-align:right"' : a === 'justify' ? ' style="text-align:justify"' : ''; };
  const para = async (n) => {
    const st = att(n, 'text:style-name'), names = named(st), h = await inline(n), brk = up(st, 'brk') ? '<div class="pb"></div>' : '', after = up(st, 'brkAfter') ? '<div class="pb"></div>' : '';
    const txt0 = h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
    if (/Horizontal Line/i.test(names) && !txt0) return brk + '<hr>' + after;
    if (!txt0 && !figs.length && after) return brk + after;
    let tag = 'p', cls = '';
    const outline = n.nodeName === 'text:h' ? +att(n, 'text:outline-level') || 1 : up(st, 'outline');
    if (outline) tag = 'h' + Math.min(4, outline);
    else if (/(^|\|)Title/.test(names)) cls = ' class="title"';
    else if (/(^|\|)Subtitle/.test(names)) cls = ' class="subtitle"';
    else if (/Quotations|Quote/i.test(names)) tag = 'blockquote';
    else if (/Preformatted/i.test(names)) tag = 'pre';
    else if (/(^|\|)Lead/.test(names)) cls = ' class="lead"';
    else if (/(^|\|)Small/.test(names)) cls = ' class="small"';
    else if (/(^|\|)(Caption|Illustration|Figure caption)/i.test(names)) cls = ' class="caption"';
    const txt = txt0;
    if (/(^|\|)Callout/.test(names) && txt) return brk + `<div class="callout"><p>${h}</p></div>` + flush() + after;
    return brk + (txt || /<sup/.test(h) ? `<${tag}${cls}${alignOf(st)}>${h}</${tag}>` : figs.length ? '' : '<p><br></p>') + flush() + after;
  };
  const list = async (n, ordered) => {
    const o = ordered ?? L[att(n, 'text:style-name')] ?? false;
    let out = `<${o ? 'ol' : 'ul'}>`;
    for (const item of kids(n).filter((c) => c.nodeName === 'text:list-item' || c.nodeName === 'text:list-header')) {
      let h = '', sub = '';
      for (const c of kids(item)) {
        if (c.nodeName === 'text:list') sub += await list(c, L[att(c, 'text:style-name')] ?? o);
        else if (c.nodeName === 'text:p' || c.nodeName === 'text:h') h += (h ? '<br>' : '') + (await inline(c));
      }
      out += `<li>${h || '<br>'}${sub}</li>`;
    }
    return out + `</${o ? 'ol' : 'ul'}>` + flush();
  };
  const table = async (n) => {
    const rows = [...n.getElementsByTagName('table:table-row')].filter((r) => { let p = r.parentNode; while (p && p.nodeName !== 'table:table') p = p.parentNode; return p === n; });
    let out = '<table><tbody>';
    for (const r of rows) {
      out += '<tr>';
      for (const c of kids(r).filter((y) => y.nodeName === 'table:table-cell')) {
        const span = +att(c, 'table:number-columns-spanned') || 1;
        const parts = [];
        for (const y of kids(c)) if (y.nodeName === 'text:p' || y.nodeName === 'text:h') parts.push(await inline(y)); else if (y.nodeName === 'text:list') parts.push((await list(y)).replace(/<\/?(ul|ol)>/g, '').replace(/<li>/g, '• ').replace(/<\/li>/g, '<br>'));
        out += `<td${span > 1 ? ` colspan="${span}"` : ''}>${parts.join('<br>') || '<br>'}</td>`;
      }
      out += '</tr>';
    }
    return out + '</tbody></table>' + flush();
  };
  const walk = async (node) => {
    let out = '';
    for (const n of kids(node)) {
      const nm = n.nodeName;
      if (nm === 'text:p' || nm === 'text:h') out += await para(n);
      else if (nm === 'text:list') out += await list(n);
      else if (nm === 'table:table') out += await table(n);
      else if (nm === 'text:section' || nm === 'text:index-body') out += await walk(n);
      else if (nm === 'draw:frame') { await inline({ childNodes: [n] }); out += flush(); }
    }
    return out;
  };
  const officeText = content.getElementsByTagName('office:text')[0];
  if (!officeText) throw new Error('file_invalid');
  // captions go back into the figure they follow
  const html = (await walk(officeText)).replace(/<\/figure><p class="caption"[^>]*>([\s\S]*?)<\/p>/g, '<figcaption>$1</figcaption></figure>');
  // the page: size, orientation, margins
  const s = structuredClone(DEFAULTS);
  const mp = styles?.getElementsByTagName('style:master-page')[0], plName = att(mp, 'style:page-layout-name');
  const pl = [...(styles?.getElementsByTagName('style:page-layout') || [])].find((p) => att(p, 'style:name') === plName)?.getElementsByTagName('style:page-layout-properties')[0];
  const mm = (v) => { const n = parseFloat(v); return !v ? null : /cm$/.test(v) ? n * 10 : /mm$/.test(v) ? n : /in$/.test(v) ? n * 25.4 : /pt$/.test(v) ? n * 0.3528 : null; };
  if (pl) {
    let w = mm(att(pl, 'fo:page-width')), h = mm(att(pl, 'fo:page-height'));
    if (w && h) {
      s.landscape = w > h;
      const [a, c] = s.landscape ? [h, w] : [w, h], size = Object.entries(SIZES).find(([, [sw, sh]]) => Math.abs(sw - a) < 2 && Math.abs(sh - c) < 2);
      if (size) s.size = size[0]; else { s.size = 'custom'; s.w = Math.round(w); s.h = Math.round(h); s.landscape = false; }
    }
    // a header or a footer stands inside the margin of the page: the text begins after it
    const lay = pl.parentNode, band = (tag) => { const hp = lay.getElementsByTagName(tag)[0]?.getElementsByTagName('style:header-footer-properties')[0]; return hp ? (mm(att(hp, 'fo:min-height')) || 0) + (mm(att(hp, tag === 'style:header-style' ? 'fo:margin-bottom' : 'fo:margin-top')) || 0) + 4 : 0; };
    const hasH = !!mp?.getElementsByTagName('style:header')[0], hasF = !!mp?.getElementsByTagName('style:footer')[0];
    for (const [k, a] of [['mt', 'fo:margin-top'], ['mb', 'fo:margin-bottom'], ['ml', 'fo:margin-left'], ['mr', 'fo:margin-right']]) { let v = mm(att(pl, a)); if (v === null) continue; if (k === 'mt' && hasH) v += band('style:header-style'); if (k === 'mb' && hasF) v += band('style:footer-style'); s[k] = Math.max(0, Math.min(100, Math.round(v * 2) / 2)); }
    // the texts of header and footer, three parts split by tabs; page number and count become fields
    const bandText = (tag) => { const p = mp?.getElementsByTagName(tag)[0]?.getElementsByTagName('text:p')[0]; if (!p) return null; let t = ''; for (const n of p.childNodes) t += n.nodeName === 'text:tab' ? '\t' : n.nodeName === 'text:page-number' ? '{page}' : n.nodeName === 'text:page-count' ? '{pages}' : n.nodeName === 'text:title' ? '{title}' : n.textContent; const [l = '', c = '', r = ''] = t.split('\t').map((y) => y.trim()); return { l, c, r }; };
    s.header = bandText('style:header') || s.header;
    s.footer = bandText('style:footer') || s.footer;
  }
  const title = meta?.getElementsByTagName('dc:title')[0]?.textContent.trim() || '';
  const blocks = cleanBlocks(html).map((h) => ({ id: newId(), h }));
  return { title, settings: s, blocks, images };
}

// ------------------------------------------------------------------ writing .doc (a web page in one file, as Word reads it)

export async function toDoc(d) {
  const s = { ...DEFAULTS, ...d.settings }, [pw, ph] = pageMM(s), textW = pw - s.ml - s.mr;
  const { blocks, pics } = await prepare(d);
  let html = standalone({ settings: s, blocks: blocks.map((b) => ({ ...b, h: b.h.replace(/<sup data-note="([^"]*)"><\/sup>/g, '<sup class="fn" data-n="$1"></sup>') })) }, (id) => 'pic:' + id);
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body, parts = [];
  for (const img of body.querySelectorAll('img')) {
    const id = (img.getAttribute('src') || '').replace(/^pic:/, ''), p = pics[id];
    if (!p) { img.remove(); continue; }
    const fig = img.closest('figure'), pct = +(fig?.getAttribute('data-w') || 0), wpx = Math.round(Math.min(textW, pct ? (textW * pct) / 100 : p.w * 0.2646) / 0.2646);
    const name = `image${parts.length + 1}.${p.ext}`;
    parts.push({ name, mime: p.mime, data: p.data });
    img.setAttribute('src', 'doc_files/' + name);
    img.setAttribute('width', wpx);
    img.setAttribute('height', Math.round((wpx * p.h) / p.w));
  }
  for (const pb of body.querySelectorAll('div.pb')) pb.outerHTML = '<br clear="all" style="page-break-before:always">';
  for (const f of body.querySelectorAll('figure')) f.setAttribute('style', `text-align:${{ l: 'left', r: 'right' }[f.getAttribute('data-a')] || 'center'};margin:0 0 8pt`);
  const ink = hexOf(s.color) || '#1c1c1c', head = hexOf(s.headColor) || ink, fs = s.fontSize || 11;
  const page = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>${x(d.title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>@page Section1 { size: ${cm(pw)} ${cm(ph)};${s.landscape ? ' mso-page-orientation: landscape;' : ''} margin: ${cm(s.mt)} ${cm(s.mr)} ${cm(s.mb)} ${cm(s.ml)}; }
div.Section1 { page: Section1; } body { font-family: '${x(s.font)}', sans-serif; font-size: ${fs}pt; color: ${ink}; line-height: ${s.line || 1.5}; }
p { margin: 0 0 ${s.gap ?? 6}pt; } h1, h2, h3, h4 { font-family: '${x(s.headFont || s.font)}', sans-serif; color: ${head}; } h1 { font-size: ${(fs * 1.9).toFixed(1)}pt; } h2 { font-size: ${(fs * 1.5).toFixed(1)}pt; } h3 { font-size: ${(fs * 1.25).toFixed(1)}pt; } h4 { font-size: ${(fs * 1.1).toFixed(1)}pt; }
p.title { font-size: ${(fs * 2.6).toFixed(1)}pt; font-weight: bold; color: ${head}; } p.subtitle { font-size: ${(fs * 1.35).toFixed(1)}pt; color: ${hexOf(s.accent) || '#8a2346'}; }
table { border-collapse: collapse; width: 100%; } td, th { border: 0.5pt solid #b9c4bd; padding: 4pt 6pt; vertical-align: top; } blockquote { margin-left: 24pt; font-style: italic; }
figcaption { font-size: ${(fs * 0.85).toFixed(1)}pt; font-style: italic; text-align: center; } .callout { background: #eef4f8; padding: 6pt 8pt; border-left: 3pt solid ${hexOf(s.accent) || '#8a2346'}; }</style></head>
<body lang="${x(s.lang || 'en')}"><div class="Section1">${body.innerHTML}</div></body></html>`;
  // MHTML: the page and its pictures in one file (Word opens it as a .doc)
  const B = '----=_NextPart_SavBooks', b64 = (u8) => { let s2 = ''; for (let i = 0; i < u8.length; i += 32768) s2 += String.fromCharCode(...u8.subarray(i, i + 32768)); return btoa(s2).replace(/.{76}/g, '$&\r\n'); };
  const enc = new TextEncoder();
  const out = [`MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="${B}"; type="text/html"\r\n\r\nThis is a Word document written by SavBooks.\r\n\r\n`,
    `--${B}\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\nContent-Location: file:///C:/doc.htm\r\n\r\n${b64(enc.encode(page))}\r\n\r\n`,
    ...parts.map((p) => `--${B}\r\nContent-Type: ${p.mime}\r\nContent-Transfer-Encoding: base64\r\nContent-Location: file:///C:/doc_files/${p.name}\r\n\r\n${b64(p.data)}\r\n\r\n`),
    `--${B}--\r\n`];
  return new Blob(out, { type: 'application/msword' });
}

// ------------------------------------------------------------------ reading .doc

/** What a .doc may be: Word 97-2003 (binary), a web page, MHTML, RTF, or a .docx with the wrong name. */
export async function fromDoc(buf) {
  const b = new Uint8Array(buf), head = new TextDecoder('latin1').decode(b.subarray(0, 600));
  if (b[0] === 0xd0 && b[1] === 0xcf) return word97(b);
  if (b[0] === 0x50 && b[1] === 0x4b) return (await import('./docx.js')).fromDocx(buf);
  if (/^\s*\{\\rtf/.test(head)) return pack(rtfParas(new TextDecoder('latin1').decode(b)).map((p) => `<p>${esc(p) || '<br>'}</p>`).join(''));
  if (/MIME-Version:|Content-Type:\s*multipart/i.test(head)) return mhtml(new TextDecoder('latin1').decode(b));
  const t = new TextDecoder().decode(b);
  if (/<html|<body|<p[\s>]/i.test(t)) return pack(t);
  throw new Error('file_invalid');
}
// Word marks a page break in a web page as a line break with page-break-before
const pack = (html, images = {}, title = '') => ({ title, settings: structuredClone(DEFAULTS), blocks: cleanBlocks(html.replace(/<br[^>]*page-break-before:\s*always[^>]*>/gi, '<div class="pb"></div>')).map((h) => ({ id: newId(), h })), images });

/** Word 97-2003: the text of the main document from the pieces of the piece table, its paragraphs and tables. */
function word97(b) {
  const f = cfb(b), wd = f.stream('WordDocument');
  if (!wd || wd.length < 0x200) throw new Error('file_invalid');
  const v = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);
  if (v.getUint16(0, true) !== 0xa5ec) throw new Error('file_invalid');
  if (v.getUint16(0x0a, true) & 0x0100) throw new Error('file_encrypted');
  const table = f.stream(v.getUint16(0x0a, true) & 0x0200 ? '1Table' : '0Table');
  const ccpText = v.getInt32(0x4c, true), fcClx = v.getUint32(0x1a2, true), lcbClx = v.getUint32(0x1a6, true);
  let txt = '';
  if (table && lcbClx) {
    const t = new DataView(table.buffer, table.byteOffset, table.byteLength);
    let p = fcClx;
    while (table[p] === 1) p += 3 + t.getUint16(p + 1, true); // Prc: formatting, skipped
    if (table[p] === 2) {
      const lcb = t.getUint32(p + 1, true), n = (lcb - 4) / 12, base = p + 5;
      for (let i = 0; i < n && txt.length < ccpText; i++) {
        const cp0 = t.getUint32(base + i * 4, true), cp1 = t.getUint32(base + (i + 1) * 4, true), fcRaw = t.getUint32(base + (n + 1) * 4 + i * 8 + 2, true);
        const len = Math.min(cp1 - cp0, ccpText - txt.length), comp = fcRaw & 0x40000000, fc = comp ? (fcRaw & 0x3fffffff) / 2 : fcRaw;
        if (comp) txt += cp1252(wd.subarray(fc, fc + len));
        else txt += new TextDecoder('utf-16le').decode(wd.subarray(fc, fc + len * 2));
      }
    }
  }
  if (!txt) { const fcMin = v.getUint32(0x18, true); txt = cp1252(wd.subarray(fcMin, fcMin + ccpText)); } // old files without a piece table
  // fields: the code (between 0x13 and 0x14) goes, the result stays
  txt = txt.replace(/\x13[^\x13\x14\x15]*\x14/g, '').replace(/\x13[^\x13\x15]*\x15/g, '').replace(/[\x14\x15]/g, '');
  // a cell ends with 0x07; the end of a row is one more 0x07 alone; a cell may hold several paragraphs (ending with \r)
  const out = [], clean = (r) => esc(r.replace(/[\r\x07]$/, '').replace(/\x0b/g, '\n').replace(/[\x00-\x08\x0c\x0e-\x1f]/g, '')).replace(/\n/g, '<br>');
  let rows = [], row = [], pend = [], prevCell = false;
  const endTable = () => { if (row.length) rows.push(row); row = []; if (rows.length) out.push('<table><tbody>' + rows.map((r) => '<tr>' + r.map((c) => `<td>${c || '<br>'}</td>`).join('') + '</tr>').join('') + '</tbody></table>'); rows = []; };
  const flushPend = () => { for (const r of pend) { if (/\x0c/.test(r)) out.push('<div class="pb"></div>'); const h = clean(r); if (h.trim()) out.push(`<p>${h}</p>`); } pend = []; };
  for (const raw of txt.split(/(?<=[\r\x07])/)) {
    if (!raw) continue;
    if (raw.endsWith('\x07')) {
      const h = clean(raw);
      if (!h && prevCell && row.length && !pend.length) { rows.push(row); row = []; prevCell = false; continue; } // the end of a row
      if (pend.length && (row.length || rows.length)) { row.push([...pend.map(clean), h].filter(Boolean).join('<br>')); pend = []; }
      else { if (pend.length) { endTable(); flushPend(); } row.push(h); }
      prevCell = true;
      continue;
    }
    if (prevCell === false && !row.length && rows.length) endTable();
    pend.push(raw);
    prevCell = false;
    // a paragraph after a finished row that is not followed by a cell closes the table
    if (!row.length && rows.length && pend.length > 1) { endTable(); flushPend(); }
  }
  if (pend.length && (row.length || rows.length)) { endTable(); }
  flushPend();
  endTable();
  const html = out.join('');
  return pack(html);
}
const WIN = '€\x81‚ƒ„…†‡ˆ‰Š‹Œ\x8dŽ\x8f\x90‘’“”•–—˜™š›œ\x9džŸ';
const cp1252 = (u8) => { let s = ''; for (const c of u8) s += c >= 0x80 && c < 0xa0 ? WIN[c - 0x80] : String.fromCharCode(c); return s; };

/** RTF: the text of its paragraphs (the formatting is not kept). */
function rtfParas(rtf) {
  let out = '', depth = 0;
  const skip = [];
  for (let i = 0; i < rtf.length; i++) {
    const c = rtf[i];
    if (c === '{') { depth++; const m = rtf.slice(i + 1, i + 40).match(/^\\\*|^\\(fonttbl|colortbl|stylesheet|info|pict|object|header|footer|listtable|listoverridetable|rsidtbl|themedata|colorschememapping|datastore|latentstyles|generator)\b/); if (m && !skip.length) skip.push(depth); continue; }
    if (c === '}') { if (skip.at(-1) === depth) skip.pop(); depth--; continue; }
    if (skip.length) continue;
    if (c === '\\') {
      const m = rtf.slice(i + 1).match(/^([a-z]+)(-?\d+)? ?|^'([0-9a-f]{2})|^(.)/i);
      if (!m) continue;
      i += m[0].length;
      if (m[3]) out += cp1252([parseInt(m[3], 16)]);
      else if (m[4]) out += m[4] === '~' ? ' ' : /[\\{}]/.test(m[4]) ? m[4] : '';
      else if (m[1] === 'par' || m[1] === 'line') out += '\n';
      else if (m[1] === 'tab') out += '\t';
      else if (m[1] === 'u' && m[2]) { out += String.fromCharCode((+m[2] + 65536) % 65536); if (rtf[i + 1] === '?') i++; }
      continue;
    }
    if (c !== '\r' && c !== '\n') out += c;
  }
  return out.split('\n').map((l) => l.trim());
}

/** MHTML (a web page in one file): its page and its pictures. */
function mhtml(t) {
  const bnd = (t.match(/boundary="?([^";\r\n]+)"?/i) || [])[1];
  if (!bnd) throw new Error('file_invalid');
  const parts = t.split('--' + bnd).slice(1, -1).map((p) => { const i = p.search(/\r?\n\r?\n/), head = p.slice(0, i), body = p.slice(i).trim(); return { type: (head.match(/Content-Type:\s*([^;\s]+)/i) || [])[1] || '', enc: (head.match(/Content-Transfer-Encoding:\s*(\S+)/i) || [])[1] || '', loc: (head.match(/Content-Location:\s*(\S+)/i) || [])[1] || '', body }; });
  const bytes = (p) => (/base64/i.test(p.enc) ? Uint8Array.from(atob(p.body.replace(/\s+/g, '')), (c) => c.charCodeAt(0)) : /quoted/i.test(p.enc) ? Uint8Array.from(p.body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))), (c) => c.charCodeAt(0)) : Uint8Array.from(p.body, (c) => c.charCodeAt(0)));
  const page = parts.find((p) => /html/i.test(p.type));
  if (!page) throw new Error('file_invalid');
  let html = new TextDecoder().decode(bytes(page));
  const images = {};
  for (const p of parts.filter((q) => /^image\//i.test(q.type) && q.loc)) {
    const id = hexId(), name = p.loc.split('/').pop();
    images[id] = new Blob([bytes(p)], { type: p.type });
    html = html.replace(new RegExp(`<img([^>]*?)src="[^"]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'gi'), `<figure><img$1data-i="${id}"`).replace(new RegExp(`(<img[^>]*data-i="${id}"[^>]*>)`, 'i'), '$1</figure>');
  }
  const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
  return pack(html, images, unesc(title));
}
