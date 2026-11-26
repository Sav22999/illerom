/**
 * Pages. The text is one column; before it there is a chain of floats: an empty one as tall as the writing area of each
 * page, then one as wide as the page that fills the bottom margin, the space between sheets and the top margin of the next.
 * The browser moves lines, rows and pictures below them, so a paragraph breaks across pages line by line without
 * touching its content.
 */
import {fields, fontStack, MM, pageMM} from './settings.js';
import {esc} from './clean.js';

export const GAP = 22;
const el = (cls, html = '') => {
    const d = document.createElement('div');
    d.className = cls;
    d.innerHTML = html;
    return d;
};

/** Puts the settings on the paper as CSS variables. */
export function applySettings(paper, s) {
    const [w, h] = pageMM(s);
    const set = (k, v) => paper.style.setProperty(k, v);
    set('--pw', w * MM + 'px');
    set('--ph', h * MM + 'px');
    set('--mt', s.mt * MM + 'px');
    set('--mr', s.mr * MM + 'px');
    set('--mb', s.mb * MM + 'px');
    set('--ml', s.ml * MM + 'px');
    set('--hc', Math.max(60, (h - s.mt - s.mb) * MM) + 'px');
    set('--font', fontStack(s.font));
    set('--hfont', fontStack(s.headFont));
    set('--fs', s.fontSize + 'pt');
    set('--lh', s.line);
    set('--pgap', s.gap + 'pt');
    set('--ink', s.color);
    set('--hink', s.headColor);
    set('--accent', s.accent || '#0f6e56');
    set('--page', s.bg || '#ffffff');
    set('--bcolor', s.borderColor || '#0f6e56');
    paper.classList.toggle('justify', !!s.justify);
    paper.lang = s.lang;
}

export function geometry(s, gap = GAP) {
    const [w, h] = pageMM(s);
    const ph = h * MM, hc = Math.max(60, (h - s.mt - s.mb) * MM);
    return {pw: w * MM, ph, hc, gap, pitch: ph + gap, mt: s.mt * MM, between: ph + gap - hc};
}

/** The number written on a page: the first one can be chosen. */
export const pageNo = (s, n) => n - 1 + (s.startPage ?? 1);

/** Watermark, border, header and footer of a sheet. */
export const sheetHtml = (s, page, pages, title) => `${s.mark ? `<div class="wmark"><span style="--n:${[...s.mark].length}">${esc(s.mark)}</span></div>` : ''}${s.border ? `<div class="pborder ${s.border}"></div>` : ''}<div class="band top${s.bandLine ? ' ln' : ''}">${bandHtml(s, 'header', page, pages, title)}</div><div class="band bottom${s.bandLine ? ' ln' : ''}">${bandHtml(s, 'footer', page, pages, title)}</div>`;

export function bandHtml(s, kind, page, pages, title) {
    const z = s[kind];
    if (!(z.l || z.c || z.r) || (page === 1 && !s.firstPage)) return '';
    const ctx = {page: pageNo(s, page), pages: pageNo(s, pages), title, date: new Date().toLocaleDateString(s.lang)};
    return ['l', 'c', 'r'].map((k) => `<span>${esc(fields(z[k], ctx))}</span>`).join('');
}

/** The chain of floats; a page with footnotes has a shorter writing area (h[i] px are kept for its notes at the bottom). */
function floats(box, n, g, h = []) {
    while (box.children.length > n * 2) box.lastChild.remove();
    while (box.children.length < n * 2) box.append(el('fl-page'), el('fl-gap'));
    box.style.setProperty('--between', g.between + 'px');
    for (let i = 0; i < n; i++) {
        const k = h[i] || 0, page = box.children[i * 2], gap = box.children[i * 2 + 1];
        page.style.height = k ? g.hc - k + 'px' : '';
        gap.style.height = k ? g.between + k + 'px' : '';
    }
}

/** Footnotes of one page: the number of each, its text. */
const notesHtml = (list) => (list?.length ? `<ol start="${list[0].k}">${list.map((x) => `<li value="${x.k}">${esc(x.n)}</li>`).join('')}</ol>` : '');

export class Pager {
    constructor(paper) {
        this.paper = paper;
        paper.innerHTML = '';
        this.sheets = el('sheets');
        this.flow = el('flow');
        this.gaps = el('gaps');
        this.gaps.setAttribute('aria-hidden', 'true');
        this.ed = el('ed doc');
        this.notes = el('notes doc');
        this.flow.append(this.gaps, this.ed, this.notes);
        paper.append(this.sheets, this.flow);
        this.pages = 1;
        this.zoom = 1;
        this.noteH = [];
        this.pageNotes = [];
    }

    /** Vertical position inside the flow, in unscaled px. */
    y(rect, edge = 'top') {
        return (rect[edge] - this.top) / this.zoom;
    }

    /** Height of the footnotes of a page, measured with the same typography as on the sheet. */
    notesHeight(list) {
        if (!list?.length) return 0;
        if (!this.meter) {
            this.meter = el('pnotes doc');
            this.meter.style.cssText = 'position:absolute;visibility:hidden;left:0;top:0;pointer-events:none';
            this.paper.append(this.meter);
        }
        this.meter.style.width = this.g.pw - parseFloat(getComputedStyle(this.flow).paddingLeft) - parseFloat(getComputedStyle(this.flow).paddingRight) + 'px';
        this.meter.innerHTML = notesHtml(list);
        return Math.ceil(this.meter.offsetHeight) + 6;
    }

    layout(s, title) {
        const g = (this.g = geometry(s));
        const {ed, gaps, notes} = this;
        const blocks = [...ed.children];
        // blocks taller than a page lose the "keep together" rule, or they would never find a place
        for (const b of blocks) {
            if (!b.matches('blockquote,pre,.callout,.beside')) continue;
            const tall = b.offsetHeight > g.hc;
            if (tall !== b.classList.contains('tall')) b.classList.toggle('tall', tall);
        }
        const unpush = () => {
            for (const b of ed.querySelectorAll('[data-push]')) {
                b.removeAttribute('data-push');
                b.style.removeProperty('padding-top');
            }
        };
        unpush();
        // footnotes: at the bottom of their page; in the continuous view (narrow screens) all at the end, as before
        notes.style.display = this.fluid ? '' : 'none';
        if (this.fluid) { // one sheet as long as the text
            this.noteH = [];
            this.pageNotes = [];
            floats(gaps, 0, g);
            for (const b of blocks) if (b.classList.contains('pb')) b.style.height = '1.6em';
            this.pages = 1;
            this.flow.style.height = 'auto';
            this.drawSheets({...s, header: {}, footer: {}, mark: '', border: ''}, title);
            this.sheets.firstChild.style.height = '100%';
            return;
        }
        let n = Math.max(1, this.pages), noteH = [...this.noteH];
        const measure = () => {
            this.top = this.flow.getBoundingClientRect().top;
            return this.y(ed.getBoundingClientRect(), 'bottom');
        };
        const settle = () => {
            const max = Math.ceil(ed.scrollHeight / g.hc) * 2 + blocks.length + 4;
            for (let i = 0; i < 40; i++) {
                // the last page with notes has its chain too, so what does not fit above its notes goes on
                floats(gaps, n - 1 + (noteH[n - 1] ? 1 : 0), g, noteH);
                // counted on the writing area: what ends in the bottom margin of the last page needs one page more
                const need = Math.max(1, Math.floor((measure() - g.mt - g.hc - 0.5) / g.pitch) + 2);
                const want = Math.min(max, need);
                if (want === n) break;
                n = want > n ? want + (i < 3 ? Math.ceil((want - n) / 8) : 0) : want;
            }
        };
        const pageOf = (y) => Math.floor(y / g.pitch);
        const room = (y) => g.mt + g.hc - (noteH[pageOf(y)] || 0) - (y - pageOf(y) * g.pitch); // space left on the page under y
        const pass = () => {
            unpush();
            settle();
            let moved = false;
            for (const b of blocks) {
                if (!b.classList.contains('pb')) continue;
                const left = room(this.y(b.getBoundingClientRect())), h = left > 0 ? Math.max(0, left) : 0;
                if (Math.abs((parseFloat(b.style.height) || 0) - h) > 0.5) {
                    b.style.height = h + 'px';
                    moved = true;
                    settle();
                }
            }
            // a heading never stays alone at the bottom of a page
            for (let i = 0; i < blocks.length - 1; i++) {
                const b = blocks[i];
                if (!/^h[1-4]$/.test(b.localName)) continue;
                const r = b.getBoundingClientRect(), next = blocks[i + 1];
                if (next.classList.contains('pb')) continue;
                const line = firstLine(next);
                if (!line) continue;
                const top = this.y(r), p = pageOf(top);
                if (pageOf(this.y(line)) > p && top - p * g.pitch > g.mt + 4) {
                    b.dataset.push = '';
                    b.style.setProperty('padding-top', Math.max(0, room(top)) + 'px');
                    moved = true;
                    settle();
                }
            }
            // an empty line (only a line break) is not moved by the floats: one that falls between two pages goes to the next
            // (after a page break the caret is on the new page at once)
            for (const b of blocks) {
                if (!b.matches('p,h1,h2,h3,h4') || b.textContent || b.querySelector('img,sup,span.math')) continue;
                const top = this.y(b.getBoundingClientRect()), p = pageOf(top);
                if (room(top) < 2) {
                    b.dataset.push = '';
                    b.style.setProperty('padding-top', Math.max(0, (p + 1) * g.pitch + g.mt - top) + 'px');
                    moved = true;
                    settle();
                }
            }
            if (moved) settle();
        };
        // which notes go on which page: the room they take changes where the text breaks, so it is asked again until it holds
        const fns = [...ed.querySelectorAll('sup.fn')];
        let per = [];
        for (let k = 0; k < 5; k++) {
            pass();
            this.top = this.flow.getBoundingClientRect().top;
            per = [];
            fns.forEach((f, i) => { const r = f.getBoundingClientRect(); (per[pageOf(this.y(r) + r.height / this.zoom / 2)] ||= []).push({ k: i + 1, n: f.dataset.n || '' }); });
            const h = Array.from({ length: Math.max(per.length, noteH.length) }, (_, i) => this.notesHeight(per[i]));
            const same = h.every((x, i) => Math.abs(x - (noteH[i] || 0)) < 1) && noteH.slice(h.length).every((x) => !x);
            noteH = h;
            if (same) break;
            // still moving after the last try: the room follows this assignment once more, and the notes stay where the room is
            if (k === 4) pass();
        }
        this.noteH = noteH;
        this.pageNotes = per;
        this.pages = n;
        this.flow.style.height = n * g.pitch - g.gap + 'px';
        this.drawSheets(s, title);
    }

    drawSheets(s, title) {
        const {sheets, pages, g} = this;
        while (sheets.children.length > pages) sheets.lastChild.remove();
        while (sheets.children.length < pages) sheets.append(el('sheet'));
        [...sheets.children].forEach((sh, i) => {
            sh.style.top = i * g.pitch + 'px';
            sh.style.height = '';
            const t = sheetHtml(s, i + 1, pages, title) + this.footHtml(i);
            if (sh._h !== t) sh.innerHTML = sh._h = t;
        });
    }

    /** The footnotes at the bottom of the writing area of page i (0-based), on screen and in print. */
    footHtml(i) {
        const list = this.pageNotes?.[i];
        if (!list?.length || !this.g) return '';
        return `<div class="pnotes doc" style="top:${this.g.mt + this.g.hc - (this.noteH[i] || 0) + 6}px">${notesHtml(list)}</div>`;
    }

    pageAt(y) {
        return this.g ? Math.min(this.pages, Math.max(1, Math.floor(y / this.g.pitch) + 1)) : 1;
    }

    /** The page where the text of a block begins. */
    pageOfText(b) {
        this.top = this.flow.getBoundingClientRect().top;
        const r = firstLine(b);
        return this.pageAt(this.y(r) + r.height / this.zoom / 2);
    }

    /**
     * What gets printed: every page with exactly the content it has on screen. Paragraphs, lists and tables across two pages
     * are cut where they break, because printers measure the text a little differently from the screen.
     */
    printable(s, title) {
        const {g, ed, notes, pages} = this;
        this.top = this.flow.getBoundingClientRect().top;
        const pageOf = (y) => Math.max(0, Math.min(pages - 1, Math.floor(y / g.pitch)));
        const mid = (r) => this.y(r) + r.height / this.zoom / 2;
        const out = el('print-pages');
        applySettings(out, s);
        const bodies = [];
        for (let i = 0; i < pages; i++) {
            const page = el('psheet', sheetHtml(s, i + 1, pages, title) + this.footHtml(i));
            const flow = el('flow'), body = el('ed doc');
            flow.append(body);
            page.append(flow);
            out.append(page);
            bodies.push(body);
        }
        const put = (i, node, offset, fresh) => {
            if (!bodies[i].children.length && fresh) {
                const sp = el('spacer');
                sp.style.height = Math.max(0, offset) + 'px';
                bodies[i].append(sp);
                node.style.marginTop = '0';
            }
            bodies[i].append(node);
        };
        const tidy = (c) => {
            c.removeAttribute('contenteditable');
            if (c.hasAttribute('data-push')) c.style.paddingTop = '';
            c.querySelectorAll('[data-ui=grip]').forEach((n) => n.remove());
            return c;
        };
        const all = [...ed.children, ...(notes.childElementCount && this.fluid ? [notes] : [])];
        for (const b of all) {
            if (b.classList.contains('pb')) continue;
            const units = cuts(b, (r) => pageOf(mid(r)));
            const r = b.getBoundingClientRect(), first = firstLine(b) || r;
            const p0 = units.length ? units[0].page : pageOf(mid(first));
            const rel = b.hasAttribute('data-push') ? 0 : this.y(r) - p0 * g.pitch - g.mt;
            if (units.length < 2) {
                put(p0, tidy(b.cloneNode(true)), rel, true);
                continue;
            }
            units.forEach((u, k) => {
                const c = b.cloneNode(false), x = document.createRange();
                x.setStart(...u.start);
                if (units[k + 1]) x.setEnd(...units[k + 1].start); else x.setEnd(b, b.childNodes.length);
                c.append(x.cloneContents());
                tidy(c);
                if (b.matches('table') && b.querySelector('colgroup') && k) c.prepend(b.querySelector('colgroup').cloneNode(true));
                if (units[k + 1] && b.matches('p,blockquote') && getComputedStyle(b).textAlign === 'justify') c.style.textAlignLast = 'justify';
                if (k) {
                    c.style.marginTop = '0';
                    c.style.textIndent = '0';
                    continueLists(b, c, u);
                }
                if (units[k + 1]) c.style.marginBottom = '0';
                put(u.page, c, 0, false);
            });
        }
        return out;
    }
}

/** Where a block breaks: [{page, start: [node, offset]}], one for each page it is on. */
function cuts(b, pageOfRect) {
    const out = [];
    const add = (page, node, off) => {
        if (!out.length) out.push({page, start: [b, 0]}); else if (page > out.at(-1).page) out.push({
            page,
            start: [node, off]
        });
    };
    if (b.matches('table:not(.rs)')) {
        for (const tr of b.querySelectorAll('tr')) add(pageOfRect(tr.getBoundingClientRect()), tr.parentNode, [...tr.parentNode.childNodes].indexOf(tr));
        return out;
    }
    if (b.matches('.toc')) {
        [...b.children].forEach((a, i) => add(pageOfRect(a.getBoundingClientRect()), b, i));
        return out;
    }
    if (!b.matches('p,h1,h2,h3,h4,ul,ol,.notes,.tall')) return out;
    const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT), r = document.createRange();
    for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (n.nodeType === 1) {
            if (!n.matches('br,img,li') || (n.matches('li') && n.textContent)) continue;
            const rect = n.getBoundingClientRect();
            if (rect.height) add(pageOfRect(rect), n.parentNode, [...n.parentNode.childNodes].indexOf(n));
            continue;
        }
        if (!n.length) continue;
        r.selectNodeContents(n);
        const rects = [...r.getClientRects()].filter((x) => x.width > 0.5);
        if (!rects.length) continue;
        const at = (i) => {
            r.setStart(n, i);
            r.setEnd(n, i + 1);
            const q = [...r.getClientRects()].filter((x) => x.height);
            return q.length ? pageOfRect(q[0]) : null;
        };
        const p0 = pageOfRect(rects[0]), p1 = pageOfRect(rects.at(-1));
        add(p0, n, 0);
        for (let p = p0 + 1; p <= p1; p++) { // the first character on the page p
            let lo = 0, hi = n.length - 1;
            while (lo < hi) {
                const m = (lo + hi) >> 1;
                let q = at(m), k = m;
                while (q === null && k > lo) q = at(--k);
                if ((q ?? p0) < p) lo = m + 1; else hi = m;
            }
            add(p, n, lo);
        }
    }
    // a whole item, not only its text, goes to the next page when it begins there
    for (const u of out.slice(1)) {
        let [n, o] = u.start;
        while (n !== b && o === 0) {
            o = [...n.parentNode.childNodes].indexOf(n);
            n = n.parentNode;
            if (n.matches('ul,ol')) break;
        }
        u.start = [n, o];
    }
    return out;
}

/** The second part of a list keeps its numbers, and an item cut in two has no second bullet. */
function continueLists(b, c, u) {
    let [n, o] = u.start;
    const path = [];
    let item = n.nodeType === 1 && n.matches('ul,ol') ? n.childNodes[o] : null;
    if (item) path.push([item, false]);
    for (let x = n; x && x !== b; x = x.parentNode) if (x.nodeType === 1 && x.localName === 'li') path.push([x, true]);
    path.reverse();
    let copy = c.matches('ul,ol') ? c : c.querySelector('ul,ol');
    for (const [li, cut] of path) {
        const k = copy?.querySelector(':scope > li');
        if (!k) return;
        const list = li.parentNode;
        if (list.localName === 'ol') k.value = (list.start || 1) + [...list.children].indexOf(li);
        if (cut) {
            k.style.listStyle = 'none';
            k.classList.add('cont');
        }
        copy = k.querySelector(':scope > ul, :scope > ol');
    }
}

function firstLine(b) {
    const r = document.createRange();
    r.selectNodeContents(b);
    const rects = r.getClientRects();
    return rects.length ? rects[0] : b.getBoundingClientRect();
}
