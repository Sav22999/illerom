/** Typefaces inside the PDF: reads a WOFF, keeps only the glyphs used, gives widths and glyph numbers. */
import {inflate} from './zip.js';
import {EXTRA, FONTS} from './themes.js';

const cache = new Map();

/** A face: family id + bold/italic, falling back to the styles the family has. */
export function face(fam, bold, italic) {
    // typefaces not included: those of Bunny Fonts are read from there (Latin, WOFF); the others give way to an included one of the same kind
    if (!FONTS[fam]) {
        const kind = EXTRA[fam]?.[1], slug = fam.startsWith('b:') && fam.slice(2), st = (bold ? '700' : '400') + '-' + (italic ? 'italic' : 'normal');
        const near = {serif: 'lora', monospace: 'mono', cursive: 'caveat'}[kind] || 'inter';
        const key = 'x:' + fam + st;
        if (!cache.has(key)) cache.set(key, slug && /^[a-z0-9-]+$/.test(slug) ? load(key, `https://fonts.bunny.net/${slug}/files/${slug}-latin-${st}.woff`).catch(() => load(key, `https://fonts.bunny.net/${slug}/files/${slug}-latin-400-normal.woff`)).catch(() => face(near, bold, italic)) : face(near, bold, italic));
        return cache.get(key);
    }
    const n = FONTS[fam]?.[2] || 1,
        st = n < 4 ? 'regular' : (bold ? 'bold' : '') + (italic ? 'italic' : '') || 'regular', key = `${fam}-${st}`;
    if (!cache.has(key)) cache.set(key, load(key));
    return cache.get(key);
}

async function load(key, url = `fonts/${key}.woff`) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('font');
    const w = new Uint8Array(await res.arrayBuffer()), v = new DataView(w.buffer);
    if (String.fromCharCode(...w.subarray(0, 4)) !== 'wOFF') throw new Error('font');
    const t = {};
    for (let i = 0, p = 44; i < v.getUint16(12); i++, p += 20) {
        const tag = String.fromCharCode(...w.subarray(p, p + 4)), off = v.getUint32(p + 4), cl = v.getUint32(p + 8),
            ol = v.getUint32(p + 12), raw = w.subarray(off, off + cl);
        t[tag] = cl < ol ? await inflate(raw) : raw.slice();
    }
    const dv = (tag) => new DataView(t[tag].buffer, t[tag].byteOffset, t[tag].byteLength);
    const head = dv('head'), hhea = dv('hhea'), hmtx = dv('hmtx'), maxp = dv('maxp'), os2 = t['OS/2'] && dv('OS/2');
    const upm = head.getUint16(18), nh = hhea.getUint16(34), num = maxp.getUint16(4), long = head.getInt16(50);
    // character -> glyph (format 4 and 12)
    const map = new Map(), c = dv('cmap');
    for (let i = 0; i < c.getUint16(2); i++) {
        const o = c.getUint32(8 + i * 8), f = c.getUint16(o);
        if (f === 4) {
            const seg = c.getUint16(o + 6) / 2;
            for (let s = 0; s < seg; s++) {
                const end = c.getUint16(o + 14 + s * 2), st = c.getUint16(o + 16 + seg * 2 + s * 2),
                    d = c.getUint16(o + 16 + seg * 4 + s * 2), ro = c.getUint16(o + 16 + seg * 6 + s * 2);
                for (let ch = st; ch <= end && ch !== 0xffff; ch++) {
                    let g = ro ? c.getUint16(o + 16 + seg * 6 + s * 2 + ro + (ch - st) * 2) : ch;
                    if (!ro || g) g = (g + d) & 0xffff;
                    if (g && !map.has(ch)) map.set(ch, g);
                }
            }
        } else if (f === 12) for (let s = 0; s < c.getUint32(o + 12); s++) {
            const st = c.getUint32(o + 16 + s * 12), end = c.getUint32(o + 20 + s * 12),
                g = c.getUint32(o + 24 + s * 12);
            for (let ch = st; ch <= end; ch++) if (!map.has(ch)) map.set(ch, g + ch - st);
        }
    }
    const width = (g) => hmtx.getUint16(Math.min(g, nh - 1) * 4) * 1000 / upm;
    return {
        key,
        map,
        width,
        used: new Map([[0, 0]]),
        upm,
        ascent: hhea.getInt16(4) * 1000 / upm,
        descent: hhea.getInt16(6) * 1000 / upm,
        bbox: [36, 38, 40, 42].map((o) => Math.round(head.getInt16(o) * 1000 / upm)),
        weight: os2 ? os2.getUint16(4) : 400,
        glyph(ch) {
            const g = map.get(ch) || 0;
            this.used.set(g, ch);
            return g;
        },
        subset() {
            return subset(t, dv, [...this.used.keys()], num, long);
        },
    };
}

/** The same glyph numbers, but the outlines not used are empty: simple and small once compressed. */
function subset(t, dv, used, num, long) {
    const loca = dv('loca'), glyf = t.glyf, g = dv('glyf'),
        at = (i) => (long ? loca.getUint32(i * 4) : loca.getUint16(i * 2) * 2);
    const keep = new Set(used);
    for (const i of keep) { // pieces of composite glyphs
        const s = at(i), e = at(i + 1);
        if (e <= s || g.getInt16(s) >= 0) continue;
        let p = s + 10, fl;
        do {
            fl = g.getUint16(p);
            keep.add(g.getUint16(p + 2));
            p += 4 + (fl & 1 ? 4 : 2) + (fl & 8 ? 2 : fl & 64 ? 4 : fl & 128 ? 8 : 0);
        } while (fl & 32);
    }
    const parts = [], nl = new DataView(new ArrayBuffer((num + 1) * 4));
    let off = 0;
    for (let i = 0; i < num; i++) {
        nl.setUint32(i * 4, off);
        if (keep.has(i)) {
            const b = glyf.subarray(at(i), at(i + 1)), pad = (4 - b.length % 4) % 4;
            parts.push(b, new Uint8Array(pad));
            off += b.length + pad;
        }
    }
    nl.setUint32(num * 4, off);
    const ng = new Uint8Array(off);
    let p = 0;
    for (const b of parts) {
        ng.set(b, p);
        p += b.length;
    }
    const head = t.head.slice();
    new DataView(head.buffer).setInt16(50, 1);
    const tabs = {
        cmap: t.cmap,
        glyf: ng,
        head,
        hhea: t.hhea,
        hmtx: t.hmtx,
        loca: new Uint8Array(nl.buffer),
        maxp: t.maxp
    };
    for (const k of ['cvt ', 'fpgm', 'prep']) if (t[k]) tabs[k] = t[k];
    const names = Object.keys(tabs).sort(), n = names.length, lg = Math.floor(Math.log2(n)), size = 12 + n * 16;
    let total = size;
    for (const k of names) total += (tabs[k].length + 3) & ~3;
    const out = new Uint8Array(total), o = new DataView(out.buffer);
    o.setUint32(0, 0x00010000);
    o.setUint16(4, n);
    o.setUint16(6, 16 << lg);
    o.setUint16(8, lg);
    o.setUint16(10, n * 16 - (16 << lg));
    let at2 = size;
    names.forEach((k, i) => {
        const b = tabs[k], r = 12 + i * 16;
        for (let j = 0; j < 4; j++) out[r + j] = k.charCodeAt(j);
        out.set(b, at2);
        let sum = 0;
        for (let j = 0; j < b.length; j += 4) sum = (sum + ((b[j] << 24 | (b[j + 1] || 0) << 16 | (b[j + 2] || 0) << 8 | (b[j + 3] || 0)) >>> 0)) >>> 0;
        o.setUint32(r + 4, sum);
        o.setUint32(r + 8, at2);
        o.setUint32(r + 12, b.length);
        at2 += (b.length + 3) & ~3;
    });
    return out;
}
