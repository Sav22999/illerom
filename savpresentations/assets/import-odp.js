/** Opening an ODP (LibreOffice Impress): text boxes, shapes, pictures, backgrounds and notes, with their place and main formatting (as import-pptx.js). */
import {uid, uploadPicture} from './core.js';
import {esc} from './richtext.js';

const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');
const kids = (n) => [...(n?.children || [])];
const att = (n, k) => n?.getAttribute(k) || '';
/** A length of OpenDocument (cm, mm, in, pt) in CSS px. */
const px = (v) => { const n = parseFloat(v); if (!v || isNaN(n)) return 0; return /cm$/.test(v) ? n * 37.7953 : /mm$/.test(v) ? n * 3.77953 : /in$/.test(v) ? n * 96 : /pt$/.test(v) ? n * 4 / 3 : /px$/.test(v) ? n : n * 37.7953; };
const SHAPES = {ellipse: 'ellipse', circle: 'ellipse', 'round-rectangle': 'round', 'flowchart-alternate-process': 'round', 'isosceles-triangle': 'triangle', 'right-triangle': 'rtriangle', diamond: 'diamond', 'flowchart-decision': 'diamond', pentagon: 'pentagon', hexagon: 'hexagon', octagon: 'octagon', parallelogram: 'parallelogram', trapezoid: 'trapezoid', star5: 'star', star4: 'star4', 'right-arrow': 'arrow', 'left-right-arrow': 'arrow2', chevron: 'chevron', heart: 'heart', cloud: 'cloud', 'round-rectangular-callout': 'speech', 'rectangular-callout': 'speech', ring: 'ring', moon: 'moon'};

export async function readOdp(z, name) {
  const content = parse(await z.text('content.xml') || ''), styles = parse(await z.text('styles.xml') || '<x/>');
  const body = content.getElementsByTagName('office:presentation')[0];
  if (!body) throw new Error('unknown file');
  // styles: graphic (fill, line, text), paragraph and text, following the parents
  const S = {};
  for (const root of [styles, content]) for (const st of root.getElementsByTagName('style:style')) {
    const gp = st.getElementsByTagName('style:graphic-properties')[0], tp = st.getElementsByTagName('style:text-properties')[0], pp = st.getElementsByTagName('style:paragraph-properties')[0], dp = st.getElementsByTagName('style:drawing-page-properties')[0];
    S[att(st, 'style:name')] = {
      parent: att(st, 'style:parent-style-name'),
      fill: gp && att(gp, 'draw:fill') !== 'none' ? att(gp, 'draw:fill-color') : gp && att(gp, 'draw:fill') === 'none' ? 'none' : '',
      stroke: gp && att(gp, 'draw:stroke') !== 'none' ? att(gp, 'svg:stroke-color') : gp && att(gp, 'draw:stroke') === 'none' ? 'none' : '',
      sw: gp && px(att(gp, 'svg:stroke-width')), va: gp && att(gp, 'draw:textarea-vertical-align'),
      size: tp && att(tp, 'fo:font-size'), color: tp && att(tp, 'fo:color'), b: tp && /bold|[6-9]00/.test(att(tp, 'fo:font-weight')), i: tp && att(tp, 'fo:font-style') === 'italic',
      u: tp && att(tp, 'style:text-underline-style') && att(tp, 'style:text-underline-style') !== 'none', s: tp && att(tp, 'style:text-line-through-style') && att(tp, 'style:text-line-through-style') !== 'none',
      align: pp && att(pp, 'fo:text-align'), bg: dp && att(dp, 'draw:fill') === 'solid' ? att(dp, 'draw:fill-color') : '', bgImg: dp && att(dp, 'draw:fill') === 'bitmap' ? att(dp, 'draw:fill-image-name') : '',
    };
  }
  const up = (n, k) => { for (let s = n, i = 0; s && S[s] && i < 10; s = S[s].parent, i++) if (S[s][k]) return S[s][k]; return ''; };
  const fills = {};
  for (const f of styles.getElementsByTagName('draw:fill-image')) fills[att(f, 'draw:name')] = att(f, 'xlink:href');
  // the size of the slides: the page layout of the first master page
  const mp = styles.getElementsByTagName('style:master-page')[0], plName = att(mp, 'style:page-layout-name');
  const pl = [...styles.getElementsByTagName('style:page-layout')].find((p) => att(p, 'style:name') === plName)?.getElementsByTagName('style:page-layout-properties')[0];
  const W = Math.round(px(att(pl, 'fo:page-width')) || 1280), H = Math.round(px(att(pl, 'fo:page-height')) || 720);
  const k = 1; // the slide keeps its own size (the format of the presentation follows it)
  const cache = new Map();
  const upload = (href) => {
    if (!href || /^https?:/.test(href)) return null;
    const path = href.replace(/^\.\//, '');
    if (!cache.has(path)) cache.set(path, (async () => {
      const b = await z.bytes(path), ext = path.split('.').pop().toLowerCase();
      if (!b || !/^(png|jpe?g|gif|webp)$/.test(ext)) return null;
      try { return await uploadPicture(new File([b], path.split('/').pop(), {type: 'image/' + ext.replace('jpg', 'jpeg')})); } catch { return null; }
    })());
    return cache.get(path);
  };
  const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c.toLowerCase() : '');
  /** The paragraphs of a text box: html of SavPresentations, with the size and colour of the first words. */
  const textOf = (box, frameStyle) => {
    let html = '', size = 0, color = '', align = '', bold = true, any = false;
    const run = (n, inherited) => {
      let out = '';
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { if (c.data) { any = true; out += esc(c.data); } continue; }
        if (c.nodeType !== 1) continue;
        const nm = c.nodeName;
        if (nm === 'text:s') out += ' '.repeat(+att(c, 'text:c') || 1);
        else if (nm === 'text:tab') out += ' ';
        else if (nm === 'text:line-break') out += '<br>';
        else if (nm === 'text:a') out += /^https?:/i.test(att(c, 'xlink:href')) ? `<a href="${esc(att(c, 'xlink:href'))}">${run(c, inherited)}</a>` : run(c, inherited);
        else if (nm === 'text:span') {
          const st = att(c, 'text:style-name'), sz = px(up(st, 'size')), col = hex(up(st, 'color'));
          let s = run(c, st);
          if (sz && sz > size) size = sz;
          if (!color && col) color = col;
          if (!up(st, 'b')) bold = false;
          if (col && col !== color) s = `<span data-c="${col}">${s}</span>`;
          if (up(st, 'b')) s = `<b>${s}</b>`;
          if (up(st, 'i')) s = `<i>${s}</i>`;
          if (up(st, 'u')) s = `<u>${s}</u>`;
          if (up(st, 's')) s = `<s>${s}</s>`;
          out += s;
        } else out += run(c, inherited);
      }
      return out;
    };
    const para = (p) => {
      const st = att(p, 'text:style-name'), al = {center: 'center', end: 'right', right: 'right', justify: 'justify'}[up(st, 'align')] || '';
      if (al && !align) align = al;
      const sz = px(up(st, 'size'));
      if (sz && sz > size) size = sz;
      if (!color) color = hex(up(st, 'color'));
      return {al, inner: run(p, st)};
    };
    const list = (l, ordered) => {
      let out = `<${ordered ? 'ol' : 'ul'}>`;
      for (const item of kids(l).filter((c) => c.nodeName === 'text:list-item')) for (const c of kids(item)) {
        if (c.nodeName === 'text:p' || c.nodeName === 'text:h') { const p = para(c); if (p.inner) out += `<li>${p.inner}</li>`; } else if (c.nodeName === 'text:list') out += list(c, ordered).replace(/^<[uo]l>|<\/[uo]l>$/g, '');
      }
      return out + `</${ordered ? 'ol' : 'ul'}>`;
    };
    const lstyles = {};
    for (const ls of [...styles.getElementsByTagName('text:list-style'), ...content.getElementsByTagName('text:list-style')]) lstyles[att(ls, 'style:name')] = kids(ls)[0]?.nodeName === 'text:list-level-style-number';
    for (const c of kids(box)) {
      if (c.nodeName === 'text:p' || c.nodeName === 'text:h') { const p = para(c); html += `<p${p.al && p.al !== align && p.al !== 'justify' ? ` data-a="${p.al}"` : ''}>${p.inner}</p>`; }
      else if (c.nodeName === 'text:list') html += list(c, lstyles[att(c, 'text:style-name')] ?? false);
    }
    html = html.replace(/(<p><\/p>)+$/, '').replace(/^(<p><\/p>)+/, '');
    if (!size) size = px(up(frameStyle, 'size'));
    if (!color) color = hex(up(frameStyle, 'color'));
    return {html: any ? html : '', size, color, align, bold: any && bold};
  };
  const slides = [];
  for (const page of kids(body).filter((n) => n.nodeName === 'draw:page')) {
    const els = {};
    let zi = 0, bg = null;
    const ps = att(page, 'draw:style-name');
    if (hex(up(ps, 'bg'))) bg = {t: 'c', c: hex(up(ps, 'bg'))};
    else if (up(ps, 'bgImg') && fills[up(ps, 'bgImg')]) { const m = await upload(fills[up(ps, 'bgImg')]); if (m) bg = {t: 'i', src: m.src, dim: 0}; }
    const walk = async (node, dx = 0, dy = 0) => {
      for (const n of kids(node)) {
        const nm = n.nodeName;
        if (nm === 'draw:g') { await walk(n, dx, dy); continue; }
        if (!['draw:frame', 'draw:custom-shape', 'draw:rect', 'draw:ellipse', 'draw:line'].includes(nm)) continue;
        const cls = att(n, 'presentation:class');
        if (cls === 'page-number' || cls === 'footer' || cls === 'date-time' || cls === 'header') continue;
        const st = att(n, 'presentation:style-name') || att(n, 'draw:style-name');
        const r = (v) => Math.round(v * k * 10) / 10;
        let el;
        if (nm === 'draw:line') {
          const x1 = px(att(n, 'svg:x1')), y1 = px(att(n, 'svg:y1')), x2 = px(att(n, 'svg:x2')), y2 = px(att(n, 'svg:y2')), len = Math.hypot(x2 - x1, y2 - y1), a = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
          el = {t: 'shape', shape: 'line', x: r((x1 + x2) / 2 - len / 2 + dx), y: r((y1 + y2) / 2 - 12 + dy), w: r(Math.max(2, len)), h: 24, stroke: hex(up(st, 'stroke')) || '@fg', sw: Math.max(1, Math.round(up(st, 'sw') || 2)), z: ++zi};
          if (Math.abs(a) > .5) el.r = Math.round(a * 10) / 10;
          els[uid()] = el;
          continue;
        }
        const box = {x: r(px(att(n, 'svg:x')) + dx), y: r(px(att(n, 'svg:y')) + dy), w: r(Math.max(1, px(att(n, 'svg:width')))), h: r(Math.max(1, px(att(n, 'svg:height'))))};
        const img = nm === 'draw:frame' && n.getElementsByTagName('draw:image')[0], tb = nm === 'draw:frame' ? n.getElementsByTagName('draw:text-box')[0] : n;
        if (img && !tb) {
          const m = await upload(att(img, 'xlink:href'));
          if (!m) continue;
          els[uid()] = {...box, z: ++zi, t: 'image', src: m.src, fit: 'cover', fx: .5, fy: .5, alt: n.getElementsByTagName('svg:desc')[0]?.textContent || ''};
          continue;
        }
        const t = tb ? textOf(tb, st) : {html: ''};
        const shapeKind = nm === 'draw:ellipse' ? 'ellipse' : nm === 'draw:custom-shape' ? SHAPES[att(n.getElementsByTagName('draw:enhanced-geometry')[0], 'draw:type')] || 'rect' : 'rect';
        const fill = hex(up(st, 'fill')), stroke = hex(up(st, 'stroke'));
        const isText = nm === 'draw:frame' || (!fill && !stroke && t.html);
        if (!isText && !fill && !stroke && !t.html) continue;
        el = {...box, z: ++zi, ...(isText ? {t: 'text'} : {t: 'shape', shape: shapeKind, fill: fill || ''})};
        if (!isText && stroke) { el.stroke = stroke; el.sw = Math.max(1, Math.round(up(st, 'sw') || 1)); }
        if (isText && fill) el.fill = fill;
        if (t.html) {
          const title = cls === 'title', sub = cls === 'subtitle';
          Object.assign(el, {
            role: title ? 'heading' : 'body', html: t.html,
            size: Math.round((t.size || (title ? 44 * 4 / 3 : sub ? 32 * 4 / 3 : 18 * 4 / 3)) * k * 10) / 10,
            color: t.color || '@fg', align: t.align || (sub || !isText ? 'center' : 'left'),
            va: {middle: 'middle', bottom: 'bottom'}[up(st, 'va')] || (isText ? 'top' : 'middle'), lh: 1.2, bold: t.bold ? 1 : 0, pad: 9,
          });
        } else if (isText) continue; // an empty placeholder
        els[uid()] = el;
      }
    };
    await walk(page);
    const notesBox = page.getElementsByTagName('presentation:notes')[0];
    const notes = notesBox ? [...notesBox.getElementsByTagName('draw:text-box')].map((b) => [...b.getElementsByTagName('text:p')].map((p) => p.textContent).join('\n')).join('\n').trim() : '';
    slides.push({sid: uid(), pos: slides.length + 1, d: {layout: 'blank', variant: 'plain', els, ...(bg ? {bg} : {}), ...(notes ? {notes} : {})}});
  }
  if (!slides.length) throw new Error('unknown file');
  return {
    title: name.replace(/\.odp$/i, ''),
    meta: {format: {id: Math.abs(W / H - 16 / 9) < .02 ? '16-9' : Math.abs(W / H - 4 / 3) < .02 ? '4-3' : 'custom', w: Math.max(200, Math.min(4000, W)), h: Math.max(200, Math.min(4000, H))}, theme: {id: 'paper', colors: {bg: '#ffffff', fg: '#111111', accent: '#1f6feb', accent2: '#e8590c', surface: '#f3f4f6'}, fonts: {}}, opts: {}},
    slides,
  };
}
