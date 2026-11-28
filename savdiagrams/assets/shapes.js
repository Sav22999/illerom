/**
 * The geometry and the look of a diagram: every node and connector as SVG markup (the same in the editor, the small
 * picture of the home, PNG, SVG and PDF), where the ends of a connector are, the route it takes (straight, elbow, curve),
 * its heads, and the hit tests of the editor. No DOM here except a canvas to measure text.
 */
import { COMPART, FONTS, UNDER, isDark, parts } from './model.js';

export const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const R = (v) => Math.round(v * 100) / 100;
const DASHES = { dash: (s) => `${R(s * 4 + 2)} ${R(s * 3 + 2)}`, dot: (s) => `${R(Math.max(.6, s * .6))} ${R(s * 2 + 2)}` };

// ------------------------------------------------------------------ text

let ctx2d = null;
export const fontOf = (i, fs = i.fs) => `${i.i ? 'italic ' : ''}${i.b ? 700 : 400} ${fs}px ${FONTS[i.ff] || FONTS.sans}`;
export function measure(s, font) {
  ctx2d ||= document.createElement('canvas').getContext('2d');
  ctx2d.font = font;
  return ctx2d.measureText(s).width;
}
/** The lines of a text wrapped at a width (words first, then letters when one word alone is too long). */
export function wrap(s, font, width) {
  const out = [];
  for (const para of String(s || '').split('\n')) {
    if (width <= 0) { out.push(para); continue; }
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      if (!word) continue;
      const next = line + word;
      if (!line || measure(next.trimEnd(), font) <= width) { line = next; continue; }
      out.push(line.trimEnd());
      line = word.trimStart();
      while (line && measure(line, font) > width) { // a very long word: cut it
        let k = line.length;
        while (k > 1 && measure(line.slice(0, k), font) > width) k--;
        out.push(line.slice(0, k));
        line = line.slice(k);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

// ------------------------------------------------------------------ nodes

/** Where the text of a node goes (inside the shape, or under it for a person). */
export function textBox(n) {
  const { x, y, w, h } = n;
  if (UNDER.has(n.k)) return { x: x - 50, y: y + h + 4, w: w + 100, h: 0, under: true, al: 'center' };
  if (COMPART.has(n.k)) return { x, y, w, h, va: 'top', al: 'left' };
  switch (n.k) {
    case 'diamond': return { x: x + w * .18, y: y + h * .2, w: w * .64, h: h * .6 };
    case 'para': { const sk = Math.min(w * .2, h * .6); return { x: x + sk * .8, y, w: w - sk * 1.6, h }; }
    case 'cyl': { const ry = Math.min(h * .15, w * .25); return { x, y: y + ry * 2, w, h: h - ry * 2.6 }; }
    case 'doc': return { x, y, w, h: h * .86 };
    case 'note': return { x, y, w: w - Math.min(w, h) * .12, h };
    case 'ellipse': return { x: x + w * .12, y: y + h * .12, w: w * .76, h: h * .76 };
    case 'cloud': return { x: x + w * .16, y: y + h * .2, w: w * .68, h: h * .62 };
    case 'lifeline': return { x, y, w, h: lifeHead(n) };
    case 'frame': { const [tw, th] = frameTag(n); return { x, y, w: tw - 8, h: th, al: 'left' }; }
    case 'box': return { x, y, w, h: n.fs * 1.25 + 16 };
    case 'package': { const th = Math.min(22, h * .2); return { x, y: y + th, w, h: n.fs * 1.25 + 14, al: 'left' }; }
    case 'comp': { const k = Math.min(1, w / 100, h / 50); return { x, y, w: w - 26 * k, h }; }
    case 'cube': { const d = Math.min(w, h) * .15; return { x, y: y + d, w: w - d, h: h - d }; }
    case 'card': { const d = cardAvatar(n); return { x: d.x + d.r * 2 + 4, y, w: Math.max(10, x + w - d.x - d.r * 2 - 10), h }; }
    case 'track': return { x, y, w: Math.min(130, w * .25), h };
    case 'subproc': return { x, y, w, h: h - 14 };
    case 'lane': { const b = Math.min(36, w * .3); return { x: x + b / 2 - h / 2, y: y + h / 2 - b / 2, w: h, h: b, rot: [x + b / 2, y + h / 2] }; }
    case 'vlane': return { x, y, w, h: Math.min(36, h * .3) };
    default: return { x, y, w, h };
  }
}
/** The text of a node, wrapped: [lines, line height, top]. */
export function textLines(n) {
  const b = textBox(n), font = fontOf(n), pad = n.k === 'text' ? 2 : 8, lh = n.fs * 1.25, va = b.va || n.va, al = b.al || n.al;
  const lines = n.text ? (COMPART.has(n.k) ? String(n.text).split('\n') : wrap(n.text, font, b.w - pad * 2)) : [];
  const th = lines.length * lh;
  const top = b.under ? b.y : va === 'top' ? b.y + pad : va === 'bottom' ? b.y + b.h - pad - th : b.y + (b.h - th) / 2;
  return { lines, lh, top, box: b, pad, font, va, al };
}
function textSVG(n, lines, lh, top, b, pad, al = n.al) {
  if (!lines.length) return '';
  const x = al === 'left' ? b.x + pad : al === 'right' ? b.x + b.w - pad : b.x + b.w / 2;
  const anchor = al === 'left' ? 'start' : al === 'right' ? 'end' : 'middle';
  const spans = lines.map((l, k) => `<tspan x="${R(x)}" y="${R(top + lh * k + n.fs * .92)}">${esc(l) || ' '}</tspan>`).join('');
  const out = `<text font-family="${esc(FONTS[n.ff] || FONTS.sans)}" font-size="${n.fs}" font-weight="${n.b ? 700 : 400}"${n.i ? ' font-style="italic"' : ''} fill="${n.tc}" text-anchor="${anchor}" xml:space="preserve">${spans}</text>`;
  return b.rot ? `<g transform="rotate(-90 ${R(b.rot[0])} ${R(b.rot[1])})">${out}</g>` : out;
}

// the parts of some shapes that depend on their text or their size
/** The height of the head of a lifeline. */
export const lifeHead = (n) => Math.min(n.h, Math.max(30, (n.fs || 16) * 2.6));
/** The tag of a frame (its width and height): as wide as its first line. */
export function frameTag(n) {
  const fs = n.fs || 14, first = String(n.text || '').split('\n')[0];
  return [Math.min(n.w * .8, Math.max(60, measure(first || 'loop', fontOf({ ...n, fs, b: true }, fs)) + 30)), Math.min(n.h, fs * 1.25 + 12)];
}
/** The round picture of an org chart card (photo or initials). */
export const cardAvatar = (n) => { const r = Math.max(6, Math.min(n.h - 18, 56, n.w * .3) / 2); return { x: n.x + 12, cx: n.x + 12 + r, cy: n.y + n.h / 2, r }; };
/** The initials of a name: the first letters of its first two words. */
export const initials = (s) => String(s || '').split('\n')[0].trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]).join('').toUpperCase();

/** The outline of a shape, as SVG elements. paint: fill, stroke, width, dash attributes. */
export function shapeSVG(k, x, y, w, h, paint, n) {
  const P = (pts) => `<polygon points="${pts.map((p) => p.map(R).join(',')).join(' ')}" ${paint}/>`;
  // the colours of the paint: the details of icons are drawn with the border colour
  const S = (/ stroke="([^"]*)"/.exec(paint) || [])[1] || 'none', F = (/fill="([^"]*)"/.exec(paint) || [])[1] || 'none', SW = +((/stroke-width="([^"]*)"/.exec(paint) || [])[1] || 1.5) || 1.5;
  const noFill = paint.replace(/fill="[^"]*"/, 'fill="none"').replace(/ stroke-dasharray="[^"]*"/, '');
  const thin = paint.replace(/ stroke-dasharray="[^"]*"/, '').replace(/stroke-width="[^"]*"/, `stroke-width="${R(Math.max(1, SW * .7))}"`);
  const detail = (d, k2 = .75) => (d && S !== 'none' ? `<path d="${d}" fill="none" stroke="${S}" stroke-width="${R(Math.max(1, SW * k2))}" stroke-linecap="round" stroke-linejoin="round"/>` : '');
  const arrow = (x1, y1, x2, y2, hd) => { const [ux, uy] = unit(x2 - x1, y2 - y1); return `M${R(x1)} ${R(y1)}L${R(x2)} ${R(y2)}M${R(x2 - ux * hd - uy * hd * .8)} ${R(y2 - uy * hd + ux * hd * .8)}L${R(x2)} ${R(y2)}L${R(x2 - ux * hd + uy * hd * .8)} ${R(y2 - uy * hd - ux * hd * .8)}`; };
  switch (k) {
    case 'rect': return `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" ${paint}/>`;
    case 'round': { const r = Math.min(18, Math.min(w, h) * .25); return `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" rx="${R(r)}" ${paint}/>`; }
    case 'diamond': return P([[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]]);
    case 'ellipse': return `<ellipse cx="${R(x + w / 2)}" cy="${R(y + h / 2)}" rx="${R(w / 2)}" ry="${R(h / 2)}" ${paint}/>`;
    case 'para': { const sk = Math.min(w * .2, h * .6); return P([[x + sk, y], [x + w, y], [x + w - sk, y + h], [x, y + h]]); }
    case 'cyl': {
      const ry = Math.min(h * .15, w * .25), rx = w / 2;
      return `<path d="M${R(x)} ${R(y + ry)}V${R(y + h - ry)}A${R(rx)} ${R(ry)} 0 0 0 ${R(x + w)} ${R(y + h - ry)}V${R(y + ry)}A${R(rx)} ${R(ry)} 0 0 0 ${R(x)} ${R(y + ry)}Z" ${paint}/>`
        + `<ellipse cx="${R(x + rx)}" cy="${R(y + ry)}" rx="${R(rx)}" ry="${R(ry)}" ${paint}/>`;
    }
    case 'doc': { const v = h * .1; return `<path d="M${R(x)} ${R(y)}H${R(x + w)}V${R(y + h - v)}Q${R(x + w * .75)} ${R(y + h - v * 3)} ${R(x + w / 2)} ${R(y + h - v)}T${R(x)} ${R(y + h - v)}Z" ${paint}/>`; }
    case 'note': {
      const f = Math.min(w, h) * .2;
      return `<path d="M${R(x)} ${R(y)}H${R(x + w - f)}L${R(x + w)} ${R(y + f)}V${R(y + h)}H${R(x)}Z" ${paint}/><path d="M${R(x + w - f)} ${R(y)}V${R(y + f)}H${R(x + w)}" ${paint.replace(/fill="[^"]*"/, 'fill="#000" fill-opacity=".08"')}/>`;
    }
    case 'person': {
      const r = Math.min(w * .28, h * .15), cx = x + w / 2, neck = y + r * 2, hip = y + h * .62;
      const line = paint.replace(/fill="[^"]*"/, 'fill="none"');
      return `<circle cx="${R(cx)}" cy="${R(y + r)}" r="${R(r)}" ${paint}/><path d="M${R(cx)} ${R(neck)}V${R(hip)}M${R(x)} ${R(y + h * .38)}H${R(x + w)}M${R(cx)} ${R(hip)}L${R(x + w * .08)} ${R(y + h)}M${R(cx)} ${R(hip)}L${R(x + w * .92)} ${R(y + h)}" stroke-linecap="round" ${line}/>`;
    }
    case 'cloud': {
      const p = (u, v) => `${R(x + u * w)} ${R(y + v * h)}`;
      return `<path d="M${p(.25, .27)}C${p(.06, .26)} ${p(0, .52)} ${p(.15, .6)}C${p(0, .68)} ${p(.04, .92)} ${p(.3, .86)}C${p(.4, 1.02)} ${p(.68, 1.02)} ${p(.78, .86)}C${p(1, .88)} ${p(1.02, .6)} ${p(.88, .52)}C${p(1, .3)} ${p(.82, .08)} ${p(.66, .18)}C${p(.56, .02)} ${p(.3, .02)} ${p(.25, .27)}Z" ${paint}/>`;
    }
    // ---- network: icons drawn in their box, the name under them
    case 'router': {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2, a = r * .62, b = r * .16;
      return `<circle cx="${R(cx)}" cy="${R(cy)}" r="${R(r)}" ${paint}/>` + detail(arrow(cx + b, cy, cx + a, cy, r * .2) + arrow(cx - b, cy, cx - a, cy, r * .2) + arrow(cx, cy - a, cx, cy - b, r * .2) + arrow(cx, cy + a, cx, cy + b, r * .2));
    }
    case 'switch': {
      const r = Math.min(8, h * .2), hd = Math.min(w, h) * .14;
      return `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" rx="${R(r)}" ${paint}/>` + detail(arrow(x + w * .18, y + h * .34, x + w * .82, y + h * .34, hd) + arrow(x + w * .82, y + h * .66, x + w * .18, y + h * .66, hd));
    }
    case 'server': {
      const r = Math.min(5, w * .1), bay = (k) => `M${R(x + w * .18)} ${R(y + h * (k + .5) / 3)}H${R(x + w * .52)}`;
      const dots = [0, 1, 2].map((k) => `<circle cx="${R(x + w * .76)}" cy="${R(y + h * (k + .5) / 3)}" r="${R(Math.max(1.2, w * .055))}" fill="${S}"/>`).join('');
      return `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" rx="${R(r)}" ${paint}/>` + detail(`M${R(x)} ${R(y + h / 3)}H${R(x + w)}M${R(x)} ${R(y + h * 2 / 3)}H${R(x + w)}` + bay(0) + bay(1) + bay(2)) + dots;
    }
    case 'firewall': {
      let d = '';
      for (let k = 1; k < 4; k++) d += `M${R(x)} ${R(y + h * k / 4)}H${R(x + w)}`;
      for (let k = 0; k < 4; k++) for (let j = 0; j < 3; j++) { const vx = x + w * (j / 3 + (k % 2 ? 1 / 6 : 1 / 3)); if (vx < x + w - 1) d += `M${R(vx)} ${R(y + h * k / 4)}V${R(y + h * (k + 1) / 4)}`; }
      return `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" rx="2" ${paint}/>` + detail(d);
    }
    case 'pc': {
      const sh = h * .72, cx = x + w / 2;
      return `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(sh)}" rx="${R(Math.min(5, w * .06))}" ${paint}/>` + detail(`M${R(x + w * .08)} ${R(y + sh * .84)}H${R(x + w * .92)}`)
        + `<path d="M${R(cx - w * .08)} ${R(y + sh)}L${R(cx - w * .12)} ${R(y + h * .92)}H${R(cx + w * .12)}L${R(cx + w * .08)} ${R(y + sh)}" ${paint}/><rect x="${R(cx - w * .26)}" y="${R(y + h * .92)}" width="${R(w * .52)}" height="${R(h * .08)}" rx="2" ${paint}/>`;
    }
    case 'laptop': {
      const sh = h * .76;
      return `<rect x="${R(x + w * .12)}" y="${R(y)}" width="${R(w * .76)}" height="${R(sh)}" rx="${R(Math.min(4, w * .05))}" ${paint}/>` + `<path d="M${R(x)} ${R(y + h)}L${R(x + w * .08)} ${R(y + sh)}H${R(x + w * .92)}L${R(x + w)} ${R(y + h)}Z" ${paint}/>`
        + detail(`M${R(x + w * .42)} ${R(y + h * .9)}H${R(x + w * .58)}`);
    }
    case 'phone': {
      const r = Math.min(w, h) * .2;
      return `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" rx="${R(r)}" ${paint}/>` + detail(`M${R(x + w * .36)} ${R(y + h * .08)}H${R(x + w * .64)}M${R(x + w * .1)} ${R(y + h * .16)}H${R(x + w * .9)}M${R(x + w * .1)} ${R(y + h * .82)}H${R(x + w * .9)}`)
        + `<circle cx="${R(x + w / 2)}" cy="${R(y + h * .91)}" r="${R(Math.max(1.2, w * .07))}" fill="${S}"/>`;
    }
    case 'printer': {
      return `<rect x="${R(x + w * .22)}" y="${R(y)}" width="${R(w * .56)}" height="${R(h * .34)}" ${paint}/><rect x="${R(x)}" y="${R(y + h * .26)}" width="${R(w)}" height="${R(h * .48)}" rx="${R(Math.min(6, h * .1))}" ${paint}/>`
        + `<rect x="${R(x + w * .22)}" y="${R(y + h * .6)}" width="${R(w * .56)}" height="${R(h * .4)}" ${paint}/>` + detail(`M${R(x + w * .32)} ${R(y + h * .75)}H${R(x + w * .68)}M${R(x + w * .32)} ${R(y + h * .87)}H${R(x + w * .58)}`)
        + `<circle cx="${R(x + w * .84)}" cy="${R(y + h * .4)}" r="${R(Math.max(1.2, w * .03))}" fill="${S}"/>`;
    }
    case 'ap': {
      const cx = x + w / 2, by = y + h * .62, arc = (r) => `M${R(cx - r * .7071)} ${R(by - r * .7071)}A${R(r)} ${R(r)} 0 0 1 ${R(cx + r * .7071)} ${R(by - r * .7071)}`;
      return `<rect x="${R(x + w * .08)}" y="${R(by)}" width="${R(w * .84)}" height="${R(h * .38)}" rx="${R(Math.min(6, h * .12))}" ${paint}/>` + detail(arc(h * .16) + arc(h * .32) + arc(h * .48))
        + [.3, .5, .7].map((u) => `<circle cx="${R(x + w * u)}" cy="${R(by + h * .19)}" r="${R(Math.max(1.2, w * .03))}" fill="${S}"/>`).join('');
    }
    // ---- UML
    case 'class': case 'entity': {
      const r = k === 'entity' ? Math.min(6, w * .05) : 0, hd = n ? compRows(n)[0][1] : Math.min(26, h * .3);
      let out = `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}"${r ? ` rx="${R(r)}"` : ''} ${paint}/>`;
      if (k === 'entity') out += `<path d="M${R(x)} ${R(y + hd)}V${R(y + r)}${r ? `Q${R(x)} ${R(y)} ${R(x + r)} ${R(y)}` : ''}H${R(x + w - r)}${r ? `Q${R(x + w)} ${R(y)} ${R(x + w)} ${R(y + r)}` : ''}V${R(y + hd)}Z" fill="${S === 'none' ? '#1d4e89' : S}"/>`;
      const cuts = n ? compRows(n).slice(1).map((c) => c[0]).filter((v) => v < y + h - 1) : [y + hd, y + h * .62];
      return out + detail(cuts.map((v) => `M${R(x)} ${R(v)}H${R(x + w)}`).join(''), 1);
    }
    case 'package': {
      const tw = Math.min(w * .4, 120), th = Math.min(22, h * .2);
      return `<path d="M${R(x)} ${R(y + th)}V${R(y)}H${R(x + tw)}V${R(y + th)}" ${paint}/><rect x="${R(x)}" y="${R(y + th)}" width="${R(w)}" height="${R(h - th)}" ${paint}/>`;
    }
    case 'comp': {
      const q = Math.min(1, w / 100, h / 50), ix = x + w - 26 * q, iy = y + 9 * q;
      return `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" rx="2" ${paint}/>`
        + `<rect x="${R(ix)}" y="${R(iy)}" width="${R(16 * q)}" height="${R(20 * q)}" ${thin}/><rect x="${R(ix - 4 * q)}" y="${R(iy + 4 * q)}" width="${R(8 * q)}" height="${R(4 * q)}" ${thin}/><rect x="${R(ix - 4 * q)}" y="${R(iy + 12 * q)}" width="${R(8 * q)}" height="${R(4 * q)}" ${thin}/>`;
    }
    case 'cube': {
      const d = Math.min(w, h) * .15;
      return `<rect x="${R(x)}" y="${R(y + d)}" width="${R(w - d)}" height="${R(h - d)}" ${paint}/>` + P([[x, y + d], [x + d, y], [x + w, y], [x + w - d, y + d]]) + P([[x + w - d, y + d], [x + w, y], [x + w, y + h - d], [x + w - d, y + h]])
        + `<path d="M${R(x + w - d)} ${R(y + d)}L${R(x + w)} ${R(y)}V${R(y + h - d)}L${R(x + w - d)} ${R(y + h)}Z" fill="#000" fill-opacity=".07"/>`;
    }
    case 'lifeline': {
      const hd = n ? lifeHead(n) : Math.min(h * .3, 16), cx = x + w / 2;
      return `<path d="M${R(cx)} ${R(y + hd)}V${R(y + h)}" fill="none" stroke="${S}" stroke-width="${R(Math.max(1, SW * .75))}" stroke-dasharray="${R(SW * 3 + 3)} ${R(SW * 2 + 3)}"/><rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(hd)}" rx="3" ${paint}/>`;
    }
    case 'frame': {
      const [tw, th] = n ? frameTag(n) : [w * .4, h * .3], c = Math.min(8, th * .4);
      return `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" ${paint}/><path d="M${R(x)} ${R(y)}H${R(x + tw)}V${R(y + th - c)}L${R(x + tw - c)} ${R(y + th)}H${R(x)}Z" ${paint.replace(/fill="[^"]*"/, `fill="${S}" fill-opacity=".08"`)}/>`;
    }
    case 'box': return `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" rx="${R(Math.min(6, Math.min(w, h) * .05))}" ${paint}/>`;
    case 'start': { const r = Math.min(w, h) / 2; return `<circle cx="${R(x + w / 2)}" cy="${R(y + h / 2)}" r="${R(r)}" fill="${S === 'none' ? F : S}"/>`; }
    case 'end': { const r = Math.min(w, h) / 2; return `<circle cx="${R(x + w / 2)}" cy="${R(y + h / 2)}" r="${R(r - SW / 2)}" ${paint}/><circle cx="${R(x + w / 2)}" cy="${R(y + h / 2)}" r="${R(r * .55)}" fill="${S === 'none' ? F : S}"/>`; }
    // ---- org chart, timeline, BPMN, swimlanes
    case 'card': {
      const a = n ? cardAvatar(n) : { cx: x + h / 2, cy: y + h / 2, r: h * .32 };
      return `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" rx="${R(Math.min(12, h * .2))}" ${paint}/><circle cx="${R(a.cx)}" cy="${R(a.cy)}" r="${R(a.r)}" fill="${S === 'none' ? '#4352d6' : S}"/>`
        + (n ? '' : detail(`M${R(a.cx + a.r * 1.6)} ${R(y + h * .4)}H${R(x + w * .85)}M${R(a.cx + a.r * 1.6)} ${R(y + h * .62)}H${R(x + w * .65)}`));
    }
    case 'track': {
      const tw = Math.min(130, w * .25);
      return `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" ${paint}/><rect x="${R(x)}" y="${R(y)}" width="${R(tw)}" height="${R(h)}" fill="${S}" fill-opacity=".1"/>` + detail(`M${R(x + tw)} ${R(y)}V${R(y + h)}`, 1);
    }
    case 'axis': {
      const N = n ? Math.max(1, String(n.text || '').split('\n').filter((l) => l.trim()).length) : 5, by = y + h - 3;
      let d = `M${R(x)} ${R(by)}H${R(x + w)}`;
      for (let k = 0; k <= N; k++) d += `M${R(x + w * k / N)} ${R(by - 9)}V${R(by)}`;
      return `<path d="${d}" fill="none" stroke="${S === 'none' ? '#5f6660' : S}" stroke-width="${R(Math.max(1, SW))}" stroke-linecap="round"/>`;
    }
    case 'mile': { const q = Math.min(w, h), cx = x + w / 2, cy = y + h / 2; return P([[cx, cy - q / 2], [cx + q / 2, cy], [cx, cy + q / 2], [cx - q / 2, cy]]); }
    case 'subproc': {
      const r = Math.min(14, Math.min(w, h) * .2), m = Math.min(14, h * .2), mx = x + w / 2 - m / 2, my = y + h - m - 3;
      return `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" rx="${R(r)}" ${paint}/><rect x="${R(mx)}" y="${R(my)}" width="${R(m)}" height="${R(m)}" ${thin}/>` + detail(`M${R(mx + m * .25)} ${R(my + m / 2)}H${R(mx + m * .75)}M${R(mx + m / 2)} ${R(my + m * .25)}V${R(my + m * .75)}`, 1);
    }
    case 'bstart': case 'binter': case 'bend': {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2;
      if (k === 'bend') return `<circle cx="${R(cx)}" cy="${R(cy)}" r="${R(r - SW)}" ${paint.replace(/stroke-width="[^"]*"/, `stroke-width="${R(SW * 2.2)}"`)}/>`;
      return `<circle cx="${R(cx)}" cy="${R(cy)}" r="${R(r)}" ${paint.replace(/stroke-width="[^"]*"/, `stroke-width="${R(Math.max(1, SW * .75))}"`)}/>` + (k === 'binter' ? `<circle cx="${R(cx)}" cy="${R(cy)}" r="${R(r - Math.max(3, SW * 1.8))}" ${noFill.replace(/stroke-width="[^"]*"/, `stroke-width="${R(Math.max(1, SW * .75))}"`)}/>` : '');
    }
    case 'gwx': case 'gwp': case 'gwo': {
      const cx = x + w / 2, cy = y + h / 2, q = Math.min(w, h) * .2;
      const mark = k === 'gwx' ? `M${R(cx - q)} ${R(cy - q)}L${R(cx + q)} ${R(cy + q)}M${R(cx + q)} ${R(cy - q)}L${R(cx - q)} ${R(cy + q)}` : k === 'gwp' ? `M${R(cx - q * 1.2)} ${R(cy)}H${R(cx + q * 1.2)}M${R(cx)} ${R(cy - q * 1.2)}V${R(cy + q * 1.2)}` : '';
      return P([[cx, y], [x + w, cy], [cx, y + h], [x, cy]]) + (mark ? `<path d="${mark}" fill="none" stroke="${S}" stroke-width="${R(Math.max(2, SW * 1.6))}" stroke-linecap="round"/>` : `<circle cx="${R(cx)}" cy="${R(cy)}" r="${R(q * 1.1)}" fill="none" stroke="${S}" stroke-width="${R(Math.max(2, SW * 1.4))}"/>`);
    }
    case 'lane': case 'vlane': {
      const v = k === 'vlane', b = v ? Math.min(36, h * .3) : Math.min(36, w * .3);
      return `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" ${paint}/><rect x="${R(x)}" y="${R(y)}" width="${R(v ? w : b)}" height="${R(v ? b : h)}" fill="${S}" fill-opacity=".07"/>` + detail(v ? `M${R(x)} ${R(y + b)}H${R(x + w)}` : `M${R(x + b)} ${R(y)}V${R(y + h)}`, 1);
    }
    default: return `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" ${paint}/>`;
  }
}
const paintOf = (n) => `fill="${n.f || 'none'}" stroke="${n.c && n.s ? n.c : 'none'}" stroke-width="${n.s || 0}"${n.d && n.s ? ` stroke-dasharray="${DASHES[n.d](n.s)}"` : ''} stroke-linejoin="round"`;
export function nodeSVG(n) {
  const shape = n.k === 'text' ? '' : shapeSVG(n.k, n.x, n.y, n.w, n.h, paintOf(n), n);
  if (COMPART.has(n.k)) return shape + compText(n);
  if (n.k === 'card') return shape + cardText(n);
  if (n.k === 'axis') return shape + axisText(n);
  const t = textLines(n);
  return shape + textSVG(n, t.lines, t.lh, t.top, t.box, t.pad, t.al);
}
const textTag = (n, x, y, s, o = {}) => `<text x="${R(x)}" y="${R(y)}" font-family="${esc(FONTS[n.ff] || FONTS.sans)}" font-size="${R(o.fs || n.fs)}" font-weight="${o.b ?? n.b ? 700 : 400}"${o.i ?? n.i ? ' font-style="italic"' : ''} fill="${o.c || n.tc}"${o.op ? ` fill-opacity="${o.op}"` : ''} text-anchor="${o.anchor || 'start'}" xml:space="preserve">${esc(s) || ' '}</text>`;
/** The rows of a shape in compartments: [top of each part, its height]; the last part reaches the bottom. */
export function compRows(n) {
  const lh = n.fs * 1.25, ps = parts(n.text, n.k);
  let y = n.y;
  const rows = ps.map((p, k) => { const hh = k === 0 ? Math.max(1, p.length) * lh + 14 : p.length ? p.length * lh + 10 : 12; const r = [y, hh, p]; y += hh; return r; });
  const last = rows[rows.length - 1];
  last[1] = Math.max(last[1], n.y + n.h - last[0]);
  return rows;
}
/** UML class: the name in the middle (bold, its «stereotype» not), then attributes and methods; a table: the name on its band, the columns with PK / FK. */
function compText(n) {
  const lh = n.fs * 1.25, ent = n.k === 'entity', rows = compRows(n), keyRe = /^(PK|FK|PK,\s?FK|🔑)\s+/;
  const keyW = ent && rows.slice(1).some((r) => r[2].some((l) => keyRe.test(l))) ? measure('PK,FK', fontOf({ ...n, b: true })) * .72 + 12 : 0;
  let out = '';
  rows.forEach(([top, hh, lines], k) => {
    const y0 = top + (k === 0 ? (hh - Math.max(1, lines.length) * lh) / 2 : 5);
    lines.forEach((l, j) => {
      const y = y0 + lh * j + n.fs * .92;
      if (y > n.y + n.h + lh) return;
      if (k === 0) { const st = /^«.*»$/.test(l.trim()); out += textTag(n, n.x + n.w / 2, y, l, { anchor: 'middle', b: !st || n.b, fs: st ? n.fs * .86 : n.fs, c: ent ? '#ffffff' : n.tc }); return; }
      const m = ent && keyRe.exec(l);
      if (m) { out += textTag(n, n.x + 8, y, m[1].replace(/\s/g, ''), { b: true, fs: n.fs * .72, c: n.c || n.tc }) + textTag(n, n.x + 8 + keyW, y, l.slice(m[0].length), { b: n.b || /^PK/.test(m[1]) }); }
      else out += textTag(n, n.x + 8 + keyW, y, l);
    });
  });
  return out;
}
/** Org chart card: the photo or the initials, the name in bold, the role (the other lines) lighter. */
function cardText(n) {
  const a = cardAvatar(n), b = textBox(n), lines = String(n.text || '').split('\n'), name = lines[0] || '', rest = lines.slice(1).join('\n');
  let out = '';
  if (n.img) out += `<clipPath id="av${esc(n.id || 'x')}"><circle cx="${R(a.cx)}" cy="${R(a.cy)}" r="${R(a.r)}"/></clipPath><image href="${n.img}" x="${R(a.cx - a.r)}" y="${R(a.cy - a.r)}" width="${R(a.r * 2)}" height="${R(a.r * 2)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#av${esc(n.id || 'x')})"/>`;
  else if (name) out += textTag(n, a.cx, a.cy + a.r * .3, initials(name), { anchor: 'middle', b: true, fs: a.r * .8, c: '#ffffff', i: false });
  const fs2 = n.fs * .82, font1 = fontOf({ ...n, b: true }), font2 = fontOf({ ...n, b: false, fs: fs2 }, fs2), W = b.w - 8;
  const l1 = wrap(name, font1, W).slice(0, 2), l2 = rest ? wrap(rest, font2, W).slice(0, 3) : [];
  const h1 = n.fs * 1.2, h2 = fs2 * 1.25, th = l1.length * h1 + (l2.length ? 3 + l2.length * h2 : 0);
  const al = n.al === 'center' ? 'middle' : n.al === 'right' ? 'end' : 'start', x = al === 'middle' ? b.x + W / 2 : al === 'end' ? b.x + W : b.x;
  let y = n.y + (n.h - th) / 2;
  for (const l of l1) { out += textTag(n, x, y + n.fs * .92, l, { anchor: al, b: true }); y += h1; }
  y += 3;
  for (const l of l2) { out += textTag(n, x, y + fs2 * .92, l, { anchor: al, b: false, fs: fs2, op: .72 }); y += h2; }
  return out;
}
/** Axis of a timeline: one label in the middle of every interval, a line of the text each. */
function axisText(n) {
  const labels = String(n.text || '').split('\n').filter((l) => l.trim()), N = Math.max(1, labels.length), cw = n.w / N;
  return labels.map((l, k) => textTag(n, n.x + cw * (k + .5), n.y + n.h - 14, l.trim(), { anchor: 'middle' })).join('');
}

// ------------------------------------------------------------------ the ends of a connector

const DIR = { t: [0, -1], r: [1, 0], b: [0, 1], l: [-1, 0] };
/** The point of a side of a node: its middle, or the fraction o along it (on a lifeline, o is a height on its line). */
export function sidePoint(n, p, o) {
  if (n.k === 'lifeline' && (p === 'l' || p === 'r')) return o === undefined || o === null ? [p === 'l' ? n.x : n.x + n.w, n.y + lifeHead(n) / 2] : [n.x + n.w / 2, n.y + o * n.h];
  if (n.k === 'lifeline' && p === 'b') return [n.x + n.w / 2, n.y + n.h];
  // under an icon with its name below, a connector leaves from under the name (it never crosses it)
  if (p === 'b' && UNDER.has(n.k) && n.text) { const t = textLines(n); return [n.x + n.w * (o ?? .5), n.y + n.h + 6 + t.lines.length * t.lh]; }
  const f = o === undefined || o === null ? .5 : o;
  return p === 't' ? [n.x + n.w * f, n.y] : p === 'r' ? [n.x + n.w, n.y + n.h * f] : p === 'b' ? [n.x + n.w * f, n.y + n.h] : [n.x, n.y + n.h * f];
}
const ROUNDISH = new Set(['ellipse', 'cloud', 'start', 'end', 'bstart', 'binter', 'bend', 'router']), DIAMONDISH = new Set(['diamond', 'gwx', 'gwp', 'gwo', 'mile']);
const center = (n) => [n.x + n.w / 2, n.y + n.h / 2];
/** Where the line from the centre of a node toward (px, py) leaves its outline. */
export function boundary(n, px, py) {
  const [cx, cy] = center(n), dx = px - cx, dy = py - cy, a = n.w / 2, b = n.h / 2;
  if (!dx && !dy) return [cx, cy];
  let k;
  if (ROUNDISH.has(n.k)) k = 1 / Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b));
  else if (DIAMONDISH.has(n.k)) k = 1 / (Math.abs(dx) / a + Math.abs(dy) / b);
  else k = Math.min(dx ? a / Math.abs(dx) : Infinity, dy ? b / Math.abs(dy) : Infinity);
  return [cx + dx * k, cy + dy * k];
}
/** The side of a node that faces a point. */
export function facing(n, px, py) {
  const [cx, cy] = center(n), dx = (px - cx) / Math.max(1, n.w), dy = (py - cy) / Math.max(1, n.h);
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'r' : 'l') : dy >= 0 ? 'b' : 't';
}
const endRef = (e, get) => (e?.n ? get(e.n) : null);
const endCenter = (e, get) => { const n = endRef(e, get); return n ? center(n) : [e.x, e.y]; };

/**
 * The route of a connector: {pts, d, curve, tip: [[x,y],[ux,uy]] at both ends (u points into the end), mid (the place of the
 * label)}; null when one of its nodes is gone.
 */
export function route(e, get) {
  const na = endRef(e.a, get), nb = endRef(e.b, get);
  if ((e.a?.n && !na) || (e.b?.n && !nb)) return null;
  const ca = endCenter(e.a, get), cb = endCenter(e.b, get);
  let sa = na ? e.a.p || '' : '', sb = nb ? e.b.p || '' : '';
  const oa = sa ? e.a.o : undefined, ob = sb ? e.b.o : undefined;
  let pa, pb;
  if (e.r === 'straight') {
    pa = na ? (sa ? sidePoint(na, sa, oa) : boundary(na, ...(nb && sb ? sidePoint(nb, sb, ob) : cb))) : ca;
    pb = nb ? (sb ? sidePoint(nb, sb, ob) : boundary(nb, ...(na && sa ? sidePoint(na, sa, oa) : ca))) : cb;
    return finish(e, [pa, pb], false);
  }
  // elbow and curve leave a node from a side (its middle, or the point chosen along it)
  if (na && !sa) sa = nb && sb ? facing(na, ...sidePoint(nb, sb, ob)) : facing(na, ...cb);
  if (nb && !sb) sb = facing(nb, ...(na ? sidePoint(na, sa, oa) : ca));
  pa = na ? sidePoint(na, sa, oa) : ca;
  pb = nb ? sidePoint(nb, sb, ob) : cb;
  // a free end goes the way of the other end
  const da = sa ? DIR[sa] : axis(pb[0] - pa[0], pb[1] - pa[1]), db = sb ? DIR[sb] : axis(pa[0] - pb[0], pa[1] - pb[1]);
  if (e.r === 'curve') {
    const dist = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), k = Math.max(30, Math.min(220, dist * .45));
    return finish(e, [pa, [pa[0] + da[0] * k, pa[1] + da[1] * k], [pb[0] + db[0] * k, pb[1] + db[1] * k], pb], true);
  }
  return finish(e, elbow(pa, da, pb, db), false);
}
const axis = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1]);
/** An orthogonal path from a (leaving along da) to b (arriving against db), with few bends. */
function elbow(a, da, b, db) {
  const G = 22, h1 = da[0] !== 0, h2 = db[0] !== 0;
  const a1 = [a[0] + da[0] * G, a[1] + da[1] * G], b1 = [b[0] + db[0] * G, b[1] + db[1] * G];
  let mid;
  if (h1 && h2) {
    const mx = (a[0] + b[0]) / 2;
    if ((mx - a[0]) * da[0] >= G * .5 && (mx - b[0]) * db[0] >= G * .5) mid = [[mx, a[1]], [mx, b[1]]];
    else if (da[0] === -db[0] || (a1[0] - b1[0]) * da[0] < 0) { const my = (a[1] + b[1]) / 2; mid = [a1, [a1[0], my], [b1[0], my], b1]; }
    else { const x = da[0] > 0 ? Math.max(a1[0], b1[0]) : Math.min(a1[0], b1[0]); mid = [[x, a[1]], [x, b[1]]]; }
  } else if (!h1 && !h2) {
    const my = (a[1] + b[1]) / 2;
    if ((my - a[1]) * da[1] >= G * .5 && (my - b[1]) * db[1] >= G * .5) mid = [[a[0], my], [b[0], my]];
    else if (da[1] === -db[1] || (a1[1] - b1[1]) * da[1] < 0) { const mx = (a[0] + b[0]) / 2; mid = [a1, [mx, a1[1]], [mx, b1[1]], b1]; }
    else { const y = da[1] > 0 ? Math.max(a1[1], b1[1]) : Math.min(a1[1], b1[1]); mid = [[a[0], y], [b[0], y]]; }
  } else if (h1) {
    const c = [b[0], a[1]];
    mid = (c[0] - a[0]) * da[0] > 0 && (c[1] - b[1]) * db[1] > 0 ? [c] : [a1, [a1[0], b1[1]], b1];
  } else {
    const c = [a[0], b[1]];
    mid = (c[1] - a[1]) * da[1] > 0 && (c[0] - b[0]) * db[0] > 0 ? [c] : [a1, [b1[0], a1[1]], b1];
  }
  // without repeated or straight-through points
  const pts = [a, ...mid, b], out = [pts[0]];
  for (let k = 1; k < pts.length; k++) {
    const p = pts[k], q = out[out.length - 1];
    if (Math.abs(p[0] - q[0]) < .01 && Math.abs(p[1] - q[1]) < .01) continue;
    if (out.length >= 2) { const o = out[out.length - 2]; if ((Math.abs(o[0] - q[0]) < .01 && Math.abs(q[0] - p[0]) < .01) || (Math.abs(o[1] - q[1]) < .01 && Math.abs(q[1] - p[1]) < .01)) out.pop(); }
    out.push(p);
  }
  return out;
}
const unit = (dx, dy) => { const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
function finish(e, pts, curve) {
  const n = pts.length, A = pts[0], B = pts[n - 1];
  // the direction into each end: from the point before it (a curve whose handle sits on its end looks at the other end)
  const near = (k, step) => { for (let j = k + step; j >= 0 && j < n; j += step) if (Math.hypot(pts[j][0] - pts[k][0], pts[j][1] - pts[k][1]) > .5) return pts[j]; return pts[k]; };
  const ua = unit(A[0] - near(0, 1)[0], A[1] - near(0, 1)[1]), ub = unit(B[0] - near(n - 1, -1)[0], B[1] - near(n - 1, -1)[1]);
  // the line stops where a filled head starts
  const L = headLen(e), cut = (kind) => (['arrow', 'diamond', 'circle'].includes(kind) ? L * (kind === 'arrow' ? .85 : 1) : kind === 'open' ? e.s * .5 : kind === 'tri' ? L * 1.15 : kind === 'odiamond' ? L * 1.1 : kind === 'ocircle' ? L * .8 : 0);
  const draw = pts.map((p) => p.slice());
  const ka = cut(e.sa), kb = cut(e.ea);
  draw[0] = [A[0] - ua[0] * ka, A[1] - ua[1] * ka];
  draw[n - 1] = [B[0] - ub[0] * kb, B[1] - ub[1] * kb];
  let d, mid;
  if (curve) {
    d = `M${draw[0].map(R).join(' ')}C${draw[1].map(R).join(' ')} ${draw[2].map(R).join(' ')} ${draw[3].map(R).join(' ')}`;
    mid = bez(pts, .5);
  } else {
    d = 'M' + draw.map((p) => p.map(R).join(' ')).join('L');
    mid = along(pts, .5);
  }
  return { pts, d, curve, tipA: [A, ua], tipB: [B, ub], mid };
}
const bez = (p, t) => { const u = 1 - t; return [0, 1].map((k) => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]); };
/** The point at a fraction of the length of a polyline. */
function along(pts, f) {
  let total = 0;
  for (let k = 1; k < pts.length; k++) total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  let left = total * f;
  for (let k = 1; k < pts.length; k++) {
    const l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    if (left <= l && l > 0) return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * (left / l), pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * (left / l)];
    left -= l;
  }
  return pts[pts.length - 1];
}
export const sample = (g) => (g.curve ? Array.from({ length: 25 }, (_, k) => bez(g.pts, k / 24)) : g.pts);

const headLen = (e) => 6 + e.s * 3.2;
function headSVG(kind, [tip, u], e, bg = '#ffffff') {
  if (kind === 'none') return '';
  const L = headLen(e), n = [-u[1], u[0]], P = (a, b) => [tip[0] - u[0] * a + n[0] * b, tip[1] - u[1] * a + n[1] * b], pts = (l) => l.map((p) => p.map(R).join(',')).join(' ');
  const fill = `fill="${e.c}"`, line = `fill="none" stroke="${e.c}" stroke-width="${e.s}" stroke-linecap="round" stroke-linejoin="round"`;
  // hollow heads (UML, BPMN) are filled with the background, so the line under them does not show
  const hollow = `fill="${bg}" stroke="${e.c}" stroke-width="${R(Math.max(1, Math.min(e.s, 2.5)))}" stroke-linejoin="round"`, sw = Math.max(1, Math.min(e.s, 2.5));
  const bar = (a, k = .45) => `M${pts([P(a, L * k)]).replace(',', ' ')}L${pts([P(a, -L * k)]).replace(',', ' ')}`;
  const crow = () => { const q = P(L * .75, 0); return `M${q.map(R).join(' ')}L${P(0, L * .55).map(R).join(' ')}M${q.map(R).join(' ')}L${tip.map(R).join(' ')}M${q.map(R).join(' ')}L${P(0, -L * .55).map(R).join(' ')}`; };
  const ring = (a) => { const c = P(a, 0); return `<circle cx="${R(c[0])}" cy="${R(c[1])}" r="${R(L * .24)}" ${hollow}/>`; };
  const er = (d) => `<path d="${d}" fill="none" stroke="${e.c}" stroke-width="${R(sw)}" stroke-linecap="round"/>`;
  switch (kind) {
    case 'arrow': return `<polygon points="${pts([tip, P(L, L * .42), P(L, -L * .42)])}" ${fill} stroke="${e.c}" stroke-width="${Math.min(e.s, 1.5)}" stroke-linejoin="round"/>`;
    case 'open': return `<polyline points="${pts([P(L, L * .5), tip, P(L, -L * .5)])}" ${line}/>`;
    case 'diamond': return `<polygon points="${pts([tip, P(L / 2, L * .36), P(L, 0), P(L / 2, -L * .36)])}" ${fill}/>`;
    case 'circle': { const c = P(L / 2, 0); return `<circle cx="${R(c[0])}" cy="${R(c[1])}" r="${R(L * .42)}" ${fill}/>`; }
    case 'bar': return `<polyline points="${pts([P(e.s, L * .5), P(e.s, -L * .5)])}" ${line}/>`;
    case 'tri': return `<polygon points="${pts([tip, P(L * 1.15, L * .55), P(L * 1.15, -L * .55)])}" ${hollow}/>`;
    case 'odiamond': return `<polygon points="${pts([tip, P(L * .55, L * .38), P(L * 1.1, 0), P(L * .55, -L * .38)])}" ${hollow}/>`;
    case 'ocircle': { const c = P(L * .4, 0); return `<circle cx="${R(c[0])}" cy="${R(c[1])}" r="${R(L * .38)}" ${hollow}/>`; }
    case 'er1': return er(bar(L * .45) + bar(L * .8));
    case 'er01': return er(bar(L * .45)) + ring(L * 1.05);
    case 'ern': return er(crow() + bar(L * 1.05));
    case 'er0n': return er(crow()) + ring(L * 1.15);
  }
  return '';
}
/** A connector: its line, its heads and its label on a patch of the background. */
export function edgeSVG(e, get, bg = '#ffffff') {
  const g = route(e, get);
  if (!g) return '';
  let out = `<path d="${g.d}" fill="none" stroke="${e.c}" stroke-width="${e.s}"${e.d ? ` stroke-dasharray="${DASHES[e.d](e.s)}"` : ''} stroke-linecap="round" stroke-linejoin="round"/>` + headSVG(e.sa, g.tipA, e, bg) + headSVG(e.ea, g.tipB, e, bg);
  if (e.text) {
    const font = fontOf({ ...e, ff: 'sans' }), lines = wrap(e.text, font, 220), lh = e.fs * 1.25, w = Math.max(...lines.map((l) => measure(l, font))) + 10, h = lines.length * lh + 4;
    const [mx, my] = g.mid;
    out += `<rect x="${R(mx - w / 2)}" y="${R(my - h / 2)}" width="${R(w)}" height="${R(h)}" rx="4" fill="${bg}"/>`;
    out += `<text font-family="${esc(FONTS.sans)}" font-size="${e.fs}" fill="${e.tc}" text-anchor="middle" xml:space="preserve">${lines.map((l, k) => `<tspan x="${R(mx)}" y="${R(my - h / 2 + 2 + lh * k + e.fs * .92)}">${esc(l) || ' '}</tspan>`).join('')}</text>`;
  }
  return out;
}
export const itemSVG = (i, get, bg) => (i.t === 'node' ? nodeSVG(i) : edgeSVG(i, get, bg));

// ------------------------------------------------------------------ boxes and hit tests

/** The box of an item on the diagram {x, y, w, h}, or null. */
export function bounds(i, get) {
  if (i.t === 'node') {
    if (UNDER.has(i.k) && i.text) { const t = textLines(i), th = t.lines.length * t.lh; const tw = Math.max(i.w, ...t.lines.map((l) => measure(l, t.font) + 4)); return { x: Math.min(i.x, i.x + i.w / 2 - tw / 2), y: i.y, w: Math.max(i.w, tw), h: i.h + 4 + th }; }
    return { x: i.x, y: i.y, w: i.w, h: i.h };
  }
  const g = route(i, get);
  if (!g) return null;
  const pts = sample(g), xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
export function union(list, get) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const i of list) { const q = bounds(i, get); if (!q) continue; a = Math.min(a, q.x); b = Math.min(b, q.y); c = Math.max(c, q.x + q.w); d = Math.max(d, q.y + q.h); }
  return a === Infinity ? null : { x: a, y: b, w: c - a, h: d - b };
}
const segDist = (px, py, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l)) : 0; return Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t); };
/** Whether (x, y) touches the item, with a tolerance in units of the diagram. */
export function hits(i, x, y, tol, get) {
  if (i.t === 'node') { const b = bounds(i, get); return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol; }
  const g = route(i, get);
  if (!g) return false;
  const pts = sample(g);
  for (let k = 1; k < pts.length; k++) if (segDist(x, y, pts[k - 1], pts[k]) <= tol + i.s / 2) return true;
  if (i.text) { const [mx, my] = g.mid; if (Math.abs(x - mx) < 40 && Math.abs(y - my) < i.fs) return true; }
  return false;
}
export const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ------------------------------------------------------------------ the whole diagram

/** The background grid as an SVG pattern (id given), with a dot at every crossing. */
export function gridPattern(id, gs, bg, z = 1) {
  const c = isDark(bg) ? '#3a4150' : '#cfd5df', s = gs * z;
  if (s < 6) return '';
  return `<pattern id="${id}" width="${R(s)}" height="${R(s)}" patternUnits="userSpaceOnUse"><circle cx="${R(s / 2)}" cy="${R(s / 2)}" r="${s > 14 ? 1.1 : .8}" fill="${c}"/></pattern>`;
}

/** The diagram as a standalone SVG document, as big as what is drawn (pad around), fonts embedded when given. */
export function diagramSVG(items, settings, { pad = 32, box, fonts = '', grid = false } = {}) {
  const map = new Map(items.filter((i) => i.t === 'node').map((i) => [i.id, i])), get = (id) => map.get(id);
  const b = box || union(items, get) || { x: 0, y: 0, w: 400, h: 240 };
  const x = b.x - pad, y = b.y - pad, w = Math.ceil(b.w + pad * 2), h = Math.ceil(b.h + pad * 2);
  const style = fonts ? `<style>${fonts}</style>` : '';
  const gp = grid && settings.grid ? gridPattern('g', settings.gs, settings.bg) : '';
  const body = items.map((i) => itemSVG(i, get, settings.bg)).join('');
  return `<svg xmlns="${NS}" width="${w}" height="${h}" viewBox="${R(x)} ${R(y)} ${w} ${h}">${style}${gp ? `<defs>${gp}</defs>` : ''}<rect x="${R(x)}" y="${R(y)}" width="${w}" height="${h}" fill="${settings.bg}"/>${gp ? `<rect x="${R(x)}" y="${R(y)}" width="${w}" height="${h}" fill="url(#g)"/>` : ''}${body}</svg>`;
}
