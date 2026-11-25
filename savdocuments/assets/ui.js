/** Small helpers of the interface. The controls are SavComponents (Soft style), served by the site. */
import { t, has } from './i18n.js';
import { svg } from './icons.js';

/** h('div.row', {onclick}, children…) */
export function h(sel, ...kids) {
  const [tag, ...cls] = sel.split('.');
  const n = document.createElement(tag || 'div');
  if (cls.length) n.className = cls.join(' ');
  if (kids[0] && typeof kids[0] === 'object' && !(kids[0] instanceof Node) && !Array.isArray(kids[0])) {
    for (const [k, v] of Object.entries(kids.shift())) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'html') n.innerHTML = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
  }
  n.append(...kids.flat(5).filter((x) => x !== null && x !== undefined && x !== false));
  return n;
}
export const icon = (name, size) => { const s = h('span.i', { html: svg(name, size), 'aria-hidden': 'true' }); return s; };
export const put = (box, ...kids) => { box.replaceChildren(...kids.flat(5).filter((x) => x !== null && x !== undefined && x !== false)); return box; };

export const errText = (e) => { const k = 'err_' + (e?.code || e?.message || ''); return has(k) ? t(k) : t('err_server'); };
export const toast = (msg, variant = 'primary', opt = {}) => window.Sav.toast(msg, { variant, placement: 'bottom-start', duration: 4000, ...opt });
export const fail = (e) => { if (e?.silent) return; toast(errText(e), 'danger'); if (!has('err_' + (e?.code || e?.message))) console.error(e); };

/** btn('label', {icon, variant, onclick…}): while an async onclick runs the button is busy. */
export function btn(label, o = {}) {
  const { icon: ic, onclick, variant = 'neutral', appearance = 'outline', size = 'md', ...rest } = o;
  const b = h('sav-button', { variant, appearance, size, ...rest }, ic ? h('span', { slot: 'prefix', html: svg(ic, size === 'sm' ? 16 : 18) }) : null, label);
  if (onclick) b.addEventListener('click', async (e) => { if (b.loading) return; const r = onclick(e); if (r?.then) { b.loading = true; try { await r; } catch (x) { fail(x); } finally { b.loading = false; } } });
  return b;
}
export const primary = (label, o = {}) => btn(label, { variant: 'primary', appearance: 'solid', ...o });

/** A toolbar button: plain, so it never takes the selection away from the text. */
export function tool(name, label, onclick, o = {}) {
  const b = h('button.tb' + (o.cls ? '.' + o.cls : ''), { type: 'button', title: label + (o.key ? ` (${o.key})` : ''), 'aria-label': label, html: svg(name) + (o.text ? `<span>${o.text}</span>` : '') + (o.caret ? svg('chevron-down', 13) : '') });
  b.addEventListener('mousedown', (e) => e.preventDefault());
  if (onclick) b.addEventListener('click', (e) => onclick(b, e));
  return b;
}

/** A menu under an element. items: {label, icon, key, on, danger, run} | '-' | {head} | Node */
let openMenu = null;
export function closeMenu() { openMenu?.remove(); openMenu = null; document.removeEventListener('pointerdown', outside, true); }
function outside(e) { if (openMenu && !openMenu.contains(e.target) && e.target !== openMenu.anchor && !openMenu.anchor?.contains?.(e.target)) closeMenu(); }
export function menu(anchor, items, o = {}) {
  if (openMenu && openMenu.anchor === anchor) { closeMenu(); return null; }
  closeMenu();
  const m = h('div.menu' + (o.cls ? '.' + o.cls : ''), { role: 'menu', popover: 'manual' });
  m.anchor = anchor;
  for (const it of items) {
    if (!it) continue;
    if (it === '-') m.append(h('hr'));
    else if (it instanceof Node) m.append(it);
    else if (it.head) m.append(h('div.mh', it.head));
    else {
      const b = h('button.mi' + (it.danger ? '.danger' : '') + (it.on ? '.on' : ''), { type: 'button', role: 'menuitem', style: it.style, disabled: it.disabled }, it.swatch !== undefined ? h('span.sw', { style: it.swatch ? `background:${it.swatch}` : '' }) : it.icon ? icon(it.icon, 17) : null, h('span.ml', it.label), it.key ? h('kbd', it.key) : null, it.on ? icon('check', 15) : null);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => { if (!it.keep) closeMenu(); const r = it.run?.(); if (r?.catch) r.catch(fail); });
      m.append(b);
    }
  }
  m.addEventListener('mousedown', (e) => { if (!e.target.closest('input,select,sav-input,sav-number-input,sav-select,sav-color-picker')) e.preventDefault(); });
  (o.parent || document.body).append(m);
  m.showPopover?.();
  place(m, anchor, o);
  openMenu = m;
  setTimeout(() => document.addEventListener('pointerdown', outside, true));
  m.addEventListener('keydown', (e) => {
    const all = [...m.querySelectorAll('button.mi:not(:disabled)')], i = all.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); anchor.focus?.(); } else if (e.key === 'ArrowDown') { e.preventDefault(); all[(i + 1) % all.length]?.focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); all[(i - 1 + all.length) % all.length]?.focus(); }
  });
  if (o.focus) m.querySelector('button.mi')?.focus();
  return m;
}
export function place(m, anchor, o = {}) {
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor, w = m.offsetWidth, hh = m.offsetHeight;
  let x = o.end ? r.right - w : r.left, y = r.bottom + 6;
  if (o.above || y + hh > innerHeight - 8) y = r.top - hh - 6 > 8 ? r.top - hh - 6 : Math.max(8, innerHeight - hh - 8);
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + 'px';
  m.style.top = Math.max(8, y) + 'px';
}
addEventListener('keydown', (e) => { if (e.key === 'Escape' && openMenu) { e.stopPropagation(); closeMenu(); } }, true);

/** dialog({title, body, actions: [{label, primary, danger, run}], width}); run returning false keeps it open. */
export function dialog({ title, body, actions = [], width = '30rem', onclose }) {
  const d = h('sav-dialog', { label: title, style: `--width:min(${width}, calc(100vw - 2rem))`, 'sheet-on-mobile': true });
  d.append(...[body].flat().filter(Boolean));
  for (const a of actions) {
    const b = h('sav-button', { slot: 'footer', variant: a.danger ? 'danger' : a.primary ? 'primary' : 'neutral', appearance: a.primary || a.danger ? 'solid' : 'outline' }, a.label);
    b.addEventListener('click', async () => {
      if (b.loading) return;
      b.loading = true;
      try { if ((await a.run?.()) !== false) d.hide(); } catch (e) { const box = d.querySelector('.dlg-err'); if (box) { box.textContent = errText(e); box.hidden = false; } else fail(e); } finally { b.loading = false; }
    });
    if (a.primary) d.primary = b;
    d.append(b);
  }
  d.append(h('p.dlg-err', { hidden: true, role: 'alert' }));
  document.body.append(d);
  d.addEventListener('sav-after-hide', (e) => { if (e.target !== d) return; d.remove(); onclose?.(); });
  d.addEventListener('keydown', (e) => { if (e.key === 'Enter' && d.primary && /^(sav-input|sav-password|input)$/.test(e.target.localName)) { e.preventDefault(); d.primary.click(); } });
  customElements.whenDefined('sav-dialog').then(() => d.show());
  return d;
}
export const confirm = (title, text, label, danger = true) => new Promise((res) => {
  let yes = false;
  dialog({ title, body: h('p', text), actions: [{ label: t('cancel') }, { label, danger, primary: !danger, run: () => { yes = true; } }], onclose: () => res(yes) });
});
export const ask = (title, label, value = '', okLabel = t('save')) => new Promise((res) => {
  let out = null;
  const i = h('sav-input', { label, value, maxlength: 160, autofocus: true });
  dialog({ title, body: i, actions: [{ label: t('cancel') }, { label: okLabel, primary: true, run: () => { const v = i.value.trim(); if (!v) return false; out = v; } }], onclose: () => res(out) });
});
export const select = (label, options, value, onchange, o = {}) => {
  const s = h('sav-select', { label, value, ...o }, options.map(([v, l]) => h('option', { value: v }, l)));
  if (onchange) s.addEventListener('change', () => onchange(s.value));
  return s;
};
export const toggle = (label, checked, onchange) => { const s = h('sav-switch', { checked }, label); s.addEventListener('change', () => onchange(s.checked)); return s; };
export const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
export const face = (name, hue) => h('span.face', { style: `--h:${hue ?? [...(name || '')].reduce((a, c) => (a * 31 + c.codePointAt(0)) % 360, 7)}`, title: name }, initials(name));
export const copyText = async (s, msg) => { try { await navigator.clipboard.writeText(s); toast(msg || t('copied'), 'success'); } catch { prompt('', s); } };
