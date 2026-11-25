/**
 * What a document may contain (same list as lib/clean.php): every HTML that enters the editor passes from here, and so
 * does everything the editor saves.
 */
import {cleanObject} from './objects.js';

const set = (s) => new Set(s.split(' '));
const TAGS = set('p h1 h2 h3 h4 ul ol li blockquote pre code div hr table colgroup col tbody tr td th figure img figcaption span strong em u s sub sup a br');
export const TOP = set('p h1 h2 h3 h4 ul ol blockquote pre div hr table figure');
const RENAME = {
    b: 'strong',
    i: 'em',
    strike: 's',
    del: 's',
    ins: 'u',
    h5: 'h4',
    h6: 'h4',
    thead: 'tbody',
    tfoot: 'tbody'
};
const DROP = set('script style iframe object embed svg math template noscript link meta form input button textarea select video audio head title');
const CLASSES = set('title subtitle lead small drop eq callout toc pb beside check fn plain striped bare headcol math thick dash dots dbl short orn');
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([0-9., %]+\))$/i;
const STYLE = {
    'text-align': /^(left|center|right|justify|start|end)$/,
    color: COLOR,
    'background-color': COLOR,
    'font-family': /^[A-Za-z0-9 ,"'-]{1,80}$/,
    'font-size': /^\d{1,3}(\.\d{1,2})?(pt|px)$/,
    'line-height': /^\d(\.\d{1,2})?$/,
    'margin-left': /^\d{1,3}(\.\d{1,2})?(pt|px|em)$/,
    'text-indent': /^\d{1,3}(\.\d{1,2})?(pt|px|em)$/,
    'margin-top': /^\d{1,3}(\.\d{1,2})?(pt|px)$/,
    'margin-bottom': /^\d{1,3}(\.\d{1,2})?(pt|px)$/,
    'vertical-align': /^(top|middle|bottom)$/,
    width: /^\d{1,3}(\.\d{1,3})?%$/,
    'letter-spacing': /^-?\d(\.\d{1,2})?(pt|px|em)$/,
    'font-variant': /^small-caps$/,
};
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[c]));
const escText = (s) => s.replace(/[&<>]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F﻿]/g, '');

export function cleanStyle(css) {
    const out = {};
    for (const d of (css || '').split(';')) {
        const i = d.indexOf(':');
        if (i < 0) continue;
        const k = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim().replace(/"/g, "'");
        if (STYLE[k] && STYLE[k].test(v)) out[k] = v;
    }
    return Object.entries(out).map(([k, v]) => `${k}:${v}`).join(';');
}

export function cleanHref(v) {
    v = (v || '').replace(/[\u0000- \u007F]+/g, '');
    return /^#b-[a-z0-9]{4,12}$/.test(v) || (/^(https?:\/\/|mailto:|tel:)/i.test(v) && v.length <= 2000) ? v : '';
}

/** A DOM node as clean HTML. */
export function cleanNode(n, depth = 0) {
    if (n.nodeType === 3) return escText(n.nodeValue);
    if (n.nodeType !== 1 || depth > 40) return '';
    let tag = n.localName;
    tag = RENAME[tag] || tag;
    if (DROP.has(tag) || n.hasAttribute('data-ui')) return '';
    let inner = '';
    for (const c of n.childNodes) inner += cleanNode(c, depth + 1);
    if (tag === 'font') { // left by execCommand in some browsers
        const st = cleanStyle((n.color ? `color:${n.color};` : '') + (n.face ? `font-family:${n.face};` : '') + (n.getAttribute('style') || ''));
        return st ? `<span style="${esc(st)}">${inner}</span>` : inner;
    }
    if (!TAGS.has(tag)) return inner;
    let at = '';
    const add = (k, v) => {
        at += ` ${k}="${esc(v)}"`;
    };
    const cls = [...n.classList].filter((c) => CLASSES.has(c));
    if (cls.length) add('class', cls.join(' '));
    const st = cleanStyle(n.getAttribute('style'));
    if (st) add('style', st);
    const num = (k, max) => {
        const v = parseInt(n.getAttribute(k), 10);
        if (v > 1 && v <= max) add(k, v);
    };
    switch (tag) {
        case 'a': {
            const h = cleanHref(n.getAttribute('href'));
            if (!h) return inner;
            add('href', h);
            break;
        }
        case 'img': {
            const id = n.getAttribute('data-i') || '';
            if (!/^[a-f0-9]{24}$/.test(id)) return '';
            add('data-i', id);
            add('alt', (n.getAttribute('alt') || '').slice(0, 500));
            return `<img${at}>`;
        }
        case 'figure': {
            if (/^[lcr]$/.test(n.dataset.a || '')) add('data-a', n.dataset.a);
            const w = parseInt(n.dataset.w, 10);
            if (w >= 5 && w <= 100) add('data-w', w);
            if (n.hasAttribute('data-o')) {
                const o = cleanObject(n.dataset.o);
                if (!o) return '';
                add('data-o', JSON.stringify(o));
            }
            break;
        }
        case 'div':
            if (!cls.length) return depth === 0 ? `<p>${inner}</p>` : inner;
            if (/^(info|tip|warn|note|l|r|f|t)$/.test(n.dataset.k || '')) add('data-k', n.dataset.k);
            if (cls.includes('toc') && /^[1-3]$/.test(n.dataset.l || '')) add('data-l', n.dataset.l);
            if (cls.includes('toc') || cls.includes('pb')) return `<div${at}></div>`;
            break;
        case 'li':
            if (n.dataset.c === '1') add('data-c', '1');
            break;
        case 'ol':
            num('start', 9999);
            if (/^[aAiI]$/.test(n.getAttribute('type') || '')) add('type', n.getAttribute('type'));
            break;
        case 'sup':
            if (cls.includes('fn')) {
                add('data-n', (n.dataset.n || '').slice(0, 2000));
                return `<sup${at}></sup>`;
            }
            break;
        case 'td':
        case 'th':
            num('colspan', 30);
            num('rowspan', 200);
            break;
        case 'col':
            return `<col${at}>`;
        case 'hr':
            return `<hr${at}>`;
        case 'br':
            return n.closest('pre') ? '\n' : '<br>';
        case 'span':
            if (cls.includes('math')) return `<span class="math" data-m="${esc((n.dataset.m || '').slice(0, 800))}"></span>`;
            if (!at) return inner;
            break;
    }
    return `<${tag}${at}>${inner}</${tag}>`;
}

/** Any HTML as a list of clean top-level blocks. */
export function cleanBlocks(html) {
    const body = new DOMParser().parseFromString(`<body>${html}`, 'text/html').body;
    const out = [];
    let inline = '';
    const flush = () => {
        if (inline.replace(/<br>|&nbsp;|\s/g, '')) out.push(`<p>${inline}</p>`);
        inline = '';
    };
    const walk = (node) => {
        for (const n of node.childNodes) {
            const tag = n.nodeType === 1 ? RENAME[n.localName] || n.localName : '';
            if (n.nodeType === 1 && (DROP.has(tag) || n.hasAttribute('data-ui'))) continue;
            const own = [...(n.classList || [])].some((c) => CLASSES.has(c));
            if (n.nodeType === 1 && (['section', 'article', 'main', 'header', 'footer', 'center', 'body'].includes(tag) || (tag === 'div' && !own))) {
                flush();
                walk(n);
                flush();
                continue;
            }
            if (n.nodeType === 1 && !TOP.has(tag) && n.querySelector?.('p,h1,h2,h3,h4,ul,ol,table,blockquote,pre,figure')) {
                flush();
                walk(n);
                flush();
                continue;
            }
            if (TOP.has(tag)) {
                flush();
                const h = cleanNode(n);
                if (h) out.push(h);
            } else inline += cleanNode(n, 1);
        }
    };
    walk(body);
    flush();
    return out;
}

/** One block saved in a document, as an element (already clean when it leaves). */
export function blockEl(html) {
    const h = cleanBlocks(html)[0] || '<p><br></p>';
    const t = document.createElement('template');
    t.innerHTML = h;
    return t.content.firstElementChild;
}

export const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
