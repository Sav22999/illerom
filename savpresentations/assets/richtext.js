/**
 * Rich text: b, i, u, s, sup, sub, a, br, p, ul, ol, li and span[data-c|data-s|data-f|data-m] (colour, relative size,
 * typeface, highlight). fragment() is the security boundary: text is parsed in an inert document and rebuilt node by
 * node, so nothing that comes from a presentation can run code. The server does the same (lib/clean.php).
 */
const BLOCK = {P: 'p', DIV: 'p', H1: 'p', H2: 'p', H3: 'p', H4: 'p', BLOCKQUOTE: 'p', UL: 'ul', OL: 'ol', LI: 'li'};
const INLINE = {B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', DEL: 's', SUP: 'sup', SUB: 'sub'};
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'HEAD', 'TITLE', 'TEMPLATE', 'SVG', 'MATH', 'TEXTAREA', 'NOSCRIPT', 'META', 'LINK']);
const TOKEN = /^@(bg|fg|muted|accent|accent2|surface|onaccent)$/;
export const okColor = (c) => TOKEN.test(c || '') || /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c || '');
export const okLink = (h) => /^(https?:\/\/|mailto:)[^\s<>"']+$/i.test(h || '') || /^#s:[A-Za-z0-9_-]{4,16}$/.test(h || '');
const okFont = (f) => /^(@head|@body|[a-z]{3,14})$/.test(f || '');

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
})[c]);
export const textToHtml = (t) => String(t ?? '').split('\n').map((l) => `<p>${esc(l)}</p>`).join('');
export const plain = (html) => {
    const d = new DOMParser().parseFromString(String(html ?? '').replace(/<\/(p|li)>/g, '\n</$1>').replace(/<br>/g, '\n'), 'text/html');
    return d.body.textContent.replace(/\n+$/, '');
};
export const isEmpty = (html) => !html || !plain(html).trim();

/** Rebuilds clean nodes. style(kind, value) gives the CSS of colours, sizes and typefaces; without it only data-* stay. */
export function fragment(html, style) {
    const out = document.createDocumentFragment();
    if (!html) return out;
    const src = new DOMParser().parseFromString(String(html), 'text/html').body;
    const walk = (from, to, depth) => {
        for (const c of from.childNodes) {
            if (c.nodeType === 3) {
                to.append(c.nodeValue);
                continue;
            }
            if (c.nodeType !== 1 || DROP.has(c.tagName.toUpperCase()) || depth > 14) continue;
            const tag = c.tagName.toUpperCase();
            if (tag === 'BR') {
                to.append(document.createElement('br'));
                continue;
            }
            let el = null;
            if (BLOCK[tag]) {
                el = document.createElement(BLOCK[tag]);
                const a = c.getAttribute('data-a') || c.style?.textAlign || '';
                if (/^(left|center|right)$/.test(a) && el.tagName === 'P') {
                    el.setAttribute('data-a', a);
                    if (style) el.style.textAlign = a;
                }
                if (el.tagName === 'P' && (to.tagName === 'P' || to.tagName === 'LI')) {
                    walk(c, to, depth + 1);
                    if (c.nextSibling) to.append(document.createElement('br'));
                    continue;
                }
            } else if (INLINE[tag]) el = document.createElement(INLINE[tag]);
            else if (tag === 'A') {
                const href = c.getAttribute('href') || '';
                if (okLink(href)) {
                    el = document.createElement('a');
                    el.setAttribute('href', href);
                    if (style) {
                        el.target = '_blank';
                        el.rel = 'noopener noreferrer';
                    }
                }
            } else if (tag === 'SPAN' || tag === 'FONT') {
                const v = {
                    c: c.getAttribute('data-c'),
                    s: c.getAttribute('data-s'),
                    f: c.getAttribute('data-f'),
                    m: c.getAttribute('data-m')
                };
                const span = document.createElement('span');
                if (okColor(v.c)) {
                    span.setAttribute('data-c', v.c);
                    if (style) span.style.color = style('color', v.c);
                }
                if (okColor(v.m)) {
                    span.setAttribute('data-m', v.m);
                    if (style) span.style.backgroundColor = style('color', v.m);
                }
                if (v.s && +v.s >= 0.2 && +v.s <= 5) {
                    span.setAttribute('data-s', +v.s);
                    if (style) span.style.fontSize = v.s + 'em';
                }
                if (okFont(v.f)) {
                    span.setAttribute('data-f', v.f);
                    if (style) span.style.fontFamily = style('font', v.f);
                }
                if (span.attributes.length) el = span;
            }
            if (el) {
                walk(c, el, depth + 1);
                to.append(el);
            } else walk(c, to, depth + 1);
        }
    };
    walk(src, out, 0);
    return out;
}

/** Clean HTML from the editing area (or from pasted HTML). */
export function serialize(node) {
    const box = document.createElement('div');
    box.append(fragment(node.innerHTML));
    // loose text at the top becomes a paragraph, so every text is a list of blocks
    let p = null;
    for (const c of [...box.childNodes]) {
        const block = c.nodeType === 1 && /^(P|UL|OL)$/.test(c.tagName);
        if (block) {
            p = null;
            continue;
        }
        if (c.nodeName === 'BR') {
            if (p) {
                c.remove();
                p = null;
            } else {
                const e = document.createElement('p');
                c.replaceWith(e);
            }
            continue;
        }
        if (!p) {
            p = document.createElement('p');
            c.replaceWith(p);
            p.append(c);
        } else p.append(c);
    }
    box.querySelectorAll('span').forEach((s) => {
        if (!s.textContent) s.remove();
    });
    const html = box.innerHTML.replace(/<p><br><\/p>/g, '<p></p>').replace(/<br><\/p>/g, '</p>').replace(/​/g, '');
    return plain(html).trim() === '' && !/<li>/.test(html) ? '' : html;
}

/** Paragraphs and runs, for the exported files. base = the style of the element. */
export function paragraphs(html, base) {
    const out = [];
    const src = document.createElement('div');
    src.append(fragment(html));
    let cur = null;
    const start = (props) => {
        cur = {runs: [], ...props};
        out.push(cur);
    };
    const inline = (node, st) => {
        for (const c of node.childNodes) {
            if (c.nodeType === 3) {
                if (!cur) start({});
                if (c.nodeValue) cur.runs.push({...st, t: c.nodeValue});
                continue;
            }
            const tag = c.tagName;
            if (tag === 'BR') {
                if (!cur) start({});
                cur.runs.push({...st, br: 1, t: ''});
                continue;
            }
            if (tag === 'P') {
                start({align: c.getAttribute('data-a') || null});
                inline(c, st);
                cur = null;
                continue;
            }
            if (tag === 'UL' || tag === 'OL') {
                list(c, st, 0);
                cur = null;
                continue;
            }
            const s = {...st};
            if (tag === 'B') s.b = 1;
            if (tag === 'I') s.i = 1;
            if (tag === 'U') s.u = 1;
            if (tag === 'S') s.s = 1;
            if (tag === 'SUP') s.sup = 1;
            if (tag === 'SUB') s.sub = 1;
            if (tag === 'A') s.href = c.getAttribute('href');
            if (tag === 'SPAN') {
                if (c.dataset.c) s.c = c.dataset.c;
                if (c.dataset.m) s.m = c.dataset.m;
                if (c.dataset.f) s.f = c.dataset.f;
                if (c.dataset.s) s.k = (s.k || 1) * +c.dataset.s;
            }
            inline(c, s);
        }
    };
    const list = (ul, st, level) => {
        for (const li of ul.children) {
            if (li.tagName !== 'LI') {
                if (/^(UL|OL)$/.test(li.tagName)) list(li, st, level + 1);
                continue;
            }
            start({list: ul.tagName === 'OL' ? 'ol' : 'ul', level});
            const here = cur;
            for (const c of [...li.childNodes]) {
                if (c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName)) list(c, st, level + 1);
                else {
                    cur = here;
                    const w = document.createElement('div');
                    w.append(c.cloneNode(true));
                    inline(w, st);
                    cur = here;
                }
            }
        }
    };
    inline(src, {...base});
    return out.length ? out : [{runs: []}];
}
