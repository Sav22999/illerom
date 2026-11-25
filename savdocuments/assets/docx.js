/** Word files (.docx): writing and reading, without libraries. */
import { zip, unzip, text } from './zip.js';
import { cleanBlocks, newId, esc } from './clean.js';
import { DEFAULTS, FONTS, SIZES, pageMM, MM } from './settings.js';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const tw = (mm) => Math.round((mm / 25.4) * 1440);
const half = (pt) => Math.round(pt * 2);
const pt = (v) => { const n = parseFloat(v); return /px$/.test(v) ? n * 0.75 : n; };
const hex = (c) => {
  if (!c) return '';
  let m = c.match(/^#([0-9a-f]{3})$/i);
  if (m) return [...m[1]].map((x) => x + x).join('').toUpperCase();
  if ((m = c.match(/^#([0-9a-f]{6})/i))) return m[1].toUpperCase();
  if ((m = c.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/))) return m.slice(1, 4).map((x) => (+x).toString(16).padStart(2, '0')).join('').toUpperCase();
  return '';
};

// ------------------------------------------------------------------ writing

/** Pictures as Word can show them: PNG or JPEG, with their size in px. */
async function picture(blob) {
  const bmp = await createImageBitmap(blob);
  let out = blob;
  if (!/image\/(png|jpeg)/.test(blob.type)) {
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    c.getContext('2d').drawImage(bmp, 0, 0);
    out = await c.convertToBlob({ type: 'image/png' });
  }
  return { w: bmp.width, h: bmp.height, ext: out.type === 'image/png' ? 'png' : 'jpeg', data: new Uint8Array(await out.arrayBuffer()) };
}

export async function toDocx({ title, settings: s, blocks, images }) {
  const [pw, ph] = pageMM(s), width = (pw - s.ml - s.mr) * MM, height = (ph - s.mt - s.mb) * MM;
  const pics = {}, media = [], rels = [], nums = [], notes = [];
  for (const [id, b] of Object.entries(images)) {
    try {
      const p = await picture(b), name = `image${media.length + 1}.${p.ext}`;
      media.push([`word/media/${name}`, p.data, { store: true }]);
      rels.push(`<Relationship Id="rImg${media.length}" Type="${REL}/image" Target="media/${name}"/>`);
      pics[id] = { ...p, rid: `rImg${media.length}` };
    } catch { /* a picture that cannot be read is left out */ }
  }
  let uid = 10;
  const link = (url) => { rels.push(`<Relationship Id="rLnk${rels.length}" Type="${REL}/hyperlink" Target="${esc(url)}" TargetMode="External"/>`); return `rLnk${rels.length - 1}`; };
  const num = (kind, start = 1) => { nums.push({ kind, start }); return nums.length + 10; };

  const runProps = (f) => {
    let x = '';
    if (f.style) x += `<w:rStyle w:val="${f.style}"/>`;
    if (f.font) x += `<w:rFonts w:ascii="${esc(f.font)}" w:hAnsi="${esc(f.font)}" w:cs="${esc(f.font)}"/>`;
    if (f.b) x += '<w:b/>';
    if (f.i) x += '<w:i/>';
    if (f.s) x += '<w:strike/>';
    if (f.color) x += `<w:color w:val="${f.color}"/>`;
    if (f.size) x += `<w:sz w:val="${half(f.size)}"/><w:szCs w:val="${half(f.size)}"/>`;
    if (f.u) x += '<w:u w:val="single"/>';
    if (f.bg) x += `<w:shd w:val="clear" w:color="auto" w:fill="${f.bg}"/>`;
    if (f.va) x += `<w:vertAlign w:val="${f.va}"/>`;
    return x ? `<w:rPr>${x}</w:rPr>` : '';
  };
  const run = (t, f) => {
    if (!t) return '';
    const inner = t.split(/(\t|\n)/).map((p) => (p === '\t' ? '<w:tab/>' : p === '\n' ? '<w:br/>' : p ? `<w:t xml:space="preserve">${esc(p)}</w:t>` : '')).join('');
    return `<w:r>${runProps(f)}${inner}</w:r>`;
  };
  const drawing = (img, frac, wrap) => {
    const p = pics[img.dataset.i];
    if (!p) return '';
    let w = Math.max(24, width * frac), h = (w * p.h) / p.w;
    if (h > height * 0.95) { w *= (height * 0.95) / h; h = height * 0.95; }
    const cx = Math.round(w * 9525), cy = Math.round(h * 9525), id = uid++, alt = esc(img.getAttribute('alt') || '');
    const g = `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="Image ${id}" descr="${alt}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${p.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>`;
    if (wrap) return `<w:r><w:drawing><wp:anchor distT="45720" distB="45720" distL="${wrap === 'r' ? 182880 : 0}" distR="${wrap === 'r' ? 0 : 182880}" simplePos="0" relativeHeight="${id}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="0"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:align>${wrap === 'r' ? 'right' : 'left'}</wp:align></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:wrapSquare wrapText="bothSides"/><wp:docPr id="${id}" name="Image ${id}" descr="${alt}"/>${g}</wp:anchor></w:drawing></w:r>`;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Image ${id}" descr="${alt}"/>${g}</wp:inline></w:drawing></w:r>`;
  };
  const inline = (node, f) => {
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { out += run(n.nodeValue, f); continue; }
      if (n.nodeType !== 1 || /^(ul|ol|figure)$/.test(n.localName)) continue;
      const st = n.style, g = { ...f };
      if (st.color) g.color = hex(st.color);
      if (st.backgroundColor) g.bg = hex(st.backgroundColor);
      if (st.fontSize) g.size = pt(st.fontSize);
      if (st.fontFamily) g.font = st.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
      switch (n.localName) {
        case 'br': out += '<w:r><w:br/></w:r>'; break;
        case 'strong': out += inline(n, { ...g, b: 1 }); break;
        case 'em': out += inline(n, { ...g, i: 1 }); break;
        case 'u': out += inline(n, { ...g, u: 1 }); break;
        case 's': out += inline(n, { ...g, s: 1 }); break;
        case 'sub': out += inline(n, { ...g, va: 'subscript' }); break;
        case 'sup':
          if (n.matches('.fn')) { notes.push(n.dataset.n || ''); out += `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${notes.length}"/></w:r>`; } else out += inline(n, { ...g, va: 'superscript' });
          break;
        case 'code': out += inline(n, { ...g, font: 'Courier New', bg: 'F0F1EE' }); break;
        case 'a': {
          const h = n.getAttribute('href') || '', body = inline(n, { ...g, style: 'Hyperlink' });
          out += h.startsWith('#b-') ? `<w:hyperlink w:anchor="${esc(h.slice(1))}">${body}</w:hyperlink>` : `<w:hyperlink r:id="${link(h)}">${body}</w:hyperlink>`;
          break;
        }
        case 'img': out += drawing(n, 1); break;
        default: out += inline(n, g);
      }
    }
    return out;
  };
  const para = (node, style, extra = '', pre = '', post = '') => {
    const st = node.style || {}, jc = { left: 'left', center: 'center', right: 'right', justify: 'both', start: 'left', end: 'right' }[st.textAlign];
    let p = style ? `<w:pStyle w:val="${style}"/>` : '';
    p += extra.includes('<w:keepNext') ? extra.match(/<w:keepNext\/>/)[0] : '';
    p += extra.match(/<w:numPr>.*<\/w:numPr>/)?.[0] || '';
    p += extra.match(/<w:pBdr>.*<\/w:pBdr>/)?.[0] || '';
    p += extra.match(/<w:shd [^>]*>/)?.[0] || '';
    const lh = parseFloat(st.lineHeight), mt = st.marginTop ? pt(st.marginTop) : null, mb = st.marginBottom ? pt(st.marginBottom) : null;
    if (lh || mt !== null || mb !== null) p += `<w:spacing${mt !== null ? ` w:before="${Math.round(mt * 20)}"` : ''}${mb !== null ? ` w:after="${Math.round(mb * 20)}"` : ''}${lh ? ` w:line="${Math.round(lh * 240)}" w:lineRule="auto"` : ''}/>`;
    const ml = st.marginLeft ? Math.round(pt(st.marginLeft) * 20) : 0, ti = st.textIndent ? Math.round(pt(st.textIndent) * 20) : 0;
    if (ml || ti) p += `<w:ind${ml ? ` w:left="${ml}"` : ''}${ti ? ` w:firstLine="${ti}"` : ''}/>`;
    if (jc) p += `<w:jc w:val="${jc}"/>`;
    const pp = p ? `<w:pPr>${p}</w:pPr>` : '';
    return `<w:p>${pp}${pre}${inline(node, {})}${post}</w:p>`;
  };
  const list = (l, level = 0, up = null) => {
    const kind = l.matches('.check') ? 'check' : l.localName === 'ol' ? 'ol' : 'ul';
    const id = up && up.kind === kind && kind !== 'ol' ? up.id : num(kind, parseInt(l.getAttribute('start'), 10) || 1);
    let out = '';
    for (const li of l.children) {
      const box = kind === 'check' ? `<w:r><w:t xml:space="preserve">${li.dataset.c === '1' ? '☒' : '☐'} </w:t></w:r>` : '';
      out += para(li, 'ListParagraph', `<w:numPr><w:ilvl w:val="${Math.min(level, 8)}"/><w:numId w:val="${id}"/></w:numPr>`, box);
      for (const sub of li.children) if (/^[uo]l$/.test(sub.localName)) out += list(sub, level + 1, { kind, id });
    }
    return out;
  };
  const cellBody = (c, th) => {
    let out = '', buf = document.createElement('p');
    if (c.style.textAlign) buf.style.textAlign = c.style.textAlign;
    const wrap = (n) => { if (!th) return n; const b = document.createElement('strong'); b.append(...n.childNodes); n.append(b); return n; };
    const flush = () => { if (buf.childNodes.length) out += para(wrap(buf), 'TableText'); const n = buf.cloneNode(false); buf = n; };
    for (const n of [...c.childNodes]) {
      if (n.nodeType === 1 && /^[uo]l$/.test(n.localName)) { flush(); out += list(n); } else if (n.nodeType === 1 && n.localName === 'p') { flush(); out += para(wrap(n.cloneNode(true)), 'TableText'); } else buf.append(n.cloneNode(true));
    }
    flush();
    return out || '<w:p><w:pPr><w:pStyle w:val="TableText"/></w:pPr></w:p>';
  };
  const table = (t) => {
    const rows = [...t.querySelectorAll('tr')], grid = [];
    let n = 0;
    rows.forEach((tr, y) => { grid[y] ||= []; let x = 0; for (const c of tr.children) { while (grid[y][x]) x++; for (let i = 0; i < c.rowSpan; i++) for (let j = 0; j < c.colSpan; j++) (grid[y + i] ||= [])[x + j] = { c, first: !i, x0: !j }; x += c.colSpan; } n = Math.max(n, grid[y].length); });
    const cols = [...t.querySelectorAll('colgroup > col')].map((c) => parseFloat(c.style.width)), W = Math.round(width / MM / 25.4 * 1440);
    const cw = Array.from({ length: n }, (_, i) => Math.round(W * (cols.length === n && cols[i] ? cols[i] / 100 : 1 / n)));
    const plain = t.matches('.plain'), b = (k, on = true) => `<w:${k} w:val="${on ? 'single' : 'nil'}" w:sz="4" w:space="0" w:color="B9BFBA"/>`;
    let out = `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders>${b('top')}${b('left', !plain)}${b('bottom')}${b('right', !plain)}${b('insideH')}${b('insideV', !plain)}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${cw.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
    grid.slice(0, rows.length).forEach((r, y) => {
      const head = y === 0 && r.length && r.every((q) => q && q.c.localName === 'th');
      out += `<w:tr><w:trPr><w:cantSplit/>${head ? '<w:tblHeader/>' : ''}</w:trPr>`;
      for (let x = 0; x < n; x++) {
        const q = r[x];
        if (!q) { out += `<w:tc><w:tcPr><w:tcW w:w="${cw[x]}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`; continue; }
        if (!q.x0) continue;
        const c = q.c, th = c.localName === 'th', fill = hex(c.style.backgroundColor) || (th ? 'EEF1EE' : t.matches('.striped') && y % 2 ? 'F6F8F6' : '');
        const w = cw.slice(x, x + c.colSpan).reduce((a, v) => a + v, 0);
        out += `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${c.colSpan > 1 ? `<w:gridSpan w:val="${c.colSpan}"/>` : ''}${c.rowSpan > 1 ? `<w:vMerge${q.first ? ' w:val="restart"' : ''}/>` : ''}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}${c.style.verticalAlign ? `<w:vAlign w:val="${{ middle: 'center' }[c.style.verticalAlign] || c.style.verticalAlign}"/>` : ''}</w:tcPr>${q.first ? cellBody(c, th) : '<w:p/>'}</w:tc>`;
      }
      out += '</w:tr>';
    });
    return out + '</w:tbl><w:p><w:pPr><w:pStyle w:val="TableText"/><w:spacing w:after="60" w:line="120" w:lineRule="auto"/></w:pPr></w:p>';
  };
  const figure = (f) => {
    const img = f.querySelector('img'), cap = f.querySelector('figcaption'), jc = { l: 'left', r: 'right' }[f.dataset.a] || 'center';
    let out = img ? `<w:p><w:pPr>${cap?.textContent ? '<w:keepNext/>' : ''}<w:jc w:val="${jc}"/></w:pPr>${drawing(img, (+f.dataset.w || 100) / 100)}</w:p>` : '';
    if (cap?.textContent) { cap.style.textAlign = jc; out += para(cap, 'Caption'); }
    return out;
  };
  const CALL = { info: ['EEF4FB', '3B7DBF'], tip: ['E9F5EF', '0F6E56'], warn: ['FDF1EA', 'D85A30'] };
  const bdr = (color) => `<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="${color}"/></w:pBdr>`;
  const one = (n, id) => {
    const mark = (xml) => xml.replace(/<w:p>(<w:pPr>.*?<\/w:pPr>)?/, (m) => `${m}<w:bookmarkStart w:id="${uid}" w:name="b-${id}"/><w:bookmarkEnd w:id="${uid++}"/>`);
    switch (n.localName) {
      case 'h1': case 'h2': case 'h3': case 'h4': return mark(para(n, 'Heading' + n.localName[1]));
      case 'ul': case 'ol': return list(n);
      case 'blockquote': return para(n, 'Quote');
      case 'pre': return para(n, 'Code');
      case 'hr': return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="B9BFBA"/></w:pBdr></w:pPr></w:p>';
      case 'table': return table(n);
      case 'figure': return figure(n);
      case 'div':
        if (n.matches('.pb')) return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
        if (n.matches('.toc')) return `<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/></w:docPartObj></w:sdtPr><w:sdtContent><w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>…</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:sdtContent></w:sdt>`;
        if (n.matches('.callout')) { const [bg, c] = CALL[n.dataset.k] || CALL.info; return [...n.children].map((p) => para(p, '', `${bdr(c)}<w:shd w:val="clear" w:color="auto" w:fill="${bg}"/>`)).join(''); }
        if (n.matches('.beside')) {
          const f = n.querySelector('figure'), img = f?.querySelector('img'), ps = [...n.children].filter((x) => x.localName === 'p'), side = n.dataset.k === 'r' ? 'r' : 'l';
          return ps.map((p, i) => para(p, '', '', i || !img ? '' : drawing(img, Math.min(0.7, (+f.dataset.w || 40) / 100), side))).join('');
        }
        return [...n.children].map((p) => one(p, id)).join('');
      default: {
        const style = n.matches('.title') ? 'Title' : n.matches('.subtitle') ? 'Subtitle' : n.matches('.lead') ? 'Lead' : n.matches('.small') ? 'Small' : '';
        return para(n, style);
      }
    }
  };
  const doc = new DOMParser();
  const body = blocks.map((b) => { const n = doc.parseFromString(b.h, 'text/html').body.firstElementChild; return n ? one(n, b.id) : ''; }).join('');

  const field = (code) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${code} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  const bandText = (t) => t.split(/(\{page\}|\{pages\}|\{title\}|\{date\})/).map((x) => (x === '{page}' ? field('PAGE') : x === '{pages}' ? field('NUMPAGES') : x === '{title}' ? run(title, {}) : x === '{date}' ? field('DATE') : run(x, {}))).join('');
  const W = tw(pw - s.ml - s.mr);
  const band = (tag, z) => `${HEAD}<w:${tag} ${NS}><w:p><w:pPr><w:pStyle w:val="Band"/><w:tabs><w:tab w:val="center" w:pos="${Math.round(W / 2)}"/><w:tab w:val="right" w:pos="${W}"/></w:tabs></w:pPr>${bandText(z.l)}<w:r><w:tab/></w:r>${bandText(z.c)}<w:r><w:tab/></w:r>${bandText(z.r)}</w:p></w:${tag}>`;
  const has = (z) => z.l || z.c || z.r;
  const extra = [], refs = [], types = [];
  for (const [kind, tag] of [['header', 'hdr'], ['footer', 'ftr']]) {
    if (!has(s[kind])) continue;
    extra.push([`word/${kind}1.xml`, band(tag, s[kind])]);
    rels.push(`<Relationship Id="r${kind}" Type="${REL}/${kind}" Target="${kind}1.xml"/>`);
    refs.push(`<w:${kind}Reference w:type="default" r:id="r${kind}"/>`);
    types.push(`<Override PartName="/word/${kind}1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml"/>`);
    if (!s.firstPage) {
      extra.push([`word/${kind}2.xml`, `${HEAD}<w:${tag} ${NS}><w:p/></w:${tag}>`]);
      rels.push(`<Relationship Id="r${kind}2" Type="${REL}/${kind}" Target="${kind}2.xml"/>`);
      refs.push(`<w:${kind}Reference w:type="first" r:id="r${kind}2"/>`);
      types.push(`<Override PartName="/word/${kind}2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml"/>`);
    }
  }
  const sect = `<w:sectPr>${refs.join('')}<w:pgSz w:w="${tw(pw)}" w:h="${tw(ph)}"${pw > ph ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${tw(s.mt)}" w:right="${tw(s.mr)}" w:bottom="${tw(s.mb)}" w:left="${tw(s.ml)}" w:header="${tw(s.mt / 2)}" w:footer="${tw(s.mb / 2)}" w:gutter="0"/>${s.firstPage ? '' : '<w:titlePg/>'}</w:sectPr>`;

  const ps = (id, name, ppr, rpr, more = '') => `<w:style w:type="paragraph"${/^(Band|Code|Lead|Small|TableText)$/.test(id) ? ' w:customStyle="1"' : ''} w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/>${more}<w:qFormat/><w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;
  const hf = `<w:rFonts w:ascii="${s.headFont}" w:hAnsi="${s.headFont}" w:cs="${s.headFont}"/>`, hc = `<w:color w:val="${hex(s.headColor)}"/>`, sz = (k) => `<w:sz w:val="${half(s.fontSize * k)}"/><w:szCs w:val="${half(s.fontSize * k)}"/>`;
  const hd = (i, k, before) => ps('Heading' + i, 'heading ' + i, `<w:keepNext/>${s.numbered && i < 4 ? `<w:numPr>${i > 1 ? `<w:ilvl w:val="${i - 1}"/>` : ''}<w:numId w:val="1"/></w:numPr>` : ''}<w:spacing w:before="${Math.round(before * 20)}" w:after="${Math.round(s.fontSize * 0.4 * 20)}" w:line="288" w:lineRule="auto"/><w:jc w:val="left"/><w:outlineLvl w:val="${i - 1}"/>`, `${hf}<w:b/>${hc}${sz(k)}`, '<w:next w:val="Normal"/>');
  const styles = `${HEAD}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${s.font}" w:hAnsi="${s.font}" w:cs="${s.font}" w:eastAsia="${s.font}"/><w:color w:val="${hex(s.color)}"/>${sz(1)}<w:lang w:val="${{ en: 'en-GB', it: 'it-IT', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' }[s.lang] || s.lang}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="${Math.round(s.gap * 20)}" w:line="${Math.round(s.line * 240 / 1.18)}" w:lineRule="auto"/>${s.justify ? '<w:jc w:val="both"/>' : ''}</w:pPr></w:pPrDefault></w:docDefaults>`
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/></w:style><w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/></w:style>'
    + ps('Title', 'Title', `<w:spacing w:after="${Math.round(s.fontSize * 12)}" w:line="264" w:lineRule="auto"/><w:jc w:val="left"/>`, `${hf}<w:b/>${hc}${sz(2.5)}`) + ps('Subtitle', 'Subtitle', `<w:spacing w:after="${Math.round(s.fontSize * 24)}"/><w:jc w:val="left"/>`, `${hf}<w:color w:val="5F6660"/>${sz(1.35)}`)
    + hd(1, 1.8, s.fontSize * 1.98) + hd(2, 1.4, s.fontSize * 1.4) + hd(3, 1.17, s.fontSize * 1.05) + hd(4, 1, s.fontSize * 0.8)
    + ps('Quote', 'Quote', `${bdr('8FA69C')}<w:ind w:left="240"/>`, '<w:i/>') + ps('Code', 'Code', '<w:shd w:val="clear" w:color="auto" w:fill="F3F4F1"/><w:spacing w:line="260" w:lineRule="auto"/><w:jc w:val="left"/>', `<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>${sz(0.88)}`)
    + ps('Lead', 'Lead', '', sz(1.18)) + ps('Small', 'Small', '', sz(0.85)) + ps('Caption', 'caption', '<w:spacing w:before="40"/><w:jc w:val="center"/>', `<w:color w:val="5F6660"/>${sz(0.85)}`)
    + ps('ListParagraph', 'List Paragraph', '<w:spacing w:after="40"/>', '') + ps('TableText', 'Table Text', '<w:spacing w:before="40" w:after="40" w:line="264" w:lineRule="auto"/><w:jc w:val="left"/>', '') + ps('Band', 'Band', '<w:spacing w:after="0"/><w:jc w:val="left"/>', '<w:color w:val="666666"/><w:sz w:val="18"/>')
    + [1, 2, 3].map((i) => ps('TOC' + i, 'toc ' + i, `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${W}"/></w:tabs><w:spacing w:after="60"/><w:ind w:left="${(i - 1) * 240}"/><w:jc w:val="left"/>`, '')).join('')
    + ps('FootnoteText', 'footnote text', '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>', sz(0.85))
    + '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0F5F8F"/><w:u w:val="single"/></w:rPr></w:style><w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style></w:styles>';

  const lvl = (i, fmt, txt, font, ind = 360) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${txt}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${(i + 1) * ind}" w:hanging="${ind}"/></w:pPr>${font ? `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:hint="default"/></w:rPr>` : ''}</w:lvl>`;
  const nine = (fn) => Array.from({ length: 9 }, (_, i) => fn(i)).join('');
  const numbering = `${HEAD}<w:numbering ${NS}>`
    + `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/>${[0, 1, 2].map((i) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:pStyle w:val="Heading${i + 1}"/><w:suff w:val="space"/><w:lvlText w:val="${['%1.', '%1.%2', '%1.%2.%3'][i]}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="0" w:firstLine="0"/></w:pPr></w:lvl>`).join('')}</w:abstractNum>`
    + `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${nine((i) => lvl(i, 'bullet', ['•', '◦', '▪'][i % 3], ''))}</w:abstractNum>`
    + `<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/>${nine((i) => lvl(i, ['decimal', 'lowerLetter', 'lowerRoman'][i % 3], `%${i + 1}.`))}</w:abstractNum>`
    + `<w:abstractNum w:abstractNumId="3"><w:multiLevelType w:val="hybridMultilevel"/>${nine((i) => lvl(i, 'none', ''))}</w:abstractNum>`
    + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'
    + nums.map((n, i) => `<w:num w:numId="${i + 11}"><w:abstractNumId w:val="${{ ul: 1, ol: 2, check: 3 }[n.kind]}"/>${n.kind === 'ol' ? `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="${n.start}"/></w:lvlOverride>` : ''}</w:num>`).join('') + '</w:numbering>';
  const foot = `${HEAD}<w:footnotes ${NS}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${notes.map((t, i) => `<w:footnote w:id="${i + 1}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>${run(' ' + t, {})}</w:p></w:footnote>`).join('')}</w:footnotes>`;
  const ct = 'application/vnd.openxmlformats-officedocument.wordprocessingml.';
  return zip([
    ['[Content_Types].xml', `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="${ct}document.main+xml"/><Override PartName="/word/styles.xml" ContentType="${ct}styles+xml"/><Override PartName="/word/numbering.xml" ContentType="${ct}numbering+xml"/><Override PartName="/word/settings.xml" ContentType="${ct}settings+xml"/><Override PartName="/word/footnotes.xml" ContentType="${ct}footnotes+xml"/>${types.join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ['_rels/.rels', `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ['docProps/core.xml', `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title></cp:coreProperties>`],
    ['word/document.xml', `${HEAD}<w:document ${NS}><w:body>${body}${sect}</w:body></w:document>`],
    ['word/_rels/document.xml.rels', `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rSty" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rNum" Type="${REL}/numbering" Target="numbering.xml"/><Relationship Id="rSet" Type="${REL}/settings" Target="settings.xml"/><Relationship Id="rFn" Type="${REL}/footnotes" Target="footnotes.xml"/>${rels.join('')}</Relationships>`],
    ['word/styles.xml', styles], ['word/numbering.xml', numbering], ['word/footnotes.xml', foot],
    ['word/settings.xml', `${HEAD}<w:settings ${NS}><w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`],
    ...extra, ...media,
  ], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}

// ------------------------------------------------------------------ reading

const kids = (n, name) => (n ? [...n.children].filter((c) => c.localName === name) : []);
const kid = (n, name) => kids(n, name)[0] || null;
const val = (n, name) => { const c = kid(n, name); return c ? wa(c, 'val') : null; };
const wa = (n, a) => n.getAttribute('w:' + a) ?? n.getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', a);
const on = (n, name) => { const c = kid(n, name); if (!c) return null; const v = wa(c, 'val'); return !(v === '0' || v === 'false' || v === 'none' || v === 'off'); };

export async function fromDocx(buf) {
  const z = await unzip(buf);
  const xml = async (name) => (z.has(name) ? new DOMParser().parseFromString(text(await z.get(name)()), 'application/xml').documentElement : null);
  const doc = await xml('word/document.xml');
  if (!doc) throw new Error('file_invalid');
  const relsOf = async (name) => { const r = await xml(name), m = {}; if (r) for (const x of r.children) m[x.getAttribute('Id')] = { target: x.getAttribute('Target'), ext: x.getAttribute('TargetMode') === 'External', type: x.getAttribute('Type') || '' }; return m; };
  const rels = await relsOf('word/_rels/document.xml.rels');
  const styleXml = await xml('word/styles.xml'), numXml = await xml('word/numbering.xml'), footXml = await xml('word/footnotes.xml'), coreXml = await xml('docProps/core.xml');
  const s = structuredClone(DEFAULTS);

  // styles: name, inheritance and character properties
  const styles = {};
  for (const st of kids(styleXml, 'style')) styles[wa(st, 'styleId')] = { name: (val(st, 'name') || '').toLowerCase(), base: val(st, 'basedOn'), rPr: kid(st, 'rPr'), pPr: kid(st, 'pPr'), def: wa(st, 'default') === '1' && wa(st, 'type') === 'paragraph' };
  const chain = (id) => { const out = []; for (let i = 0; id && styles[id] && i < 12; i++) { out.push(styles[id]); id = styles[id].base; } return out; };
  const kindOf = (id) => {
    for (const st of chain(id)) {
      const n = st.name;
      let m;
      if ((m = n.match(/^(?:heading|titolo|überschrift|titre|título) ?(\d)/))) return m[1] <= 4 ? 'h' + m[1] : 'h4';
      if (n === 'title') return 'title';
      if (n === 'subtitle') return 'subtitle';
      if (/quote|citazione/.test(n)) return 'quote';
      if (n === 'caption') return 'caption';
      if (n === 'lead' || n === 'small') return n;
      if (/^(code|html preformatted|codice)/.test(n)) return 'code';
      if (/^toc \d/.test(n)) return 'toc';
    }
    return '';
  };
  const font = (r) => { const f = kid(r, 'rFonts'); return f ? wa(f, 'ascii') || wa(f, 'hAnsi') : null; };
  const knownFont = (f) => FONTS.find((x) => x.toLowerCase() === (f || '').toLowerCase());
  const dr = kid(kid(kid(styleXml, 'docDefaults'), 'rPrDefault'), 'rPr'), dp = kid(kid(kid(styleXml, 'docDefaults'), 'pPrDefault'), 'pPr');
  const normal = Object.values(styles).find((x) => x.def);
  const pick = (fn) => { for (const r of [normal?.rPr, dr]) { const v = r && fn(r); if (v) return v; } return null; };
  s.font = knownFont(pick(font)) || (pick((r) => (font(r) || '').match(/times|cambria|georgia|garamond/i)) ? 'Times New Roman' : 'Source Sans 3');
  s.fontSize = Math.max(6, Math.min(40, (+pick((r) => val(r, 'sz')) || 22) / 2));
  const col = pick((r) => val(r, 'color'));
  if (/^[0-9a-f]{6}$/i.test(col || '')) s.color = '#' + col.toLowerCase();
  const sp = kid(normal?.pPr, 'spacing') || kid(dp, 'spacing');
  if (sp) { const l = +wa(sp, 'line'), a = wa(sp, 'after'); if (l && (wa(sp, 'lineRule') || 'auto') === 'auto') s.line = Math.max(1, Math.min(3, Math.round((l / 240) * 1.18 * 100) / 100)); if (a !== null && a !== undefined) s.gap = Math.min(40, +a / 20 || 0); } else s.line = 1.18;
  const h1 = Object.values(styles).find((x) => /^heading 1$/.test(x.name));
  s.headFont = knownFont(h1?.rPr && font(h1.rPr)) || s.font;
  const hcol = h1?.rPr && val(h1.rPr, 'color');
  s.headColor = /^[0-9a-f]{6}$/i.test(hcol || '') ? '#' + hcol.toLowerCase() : s.color;
  s.justify = (val(normal?.pPr, 'jc') || val(dp, 'jc')) === 'both';
  const lang = kid(dr, 'lang');
  if (lang && /^[a-z]{2}/.test(wa(lang, 'val') || '')) s.lang = wa(lang, 'val').slice(0, 2);

  // numbering: is a list ordered?
  const abs = {}, numOf = {};
  for (const a of kids(numXml, 'abstractNum')) { abs[wa(a, 'abstractNumId')] = kids(a, 'lvl').map((l) => ({ fmt: val(l, 'numFmt'), text: val(l, 'lvlText') })); }
  const startOf = {};
  for (const n of kids(numXml, 'num')) { numOf[wa(n, 'numId')] = abs[val(n, 'abstractNumId')] || []; const o = kids(n, 'lvlOverride').find((x) => wa(x, 'ilvl') === '0'); startOf[wa(n, 'numId')] = +(val(o, 'startOverride') || 1); }
  s.numbered = !!(h1?.pPr && kid(h1.pPr, 'numPr') && val(kid(h1.pPr, 'numPr'), 'numId') !== '0');
  const numPr = (p) => {
    const pPr = kid(p, 'pPr');
    for (const q of [pPr, ...chain(val(pPr, 'pStyle')).map((x) => x.pPr)]) { const n = kid(q, 'numPr'); if (n) { const id = val(n, 'numId'); if (id) return id === '0' ? null : { id, lvl: +(val(kid(pPr, 'numPr'), 'ilvl') ?? val(n, 'ilvl') ?? 0) }; } }
    return null;
  };

  const images = {}, made = {};
  const picture = async (blip) => {
    const rid = blip?.getAttribute('r:embed'), rel = rels[rid];
    if (!rel || rel.ext) return '';
    const path = rel.target.startsWith('/') ? rel.target.slice(1) : 'word/' + rel.target.replace(/^\.\//, '');
    if (made[path]) return made[path];
    const ext = path.split('.').pop().toLowerCase(), mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[ext];
    if (!mime || !z.has(path)) return '';
    const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
    images[id] = new Blob([await z.get(path)()], { type: mime });
    return (made[path] = id);
  };
  const notes = {};
  for (const f of kids(footXml, 'footnote')) notes[wa(f, 'id')] = [...f.getElementsByTagName('w:t')].map((t) => t.textContent).join('').trim();

  const body = kid(doc, 'body');
  const sect = [...doc.getElementsByTagName('w:sectPr')].at(-1);
  if (sect) {
    const sz = kid(sect, 'pgSz'), m = kid(sect, 'pgMar'), mm = (v) => Math.round((+v / 1440) * 25.4 * 10) / 10;
    if (sz) {
      const w = mm(wa(sz, 'w')), h = mm(wa(sz, 'h')), lo = Math.min(w, h), hi = Math.max(w, h);
      const known = Object.entries(SIZES).find(([, [a, b]]) => Math.abs(a - lo) < 1.5 && Math.abs(b - hi) < 1.5);
      s.landscape = w > h;
      if (known) s.size = known[0]; else { s.size = 'custom'; s.w = Math.max(50, Math.min(600, w)); s.h = Math.max(50, Math.min(600, h)); }
    }
    if (m) for (const [k, a] of [['mt', 'top'], ['mr', 'right'], ['mb', 'bottom'], ['ml', 'left']]) s[k] = Math.max(0, Math.min(100, Math.abs(mm(wa(m, a) || 0))));
    const bands = async (kind) => {
      const ref = kids(sect, kind + 'Reference').find((x) => wa(x, 'type') === 'default') || kids(sect, kind + 'Reference')[0];
      const rel = ref && rels[ref.getAttribute('r:id')], x = rel && (await xml('word/' + rel.target.replace(/^\/word\//, '')));
      if (!x) return;
      let t = '', code = '';
      let state = 0;
      for (const r of x.getElementsByTagName('*')) {
        if (r.localName === 'fldChar') { const k = wa(r, 'fldCharType'); if (k === 'begin') { state = 1; code = ''; } else if (k === 'separate') state = 2; else { t += /NUMPAGES/.test(code) ? '{pages}' : /PAGE/.test(code) ? '{page}' : /DATE/.test(code) ? '{date}' : ''; state = 0; } }
        else if (r.localName === 'instrText') code += r.textContent;
        else if (r.localName === 'fldSimple') { const c = wa(r, 'instr') || ''; t += /NUMPAGES/.test(c) ? '{pages}' : /PAGE/.test(c) ? '{page}' : ''; [...r.getElementsByTagName('w:t')].forEach((y) => { y.textContent = ''; }); }
        else if (r.localName === 't' && state !== 2) t += r.textContent;
        else if (r.localName === 'tab' && r.parentNode.localName === 'r') t += '\t';
      }
      const p = t.split('\t');
      s[kind] = p.length > 2 ? { l: p[0], c: p[1], r: p.slice(2).join(' ') } : p.length === 2 ? { l: p[0], c: '', r: p[1] } : { l: '', c: t, r: '' };
      for (const k of 'lcr') s[kind][k] = s[kind][k].trim().slice(0, 120);
    };
    await bands('header');
    await bands('footer');
    s.firstPage = !kid(sect, 'titlePg');
  }

  // the text
  const props = (rPr) => {
    const f = {};
    const layers = [rPr, ...chain(val(rPr, 'rStyle')).map((x) => x.rPr)];
    for (const [k, n] of [['b', 'b'], ['i', 'i'], ['s', 'strike']]) for (const l of layers) { const v = l && on(l, n); if (v !== null && v !== undefined) { f[k] = v; break; } }
    for (const l of layers) {
      if (!l) continue;
      const u = val(l, 'u');
      f.u ??= u === null ? undefined : u !== 'none';
      f.va ??= val(l, 'vertAlign') || undefined;
      f.color ??= val(l, 'color') || undefined;
      f.size ??= val(l, 'sz') || undefined;
      f.font ??= font(l) || undefined;
      f.hl ??= val(l, 'highlight') || undefined;
      const sh = kid(l, 'shd');
      f.bg ??= sh ? wa(sh, 'fill') : undefined;
    }
    return f;
  };
  const HL = { yellow: 'fff59d', green: 'a5e8a0', cyan: '9be7ef', magenta: 'f5a9e1', blue: '9fb8f5', red: 'f5a3a3', darkYellow: 'd9c25f', lightGray: 'd6d6d6', darkGray: 'b0b0b0' };
  const dress = (html, f, head) => {
    if (!html) return '';
    const st = [];
    if (/^[0-9a-f]{6}$/i.test(f.color || '') && !head && !f.link && '#' + f.color.toLowerCase() !== s.color && !/^000000$/.test(f.color)) st.push(`color:#${f.color.toLowerCase()}`);
    const bg = HL[f.hl] || (/^[0-9a-f]{6}$/i.test(f.bg || '') && !/^ffffff$/i.test(f.bg) ? f.bg.toLowerCase() : '');
    const mono = /courier|consolas|mono/i.test(f.font || '') && s.font !== 'Courier New';
    if (bg && !mono) st.push(`background-color:#${bg}`);
    if (f.size && !head && Math.abs(f.size / 2 - s.fontSize) > 0.4) st.push(`font-size:${f.size / 2}pt`);
    const kf = knownFont(f.font);
    if (kf && !head && !mono && kf !== s.font) st.push(`font-family:'${kf}'`);
    if (f.b && !head) html = `<strong>${html}</strong>`;
    if (f.i) html = `<em>${html}</em>`;
    if (f.u && !f.link) html = `<u>${html}</u>`;
    if (f.s) html = `<s>${html}</s>`;
    if (f.va === 'superscript') html = `<sup>${html}</sup>`;
    if (f.va === 'subscript') html = `<sub>${html}</sub>`;
    if (mono) html = `<code>${html}</code>`;
    return st.length ? `<span style="${esc(st.join(';'))}">${html}</span>` : html;
  };
  let field = null;
  async function runs(node, ctx) {
    let out = '';
    for (const n of node.children) {
      switch (n.localName) {
        case 'r': {
          const f = { ...props(kid(n, 'rPr')), link: ctx.link };
          let h = '';
          for (const c of n.children) {
            if (c.localName === 'fldChar') { const k = wa(c, 'fldCharType'); if (k === 'begin') field = { code: '', show: false }; else if (k === 'separate') { if (field) field.show = true; } else { field = null; } }
            else if (c.localName === 'instrText') { if (field) field.code += c.textContent; }
            else if (c.localName === 't') h += esc(c.textContent);
            else if (c.localName === 'tab') h += '\t';
            else if (c.localName === 'noBreakHyphen') h += '‑';
            else if (c.localName === 'br' || c.localName === 'cr') { if (wa(c, 'type') === 'page') { out += dress(h, f, ctx.head); h = ''; out += '\u0001'; } else if (wa(c, 'type') !== 'column') h += '<br>'; }
            else if (c.localName === 'footnoteReference') { const t = notes[wa(c, 'id')]; if (t) { out += dress(h, f, ctx.head); h = ''; out += `<sup class="fn" data-n="${esc(t)}"></sup>`; } }
            else if (c.localName === 'drawing' || c.localName === 'pict') {
              const id = await picture(c.getElementsByTagName('a:blip')[0]);
              if (id) {
                const e = c.getElementsByTagName('wp:extent')[0], full = (pageMM(s)[0] - s.ml - s.mr) * MM, w = e ? Math.round((+e.getAttribute('cx') / 9525 / full) * 100) : 100;
                const al = c.getElementsByTagName('wp:align')[0]?.textContent, dp2 = c.getElementsByTagName('wp:docPr')[0];
                ctx.pics.push({ id, w: Math.max(8, Math.min(100, w)), side: c.getElementsByTagName('wp:wrapSquare')[0] || c.getElementsByTagName('wp:wrapTight')[0] ? (al === 'right' ? 'r' : 'l') : '', alt: dp2?.getAttribute('descr') || '' });
              }
            }
          }
          out += dress(h, f, ctx.head);
          break;
        }
        case 'hyperlink': {
          const rel = rels[n.getAttribute('r:id')], a = wa(n, 'anchor');
          const h = await runs(n, { ...ctx, link: true });
          out += rel?.ext && /^(https?:|mailto:|tel:)/i.test(rel.target) ? `<a href="${esc(rel.target)}">${h}</a>` : /^b-[a-z0-9]{4,12}$/.test(a || '') ? `<a href="#${a}">${h}</a>` : h;
          break;
        }
        case 'del': case 'moveFrom': case 'pPr': case 'proofErr': break;
        case 'fldSimple': case 'ins': case 'moveTo': case 'smartTag': out += await runs(n, ctx); break;
        case 'bookmarkStart': { const nm = wa(n, 'name') || ''; if (/^b-[a-z0-9]{4,12}$/.test(nm)) ctx.anchor = nm.slice(2); break; }
        case 'sdt': out += await runs(kid(n, 'sdtContent') || n, ctx); break;
        case 'AlternateContent': out += await runs(kid(n, 'Choice') || n, ctx); break;
      }
    }
    return out;
  }

  const out = [];
  const push = (h, id) => out.push({ id: id && !out.some((b) => b.id === id) ? id : newId(), h });
  let list = null; // {id, items: [{lvl, tag, html, check}]}
  const flush = () => {
    if (!list) return;
    let i = 0;
    const from = startOf[list.id] || 1;
    const build = (lvl, top) => {
      const tag = list.items[i].tag, chk = list.items[i].check;
      let h = '';
      while (i < list.items.length && list.items[i].lvl >= lvl) {
        const it = list.items[i];
        if (it.lvl > lvl) { const sub = build(it.lvl); h = h.replace(/<\/li>$/, `${sub}</li>`); continue; }
        i++;
        h += `<li${it.check === 2 ? ' data-c="1"' : ''}>${it.html || '<br>'}</li>`;
      }
      return `<${tag}${chk ? ' class="check"' : ''}${top && tag === 'ol' && from > 1 ? ` start="${from}"` : ''}>${h}</${tag}>`;
    };
    const min = Math.min(...list.items.map((x) => x.lvl));
    list.items[0].lvl = min;
    while (i < list.items.length) push(build(min, true));
    list = null;
  };
  const style = (pPr) => {
    const st = [], jc = val(pPr, 'jc'), ind = kid(pPr, 'ind');
    if (jc && { center: 1, right: 1, end: 1, both: 1 }[jc] && !(jc === 'both' && s.justify)) st.push('text-align:' + { center: 'center', right: 'right', end: 'right', both: 'justify' }[jc]);
    if (ind && !numOf[val(kid(pPr, 'numPr'), 'numId')]) { const l = +(wa(ind, 'left') || wa(ind, 'start') || 0) / 20, fl = +(wa(ind, 'firstLine') || 0) / 20; if (l > 2) st.push(`margin-left:${Math.min(216, l)}pt`); if (fl > 2) st.push(`text-indent:${Math.min(100, fl)}pt`); }
    const sp2 = kid(pPr, 'spacing');
    if (sp2) {
      const l = +wa(sp2, 'line'), b = wa(sp2, 'before'), a = wa(sp2, 'after');
      if (l && (wa(sp2, 'lineRule') || 'auto') === 'auto' && l >= 200 && l <= 1200) st.push(`line-height:${Math.round((l / 240) * 100) / 100}`);
      if (b) st.push(`margin-top:${Math.min(200, Math.round(+b / 20))}pt`);
      if (a) st.push(`margin-bottom:${Math.min(200, Math.round(+a / 20))}pt`);
    }
    return st.length ? ` style="${st.join(';')}"` : '';
  };
  const BOX = { '3B7DBF': 'info', '0F6E56': 'tip', D85A30: 'warn' };
  async function paragraph(p) {
    const pPr = kid(p, 'pPr'), kind = kindOf(val(pPr, 'pStyle')), n = numPr(p), ctx = { head: /^h\d|title/.test(kind), pics: [], anchor: '' };
    if (kind === 'toc') { if (out.at(-1)?.h !== '<div class="toc"></div>') { flush(); push('<div class="toc"></div>'); } return; }
    const html = await runs(p, ctx);
    if (on(pPr, 'pageBreakBefore') && out.length) { flush(); push('<div class="pb"></div>'); }
    const parts = html.split('\u0001');
    for (let k = 0; k < parts.length; k++) {
      if (k) { flush(); push('<div class="pb"></div>'); }
      let h = parts[k];
      const bare = h.replace(/<(?!sup class="fn")[^>]+>/g, '').trim();
      if (n && !/^h\d/.test(kind) && (bare || parts.length === 1)) {
        const l = numOf[n.id]?.[n.lvl] || {}, fmt = l.fmt || 'bullet';
        const box = bare.match(/^[☐☑☒]/);
        const tag = fmt === 'bullet' || fmt === 'none' ? 'ul' : 'ol', check = box ? (box[0] === '☐' ? 1 : 2) : 0;
        if (box) h = h.replace(/[☐☑☒]\s?/, '');
        if (!list || (list.id !== n.id && n.lvl === 0)) { flush(); list = { id: n.id, items: [] }; }
        list.items.push({ lvl: n.lvl, tag, html: h, check });
        continue;
      }
      flush();
      const wrap = ctx.pics.find((x) => x.side);
      if (wrap && bare) { push(`<div class="beside" data-k="${wrap.side}"><figure data-w="${Math.min(60, wrap.w)}"><img data-i="${wrap.id}" alt="${esc(wrap.alt)}"></figure><p>${h}</p></div>`); ctx.pics = ctx.pics.filter((x) => x !== wrap); continue; }
      if (kind === 'caption' && /^<figure/.test(out.at(-1)?.h || '') && !/<figcaption>/.test(out.at(-1).h)) { out.at(-1).h = out.at(-1).h.replace('</figure>', `<figcaption>${h}</figcaption></figure>`); continue; }
      if (!bare && (parts.length > 1 || ctx.pics.length)) continue;
      const bd = kid(pPr, 'pBdr');
      if (!bare && bd && kid(bd, 'bottom')) { push('<hr>'); continue; }
      const st = style(pPr), inner = h || '<br>';
      const edge = bd && kid(bd, 'left'), box = edge && kid(pPr, 'shd') && BOX[(wa(edge, 'color') || '').toUpperCase()];
      if (box) { // the coloured boxes written by SavDocuments
        const last = out.at(-1);
        if (last?.box === box) last.h = last.h.replace(/<\/div>$/, `<p>${inner}</p></div>`);
        else { push(`<div class="callout" data-k="${box}"><p>${inner}</p></div>`); out.at(-1).box = box; }
        continue;
      }
      if (kind === 'code') { const last = out.at(-1); if (/^<pre>/.test(last?.h || '') && !bare.startsWith('\u0002') && last.code === true) last.h = last.h.replace('</pre>', `\n${h.replace(/<br>/g, '\n')}</pre>`); else { push(`<pre>${h.replace(/<br>/g, '\n').replace(/<\/?(code|span)[^>]*>/g, '')}</pre>`); out.at(-1).code = true; } } else if (/^h\d$/.test(kind)) { if (bare) push(`<${kind}${st}>${inner}</${kind}>`, ctx.anchor); } else if (kind === 'quote') push(`<blockquote>${inner}</blockquote>`);
      else if (/^(title|subtitle|lead|small)$/.test(kind)) push(`<p class="${kind}"${st}>${inner}</p>`);
      else if (kind === 'caption') push(`<p class="small"${st}>${inner}</p>`);
      else push(`<p${st}>${inner}</p>`);
    }
    if (ctx.pics.length) { flush(); const jc = val(pPr, 'jc'), a = { left: 'l', right: 'r', end: 'r' }[jc] || (jc === 'center' ? 'c' : 'l'); for (const x of ctx.pics) push(`<figure data-a="${a}" data-w="${x.w}"><img data-i="${x.id}" alt="${esc(x.alt)}"></figure>`); }
  }
  async function cell(tc) {
    const save = out.splice(0), keep = list;
    list = null;
    await walk(tc);
    flush();
    const h = out.map((b) => (/^<(p|h\d|blockquote|pre)/.test(b.h) ? b.h.replace(/^<\w+[^>]*>|<\/\w+>$/g, '') : /^<[uo]l/.test(b.h) ? b.h : new DOMParser().parseFromString(b.h, 'text/html').body.textContent)).filter((x) => x && x !== '<br>').join('<br>');
    const al = out.length && out.every((b) => /text-align:(center|right)/.test(b.h)) ? out[0].h.match(/text-align:(center|right)/)[1] : '';
    out.length = 0;
    out.push(...save);
    list = keep;
    return { h: h || '<br>', al };
  }
  async function table(t) {
    flush();
    const cols = kids(kid(t, 'tblGrid'), 'gridCol').map((g) => +wa(g, 'w') || 0), total = cols.reduce((a, b) => a + b, 0);
    const rows = [], open = {};
    for (const tr of kids(t, 'tr')) {
      const row = [];
      let x = 0;
      const head = on(kid(tr, 'trPr'), 'tblHeader');
      for (let tc of kids(tr, 'tc')) {
        const pr = kid(tc, 'tcPr'), span = +(val(pr, 'gridSpan') || 1), vm = kid(pr, 'vMerge');
        if (vm && wa(vm, 'val') !== 'restart' && open[x]) { open[x].rs++; x += span; continue; }
        const c = await cell(tc), sh = kid(pr, 'shd'), fill = sh && wa(sh, 'fill');
        const o = { ...c, cs: span, rs: 1, head, fill: /^[0-9a-f]{6}$/i.test(fill || '') && !/^ffffff$/i.test(fill) && !(head && /^eef1ee$/i.test(fill)) ? fill.toLowerCase() : '', va: val(pr, 'vAlign') };
        if (vm) open[x] = o; else delete open[x];
        row.push(o);
        x += span;
      }
      rows.push(row);
    }
    const cg = total && cols.length > 1 && Math.max(...cols) - Math.min(...cols) > total * 0.02 ? `<colgroup>${cols.map((c) => `<col style="width:${((c / total) * 100).toFixed(2)}%">`).join('')}</colgroup>` : '';
    const strip = (h) => h.replace(/^<strong>(.*)<\/strong>$/s, '$1');
    push(`<table>${cg}<tbody>${rows.filter((r) => r.length).map((r) => `<tr>${r.map((c) => { const st = [c.al && `text-align:${c.al}`, c.fill && `background-color:#${c.fill}`, c.va === 'center' ? 'vertical-align:middle' : c.va === 'bottom' && 'vertical-align:bottom'].filter(Boolean).join(';'); return `<${c.head ? 'th' : 'td'}${c.cs > 1 ? ` colspan="${c.cs}"` : ''}${c.rs > 1 ? ` rowspan="${c.rs}"` : ''}${st ? ` style="${st}"` : ''}>${c.head ? strip(c.h) : c.h}</${c.head ? 'th' : 'td'}>`; }).join('')}</tr>`).join('')}</tbody></table>`);
  }
  async function walk(node) {
    for (const n of node.children) {
      if (n.localName === 'p') await paragraph(n);
      else if (n.localName === 'tbl') await table(n);
      else if (n.localName === 'sdt') {
        const gal = n.getElementsByTagName('w:docPartGallery')[0];
        if (gal && /table of contents/i.test(wa(gal, 'val') || '')) { flush(); push('<div class="toc"></div>'); } else await walk(kid(n, 'sdtContent') || n);
      } else if (/^(ins|moveTo|AlternateContent|Choice|customXml|smartTag)$/.test(n.localName)) await walk(n);
    }
  }
  await walk(body);
  flush();
  // the small paragraph Word wants after a table is not part of the text
  const blocks = out.filter((b, i) => !(b.h === '<p><br></p>' && /^<table/.test(out[i - 1]?.h || '') && i < out.length - 1)).map((b) => ({ id: b.id, h: cleanBlocks(b.h)[0] })).filter((b) => b.h);
  const title = coreXml?.getElementsByTagName('dc:title')[0]?.textContent?.trim() || '';
  return { title, settings: s, blocks, images };
}

