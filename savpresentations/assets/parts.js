/**
 * Charts, tables and icons. They are stored as data and drawn as ordinary shapes and texts (parts), so the slide, the
 * show, the PDF, the PPTX and the ODP all show exactly the same thing, with vectors and selectable text.
 */
import {esc} from './richtext.js';
import {ICON_PATHS} from './icons-lib.js';

const sh = (shape, x, y, w, h, fill, more) => ({t: 'shape', shape, x, y, w, h, fill, ...more});
const tx = (x, y, w, h, text, more) => ({
    t: 'text',
    role: 'body',
    x,
    y,
    w,
    h,
    html: `<p>${esc(text)}</p>`,
    lh: 1.2,
    va: 'middle', ...more
});
const path = (x, y, w, h, cmds, more) => ({t: 'shape', shape: 'rect', x, y, w, h, cmds, ...more});
const num = (v) => {
    const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};

export const CHARTS = ['bar', 'stack', 'hbar', 'line', 'area', 'pie', 'donut', 'radar', 'scatter'];
export const CHART_ICONS = {
    bar: 'chart-column',
    stack: 'chart-column-stacked',
    hbar: 'chart-bar',
    line: 'chart-line',
    area: 'chart-area',
    pie: 'chart-pie',
    donut: 'circle-dot',
    radar: 'radar',
    scatter: 'chart-scatter'
};
export const sampleChart = (names) => ({
    labels: names.labels,
    series: [{name: names.a, values: [24, 38, 31, 52]}, {name: names.b, values: [18, 26, 40, 44]}]
});
export const sampleTable = (h) => [[h + ' 1', h + ' 2', h + ' 3'], ['', '', ''], ['', '', ''], ['', '', '']];

/** Colours of the series: accent, second accent, then lighter versions of both. */
export function seriesColors(sc, n) {
    const a = sc.colors.accent, b = sc.colors.accent2, bg = sc.colors.bg, out = [a, b];
    const mix = (c, d, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(c.slice(i, i + 2), 16) * (1 - k) + parseInt(d.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
    for (let k = .35; out.length < n; k = Math.min(.85, k + .22)) out.push(mix(a, bg, k), mix(b, bg, k));
    return out.slice(0, Math.max(n, 1));
}

/** Round steps for the axis: 1, 2, 2.5 or 5 times a power of ten. */
function ticks(max, n = 4) {
    if (max <= 0) return [0, 1];
    const raw = max / n, p = 10 ** Math.floor(Math.log10(raw)),
        st = [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= raw);
    const out = [];
    for (let v = 0; v < max + st * .999; v += st) out.push(Math.round(v * 1e6) / 1e6);
    return out;
}

const fmt = (v) => (Math.abs(v) >= 1e6 ? +(v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e4 ? +(v / 1e3).toFixed(1) + 'k' : String(+v.toFixed(2)));

/** An arc of a circle as cubic curves. */
function arc(cx, cy, r, a0, a1, move) {
    const out = [], n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2))), st = (a1 - a0) / n,
        k = 4 / 3 * Math.tan(st / 4);
    if (move) out.push([move, cx + r * Math.cos(a0), cy + r * Math.sin(a0)]);
    for (let i = 0; i < n; i++) {
        const p = a0 + i * st, q = p + st;
        out.push(['C', cx + r * (Math.cos(p) - k * Math.sin(p)), cy + r * (Math.sin(p) + k * Math.cos(p)), cx + r * (Math.cos(q) + k * Math.sin(q)), cy + r * (Math.sin(q) - k * Math.cos(q)), cx + r * Math.cos(q), cy + r * Math.sin(q)]);
    }
    return out;
}

export function chartParts(el, sc) {
    const d = el.chart || {labels: [], series: []}, W = el.w, H = el.h, s = (el.size || 15 * sc.s), out = [];
    const labels = d.labels || [], series = (d.series || []).filter((x) => x.values?.length), type = el.ct || 'bar',
        round = type === 'pie' || type === 'donut';
    if (!series.length) return [sh('rect', 0, 0, W, H, '@surface', {rad: 12})];
    const cols = seriesColors(sc, round ? Math.max(labels.length, series[0].values.length) : series.length);
    const txt = (x, y, w, t, more) => tx(x, y, w, s * 1.5, t, {size: s, color: el.color || '@muted', ...more});
    let top = 0;
    // legend
    const names = round ? labels.map((l, i) => [l, cols[i]]) : series.length > 1 || series[0].name ? series.map((x, i) => [x.name || '', cols[i]]) : [];
    const legend = el.legend !== 0 && names.length;
    if (legend && !round) {
        let x = 0;
        for (const [n, c] of names) {
            const w = Math.min(W * .4, (String(n).length * .58 + 2.4) * s);
            if (x + w > W) {
                x = 0;
                top += s * 1.6;
            }
            out.push(sh('ellipse', x, top + s * .4, s * .75, s * .75, c), txt(x + s * 1.1, top, Math.max(1, w - s * 1.1), n, {color: el.color || '@fg'}));
            x += w + s;
        }
        top += s * 2.2;
    }
    if (round) {
        const vals = series[0].values.map((v) => Math.max(0, num(v))), tot = vals.reduce((a, b) => a + b, 0) || 1,
            lw = legend ? Math.min(W * .42, s * 14) : 0, R = Math.max(1, Math.min(W - lw, H) / 2), cx = R, cy = H / 2,
            ir = type === 'donut' ? R * .58 : 0;
        let a = -Math.PI / 2;
        vals.forEach((v, i) => {
            if (!v) return;
            const b = a + v / tot * Math.PI * 2 * (v === tot ? .99999 : 1);
            const cmds = ir ? [...arc(cx, cy, R, a, b, 'M'), ['L', cx + ir * Math.cos(b), cy + ir * Math.sin(b)], ...arc(cx, cy, ir, b, a), ['Z']] : [['M', cx, cy], ['L', cx + R * Math.cos(a), cy + R * Math.sin(a)], ...arc(cx, cy, R, a, b), ['Z']];
            out.push(path(0, 0, W, H, cmds, {fill: cols[i], stroke: '@bg', sw: 2}));
            if (el.vals !== 0 && v / tot > .05) {
                const m = (a + b) / 2, rr = ir ? (R + ir) / 2 : R * .66;
                out.push(tx(cx + rr * Math.cos(m) - s * 2, cy + rr * Math.sin(m) - s * .75, s * 4, s * 1.5, Math.round(v / tot * 100) + '%', {
                    size: s,
                    bold: 1,
                    align: 'center',
                    color: '@onaccent'
                }));
            }
            a = b;
        });
        if (legend) names.forEach(([n, c], i) => {
            const y = cy - names.length * s * .95 + i * s * 1.9, x = R * 2 + s * 1.6;
            out.push(sh('ellipse', x, y + s * .4, s * .75, s * .75, c), txt(x + s * 1.2, y, Math.max(1, W - x - s * 1.2), n, {color: el.color || '@fg'}));
        });
        return out;
    }
    if (type === 'radar') {
        const n = Math.max(3, labels.length, ...series.map((x) => x.values.length)),
            mx = Math.max(0, ...series.flatMap((x) => x.values.map(num))), tkr = ticks(mx, 3), m = tkr[tkr.length - 1],
            R = Math.max(1, Math.min(W / 2 - s * 4, (H - top) / 2 - s * 1.8)), cx = W / 2, cy = top + (H - top) / 2;
        const P = (i, v) => {
            const a = -Math.PI / 2 + i * Math.PI * 2 / n;
            return [cx + Math.cos(a) * R * v / m, cy + Math.sin(a) * R * v / m];
        }, ring = (v) => [...Array.from({length: n}, (_, i) => [i ? 'L' : 'M', ...P(i, v)]), ['Z']];
        for (const v of tkr.slice(1)) out.push(path(0, 0, W, H, ring(v), {
            fill: '',
            stroke: '@muted',
            sw: 1,
            o: .35,
            open: 1
        }));
        for (let i = 0; i < n; i++) {
            const [a, b] = P(i, m);
            out.push(path(0, 0, W, H, [['M', cx, cy], ['L', a, b]], {
                fill: '',
                stroke: '@muted',
                sw: 1,
                o: .3,
                open: 1
            }));
            const [p, q] = P(i, m * 1.02), k = (p - cx) / R;
            out.push(txt(p - s * 5 + k * s * 5.4, q - s * .75 + (q - cy) / R * s * .9, s * 10, labels[i] ?? '', {
                align: k > .2 ? 'left' : k < -.2 ? 'right' : 'center',
                color: el.color || '@fg'
            }));
        }
        series.forEach((x, j) => {
            const c = Array.from({length: n}, (_, i) => [i ? 'L' : 'M', ...P(i, Math.max(0, num(x.values[i])))]);
            out.push(path(0, 0, W, H, [...c, ['Z']], {fill: cols[j], o: .2}), path(0, 0, W, H, [...c, ['Z']], {
                fill: '',
                stroke: cols[j],
                sw: Math.max(2, s * .18),
                open: 1
            }));
        });
        return out;
    }
    if (type === 'scatter') {
        const xs = labels.map(num), x0 = Math.min(0, ...xs), tx2 = ticks(Math.max(1, ...xs) - x0),
            ty = ticks(Math.max(0, ...series.flatMap((x) => x.values.map(num)))), mx = tx2[tx2.length - 1],
            my = ty[ty.length - 1], lw = Math.max(...ty.map((v) => fmt(v).length)) * s * .62 + s * .8,
            pw = Math.max(1, W - lw - s), ph = Math.max(1, H - top - s * 2.1);
        for (const v of ty) {
            const y = top + ph - v / my * ph;
            out.push(sh('rect', lw, y - .75, pw, 1.5, '@muted', {o: v ? .18 : .5}), txt(0, y - s * .75, Math.max(1, lw - s * .6), fmt(v), {align: 'right'}));
        }
        for (const v of tx2) {
            const x = lw + v / mx * pw;
            out.push(sh('rect', x - .75, top, 1.5, ph, '@muted', {o: .12}), txt(x - s * 2.5, H - s * 1.7, s * 5, fmt(v + x0), {align: 'center'}));
        }
        series.forEach((x, j) => xs.forEach((v, i) => {
            const r = s * .42, yv = num(x.values[i]);
            out.push(sh('ellipse', lw + (v - x0) / mx * pw - r, top + ph - Math.max(0, yv) / my * ph - r, r * 2, r * 2, cols[j], {o: .85}));
            if (el.vals) out.push(txt(lw + (v - x0) / mx * pw - s * 2.5, top + ph - Math.max(0, yv) / my * ph - s * 2, s * 5, fmt(yv), {
                align: 'center',
                color: el.color || '@fg'
            }));
        }));
        return out;
    }
    const sums = type === 'stack' ? Array.from({length: Math.max(...series.map((x) => x.values.length))}, (_, i) => series.reduce((a, x) => a + Math.max(0, num(x.values[i])), 0)) : null;
    const max = Math.max(0, ...(sums || series.flatMap((x) => x.values.map(num)))), tk = ticks(max),
        top1 = tk[tk.length - 1], n = Math.max(labels.length, ...series.map((x) => x.values.length));
    if (type === 'hbar') {
        const lw = Math.min(W * .34, Math.max(...labels.map((l) => String(l).length), 1) * s * .6 + s),
            pw = Math.max(1, W - lw - s * 2), ph = Math.max(1, H - top - s * 1.8), gh = ph / n,
            bh = gh * .7 / series.length;
        for (const v of tk) {
            const x = lw + v / top1 * pw;
            out.push(sh('rect', x, top, 1.5, ph, '@muted', {o: .18}), txt(x - s * 2, H - s * 1.6, s * 4, fmt(v), {align: 'center'}));
        }
        for (let i = 0; i < n; i++) {
            out.push(txt(0, top + gh * (i + .5) - s * .75, Math.max(1, lw - s * .8), labels[i] ?? '', {
                align: 'right',
                color: el.color || '@fg'
            }));
            series.forEach((x, j) => {
                const w = Math.max(0, num(x.values[i])) / top1 * pw;
                if (w > 0) out.push(sh('rect', lw, top + gh * i + gh * .15 + j * bh, w, bh * .9, cols[j], {rad: Math.min(6, bh / 3)}));
                if (el.vals) out.push(txt(lw + w + s * .4, top + gh * i + gh * .15 + (j + .45) * bh - s * .75, s * 5, fmt(num(x.values[i])), {color: el.color || '@fg'}));
            });
        }
        return out;
    }
    const lw = Math.max(...tk.map((v) => fmt(v).length)) * s * .62 + s * .8, pw = Math.max(1, W - lw),
        ph = Math.max(1, H - top - s * 2.1), gw = pw / Math.max(1, n),
        Y = (v) => top + ph - Math.max(0, num(v)) / top1 * ph;
    for (const v of tk) out.push(sh('rect', lw, Y(v) - .75, pw, 1.5, '@muted', {o: v ? .18 : .5}), txt(0, Y(v) - s * .75, Math.max(1, lw - s * .6), fmt(v), {align: 'right'}));
    for (let i = 0; i < n; i++) out.push(txt(lw + gw * i, H - s * 1.7, gw, labels[i] ?? '', {align: 'center'}));
    if (type === 'stack') {
        for (let i = 0; i < n; i++) {
            let acc = 0;
            series.forEach((x, j) => {
                const v = Math.max(0, num(x.values[i]));
                if (!v) return;
                const y = Y(acc + v), hh = Y(acc) - y;
                out.push(sh('rect', lw + gw * i + gw * .2, y, gw * .6, hh, cols[j]));
                if (el.vals && hh > s * 1.4) out.push(txt(lw + gw * i + gw * .2, y + hh / 2 - s * .75, gw * .6, fmt(v), {
                    align: 'center',
                    color: '@onaccent',
                    bold: 1
                }));
                acc += v;
            });
        }
        return out;
    }
    if (type === 'bar') {
        const bw = gw * .72 / series.length;
        series.forEach((x, j) => x.values.forEach((v, i) => {
            const y = Y(v), h = top + ph - y;
            if (h > .5) out.push(sh('rect', lw + gw * i + gw * .14 + j * bw, y, bw * .92, h, cols[j], {rad: Math.min(6, bw / 4)}));
            if (el.vals) out.push(txt(lw + gw * i + gw * .14 + j * bw - s, y - s * 1.6, bw * .92 + s * 2, fmt(num(v)), {
                align: 'center',
                color: el.color || '@fg'
            }));
        }));
        return out;
    }
    const X = (i) => lw + gw * (i + .5);
    series.forEach((x, j) => {
        const pts = x.values.map((v, i) => [X(i), Y(v)]);
        const line = pts.map(([a, b], i) => [i ? 'L' : 'M', a, b]);
        if (type === 'area' && pts.length > 1) out.push(path(0, 0, W, H, [...line, ['L', pts[pts.length - 1][0], top + ph], ['L', pts[0][0], top + ph], ['Z']], {
            fill: cols[j],
            o: .22
        }));
        if (pts.length > 1) out.push(path(0, 0, W, H, line, {
            fill: '',
            stroke: cols[j],
            sw: Math.max(2.5, s * .22),
            open: 1
        }));
        for (const [i, [a, b]] of pts.entries()) {
            const r = s * .32;
            out.push(sh('ellipse', a - r, b - r, r * 2, r * 2, cols[j], {stroke: '@bg', sw: 1.5}));
            if (el.vals) out.push(txt(a - s * 2.5, b - s * 2, s * 5, fmt(num(x.values[i])), {
                align: 'center',
                color: el.color || '@fg'
            }));
        }
    });
    return out;
}

export function tableParts(el, sc) {
    const rows = el.cells?.length ? el.cells : [['']], nc = Math.max(1, ...rows.map((r) => r.length)),
        rh = el.h / rows.length, cw = el.w / nc, s = el.size || 17 * sc.s, out = [], hd = el.hd !== 0;
    out.push(sh('rect', 0, 0, el.w, el.h, el.fill || '@surface', {rad: 8}));
    rows.forEach((r, i) => {
        const head = hd && i === 0;
        if (head) out.push(sh('rect', 0, 0, el.w, rh, '@accent', {rad: 8}), sh('rect', 0, rh / 2, el.w, rh / 2, '@accent'));
        else if (el.zebra !== 0 && (i - (hd ? 1 : 0)) % 2) out.push(sh('rect', 0, rh * i, el.w, rh, '@muted', {o: .1}));
        for (let c = 0; c < nc; c++) {
            const t = String(r[c] ?? '');
            if (t) out.push(tx(cw * c, rh * i, cw, rh, t, {
                size: s,
                pad: s * .6,
                bold: head ? 1 : 0,
                color: head ? '@onaccent' : el.color || '@fg',
                align: c && /^[\s\d.,%€$+−-]+$/.test(t) && !head ? 'right' : el.align || 'left'
            }));
        }
        if (i && !(hd && i === 1)) out.push(sh('rect', 0, rh * i - .5, el.w, 1, '@muted', {o: .25}));
    });
    return out;
}

// ------------------------------------------------------------------ icons: SVG drawings as path commands

const cache = new Map();

/** The commands of an icon on its 24 × 24 grid. */
export function iconCmds(name) {
    if (!cache.has(name)) cache.set(name, svgCmds(ICON_PATHS[name] || ICON_PATHS.circle || ''));
    return cache.get(name);
}

export const ICON_NAMES = Object.keys(ICON_PATHS);

export function iconParts(el) {
    const kx = el.w / 24, ky = el.h / 24;
    return [path(0, 0, el.w, el.h, iconCmds(el.ic).map(([c, ...v]) => [c, ...v.map((n, i) => n * (i % 2 ? ky : kx))]), {
        fill: '',
        stroke: el.color || '@accent',
        sw: (el.sw || 2) * Math.min(kx, ky),
        open: 1,
        cap: 1
    })];
}

function svgCmds(inner) {
    const out = [];
    for (const m of inner.matchAll(/<(path|circle|rect|line|polyline|polygon|ellipse)\b([^>]*)>/g)) {
        const at = {};
        for (const a of m[2].matchAll(/([a-z0-9-]+)="([^"]*)"/g)) at[a[1]] = a[2];
        const f = (k, d = 0) => (at[k] === undefined ? d : parseFloat(at[k]));
        if (m[1] === 'path') out.push(...pathCmds(at.d || ''));
        else if (m[1] === 'circle' || m[1] === 'ellipse') {
            const rx = f('r', f('rx')), ry = f('r', f('ry')), cx = f('cx'), cy = f('cy');
            out.push(...arc(0, 0, 1, 0, Math.PI * 2, 'M').map(([c, ...v]) => [c, ...v.map((n, i) => (i % 2 ? cy + n * ry : cx + n * rx))]), ['Z']);
        } else if (m[1] === 'line') out.push(['M', f('x1'), f('y1')], ['L', f('x2'), f('y2')]);
        else if (m[1] === 'rect') {
            const x = f('x'), y = f('y'), w = f('width'), h = f('height'), r = Math.min(f('rx', f('ry')), w / 2, h / 2),
                k = r * .4477;
            out.push(['M', x + r, y], ['L', x + w - r, y], ...(r ? [['C', x + w - k, y, x + w, y + k, x + w, y + r]] : []), ['L', x + w, y + h - r], ...(r ? [['C', x + w, y + h - k, x + w - k, y + h, x + w - r, y + h]] : []), ['L', x + r, y + h], ...(r ? [['C', x + k, y + h, x, y + h - k, x, y + h - r]] : []), ['L', x, y + r], ...(r ? [['C', x, y + k, x + k, y, x + r, y]] : []), ['Z']);
        } else {
            const p = (at.points || '').trim().split(/[\s,]+/).map(Number);
            for (let i = 0; i + 1 < p.length; i += 2) out.push([i ? 'L' : 'M', p[i], p[i + 1]]);
            if (m[1] === 'polygon') out.push(['Z']);
        }
    }
    return out;
}

/** An SVG path (every command, relative or absolute, arcs included) as M, L, C, Z. */
export function pathCmds(d) {
    const out = [], tok = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) || [];
    let i = 0, c = '', x = 0, y = 0, sx = 0, sy = 0, px = 0, py = 0, last = '';
    // the flags of an arc can be written without spaces
    const flag = () => {
        const s = tok[i];
        if (s.length > 1 && /^[01]/.test(s)) {
            tok[i] = s.slice(1);
            return +s[0];
        }
        i++;
        return +s;
    };
    const n = () => parseFloat(tok[i++]);
    while (i < tok.length) {
        if (/[a-zA-Z]/.test(tok[i])) c = tok[i++];
        const rel = c === c.toLowerCase(), C = c.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
        if (C === 'Z') {
            out.push(['Z']);
            x = sx;
            y = sy;
            last = C;
            continue;
        }
        if (i >= tok.length) break;
        if (C === 'M') {
            x = ox + n();
            y = oy + n();
            sx = x;
            sy = y;
            out.push(['M', x, y]);
            c = rel ? 'l' : 'L';
        } else if (C === 'L') {
            x = ox + n();
            y = oy + n();
            out.push(['L', x, y]);
        } else if (C === 'H') {
            x = ox + n();
            out.push(['L', x, y]);
        } else if (C === 'V') {
            y = oy + n();
            out.push(['L', x, y]);
        } else if (C === 'C') {
            const a = [ox + n(), oy + n(), ox + n(), oy + n(), ox + n(), oy + n()];
            out.push(['C', ...a]);
            px = a[2];
            py = a[3];
            x = a[4];
            y = a[5];
        } else if (C === 'S') {
            const a = last === 'C' || last === 'S' ? [2 * x - px, 2 * y - py] : [x, y],
                b = [ox + n(), oy + n(), ox + n(), oy + n()];
            out.push(['C', ...a, ...b]);
            px = b[0];
            py = b[1];
            x = b[2];
            y = b[3];
        } else if (C === 'Q' || C === 'T') {
            const q = C === 'Q' ? [ox + n(), oy + n()] : last === 'Q' || last === 'T' ? [2 * x - px, 2 * y - py] : [x, y],
                e = [ox + n(), oy + n()];
            out.push(['C', x + 2 / 3 * (q[0] - x), y + 2 / 3 * (q[1] - y), e[0] + 2 / 3 * (q[0] - e[0]), e[1] + 2 / 3 * (q[1] - e[1]), ...e]);
            px = q[0];
            py = q[1];
            x = e[0];
            y = e[1];
        } else if (C === 'A') {
            let rx = Math.abs(n()), ry = Math.abs(n());
            const phi = n() * Math.PI / 180, fa = flag(), fs = flag(), ex = ox + n(), ey = oy + n(), co = Math.cos(phi),
                si = Math.sin(phi), dx = (x - ex) / 2, dy = (y - ey) / 2, x1 = co * dx + si * dy,
                y1 = -si * dx + co * dy;
            if (!rx || !ry || (x === ex && y === ey)) {
                out.push(['L', ex, ey]);
                x = ex;
                y = ey;
                last = C;
                continue;
            }
            const l = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry);
            if (l > 1) {
                rx *= Math.sqrt(l);
                ry *= Math.sqrt(l);
            }
            const k = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1) / (rx * rx * y1 * y1 + ry * ry * x1 * x1))),
                cx1 = k * rx * y1 / ry, cy1 = -k * ry * x1 / rx, cx = co * cx1 - si * cy1 + (x + ex) / 2,
                cy = si * cx1 + co * cy1 + (y + ey) / 2;
            const a0 = Math.atan2((y1 - cy1) / ry, (x1 - cx1) / rx);
            let da = Math.atan2((-y1 - cy1) / ry, (-x1 - cx1) / rx) - a0;
            if (fs && da < 0) da += Math.PI * 2;
            if (!fs && da > 0) da -= Math.PI * 2;
            for (const [, ...v] of arc(0, 0, 1, a0, a0 + da)) {
                const m = [];
                for (let j = 0; j < 6; j += 2) {
                    const u = v[j] * rx, w = v[j + 1] * ry;
                    m.push(cx + co * u - si * w, cy + si * u + co * w);
                }
                out.push(['C', ...m]);
            }
            x = ex;
            y = ey;
        } else i++;
        last = C;
    }
    return out;
}

// ------------------------------------------------------------------ as parts

export const isCompound = (el) => el.t === 'chart' || el.t === 'table' || el.t === 'icon';
export const partsOf = (el, sc) => (el.t === 'chart' ? chartParts(el, sc) : el.t === 'table' ? tableParts(el, sc) : iconParts(el));

export const isCited = (el) => (el.t === 'image' || el.t === 'video') && !!el.cite && !!el.credit;
/** The source of a picture or video, written on it (along the bottom) or right below. */
export function citeOf(el, sc) {
  const size = 11.5 * sc.s, pad = 5 * sc.s, lines = Math.max(1, Math.ceil(el.credit.length * size * .5 / Math.max(20, el.w - 2 * pad))), hh = lines * size * 1.3 + pad;
  const html = `<p>${el.creditUrl ? `<a href="${esc(el.creditUrl)}">${esc(el.credit)}</a>` : esc(el.credit)}</p>`;
  return { t: 'text', role: 'caption', x: 0, w: el.w, h: hh, size, lh: 1.3, pad: pad / 2, va: 'middle', html, ...(el.cite === 'in' ? { y: el.h - hh, fill: '#000000a8', color: '#ffffff', align: 'left' } : { y: el.h + 2 * sc.s, color: '@muted', align: 'left' }) };
}

/** A slide whose sources are elements of their own and whose charts, tables and icons are replaced by their parts, in slide coordinates (for the exported files). */
export function expandSlide(d, sc) {
  if (!Object.values(d.els).some((e) => isCompound(e) || isCited(e))) return d;
    const els = {};
    Object.entries(d.els).sort((a, b) => (a[1].z || 0) - (b[1].z || 0) || (a[0] < b[0] ? -1 : 1)).forEach(([id, el], zi) => {
        if (!isCompound(el)) els[id] = { ...el, z: zi * 1000, ...(isCited(el) ? { cite: '' } : {}) };
    if (!isCompound(el) && !isCited(el)) return;
        const a = (el.r || 0) * Math.PI / 180, cx = el.x + el.w / 2, cy = el.y + el.h / 2;
        (isCited(el) ? [citeOf(el, sc)] : partsOf(el, sc)).forEach((p, i) => {
            // every part turns around the centre of the whole
            const dx = p.x + p.w / 2 - el.w / 2, dy = p.y + p.h / 2 - el.h / 2,
                x = cx + dx * Math.cos(a) - dy * Math.sin(a), y = cy + dx * Math.sin(a) + dy * Math.cos(a);
            els[`${id}p${i}`] = {
                ...p,
                x: x - p.w / 2,
                y: y - p.h / 2,
                r: (el.r || 0) + (p.r || 0) || undefined,
                o: (p.o ?? 1) * (el.o ?? 1),
                z: zi * 1000 + i + 1, ...(el.alt && !i && !isCited(el) ? { alt: el.alt } : {}) };
    });
  });
  return { ...d, els };
}
