/** Draws slides as DOM. One function for the editor, the thumbnails, the show and the exported files. */
import {lineHeads, pathOf, shapePath, toSvgPath} from './shapes.js';
import {gradient, slideContext, styleOf} from './themes.js';
import {esc, fragment, isEmpty } from './richtext.js';
import { isCompound, partsOf, isCited, citeOf } from './parts.js';

const NS = 'http://www.w3.org/2000/svg';
let gid = 0;
export const mediaUrl = (src) => (src?.startsWith('m:') ? 'api/?r=media&id=' + src.slice(2) : src?.startsWith('blob:') || src?.startsWith('data:') ? src : '');
/** Where a video is: for the players (in) and for the links of the exported files. */
export const videoSrc = (el) => (el.kind === 'youtube' ? 'https://youtu.be/' + el.vid : el.kind === 'vimeo' ? 'https://vimeo.com/' + el.vid : el.vid?.startsWith('m:') ? new URL(mediaUrl(el.vid), document.baseURI).href : el.vid);
export const cssFill = (f, sc) => {
    const g = gradient(f);
    return g ? `linear-gradient(${g.ang}deg, ${sc.color(g.a)}, ${sc.color(g.b)})` : sc.color(f);
};
export const SHADOWS = ['', '0 2px 8px rgb(0 0 0 / .16)', '0 8px 26px rgb(0 0 0 / .2)', '0 20px 60px rgb(0 0 0 / .28)'];

export const sorted = (d) => Object.entries(d.els || {}).map(([id, el]) => ({id, ...el})).sort((a, b) => (a.z || 0) - (b.z || 0) || (a.id < b.id ? -1 : 1));

/** What is under and over the content: decorations of the theme, footer and slide number. */
export function decorOf(d, sc, index, count) {
    const v = d.variant || 'content', {W, H, s} = sc, o = sc.opts;
    const under = v === 'plain' || d.bg?.t === 'i' || !sc.def.decor ? [] : sc.def.decor(v, W, H, s);
    const over = [];
    if (v === 'content' || v === 'plain') {
        const y = H - 46 * s, h = 26 * s, size = 13 * s;
        if (o.footer) over.push({
            t: 'text',
            role: 'caption',
            x: W * .075,
            y,
            w: W * .6,
            h,
            size,
            va: 'middle',
            html: `<p>${esc(o.footer)}</p>`
        });
        if (o.numbers && index >= 0) over.push({
            t: 'text',
            role: 'caption',
            x: W * .775,
            y,
            w: W * .15,
            h,
            size,
            va: 'middle',
            align: 'right',
            html: `<p>${index + 1}</p>`
        });
    }
    return {under, over};
}

export function applyBg(node, d, sc) {
    const b = sc.bg;
    node.style.background = '';
    if (b.t === 'g') node.style.background = `linear-gradient(${b.ang ?? 135}deg, ${sc.color(b.a)}, ${sc.color(b.b)})`;
    else if (b.t === 'i') {
        node.style.background = sc.colors.bg;
        const im = document.createElement('div');
        im.className = 'bgimg';
        im.style.cssText = `background-image:url("${mediaUrl(b.src)}");background-position:${(b.fx ?? .5) * 100}% ${(b.fy ?? .5) * 100}%`;
        node.append(im);
        if (b.dim) {
            const dim = document.createElement('div');
            dim.className = 'bgdim';
            dim.style.background = sc.colors.bg;
            dim.style.opacity = b.dim;
            node.append(dim);
        }
    } else node.style.background = sc.color(b.c || '@bg');
}

export function textNode(el, sc, mode) {
    const st = styleOf(el, sc);
    const box = document.createElement('div');
    box.className = 'tx';
    box.style.cssText = `padding:${st.pad}px;justify-content:${{
        top: 'flex-start',
        middle: 'center',
        bottom: 'flex-end'
    }[st.va] || 'flex-start'}`;
    const rt = document.createElement('div');
    rt.className = 'rt';
    rt.style.cssText = `font-family:${sc.family(st.font)};font-size:${st.size}px;font-weight:${st.bold ? 700 : 400};font-style:${st.italic ? 'italic' : 'normal'};text-decoration:${st.under ? 'underline' : 'none'};text-transform:${st.caps ? 'uppercase' : 'none'};color:${sc.color(st.color)};text-align:${st.align};line-height:${st.lh};letter-spacing:${st.ls}px`;
    if (isEmpty(el.html) && el.ph && mode === 'edit') {
        rt.classList.add('ph');
        const p = document.createElement('p');
        p.textContent = el.ph;
        rt.append(p);
    } else rt.append(fragment(el.html, (k, v) => (k === 'color' ? sc.color(v) : sc.family(v))));
    box.append(rt);
    return box;
}

function svg(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] !== '' && attrs[k] != null) e.setAttribute(k, attrs[k]);
    parent?.append(e);
    return e;
}

function shapeNode(el, sc) {
    const w = el.w, h = el.h, root = svg('svg', {viewBox: `0 0 ${w} ${h}`, width: w, height: h});
    root.classList.add('shp');
    const sw = el.sw ?? (el.shape === 'line' ? 3 * sc.s : 0);
    const stroke = sc.color(el.stroke || (el.shape === 'line' ? el.fill || '@fg' : sw ? '@fg' : ''));
    const dash = el.dash === 'dash' ? `${sw * 3} ${sw * 2}` : el.dash === 'dot' ? `0 ${sw * 2}` : '';
    if (el.shape === 'line') {
        const l = lineHeads(el, w, h, sw);
        svg('line', {
            x1: l.x1,
            y1: l.y,
            x2: l.x2,
            y2: l.y,
            stroke,
            'stroke-width': sw,
            'stroke-dasharray': dash,
            'stroke-linecap': el.dash === 'dot' ? 'round' : 'butt'
        }, root);
        for (const hd of l.heads) svg('path', {d: toSvgPath(hd), fill: stroke}, root);
        svg('line', {
            x1: 0,
            y1: l.y,
            x2: w,
            y2: l.y,
            stroke: 'transparent',
            'stroke-width': Math.max(sw, 18),
            class: 'hit'
        }, root);
        return root;
    }
    let fill = 'none';
    const g = gradient(el.fill);
    if (g) {
        const id = 'spg' + ++gid, a = (g.ang - 90) * Math.PI / 180;
        // the same line CSS uses, on the real box (userSpaceOnUse), so a gradient looks alike everywhere
        const len = Math.abs(w * Math.sin(g.ang * Math.PI / 180)) + Math.abs(h * Math.cos(g.ang * Math.PI / 180)),
            dx = Math.cos(a) * len / 2, dy = Math.sin(a) * len / 2;
        const lg = svg('linearGradient', {
            id,
            gradientUnits: 'userSpaceOnUse',
            x1: w / 2 - dx,
            y1: h / 2 - dy,
            x2: w / 2 + dx,
            y2: h / 2 + dy
        }, svg('defs', {}, root));
        svg('stop', {offset: 0, 'stop-color': sc.color(g.a)}, lg);
        svg('stop', {offset: 1, 'stop-color': sc.color(g.b)}, lg);
        fill = `url(#${id})`;
    } else if (el.fill) fill = sc.color(el.fill);
    const p = svg('path', {
        d: toSvgPath(pathOf(el)),
        fill: el.open ? 'none' : fill,
        'fill-rule': 'evenodd',
        stroke: sw ? stroke : '',
        'stroke-width': sw || '',
        'stroke-dasharray': dash,
        'stroke-linecap': el.dash === 'dot' || el.cap ? 'round' : '',
        'stroke-linejoin': 'round'
    }, root);
    if (el.flip) p.setAttribute('transform', `translate(${w} 0) scale(-1 1)`);
    return root;
}

function imageNode(el, sc, mode, isVideo) {
    const box = document.createElement('div');
    box.className = 'im';
    const src = mediaUrl(isVideo ? el.poster : el.src);
    if (el.mask && el.mask !== 'rect') box.style.clipPath = `path(evenodd, "${toSvgPath(shapePath(el.mask, el.w, el.h, el.rad || 0))}")`;
    else if (el.rad) box.style.borderRadius = Math.min(el.rad, el.w / 2, el.h / 2) + 'px';
    if (el.fill) box.style.background = cssFill(el.fill, sc);
    if (src) {
        const im = document.createElement('img');
        im.src = src;
        im.alt = el.alt || '';
        im.draggable = false;
        im.decoding = 'async';
        const fx = el.fx ?? .5, fy = el.fy ?? .5;
        im.style.cssText = `object-fit:${el.fit || 'cover'};object-position:${fx * 100}% ${fy * 100}%;transform:${el.flip ? 'scaleX(-1) ' : ''}scale(${el.zoom || 1});transform-origin:${fx * 100}% ${fy * 100}%`;
        box.append(im);
    } else {
        box.classList.add('empty');
        box.style.background = isVideo ? '#14181b' : sc.colors.surface;
        box.style.color = isVideo ? '#fff' : sc.colors.muted;
        box.innerHTML = isVideo ? '' : '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5L5 20"/></svg>';
    }
    if (isVideo && mode !== 'export') {
        const b = document.createElement('div');
        b.className = 'playbadge';
        b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>';
        box.append(b);
    }
    return box;
}

/** One element. mode: view | edit | thumb | present | export */
export function elementNode(el, sc, mode = 'view') {
    const n = document.createElement('div');
    n.className = 'el el-' + el.t + (el.lock ? ' locked' : '');
    if (el.id) n.dataset.id = el.id;
    if (el.link && mode !== 'edit') n.classList.add('linked');
    n.style.cssText = `left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;${el.r ? `transform:rotate(${el.r}deg);` : ''}${el.o != null && el.o < 1 ? `opacity:${el.o};` : ''}`;
    if (isCompound(el)) {
        for (const p of partsOf(el, sc)) {
            const c = elementNode(p, sc, 'thumb');
            c.classList.add('part');
            n.append(c);
        }
        if (el.alt) {
            n.setAttribute('role', 'img');
            n.setAttribute('aria-label', el.alt);
        }
        if (el.shadow) n.style.filter = `drop-shadow(${SHADOWS[el.shadow]})`;
    } else if (el.t === 'shape') {
        n.append(shapeNode(el, sc));
        if (el.shadow) n.style.filter = `drop-shadow(${SHADOWS[el.shadow]})`;
        if (el.shape !== 'line' && (!isEmpty(el.html) || mode === 'edit')) n.append(textNode(el, sc, mode));
    } else if (el.t === 'text') {
        if (el.fill) n.style.background = cssFill(el.fill, sc);
        if (el.rad) n.style.borderRadius = el.rad + 'px';
        if (el.sw && el.stroke) n.style.border = `${el.sw}px solid ${sc.color(el.stroke)}`;
        if (el.shadow) n.style.boxShadow = SHADOWS[el.shadow];
        n.append(textNode(el, sc, mode));
    } else {
        const im = imageNode(el, sc, mode, el.t === 'video');
        if (el.shadow) {
            if (el.mask && el.mask !== 'rect') n.style.filter = `drop-shadow(${SHADOWS[el.shadow]})`; else {
                n.style.boxShadow = SHADOWS[el.shadow];
                n.style.borderRadius = (el.rad || 0) + 'px';
            }
        }if (el.sw && el.stroke) { im.style.outline = `${el.sw}px solid ${sc.color(el.stroke)}`; im.style.outlineOffset = `-${el.sw}px`; }
    n.append(im);
    if (isCited(el)) { const c = elementNode(citeOf(el, sc), sc, 'thumb'); c.classList.add('part'); n.append(c); }
    }
    return n;
}

/** A whole slide at its real size (scale it with fit()). */
export function slideNode(d, ctx, {mode = 'view', index = -1, count = 0} = {}) {
    const sc = slideContext(ctx, d);
    const n = document.createElement('div');
    n.className = 'sl sl-' + mode;
    n.style.width = ctx.W + 'px';
    n.style.height = ctx.H + 'px';
    applyBg(n, d, sc);
    const {under, over} = decorOf(d, sc, index, count);
    for (const e of under) {
        const x = elementNode(e, sc, mode === 'edit' ? 'view' : mode);
        x.classList.add('decor');
        n.append(x);
    }
    for (const e of sorted(d)) n.append(elementNode(e, sc, mode));
    for (const e of over) {
        const x = elementNode(e, sc, 'view');
        x.classList.add('decor');
        n.append(x);
    }
    return n;
}

/** A box of the given width with the slide scaled inside. */
export function thumb(d, ctx, width, opt = {}) {
    const box = document.createElement('div');
    box.className = 'thumb';
    const k = width / ctx.W;
    box.style.width = width + 'px';
    box.style.height = ctx.H * k + 'px';
    const s = slideNode(d, ctx, {mode: 'thumb', ...opt});
    s.style.transform = `scale(${k})`;
    s.style.transformOrigin = '0 0';
    box.append(s);
    return box;
}

/** A thumbnail that follows the width of its container. */
export function fluidThumb(d, ctx, opt = {}) {
    const box = document.createElement('div');
    box.className = 'thumb fluid';
    box.style.aspectRatio = `${ctx.W} / ${ctx.H}`;
    const s = slideNode(d, ctx, {mode: 'thumb', ...opt});
    s.style.transformOrigin = '0 0';
    box.append(s);
    const fit = () => {
        if (box.clientWidth) s.style.transform = `scale(${box.clientWidth / ctx.W})`;
    };
    new ResizeObserver(fit).observe(box);
    return box;
}
