/**
 * Pages. The text is one column; before it there is a chain of floats: an empty one as tall as the writing area of each
 * page, then one as wide as the page that fills the bottom margin, the space between sheets and the top margin of the next.
 * The browser moves lines, rows and pictures below them, so a paragraph breaks across pages line by line without
 * touching its content.
 */
import { MM, pageMM, fields, fontStack } from './settings.js';
import { esc } from './clean.js';

export const GAP = 22;
const el = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };

/** Puts the settings on the paper as CSS variables. */
export function applySettings(paper, s) {
  const [w, h] = pageMM(s);
  const set = (k, v) => paper.style.setProperty(k, v);
  set('--pw', w * MM + 'px'); set('--ph', h * MM + 'px');
  set('--mt', s.mt * MM + 'px'); set('--mr', s.mr * MM + 'px'); set('--mb', s.mb * MM + 'px'); set('--ml', s.ml * MM + 'px');
  set('--hc', Math.max(60, (h - s.mt - s.mb) * MM) + 'px');
  set('--font', fontStack(s.font)); set('--hfont', fontStack(s.headFont));
  set('--fs', s.fontSize + 'pt'); set('--lh', s.line); set('--pgap', s.gap + 'pt'); set('--ink', s.color); set('--hink', s.headColor);
  paper.classList.toggle('justify', !!s.justify);
  paper.lang = s.lang;
}

export function geometry(s, gap = GAP) {
  const [w, h] = pageMM(s);
  const ph = h * MM, hc = Math.max(60, (h - s.mt - s.mb) * MM);
  return { pw: w * MM, ph, hc, gap, pitch: ph + gap, mt: s.mt * MM, between: ph + gap - hc };
}

export function bandHtml(s, kind, page, pages, title) {
  const z = s[kind];
  if (!(z.l || z.c || z.r) || (page === 1 && !s.firstPage)) return '';
  const ctx = { page, pages, title, date: new Date().toLocaleDateString(s.lang) };
  return ['l', 'c', 'r'].map((k) => `<span>${esc(fields(z[k], ctx))}</span>`).join('');
}

function floats(box, n, g) {
  while (box.children.length > n * 2) box.lastChild.remove();
  while (box.children.length < n * 2) box.append(el('fl-page'), el('fl-gap'));
  box.style.setProperty('--between', g.between + 'px');
}

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
  }

  /** Vertical position inside the flow, in unscaled px. */
  y(rect, edge = 'top') { return (rect[edge] - this.top) / this.zoom; }

  layout(s, title) {
    const g = (this.g = geometry(s));
    const { ed, gaps, notes } = this;
    const blocks = [...ed.children];
    // blocks taller than a page lose the "keep together" rule, or they would never find a place
    for (const b of blocks) {
      if (!b.matches('blockquote,pre,.callout,.beside')) continue;
      const tall = b.offsetHeight > g.hc;
      if (tall !== b.classList.contains('tall')) b.classList.toggle('tall', tall);
    }
    for (const b of ed.querySelectorAll('[data-push]')) { b.removeAttribute('data-push'); b.style.removeProperty('padding-top'); }
    let n = Math.max(1, this.pages);
    const measure = () => {
      this.top = this.flow.getBoundingClientRect().top;
      const r = (notes.childElementCount ? notes : ed).getBoundingClientRect();
      return this.y(r, 'bottom');
    };
    const settle = () => {
      const max = Math.ceil((ed.scrollHeight + notes.scrollHeight) / g.hc) * 2 + blocks.length + 4;
      for (let i = 0; i < 40; i++) {
        floats(gaps, n - 1, g);
        const need = Math.max(1, Math.floor((measure() - 1) / g.pitch) + 1);
        const want = Math.min(max, need);
        if (want === n) break;
        n = want > n ? want + (i < 3 ? Math.ceil((want - n) / 8) : 0) : want;
      }
    };
    settle();
    const pageOf = (y) => Math.floor(y / g.pitch);
    const room = (y) => g.mt + g.hc - (y - pageOf(y) * g.pitch); // space left on the page under y
    let moved = false;
    for (const b of blocks) {
      if (!b.classList.contains('pb')) continue;
      const left = room(this.y(b.getBoundingClientRect())), h = left > 0 ? Math.max(0, left) : 0;
      if (Math.abs((parseFloat(b.style.height) || 0) - h) > 0.5) { b.style.height = h + 'px'; moved = true; settle(); }
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
    if (moved) settle();
    this.pages = n;
    this.flow.style.height = n * g.pitch - g.gap + 'px';
    this.drawSheets(s, title);
  }

  drawSheets(s, title) {
    const { sheets, pages, g } = this;
    while (sheets.children.length > pages) sheets.lastChild.remove();
    while (sheets.children.length < pages) sheets.append(el('sheet', '<div class="band top"></div><div class="band bottom"></div>'));
    [...sheets.children].forEach((sh, i) => {
      sh.style.top = i * g.pitch + 'px';
      const t = bandHtml(s, 'header', i + 1, pages, title), b = bandHtml(s, 'footer', i + 1, pages, title);
      if (sh.firstChild.innerHTML !== t) sh.firstChild.innerHTML = t;
      if (sh.lastChild.innerHTML !== b) sh.lastChild.innerHTML = b;
    });
  }

  pageAt(y) { return this.g ? Math.min(this.pages, Math.max(1, Math.floor(y / this.g.pitch) + 1)) : 1; }

  /** Each page as it is on screen, with only the blocks it shows: what gets printed. */
  printable(s, title) {
    const { g, ed, notes, pages } = this;
    this.top = this.flow.getBoundingClientRect().top;
    const all = [...ed.children, ...(notes.childElementCount ? [notes] : [])].map((b) => { const r = b.getBoundingClientRect(); return { b, top: this.y(r), bottom: this.y(r, 'bottom') }; });
    const out = el('print-pages');
    applySettings(out, s);
    for (let i = 0; i < pages; i++) {
      const from = i * g.pitch, to = from + g.ph;
      const inside = all.filter((x) => x.top < to && x.bottom > from && !x.b.classList.contains('pb'));
      const page = el('psheet', `<div class="band top">${bandHtml(s, 'header', i + 1, pages, title)}</div><div class="band bottom">${bandHtml(s, 'footer', i + 1, pages, title)}</div>`);
      const flow = el('flow'), gaps = el('gaps'), body = el('ed doc');
      floats(gaps, Math.min(pages - 1, i + 1), g);
      flow.style.cssText = `position:absolute;top:${-from}px;left:0;height:${to}px`;
      if (inside.length) {
        const sp = el('spacer');
        sp.style.height = Math.max(0, inside[0].top - g.mt) + 'px';
        body.append(sp);
        inside.forEach((x, k) => {
          const c = x.b.cloneNode(true);
          c.removeAttribute('contenteditable');
          if (!k) c.style.marginTop = '0';
          body.append(c);
        });
      }
      body.querySelectorAll('[data-ui]').forEach((n) => n.remove());
      flow.append(gaps, body);
      page.append(flow);
      out.append(page);
    }
    return out;
  }
}

function firstLine(b) {
  const r = document.createRange();
  r.selectNodeContents(b);
  const rects = r.getClientRects();
  return rects.length ? rects[0] : b.getBoundingClientRect();
}
