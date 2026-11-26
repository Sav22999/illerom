/**
 * Drawing a sheet as SVG: each item becomes the same markup on screen, in the small pictures of the side and in the files
 * (PNG and the printed PDF are made from it), so what is downloaded is what was seen. The paper is an SVG pattern (with
 * the red margin of ruled paper and the columns of Cornell notes); the grain of the pencil is a filter. The typed text is
 * HTML: on screen it is a real editable layer, in pictures it goes inside a <foreignObject> with its own styles (docCSS).
 */
import { FONTS, isDark, marginColor, patternColor, textBox, marginX } from './model.js';
import { centerline, outline, shapePoints } from './ink.js';

export const NS = 'http://www.w3.org/2000/svg';
const f = (n) => Math.round(n * 100) / 100;

export const DEFS = `<filter id="nb-grain" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.25" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>`;

function arrowHead(i) {
  const x2 = i.x + i.w, y2 = i.y + i.h, a = Math.atan2(i.h, i.w), L = Math.max(8, i.s * 3.2), W = .48;
  const p1 = [x2 - L * Math.cos(a - W), y2 - L * Math.sin(a - W)], p2 = [x2 - L * Math.cos(a + W), y2 - L * Math.sin(a + W)];
  return `<path d="M${f(p1[0])} ${f(p1[1])}L${f(x2)} ${f(y2)}L${f(p2[0])} ${f(p2[1])}" fill="none" stroke="${i.c}" stroke-width="${i.s}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** The markup of one item. dark: the paper is dark (the highlighter lights up instead of darkening). */
export function itemSVG(i, dark = false) {
  switch (i.t) {
    case 'stroke':
      if (i.tool === 'marker') return `<path d="${centerline(i)}" fill="none" stroke="${i.c}" stroke-width="${i.s}" stroke-linecap="round" stroke-linejoin="round" opacity="${dark ? .55 : .42}" style="mix-blend-mode:${dark ? 'screen' : 'multiply'}"/>`;
      if (i.tool === 'pencil') return `<path d="${outline(i)}" fill="${i.c}" opacity=".9" filter="url(#nb-grain)"/>`;
      return `<path d="${outline(i)}" fill="${i.c}"/>`;
    case 'shape': {
      const st = `stroke="${i.c}" stroke-width="${i.s}" stroke-linejoin="round" stroke-linecap="round"${i.d ? ` stroke-dasharray="${f(i.s * 2.6)} ${f(i.s * 2.2)}"` : ''}`, fill = i.f || 'none';
      if (i.k === 'line' || i.k === 'arrow') return `<g><path d="M${f(i.x)} ${f(i.y)}L${f(i.x + i.w)} ${f(i.y + i.h)}" fill="none" ${st}/>${i.k === 'arrow' ? arrowHead(i) : ''}</g>`;
      if (i.k === 'rect') return `<rect x="${f(i.x)}" y="${f(i.y)}" width="${f(i.w)}" height="${f(i.h)}" rx="${f(Math.min(i.w, i.h) * .06)}" fill="${fill}" ${st}/>`;
      if (i.k === 'ellipse') return `<ellipse cx="${f(i.x + i.w / 2)}" cy="${f(i.y + i.h / 2)}" rx="${f(i.w / 2)}" ry="${f(i.h / 2)}" fill="${fill}" ${st}/>`;
      return `<path d="M${shapePoints(i).map((p) => f(p[0]) + ' ' + f(p[1])).join('L')}Z" fill="${fill}" ${st}/>`;
    }
    case 'image':
      return `<image href="${i.src}" x="${f(i.x)}" y="${f(i.y)}" width="${f(i.w)}" height="${f(i.h)}" preserveAspectRatio="none"/>`;
  }
  return '';
}

/**
 * The paper of a sheet: its colour, the watermark as a <pattern> and the lines that are drawn once (the margin of ruled
 * paper, the column and the summary of Cornell notes). unit: how thick a line of the paper is, in units of the page.
 */
export function paperSVG(id, sheet, W, H, unit = 1) {
  const s = sheet, c = patternColor(s), g = s.gap;
  let pat = '', extra = '';
  if (s.pat === 'dots') pat = `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(g)}" height="${f(g)}"><circle cx="${f(g / 2)}" cy="${f(g / 2)}" r="${f(1.3 * unit)}" fill="${c}"/></pattern>`;
  else if (s.pat === 'grid') pat = `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(g)}" height="${f(g)}"><path d="M${f(g)} 0V${f(g)}H0" fill="none" stroke="${c}" stroke-width="${f(unit * .8)}"/></pattern>`;
  else if (s.pat === 'lines' || s.pat === 'ruled' || s.pat === 'cornell') pat = `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(W)}" height="${f(g)}"><path d="M0 ${f(g - unit / 2)}H${f(W)}" stroke="${c}" stroke-width="${f(unit)}"/></pattern>`;
  else if (s.pat === 'iso') { const hh = g * Math.sqrt(3); pat = `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(g)}" height="${f(hh)}">${[[0, 0], [g, 0], [g / 2, hh / 2], [0, hh], [g, hh]].map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1.3 * unit)}" fill="${c}"/>`).join('')}</pattern>`; }
  else if (s.pat === 'mm') { const m = g / 5, fine = [1, 2, 3, 4].map((i) => `M${f(i * m)} 0V${f(g)}M0 ${f(i * m)}H${f(g)}`).join(''); pat = `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(g)}" height="${f(g)}"><path d="${fine}" stroke="${c}" stroke-width="${f(unit * .5)}" stroke-opacity=".7"/><path d="M${f(g)} 0V${f(g)}H0" fill="none" stroke="${c}" stroke-width="${f(unit * 1.1)}"/></pattern>`; }
  else if (s.pat === 'hex') { const a = g, hx = a * Math.sqrt(3); pat = `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(3 * a)}" height="${f(hx)}"><path d="M0 ${f(hx / 2)}L${f(a / 2)} 0H${f(1.5 * a)}L${f(2 * a)} ${f(hx / 2)}L${f(1.5 * a)} ${f(hx)}H${f(a / 2)}ZM${f(2 * a)} ${f(hx / 2)}H${f(3 * a)}" fill="none" stroke="${c}" stroke-width="${f(unit * .8)}"/></pattern>`; }
  else if (s.pat === 'staff' || s.pat === 'tab') {
    // staves (5 lines) or tablature (6) between margins, as in a music notebook; gap is the height of one staff
    const n = s.pat === 'staff' ? 5 : 6, sp = g / (n - 1), P = g * (s.pat === 'staff' ? 2.5 : 2.2), mx = Math.round(W * .07), y0 = Math.max(g, H * .06), y1 = H - Math.max(g * .8, H * .05);
    let d = '';
    for (let y = y0; y + g <= y1; y += P) for (let i = 0; i < n; i++) d += `M${mx} ${f(y + i * sp)}H${W - mx}`;
    extra = `<path d="${d}" stroke="${c}" stroke-width="${f(unit)}"/>`;
  }
  if (s.pat === 'ruled') extra = `<path d="M${marginX(W)} 0V${H}" stroke="${marginColor(s)}" stroke-width="${f(unit * 1.4)}"/>`;
  if (s.pat === 'cornell') { const x = Math.round(W * .3), y = Math.round(H * .8); extra = `<rect x="0" y="${y}" width="${W}" height="${H - y}" fill="${s.bg}"/><path d="M${x} 0V${y}M0 ${y}H${W}" stroke="${marginColor(s)}" stroke-width="${f(unit * 1.4)}"/>`; }
  return { defs: pat, body: `<rect width="${W}" height="${H}" fill="${s.bg}"/>${pat ? `<rect width="${W}" height="${H}" fill="url(#${id})"/>` : ''}${extra}` };
}

/**
 * The styles of the typed text of a sheet, as CSS for the rules under sel. The same rules make the editable layer on
 * screen (assets/notebook.js) and the text of pictures and print, so a line of text is always on a line of the paper.
 */
export function docCSS(sel, settings, sheet) {
  const b = textBox(settings, sheet), font = FONTS[settings.font] || FONTS.sans, ink = isDark(sheet.bg) ? '#f4f1e8' : '#1f1f22';
  const lh = b.lh, two = b.lined ? lh * 2 : Math.round(b.fs * 2.1), h1 = Math.round(b.fs * 1.75), h2 = Math.round(b.fs * 1.38), h3 = Math.round(b.fs * 1.16);
  return `${sel}{box-sizing:border-box;width:${b.W}px;height:${b.H}px;padding:${b.top}px ${b.right}px ${b.bottom}px ${b.left}px;margin:0;overflow:hidden;font:400 ${b.fs}px/${lh}px ${font};color:${ink};word-wrap:break-word;overflow-wrap:anywhere;white-space:pre-wrap;outline:none;-webkit-font-smoothing:antialiased}`
    + `${sel} p,${sel} div{margin:0}`
    + `${sel} h1{margin:0;font-size:${h1}px;line-height:${b.lined && h1 <= lh * 1.1 ? lh : two}px;font-weight:700;letter-spacing:-.01em}`
    + `${sel} h2{margin:0;font-size:${h2}px;line-height:${b.lined && h2 <= lh * 1.1 ? lh : two}px;font-weight:700}`
    + `${sel} h3{margin:0;font-size:${h3}px;line-height:${lh}px;font-weight:650}`
    + `${sel} ul,${sel} ol{margin:0;padding-left:${Math.round(b.fs * 1.6)}px}${sel} li{margin:0}`
    + `${sel} ul.chk{list-style:none;padding-left:${Math.round(b.fs * 1.7)}px}${sel} ul.chk>li{position:relative}`
    + `${sel} ul.chk>li::before{content:"";position:absolute;left:${-Math.round(b.fs * 1.45)}px;top:${f((lh - b.fs * .95) / 2)}px;width:${f(b.fs * .95)}px;height:${f(b.fs * .95)}px;box-sizing:border-box;border:${f(Math.max(1.2, b.fs * .09))}px solid currentColor;border-radius:${f(b.fs * .22)}px;opacity:.7;cursor:pointer}`
    + `${sel} ul.chk>li[data-checked="1"]{color:color-mix(in srgb,currentColor 55%,transparent);text-decoration:line-through}`
    + `${sel} ul.chk>li[data-checked="1"]::before{background:currentColor;opacity:.55;box-shadow:inset 0 0 0 ${f(b.fs * .16)}px ${sheet.bg}}`
    + `${sel} blockquote{margin:0;padding-left:${Math.round(b.fs * .9)}px;border-left:${f(Math.max(2, b.fs * .18))}px solid color-mix(in srgb,currentColor 30%,transparent);color:color-mix(in srgb,currentColor 78%,transparent)}`
    + `${sel} pre,${sel} code{font-family:${FONTS.mono};font-size:.9em}${sel} pre{margin:0;white-space:pre-wrap}`
    + `${sel} hr{border:0;margin:0;height:${lh}px;background:linear-gradient(currentColor,currentColor) center/100% 1px no-repeat;opacity:.35}`
    + `${sel} a{color:${isDark(sheet.bg) ? '#9fc7ff' : '#1d4e89'}}${sel} mark{color:inherit;border-radius:2px}`;
}

/**
 * A whole sheet as one SVG: paper, typed text and items. fonts: CSS with the typefaces inside (pictures cannot load
 * files). pad: the empty space around the sheet. The doc goes in a <foreignObject>, under the items drawn by hand.
 */
export function sheetSVG(settings, sheet, { fonts = '', doc = true, id = 'sp' } = {}) {
  const [W, H] = [textBox(settings, sheet).W, textBox(settings, sheet).H], dark = isDark(sheet.bg), p = paperSVG(id + 'p', sheet, W, H);
  const text = doc && sheet.doc ? `<foreignObject x="0" y="0" width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml" class="${id}d">${xhtml(sheet.doc)}</div></foreignObject>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<defs>${text || fonts ? `<style>${fonts}${text ? docCSS('.' + id + 'd', settings, sheet) : ''}</style>` : ''}${DEFS}${p.defs}</defs>${p.body}${text}`
    + `<g style="isolation:isolate">${(sheet.items || []).map((i) => itemSVG(i, dark)).join('')}</g></svg>`;
}

/** HTML as XHTML, for the inside of a <foreignObject> in an SVG file (void tags closed, entities as characters). */
const ser = typeof XMLSerializer !== 'undefined' ? new XMLSerializer() : null;
const holder = document.createElement('template'); // inert: nothing inside loads or runs
export function xhtml(html) {
  holder.innerHTML = html;
  return [...holder.content.childNodes].map((n) => ser.serializeToString(n)).join('').replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
}
