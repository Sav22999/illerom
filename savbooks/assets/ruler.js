/**
 * Rulers and margins. The ruler above the page and the one beside it show centimetres; their handles move the margins, and
 * the indents of the paragraph with the caret. The same margins can be dragged on the page itself.
 * (SavComponents has no ruler: the only control of the app made here.)
 */
import { MM, pageMM } from './settings.js';

const el = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };
const mm = (px) => px / MM;
const PT = 96 / 72;

export class Rulers {
  /** o: {desk, paper, ed, zoom(), label(key), onmargin(settings, done), onindent(values, done)} */
  constructor(o) {
    Object.assign(this, o);
    this.h = el('ruler rh', '<div class="rin"><canvas></canvas></div>');
    this.v = el('ruler rv', '<canvas></canvas>');
    this.tip = el('rtip');
    this.tip.hidden = true;
    this.guides = el('mguides');
    this.hin = this.h.firstChild;
    this.handles = {};
    for (const [k, box] of [['ml', this.hin], ['mr', this.hin], ['il', this.hin], ['fl', this.hin], ['mt', this.v], ['mb', this.v]]) {
      const b = el('rhandle r-' + k);
      b.setAttribute('role', 'slider');
      b.tabIndex = 0;
      b.title = this.label(k);
      b.setAttribute('aria-label', this.label(k));
      b.addEventListener('pointerdown', (e) => this.drag(e, k, b));
      b.addEventListener('keydown', (e) => this.key(e, k));
      b.addEventListener('mousedown', (e) => e.preventDefault());
      box.append(b);
      this.handles[k] = b;
    }
    for (const k of ['ml', 'mr', 'mt', 'mb']) {
      const g = el('mguide g-' + k);
      g.title = this.label(k);
      g.addEventListener('pointerdown', (e) => this.drag(e, k, g));
      g.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
      this.guides.append(g);
      this['g_' + k] = g;
    }
    this.desk.prepend(this.h);
    this.paper.append(this.v, this.guides);
    document.body.append(this.tip);
  }

  destroy() { this.tip.remove(); this.h.remove(); }

  show(on) { this.off = !on; this.h.hidden = this.v.hidden = this.guides.hidden = !on; if (on) this.draw(); }

  /** Margins and indents, in mm. */
  values() {
    const s = this.ed.settings, b = this.ed.selected()[0], text = b && b.matches('p,h1,h2,h3,h4') ? b : null;
    const pt = (v) => (v ? (parseFloat(v) * (/px$/.test(v) ? 1 : PT)) / MM : 0);
    return { ml: s.ml, mr: s.mr, mt: s.mt, mb: s.mb, il: text ? pt(text.style.marginLeft) : null, fl: text ? pt(text.style.textIndent) : null };
  }

  draw() {
    if (this.off || !this.ed.settings) return;
    const s = this.ed.settings, z = this.zoom(), [pw, ph] = pageMM(s), val = this.live || this.values();
    const hw = pw * MM * z;
    this.hin.style.width = hw + 'px';
    const r = this.paper.getBoundingClientRect(), d = this.desk.getBoundingClientRect();
    this.hin.style.left = r.left - d.left + 'px';
    this.paint(this.hin.firstChild, pw, hw, 22, val.ml, pw - val.mr, false);
    const at = (k, x) => { this.handles[k].style.left = x * MM * z + 'px'; };
    at('ml', val.ml);
    at('mr', pw - val.mr);
    for (const k of ['il', 'fl']) this.handles[k].hidden = val.il === null;
    if (val.il !== null) { at('il', val.ml + val.il); at('fl', val.ml + val.il + val.fl); }
    // beside the page that is being read
    const g = this.ed.pager.g;
    if (!g) return;
    const y = (this.desk.scrollTop + this.desk.clientHeight / 2.5) / z - this.paper.offsetTop, page = Math.max(0, Math.min(this.ed.pager.pages - 1, Math.floor(y / g.pitch))), top = page * g.pitch;
    this.v.style.top = this.guides.style.top = top + 'px';
    this.v.style.height = this.guides.style.height = ph * MM + 'px';
    this.paint(this.v.firstChild, ph, ph * MM, 22, val.mt, ph - val.mb, true);
    this.handles.mt.style.top = val.mt * MM + 'px';
    this.handles.mb.style.top = (ph - val.mb) * MM + 'px';
    this.g_ml.style.left = val.ml * MM + 'px';
    this.g_mr.style.left = (pw - val.mr) * MM + 'px';
    this.g_mt.style.top = val.mt * MM + 'px';
    this.g_mb.style.top = (ph - val.mb) * MM + 'px';
  }

  paint(c, len, px, thick, a, b, vert) {
    const dpr = devicePixelRatio || 1, w = vert ? thick : px, h = vert ? px : thick, cs = getComputedStyle(this.desk), key = [w, h, a, b, dpr, cs.getPropertyValue('--sav-color-text')].join();
    if (c._key === key) return;
    c._key = key;
    c.width = w * dpr; c.height = h * dpr;
    c.style.width = w + 'px'; c.style.height = h + 'px';
    const x = c.getContext('2d'), k = px / len;
    x.scale(dpr, dpr);
    x.fillStyle = cs.getPropertyValue('--ruler-off') || '#dfe6e1';
    x.fillRect(0, 0, w, h);
    x.fillStyle = cs.getPropertyValue('--ruler-on') || '#fff';
    if (vert) x.fillRect(0, a * k, w, (b - a) * k); else x.fillRect(a * k, 0, (b - a) * k, h);
    x.strokeStyle = x.fillStyle = cs.getPropertyValue('--sav-color-text-muted') || '#667';
    x.font = '500 9px Inter, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.globalAlpha = 0.85;
    // centimetres from the margin, as on paper rulers
    const step = k * 5 < 7 ? 10 : 5;
    for (let m = Math.ceil(-a / step) * step; m <= len - a; m += step) {
      const p = (a + m) * k, big = m % 10 === 0, label = big && m !== 0 && (k * 10 > 16 || m % 20 === 0);
      if (label) { x.save(); x.translate(vert ? thick / 2 : p, vert ? p : thick / 2); if (vert) x.rotate(-Math.PI / 2); x.fillText(String(Math.abs(m / 10)), 0, 0.5); x.restore(); } else { const t = big ? 7 : 4; x.beginPath(); if (vert) { x.moveTo(thick / 2 - t / 2, p); x.lineTo(thick / 2 + t / 2, p); } else { x.moveTo(p, thick / 2 - t / 2); x.lineTo(p, thick / 2 + t / 2); } x.stroke(); }
    }
  }

  limit(k, v) {
    const s = this.ed.settings, [pw, ph] = pageMM(s), val = this.values();
    if (k === 'ml') return Math.max(0, Math.min(100, pw - val.mr - 30, v));
    if (k === 'mr') return Math.max(0, Math.min(100, pw - val.ml - 30, v));
    if (k === 'mt') return Math.max(0, Math.min(100, ph - val.mb - 30, v));
    if (k === 'mb') return Math.max(0, Math.min(100, ph - val.mt - 30, v));
    return Math.max(0, Math.min(k === 'il' ? 76 : 35, v));
  }

  set(k, v, done) {
    const val = this.live || this.values();
    val[k] = this.limit(k, v);
    this.live = val;
    if (k === 'il' || k === 'fl') this.onindent({ [k]: val[k] / PT * MM }, done);
    else this.onmargin({ ...this.ed.settings, [k]: Math.round(val[k] * 10) / 10 }, done);
    if (done) this.live = null;
    this.draw();
  }

  drag(e, k, b) {
    if (e.button) return;
    e.preventDefault();
    e.stopPropagation();
    b.setPointerCapture(e.pointerId);
    const z = this.zoom(), start = this.values()[k], x0 = e.clientX, y0 = e.clientY, vert = k === 'mt' || k === 'mb', sign = k === 'mr' || k === 'mb' ? -1 : 1;
    this.guides.classList.add('on');
    this.guides.dataset.k = k;
    let v = start, raf = 0, moved = false;
    const move = (ev) => {
      const dx = mm((vert ? ev.clientY - y0 : ev.clientX - x0) / z) * sign, step = ev.shiftKey ? 0.1 : 0.5;
      v = this.limit(k, Math.round((start + dx) / step) * step);
      moved = true;
      this.tip.hidden = false;
      this.tip.textContent = `${this.label(k)}: ${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} mm`;
      this.tip.style.left = Math.min(innerWidth - 160, ev.clientX + 14) + 'px';
      this.tip.style.top = ev.clientY + 14 + 'px';
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => this.set(k, v, false));
    };
    const up = () => {
      cancelAnimationFrame(raf);
      b.removeEventListener('pointermove', move);
      b.removeEventListener('pointerup', up);
      b.removeEventListener('pointercancel', up);
      this.tip.hidden = true;
      this.guides.classList.remove('on');
      if (moved) this.set(k, v, true);
      this.live = null;
    };
    b.addEventListener('pointermove', move);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  }

  key(e, k) {
    const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (!d) return;
    e.preventDefault();
    this.set(k, this.values()[k] + d * (k === 'mr' || k === 'mb' ? -1 : 1) * (e.shiftKey ? 5 : 1), true);
  }
}
