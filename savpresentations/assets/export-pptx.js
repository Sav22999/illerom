/** PPTX: every element becomes a native PowerPoint object (text boxes, shapes, pictures), so it can be edited there. */
import { zip } from './zip.js';
import { sorted, decorOf } from './render.js';
import { slideContext, styleOf, gradient, FONTS } from './themes.js';
import { shapePath } from './shapes.js';
import { expandSlide } from './parts.js';
import { videoSrc } from './render.js';
import { paragraphs, isEmpty, okLink } from './richtext.js';

const E = 9525; // EMU for one CSS pixel
const emu = (v) => Math.round(v * E);
const x = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const PRST = { rect: 'rect', ellipse: 'ellipse', triangle: 'triangle', rtriangle: 'rtTriangle', diamond: 'diamond' };

const clr = (hex, o = 1) => { const a = (hex.length === 9 ? parseInt(hex.slice(7), 16) / 255 : 1) * o; return `<a:srgbClr val="${hex.slice(1, 7).toUpperCase()}">${a < 1 ? `<a:alpha val="${Math.round(a * 100000)}"/>` : ''}</a:srgbClr>`; };
function fillXml(f, sc, o = 1) {
  if (!f) return '<a:noFill/>';
  const g = gradient(f);
  if (g) return `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0">${clr(sc.color(g.a), o)}</a:gs><a:gs pos="100000">${clr(sc.color(g.b), o)}</a:gs></a:gsLst><a:lin ang="${Math.round(((g.ang - 90 + 360) % 360) * 60000)}" scaled="0"/></a:gradFill>`;
  return `<a:solidFill>${clr(sc.color(f), o)}</a:solidFill>`;
}
const lineXml = (el, sc, sw, color) => (sw ? `<a:ln w="${emu(sw)}"${el.cap ? ' cap="rnd"' : ''}><a:solidFill>${clr(sc.color(color), el.o ?? 1)}</a:solidFill>${el.dash === 'dash' ? '<a:prstDash val="dash"/>' : el.dash === 'dot' ? '<a:prstDash val="sysDot"/>' : ''}<a:round/>${el.h1 ? `<a:headEnd type="${el.h1 === 'dot' ? 'oval' : 'triangle'}"/>` : ''}${el.h2 ? `<a:tailEnd type="${el.h2 === 'dot' ? 'oval' : 'triangle'}"/>` : ''}</a:ln>` : '<a:ln><a:noFill/></a:ln>');
function geomXml(shape, w, h, rad, cmds, open) {
  if (!cmds && PRST[shape] && !rad) return `<a:prstGeom prst="${PRST[shape]}"><a:avLst/></a:prstGeom>`;
  if (!cmds && (shape === 'rect' || shape === 'round')) { const r = rad || (shape === 'round' ? Math.min(w, h) * .16 : 0); return r ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.round(Math.min(.5, r / Math.min(w, h)) * 100000)}"/></a:avLst></a:prstGeom>` : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'; }
  const pt = (a, b) => `<a:pt x="${emu(a)}" y="${emu(b)}"/>`;
  const p = (cmds || shapePath(shape, w, h, rad)).map(([c, ...v]) => (c === 'M' ? `<a:moveTo>${pt(v[0], v[1])}</a:moveTo>` : c === 'L' ? `<a:lnTo>${pt(v[0], v[1])}</a:lnTo>` : c === 'C' ? `<a:cubicBezTo>${pt(v[0], v[1])}${pt(v[2], v[3])}${pt(v[4], v[5])}</a:cubicBezTo>` : '<a:close/>')).join('');
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${emu(w)}" h="${emu(h)}"${open ? ' fill="none"' : ''}>${p}</a:path></a:pathLst></a:custGeom>`;
}
const xfrm = (el) => `<a:xfrm${el.r ? ` rot="${Math.round(((el.r + 360) % 360) * 60000)}"` : ''}${el.flip ? ' flipH="1"' : ''}><a:off x="${emu(el.x)}" y="${emu(el.y)}"/><a:ext cx="${emu(el.w)}" cy="${emu(el.h)}"/></a:xfrm>`;
const shadow = (n) => (n ? `<a:effectLst><a:outerShdw blurRad="${[0, 76200, 254000, 571500][n]}" dist="${[0, 19050, 76200, 190500][n]}" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="${[0, 16000, 20000, 28000][n]}"/></a:srgbClr></a:outerShdw></a:effectLst>` : '');

function body(el, sc, rel, tag = 'p:txBody') {
  const st = styleOf(el, sc), al = { left: 'l', center: 'ctr', right: 'r', justify: 'just' }, pad = emu(st.pad), o = el.o ?? 1;
  const ps = paragraphs(isEmpty(el.html) ? '' : el.html, {}).map((p) => {
    const size = (r) => Math.max(100, Math.round(st.size * (r.k || 1) * 75));
    const rpr = (r, name) => `<a:${name} lang="en-US" sz="${size(r)}"${r.b || st.bold ? ' b="1"' : ' b="0"'}${r.i || st.italic ? ' i="1"' : ''}${r.u || st.under ? ' u="sng"' : ''}${r.s ? ' strike="sngStrike"' : ''}${st.caps ? ' cap="all"' : ''}${st.ls ? ` spc="${Math.round(st.ls * 75)}"` : ''}${r.sup ? ' baseline="30000"' : r.sub ? ' baseline="-25000"' : ''} dirty="0"><a:solidFill>${clr(sc.color(r.c || st.color), o)}</a:solidFill>${r.m ? `<a:highlight>${clr(sc.color(r.m))}</a:highlight>` : ''}${['latin', 'ea', 'cs'].map((k) => `<a:${k} typeface="${x(FONTS[sc.font(r.f || st.font)][0])}"/>`).join('')}${r.href && okLink(r.href) && !r.href.startsWith('#') ? `<a:hlinkClick r:id="${rel(RT + 'hyperlink', r.href, true)}"/>` : ''}</a:${name}>`;
    const ind = p.list ? Math.round(st.size * 1.2) : 0, lev = p.level || 0;
    const ppr = `<a:pPr algn="${al[p.align || st.align] || 'l'}"${p.list ? ` marL="${emu(ind * (lev + 1))}" indent="${-emu(ind)}"` : ' marL="0" indent="0"'}><a:lnSpc><a:spcPct val="${Math.round(st.lh * 83000)}"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef>${p.list === 'ol' ? '<a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod"/>' : p.list ? '<a:buFont typeface="Arial"/><a:buChar char="•"/>' : '<a:buNone/>'}</a:pPr>`;
    const runs = p.runs.map((r) => (r.br ? `<a:br>${rpr(r, 'rPr')}</a:br>` : r.t ? `<a:r>${rpr(r, 'rPr')}<a:t>${x(r.t)}</a:t></a:r>` : '')).join('');
    return `<a:p>${ppr}${runs}${rpr(p.runs[p.runs.length - 1] || {}, 'endParaRPr').replace(/<a:hlinkClick[^>]*>/, '')}</a:p>`;
  }).join('');
  return `<${tag}><a:bodyPr wrap="square" lIns="${pad}" tIns="${pad}" rIns="${pad}" bIns="${pad}" anchor="${{ top: 't', middle: 'ctr', bottom: 'b' }[st.va] || 't'}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${ps}</${tag}>`;
}

/** media: src -> {name, blob, w, h} (see files.js) */
export async function exportPptx(deck, ctx, media) {
  const files = [], slides = deck.order(), types = new Set(['png', 'jpeg']);
  const slideXml = (s) => {
    const sc = slideContext(ctx, s.d), d = expandSlide(s.d, sc), rels = [], cache = {};
    const rel = (type, target, ext) => (cache[type + target] ||= (rels.push(`<Relationship Id="rId${rels.length + 1}" Type="${type}" Target="${x(target)}"${ext ? ' TargetMode="External"' : ''}/>`), 'rId' + rels.length));
    rel(RT + 'slideLayout', '../slideLayouts/slideLayout1.xml');
    const pic = (src) => { const m = media.get(src); return m ? { id: rel(RT + 'image', '../media/' + m.name), ...m } : null; };
    let id = 2;
    const link = (el) => (el.link && okLink(el.link) ? (el.link.startsWith('#s:') ? (() => { const i = slides.findIndex((q) => q.sid === el.link.slice(3)); return i < 0 ? '' : `<a:hlinkClick r:id="${rel(RT + 'slide', `slide${i + 1}.xml`)}" action="ppaction://hlinksldjump"/>`; })() : `<a:hlinkClick r:id="${rel(RT + 'hyperlink', el.link, true)}"/>`) : '');
    const nv = (el, name) => `<p:cNvPr id="${id++}" name="${x(name)}"${el.alt ? ` descr="${x(el.alt)}"` : ''}>${link(el)}</p:cNvPr>`;
    const one = (el) => {
      const o = el.o ?? 1;
      if (el.t === 'shape' && el.shape === 'line') {
        const sw = el.sw ?? 3 * sc.s;
        return `<p:cxnSp><p:nvCxnSpPr>${nv(el, 'Line')}<p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrm({ ...el, y: el.y + el.h / 2, h: 0 })}<a:prstGeom prst="line"><a:avLst/></a:prstGeom>${lineXml(el, sc, sw, el.stroke || el.fill || '@fg')}</p:spPr></p:cxnSp>`;
      }
      if (el.t === 'shape' || el.t === 'text') {
        const sw = el.stroke || el.t === 'shape' ? el.sw || 0 : 0;
        return `<p:sp><p:nvSpPr>${nv(el, el.t === 'text' ? 'Text' : 'Shape')}<p:cNvSpPr${el.t === 'text' ? ' txBox="1"' : ''}/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(el)}${geomXml(el.t === 'text' ? 'rect' : el.shape || 'rect', el.w, el.h, el.rad || 0, el.cmds, el.open)}${fillXml(el.fill, sc, o)}${lineXml(el, sc, sw, el.stroke || '@fg')}${shadow(el.shadow)}</p:spPr>${body(el, sc, rel)}</p:sp>`;
      }
      const m = pic(el.t === 'video' ? el.poster : el.src);
      if (!m) return `<p:sp><p:nvSpPr>${nv(el, 'Picture')}<p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(el)}${geomXml('rect', el.w, el.h, el.rad || 0)}${fillXml(el.t === 'video' ? '#14181b' : '@surface', sc, o)}<a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
      let q = el, crop = '';
      if (el.fit === 'contain') { const f = Math.min(el.w / m.w, el.h / m.h), w = m.w * f, h = m.h * f; q = { ...el, x: el.x + (el.w - w) * (el.fx ?? .5), y: el.y + (el.h - h) * (el.fy ?? .5), w, h }; } else {
        const f = Math.max(el.w / m.w, el.h / m.h), z = el.zoom || 1, fx = el.fx ?? .5, fy = el.fy ?? .5, iw = m.w * f * z, ih = m.h * f * z, ox = fx * el.w + ((el.w - m.w * f) * fx - fx * el.w) * z, oy = fy * el.h + ((el.h - m.h * f) * fy - fy * el.h) * z;
        const c = (v) => Math.round(Math.max(0, v) * 100000);
        crop = `<a:srcRect l="${c(-ox / iw)}" t="${c(-oy / ih)}" r="${c((iw + ox - el.w) / iw)}" b="${c((ih + oy - el.h) / ih)}"/>`;
      }
      const vurl = el.t === 'video' && videoSrc(el);
      const e2 = vurl && okLink(vurl) && !el.link ? { ...q, link: vurl } : q;
      return `<p:pic><p:nvPicPr>${nv(e2, 'Picture')}<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${m.id}">${o < 1 ? `<a:alphaModFix amt="${Math.round(o * 100000)}"/>` : ''}</a:blip>${crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(q)}${geomXml(el.mask || 'rect', q.w, q.h, el.rad || 0)}${el.sw && el.stroke ? lineXml(el, sc, el.sw, el.stroke) : ''}${shadow(el.shadow)}</p:spPr></p:pic>`;
    };
    const { under, over } = decorOf(d, sc, deck.index(s.sid), deck.slides.size), b = sc.bg;
    let bg, dim = '';
    if (b.t === 'g') bg = fillXml(`g|${b.ang ?? 135}|${b.a}|${b.b}`, sc);
    else if (b.t === 'i' && pic(b.src)) {
      const m = pic(b.src), f = Math.max(ctx.W / m.w, ctx.H / m.h), cx = (1 - ctx.W / (m.w * f)), cy = (1 - ctx.H / (m.h * f));
      bg = `<a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${m.id}"/><a:srcRect l="${Math.round(cx * (b.fx ?? .5) * 1e5)}" r="${Math.round(cx * (1 - (b.fx ?? .5)) * 1e5)}" t="${Math.round(cy * (b.fy ?? .5) * 1e5)}" b="${Math.round(cy * (1 - (b.fy ?? .5)) * 1e5)}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>`;
      if (b.dim) dim = one({ t: 'shape', shape: 'rect', x: 0, y: 0, w: ctx.W, h: ctx.H, fill: '@bg', o: b.dim });
    } else bg = fillXml(b.c || '@bg', sc);
    const tr = d.tr || deck.meta.opts.tr, trans = { fade: '<p:transition spd="med"><p:fade/></p:transition>', slide: '<p:transition spd="med"><p:cover dir="l"/></p:transition>', push: '<p:transition spd="med"><p:push dir="l"/></p:transition>', zoom: '<p:transition spd="med"><p:zoom/></p:transition>' }[tr] || '';
    const xml = `${XML}<p:sld ${NS}${d.hide ? ' show="0"' : ''}><p:cSld><p:bg><p:bgPr>${bg}<a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${dim}${[...under, ...sorted(d), ...over].map(one).join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${trans}</p:sld>`;
    return { xml, rels, rel };
  };
  const relFile = (list) => `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.join('')}</Relationships>`;
  const hasNotes = slides.some((s) => s.d.notes);
  slides.forEach((s, i) => {
    const r = slideXml(s);
    if (s.d.notes) {
      r.rel(RT + 'notesSlide', `../notesSlides/notesSlide${i + 1}.xml`);
      files.push([`ppt/notesSlides/notesSlide${i + 1}.xml`, `${XML}<p:notes ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${s.d.notes.split('\n').map((l) => `<a:p><a:r><a:rPr lang="en-US"/><a:t>${x(l)}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`],
        [`ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`, relFile([`<Relationship Id="rId1" Type="${RT}notesMaster" Target="../notesMasters/notesMaster1.xml"/>`, `<Relationship Id="rId2" Type="${RT}slide" Target="../slides/slide${i + 1}.xml"/>`])]);
    }
    files.push([`ppt/slides/slide${i + 1}.xml`, r.xml], [`ppt/slides/_rels/slide${i + 1}.xml.rels`, relFile(r.rels)]);
  });
  for (const m of media.values()) { types.add(m.name.split('.').pop()); files.push(['ppt/media/' + m.name, m.blob]); }
  const c = ctx.variant('content').colors, F = (k) => FONTS[ctx.fonts[k]][0], sys = (n, h) => `<a:${n}><a:srgbClr val="${h.slice(1, 7).toUpperCase()}"/></a:${n}>`;
  const theme = `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${x(ctx.def.name)}"><a:themeElements><a:clrScheme name="SavPresentations">${sys('dk1', c.fg)}${sys('lt1', c.bg)}${sys('dk2', c.muted)}${sys('lt2', c.surface)}${sys('accent1', c.accent)}${sys('accent2', c.accent2)}${sys('accent3', c.muted)}${sys('accent4', c.accent)}${sys('accent5', c.accent2)}${sys('accent6', c.fg)}${sys('hlink', c.accent)}${sys('folHlink', c.muted)}</a:clrScheme><a:fontScheme name="SavPresentations"><a:majorFont><a:latin typeface="${F('head')}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${F('body')}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst>${'<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${'<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'.repeat(3)}</a:lnStyleLst><a:effectStyleLst>${'<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${'<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
  const tree = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree>', map = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';
  const bgx = '<p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>';
  const n = slides.length;
  const prels = [`<Relationship Id="rId1" Type="${RT}slideMaster" Target="slideMasters/slideMaster1.xml"/>`, ...slides.map((s, i) => `<Relationship Id="rId${i + 2}" Type="${RT}slide" Target="slides/slide${i + 1}.xml"/>`), `<Relationship Id="rId${n + 2}" Type="${RT}theme" Target="theme/theme1.xml"/>`];
  if (hasNotes) prels.push(`<Relationship Id="rId${n + 3}" Type="${RT}notesMaster" Target="notesMasters/notesMaster1.xml"/>`);
  files.unshift(['[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[...types].map((e) => `<Default Extension="${e}" ContentType="image/${e === 'jpg' ? 'jpeg' : e}"/>`).join('')}<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides.map((s, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>${s.d.notes ? `<Override PartName="/ppt/notesSlides/notesSlide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>` : ''}`).join('')}${hasNotes ? '<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/><Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' : ''}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ['_rels/.rels', relFile([`<Relationship Id="rId1" Type="${RT}officeDocument" Target="ppt/presentation.xml"/>`, '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'])],
    ['docProps/core.xml', `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(deck.title)}</dc:title><dc:creator>SavPresentations</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`],
    ['ppt/presentation.xml', `${XML}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>${hasNotes ? `<p:notesMasterIdLst><p:notesMasterId r:id="rId${n + 3}"/></p:notesMasterIdLst>` : ''}<p:sldIdLst>${slides.map((s, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${emu(ctx.W)}" cy="${emu(ctx.H)}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', relFile(prels)],
    ['ppt/slideMasters/slideMaster1.xml', `${XML}<p:sldMaster ${NS}><p:cSld>${bgx}${tree}</p:cSld>${map}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', relFile([`<Relationship Id="rId1" Type="${RT}slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`, `<Relationship Id="rId2" Type="${RT}theme" Target="../theme/theme1.xml"/>`])],
    ['ppt/slideLayouts/slideLayout1.xml', `${XML}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank">${tree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', relFile([`<Relationship Id="rId1" Type="${RT}slideMaster" Target="../slideMasters/slideMaster1.xml"/>`])], ['ppt/theme/theme1.xml', theme]);
  if (hasNotes) files.push(['ppt/notesMasters/notesMaster1.xml', `${XML}<p:notesMaster ${NS}><p:cSld>${bgx}${tree}</p:cSld>${map}</p:notesMaster>`], ['ppt/notesMasters/_rels/notesMaster1.xml.rels', relFile([`<Relationship Id="rId1" Type="${RT}theme" Target="../theme/theme2.xml"/>`])], ['ppt/theme/theme2.xml', theme]);
  return zip(files, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
}
