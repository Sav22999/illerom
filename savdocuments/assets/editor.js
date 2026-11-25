/**
 * The editor: a contenteditable whose children are the blocks of the document.
 * Model: order = [id], blocks = Map id -> {h, v, base}. h is the clean HTML; v the version known by the server and base the
 * HTML it had there (for merging). Every change of the DOM becomes a list of operations (see lib/docs.php), used for undo
 * and sent to the server.
 */
import { cleanNode, cleanBlocks, blockEl, newId, TOP, esc } from './clean.js';
import { Pager, applySettings } from './page.js';

const VOID = 'hr,.pb,.toc,figure';
const isText = (b) => b && b.matches('p,h1,h2,h3,h4,blockquote,pre');
const isList = (b) => b && b.matches('ul,ol');
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html; return t.content.firstElementChild; };
const fill = (n) => { if (!n.textContent && !n.querySelector('br,img,sup.fn')) n.append(document.createElement('br')); return n; };
const atStart = (node, r) => { const x = document.createRange(); x.setStart(node, 0); x.setEnd(r.startContainer, r.startOffset); return !x.toString() && !x.cloneContents().querySelector('img,sup,br'); };
const atEnd = (node, r) => { const x = document.createRange(); x.selectNodeContents(node); x.setStart(r.endContainer, r.endOffset); const c = x.cloneContents(); return !x.toString() && !c.querySelector('img,sup') && c.querySelectorAll('br').length < 2; };

/** Merges two changes of the same block when they touch different places; null when they overlap. */
export function merge3(base, mine, theirs) {
  if (mine === theirs || theirs === base) return mine;
  if (mine === base) return theirs;
  const tok = (s) => s.match(/<[^>]+>|\s+|[^\s<]+/g) || [];
  const B = tok(base), edit = (X) => {
    let p = 0, s = 0;
    while (p < B.length && p < X.length && B[p] === X[p]) p++;
    while (s < B.length - p && s < X.length - p && B[B.length - 1 - s] === X[X.length - 1 - s]) s++;
    return { from: p, to: B.length - s, put: X.slice(p, X.length - s) };
  };
  const a = edit(tok(mine)), b = edit(tok(theirs));
  const [x, y] = a.from <= b.from ? [a, b] : [b, a];
  if (x.to > y.from || (x.from === y.from && x.to === y.to)) return null;
  return [...B.slice(0, x.from), ...x.put, ...B.slice(x.to, y.from), ...y.put, ...B.slice(y.to)].join('');
}

export class Editor {
  constructor(paper, opt) {
    this.opt = opt; // {editable, labels, imageUrl, onChange, onSelect, onLayout, onSlash, onImageFiles, onBlock, autoformat}
    this.paper = paper;
    this.pager = new Pager(paper);
    this.ed = this.pager.ed;
    this.blocks = new Map();
    this.order = [];
    this.dirty = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this.sel = null;
    this.title = '';
    const ed = this.ed;
    if (opt.editable) {
      paper.classList.add('editing');
      ed.contentEditable = 'true';
      ed.spellcheck = opt.spellcheck !== false;
      ed.setAttribute('role', 'textbox');
      ed.setAttribute('aria-multiline', 'true');
      ed.setAttribute('aria-label', opt.labels.text);
      try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* old browsers */ }
    }
    this.mo = new MutationObserver((rs) => this.note(rs));
    this.listen();
    this.ro = new ResizeObserver(() => this.later());
    this.ro.observe(ed);
    document.fonts?.ready.then(() => this.later());
  }

  destroy() { this.mo.disconnect(); this.ro.disconnect(); document.removeEventListener('selectionchange', this._selch); clearTimeout(this._scan); cancelAnimationFrame(this._raf); }

  // ------------------------------------------------------------------ model

  load(content, title) {
    this.settings = content.settings;
    this.title = title;
    this.mo.disconnect();
    this.ed.replaceChildren();
    this.blocks.clear();
    this.order = [];
    for (const b of content.blocks) {
      const n = blockEl(b.h);
      n.id = 'b-' + b.id;
      this.ed.append(n);
      const h = cleanNode(n);
      this.blocks.set(b.id, { h, v: b.v || 1, base: h });
      this.order.push(b.id);
    }
    this.undoStack = [];
    this.redoStack = [];
    this.dirty.clear();
    this.dress();
    this.decorate();
    this.observe();
    this.layout();
  }

  observe() { this.mo.observe(this.ed, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'data-a', 'data-w', 'data-k', 'data-c', 'data-n', 'colspan', 'rowspan', 'href', 'alt', 'start', 'type'] }); }

  /** Runs something that changes the DOM only for the screen: the observer does not see it. */
  quiet(fn) { this.note(this.mo.takeRecords()); fn(); this.mo.takeRecords(); }

  topOf(n) {
    if (n === this.ed) return null;
    while (n && n.parentNode !== this.ed) n = n.parentNode;
    return n;
  }

  note(records) {
    for (const r of records) {
      const b = r.target === this.ed ? null : this.topOf(r.target);
      if (b) this.dirty.add(b);
      else if (r.target === this.ed) { this.dirtyOrder = true; for (const n of r.addedNodes) if (n.nodeType === 1) this.dirty.add(n); }
    }
  }

  snapshot() { return { blocks: this.order.map((id) => ({ id, h: this.blocks.get(id).h, v: this.blocks.get(id).v })), settings: this.settings }; }

  /** Turns the changes of the DOM into operations. */
  scan() {
    clearTimeout(this._scan);
    this._scan = 0;
    if (this.composing || !this.opt.editable) return;
    this.note(this.mo.takeRecords());
    if (!this.dirty.size && !this.dirtyOrder) return;
    const ops = [], inv = [];
    this.quiet(() => {
      const ed = this.ed;
      for (const n of [...ed.childNodes]) {
        if (n.nodeType === 1 && TOP.has(n.localName) && !(n.localName === 'div' && !n.className.match(/callout|toc|pb|beside/))) continue;
        if (n.nodeType === 3 && !n.nodeValue.trim()) { n.remove(); continue; }
        if (n.nodeType === 1 && n.localName === 'br') { n.replaceWith(el('<p><br></p>')); continue; }
        const html = cleanBlocks(n.nodeType === 1 ? n.outerHTML : esc(n.nodeValue));
        const keep = this.caret();
        n.replaceWith(...html.map((h) => blockEl(h)));
        if (keep) this.setCaret(keep);
      }
      if (!ed.children.length) { ed.append(el('<p><br></p>')); this.collapse(ed.firstChild); }
    });
    const seen = new Set(), order = [];
    for (const n of this.ed.children) {
      let id = n.id.startsWith('b-') ? n.id.slice(2) : '';
      if (!id || seen.has(id) || !/^[a-z0-9]{4,12}$/.test(id)) { id = newId(); n.id = 'b-' + id; this.dirty.add(n); }
      seen.add(id);
      order.push(id);
    }
    this.mo.takeRecords();
    const now = [...this.order];
    for (const id of this.order) {
      if (seen.has(id)) continue;
      const at = now.indexOf(id);
      inv.unshift({ t: 'ins', id, after: now[at - 1] || '', h: this.blocks.get(id).h });
      ops.push({ t: 'del', id });
      now.splice(at, 1);
    }
    const html = (id) => cleanNode(document.getElementById('b-' + id));
    order.forEach((id, i) => {
      const after = order[i - 1] || '';
      if (!this.blocks.has(id)) {
        const h = html(id);
        ops.push({ t: 'ins', id, after, h });
        inv.unshift({ t: 'del', id });
        now.splice(i, 0, id);
      } else if (now[i] !== id) {
        const at = now.indexOf(id);
        inv.unshift({ t: 'mov', id, after: now[at - 1] || '' });
        ops.push({ t: 'mov', id, after });
        now.splice(at, 1);
        now.splice(i, 0, id);
      }
    });
    for (const n of this.dirty) {
      if (n.parentNode !== this.ed) continue;
      const id = n.id.slice(2), b = this.blocks.get(id);
      if (!b) continue;
      const h = cleanNode(n);
      if (h === b.h) continue;
      ops.push({ t: 'set', id, h });
      inv.unshift({ t: 'set', id, h: b.h });
    }
    this.dirty.clear();
    this.dirtyOrder = false;
    if (ops.length) {
      this.model(ops);
      this.record(ops, inv);
      this.opt.onChange(ops);
      this.quiet(() => this.decorate());
    }
    this.later();
  }

  soon(ms = 250) { if (!this._scan) this._scan = setTimeout(() => this.scan(), ms); }

  /** Applies operations to the model only. */
  model(ops) {
    for (const o of ops) {
      if (o.t === 'set') { const b = this.blocks.get(o.id); if (b) b.h = o.h; }
      else if (o.t === 'ins') {
        if (this.blocks.has(o.id)) continue;
        this.blocks.set(o.id, { h: o.h, v: o.v || 1, base: o.h });
        this.order.splice(o.after ? this.order.indexOf(o.after) + 1 || this.order.length : 0, 0, o.id);
      } else if (o.t === 'del') { this.blocks.delete(o.id); this.order = this.order.filter((x) => x !== o.id); }
      else if (o.t === 'mov') { this.order = this.order.filter((x) => x !== o.id); this.order.splice(o.after ? this.order.indexOf(o.after) + 1 || this.order.length : 0, 0, o.id); }
      else if (o.t === 'settings') this.settings = o.s;
      else if (o.t === 'title') this.title = o.title;
    }
  }

  /** Applies operations to the DOM and the model (undo, other people). */
  apply(ops) {
    const keep = this.caret();
    this.quiet(() => {
      for (const o of ops) {
        const n = o.id ? document.getElementById('b-' + o.id) : null;
        const place = (x) => { const a = o.after ? document.getElementById('b-' + o.after) : null; if (a) a.after(x); else if (o.after) this.ed.append(x); else this.ed.prepend(x); };
        if (o.t === 'set' && n) { const x = blockEl(o.h); x.id = n.id; if (this.sel === n) this.select(null); n.replaceWith(x); }
        else if (o.t === 'ins' && !n) { const x = blockEl(o.h); x.id = 'b-' + o.id; place(x); }
        else if (o.t === 'del' && n) { if (this.sel === n) this.sel = null; n.remove(); }
        else if (o.t === 'mov' && n) place(n);
      }
      this.model(ops);
      if (ops.some((o) => o.t === 'settings')) this.dress();
      this.decorate();
    });
    if (keep && document.activeElement === this.ed) this.setCaret(keep);
    this.later();
  }

  record(ops, inv, merge = true) {
    const last = this.undoStack.at(-1), t = Date.now();
    const caret = this.caret();
    if (merge && !this._fresh && last && t - last.at < 900 && last.ops.length === 1 && ops.length === 1 && last.ops[0].t === 'set' && ops[0].t === 'set' && last.ops[0].id === ops[0].id) {
      last.ops = ops; last.at = t; last.after = caret;
    } else this.undoStack.push({ ops, inv, at: t, before: this._before || caret, after: caret });
    if (this.undoStack.length > 300) this.undoStack.shift();
    this.redoStack = [];
    this._before = caret;
  }

  /** A change made by a dialog (settings, title). */
  change(op) {
    this.scan();
    const inv = op.t === 'settings' ? { t: 'settings', s: this.settings } : { t: 'title', title: this.title };
    this.model([op]);
    this.record([op], [inv], false);
    if (op.t === 'settings') this.dress();
    this.opt.onChange([op]);
    this.quiet(() => this.decorate());
    this.later();
  }

  undo(redo = false) {
    this.scan();
    const from = redo ? this.redoStack : this.undoStack, to = redo ? this.undoStack : this.redoStack;
    const e = from.pop();
    if (!e) return;
    const ops = (redo ? e.ops : e.inv).filter((o) => o.t !== 'set' || this.blocks.has(o.id));
    this.ed.focus({ preventScroll: true });
    this.apply(ops);
    to.push(e);
    const c = redo ? e.after : e.before;
    if (c) this.setCaret(c);
    this.reveal();
    this.opt.onChange(ops);
    this.emitSelect();
  }

  // ------------------------------------------------------------------ layout

  later() { cancelAnimationFrame(this._raf); this._raf = requestAnimationFrame(() => this.layout()); }

  layout() {
    if (!this.settings || !this.paper.isConnected) return;
    this.quiet(() => {
      this.pager.zoom = this.opt.zoom?.() || 1;
      this.pager.layout(this.settings, this.title);
      this.placeGrip();
      for (const a of this.ed.querySelectorAll('.toc a')) {
        const t = document.getElementById(a.getAttribute('href').slice(1));
        const p = t ? String(this.pager.pageOfText(t)) : '';
        if (a.dataset.p !== p) a.dataset.p = p;
      }
    });
    this.opt.onLayout?.();
  }

  /** The settings on the paper. */
  dress(st = this.settings) { applySettings(this.paper, st); this.opt.onDress?.(); }

  /** What is drawn but not saved: pictures, table columns, numbers, table of contents, notes. */
  decorate() {
    const { ed } = this, edit = this.opt.editable, L = this.opt.labels;
    for (const i of ed.querySelectorAll('img[data-i]')) {
      const u = this.opt.imageUrl(i.dataset.i);
      if (i.getAttribute('src') !== u) { i.src = u; i.onload = () => this.later(); i.draggable = false; }
    }
    for (const f of ed.querySelectorAll('figure')) {
      const img = f.querySelector('img');
      if (!img) { f.remove(); continue; }
      const w = (f.dataset.w || 100) + '%';
      const t = f.parentNode.matches?.('.beside') ? f : img;
      if (t.style.width !== w) t.style.width = w;
      let cap = f.querySelector('figcaption');
      if (edit && !cap) { cap = el('<figcaption><br></figcaption>'); f.append(cap); }
      if (edit) { f.contentEditable = 'false'; cap.contentEditable = 'true'; cap.dataset.hint = L.caption; }
    }
    for (const n of ed.querySelectorAll(':scope > hr, :scope > .pb, :scope > .toc')) if (edit) n.contentEditable = 'false';
    for (const n of ed.querySelectorAll('.pb')) n.dataset.label = L.pageBreak;
    for (const t of ed.querySelectorAll('table')) this.dressTable(t);
    let n = [0, 0, 0, 0];
    const heads = [...ed.children].filter((x) => /^h[1-4]$/.test(x.localName));
    for (const h of heads) {
      const l = +h.localName[1] - 1;
      n[l]++;
      for (let i = l + 1; i < 4; i++) n[i] = 0;
      const num = this.settings.numbered && l < 3 ? n.slice(0, l + 1).map((x) => x || 1).join('.') + (l === 0 ? '.' : '') : '';
      if (num) h.dataset.num = num; else h.removeAttribute('data-num');
    }
    const items = heads.filter((h) => h.localName !== 'h4' && h.textContent.trim());
    const toc = items.map((h) => `<a href="#${h.id}" class="l${h.localName[1]}">${esc((h.dataset.num ? h.dataset.num + ' ' : '') + h.textContent)}<i></i></a>`).join('') || `<em>${esc(L.emptyToc)}</em>`;
    for (const t of ed.querySelectorAll('.toc')) if (t._toc !== toc) { t.innerHTML = toc; t._toc = toc; }
    const fns = [...ed.querySelectorAll('sup.fn')];
    fns.forEach((f, i) => { f.dataset.k = i + 1; f.title = f.dataset.n; f.contentEditable = 'false'; });
    const notes = fns.length ? `<ol>${fns.map((f) => `<li>${esc(f.dataset.n)}</li>`).join('')}</ol>` : '';
    if (this.pager.notes.innerHTML !== notes) this.pager.notes.innerHTML = notes;
    const empty = edit && ed.children.length === 1 && isText(ed.firstChild) && !ed.textContent;
    ed.classList.toggle('empty-hint', empty);
    if (empty) ed.firstChild.dataset.hint = L.hint;
  }

  dressTable(t) {
    const grid = tableGrid(t), n = grid[0]?.length || 1;
    const cols = [...t.querySelectorAll(':scope > colgroup > col')];
    const widths = Array.from({ length: n }, (_, i) => parseFloat(cols[i]?.style.width) || 0);
    const v = widths.every(Boolean) ? widths.map((w) => `minmax(0,${w}fr)`).join(' ') : `repeat(${n}, minmax(0,1fr))`;
    if (t.style.getPropertyValue('--cols') !== v) t.style.setProperty('--cols', v);
    t.classList.toggle('rs', !!t.querySelector('[rowspan]'));
    for (const c of t.querySelectorAll('td,th')) {
      const g = c.colSpan > 1 ? `span ${c.colSpan}` : '';
      if (c.style.gridColumn !== g) c.style.gridColumn = g;
      fill(c);
    }
  }

  // ------------------------------------------------------------------ selection

  range() {
    const s = getSelection();
    if (!s.rangeCount) return null;
    const r = s.getRangeAt(0);
    return this.ed.contains(r.commonAncestorContainer) ? r : null;
  }

  offset(block, node, off) {
    const r = document.createRange();
    r.selectNodeContents(block);
    try { r.setEnd(node, off); } catch { return 0; }
    return r.toString().length + r.cloneContents().querySelectorAll('br').length;
  }

  caret() {
    const r = this.range();
    if (!r) return null;
    const at = (n, o) => {
      const b = n === this.ed ? this.ed.children[Math.min(o, this.ed.children.length - 1)] : this.topOf(n);
      return b?.id ? { id: b.id, o: n === this.ed ? 0 : this.offset(b, n, o) } : null;
    };
    const a = at(r.startContainer, r.startOffset), b = at(r.endContainer, r.endOffset);
    return a && b ? { a, b } : null;
  }

  locate({ id, o }) {
    const b = document.getElementById(id);
    if (!b) return null;
    const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let last = [b, 0];
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType === 3) {
        if (o <= n.length) return [n, o];
        o -= n.length;
        last = [n, n.length];
      } else if (n.localName === 'br') {
        if (o === 0) return [n.parentNode, [...n.parentNode.childNodes].indexOf(n)];
        o--;
        last = [n.parentNode, [...n.parentNode.childNodes].indexOf(n) + 1];
      } else if (o === 0 && !n.firstChild && n.matches('li,td,th,p')) return [n, 0];
    }
    return last;
  }

  setCaret(c) {
    const a = this.locate(c.a), b = this.locate(c.b);
    if (a && b) getSelection().setBaseAndExtent(...a, ...b);
  }

  collapse(node, end = false) {
    const r = document.createRange();
    r.selectNodeContents(node);
    r.collapse(!end);
    const last = node.lastChild;
    if (end && last?.nodeType === 1 && last.localName === 'br') { r.setStartBefore(last); r.collapse(true); }
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  }

  /** The top-level blocks touched by the selection. */
  selected() {
    if (this.sel) return [this.sel.closest('.ed > *')];
    const r = this.range();
    if (!r) return [];
    const kids = [...this.ed.children];
    const a = r.startContainer === this.ed ? kids[Math.min(r.startOffset, kids.length - 1)] : this.topOf(r.startContainer);
    let b = r.endContainer === this.ed ? kids[Math.max(0, r.endOffset - 1)] : this.topOf(r.endContainer);
    let i = kids.indexOf(a), j = kids.indexOf(b);
    if (j > i && !r.collapsed && r.endContainer !== this.ed && atStart(b, { startContainer: r.endContainer, startOffset: r.endOffset })) j--;
    return kids.slice(i, j + 1);
  }

  cell() { const r = this.range(); if (!r) return null; const n = r.startContainer; return (n.nodeType === 1 ? n : n.parentNode).closest?.('td,th') || null; }
  item() { const r = this.range(); if (!r) return null; const n = r.startContainer; const li = (n.nodeType === 1 ? n : n.parentNode).closest?.('li'); return li && this.ed.contains(li) ? li : null; }

  select(node) {
    this.quiet(() => {
      this.ed.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
      this.ed.querySelectorAll('[data-ui=grip]').forEach((x) => x.remove());
      this.sel = node;
      if (!node) return;
      node.classList.add('sel');
      if (node.matches('figure')) {
        const g = el('<span data-ui="grip" contenteditable="false"></span>');
        node.append(g);
        this.placeGrip();
        g.addEventListener('pointerdown', (e) => this.resizeFigure(e, node, g));
      }
    });
    if (node) { getSelection().removeAllRanges(); this.ed.focus({ preventScroll: true }); getSelection().removeAllRanges(); }
    this.emitSelect();
  }

  placeGrip() {
    const g = this.sel?.querySelector?.('[data-ui=grip]'), i = this.sel?.querySelector?.('img');
    if (g && i) { g.style.left = i.offsetLeft + i.offsetWidth + 'px'; g.style.top = i.offsetTop + i.offsetHeight + 'px'; }
  }

  resizeFigure(e, f, g) {
    e.preventDefault();
    e.stopPropagation();
    g.setPointerCapture(e.pointerId);
    const img = f.querySelector('img'), box = (f.parentNode.matches('.beside') ? f.parentNode : f).getBoundingClientRect(), r = img.getBoundingClientRect();
    const center = !f.parentNode.matches('.beside') && (f.dataset.a || 'c') === 'c', right = f.dataset.a === 'r' || f.parentNode.dataset.k === 'r';
    const move = (ev) => {
      let w = center ? Math.abs(ev.clientX - (r.left + r.right) / 2) * 2 : right ? r.right - ev.clientX : ev.clientX - r.left;
      if (right && ev.clientX > r.left) w = Math.max(20, r.right - ev.clientX + 0);
      f.dataset.w = Math.round(Math.max(8, Math.min(f.parentNode.matches('.beside') ? 70 : 100, (w / box.width) * 100)));
      (f.parentNode.matches('.beside') ? f : img).style.width = f.dataset.w + '%';
      this.later();
    };
    g.onpointermove = move;
    g.onpointerup = () => { g.onpointermove = g.onpointerup = null; this.scan(); };
  }

  emitSelect() { clearTimeout(this._em); this._em = setTimeout(() => { this.markCurrent(); this.opt.onSelect?.(this.state()); }, 20); }

  markCurrent() {
    const b = this.selected()[0];
    if (this._cur === b) return;
    this.quiet(() => { this._cur?.classList.remove('cur'); b?.classList.add('cur'); });
    this._cur = b;
    this.opt.onBlock?.(b?.id.slice(2) || '');
  }

  /** What the toolbar shows. */
  state() {
    const r = this.range(), b = this.selected()[0];
    const q = (c) => { try { return document.queryCommandState(c); } catch { return false; } };
    const node = r ? (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode) : null;
    const li = this.item(), list = li?.parentNode;
    const cs = node && this.ed.contains(node) ? getComputedStyle(node) : null;
    return {
      sel: this.sel, collapsed: !r || r.collapsed, cell: this.cell(), block: b, inEd: !!r,
      bold: q('bold'), italic: q('italic'), underline: q('underline'), strike: q('strikeThrough'), sub: q('subscript'), sup: q('superscript'),
      code: !!node?.closest?.('code'), link: node?.closest?.('a') || null,
      type: !b ? '' : li ? (list.matches('.check') ? 'check' : list.localName) : b.matches('.title,.subtitle,.lead,.small') ? b.classList[0] : b.matches('.callout') ? 'callout' : b.localName,
      align: b ? (cs ? { start: 'left', end: 'right' }[cs.textAlign] || cs.textAlign : 'left') : 'left',
      font: cs ? cs.fontFamily.split(',')[0].replace(/['"]/g, '') : '', size: cs ? Math.round(parseFloat(cs.fontSize) * 0.75 * 10) / 10 : 0,
      canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0,
    };
  }

  reveal() {
    const r = this.range();
    const n = this.sel || (r && (r.startContainer.nodeType === 1 ? r.startContainer.childNodes[r.startOffset] || r.startContainer : r.startContainer.parentNode));
    (n?.nodeType === 1 ? n : n?.parentNode)?.scrollIntoView?.({ block: 'nearest' });
  }

  // ------------------------------------------------------------------ commands

  do(fn) {
    if (!this.opt.editable) return;
    this.scan();
    this._before = this.caret();
    if (!this.sel) this.ed.focus({ preventScroll: true });
    this._fresh = true;
    const out = fn();
    this.scan();
    this._fresh = false;
    const last = this.undoStack.at(-1);
    if (last) last.at = 0; // what is typed next is another step
    this.emitSelect();
    return out;
  }

  inline(cmd, value) {
    this.do(() => {
      if (cmd === 'code') return this.toggleCode();
      if (cmd === 'size') return this.fontSize(value);
      const css = ['foreColor', 'hiliteColor', 'fontName'].includes(cmd);
      document.execCommand('styleWithCSS', false, css);
      if (cmd === 'clear') {
        document.execCommand('removeFormat');
        document.execCommand('unlink');
        for (const b of this.selected()) b.querySelectorAll?.('span[style],code').forEach((s) => { if (getSelection().containsNode(s, true)) s.replaceWith(...s.childNodes); });
        return;
      }
      document.execCommand(cmd, false, value);
      if (cmd === 'fontName' || cmd === 'foreColor') this.ed.querySelectorAll('font').forEach((f) => { const s = document.createElement('span'); if (f.face) s.style.fontFamily = f.face; if (f.color) s.style.color = f.color; s.append(...f.childNodes); f.replaceWith(s); });
    });
  }

  fontSize(pt) {
    this._size = pt;
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontSize', false, '7');
    this.fixSizes();
  }

  fixSizes() {
    const fonts = [...this.ed.querySelectorAll('font[size="7"]')];
    if (!fonts.length) return;
    const c = this.caret();
    for (const f of fonts) {
      const s = document.createElement('span');
      s.style.fontSize = this._size + 'pt';
      if (f.face) s.style.fontFamily = f.face;
      if (f.color) s.style.color = f.color;
      s.append(...f.childNodes);
      s.querySelectorAll('span[style]').forEach((x) => { x.style.fontSize = ''; });
      f.replaceWith(s);
    }
    if (c) this.setCaret(c);
  }

  toggleCode() {
    const r = this.range();
    if (!r) return;
    const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode, code = n.closest('code');
    if (code && this.ed.contains(code)) { const c = this.caret(); code.replaceWith(...code.childNodes); this.setCaret(c); return; }
    if (r.collapsed || this.topOf(r.startContainer) !== this.topOf(r.endContainer)) return;
    const x = document.createElement('code');
    x.textContent = r.toString();
    r.deleteContents();
    r.insertNode(x);
    const s = document.createRange();
    s.selectNodeContents(x);
    getSelection().removeAllRanges();
    getSelection().addRange(s);
  }

  link(url, label) {
    this.do(() => {
      const st = this.state();
      if (st.link) { if (!url) { const c = this.caret(); st.link.replaceWith(...st.link.childNodes); this.setCaret(c); } else st.link.href = url; return; }
      if (!url) return;
      if (st.collapsed) document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(label || url)}</a>`);
      else document.execCommand('createLink', false, url);
    });
  }

  /** Replaces an element with one of another kind, keeping its content. */
  retag(b, tag, cls = '') {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    const st = b.getAttribute('style');
    if (st && tag === 'p') n.setAttribute('style', st);
    else if (b.style.textAlign) n.style.textAlign = b.style.textAlign;
    n.style.removeProperty('padding-top');
    n.append(...b.childNodes);
    n.id = b.id;
    b.replaceWith(n);
    return fill(n);
  }

  /** The block as plain paragraphs (lists, callouts). */
  flatten(b) {
    if (isList(b)) {
      const out = [];
      const walk = (list) => {
        for (const li of [...list.children]) {
          const p = document.createElement('p'), subs = [...li.children].filter(isList);
          for (const c of [...li.childNodes]) if (!subs.includes(c)) p.append(c);
          out.push(fill(p));
          subs.forEach(walk);
        }
      };
      walk(b);
      out[0].id = b.id;
      b.replaceWith(...out);
      return out;
    }
    if (b.matches('.callout')) { const ps = [...b.children].map((p) => { p.removeAttribute('id'); return fill(p); }); ps[0].id = b.id; b.replaceWith(...ps); return ps; }
    return [b];
  }

  /** type: p title subtitle lead small h1..h4 blockquote pre callout */
  block(type, kind) {
    this.do(() => {
      const c = this.caret(), all = this.selected().filter((b) => !b.matches('table,.beside,' + VOID));
      if (!all.length) return;
      const same = all.every((b) => this.kindOf(b) === type && type !== 'callout');
      const parts = all.flatMap((b) => this.flatten(b));
      if (type === 'callout') {
        const box = el(`<div class="callout" data-k="${kind || 'info'}"></div>`);
        parts[0].before(box);
        box.id = parts[0].id;
        box.append(...parts.map((p) => { const q = this.retag(p, 'p'); q.removeAttribute('id'); q.removeAttribute('style'); return q; }));
      } else {
        const t = same ? 'p' : type;
        for (const p of parts) {
          if (['title', 'subtitle', 'lead', 'small'].includes(t)) this.retag(p, 'p', t);
          else this.retag(p, t);
        }
      }
      if (c) this.setCaret(c);
    });
  }

  kindOf(b) { return b.matches('.callout') ? 'callout' : b.matches('.title,.subtitle,.lead,.small') ? [...b.classList].find((x) => /title|lead|small/.test(x)) : b.localName; }

  /** kind: ul, ol, check */
  list(kind) {
    this.do(() => {
      const c = this.caret(), tag = kind === 'ol' ? 'ol' : 'ul', li = this.item();
      const cur = li && li.parentNode;
      const of = (l) => (l.matches('.check') ? 'check' : l.localName);
      const all = this.selected().filter((b) => isText(b) || isList(b));
      const cell = this.cell();
      if (cell && !cur) { // a list inside a cell
        const l = el(`<${tag}${kind === 'check' ? ' class="check"' : ''}><li></li></${tag}>`);
        l.firstChild.append(...cell.childNodes);
        fill(l.firstChild);
        cell.append(l);
        this.collapse(l.firstChild, true);
        return;
      }
      if (cur && all.length < 2) {
        const swap = (l) => { const n = document.createElement(tag); if (kind === 'check') n.className = 'check'; n.id = l.id; n.append(...l.childNodes); l.replaceWith(n); };
        if (of(cur) === kind) {
          if (cell) { cur.replaceWith(...[...cur.children].flatMap((x, i) => (i ? [document.createElement('br'), ...x.childNodes] : [...x.childNodes]))); } else this.flatten(this.topOf(cur));
        } else swap(cur);
      } else if (all.length) {
        if (all.every((b) => isList(b) && of(b) === kind)) all.forEach((b) => this.flatten(b));
        else {
          const l = document.createElement(tag);
          if (kind === 'check') l.className = 'check';
          all[0].before(l);
          l.id = all[0].id;
          for (const b of all) {
            if (isList(b)) l.append(...b.children);
            else { const x = document.createElement('li'); x.append(...b.childNodes); l.append(fill(x)); }
            b.remove();
          }
          const prev = l.previousElementSibling, next = l.nextElementSibling;
          if (next && isList(next) && of(next) === kind) { l.append(...next.children); next.remove(); }
          if (prev && isList(prev) && of(prev) === kind) { const first = l.firstChild; prev.append(...l.children); l.remove(); this.collapse(first, true); return; }
        }
      }
      if (c) this.setCaret(c);
    });
  }

  indent(dir) {
    this.do(() => {
      const c = this.caret(), lis = this.items();
      if (lis.length) {
        const pin = lis.map((x) => x);
        const r = this.range(), sn = r.startContainer, so = r.startOffset, en = r.endContainer, eo = r.endOffset;
        (dir > 0 ? pin : pin.reverse()).forEach((li) => (dir > 0 ? this.nest(li) : this.unnest(li)));
        if (sn.isConnected && en.isConnected) getSelection().setBaseAndExtent(sn, so, en, eo);
        return;
      }
      for (const b of this.selected()) {
        if (!b.matches('p,h1,h2,h3,h4')) continue;
        const v = Math.max(0, Math.min(216, (parseFloat(b.style.marginLeft) || 0) + dir * 18));
        b.style.marginLeft = v ? v + 'pt' : '';
      }
      if (c) this.setCaret(c);
    });
  }

  items() {
    const r = this.range();
    if (!r) return [];
    if (r.collapsed) { const li = this.item(); return li ? [li] : []; }
    const all = [...this.ed.querySelectorAll('li')].filter((l) => r.intersectsNode(l));
    return all.filter((l) => !all.some((p) => p !== l && p.contains(l) && all.includes(l.parentNode.closest('li')) && r.intersectsNode(p.firstChild || p)));
  }

  nest(li) {
    const prev = li.previousElementSibling;
    if (!prev) return;
    const list = li.parentNode;
    let sub = prev.lastElementChild;
    if (!sub || !isList(sub)) { sub = document.createElement(list.localName); if (list.matches('.check')) sub.className = 'check'; prev.append(sub); }
    sub.append(li);
  }

  unnest(li) {
    const list = li.parentNode, up = list.parentNode.closest?.('li');
    const rest = [];
    for (let n = li.nextElementSibling; n; n = n.nextElementSibling) rest.push(n);
    if (up && this.ed.contains(up)) {
      if (rest.length) { let sub = li.lastElementChild; if (!sub || !isList(sub)) { sub = list.cloneNode(false); sub.removeAttribute('id'); li.append(sub); } sub.append(...rest); }
      up.after(li);
      if (!list.children.length) list.remove();
      return li;
    }
    // out of the list: it becomes a paragraph
    const p = document.createElement('p'), subs = [...li.children].filter(isList);
    for (const c of [...li.childNodes]) if (!subs.includes(c)) p.append(c);
    fill(p);
    const tail = list.cloneNode(false);
    tail.removeAttribute('id');
    for (const s of subs) tail.append(...s.children);
    tail.append(...rest);
    list.after(p);
    li.remove();
    if (tail.children.length) p.after(tail);
    if (!list.children.length) { p.id = list.id; list.remove(); }
    this.collapse(p);
    return p;
  }

  align(v) {
    this.do(() => {
      const cells = this.cells();
      if (cells.length) { cells.forEach((x) => { x.style.textAlign = v === 'left' ? '' : v; }); return; }
      for (const b of this.selected()) {
        if (b.matches('figure')) b.dataset.a = { left: 'l', right: 'r' }[v] || 'c';
        else if (!b.matches(VOID)) b.style.textAlign = v === 'left' && !this.settings.justify ? '' : v;
      }
    });
  }

  paragraph(st) { this.do(() => { for (const b of this.selected()) if (!b.matches(VOID)) for (const [k, v] of Object.entries(st)) b.style.setProperty(k, v); }); }

  // ------------------------------------------------------------------ inserting

  /** Puts blocks after the caret (an empty paragraph is replaced); returns the first. */
  insertBlocks(nodes, caretIn) {
    return this.do(() => {
      const cur = this.sel ? this.topOf(this.sel) : this.selected().at(-1) || this.ed.lastElementChild;
      this.select(null);
      const r = this.range();
      let at = cur;
      if (cur && isText(cur) && r && !atEnd(cur, r) && cur.textContent && !this.cell()) { // in the middle of a paragraph: it splits
        const tail = this.splitAt(cur, r);
        at = cur;
        cur.after(tail);
      }
      at.after(...nodes);
      if (cur && isText(cur) && cur.localName !== 'pre' && !cur.textContent && !cur.querySelector('img,sup')) cur.remove();
      const last = nodes.at(-1);
      if (!last.nextElementSibling || last.nextElementSibling.matches('table,' + VOID)) if (last.matches('table,.callout,.beside,' + VOID)) last.after(el('<p><br></p>'));
      const target = caretIn || (last.matches(VOID) ? last.nextElementSibling : last);
      this.collapse(target.matches('table') ? target.querySelector('td,th') : target.matches('.callout') ? target.firstElementChild : target, !target.matches('table,.callout') && !!target.textContent);
      this.scan();
      this.reveal();
      return nodes[0];
    });
  }

  insertHr() { this.insertBlocks([el('<hr>')]); }
  insertBreak() { this.insertBlocks([el('<div class="pb"></div>')]); }
  insertToc() { this.insertBlocks([el('<div class="toc"></div>')]); }
  insertTable(rows, cols) { this.insertBlocks([el(`<table><tbody>${Array.from({ length: rows }, (_, i) => `<tr>${(i ? '<td><br></td>' : '<th><br></th>').repeat(cols)}</tr>`).join('')}</tbody></table>`)]); }
  insertImage(id, alt = '', caption = '', w = 100) {
    const f = el(`<figure data-a="c" data-w="${w}"><img data-i="${id}" alt="${esc(alt)}"><figcaption>${caption ? esc(caption) : '<br>'}</figcaption></figure>`);
    this.insertBlocks([f]);
    return f;
  }
  insertNote(text) { this.do(() => { document.execCommand('insertHTML', false, `<sup class="fn" data-n="${esc(text)}"></sup>`) ; this.fixFn(text); }); }
  fixFn(text) { // browsers drop empty elements from insertHTML
    if ([...this.ed.querySelectorAll('sup.fn')].some((f) => f.dataset.n === text)) return;
    const r = this.range();
    if (!r) return;
    const f = el('<sup class="fn"></sup>');
    f.dataset.n = text;
    r.collapse(false);
    r.insertNode(f);
    r.setStartAfter(f);
    r.collapse(true);
  }

  /** The picture beside the text, which flows around it; side null = on its own line. */
  besideFigure(f, side) {
    this.do(() => {
      const box = f.closest('.beside');
      this.select(null);
      if (side) {
        if (box) { box.dataset.k = side; return; }
        const b = el(`<div class="beside" data-k="${side}"></div>`);
        const next = f.nextElementSibling;
        b.id = f.id;
        f.removeAttribute('id');
        f.before(b);
        f.dataset.w = Math.min(60, +f.dataset.w || 100) > 55 ? 40 : f.dataset.w;
        f.removeAttribute('data-a');
        f.querySelector('img').style.width = '';
        b.append(f);
        if (next && next.localName === 'p' && !next.matches('.title,.subtitle') && next.textContent) { next.removeAttribute('id'); b.append(next); } else b.append(el('<p><br></p>'));
        this.collapse(b.lastElementChild, true);
      } else if (box) {
        const ps = [...box.children].filter((x) => x !== f);
        f.id = box.id;
        f.style.width = '';
        f.dataset.a = 'c';
        ps.forEach((p) => p.removeAttribute('id'));
        box.replaceWith(f, ...ps);
      }
    });
  }

  removeSelected() {
    this.do(() => {
      const n = this.sel;
      if (!n) return;
      const box = n.closest('.beside'), at = this.topOf(n);
      this.select(null);
      if (box) { const ps = [...box.children].filter((x) => x !== n); ps.forEach((p) => p.removeAttribute('id')); box.replaceWith(...ps); this.collapse(ps[0]); return; }
      const next = at.nextElementSibling || at.previousElementSibling;
      at.remove();
      if (next && !next.matches(VOID)) this.collapse(next.matches('table') ? next.querySelector('td,th') : next);
    });
  }

  // ------------------------------------------------------------------ tables

  cells() {
    const all = [...this.ed.querySelectorAll('.csel')];
    if (all.length) return all;
    const c = this.cell();
    return c ? [c] : [];
  }

  clearCells() { this.quiet(() => this.ed.querySelectorAll('.csel').forEach((x) => x.classList.remove('csel'))); }

  table(cmd, value) {
    this.do(() => {
      const cells = this.cells();
      if (!cells.length) return;
      const t = cells[0].closest('table'), g = tableGrid(t), where = (c) => { for (let y = 0; y < g.length; y++) { const x = g[y].indexOf(c); if (x >= 0) return [x, y]; } };
      const box = cells.reduce((b, c) => { const [x, y] = where(c); return [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x + c.colSpan - 1), Math.max(b[3], y + c.rowSpan - 1)]; }, [1e9, 1e9, 0, 0]);
      const [x0, y0, x1, y1] = box, rows = [...t.querySelectorAll('tr')], w = g[0].length;
      const mk = (like) => el(`<${like === 'TH' ? 'th' : 'td'}><br></${like === 'TH' ? 'th' : 'td'}>`);
      const cols = () => [...t.querySelectorAll(':scope > colgroup > col')];
      if (cmd === 'rowAbove' || cmd === 'rowBelow') {
        const y = cmd === 'rowAbove' ? y0 : y1 + 1, tr = document.createElement('tr');
        for (let x = 0; x < w; x++) {
          const c = g[y]?.[x], up = g[y - 1]?.[x];
          if (c && c === up) { if (g[y].indexOf(c) === x) c.rowSpan++; continue; }
          tr.append(mk(rows[Math.min(y, rows.length - 1)].firstElementChild?.tagName === 'TH' && y > 0 && x === 0 && g.every((r) => r[0].tagName === 'TH') ? 'TH' : 'TD'));
        }
        if (y < rows.length) rows[y].before(tr); else rows.at(-1).after(tr);
        this.collapse(tr.firstElementChild || cells[0]);
      } else if (cmd === 'colLeft' || cmd === 'colRight') {
        const x = cmd === 'colLeft' ? x0 : x1 + 1;
        const done = new Set();
        for (let y = 0; y < rows.length; y++) {
          const c = g[y][x], left = g[y][x - 1];
          if (c && c === left) { if (!done.has(c)) { c.colSpan++; done.add(c); } continue; }
          let ref = null;
          for (let k = x; k < w; k++) if (g[y][k].parentNode === rows[y] && g[y].indexOf(g[y][k]) >= x) { ref = g[y][k]; break; }
          rows[y].insertBefore(mk(rows[y].firstElementChild?.tagName === 'TH' && rows[y].lastElementChild?.tagName === 'TH' ? 'TH' : 'TD'), ref);
        }
        t.querySelector('colgroup')?.remove();
      } else if (cmd === 'delRow') {
        if (y1 - y0 + 1 >= rows.length) { this.dropTable(t); return; }
        for (let y = y1; y >= y0; y--) this.delRow(t, y);
        this.collapse(t.querySelectorAll('tr')[Math.min(y0, rows.length - (y1 - y0) - 2)].firstElementChild || t.querySelector('td,th'));
      } else if (cmd === 'delCol') {
        if (x1 - x0 + 1 >= w) { this.dropTable(t); return; }
        for (let x = x1; x >= x0; x--) {
          const gg = tableGrid(t), done = new Set();
          gg.forEach((r) => { const c = r[x]; if (!c || done.has(c)) return; done.add(c); if (c.colSpan > 1) c.colSpan--; else c.remove(); });
        }
        t.querySelector('colgroup')?.remove();
        this.collapse(t.querySelector('td,th'));
      } else if (cmd === 'merge') {
        if (cells.length < 2) return;
        const first = g[y0][x0], set = new Set();
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set.add(g[y][x]);
        for (const c of set) if (c !== first) { if (c.textContent.trim()) { if (first.textContent.trim()) first.append(document.createElement('br')); else first.replaceChildren(); first.append(...c.childNodes); } c.remove(); }
        first.colSpan = x1 - x0 + 1;
        first.rowSpan = y1 - y0 + 1;
        for (const r of [...t.querySelectorAll('tr')]) if (!r.children.length) { const y = [...t.querySelectorAll('tr')].indexOf(r); tableGrid(t)[y]?.forEach((c, i, a) => { if (c && a.indexOf(c) === i && c.rowSpan > 1) c.rowSpan--; }); r.remove(); }
        this.clearCells();
        this.collapse(first, true);
      } else if (cmd === 'split') {
        for (const c of cells) {
          const [x, y] = where(c), cs = c.colSpan, rs = c.rowSpan;
          if (cs < 2 && rs < 2) continue;
          c.removeAttribute('colspan');
          c.removeAttribute('rowspan');
          for (let i = 0; i < rs; i++) {
            const add = Array.from({ length: i ? cs : cs - 1 }, () => mk(c.tagName));
            if (!i) c.after(...add);
            else { let ref = null; for (let k = x + cs; k < w; k++) { const n = g[y + i][k]; if (n && n.parentNode === rows[y + i]) { ref = n; break; } } add.forEach((n) => rows[y + i].insertBefore(n, ref)); }
          }
        }
      } else if (cmd === 'header') {
        const on = [...rows[0].children].every((c) => c.tagName === 'TH');
        for (const c of [...rows[0].children]) { const n = document.createElement(on ? 'td' : 'th'); for (const a of c.attributes) if (a.name !== 'class') n.setAttribute(a.name, a.value); n.append(...c.childNodes); c.replaceWith(n); }
        this.collapse(rows[0].firstElementChild);
      } else if (cmd === 'style') { t.classList.remove('plain', 'striped'); if (value) t.classList.add(value); }
      else if (cmd === 'fill') cells.forEach((c) => { c.style.backgroundColor = value || ''; });
      else if (cmd === 'valign') cells.forEach((c) => { c.style.verticalAlign = value; });
      else if (cmd === 'even') t.querySelector('colgroup')?.remove();
      else if (cmd === 'drop') this.dropTable(t);
      if (cols().length && cols().length !== (tableGrid(t)[0]?.length || 0)) t.querySelector('colgroup').remove();
    });
  }

  delRow(t, y) {
    const g = tableGrid(t), rows = [...t.querySelectorAll('tr')], done = new Set();
    g[y].forEach((c, x) => {
      if (done.has(c)) return;
      done.add(c);
      if (c.rowSpan > 1) {
        if (c.parentNode === rows[y]) { let ref = null; for (let k = x + c.colSpan; k < g[y].length; k++) if (g[y + 1]?.[k]?.parentNode === rows[y + 1]) { ref = g[y + 1][k]; break; } rows[y + 1].insertBefore(c, ref); }
        c.rowSpan--;
      }
    });
    rows[y].remove();
  }

  dropTable(t) {
    const top = this.topOf(t);
    let next = top.nextElementSibling;
    if (!next || next.matches(VOID)) { next = el('<p><br></p>'); top.after(next); }
    top.remove();
    this.collapse(next.matches('table') ? next.querySelector('td,th') : next);
  }

  // ------------------------------------------------------------------ keyboard, mouse, clipboard

  listen() {
    const ed = this.ed;
    this._selch = () => { if (document.activeElement === ed && this.range()) { if (this.sel) this.select(null); this.emitSelect(); } };
    document.addEventListener('selectionchange', this._selch);
    ed.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (a && (!this.opt.editable || e.metaKey || e.ctrlKey || a.closest('.toc'))) {
        e.preventDefault();
        const h = a.getAttribute('href');
        if (h.startsWith('#b-')) document.getElementById(h.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else window.open(h, '_blank', 'noopener');
        return;
      }
      const li = e.target.closest('ul.check > li');
      if (li && this.opt.editable && e.target === li && e.clientX < li.getBoundingClientRect().left + 1) { this.do(() => { if (li.dataset.c) li.removeAttribute('data-c'); else li.dataset.c = '1'; }); return; }
      const fn = e.target.closest('sup.fn');
      if (fn && this.opt.editable) { this.opt.onNote?.(fn); return; }
      if (!this.opt.editable) return;
      const v = e.target.closest('img,hr,.pb,.toc');
      if (v && ed.contains(v)) this.select(v.closest('figure') || v);
      else if (this.sel && !this.sel.contains(e.target)) this.select(null);
    });
    if (!this.opt.editable) return;
    ed.addEventListener('compositionstart', () => { this.composing = true; });
    ed.addEventListener('compositionend', () => { this.composing = false; this.soon(50); });
    ed.addEventListener('beforeinput', (e) => this.beforeInput(e));
    ed.addEventListener('input', (e) => {
      if (this.composing) { this.later(); return; }
      if (this._size && ed.querySelector('font[size="7"]')) this.fixSizes();
      if (e.inputType === 'insertText' && e.data === ' ' && this.opt.autoformat?.() !== false) this.autoformat();
      this.opt.onSlash?.(this.slashQuery());
      this.later();
      this.soon();
    });
    ed.addEventListener('keydown', (e) => this.key(e));
    ed.addEventListener('paste', (e) => this.paste(e));
    for (const t of ['copy', 'cut']) ed.addEventListener(t, (e) => this.copy(e, t === 'cut'));
    ed.addEventListener('drop', (e) => {
      const f = [...(e.dataTransfer?.files || [])].filter((x) => x.type.startsWith('image/'));
      if (f.length) { e.preventDefault(); const r = document.caretRangeFromPoint?.(e.clientX, e.clientY); if (r) { getSelection().removeAllRanges(); getSelection().addRange(r); } this.opt.onImageFiles(f); }
    });
    ed.addEventListener('blur', () => this.scan());
    this.tableMouse();
  }

  beforeInput(e) {
    const t = e.inputType;
    if (t === 'historyUndo' || t === 'historyRedo') { e.preventDefault(); this.undo(t === 'historyRedo'); return; }
    if (this.composing) return;
    if (this.sel) { if (/^insert/.test(t) || /^delete/.test(t)) e.preventDefault(); return; }
    this._before = this.caret() || this._before;
    const r = this.range();
    if (!r) return;
    const fmt = { formatBold: 'bold', formatItalic: 'italic', formatUnderline: 'underline' }[t];
    if (fmt) { e.preventDefault(); this.inline(fmt); return; }
    const cells = [...this.ed.querySelectorAll('.csel')];
    if (cells.length && /^delete|^insertText/.test(t)) { cells.forEach((c) => c.replaceChildren(document.createElement('br'))); this.clearCells(); if (t.startsWith('delete')) { e.preventDefault(); this.scan(); } return; }
    if (t === 'insertParagraph') { e.preventDefault(); this._enter(); return; }
    if (!r.collapsed && (/^delete/.test(t) || /^insert/.test(t))) {
      if (this.deleteAcross() && /^delete/.test(t)) { e.preventDefault(); this.scan(); }
      return;
    }
    if (t === 'deleteContentBackward' && this.backspace(r)) { e.preventDefault(); this.scan(); this.emitSelect(); }
    else if (t === 'deleteContentForward' && this.forward(r)) { e.preventDefault(); this.scan(); this.emitSelect(); }
  }

  /** Deletes a selection across blocks without the leftovers of the browsers. True when it did something. */
  deleteAcross() {
    const r = this.range(), all = this.selected();
    if (!r || all.length < 2) return false;
    const a = all[0], z = all.at(-1);
    const inA = a.contains(r.startContainer) ? [r.startContainer, r.startOffset] : [a, 0], inZ = z.contains(r.endContainer) ? [r.endContainer, r.endOffset] : [z, z.childNodes.length];
    const cut = (b, from, to) => {
      if (b.matches(VOID)) { b.remove(); return; }
      const x = document.createRange();
      x.setStart(...(from || [b, 0]));
      x.setEnd(...(to || [b, b.childNodes.length]));
      if (b.matches('table')) { b.querySelectorAll('td,th').forEach((c) => { if (x.intersectsNode(c)) c.replaceChildren(document.createElement('br')); }); return; }
      x.deleteContents();
      b.querySelectorAll('li').forEach((l) => { if (!l.textContent && !l.querySelector('img,br')) l.remove(); });
    };
    for (const b of all.slice(1, -1)) b.remove();
    cut(z, null, inZ);
    cut(a, inA, null);
    if (!a.isConnected && !z.isConnected) {
      const p = el('<p><br></p>');
      this.ed.append(p);
      this.collapse(p);
    } else if (!a.isConnected) this.collapse(z.matches('table') ? z.querySelector('td,th') : z);
    else {
      if (isList(a) && !a.children.length) a.append(el('<li><br></li>'));
      if (z.isConnected && (isText(z) || isList(z)) && (isText(a) || isList(a))) this.merge(a, z);
      else { if (z.isConnected && isText(z) && !z.textContent) z.remove(); fill(a); this.collapse(a.matches('table') ? a.querySelector('td,th') : a, true); }
    }
    return true;
  }

  /** Joins b at the end of a; the caret goes where they meet. */
  merge(a, b) {
    let into = a;
    if (isList(a)) { into = a.lastElementChild; while (into.lastElementChild && isList(into.lastElementChild)) into = into.lastElementChild.lastElementChild; }
    if (into.lastChild?.nodeType === 1 && into.lastChild.localName === 'br') into.lastChild.remove();
    const mark = document.createTextNode('');
    into.append(mark);
    if (isList(b)) {
      const li = b.firstElementChild;
      if (li) { into.append(...[...li.childNodes].filter((n) => !(n.nodeType === 1 && isList(n)))); const sub = li.firstElementChild && isList(li.firstElementChild) ? li.firstElementChild : null; li.remove(); if (sub) { if (isList(a)) into.append(sub); else b.prepend(...sub.children); } }
      if (!b.children.length) b.remove();
      else if (isList(a) && a.localName === b.localName) { a.append(...b.children); b.remove(); }
    } else { into.append(...b.childNodes); b.remove(); }
    fill(into);
    const r = document.createRange();
    r.setStart(mark, 0);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  }

  /** An item joins the text of the one above (its deepest last item); its own sub-list follows it. */
  mergeItems(prev, li) {
    let into = prev;
    while (into.lastElementChild && isList(into.lastElementChild)) into = into.lastElementChild.lastElementChild;
    const subs = [...li.children].filter(isList), p = document.createElement('p');
    for (const c of [...li.childNodes]) if (!subs.includes(c)) p.append(c);
    li.remove();
    this.merge(into, p);
    into.append(...subs);
  }

  backspace(r) {
    const li = this.item(), cell = this.cell();
    if (li && atStart(li, r)) {
      const prev = li.previousElementSibling;
      if (prev && !cell) { // joins the item above
        this.mergeItems(prev, li);
        return true;
      }
      if (cell && !li.parentNode.parentNode.closest('li')) { if (prev) { this.mergeItems(prev, li); return true; } const l = li.parentNode; cell.prepend(...li.childNodes); li.remove(); if (!l.children.length) l.remove(); this.collapse(cell); return true; }
      this.unnest(li);
      return true;
    }
    if (cell) return atStart(cell, r);
    const b = this.topOf(r.startContainer);
    if (!b) return false;
    if (b.matches('figure')) return atStart(b.querySelector('figcaption'), r);
    if (b.matches('.callout,.beside')) {
      if (b.matches('.callout') && atStart(b, r)) { const [first] = this.flatten(b); this.collapse(first); return true; }
      const p = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode).closest('p');
      return !!(p && b.matches('.beside') && p.previousElementSibling?.matches('figure') && atStart(p, r));
    }
    if (!isText(b) || !atStart(b, r)) return false;
    if (b.localName !== 'p' || /title|lead|small/.test(b.className)) { this.collapse(this.retag(b, 'p')); return true; }
    if (b.style.marginLeft) { b.style.marginLeft = ''; return true; }
    const prev = b.previousElementSibling;
    if (!prev) return true;
    if (prev.matches(VOID)) { if (!b.textContent && b.nextElementSibling) b.remove(); this.select(prev); return true; }
    if (prev.matches('table')) { if (!b.textContent && b.nextElementSibling) b.remove(); const c = [...prev.querySelectorAll('td,th')].at(-1); this.collapse(c, true); return true; }
    if (prev.matches('.callout,.beside')) { const p = prev.lastElementChild; if (!b.textContent) { b.remove(); this.collapse(p, true); } else this.merge(p, b); return true; }
    if (!prev.textContent && isText(prev) && prev.localName === 'p' && !prev.querySelector('img,sup')) { prev.remove(); return true; }
    this.merge(prev, b);
    return true;
  }

  forward(r) {
    const cell = this.cell(), li = this.item();
    if (cell) return atEnd(cell, r) && !li;
    const b = this.topOf(r.startContainer);
    if (!b) return false;
    if (li) {
      const last = [...b.querySelectorAll('li')].at(-1) === li;
      if (!atEnd(li, r)) return false;
      if (!last) return false;
    } else if (!isText(b) || !atEnd(b, r)) return false;
    const next = b.nextElementSibling;
    if (!next) return true;
    if (next.matches('table,.callout,.beside,' + VOID)) { if (!b.textContent && isText(b)) { b.remove(); if (next.matches(VOID)) this.select(next); else this.collapse(next.matches('table') ? next.querySelector('td,th') : next.querySelector('p') || next); } else if (next.matches(VOID)) this.select(next); return true; }
    this.merge(b, next);
    return true;
  }

  splitAt(b, r) {
    const x = document.createRange();
    x.setStart(r.startContainer, r.startOffset);
    x.setEnd(b, b.childNodes.length);
    const frag = x.extractContents();
    const n = b.cloneNode(false);
    n.removeAttribute('id');
    n.classList.remove('cur');
    if (!n.className) n.removeAttribute('class');
    n.removeAttribute('data-push'); n.removeAttribute('data-num'); n.removeAttribute('data-hint');
    n.style.removeProperty('padding-top');
    if (!n.getAttribute('style')) n.removeAttribute('style');
    n.append(frag);
    n.querySelectorAll('a,code,strong,em,u,s,span').forEach((x2) => { if (!x2.textContent && !x2.querySelector('br,img,sup')) x2.remove(); });
    fill(b);
    return fill(n);
  }

  _enter() {
    let r = this.range();
    if (!r) return;
    if (!r.collapsed) { if (!this.deleteAcross()) r.deleteContents(); r = this.range(); }
    const li = this.item(), cell = this.cell();
    const node = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const b = this.topOf(r.startContainer) || this.ed.children[r.startOffset];
    if (!b) return;
    if (li) {
      if (!li.textContent && !li.querySelector('img,sup')) {
        if (cell && !li.parentNode.parentNode.closest('li')) { const l = li.parentNode; li.remove(); const br = document.createElement('br'); l.after(br); this.collapse(cell, true); } else { const out = this.unnest(li); if (out) this.collapse(out); }
      } else {
        const n = this.splitAt(li, r);
        n.removeAttribute('data-c');
        li.after(n);
        this.collapse(n);
      }
    } else if (cell || node.closest('figcaption')) {
      if (cell) document.execCommand('insertLineBreak');
      else { const f = node.closest('figure'), top = this.topOf(f); if (top === f) { let n = f.nextElementSibling; if (!n || !isText(n)) { n = el('<p><br></p>'); f.after(n); } this.ed.focus(); this.collapse(n); } }
    } else if (b.matches('pre')) {
      b.querySelectorAll('br').forEach((x) => x.replaceWith('\n'));
      const o = this.offset(b, r.startContainer, r.startOffset), t = b.textContent, rest = t.slice(o);
      if (/^\n?$/.test(rest) && /\n$/.test(t.slice(0, o)) && t.trim()) { // two empty lines at the end: out of the block
        b.textContent = t.replace(/\n+$/, '');
        const p = el('<p><br></p>');
        b.after(p);
        this.collapse(p);
      } else { // the last line break of a block is not drawn: there must be one more
        b.textContent = t.slice(0, o) + '\n' + (rest || '\n');
        this.setCaret({ a: { id: b.id, o: o + 1 }, b: { id: b.id, o: o + 1 } });
      }
    } else if (b.matches('blockquote') && !node.closest('blockquote p')) {
      if (atEnd(b, r) && (!b.textContent || b.lastChild?.localName === 'br' && b.lastChild.previousSibling?.localName === 'br')) { while (b.lastChild?.localName === 'br') b.lastChild.remove(); const p = el('<p><br></p>'); if (b.textContent) b.after(p); else b.replaceWith(p); this.collapse(p); } else document.execCommand('insertLineBreak');
    } else if (b.matches('.callout,.beside')) {
      const p = node.closest('p') || b.lastElementChild;
      if (!p.textContent && p === b.lastElementChild && b.querySelectorAll(':scope > p').length > 1) { p.remove(); const n = el('<p><br></p>'); b.after(n); this.collapse(n); } else { const n = this.splitAt(p, r); p.after(n); this.collapse(n); }
    } else if (isText(b)) {
      const start = atStart(b, r), end = atEnd(b, r);
      if (start && b.textContent && b.localName !== 'p') { const p = el('<p><br></p>'); b.before(p); } else {
        let n = this.splitAt(b, r);
        b.after(n);
        if (end && (/^h/.test(b.localName) || /title/.test(b.className))) { const p = document.createElement('p'); p.append(...n.childNodes); n.replaceWith(p); n = fill(p); }
        this.collapse(n);
      }
    }
    this.scan();
    this.reveal();
    this.emitSelect();
  }

  key(e) {
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (this.opt.onKey?.(e)) { e.preventDefault(); return; }
    if (this.sel && !mod) {
      const top = this.topOf(this.sel);
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); this.removeSelected(); return; }
      if (e.key === 'Escape') { e.preventDefault(); const n = top.nextElementSibling || top; this.select(null); this.collapse(n); return; }
      if (e.key === 'Enter') { e.preventDefault(); const p = el('<p><br></p>'); top.after(p); this.select(null); this.ed.focus(); this.collapse(p); this.scan(); return; }
      if (/^Arrow/.test(e.key)) {
        e.preventDefault();
        const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft', n = back ? top.previousElementSibling : top.nextElementSibling;
        if (!n) return;
        this.select(null);
        if (n.matches(VOID)) this.select(n); else { this.ed.focus(); this.collapse(n.matches('table') ? n.querySelector('td,th') : n, back); }
        return;
      }
    }
    if (e.key === 'Tab') {
      const cell = this.cell(), li = this.item();
      e.preventDefault();
      if (cell && !(li && !atStart(li, this.range()))) {
        const all = [...cell.closest('table').querySelectorAll('td,th')], i = all.indexOf(cell) + (e.shiftKey ? -1 : 1);
        if (all[i]) { const r = document.createRange(); r.selectNodeContents(all[i]); getSelection().removeAllRanges(); getSelection().addRange(r); } else if (i >= all.length) this.table('rowBelow');
        return;
      }
      if (li) { this.indent(e.shiftKey ? -1 : 1); return; }
      const b = this.selected()[0], r = this.range();
      if (b && b.matches('pre')) document.execCommand('insertText', false, '  ');
      else if (b && r && (e.shiftKey || atStart(b, r) || !r.collapsed)) this.indent(e.shiftKey ? -1 : 1);
      else document.execCommand('insertText', false, '\t');
      return;
    }
    if (!mod) {
      // out of a table, callout or picture at the edge of the document
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey) {
        const b = this.selected()[0], down = e.key === 'ArrowDown';
        if (b && b.matches('table,.callout,pre,blockquote,.beside') && !(down ? b.nextElementSibling : b.previousElementSibling)) {
          const r = this.range(), edge = b.matches('table') ? [...b.querySelectorAll('tr')].at(down ? -1 : 0).contains(r.startContainer) : down ? atEnd(b, r) : atStart(b, r);
          if (edge) { e.preventDefault(); const p = el('<p><br></p>'); if (down) b.after(p); else b.before(p); this.collapse(p); this.scan(); }
        } else if (b && isText(b)) {
          const n = down ? b.nextElementSibling : b.previousElementSibling, r = this.range();
          if (n && n.matches('hr,.pb,.toc,figure') && (down ? atEnd(b, r) : atStart(b, r))) { e.preventDefault(); this.select(n); }
        }
      }
      return;
    }
    const go = (fn) => { e.preventDefault(); fn(); };
    if (k === 'z') go(() => this.undo(e.shiftKey));
    else if (k === 'y') go(() => this.undo(true));
    else if (k === 'b') go(() => this.inline('bold'));
    else if (k === 'i') go(() => this.inline('italic'));
    else if (k === 'u') go(() => this.inline('underline'));
    else if (k === 'e' && !e.shiftKey) go(() => this.inline('code'));
    else if (k === 'x' && e.shiftKey) go(() => this.inline('strikeThrough'));
    else if (k === '\\') go(() => this.inline('clear'));
    else if (e.altKey && /^Digit[0-4]$/.test(e.code)) go(() => this.block(e.code === 'Digit0' ? 'p' : 'h' + e.code.at(-1)));
    else if (e.shiftKey && e.code === 'Digit7') go(() => this.list('ol'));
    else if (e.shiftKey && e.code === 'Digit8') go(() => this.list('ul'));
    else if (e.shiftKey && e.code === 'Digit9') go(() => this.list('check'));
    else if (e.shiftKey && ['l', 'e', 'r', 'j'].includes(k)) go(() => this.align({ l: 'left', e: 'center', r: 'right', j: 'justify' }[k]));
    else if (e.key === 'Enter') go(() => this.insertBreak());
    else if (k === ']' || k === '[') go(() => this.indent(k === ']' ? 1 : -1));
  }

  /** "# ", "- ", "1. ", "[] ", "> " at the beginning of a paragraph. */
  autoformat() {
    const r = this.range(), b = r && this.topOf(r.startContainer);
    if (!b || b.localName !== 'p' || this.cell() || this.item()) return;
    const m = b.textContent.match(/^(#{1,4}|[-*+]|1[.)]|\[ ?\]|>|```)[  ]/);
    if (!m || this.offset(b, r.startContainer, r.startOffset) !== m[0].length) return;
    this.scan();
    const x = document.createRange();
    x.setStart(b, 0);
    x.setEnd(r.startContainer, r.startOffset);
    x.deleteContents();
    fill(b);
    this.collapse(b);
    const k = m[1];
    if (k[0] === '#') this.block('h' + k.length);
    else if (k === '>') this.block('blockquote');
    else if (k === '```') this.block('pre');
    else this.list(k[0] === '[' ? 'check' : k[0] === '1' ? 'ol' : 'ul');
  }

  /** The text after "/" when the caret is right after it, or null. */
  slashQuery() {
    const r = this.range();
    if (!r || !r.collapsed || r.startContainer.nodeType !== 3) return null;
    const t = r.startContainer.nodeValue.slice(0, r.startOffset), m = t.match(/(?:^|\s)\/([\p{L}\p{N} ]{0,20})$/u);
    if (!m || (this.topOf(r.startContainer)?.matches('pre'))) return null;
    const x = document.createRange();
    x.setStart(r.startContainer, r.startOffset - m[1].length - 1);
    x.setEnd(r.startContainer, r.startOffset);
    return { q: m[1].toLowerCase(), range: x };
  }

  copy(e, cut) {
    if (this.sel) {
      e.preventDefault();
      const h = cleanNode(this.topOf(this.sel));
      e.clipboardData.setData('text/html', h);
      e.clipboardData.setData('text/plain', this.sel.textContent);
      if (cut) this.removeSelected();
      return;
    }
    const r = this.range();
    if (!r || r.collapsed) return;
    e.preventDefault();
    const box = document.createElement('div');
    box.append(r.cloneContents());
    const tops = this.selected();
    let html;
    if (tops.length > 1) html = [...box.children].map((n) => cleanNode(n)).join('');
    else { // inside one block: keep its kind only when all of it is taken
      const b = tops[0], whole = b && isText(b) && r.toString() === b.textContent;
      const inner = [...box.childNodes].map((n) => cleanNode(n, 1)).join('');
      html = whole ? cleanNode(b) : isList(b) && box.querySelector('li') ? `<${b.localName}${b.matches('.check') ? ' class="check"' : ''}>${inner}</${b.localName}>` : inner;
    }
    e.clipboardData.setData('text/html', `<meta charset="utf-8">${html}`);
    e.clipboardData.setData('text/plain', getSelection().toString());
    if (cut) { this._before = this.caret(); if (!this.deleteAcross()) document.execCommand('delete'); this.scan(); }
  }

  async paste(e) {
    e.preventDefault();
    if (this.sel) { const n = this.topOf(this.sel); const p = el('<p><br></p>'); n.after(p); this.select(null); this.collapse(p); }
    const d = e.clipboardData, files = [...d.files].filter((f) => f.type.startsWith('image/')), html = d.getData('text/html'), txt = d.getData('text/plain');
    if (files.length && !txt.trim()) { this.opt.onImageFiles(files); return; }
    this._before = this.caret();
    const b = this.selected()[0];
    if (!html || this._plain || b?.matches('pre')) {
      this._plain = false;
      const lines = txt.replace(/\r/g, '').split('\n');
      if (b?.matches('pre') || lines.length === 1) { document.execCommand('insertText', false, txt); return; }
      this.insertHtml(lines.filter((l, i) => l.trim() || lines[i - 1]?.trim()).map((l) => `<p>${esc(l) || '<br>'}</p>`));
      return;
    }
    const { blocks, images } = fromPaste(html);
    if (images.length) for (const i of images) { const id = await this.opt.onPasteImage?.(i.src); if (id) blocks.forEach((x, k) => { blocks[k] = x.replaceAll(i.key, id); }); }
    this.insertHtml(blocks.flatMap((x) => cleanBlocks(x)));
  }

  insertHtml(list) {
    const r = this.range();
    if (!r || !list.length) return;
    if (!r.collapsed && !this.deleteAcross()) document.execCommand('delete');
    const one = list.length === 1 ? blockEl(list[0]) : null;
    const cell = this.cell(), li = this.item();
    if ((one && one.matches('p') && !one.className) || cell) {
      const inner = cell ? list.map((h) => { const n = blockEl(h); return n.matches('p,h1,h2,h3,h4,pre,blockquote') ? n.innerHTML : n.matches('ul,ol') ? n.outerHTML : esc(n.textContent); }).join('<br>') : one.innerHTML;
      document.execCommand('insertHTML', false, inner);
      this.scrubSpans();
      this.soon(30);
      return;
    }
    if (li && list.every((h) => /^<[uo]l/.test(h))) {
      const items = list.flatMap((h) => [...blockEl(h).children]);
      li.after(...items);
      if (!li.textContent) li.remove();
      this.collapse(items.at(-1), true);
      this.scan();
      return;
    }
    this.insertBlocks(list.map((h) => blockEl(h)));
  }

  /** insertHTML copies the computed style in spans: they go away. */
  scrubSpans() {
    for (const s of this.ed.querySelectorAll('span[style]')) {
      if (/font-variant|white-space|letter-spacing|orphans/.test(s.getAttribute('style'))) { s.style.cssText = ''; s.replaceWith(...s.childNodes); }
    }
  }

  // ------------------------------------------------------------------ table mouse: columns and groups of cells

  tableMouse() {
    const ed = this.ed;
    let start = null;
    const edge = (e) => {
      const c = e.target.closest?.('td,th');
      if (!c || !ed.contains(c)) return null;
      const r = c.getBoundingClientRect();
      if (Math.abs(e.clientX - r.right) < 5) return { c, side: 1 };
      if (Math.abs(e.clientX - r.left) < 5 && c.previousElementSibling) return { c: c.previousElementSibling, side: 1 };
      return null;
    };
    ed.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (start && e.buttons === 1) {
        const c = e.target.closest?.('td,th');
        if (c && c.closest('table') === start.closest('table') && (c !== start || ed.querySelector('.csel'))) {
          getSelection().removeAllRanges();
          this.selectCells(start, c);
        }
        return;
      }
      ed.style.cursor = edge(e) ? 'col-resize' : '';
    });
    ed.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      const x = e.pointerType === 'mouse' && edge(e);
      if (x) { e.preventDefault(); this.resizeColumn(e, x.c); return; }
      start = e.target.closest?.('td,th');
      if (!e.target.closest?.('.csel') || e.button === 0) this.clearCells();
    });
    addEventListener('pointerup', () => {
      if (start && this.ed.querySelector('.csel')) { this.ed.focus({ preventScroll: true }); this.collapse(start, true); }
      start = null;
    });
  }

  selectCells(a, b) {
    const t = a.closest('table'), g = tableGrid(t);
    const pos = (c) => { for (let y = 0; y < g.length; y++) { const x = g[y].indexOf(c); if (x >= 0) return [x, y, x + c.colSpan - 1, y + c.rowSpan - 1]; } };
    const p = pos(a), q = pos(b);
    const box = [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[2], q[2]), Math.max(p[3], q[3])];
    this.quiet(() => {
      ed_each(t, (c) => c.classList.remove('csel'));
      for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) g[y][x]?.classList.add('csel');
    });
    this.emitSelect();
  }

  resizeColumn(e, cell) {
    const t = cell.closest('table'), g = tableGrid(t), n = g[0].length, W = t.getBoundingClientRect().width;
    let col = -1;
    for (const r of g) { const i = r.lastIndexOf(cell); if (i >= 0) { col = i; break; } }
    if (col < 0 || col >= n - 1) return;
    const have = [...t.querySelectorAll(':scope > colgroup > col')].map((c) => parseFloat(c.style.width) || 100 / n);
    const w = have.length === n ? have : Array(n).fill(100 / n);
    const x0 = e.clientX, a = w[col], b = w[col + 1];
    const move = (ev) => {
      const d = Math.max(4 - a, Math.min(b - 4, ((ev.clientX - x0) / W) * 100));
      w[col] = a + d;
      w[col + 1] = b - d;
      let cg = t.querySelector(':scope > colgroup');
      if (!cg) { cg = document.createElement('colgroup'); t.prepend(cg); }
      cg.innerHTML = w.map((x) => `<col style="width:${x.toFixed(2)}%">`).join('');
      this.quiet(() => this.dressTable(t));
      this.dirty.add(this.topOf(t));
      this.later();
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); this.scan(); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  // ------------------------------------------------------------------ search, comments

  /** Ranges of a text in the document (or in one block). */
  find(q, { matchCase = false, block = null } = {}) {
    const out = [];
    if (!q) return out;
    const needle = matchCase ? q : q.toLowerCase();
    for (const b of block ? [block] : this.ed.children) {
      if (b.matches('.toc,.pb,hr')) continue;
      const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), nodes = [];
      let s = '';
      for (let n = w.nextNode(); n; n = w.nextNode()) { nodes.push([n, s.length]); s += n.nodeValue; }
      const hay = matchCase ? s : s.toLowerCase();
      if (hay.length !== s.length) continue;
      for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) {
        const at = (p, end) => { for (let k = nodes.length - 1; k >= 0; k--) if (nodes[k][1] < p || (!end && nodes[k][1] === p)) return [nodes[k][0], p - nodes[k][1]]; return [nodes[0][0], 0]; };
        const r = document.createRange();
        r.setStart(...at(i, false));
        r.setEnd(...at(i + q.length, true));
        out.push(r);
      }
    }
    return out;
  }

  replace(ranges, text) {
    this.do(() => { for (const r of [...ranges].reverse()) { r.deleteContents(); if (text) r.insertNode(document.createTextNode(text)); } for (const b of this.ed.children) b.normalize(); });
  }

  headings() { return [...this.ed.children].filter((b) => /^h[1-4]$/.test(b.localName) && b.textContent.trim()).map((b) => ({ id: b.id, level: +b.localName[1], text: (b.dataset.num ? b.dataset.num + ' ' : '') + b.textContent })); }

  counts() {
    let t = '';
    for (const b of this.ed.children) if (!b.matches('.toc,.pb')) t += b.innerText + '\n';
    return { words: (t.match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}’'-]*/gu) || []).length, chars: t.replace(/\n/g, '').length };
  }
}

function ed_each(t, fn) { t.querySelectorAll('td,th').forEach(fn); }

/** The cells of a table by row and column, joined cells repeated. */
export function tableGrid(t) {
  const g = [];
  [...t.querySelectorAll('tr')].forEach((tr, y) => {
    g[y] ||= [];
    let x = 0;
    for (const c of tr.children) {
      while (g[y][x]) x++;
      for (let i = 0; i < c.rowSpan; i++) for (let j = 0; j < c.colSpan; j++) { (g[y + i] ||= [])[x + j] = c; }
      x += c.colSpan;
    }
  });
  return g.slice(0, t.querySelectorAll('tr').length);
}

/** HTML of the clipboard (Word, Google Docs, web pages) as blocks; pictures are kept aside to be uploaded. */
export function fromPaste(html) {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  body.querySelectorAll('b[id^="docs-internal"],b[style*="font-weight:normal"],b[style*="font-weight: normal"]').forEach((b) => b.replaceWith(...b.childNodes));
  const images = [];
  body.querySelectorAll('img').forEach((i) => {
    const own = i.dataset.i;
    const key = newKey();
    images.push({ key, src: own ? 'own:' + own : i.src });
    i.setAttribute('data-i', key);
    if (!i.closest('figure')) { const f = document.createElement('figure'); f.append(i.cloneNode()); const p = i.closest('p,div,h1,h2,h3,td,li') || i; if (p !== i && !p.matches('td,li')) { p.after(f); i.remove(); if (!p.textContent.trim()) p.remove(); } else i.replaceWith(f); }
  });
  // Word lists are paragraphs with a class
  body.querySelectorAll('p.MsoListParagraph,p.MsoListParagraphCxSpFirst,p.MsoListParagraphCxSpMiddle,p.MsoListParagraphCxSpLast').forEach((p) => {
    const mark = p.querySelector('span[style*="mso-list:Ignore"]') || p.querySelector('span[style*="mso-list"]');
    const tag = mark && /\d/.test(mark.textContent) ? 'ol' : 'ul';
    mark?.remove();
    const li = document.createElement('li');
    li.append(...p.childNodes);
    const prev = p.previousElementSibling;
    if (prev && prev.localName === tag && prev._mso) { prev.append(li); p.remove(); } else { const l = document.createElement(tag); l._mso = true; l.append(li); p.replaceWith(l); }
  });
  body.querySelectorAll('[style]').forEach((n) => {
    const s = n.style, wrap = (tag) => { const x = document.createElement(tag); x.append(...n.childNodes); n.append(x); };
    if (n.matches('span,font,a,p,li,td,div')) {
      if (!n.matches('p,div,li,td') || n.localName === 'span') {
        if (/^(bold|[6-9]00)$/.test(s.fontWeight)) wrap('strong');
        if (s.fontStyle === 'italic') wrap('em');
        if (/underline/.test(s.textDecoration) && !n.closest('a')) wrap('u');
        if (/line-through/.test(s.textDecoration)) wrap('s');
        if (s.verticalAlign === 'super') wrap('sup');
        if (s.verticalAlign === 'sub') wrap('sub');
      }
    }
    const keep = n.matches('span') && !n.closest('[data-b]') ? { color: /^(rgb\(0, 0, 0\)|#000|black|inherit)/.test(s.color) ? '' : s.color, bg: s.backgroundColor } : null;
    const ta = s.textAlign, w = n.localName === 'col' ? s.width : '';
    n.removeAttribute('style');
    if (keep?.color && /^(rgb|#)/.test(keep.color)) n.style.color = keep.color;
    if (keep?.bg && /^(rgb|#)/.test(keep.bg) && !/rgba\(.*, 0\)|255, 255, 255/.test(keep.bg)) n.style.backgroundColor = keep.bg;
    if (/center|right|justify/.test(ta) && n.matches('p,h1,h2,h3,h4,td,th,div')) n.style.textAlign = ta;
    if (w) n.style.width = w;
  });
  body.querySelectorAll('[id],[class]').forEach((n) => n.removeAttribute('id'));
  body.querySelectorAll('td > p:only-child, th > p:only-child, li > p:only-child').forEach((p) => p.replaceWith(...p.childNodes));
  const lone = [...body.childNodes].every((n) => n.nodeType === 3 || (n.nodeType === 1 && !n.matches('p,h1,h2,h3,h4,h5,h6,ul,ol,table,blockquote,pre,div,hr,figure,meta')));
  return { blocks: lone ? [`<p>${body.innerHTML}</p>`] : cleanBlocks(body.innerHTML), images };
}
const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
