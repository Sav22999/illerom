/**
 * The grid on screen. Only the cells that can be seen exist in the page: when it scrolls, the window of cells is drawn
 * again. Frozen rows and columns, the headers and the corner are panes that stay still with CSS "sticky", so the
 * browser moves everything together and nothing lags behind the scroll.
 *
 *   ┌────┬────────┬──────────────┐   corner │ frozen column headers │ column headers
 *   ├────┼────────┼──────────────┤   frozen rows: headers │ frozen cells │ frozen rows
 *   ├────┼────────┼──────────────┤   row headers │ frozen columns │ the cells
 *   └────┴────────┴──────────────┘
 *
 * Every cell is drawn twice: its background, grid lines and borders below, its text above (so a long text can run over
 * the empty cells on its right, as in every spreadsheet). The host (sheet.js) says what each cell shows.
 */
import { colName, DEF_H, DEF_W, MAX_COLS, MAX_ROWS } from './model.js';

const HW = 46, HH = 24; // width of the row headers, height of the column headers
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class Grid {
  /**
   * o: {colW(c), rowH(r), colHidden(c), rowHidden(r), freeze() → {r, c}, size() → {r, c} (how many to offer),
   *     cell(r, c) → {text, css, cls, wrap, align, merge: {r2, c2} | 'covered', empty, bd: css} | null,
   *     on: {select(sel, how), dblclick(r, c), menu(x, y, hit), resizeCol(list, w), resizeRow(list, h), autofit(axis, i),
   *          fill(from, to), scroll(), drop(files)}, editable }
   */
  constructor(host, o) {
    this.o = o;
    this.host = host;
    this.sel = { ranges: [{ r1: 1, c1: 1, r2: 1, c2: 1 }], r: 1, c: 1 };
    this.marks = []; // ranges of the formula being written, each with its colour
    this.people = [];
    this.copyBox = null;
    this.found = null;
    this.wrap = Object.assign(document.createElement('div'), { className: 'gwrap', tabIndex: 0 });
    this.wrap.setAttribute('role', 'grid');
    this.sizer = Object.assign(document.createElement('div'), { className: 'gsizer' });
    this.wrap.append(this.sizer);
    const pane = (k, cls) => { const p = Object.assign(document.createElement('div'), { className: 'gp ' + k + ' ' + (cls || '') }); p.innerHTML = '<div class="bg"></div><div class="tx"></div><div class="sl"></div>'; this.sizer.append(p); return p; };
    this.P = { corner: pane('p00', 'hd'), ch1: pane('pc1', 'hd ch'), ch2: pane('pc2', 'hd ch'), rh1: pane('pr1', 'hd rh'), rh2: pane('pr2', 'hd rh'), b11: pane('b11', 'bd'), b12: pane('b12', 'bd'), b21: pane('b21', 'bd'), b22: pane('b22', 'bd') };
    this.P.corner.querySelector('.bg').innerHTML = '<div class="corner" title=""></div>';
    host.append(this.wrap);
    this.layout();
    this.wrap.addEventListener('scroll', () => { this.later(); this.o.on.scroll?.(); }, { passive: true });
    this.ro = new ResizeObserver(() => this.later());
    this.ro.observe(this.wrap);
    this.mouse();
  }
  destroy() { this.ro.disconnect(); cancelAnimationFrame(this.raf); clearInterval(this.auto); this.wrap.remove(); }

  // ---------------------------------------------------------------- geometry

  /** The positions of rows and columns (prefix sums), computed again when sizes or the frozen panes change. */
  layout() {
    const o = this.o, sz = o.size(), fr = o.freeze();
    this.nr = Math.min(MAX_ROWS, Math.max(sz.r, fr.r + 1));
    this.nc = Math.min(MAX_COLS, Math.max(sz.c, fr.c + 1));
    this.fr = Math.min(fr.r, this.nr - 1);
    this.fc = Math.min(fr.c, this.nc - 1);
    const X = new Float64Array(this.nc + 2), Y = new Float64Array(this.nr + 2);
    for (let c = 1; c <= this.nc; c++) X[c + 1] = X[c] + (o.colHidden(c) ? 0 : o.colW(c));
    for (let r = 1; r <= this.nr; r++) Y[r + 1] = Y[r] + (o.rowHidden(r) ? 0 : o.rowH(r));
    this.X = X; this.Y = Y;
    const FW = X[this.fc + 1], FH = Y[this.fr + 1], RW = X[this.nc + 1] - FW, RH = Y[this.nr + 1] - FH;
    Object.assign(this, { FW, FH, RW, RH });
    const s = this.sizer.style;
    s.gridTemplateColumns = `${HW}px ${FW}px ${RW}px`;
    s.gridTemplateRows = `${HH}px ${FH}px ${RH}px`;
    s.width = HW + FW + RW + 'px';
    s.height = HH + FH + RH + 'px';
    this.wrap.style.setProperty('--hw', HW + 'px');
    this.wrap.style.setProperty('--hh', HH + 'px');
    this.wrap.style.setProperty('--fw', FW + 'px');
    this.wrap.style.setProperty('--fh', FH + 'px');
    this.wrap.classList.toggle('frozen-r', this.fr > 0);
    this.wrap.classList.toggle('frozen-c', this.fc > 0);
  }
  x(c) { return this.X[Math.min(c, this.nc + 1)] ?? this.X[this.nc + 1]; }
  y(r) { return this.Y[Math.min(r, this.nr + 1)] ?? this.Y[this.nr + 1]; }
  w(c) { return this.x(c + 1) - this.x(c); }
  h(r) { return this.y(r + 1) - this.y(r); }
  colAt(px) { let lo = 1, hi = this.nc; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.X[m] <= px) lo = m; else hi = m - 1; } return lo; }
  rowAt(px) { let lo = 1, hi = this.nr; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.Y[m] <= px) lo = m; else hi = m - 1; } return lo; }
  /** Sheet coordinates of a point of the screen, and what is there. */
  hit(cx, cy) {
    const b = this.wrap.getBoundingClientRect(), vx = cx - b.left, vy = cy - b.top;
    const sx = vx < HW ? -1 : vx < HW + this.FW ? vx - HW : this.FW + (vx - HW - this.FW) + this.wrap.scrollLeft;
    const sy = vy < HH ? -1 : vy < HH + this.FH ? vy - HH : this.FH + (vy - HH - this.FH) + this.wrap.scrollTop;
    const c = sx < 0 ? 0 : this.colAt(sx), r = sy < 0 ? 0 : this.rowAt(sy);
    return { r, c, sx, sy, head: sx < 0 && sy < 0 ? 'corner' : sy < 0 ? 'col' : sx < 0 ? 'row' : '', vx, vy };
  }
  /** The window of rows and columns that can be seen in the scrolling part. */
  visible() {
    const W = this.wrap.clientWidth - HW - this.FW, H = this.wrap.clientHeight - HH - this.FH, sl = this.wrap.scrollLeft, st = this.wrap.scrollTop;
    const c1 = Math.max(this.fc + 1, this.colAt(this.FW + sl)), c2 = Math.min(this.nc, this.colAt(this.FW + sl + W + 1) + 1);
    const r1 = Math.max(this.fr + 1, this.rowAt(this.FH + st)), r2 = Math.min(this.nr, this.rowAt(this.FH + st + H + 1) + 1);
    return { r1, r2, c1, c2 };
  }
  /** The rectangle of a cell in the screen. */
  rect(r, c, r2 = r, c2 = c) {
    const b = this.wrap.getBoundingClientRect();
    const sx = (x) => (x < this.FW ? HW + x : HW + x - this.wrap.scrollLeft), sy = (y) => (y < this.FH ? HH + y : HH + y - this.wrap.scrollTop);
    const left = b.left + (c <= this.fc ? HW + this.x(c) : sx(this.x(c))), top = b.top + (r <= this.fr ? HH + this.y(r) : sy(this.y(r)));
    return { left, top, width: this.x(c2 + 1) - this.x(c), height: this.y(r2 + 1) - this.y(r), right: left + this.x(c2 + 1) - this.x(c), bottom: top + this.y(r2 + 1) - this.y(r) };
  }
  /** Brings a cell into view (frozen ones are always seen). */
  show(r, c) {
    const W = this.wrap.clientWidth - HW - this.FW, H = this.wrap.clientHeight - HH - this.FH;
    if (c > this.fc) { const x = this.x(c) - this.FW, x2 = this.x(c + 1) - this.FW; if (x < this.wrap.scrollLeft) this.wrap.scrollLeft = x; else if (x2 > this.wrap.scrollLeft + W) this.wrap.scrollLeft = Math.min(x, x2 - W); }
    if (r > this.fr) { const y = this.y(r) - this.FH, y2 = this.y(r + 1) - this.FH; if (y < this.wrap.scrollTop) this.wrap.scrollTop = y; else if (y2 > this.wrap.scrollTop + H) this.wrap.scrollTop = Math.min(y, y2 - H); }
    this.later();
  }
  /** Rows that fit in a page of the screen (Page Up / Page Down). */
  page() { return Math.max(1, Math.floor((this.wrap.clientHeight - HH - this.FH) / DEF_H) - 1); }

  // ---------------------------------------------------------------- drawing

  later() { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); }); }
  refresh() { this.pages = this.o.pages?.() || null; this.layout(); this.draw(); }
  draw() {
    const v = this.visible(), fr = this.fr, fc = this.fc;
    this.view = v;
    const rowsF = fr ? [1, fr] : null, colsF = fc ? [1, fc] : null, rowsR = [v.r1, v.r2], colsR = [v.c1, v.c2];
    this.cells(this.P.b22, rowsR, colsR, this.x(fc + 1), this.y(fr + 1));
    this.cells(this.P.b12, rowsF, colsR, this.x(fc + 1), 0);
    this.cells(this.P.b21, rowsR, colsF, 0, this.y(fr + 1));
    this.cells(this.P.b11, rowsF, colsF, 0, 0);
    this.heads(this.P.ch2, 'c', colsR, this.x(fc + 1));
    this.heads(this.P.ch1, 'c', colsF, 0);
    this.heads(this.P.rh2, 'r', rowsR, this.y(fr + 1));
    this.heads(this.P.rh1, 'r', rowsF, 0);
    this.overlay();
  }
  cells(p, rows, cols, x0, y0) {
    if (!rows || !cols) { p.firstChild.innerHTML = ''; p.children[1].innerHTML = ''; return; }
    const o = this.o, bg = [], tx = [], seen = new Set();
    const [r1, r2] = rows, [c1, c2] = cols;
    // merged cells that start outside the window but reach into it are drawn from their first cell
    const extra = [];
    for (const g of this.o.merges?.() || []) if (g.r1 <= r2 && g.r2 >= r1 && g.c1 <= c2 && g.c2 >= c1 && (g.r1 < r1 || g.c1 < c1)) extra.push([g.r1, g.c1]);
    const one = (r, c) => {
      if (seen.has(r * 1000 + c)) return;
      seen.add(r * 1000 + c);
      if (o.rowHidden(r) || o.colHidden(c)) return;
      const d = o.cell(r, c);
      if (d?.merge === 'covered') return;
      let R2 = r, C2 = c;
      if (d?.merge) { R2 = d.merge.r2; C2 = d.merge.c2; }
      const left = this.x(c) - x0, top = this.y(r) - y0, w = this.x(C2 + 1) - this.x(c), hh = this.y(R2 + 1) - this.y(r);
      if (w <= 0 || hh <= 0) return;
      const pos = `left:${left}px;top:${top}px;width:${w}px;height:${hh}px`;
      bg.push(`<div class="c${d?.merge ? ' m' : ''}${d?.cls ? ' ' + d.cls : ''}" style="${pos};${d?.bgcss || ''}"></div>`);
      if (d?.bd) bg.push(`<div class="cb" style="left:${left - 1}px;top:${top - 1}px;width:${w + 1}px;height:${hh + 1}px;${d.bd}"></div>`);
      if (!d || d.text === '' || d.text === undefined) { if (d?.html) tx.push(`<div class="t" style="${pos}">${d.html}</div>`); return; }
      // a long text runs over the empty cells on its right (only when it does not wrap and is aligned to the left,
      // and has no button of its own, as the arrow of a dropdown, which must stay at the edge of its cell)
      let wide = w;
      if (!d.wrap && d.align === 'l' && !d.merge && !d.html?.includes('class="dvb')) { for (let k = c + 1, n = 0; k <= Math.min(this.nc, c + 30) && n < 30; k++, n++) { if (o.colHidden(k)) continue; const nx = o.cell(r, k); if (nx && (nx.text !== '' && nx.text !== undefined || nx.merge)) break; wide += this.w(k); if (wide > 1600) break; } }
      tx.push(`<div class="t${d.wrap ? ' wr' : ''} a${d.align || 'l'} v${d.va || 'b'}${d.tcls ? ' ' + d.tcls : ''}" style="left:${left}px;top:${top}px;width:${wide}px;height:${hh}px;${d.css || ''}">${d.html ?? ''}<span>${esc(d.text)}</span></div>`);
    };
    for (const [r, c] of extra) one(r, c);
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) one(r, c);
    p.firstChild.innerHTML = bg.join('');
    p.children[1].innerHTML = tx.join('');
  }
  heads(p, axis, span, z0) {
    if (!span) { p.firstChild.innerHTML = ''; return; }
    const out = [], sel = this.sel.ranges, full = (g) => (axis === 'c' ? g.r1 <= 1 && g.r2 >= MAX_ROWS : g.c1 <= 1 && g.c2 >= MAX_COLS);
    for (let i = span[0]; i <= span[1]; i++) {
      if (axis === 'c' ? this.o.colHidden(i) : this.o.rowHidden(i)) {
        // a thin mark where hidden ones are, to show them again
        if (!(axis === 'c' ? this.o.colHidden(i - 1) : this.o.rowHidden(i - 1))) out.push(`<div class="hid ${axis}" data-${axis}="${i}" style="${axis === 'c' ? 'left' : 'top'}:${(axis === 'c' ? this.x(i) : this.y(i)) - z0 - 3}px"></div>`);
        continue;
      }
      const on = sel.some((g) => (axis === 'c' ? i >= g.c1 && i <= g.c2 : i >= g.r1 && i <= g.r2)), all = on && sel.some((g) => full(g) && (axis === 'c' ? i >= g.c1 && i <= g.c2 : i >= g.r1 && i <= g.r2));
      const st = axis === 'c' ? `left:${this.x(i) - z0}px;width:${this.w(i)}px` : `top:${this.y(i) - z0}px;height:${this.h(i)}px`;
      out.push(`<div class="h${on ? ' on' : ''}${all ? ' all' : ''}" style="${st}">${axis === 'c' ? colName(i) : i}</div>`);
    }
    p.firstChild.innerHTML = out.join('');
  }
  /** Selection, the cell in use, the fill handle, the ranges of a formula, the people, the copied area. */
  overlay() {
    const panes = [[this.P.b11, 1, this.fc, 1, this.fr, 0, 0], [this.P.b12, this.fc + 1, this.nc, 1, this.fr, this.x(this.fc + 1), 0], [this.P.b21, 1, this.fc, this.fr + 1, this.nr, 0, this.y(this.fr + 1)], [this.P.b22, this.fc + 1, this.nc, this.fr + 1, this.nr, this.x(this.fc + 1), this.y(this.fr + 1)]];
    const s = this.sel, last = s.ranges.at(-1), many = s.ranges.length > 1 || last.r1 !== last.r2 || last.c1 !== last.c2;
    for (const [p, c1, c2, r1, r2, x0, y0] of panes) {
      const out = [];
      if (c2 < c1 || r2 < r1) { p.children[2].innerHTML = ''; continue; }
      const box = (g, cls, extra = '', label = '') => {
        const a = { r1: Math.max(g.r1, r1), r2: Math.min(Math.min(g.r2, this.nr), r2), c1: Math.max(g.c1, c1), c2: Math.min(Math.min(g.c2, this.nc), c2) };
        if (a.r1 > a.r2 || a.c1 > a.c2) return;
        const left = this.x(a.c1) - x0, top = this.y(a.r1) - y0, w = this.x(a.c2 + 1) - this.x(a.c1), hh = this.y(a.r2 + 1) - this.y(a.r1);
        // sides cut by the edge of the pane are not drawn
        const cut = `${g.r1 < r1 ? ' nt' : ''}${g.r2 > r2 ? ' nb' : ''}${g.c1 < c1 ? ' nl' : ''}${g.c2 > c2 ? ' nr' : ''}`;
        out.push(`<div class="${cls}${cut}" style="left:${left}px;top:${top}px;width:${w}px;height:${hh}px;${extra}">${label}</div>`);
      };
      // where the printed pages end (the option of the print window)
      if (this.pages) { for (const r of this.pages.rows) box({ r1: r, r2: r, c1: 1, c2: this.nc }, 'pbr'); for (const c of this.pages.cols) box({ r1: 1, r2: this.nr, c1: c, c2: c }, 'pbc'); }
      if (many) for (const g of s.ranges) box(g, 'rg');
      for (const m of this.marks) box(m, 'mk', `--k:${m.color}`);
      if (this.copyBox) box(this.copyBox, 'cp');
      if (this.found) box(this.found, 'fd');
      for (const pp of this.people) if (pp.r) box({ r1: pp.r, c1: pp.c, r2: pp.r, c2: pp.c }, 'pp', `--k:hsl(${pp.hue} 70% 45%)`, `<span>${esc(pp.name)}</span>`);
      const act = this.o.cell(s.r, s.c)?.merge, ag = act && act !== 'covered' ? { r1: s.r, c1: s.c, r2: act.r2, c2: act.c2 } : { r1: s.r, c1: s.c, r2: s.r, c2: s.c };
      box(ag, 'ac');
      if (many) box(last, 'rgb');
      if (this.o.editable && !this.editing) {
        const g = many ? last : ag;
        if (g.r2 >= r1 && g.r2 <= r2 && g.c2 >= c1 && g.c2 <= c2 && g.r2 <= this.nr && g.c2 <= this.nc) out.push(`<div class="fh" style="left:${this.x(g.c2 + 1) - x0 - 4}px;top:${this.y(g.r2 + 1) - y0 - 4}px"></div>`);
      }
      if (this.fillTo) box(this.fillTo, 'fl');
      p.children[2].innerHTML = out.join('');
    }
    this.heads(this.P.ch2, 'c', this.view ? [this.view.c1, this.view.c2] : null, this.x(this.fc + 1));
    this.heads(this.P.ch1, 'c', this.fc ? [1, this.fc] : null, 0);
    this.heads(this.P.rh2, 'r', this.view ? [this.view.r1, this.view.r2] : null, this.y(this.fr + 1));
    this.heads(this.P.rh1, 'r', this.fr ? [1, this.fr] : null, 0);
  }
  /** The pane that holds a cell, and its origin (for the editor and the charts). */
  paneOf(r, c) {
    const fr = r <= this.fr, fc = c <= this.fc;
    const p = fr ? (fc ? this.P.b11 : this.P.b12) : fc ? this.P.b21 : this.P.b22;
    return { p, x0: fc ? 0 : this.x(this.fc + 1), y0: fr ? 0 : this.y(this.fr + 1) };
  }

  // ---------------------------------------------------------------- the mouse

  mouse() {
    const w = this.wrap;
    let drag = null;
    const edge = (h, e) => {
      // near the border between two headers: resizing
      if (h.head === 'col') { const c = this.colAt(h.sx), xs = this.x(c), xe = this.x(c + 1); if (h.sx - xs < 5 && c > 1) return { axis: 'c', i: this.prevShown('c', c - 1) }; if (xe - h.sx < 5) return { axis: 'c', i: c }; }
      if (h.head === 'row') { const r = this.rowAt(h.sy), ys = this.y(r), ye = this.y(r + 1); if (h.sy - ys < 4 && r > 1) return { axis: 'r', i: this.prevShown('r', r - 1) }; if (ye - h.sy < 4) return { axis: 'r', i: r }; }
      return null;
    };
    w.addEventListener('pointermove', (e) => {
      if (drag) return;
      const h = this.hit(e.clientX, e.clientY), ed = this.o.editable && e.pointerType === 'mouse' ? edge(h, e) : null;
      const onFill = e.target.classList?.contains('fh');
      w.style.cursor = ed ? (ed.axis === 'c' ? 'col-resize' : 'row-resize') : onFill ? 'crosshair' : '';
    });
    w.addEventListener('pointerdown', (e) => {
      if (e.button === 2 || e.target.closest('.celledit, .chart, .gpop')) return;
      const h = this.hit(e.clientX, e.clientY);
      if (h.vx > w.clientWidth || h.vy > w.clientHeight) return; // the scroll bars
      // a hidden row or column, shown again
      const hid = e.target.closest('.hid');
      if (hid) { this.o.on.unhide?.(hid.dataset.c ? 'c' : 'r', +(hid.dataset.c || hid.dataset.r)); e.preventDefault(); return; }
      const touch = e.pointerType !== 'mouse';
      if (touch && !e.target.classList.contains('fh')) { this.touchStart = { x: e.clientX, y: e.clientY, h, t: Date.now() }; return; }
      e.preventDefault();
      (this.o.focus || (() => w.focus({ preventScroll: true })))();
      const ed = this.o.editable ? edge(h, e) : null;
      if (ed) {
        const sel = this.headSel(ed.axis, ed.i), start = ed.axis === 'c' ? e.clientX : e.clientY, base = ed.axis === 'c' ? this.w(ed.i) : this.h(ed.i);
        drag = { kind: 'size', ...ed, start, base, list: sel, size: base };
      } else if (e.target.classList.contains('fh')) {
        drag = { kind: 'fill', from: { ...this.sel.ranges.at(-1) } };
      } else if (h.head === 'corner') { this.select({ ranges: [{ r1: 1, c1: 1, r2: MAX_ROWS, c2: MAX_COLS }], r: 1, c: 1 }, 'all'); return; }
      else if (this.o.on.pick?.(h, e)) { drag = { kind: 'pick', h }; } // writing a formula: a click adds a reference
      else {
        const add = e.ctrlKey || e.metaKey, ext = e.shiftKey;
        const g = h.head === 'col' ? { r1: 1, r2: MAX_ROWS, c1: h.c, c2: h.c } : h.head === 'row' ? { r1: h.r, r2: h.r, c1: 1, c2: MAX_COLS } : { r1: h.r, c1: h.c, r2: h.r, c2: h.c };
        const s = this.sel;
        if (ext) { const a = s.ranges.at(-1); s.ranges[s.ranges.length - 1] = this.span({ r: s.r, c: s.c }, h, h.head); this.select(s, 'extend'); }
        else if (add) this.select({ ranges: [...s.ranges, g], r: h.head === 'col' ? 1 : h.r, c: h.head === 'row' ? 1 : h.c }, 'add');
        else this.select({ ranges: [this.grow(g)], r: h.head === 'col' ? 1 : h.r, c: h.head === 'row' ? 1 : h.c }, 'click');
        drag = { kind: 'sel', anchor: { r: h.head === 'col' ? 1 : h.r, c: h.head === 'row' ? 1 : h.c }, head: h.head };
      }
      w.setPointerCapture(e.pointerId);
    });
    w.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.lastMove = e;
      this.dragMove(drag, e);
      // near the edges the grid scrolls by itself
      const b = w.getBoundingClientRect(), dx = e.clientX > b.right - 20 ? 24 : e.clientX < b.left + HW + this.FW ? -24 : 0, dy = e.clientY > b.bottom - 20 ? 24 : e.clientY < b.top + HH + this.FH ? -24 : 0;
      clearInterval(this.auto);
      if ((dx || dy) && drag.kind !== 'size') this.auto = setInterval(() => { w.scrollLeft += dx; w.scrollTop += dy; this.dragMove(drag, this.lastMove); }, 40);
    });
    const up = (e) => {
      clearInterval(this.auto);
      if (this.touchStart && e.type === 'pointerup') {
        const t = this.touchStart, moved = Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10;
        this.touchStart = null;
        if (!moved && t.h.head !== 'corner') {
          const h = t.h, g = h.head === 'col' ? { r1: 1, r2: MAX_ROWS, c1: h.c, c2: h.c } : h.head === 'row' ? { r1: h.r, r2: h.r, c1: 1, c2: MAX_COLS } : { r1: h.r, c1: h.c, r2: h.r, c2: h.c };
          const again = this.sel.r === h.r && this.sel.c === h.c && this.sel.ranges.length === 1 && !h.head && Date.now() - (this.lastTap || 0) < 1200;
          this.lastTap = Date.now();
          if (this.o.on.pick?.(h, e)) return;
          if (again) this.o.on.dblclick(h.r, h.c); else this.select({ ranges: [this.grow(g)], r: h.head === 'col' ? 1 : h.r, c: h.head === 'row' ? 1 : h.c }, 'click');
        }
        return;
      }
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.kind === 'size') { this.o.on.resize?.(d.axis, d.list, Math.round(d.size)); this.sizing = null; }
      if (d.kind === 'fill' && this.fillTo) { const to = this.fillTo; this.fillTo = null; try { this.o.on.fill?.(d.from, to); } finally { this.overlay(); } }
      if (d.kind === 'pick') this.o.on.picked?.();
      if (d.kind === 'sel') this.o.on.selected?.(this.sel);
    };
    w.addEventListener('pointerup', up);
    w.addEventListener('pointercancel', (e) => { this.touchStart = null; up(e); });
    w.addEventListener('dblclick', (e) => {
      const h = this.hit(e.clientX, e.clientY), ed = this.o.editable ? edge(h, e) : null;
      if (ed) { this.o.on.autofit?.(ed.axis, this.headSel(ed.axis, ed.i)); return; }
      if (!h.head && h.r && h.c && !e.target.closest('.chart')) this.o.on.dblclick(h.r, h.c);
    });
    w.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.celledit, .chart')) return;
      e.preventDefault();
      const h = this.hit(e.clientX, e.clientY);
      if (!h.head || h.head === 'col' || h.head === 'row') {
        const inSel = this.sel.ranges.some((g) => (h.head === 'col' ? h.c >= g.c1 && h.c <= g.c2 && g.r1 <= 1 && g.r2 >= MAX_ROWS : h.head === 'row' ? h.r >= g.r1 && h.r <= g.r2 && g.c1 <= 1 && g.c2 >= MAX_COLS : h.r >= g.r1 && h.r <= g.r2 && h.c >= g.c1 && h.c <= g.c2));
        if (!inSel) this.select({ ranges: [h.head === 'col' ? { r1: 1, r2: MAX_ROWS, c1: h.c, c2: h.c } : h.head === 'row' ? { r1: h.r, r2: h.r, c1: 1, c2: MAX_COLS } : this.grow({ r1: h.r, c1: h.c, r2: h.r, c2: h.c })], r: h.head === 'col' ? 1 : h.r, c: h.head === 'row' ? 1 : h.c }, 'click');
      }
      this.o.on.menu(e.clientX, e.clientY, h);
    });
    w.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
    w.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); this.o.on.drop?.([...e.dataTransfer.files]); } });
  }
  prevShown(axis, i) { while (i > 1 && (axis === 'c' ? this.o.colHidden(i) : this.o.rowHidden(i))) i--; return i; }
  /** The headers chosen together with i (resizing one of several selected columns resizes them all). */
  headSel(axis, i) {
    const out = new Set([i]);
    for (const g of this.sel.ranges) {
      const whole = axis === 'c' ? g.r1 <= 1 && g.r2 >= MAX_ROWS : g.c1 <= 1 && g.c2 >= MAX_COLS;
      if (whole && (axis === 'c' ? i >= g.c1 && i <= g.c2 : i >= g.r1 && i <= g.r2)) for (let k = axis === 'c' ? g.c1 : g.r1; k <= (axis === 'c' ? g.c2 : g.r2); k++) out.add(k);
    }
    return [...out].sort((a, b) => a - b);
  }
  dragMove(d, e) {
    if (d.kind === 'size') {
      const delta = (d.axis === 'c' ? e.clientX : e.clientY) - d.start;
      d.size = Math.max(d.axis === 'c' ? 16 : 12, d.base + delta);
      this.sizing = d;
      this.o.on.resizing?.(d.axis, d.list, d.size);
      return;
    }
    const h = this.hit(e.clientX, e.clientY);
    const r = Math.max(1, h.r || 1), c = Math.max(1, h.c || 1);
    if (d.kind === 'pick') { this.o.on.pickMove?.(d.h, { ...h, r, c }); return; }
    if (d.kind === 'fill') {
      const f = d.from, down = r > f.r2 ? r - f.r2 : r < f.r1 ? r - f.r1 : 0, right = c > f.c2 ? c - f.c2 : c < f.c1 ? c - f.c1 : 0;
      // the fill goes one way only: the one moved the most
      let to = null;
      if (Math.abs(down) * 1.2 >= Math.abs(right) && down) to = down > 0 ? { r1: f.r1, c1: f.c1, r2: r, c2: f.c2 } : { r1: r, c1: f.c1, r2: f.r2, c2: f.c2 };
      else if (right) to = right > 0 ? { r1: f.r1, c1: f.c1, r2: f.r2, c2: c } : { r1: f.r1, c1: c, r2: f.r2, c2: f.c2 };
      this.fillTo = to;
      this.overlay();
      return;
    }
    const s = this.sel;
    s.ranges[s.ranges.length - 1] = this.span(d.anchor, { r, c }, d.head);
    this.select(s, 'drag');
  }
  /** The rectangle from an anchor to a cell (whole rows or columns when dragging on the headers). */
  span(a, b, head) {
    if (head === 'col') return { r1: 1, r2: MAX_ROWS, c1: Math.min(a.c, b.c), c2: Math.max(a.c, b.c) };
    if (head === 'row') return { r1: Math.min(a.r, b.r), r2: Math.max(a.r, b.r), c1: 1, c2: MAX_COLS };
    return this.grow({ r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) });
  }
  /** A rectangle grows to cover the merged cells it touches. */
  grow(g) {
    const ms = this.o.merges?.() || [];
    for (let changed = true; changed;) {
      changed = false;
      for (const m of ms) if (m.r1 <= g.r2 && m.r2 >= g.r1 && m.c1 <= g.c2 && m.c2 >= g.c1 && (m.r1 < g.r1 || m.r2 > g.r2 || m.c1 < g.c1 || m.c2 > g.c2)) { g = { r1: Math.min(g.r1, m.r1), c1: Math.min(g.c1, m.c1), r2: Math.max(g.r2, m.r2), c2: Math.max(g.c2, m.c2) }; changed = true; }
    }
    return g;
  }
  select(s, how) {
    this.sel = s;
    this.overlay();
    this.o.on.select(s, how);
  }
}
export const HEAD_W = HW, HEAD_H = HH, DEF = { w: DEF_W, h: DEF_H };
