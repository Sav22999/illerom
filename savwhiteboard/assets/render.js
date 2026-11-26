/**
 * Drawing the board as SVG: each item becomes the same markup on screen and in the files (SVG, PNG and PDF are made from
 * it), so what is downloaded is what was seen. The watermark is an SVG pattern; the grain of the pencil and the shadow of
 * the notes are filters.
 */
import { FONTS, isDark, mediaUrl, patternColor } from './model.js';
import { LINE, bounds, centerline, layoutNote, layoutText, outline, shapePoints, union } from './ink.js';

export const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f = (n) => Math.round(n * 100) / 100;

export const DEFS = `<filter id="wb-grain" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.25" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>`
  + `<filter id="wb-shadow" x="-10%" y="-10%" width="125%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity=".18"/></filter>`;

function arrowHead(i) {
  const x2 = i.x + i.w, y2 = i.y + i.h, a = Math.atan2(i.h, i.w), L = Math.max(10, i.s * 3.2), W = .48;
  const p1 = [x2 - L * Math.cos(a - W), y2 - L * Math.sin(a - W)], p2 = [x2 - L * Math.cos(a + W), y2 - L * Math.sin(a + W)];
  return `<path d="M${f(p1[0])} ${f(p1[1])}L${f(x2)} ${f(y2)}L${f(p2[0])} ${f(p2[1])}" fill="none" stroke="${i.c}" stroke-width="${i.s}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** The markup of one item. dark: the board is dark (the highlighter lights up instead of darkening). */
export function itemSVG(i, dark = false) {
  switch (i.t) {
    case 'stroke':
      if (i.tool === 'marker') return `<path d="${centerline(i)}" fill="none" stroke="${i.c}" stroke-width="${i.s}" stroke-linecap="round" stroke-linejoin="round" opacity="${dark ? .55 : .45}" style="mix-blend-mode:${dark ? 'screen' : 'multiply'}"/>`;
      if (i.tool === 'pencil') return `<path d="${outline(i)}" fill="${i.c}" opacity=".9" filter="url(#wb-grain)"/>`;
      return `<path d="${outline(i)}" fill="${i.c}"/>`;
    case 'shape': {
      const st = `stroke="${i.c}" stroke-width="${i.s}" stroke-linejoin="round" stroke-linecap="round"${i.d ? ` stroke-dasharray="${f(i.s * 2.6)} ${f(i.s * 2.2)}"` : ''}`, fill = i.f || 'none';
      if (i.k === 'line' || i.k === 'arrow') return `<g><path d="M${f(i.x)} ${f(i.y)}L${f(i.x + i.w)} ${f(i.y + i.h)}" fill="none" ${st}/>${i.k === 'arrow' ? arrowHead(i) : ''}</g>`;
      if (i.k === 'rect') return `<rect x="${f(i.x)}" y="${f(i.y)}" width="${f(i.w)}" height="${f(i.h)}" rx="${f(Math.min(i.w, i.h) * .06)}" fill="${fill}" ${st}/>`;
      if (i.k === 'ellipse') return `<ellipse cx="${f(i.x + i.w / 2)}" cy="${f(i.y + i.h / 2)}" rx="${f(i.w / 2)}" ry="${f(i.h / 2)}" fill="${fill}" ${st}/>`;
      return `<path d="M${shapePoints(i).map((p) => f(p[0]) + ' ' + f(p[1])).join('L')}Z" fill="${fill}" ${st}/>`;
    }
    case 'text': {
      const m = layoutText(i), ax = i.al === 'center' ? i.x + m.w / 2 : i.al === 'right' ? i.x + m.w : i.x, anchor = i.al === 'center' ? 'middle' : i.al === 'right' ? 'end' : 'start';
      const lines = m.lines.map((l, n) => `<tspan x="${f(ax)}" y="${f(i.y + i.fs * (.92 + n * LINE))}">${esc(l) || ' '}</tspan>`).join('');
      return `<text font-family="${esc(FONTS[i.ff] || FONTS.sans)}" font-size="${i.fs}" font-weight="${i.b ? 700 : 400}" fill="${i.c}" text-anchor="${anchor}" xml:space="preserve">${lines}</text>`;
    }
    case 'note': {
      const m = layoutNote(i), lines = m.lines.map((l, n) => `<tspan x="${f(i.x + m.pad)}" y="${f(i.y + m.pad + i.fs * (.92 + n * LINE))}">${esc(l) || ' '}</tspan>`).join('');
      return `<g><rect x="${f(i.x)}" y="${f(i.y)}" width="${f(i.w)}" height="${f(i.h)}" rx="${f(Math.min(i.w, i.h) * .03)}" fill="${i.f}" filter="url(#wb-shadow)"/>`
        + `<text font-family="${esc(FONTS.sans)}" font-size="${i.fs}" fill="${i.c}" xml:space="preserve">${lines}</text></g>`;
    }
    case 'image':
      return `<image href="${esc(mediaUrl(i.src))}" x="${f(i.x)}" y="${f(i.y)}" width="${f(i.w)}" height="${f(i.h)}" preserveAspectRatio="none"/>`;
  }
  return '';
}

/**
 * The watermark as a <pattern>. unit: how many units of the pattern make one pixel of the result, so dots and lines keep
 * a size that reads at any zoom. transform: where the pattern sits (on screen it follows the view).
 */
export function patternSVG(id, s, gap, unit = 1, transform = '') {
  const c = patternColor(s), tr = transform ? ` patternTransform="${transform}"` : '';
  if (s.pat === 'none') return '';
  if (s.pat === 'dots') return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(gap)}" height="${f(gap)}"${tr}><circle cx="${f(gap / 2)}" cy="${f(gap / 2)}" r="${f(1.5 * unit)}" fill="${c}"/></pattern>`;
  if (s.pat === 'grid') return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(gap)}" height="${f(gap)}"${tr}><path d="M${f(gap)} 0V${f(gap)}H0" fill="none" stroke="${c}" stroke-width="${f(unit)}"/></pattern>`;
  if (s.pat === 'lines') return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(gap)}" height="${f(gap)}"${tr}><path d="M0 ${f(gap - unit / 2)}H${f(gap)}" stroke="${c}" stroke-width="${f(unit)}"/></pattern>`;
  if (s.pat === 'staff' || s.pat === 'tab') { // five lines of a staff, six of a tablature, then a space; gap is the height of one
    const n = s.pat === 'staff' ? 5 : 6, sp = gap / (n - 1), P = gap * (s.pat === 'staff' ? 2.5 : 2.2);
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(gap)}" height="${f(P)}"${tr}><path d="${Array.from({ length: n }, (_, i) => `M0 ${f(gap * .6 + i * sp)}H${f(gap)}`).join('')}" stroke="${c}" stroke-width="${f(unit)}"/></pattern>`;
  }
  if (s.pat === 'mm') { // graph paper: a fine line every fifth of the big square, the big square stronger
    const m = gap / 5, fine = [1, 2, 3, 4].map((i) => `M${f(i * m)} 0V${f(gap)}M0 ${f(i * m)}H${f(gap)}`).join('');
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(gap)}" height="${f(gap)}"${tr}><path d="${fine}" stroke="${c}" stroke-width="${f(unit * .5)}" stroke-opacity=".7"/><path d="M${f(gap)} 0V${f(gap)}H0" fill="none" stroke="${c}" stroke-width="${f(unit * 1.2)}"/></pattern>`;
  }
  if (s.pat === 'hex') { // hexagons with flat tops, gap is the side
    const a = gap, hx = a * Math.sqrt(3);
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(3 * a)}" height="${f(hx)}"${tr}><path d="M0 ${f(hx / 2)}L${f(a / 2)} 0H${f(1.5 * a)}L${f(2 * a)} ${f(hx / 2)}L${f(1.5 * a)} ${f(hx)}H${f(a / 2)}ZM${f(2 * a)} ${f(hx / 2)}H${f(3 * a)}" fill="none" stroke="${c}" stroke-width="${f(unit)}"/></pattern>`;
  }
  const hh = gap * Math.sqrt(3); // isometric: dots on triangles
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(gap)}" height="${f(hh)}"${tr}>${[[0, 0], [gap, 0], [gap / 2, hh / 2], [0, hh], [gap, hh]].map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1.5 * unit)}" fill="${c}"/>`).join('')}</pattern>`;
}

/**
 * The whole board as one SVG file: the box of what is on it with a margin, the background and the watermark, every item.
 * fonts: CSS with the typefaces inside (for PNG and PDF, whose pictures cannot load files).
 */
export function boardSVG(items, s, { pad = 48, fonts = '', box } = {}) {
  const b = box || union(items) || { x: 0, y: 0, w: 800, h: 500 }, x = Math.floor(b.x - pad), y = Math.floor(b.y - pad), w = Math.ceil(b.w + 2 * pad), hh = Math.ceil(b.h + 2 * pad), dark = isDark(s.bg);
  const pat = patternSVG('wb-pat', s, s.gap, 1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}" viewBox="${x} ${y} ${w} ${hh}">`
    + `<defs>${fonts ? `<style>${fonts}</style>` : ''}${DEFS}${pat}</defs>`
    + `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${s.bg}"/>${pat ? `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="url(#wb-pat)"/>` : ''}`
    + `<g style="isolation:isolate">${items.map((i) => itemSVG(i, dark)).join('')}</g></svg>`;
}

/** The box of an item on screen, for the overlay (selection). */
export const boxOf = bounds;
