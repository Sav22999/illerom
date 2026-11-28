/** Helpers of the interface (the same of SavDrive). Every control is a SavComponent; what is composed here is made of them. */
import { has, t } from './i18n.js';

export const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
export const mobile = () => matchMedia('(max-width: 900px)').matches;
export const K = (s) => s.replace('Mod', MAC ? '⌘' : 'Ctrl').replace('Alt', MAC ? '⌥' : 'Alt').replace('Shift', MAC ? '⇧' : 'Shift').replace(/\+/g, MAC ? '' : '+');

/** h('div.row', {onclick}, children…) */
export function h(sel, ...kids) {
  const [tag, ...cls] = sel.split('.');
  const n = document.createElement(tag || 'div');
  if (cls.length) n.className = cls.join(' ');
  if (kids[0] && typeof kids[0] === 'object' && !(kids[0] instanceof Node) && !Array.isArray(kids[0])) {
    for (const [k, v] of Object.entries(kids.shift())) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'class') n.className += ' ' + v;
      else n.setAttribute(k, v === true ? '' : v);
    }
  }
  n.append(...kids.flat(5).filter((x) => x !== null && x !== undefined && x !== false));
  return n;
}
export const put = (box, ...kids) => { box.replaceChildren(...kids.flat(5).filter((x) => x !== null && x !== undefined && x !== false)); return box; };
export const icon = (name, attrs = {}) => h('sav-icon', { name, ...attrs });

export const errText = (e) => { const k = 'err_' + (e?.code || e?.message || ''); return has(k) ? t(k) : t('err_server'); };
export const toast = (msg, variant = 'primary', opt = {}) => window.Sav?.toast(msg, { variant, placement: mobile() ? 'top-center' : 'bottom-start', duration: 4000, ...opt });
export const fail = (e) => { if (e?.silent) return; toast(errText(e), 'danger'); if (!has('err_' + (e?.code || e?.message))) console.error(e); };

/** btn('label', {icon, variant, onclick…}): while an async onclick runs the button is busy. */
export function btn(label, o = {}) {
  const { onclick, variant = 'neutral', appearance = 'outline', size = 'md', ...rest } = o;
  const b = h('sav-button', { variant, appearance, size, ...rest }, label);
  if (onclick) b.addEventListener('click', async (e) => { if (b.loading) return; const r = onclick(e, b); if (r?.then) { b.loading = true; try { await r; } catch (x) { fail(x); } finally { b.loading = false; } } });
  return b;
}
export const primary = (label, o = {}) => btn(label, { variant: 'primary', appearance: 'solid', ...o });
/** Only an icon: its name is the label for screen readers and the tooltip. */
export function iconBtn(name, label, onclick, o = {}) {
  const { place = 'bottom', kbd, ...rest } = o;
  const b = h('sav-button', { icon: name, label, appearance: 'ghost', variant: 'neutral', square: true, size: 'sm', ...rest });
  if (onclick) b.addEventListener('click', (e) => { e.stopPropagation(); const r = onclick(b, e); if (r?.catch) r.catch(fail); });
  const tip = h('sav-tooltip', { content: kbd ? `${label} (${K(kbd)})` : label, placement: place, delay: 350 }, b);
  tip.button = b;
  return tip;
}
export const item = (value, ic, label, o = {}) => h('sav-menu-item', { value, variant: o.danger ? 'danger' : null, disabled: o.disabled, type: o.check !== undefined ? 'checkbox' : null, checked: !!o.check }, ic ? icon(ic, { slot: 'prefix' }) : null, label, o.kbd ? h('kbd', { slot: 'suffix' }, K(o.kbd)) : null);

/** A menu of a button. items: [icon, label, run, {danger, check, disabled}] | '-' | {head} | falsy; or a function asked every time it opens. */
export function drop(trigger, items, o = {}) {
  trigger.slot = 'trigger';
  const d = h('sav-dropdown', { placement: o.placement || 'bottom-start', label: o.label || trigger.getAttribute('label') || trigger.textContent, 'sheet-on-mobile': o.sheet !== false }, trigger);
  let list = [];
  const build = () => { for (const x of [...d.children]) if (x !== trigger) x.remove(); list = (typeof items === 'function' ? items() : items).filter(Boolean); list.forEach((i, n) => d.append(i === '-' ? h('sav-divider') : i instanceof Node ? i : i.head ? h('sav-menu-label', i.head) : item(String(n), i[0], i[1], i[3]))); };
  if (typeof items === 'function') { for (const ev of ['pointerdown', 'keydown']) trigger.addEventListener(ev, () => { if (!d.open) build(); }, true); } else build();
  d.addEventListener('sav-select', (e) => { e.stopPropagation(); const i = list[+e.detail.value]; if (i?.[2]) setTimeout(() => { const r = i[2](); if (r?.catch) r.catch(fail); }, 20); });
  return d;
}
export const dropBtn = (ic, label, items, o = {}) => drop(h('sav-button', { icon: ic, label: o.text ? null : label, title: label, caret: o.caret !== false, appearance: o.appearance || 'ghost', variant: o.variant || 'neutral', size: o.size || 'sm' }, o.text ? h('span.lbl', label) : null), items, { label, ...o });
/** A menu at a point (right click, long press). */
export function menuAt(x, y, items, o = {}) {
  document.querySelector('.ctxm')?.remove();
  const list = items.filter(Boolean);
  const d = h('sav-dropdown.ctxm', { placement: 'bottom-start', style: `left:${x}px;top:${y}px`, label: o.label, 'sheet-on-mobile': true }, h('span', { slot: 'trigger' }));
  list.forEach((i, n) => d.append(i === '-' ? h('sav-divider') : i.head ? h('sav-menu-label', i.head) : item(String(n), i[0], i[1], i[3])));
  d.addEventListener('sav-select', (e) => { const i = list[+e.detail.value]; if (i?.[2]) setTimeout(() => { const r = i[2](); if (r?.catch) r.catch(fail); }, 20); });
  d.addEventListener('sav-hide', () => setTimeout(() => d.remove(), 250));
  document.body.append(d);
  requestAnimationFrame(() => d.show());
  return d;
}

/** The menu of a right click (or a long press): the one of SavOffice (sav-context-menu of SavComponents), the same in every
 *  app; a menu at the point when it is not there. items as for menuAt. */
export function ctxAt(x, y, items, o = {}) { if (window.SavOffice?.context?.show?.(x, y, items, o)) return null; return menuAt(x, y, items, o); }
/** A choice among a few. options: [[value, icon or '=text', label]] */
export const segmented = (label, value, options, onpick, o = {}) => h('sav-radio-group', { appearance: 'buttons', size: o.size || 'sm', value: String(value), 'aria-label': label, label: o.show ? label : null, class: 'segm ' + (o.class || ''), onchange: (e) => onpick(e.currentTarget.value) }, options.map(([v, ic, l]) => h('sav-radio', { value: String(v), title: l, 'aria-label': l }, ic[0] === '=' ? ic.slice(1) : icon(ic))));
export const select = (label, options, value, onchange, o = {}) => {
  const s = h('sav-select', { label: label || null, value, size: 'sm', ...o }, options.map(([v, l]) => h('option', { value: v }, l)));
  if (onchange) s.addEventListener('change', () => onchange(s.value));
  return s;
};
export const toggle = (label, checked, onchange) => { const s = h('sav-switch', { checked: !!checked }, label); s.addEventListener('change', () => onchange(s.checked)); return s; };

/** dialog({title, body, actions: [{label, primary, danger, run}], width}); run returning false keeps it open. */
export function dialog({ title, body, actions = [], width = '30rem', onclose, cls }) {
  const d = h('sav-dialog' + (cls ? '.' + cls : ''), { label: title, style: `--width:min(${width}, calc(100vw - 2rem))`, 'sheet-on-mobile': true });
  d.append(...[body].flat().filter(Boolean));
  const err = h('sav-alert', { variant: 'danger', hidden: true, class: 'dlg-err' });
  d.append(err);
  for (const a of actions) {
    const b = h('sav-button', { slot: 'footer', icon: a.icon, variant: a.danger ? 'danger' : a.primary ? 'primary' : 'neutral', appearance: a.primary || a.danger ? 'solid' : 'outline' }, a.label);
    b.addEventListener('click', async () => {
      if (b.loading) return;
      b.loading = true;
      try { if ((await a.run?.()) !== false) d.hide(); } catch (e) { err.textContent = errText(e); err.hidden = false; } finally { b.loading = false; }
    });
    if (a.primary) d.primary = b;
    d.append(b);
  }
  document.body.append(d);
  d.addEventListener('sav-after-hide', (e) => { if (e.target !== d) return; d.remove(); onclose?.(); });
  d.addEventListener('keydown', (e) => { if (e.key === 'Enter' && d.primary && /^(sav-input|sav-password)$/.test(e.target.localName) && !e.defaultPrevented) { e.preventDefault(); d.primary.click(); } });
  customElements.whenDefined('sav-dialog').then(() => d.show());
  return d;
}
export const confirm = (title, text, label, danger = true) => new Promise((res) => { let yes = false; dialog({ title, width: '27rem', body: h('p', text), actions: [{ label: t('cancel') }, { label, danger, primary: !danger, run: () => { yes = true; } }], onclose: () => res(yes) }); });
export const ask = (title, label, value = '', okLabel = t('save')) => new Promise((res) => { let out = null; const i = h('sav-input', { label, value, maxlength: 120, autofocus: true }); dialog({ title, width: '26rem', body: i, actions: [{ label: t('cancel') }, { label: okLabel, primary: true, run: () => { const v = i.value.trim(); if (!v) return false; out = v; } }], onclose: () => res(out) }); });

export const hue = (n) => [...(n || '')].reduce((a, c) => (a * 31 + c.codePointAt(0)) % 360, 7);
export const face = (name, hh, size = 32) => h('sav-avatar', { label: name, title: name, style: `--size:${size}px;--sav-avatar-size:${size}px;background:hsl(${hh ?? hue(name)} 48% 38%);color:#fff;border-radius:50%` });
export const copyText = async (s, msg) => { try { await navigator.clipboard.writeText(s); toast(msg || t('copied'), 'success'); } catch { dialog({ title: t('copy'), body: h('sav-input', { value: s, readonly: true }) }); } };
export const empty = (ic, heading, text, ...kids) => h('sav-empty-state', { icon: ic, heading, text: text || '' }, ...kids);

/** 1.2 MB */
export function bytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + ' ' + u[i];
}
/** 1:05, 12:00, 1:02:03 */
export function clock(s) {
  s = Math.max(0, Math.round(s || 0));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}
