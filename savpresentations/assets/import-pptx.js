/** Opening a PPTX: text boxes, shapes, pictures, backgrounds and notes, with their place and main formatting. */
import {uid, uploadPicture} from './core.js';
import {esc} from './richtext.js';
import {FONTS} from './themes.js';

const E = 9525;
const kids = (n, name) => (n ? [...n.children].filter((c) => c.localName === name) : []);
const kid = (n, ...path) => path.reduce((a, p) => kids(a, p)[0] || null, n);
const all = (n, name) => (n ? [...n.getElementsByTagName('*')].filter((c) => c.localName === name) : []);
const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');
const PR = {
    roundRect: 'round',
    ellipse: 'ellipse',
    triangle: 'triangle',
    rtTriangle: 'rtriangle',
    diamond: 'diamond',
    pentagon: 'pentagon',
    hexagon: 'hexagon',
    octagon: 'octagon',
    parallelogram: 'parallelogram',
    trapezoid: 'trapezoid',
    star5: 'star',
    star4: 'star4',
    star12: 'burst',
    rightArrow: 'arrow',
    leftRightArrow: 'arrow2',
    chevron: 'chevron',
    homePlate: 'homeplate',
    mathPlus: 'plus',
    plus: 'plus',
    heart: 'heart',
    cloud: 'cloud',
    wedgeRectCallout: 'speech',
    wedgeRoundRectCallout: 'speech',
    donut: 'ring',
    frame: 'frame',
    teardrop: 'drop',
    wave: 'wave',
    moon: 'moon',
    line: 'line',
    straightConnector1: 'line',
    bentConnector3: 'line'
};

export async function readPptx(z, name) {
    const xml = async (p) => {
        const s = await z.text(p);
        return s ? parse(s) : null;
    };
    const rels = async (p) => {
        const i = p.lastIndexOf('/'), d = await xml(p.slice(0, i) + '/_rels' + p.slice(i) + '.rels'), out = {};
        if (d) for (const r of all(d, 'Relationship')) out[r.getAttribute('Id')] = {
            type: r.getAttribute('Type').split('/').pop(),
            ext: r.getAttribute('TargetMode') === 'External',
            target: r.getAttribute('TargetMode') === 'External' ? r.getAttribute('Target') : join(p.slice(0, i), r.getAttribute('Target'))
        };
        return out;
    };
    const join = (base, t) => {
        if (t[0] === '/') return t.slice(1);
        const a = base.split('/');
        for (const s of t.split('/')) {
            if (s === '..') a.pop(); else if (s !== '.') a.push(s);
        }
        return a.join('/');
    };
    const pres = await xml('ppt/presentation.xml'), prel = await rels('ppt/presentation.xml'),
        sz = all(pres, 'sldSz')[0];
    const W = Math.round(+(sz?.getAttribute('cx') || 12192000) / E),
        H = Math.round(+(sz?.getAttribute('cy') || 6858000) / E);
    // colours of the theme
    const themePath = Object.values(prel).find((r) => r.type === 'theme')?.target || 'ppt/theme/theme1.xml',
        th = await xml(themePath), scheme = {};
    if (th) for (const c of all(th, 'clrScheme')[0]?.children || []) {
        const v = c.children[0];
        scheme[c.localName] = '#' + (v?.getAttribute('val')?.match(/^[0-9a-f]{6}$/i)?.[0] || v?.getAttribute('lastClr') || '000000').toLowerCase();
    }
    const alias = {bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2'};
    const color = (n) => {
        const c = n && [...n.children].find((x) => /Clr$/.test(x.localName));
        if (!c) return '';
        let hex = c.localName === 'srgbClr' ? '#' + c.getAttribute('val').toLowerCase() : c.localName === 'sysClr' ? '#' + (c.getAttribute('lastClr') || '000000').toLowerCase() : c.localName === 'schemeClr' ? scheme[alias[c.getAttribute('val')] || c.getAttribute('val')] || '#000000' : '#000000';
        if (!/^#[0-9a-f]{6}$/.test(hex)) hex = '#000000';
        let rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        const get = (k) => {
            const x = kid(c, k);
            return x ? +x.getAttribute('val') / 1e5 : null;
        }, mod = get('lumMod'), off = get('lumOff'), shade = get('shade'), tint = get('tint'), alpha = get('alpha');
        if (mod != null) rgb = rgb.map((v) => v * mod);
        if (off != null) rgb = rgb.map((v) => v + 255 * off);
        if (shade != null) rgb = rgb.map((v) => v * shade);
        if (tint != null) rgb = rgb.map((v) => v + (255 - v) * (1 - tint));
        const h2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
        return '#' + rgb.map(h2).join('') + (alpha != null && alpha < 1 ? h2(alpha * 255) : '');
    };
    const fill = (n) => {
        if (!n) return null;
        const s = kid(n, 'solidFill');
        if (s) return color(s);
        const g = kid(n, 'gradFill');
        if (g) {
            const st = all(g, 'gs'), a = color(st[0]), b = color(st[st.length - 1]), l = kid(g, 'lin');
            return a && b ? `g|${Math.round(((+(l?.getAttribute('ang') || 0) / 60000) + 90) % 360)}|${a}|${b}` : a;
        }
        return kid(n, 'noFill') ? '' : null;
    };
    const fontId = (f) => {
        if (!f) return null;
        if (f.startsWith('+mj')) return '@head';
        if (f.startsWith('+mn')) return '@body';
        const l = f.toLowerCase(), m = Object.entries(FONTS).find(([, v]) => v[0].toLowerCase() === l);
        if (m) return m[0];
        return /georgia|times|garamond|cambria|serif|palatino|book/i.test(l) && !/sans/i.test(l) ? 'ptserif' : /courier|mono|consol/i.test(l) ? 'mono' : null;
    };
    const cache = new Map();
    const upload = async (path) => {
        if (!cache.has(path)) cache.set(path, (async () => {
            const b = await z.bytes(path), ext = path.split('.').pop().toLowerCase();
            if (!b || !/^(png|jpe?g|gif|webp)$/.test(ext)) return null;
            try {
                return await uploadPicture(new File([b], path.split('/').pop(), {type: 'image/' + ext.replace('jpg', 'jpeg')}));
            } catch {
                return null;
            }
        })());
        return cache.get(path);
    };

    const slides = [];
    const ids = all(pres, 'sldId').map((s) => prel[s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')]?.target).filter(Boolean);
    for (const path of ids.slice(0, 300)) {
        const doc = await xml(path), rel = await rels(path);
        if (!doc) continue;
        const layPath = Object.values(rel).find((r) => r.type === 'slideLayout')?.target,
            lay = layPath && (await xml(layPath)), layRel = layPath ? await rels(layPath) : {},
            masPath = Object.values(layRel).find((r) => r.type === 'slideMaster')?.target,
            mas = masPath && (await xml(masPath));
        const els = {};
        let zi = 0;
        const phOf = (sp) => all(sp, 'ph')[0];
        const inherit = (ph, sel) => {
            for (const d of [lay, mas]) {
                if (!d || !ph) continue;
                const ty = ph.getAttribute('type') || 'body', ix = ph.getAttribute('idx');
                const m = all(d, 'sp').find((s) => {
                    const q = phOf(s);
                    return q && ((ix && q.getAttribute('idx') === ix) || (q.getAttribute('type') || 'body') === ty || (ty === 'ctrTitle' && q.getAttribute('type') === 'title') || (ty === 'subTitle' && (q.getAttribute('type') || 'body') === 'body'));
                });
                const v = m && sel(m);
                if (v) return v;
            }
            return null;
        };
        const boxOf = (x, tr) => {
            const o = kid(x, 'off'), e = kid(x, 'ext');
            if (!o || !e) return null;
            return {
                x: (+o.getAttribute('x') * tr.sx + tr.x) / E,
                y: (+o.getAttribute('y') * tr.sy + tr.y) / E,
                w: Math.max(1, +e.getAttribute('cx') * tr.sx / E),
                h: Math.max(1, +e.getAttribute('cy') * tr.sy / E),
                r: +(x.getAttribute('rot') || 0) / 60000
            };
        };
        const walk = async (tree, tr) => {
            for (const n of tree.children) {
                if (n.localName === 'grpSp') {
                    const x = kid(n, 'grpSpPr', 'xfrm');
                    let t2 = tr;
                    if (x) {
                        const o = kid(x, 'off'), e = kid(x, 'ext'), co = kid(x, 'chOff'), ce = kid(x, 'chExt'),
                            sx = ce && +ce.getAttribute('cx') ? +e.getAttribute('cx') / +ce.getAttribute('cx') : 1,
                            sy = ce && +ce.getAttribute('cy') ? +e.getAttribute('cy') / +ce.getAttribute('cy') : 1;
                        t2 = {
                            sx: tr.sx * sx,
                            sy: tr.sy * sy,
                            x: tr.x + (+o.getAttribute('x') - +(co?.getAttribute('x') || 0) * sx) * tr.sx,
                            y: tr.y + (+o.getAttribute('y') - +(co?.getAttribute('y') || 0) * sy) * tr.sy
                        };
                    }
                    await walk(n, t2);
                    continue;
                }
                if (!['sp', 'pic', 'cxnSp'].includes(n.localName)) continue;
                const pr = kid(n, 'spPr'), ph = phOf(n),
                    xf = kid(pr, 'xfrm') || inherit(ph, (m) => kid(m, 'spPr', 'xfrm'));
                const box = xf && boxOf(xf, tr);
                if (!box) continue;
                const round = (v) => Math.round(v * 10) / 10;
                const el = {x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h), z: ++zi};
                if (box.r) el.r = box.r > 180 ? box.r - 360 : box.r;
                const ln = kid(pr, 'ln'), lc = ln && fill(ln), lw = ln ? +(ln.getAttribute('w') || 9525) / E : 0;
                if (n.localName === 'pic') {
                    const blip = all(n, 'blip')[0],
                        id = blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'),
                        m = id && rel[id] && (await upload(rel[id].target));
                    if (!m) continue;
                    const cr = all(n, 'srcRect')[0], c = (k) => +(cr?.getAttribute(k) || 0) / 1e5, l = c('l'),
                        r = c('r'), tp = c('t'), bt = c('b');
                    Object.assign(el, {
                        t: 'image',
                        src: m.src,
                        fit: 'cover',
                        fx: l + r > 0 ? Math.max(0, Math.min(1, l / (l + r))) : .5,
                        fy: tp + bt > 0 ? Math.max(0, Math.min(1, tp / (tp + bt))) : .5,
                        alt: all(n, 'cNvPr')[0]?.getAttribute('descr') || ''
                    });
                    const z2 = Math.min(1 / (1 - l - r || 1), 1 / (1 - tp - bt || 1));
                    if (z2 > 1.02) el.zoom = Math.min(8, z2);
                } else {
                    const geo = kid(pr, 'prstGeom')?.getAttribute('prst'),
                        shape = n.localName === 'cxnSp' ? 'line' : PR[geo] || 'rect', f = fill(pr),
                        tb = kid(n, 'txBody');
                    const html = tb ? paragraphsHtml(tb, rel) : {html: ''};
                    if (shape === 'line') {
                        const len = Math.hypot(el.w, el.h), fl = xf.getAttribute('flipV') === '1' ? -1 : 1,
                            fh = xf.getAttribute('flipH') === '1' ? -1 : 1,
                            a = Math.atan2(el.h * fl * fh, el.w) * 180 / Math.PI, cx = el.x + el.w / 2,
                            cy = el.y + el.h / 2;
                        Object.assign(el, {
                            t: 'shape',
                            shape: 'line',
                            w: Math.max(2, round(len)),
                            h: 24,
                            x: round(cx - len / 2),
                            y: round(cy - 12),
                            r: round(a + (el.r || 0)),
                            stroke: lc || '@fg',
                            sw: Math.max(1, lw || 1)
                        });
                        if (kid(ln, 'tailEnd') && kid(ln, 'tailEnd').getAttribute('type') !== 'none') el.h2 = 'arrow';
                        if (kid(ln, 'headEnd') && kid(ln, 'headEnd').getAttribute('type') !== 'none') el.h1 = 'arrow';
                    } else {
                        const isText = !f && !lc && shape === 'rect';
                        if (isText && !html.html) {
                            zi--;
                            continue;
                        }
                        Object.assign(el, isText ? {t: 'text'} : {t: 'shape', shape, fill: f || ''});
                        if (lc) {
                            el.stroke = lc;
                            el.sw = Math.round(lw * 10) / 10 || 1;
                        }
                        if (shape === 'round') el.rad = Math.round(Math.min(el.w, el.h) * Math.min(.5, +(all(pr, 'gd')[0]?.getAttribute('fmla')?.match(/\d+/)?.[0] || 16667) / 1e5));
                        if (html.html) {
                            const ty = ph?.getAttribute('type') || '', title = /title/i.test(ty);
                            const defSz = +(inherit(ph, (m) => all(m, 'defRPr')[0]?.getAttribute('sz')) || (mas && all(kid(mas.documentElement, 'txStyles', title ? 'titleStyle' : ph ? 'bodyStyle' : 'otherStyle'), 'defRPr')[0]?.getAttribute('sz')) || 1800);
                            const bp = kid(tb, 'bodyPr'),
                                anchor = bp?.getAttribute('anchor') || inherit(ph, (m) => kid(m, 'txBody', 'bodyPr')?.getAttribute('anchor')) || 't';
                            Object.assign(el, {
                                role: title ? 'heading' : 'body',
                                html: html.html,
                                size: Math.round((html.size || defSz) / 75 * 10) / 10,
                                color: html.color || '@fg',
                                align: html.align || (ty === 'ctrTitle' || ty === 'subTitle' ? 'center' : el.t === 'shape' ? 'center' : 'left'),
                                va: {t: 'top', ctr: 'middle', b: 'bottom'}[anchor] || 'top',
                                lh: 1.2,
                                bold: html.bold ? 1 : 0,
                                pad: 9
                            });
                            if (html.font) el.font = html.font;
                        }
                    }
                }
                els[uid()] = el;
            }
        };
        await walk(kid(doc.documentElement, 'cSld', 'spTree'), {sx: 1, sy: 1, x: 0, y: 0});
        let bg = null;
        for (const [d, rl] of [[doc, rel], [lay, layRel], [mas, masPath ? await rels(masPath) : {}]]) {
            const b = d && kid(d.documentElement, 'cSld', 'bg'), p = b && kid(b, 'bgPr');
            if (!b) continue;
            const f = p ? fill(p) : color(kid(b, 'bgRef'));
            if (f?.startsWith('g|')) {
                const q = f.split('|');
                bg = {t: 'g', ang: +q[1], a: q[2], b: q[3]};
            } else if (f) bg = {t: 'c', c: f.slice(0, 7)};
            else {
                const bl = p && all(p, 'blip')[0],
                    id = bl?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'),
                    m = id && rl[id] && (await upload(rl[id].target));
                if (m) bg = {t: 'i', src: m.src, dim: 0};
            }
            if (bg) break;
        }
        const np = Object.values(rel).find((r) => r.type === 'notesSlide')?.target, nd = np && (await xml(np));
        const notes = nd ? all(nd, 'sp').filter((s) => phOf(s)?.getAttribute('type') === 'body').map((s) => all(s, 'p').map((p) => all(p, 't').map((q) => q.textContent).join('')).join('\n')).join('\n').trim() : '';
        slides.push({
            sid: uid(),
            pos: slides.length + 1,
            d: {
                layout: 'blank',
                variant: 'plain',
                els, ...(bg ? {bg} : {}), ...(notes ? {notes} : {}), ...(doc.documentElement.getAttribute('show') === '0' ? {hide: 1} : {})
            }
        });
    }

    function paragraphsHtml(tb, rel) {
        let html = '', list = null, size = 0, color0 = '', align = '', font = null, bold = true, any = false;
        const runs = all(tb, 'r');
        for (const r of runs) {
            const s = +(kid(r, 'rPr')?.getAttribute('sz') || 0);
            if (s > size) size = s;
        }
        const first = kid(runs[0], 'rPr');
        if (first) {
            color0 = fill(first) || '';
            font = fontId(kid(first, 'latin')?.getAttribute('typeface'));
        }
        if (color0.startsWith('g|')) color0 = color0.split('|')[2];
        for (const p of kids(tb, 'p')) {
            const ppr = kid(p, 'pPr'),
                al = {l: 'left', ctr: 'center', r: 'right', just: 'justify'}[ppr?.getAttribute('algn')];
            if (al && !align) align = al;
            const bul = ppr && (kid(ppr, 'buChar') ? 'ul' : kid(ppr, 'buAutoNum') ? 'ol' : null);
            let inner = '';
            for (const r of p.children) {
                if (r.localName === 'br') inner += '<br>';
                if (r.localName !== 'r' && r.localName !== 'fld') continue;
                const rp = kid(r, 'rPr'), tx = kid(r, 't')?.textContent || '';
                if (!tx) continue;
                let s = esc(tx);
                any = true;
                if (rp?.getAttribute('b') !== '1') bold = false;
                const c = rp && fill(rp), sz = +(rp?.getAttribute('sz') || 0);
                let at = '';
                if (c && !c.startsWith('g|') && c !== color0) at += ` data-c="${c}"`;
                if (sz && size && sz < size) at += ` data-s="${Math.round(sz / size * 100) / 100}"`;
                if (at) s = `<span${at}>${s}</span>`;
                if (rp?.getAttribute('b') === '1') s = `<b>${s}</b>`;
                if (rp?.getAttribute('i') === '1') s = `<i>${s}</i>`;
                if (rp?.getAttribute('u') && rp.getAttribute('u') !== 'none') s = `<u>${s}</u>`;
                if (rp?.getAttribute('strike') === 'sngStrike') s = `<s>${s}</s>`;
                const hl = rp && kid(rp, 'hlinkClick'),
                    hid = hl?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
                if (hid && rel[hid]?.ext && /^https?:/i.test(rel[hid].target)) s = `<a href="${esc(rel[hid].target)}">${s}</a>`;
                inner += s;
            }
            if (bul && inner) {
                if (list !== bul) {
                    if (list) html += `</${list}>`;
                    html += `<${bul}>`;
                    list = bul;
                }
                html += `<li>${inner}</li>`;
            } else {
                if (list) {
                    html += `</${list}>`;
                    list = null;
                }
                html += `<p${al && al !== align && al !== 'justify' ? ` data-a="${al}"` : ''}>${inner}</p>`;
            }
        }
        if (list) html += `</${list}>`;
        html = html.replace(/(<p><\/p>)+$/, '');
        return {html: any ? html : '', size, color: color0, align, font, bold: any && bold};
    }

    const pick = (k, d) => (/^#[0-9a-f]{6}$/.test(scheme[k] || '') ? scheme[k] : d);
    return {
        title: name.replace(/\.pptx$/i, ''),
        meta: {
            format: {
                id: Math.abs(W / H - 16 / 9) < .02 ? '16-9' : Math.abs(W / H - 4 / 3) < .02 ? '4-3' : 'custom',
                w: Math.max(200, Math.min(4000, W)),
                h: Math.max(200, Math.min(4000, H))
            },
            theme: {
                id: 'paper',
                colors: {
                    bg: pick('lt1', '#ffffff'),
                    fg: pick('dk1', '#111111'),
                    accent: pick('accent1', '#1f6feb'),
                    accent2: pick('accent2', '#e8590c'),
                    surface: pick('lt2', '#f3f4f6')
                },
                fonts: {}
            },
            opts: {}
        },
        slides
    };
}
