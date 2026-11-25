/** Dialogs of what is inserted: link, note, formula, special characters, drawing, table. */
import { btn, colorField, dialog, h, iconBtn, num, range, row, select, tile, toast } from './ui.js';
import { t } from './i18n.js';
import { cleanHref } from './clean.js';
import { mathml } from './math.js';

export function linkDialog(W) {
  const { ed } = W, st = ed.state(), c = ed.caret() || W.lastCaret;
  const url = h('sav-input', { label: t('link_url'), value: st.link?.getAttribute('href') || '', placeholder: 'https://', autofocus: true });
  const lab = st.collapsed && !st.link ? h('sav-input', { label: t('link_label') }) : null, heads = ed.headings();
  const head = heads.length ? select(t('link_heading'), [['', t('none')], ...heads.map((x) => ['#' + x.id, x.text.slice(0, 60)])], (st.link?.getAttribute('href') || '').startsWith('#') ? st.link.getAttribute('href') : '', (v) => { if (v) url.value = v; }, { size: 'md', searchable: heads.length > 8 }) : null;
  dialog({ title: t('link'), body: h('div.form', url, lab, head), actions: [st.link ? { label: t('unlink'), icon: 'unlink', run: () => { if (c) ed.setCaret(c); ed.link(''); } } : { label: t('cancel') }, { label: t('apply'), primary: true, run: () => {
    let v = url.value.trim();
    if (/^[^\s@]+@[^\s@]+\.\w+$/.test(v)) v = 'mailto:' + v;
    else if (/^\+?[\d ()-]{6,}$/.test(v)) v = 'tel:' + v.replace(/[^\d+]/g, '');
    else if (v && !/^(https?:|mailto:|tel:|#)/i.test(v) && /^[\w-]+(\.[\w-]+)+/.test(v)) v = 'https://' + v;
    v = cleanHref(v);
    if (!v) { toast(t('link_bad'), 'warning'); return false; }
    ed.ed.focus({ preventScroll: true });
    if (c) ed.setCaret(c);
    ed.link(v, lab?.value.trim() || (v.startsWith('#') ? heads.find((x) => '#' + x.id === v)?.text : ''));
  } }] });
}

export function noteDialog(W, fn) {
  const { ed } = W, c = ed.caret() || W.lastCaret, ta = h('sav-textarea', { label: t('note_text'), value: fn?.dataset.n || '', rows: 4, maxlength: 2000, autofocus: true });
  dialog({ title: t('i_note'), body: ta, actions: [fn ? { label: t('delete'), icon: 'trash', run: () => ed.do(() => fn.remove()) } : { label: t('cancel') }, { label: t('save'), primary: true, run: () => { const v = ta.value.trim(); if (!v) return false; if (fn) ed.do(() => { fn.dataset.n = v; }); else { ed.ed.focus({ preventScroll: true }); if (c) ed.setCaret(c); ed.do(() => ed.fixFn(v)); } } }] });
}

const FORMULAS = [['x^2'], ['x_i'], ['\\frac{a}{b}'], ['\\sqrt{x}'], ['\\sqrt[n]{x}'], ['\\sum_{i=1}^{n} x_i'], ['\\int_a^b f(x)\\,dx'], ['\\lim_{x \\to 0} f(x)'], ['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'], ['\\begin{cases} x & x \\ge 0 \\\\ -x & x < 0 \\end{cases}'], ['\\left( x \\right)'], ['\\vec{v}'], ['\\bar{x}'], ['\\binom{n}{k}']];
const GREEK = 'alpha beta gamma delta epsilon theta lambda mu pi rho sigma phi omega Delta Sigma Omega infty pm times cdot le ge ne approx to in subset cup cap forall exists partial nabla'.split(' ');
export function mathDialog(W, span) {
  const { ed } = W, c = ed.caret() || W.lastCaret, block0 = span?.parentNode.matches('.eq');
  const src = h('sav-textarea', { label: t('math_src'), rows: 3, value: span?.dataset.m || '', maxlength: 800, autofocus: true, spellcheck: 'false' }), view = h('div.mathview'), own = h('sav-switch', { checked: span ? block0 : true }, t('math_block'));
  if (span) own.hidden = true;
  const paint = () => { view.innerHTML = src.value.trim() ? mathml(src.value, span ? block0 : own.checked) : ''; };
  src.addEventListener('input', paint);
  own.addEventListener('change', paint);
  const put1 = (x) => { const v = src.value; src.value = v + (v && !/\s$/.test(v) ? ' ' : '') + x; paint(); src.focus?.(); };
  const tiles = h('div.mtiles', FORMULAS.map(([x]) => tile(x, () => put1(x), { class: 'mt' }, h('span', { html: mathml(x, false) })))), greek = h('div.mtiles.small', GREEK.map((g) => tile('\\' + g, () => put1('\\' + g), { class: 'mt' }, h('span', { html: mathml('\\' + g, false) }))));
  dialog({ title: t('i_math'), width: '40rem', body: h('div.form', src, view, own, h('span.flabel', t('math_ready')), tiles, greek, h('p.muted.hint', t('math_hint'))), actions: [span ? { label: t('delete'), icon: 'trash', run: () => ed.do(() => { const p = span.parentNode; if (p.matches('.eq') && p.children.length === 1) p.remove(); else span.remove(); }) } : { label: t('cancel') }, { label: t('apply'), primary: true, run: () => {
    const v = src.value.trim();
    if (!v) return false;
    if (span) { ed.do(() => { span.dataset.m = v; }); return undefined; }
    ed.ed.focus({ preventScroll: true });
    if (c) ed.setCaret(c);
    ed.insertMath(v, own.checked);
    return undefined;
  } }] });
  paint();
}

const CHARS = { punct: '« » “ ” ‘ ’ – — … · • § ¶ † ‡ ¡ ¿ ‰ № ª º', curr: '€ $ £ ¥ ¢ ₽ ₹ ₿', arrows: '← ↑ → ↓ ↔ ↕ ⇐ ⇒ ⇔ ↩ ↪ ➜', math: '± × ÷ ≠ ≈ ≤ ≥ ∞ √ ∑ ∏ ∫ ∂ ∆ π µ ° ′ ″ ½ ⅓ ¼ ¾ ¹ ² ³', signs: '© ® ™ ✓ ✗ ★ ☆ ♠ ♣ ♥ ♦ ■ □ ● ○ ▲ ▼ ◆ ☐ ☑', greek: 'α β γ δ ε ζ η θ λ μ ν ξ π ρ σ τ φ χ ψ ω Γ Δ Θ Λ Σ Φ Ψ Ω', latin: 'À È É Ì Ò Ù à è é ì ò ù Ä Ö Ü ä ö ü ß Ç ç Ñ ñ Å å Æ æ Ø ø Œ œ' };
export function charsDialog(W) {
  const c = W.ed.caret() || W.lastCaret;
  let caret = c;
  const type = (x) => { W.ed.ed.focus({ preventScroll: true }); if (caret) W.ed.setCaret(caret); W.ed.do(() => document.execCommand('insertText', false, x)); caret = W.ed.caret() || caret; };
  dialog({ title: t('i_chars'), width: '34rem', body: h('div.form', Object.entries(CHARS).map(([k, l]) => h('div', h('span.flabel', t('ch_' + k)), h('div.chars', l.split(' ').map((x) => tile(x, () => type(x), { class: 'mt' }, x)))))), actions: [{ label: t('done'), primary: true }] });
}

export function tableDialog(W) {
  const { ed } = W, c = ed.caret() || W.lastCaret;
  let r = 3, k = 3, style = '';
  const view = h('div.doc.tprev'), paint = () => { view.innerHTML = `<table class="${style}" style="--cols:repeat(${k},minmax(0,1fr))"><tbody>${Array.from({ length: Math.min(r, 8) }, (_, y) => `<tr>${(y ? '<td>&nbsp;</td>' : '<th>&nbsp;</th>').repeat(k)}</tr>`).join('')}</tbody></table>`; };
  paint();
  dialog({ title: t('i_table'), width: '28rem', body: h('div.form', range(t('t_rows'), r, 1, 30, 1, (v) => { r = v; paint(); }), range(t('t_cols'), k, 1, 12, 1, (v) => { k = v; paint(); }), select(t('t_style'), [['', t('t_grid')], ['plain', t('t_plain')], ['striped', t('t_striped')], ['bare', t('t_bare')]], '', (v) => { style = v; paint(); }, { size: 'md' }), view), actions: [{ label: t('cancel') }, { label: t('insert'), primary: true, run: () => { ed.ed.focus({ preventScroll: true }); if (c) ed.setCaret(c); ed.insertTable(r, k); if (style) ed.table('style', style); } }] });
}

/** A drawing or a signature made by hand: it becomes a picture. */
export function drawDialog(W) {
  const c = W.ed.caret() || W.lastCaret, cv = h('canvas.drawpad', { width: 1200, height: 500, 'aria-label': t('i_drawing') }), x = cv.getContext('2d'), undo = [];
  let color = '#1c1c1c', size = 5, down = false, used = false, pts = [];
  x.lineCap = x.lineJoin = 'round';
  const at = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * cv.width, ((e.clientY - r.top) / r.height) * cv.height]; };
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); undo.push(x.getImageData(0, 0, cv.width, cv.height)); if (undo.length > 20) undo.shift(); down = true; pts = [at(e)]; x.fillStyle = color; x.beginPath(); x.arc(...pts[0], size / 2, 0, 7); x.fill(); used = true; });
  cv.addEventListener('pointermove', (e) => { if (!down) return; for (const q of e.getCoalescedEvents?.() || [e]) { pts.push(at(q)); const n = pts.length; if (n < 3) continue; const [a, b, d] = pts.slice(-3), m1 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], m2 = [(b[0] + d[0]) / 2, (b[1] + d[1]) / 2]; x.strokeStyle = color; x.lineWidth = size; x.beginPath(); x.moveTo(...m1); x.quadraticCurveTo(...b, ...m2); x.stroke(); } });
  for (const k of ['pointerup', 'pointercancel']) cv.addEventListener(k, () => { down = false; });
  dialog({ title: t('i_drawing'), width: '46rem', body: h('div.form', cv, row(colorField(t('color'), color, (v) => { color = v || '#1c1c1c'; }), num(t('thickness'), size, (v) => { size = v; }, { min: 1, max: 40 }), iconBtn('undo-2', t('undo'), () => { const u = undo.pop(); if (u) x.putImageData(u, 0, 0); }, { appearance: 'outline' }), btn(t('clear_all'), { size: 'sm', icon: 'trash', onclick: () => { undo.push(x.getImageData(0, 0, cv.width, cv.height)); x.clearRect(0, 0, cv.width, cv.height); } })), h('p.muted.hint', t('drawing_hint'))), actions: [{ label: t('cancel') }, { label: t('insert'), primary: true, run: async () => {
    if (!used) return false;
    // only the part with ink
    const d = x.getImageData(0, 0, cv.width, cv.height).data;
    let a = cv.width, b = cv.height, e = 0, f = 0;
    for (let y = 0; y < cv.height; y += 2) for (let q = 0; q < cv.width; q += 2) if (d[(y * cv.width + q) * 4 + 3]) { a = Math.min(a, q); b = Math.min(b, y); e = Math.max(e, q); f = Math.max(f, y); }
    if (e <= a) return false;
    const p = 12, o = document.createElement('canvas');
    o.width = e - a + 2 * p; o.height = f - b + 2 * p;
    o.getContext('2d').drawImage(cv, a - p, b - p, o.width, o.height, 0, 0, o.width, o.height);
    const id = await W.store.addImage(await new Promise((r) => o.toBlob(r, 'image/png')));
    W.ed.ed.focus({ preventScroll: true });
    if (c) W.ed.setCaret(c);
    W.ed.insertImage(id, t('i_drawing'), '', Math.max(12, Math.min(100, Math.round((o.width / 1200) * 100))));
    return undefined;
  } }] });
}
