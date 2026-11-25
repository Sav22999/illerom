/** ODP (LibreOffice Impress): native shapes, text boxes and pictures. */
import { zip } from './zip.js';
import { sorted, decorOf } from './render.js';
import { slideContext, styleOf, gradient, FONTS } from './themes.js';
import { shapePath, toSvgPath } from './shapes.js';
import { expandSlide } from './parts.js';
import { videoSrc } from './render.js';
import { paragraphs, isEmpty, okLink } from './richtext.js';

const x = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const cm = (v) => (v * 2.54 / 96).toFixed(4) + 'cm';
const pt = (v) => (v * .75).toFixed(2) + 'pt';
const XMLNS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/"';

export async function exportOdp(deck, ctx, media) {
  const auto = [], defs = [], known = new Map(), used = new Set();
  const style = (family, inner, parent = '') => { const key = family + inner; if (!known.has(key)) { const id = family[0] + known.size; known.set(key, id); auto.push(`<style:style style:name="${id}" style:family="${family}"${parent}>${inner}</style:style>`); } return known.get(key); };
  const hex = (c) => c.slice(0, 7), alpha = (c) => (c.length === 9 ? parseInt(c.slice(7), 16) / 255 : 1);
  const grad = (g, sc) => { const a = sc.color(g.a), b = sc.color(g.b), id = `gr${defs.length}`; defs.push(`<draw:gradient draw:name="${id}" draw:style="linear" draw:start-color="${hex(a)}" draw:end-color="${hex(b)}" draw:start-intensity="100%" draw:end-intensity="100%" draw:angle="${Math.round((180 - g.ang + 720) % 360)}deg" draw:border="0%"/>`); let op = ''; if (alpha(a) < 1 || alpha(b) < 1) { op = `op${defs.length}`; defs.push(`<draw:opacity draw:name="${op}" draw:style="linear" draw:start="${Math.round(alpha(a) * 100)}%" draw:end="${Math.round(alpha(b) * 100)}%" draw:angle="${Math.round((180 - g.ang + 720) % 360)}deg" draw:border="0%"/>`); } return { id, op }; };
  const fillA = (f, sc, o) => { if (!f) return 'draw:fill="none"'; const g = gradient(f); if (g) { const { id, op } = grad(g, sc); return `draw:fill="gradient" draw:fill-gradient-name="${id}"${op ? ` draw:opacity-name="${op}"` : o < 1 ? ` draw:opacity="${Math.round(o * 100)}%"` : ''}`; } const c = sc.color(f), a = alpha(c) * o; return `draw:fill="solid" draw:fill-color="${hex(c)}"${a < 1 ? ` draw:opacity="${Math.round(a * 100)}%"` : ''}`; };
  const strokeA = (el, sc, sw, c) => (sw ? `draw:stroke="${el.dash ? 'dash' : 'solid'}"${el.dash ? ` draw:stroke-dash="${el.dash}"` : ''} svg:stroke-width="${cm(sw)}" svg:stroke-color="${hex(sc.color(c))}"${(el.o ?? 1) < 1 ? ` svg:stroke-opacity="${Math.round(el.o * 100)}%"` : ''}` : 'draw:stroke="none"');
  defs.push('<draw:stroke-dash draw:name="dash" draw:style="rect" draw:dots1="1" draw:dots1-length="300%" draw:distance="200%"/>', '<draw:stroke-dash draw:name="dot" draw:style="round" draw:dots1="1" draw:dots1-length="100%" draw:distance="200%"/>', '<draw:marker draw:name="arrow" svg:viewBox="0 0 20 20" svg:d="M10 0l10 20H0z"/>', '<draw:marker draw:name="dot" svg:viewBox="0 0 20 20" svg:d="M10 0a10 10 0 1 0 .01 0z"/>');
  const shadowA = (n) => (n ? `draw:shadow="visible" draw:shadow-offset-x="0cm" draw:shadow-offset-y="${['', '.05cm', '.2cm', '.5cm'][n]}" draw:shadow-color="#000000" draw:shadow-opacity="${['', 16, 20, 28][n]}%"` : '');
  // where it is: a rotated element turns around its own top left corner
  const at = (el) => { if (!el.r) return `svg:x="${cm(el.x)}" svg:y="${cm(el.y)}"`; const a = el.r * Math.PI / 180, cx = el.x + el.w / 2, cy = el.y + el.h / 2, px = cx - Math.cos(a) * el.w / 2 + Math.sin(a) * el.h / 2, py = cy - Math.sin(a) * el.w / 2 - Math.cos(a) * el.h / 2; return `draw:transform="rotate(${(-a).toFixed(6)}) translate(${cm(px)} ${cm(py)})"`; };
  const size = (el) => `svg:width="${cm(el.w)}" svg:height="${cm(el.h)}"`;
  function textXml(el, sc) {
    if (isEmpty(el.html)) return '';
    const st = styleOf(el, sc), al = { left: 'start', center: 'center', right: 'end', justify: 'justify' };
    let out = '', listOpen = null;
    const close = () => { if (listOpen) { out += '</text:list>'; listOpen = null; } };
    for (const p of paragraphs(el.html, {})) {
      const ps = style('paragraph', `<style:paragraph-properties fo:text-align="${al[p.align || st.align]}" fo:line-height="${Math.round(st.lh * 84)}%" fo:margin-top="0cm" fo:margin-bottom="0cm"${p.list ? '' : ' fo:margin-left="0cm" fo:text-indent="0cm"'}/><style:text-properties fo:font-size="${pt(st.size)}" fo:color="${hex(sc.color(st.color))}"/>`);
      const runs = p.runs.map((r) => {
        if (r.br) return '<text:line-break/>';
        const ts = style('text', `<style:text-properties fo:font-family="${x(FONTS[sc.font(r.f || st.font)][0])}" fo:font-size="${pt(st.size * (r.k || 1))}" fo:font-weight="${r.b || st.bold ? 'bold' : 'normal'}" fo:font-style="${r.i || st.italic ? 'italic' : 'normal'}" fo:color="${hex(sc.color(r.c || st.color))}"${r.u || st.under ? ' style:text-underline-style="solid" style:text-underline-width="auto"' : ''}${r.s ? ' style:text-line-through-style="solid"' : ''}${r.m ? ` fo:background-color="${hex(sc.color(r.m))}"` : ''}${st.caps ? ' fo:text-transform="uppercase"' : ''}${st.ls ? ` fo:letter-spacing="${pt(st.ls)}"` : ''}${r.sup ? ' style:text-position="super 58%"' : r.sub ? ' style:text-position="sub 58%"' : ''}/>`);
        const s = `<text:span text:style-name="${ts}">${x(r.t).replace(/ {2,}/g, (m) => ' <text:s text:c="' + (m.length - 1) + '"/>')}</text:span>`;
        return r.href && okLink(r.href) && !r.href.startsWith('#') ? `<text:a xlink:type="simple" xlink:href="${x(r.href)}">${s}</text:a>` : s;
      }).join('');
      const para = `<text:p text:style-name="${ps}">${runs}</text:p>`;
      if (p.list) { const ls = `${p.list}${Math.round(st.size)}${sc.color(st.color)}`; if (listOpen !== ls) { close(); out += `<text:list text:style-name="${listStyle(p.list, st, sc)}">`; listOpen = ls; } out += `<text:list-item>${para}</text:list-item>`; } else { close(); out += para; }
    }
    close();
    return out;
  }
  const lists = new Map();
  function listStyle(kind, st, sc) {
    const key = kind + Math.round(st.size) + sc.color(st.color);
    if (!lists.has(key)) { const id = 'L' + lists.size, ind = cm(st.size * 1.2), prop = `<style:list-level-properties text:space-before="0cm" text:min-label-width="${ind}"/><style:text-properties fo:color="${hex(sc.color(st.color))}" fo:font-size="100%"/>`; auto.push(`<text:list-style style:name="${id}">${kind === 'ol' ? `<text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix=".">${prop}</text:list-level-style-number>` : `<text:list-level-style-bullet text:level="1" text:bullet-char="•">${prop}</text:list-level-style-bullet>`}</text:list-style>`); lists.set(key, id); }
    return lists.get(key);
  }
  const graphic = (el, sc, inner) => { const st = styleOf(el, sc); return style('graphic', `<style:graphic-properties ${inner} ${shadowA(el.shadow)} fo:padding="${cm(st.pad)}" draw:textarea-vertical-align="${{ top: 'top', middle: 'middle', bottom: 'bottom' }[st.va]}" draw:textarea-horizontal-align="justify" draw:auto-grow-height="false" draw:auto-grow-width="false" fo:wrap-option="wrap" fo:min-height="0cm"/><style:paragraph-properties style:writing-mode="lr-tb"/>`); };
  const wrapLink = (el, xml) => (el.link && okLink(el.link) && !el.link.startsWith('#') ? xml.replace(/(<draw:[a-z-]+ [^>]*>)/, `$1<office:event-listeners><presentation:event-listener xmlns:script="urn:oasis:names:tc:opendocument:xmlns:script:1.0" script:event-name="dom:click" presentation:action="show" xlink:href="${x(el.link)}" xlink:type="simple"/></office:event-listeners>`) : xml);
  async function one(el, sc) {
    const o = el.o ?? 1;
    if (el.t === 'shape' && el.shape === 'line') {
      const a = (el.r || 0) * Math.PI / 180, cx = el.x + el.w / 2, cy = el.y + el.h / 2, dx = Math.cos(a) * el.w / 2, dy = Math.sin(a) * el.w / 2, sw = el.sw ?? 3 * sc.s, mk = (k, side) => (el[k] ? ` draw:marker-${side}="${el[k] === 'dot' ? 'dot' : 'arrow'}" draw:marker-${side}-width="${cm(Math.max(10, sw * 4))}"` : '');
      return `<draw:line draw:style-name="${style('graphic', `<style:graphic-properties ${strokeA(el, sc, sw, el.stroke || el.fill || '@fg')}${mk('h1', 'start')}${mk('h2', 'end')}/>`)}" svg:x1="${cm(cx - dx)}" svg:y1="${cm(cy - dy)}" svg:x2="${cm(cx + dx)}" svg:y2="${cm(cy + dy)}"><text:p/></draw:line>`;
    }
    if (el.t === 'text' && !el.rad) return wrapLink(el, `<draw:frame draw:style-name="${graphic(el, sc, `${fillA(el.fill, sc, o)} ${strokeA(el, sc, el.stroke ? el.sw || 0 : 0, el.stroke || '@fg')}`)}" ${at(el)} ${size(el)}><draw:text-box>${textXml(el, sc)}</draw:text-box></draw:frame>`);
    if (el.t === 'text' || el.t === 'shape') {
      const K = 100, d = (el.cmds ? el.cmds.map(([c, ...v]) => [c, ...v.map((n) => n * K)]) : shapePath(el.t === 'text' ? 'rect' : el.shape || 'rect', el.w * K, el.h * K, (el.rad || 0) * K)).map(([c, ...v]) => c + ' ' + v.map(Math.round).join(' ')).join(' ') + (el.open ? ' F N' : ' N');
      return wrapLink(el, `<draw:custom-shape draw:style-name="${graphic(el, sc, `${fillA(el.fill, sc, o)} ${strokeA(el, sc, el.sw || 0, el.stroke || '@fg')}`)}" ${at(el)} ${size(el)}>${textXml(el, sc)}<draw:enhanced-geometry svg:viewBox="0 0 ${Math.round(el.w * K)} ${Math.round(el.h * K)}" draw:text-areas="0 0 ${Math.round(el.w * K)} ${Math.round(el.h * K)}" draw:type="non-primitive" draw:enhanced-path="${d}"${el.flip ? ' draw:mirror-horizontal="true"' : ''}/></draw:custom-shape>`);
    }
    const src = el.t === 'video' ? el.poster : el.src, m = media.get(src);
    if (!m) return one({ t: 'shape', shape: 'rect', x: el.x, y: el.y, w: el.w, h: el.h, r: el.r, rad: el.rad, fill: el.t === 'video' ? '#14181b' : '@surface' }, sc);
    // the picture as it is seen: cropped, masked and flipped once and for all
    const f = el.fit === 'contain' ? Math.min(el.w / m.w, el.h / m.h) : Math.max(el.w / m.w, el.h / m.h), z = el.zoom || 1, k = Math.min(3, Math.max(1, 1 / (f * z))), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(Math.min(2400, el.w * k))); c.height = Math.max(1, Math.round(c.width * el.h / el.w));
    const g = c.getContext('2d'), s = c.width / el.w, fx = el.fx ?? .5, fy = el.fy ?? .5;
    g.scale(s, s);
    if (el.mask || el.rad) { g.clip(new Path2D(toSvgPath(shapePath(el.mask || 'rect', el.w, el.h, el.rad || 0))), 'evenodd'); }
    if (el.flip) { g.translate(2 * fx * el.w, 0); g.scale(-1, 1); }
    g.translate(fx * el.w, fy * el.h); g.scale(z, z); g.translate(-fx * el.w, -fy * el.h);
    g.drawImage(m.img, (el.w - m.w * f) * fx, (el.h - m.h * f) * fy, m.w * f, m.h * f);
    const jpg = !el.mask && !el.rad && el.fit !== 'contain' && /jpe?g$/.test(m.name), blob = await new Promise((r) => c.toBlob(r, jpg ? 'image/jpeg' : 'image/png', .88)), name = `img${pics.length + 1}.${jpg ? 'jpeg' : 'png'}`;
    pics.push([name, blob]);
    const vurl = el.t === 'video' && videoSrc(el);
    return wrapLink(vurl && !el.link ? { ...el, link: vurl } : el, `<draw:frame draw:style-name="${style('graphic', `<style:graphic-properties draw:stroke="none" draw:fill="none" ${o < 1 ? `draw:image-opacity="${Math.round(o * 100)}%"` : ''} ${shadowA(el.shadow)}/>`)}" ${at(el)} ${size(el)}><draw:image xlink:href="Pictures/${name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"><text:p/></draw:image>${el.alt ? `<svg:desc>${x(el.alt)}</svg:desc>` : ''}</draw:frame>`);
  }
  const pics = [];
  let body = '';
  for (const [i, s] of deck.order().entries()) {
    const sc = slideContext(ctx, s.d), b = sc.bg, { under, over } = decorOf(s.d, sc, deck.index(s.sid), deck.slides.size);
    let pre = '', fill;
    if (b.t === 'g') fill = fillA(`g|${b.ang ?? 135}|${b.a}|${b.b}`, sc, 1);
    else fill = fillA(b.t === 'i' ? '@bg' : b.c || '@bg', sc, 1);
    if (b.t === 'i') { pre = await one({ t: 'image', src: b.src, x: 0, y: 0, w: ctx.W, h: ctx.H, fx: b.fx, fy: b.fy }, sc); if (b.dim) pre += await one({ t: 'shape', shape: 'rect', x: 0, y: 0, w: ctx.W, h: ctx.H, fill: '@bg', o: b.dim }, sc); }
    const dp = style('drawing-page', `<style:drawing-page-properties ${fill} presentation:background-visible="true" presentation:background-objects-visible="true"${s.d.hide ? ' presentation:visibility="hidden"' : ''}/>`);
    let els = '';
    for (const el of [...under, ...sorted(expandSlide(s.d, sc)), ...over]) els += await one(el, sc);
    body += `<draw:page draw:name="${x(s.d.name ? `${i + 1}. ${s.d.name}` : `page${i + 1}`)}" draw:style-name="${dp}" draw:master-page-name="Default">${pre}${els}${s.d.notes ? `<presentation:notes><draw:frame presentation:class="notes" svg:x="2cm" svg:y="14cm" svg:width="17cm" svg:height="12cm"><draw:text-box>${s.d.notes.split('\n').map((l) => `<text:p>${x(l)}</text:p>`).join('')}</draw:text-box></draw:frame></presentation:notes>` : ''}</draw:page>`;
  }
  void used;
  const head = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const content = `${head}<office:document-content ${XMLNS} office:version="1.3"><office:automatic-styles>${auto.join('')}</office:automatic-styles><office:body><office:presentation>${body}</office:presentation></office:body></office:document-content>`;
  const styles = `${head}<office:document-styles ${XMLNS} office:version="1.3"><office:styles>${defs.join('')}<style:default-style style:family="graphic"><style:graphic-properties draw:shadow="hidden"/></style:default-style></office:styles><office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:margin="0cm" fo:page-width="${cm(ctx.W)}" fo:page-height="${cm(ctx.H)}" style:print-orientation="${ctx.W > ctx.H ? 'landscape' : 'portrait'}"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1"/></office:master-styles></office:document-styles>`;
  const meta = `${head}<office:document-meta ${XMLNS} office:version="1.3"><office:meta><meta:generator>SavPresentations</meta:generator><dc:title>${x(deck.title)}</dc:title></office:meta></office:document-meta>`;
  const entries = ['content.xml', 'styles.xml', 'meta.xml'].map((f) => `<manifest:file-entry manifest:full-path="${f}" manifest:media-type="text/xml"/>`).join('') + pics.map(([f]) => `<manifest:file-entry manifest:full-path="Pictures/${f}" manifest:media-type="image/${f.split('.').pop()}"/>`).join('');
  const type = 'application/vnd.oasis.opendocument.presentation';
  return zip([['mimetype', type, { store: true }], ['META-INF/manifest.xml', `${head}<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${type}"/>${entries}</manifest:manifest>`], ['content.xml', content], ['styles.xml', styles], ['meta.xml', meta], ...pics.map(([f, b]) => ['Pictures/' + f, b])], type);
}
