/** Helpers of the interface. Every control is a SavComponent (Soft style); what is composed here is made of them. */
import { getLang, has, t } from './i18n.js';
import { svg } from './icons.js';

export const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
export const mobile = () => matchMedia('(max-width: 900px)').matches;
/** Ctrl or Cmd, as people read it. */
export const K = (s) => s.replace('Mod', MAC ? '⌘' : 'Ctrl').replace('Alt', MAC ? '⌥' : 'Alt').replace('Shift', MAC ? '⇧' : 'Shift').replace(/\+/g, MAC ? '' : '+');

/** A size as people read it: 1.5 MB. */
export function bytes(n) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = +n || 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toLocaleString(getLang(), { maximumFractionDigits: v < 10 && i ? 1 : 0 })} ${u[i]}`;
}

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
export const draw = (name, size = 18) => h('span.i', { html: svg(name, size), 'aria-hidden': 'true' });

export const errText = (e) => { const k = 'err_' + (e?.code || e?.message || ''); return has(k) ? t(k) : t('err_server'); };
export const toast = (msg, variant = 'primary', opt = {}) => window.Sav.toast(msg, { variant, placement: 'bottom-start', duration: 4000, ...opt });
export const fail = (e) => { if (e?.silent) return; toast(errText(e), 'danger'); if (!has('err_' + (e?.code || e?.message))) console.error(e); };

/** A press on the controls around the text never takes the caret away from it. */
export const keepCaret = (n) => { n.addEventListener('mousedown', (e) => { if (!e.composedPath().some((x) => /^(input|textarea|sav-input|sav-number-input|sav-select|sav-textarea)$/.test(x.localName || ''))) e.preventDefault(); }); return n; };

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
  if (onclick) b.addEventListener('click', (e) => { const r = onclick(b, e); if (r?.catch) r.catch(fail); });
  const tip = h('sav-tooltip', { content: kbd ? `${label} (${K(kbd)})` : label, placement: place, delay: 350 }, b);
  tip.button = b;
  tip.on = (v) => { b.variant = v ? 'primary' : 'neutral'; b.appearance = v ? 'soft' : 'ghost'; b.setAttribute('aria-pressed', String(!!v)); };
  return tip;
}
export const item = (value, ic, label, o = {}) => h('sav-menu-item', { value, variant: o.danger ? 'danger' : null, disabled: o.disabled, type: o.check !== undefined ? 'checkbox' : null, checked: !!o.check, style: o.style }, ic ? icon(ic, { slot: 'prefix' }) : null, label, o.kbd ? h('kbd', { slot: 'suffix' }, K(o.kbd)) : null);

/** items: [icon, label, run, {kbd, danger, check, disabled, style}] | '-' | {head} | Node | falsy */
function fillMenu(d, items) {
  const list = items.filter(Boolean);
  list.forEach((i, n) => d.append(i === '-' ? h('sav-divider') : i instanceof Node ? i : i.head ? h('sav-menu-label', i.head) : item(String(n), i[0], i[1], i[3])));
  d.addEventListener('sav-select', (e) => { const i = list[+e.detail.value]; if (i?.[2]) setTimeout(() => { const r = i[2](); if (r?.catch) r.catch(fail); }, 20); });
  return d;
}
/** A menu of a button. items may be a function, asked again every time it opens. */
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
/** A menu at a point (right click). */
export function menuAt(x, y, items, o = {}) {
  document.querySelector('.ctxm')?.remove();
  const d = fillMenu(h('sav-dropdown.ctxm', { placement: 'bottom-start', style: `left:${x}px;top:${y}px`, label: o.label }, h('span', { slot: 'trigger' })), items);
  d.addEventListener('sav-hide', () => setTimeout(() => d.remove(), 250));
  document.body.append(d);
  requestAnimationFrame(() => d.show());
  return d;
}
/** Something to press that shows a picture or a sample: a card. */
export function tile(label, onclick, o = {}, ...kids) {
  return h('sav-card', { interactive: true, role: 'button', tabindex: 0, 'aria-label': label, title: label, onclick: (e) => onclick(e), onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onclick(e); } }, ...o, class: 'tile ' + (o.class || '') }, ...kids);
}
/** A choice among a few. options: [[value, icon or '=text', label]] */
export const segmented = (label, value, options, onpick, o = {}) => h('sav-radio-group', { appearance: 'buttons', size: 'sm', value: String(value), 'aria-label': label, label: o.show ? label : null, class: 'segm ' + (o.class || ''), onchange: (e) => onpick(e.currentTarget.value) }, options.map(([v, ic, l]) => h('sav-radio', { value: String(v), title: l, 'aria-label': l }, ic[0] === '=' ? ic.slice(1) : icon(ic))));

// ------------------------------------------------------------------ fields of the panels

/** sav-select shows nothing for an option whose value is empty: "" travels as "~" and comes back as "" (also through .value). */
const NONE = '~';
export const select = (label, options, value, onchange, o = {}) => {
  const s = h('sav-select', { label: label || null, value: (value ?? '') === '' ? NONE : value, size: 'sm', ...o }, options.map(([v, l, st]) => h('option', { value: v === '' ? NONE : v, style: st }, l)));
  let d = null;
  for (let p = customElements.get('sav-select')?.prototype; p && !d; p = Object.getPrototypeOf(p)) d = Object.getOwnPropertyDescriptor(p, 'value');
  if (d?.get) Object.defineProperty(s, 'value', { configurable: true, get() { const v = d.get.call(this); return v === NONE ? '' : v; }, set(v) { d.set.call(this, (v === '' || v == null) && this.querySelector(`option[value="${NONE}"]`) ? NONE : v ?? ''); } });
  if (onchange) s.addEventListener('change', () => onchange(s.value));
  return s;
};
export const toggle = (label, checked, onchange) => { const s = h('sav-switch', { checked: !!checked, size: 'sm' }, label); s.addEventListener('change', () => onchange(s.checked)); return s; };
export function num(label, value, onchange, o = {}) {
  const n = h('sav-number-input', { label, size: 'sm', limits: 'never', step: 1, ...o, value: value === '' || value === null || value === undefined ? '' : Math.round(value * 100) / 100 });
  n.addEventListener('change', () => { const v = parseFloat(String(n.value).replace(',', '.')); if (Number.isFinite(v)) onchange(Math.max(+(o.min ?? -1e9), Math.min(+(o.max ?? 1e9), v))); else if (o.empty) onchange(''); });
  n.addEventListener('keydown', (e) => e.stopPropagation());
  return n;
}
export const range = (label, value, min, max, step, oninput, unit = '') => h('sav-range', { label, value, min, max, step, unit, 'show-value': true, oninput: (e) => oninput(+e.currentTarget.value) });
export const field = (label, value, onchange, o = {}) => { const i = h('sav-input', { label, value: value ?? '', size: 'sm', ...o }); i.addEventListener('keydown', (e) => e.stopPropagation()); i.addEventListener(o.live ? 'input' : 'change', () => onchange(i.value)); return i; };
export const sec = (title, ...kids) => h('section.psec', title ? h('sav-label', { appearance: 'plain', case: 'normal', variant: 'neutral' }, title) : null, kids);
export const fold = (title, open, ...kids) => h('sav-details.pfold', { summary: title, open, appearance: 'plain' }, h('div.stack', kids));
export const row = (...kids) => h('div.prow', kids);

export const INKS = ['#1c1c1c', '#5f6660', '#9aa29d', '#ffffff', '#b3261e', '#d85a30', '#b7791f', '#0f6e56', '#0f5f8f', '#1d4e89', '#5b4cf0', '#a1328c'];
export const PASTEL = ['#fff3a3', '#ffd9b8', '#ffc9c9', '#d3f3d8', '#cdeaf7', '#e3dcfb', '#f9d5ec', '#eef1ee', '#e4e7e5', '#fdf8ef'];
/** A colour: a palette and any other one. opt: {none: label, list, icon, trigger} */
export function colorPop(label, value, onpick, opt = {}) {
  const sw = opt.trigger || h('sav-button.cbtn', { size: 'sm', appearance: 'outline', variant: 'neutral', label });
  sw.slot = 'trigger';
  const show = (v) => { sw.style.setProperty('--c', v || 'transparent'); sw.classList.toggle('none', !v); };
  show(value);
  const pop = h('sav-popover', { placement: opt.placement || 'bottom-start', 'sheet-on-mobile': true, heading: label, style: '--width:16rem' }, sw);
  const set = (v) => { show(v); onpick(v); pop.hide(); };
  // the suggested colours are the picker's own swatches (SavComponents): a click on one picks it and closes
  pop.addEventListener('sav-show', () => {
    if (pop.dataset.built) return;
    pop.dataset.built = 1;
    const list = (opt.list || INKS).map((c) => c.toLowerCase());
    const cp = h('sav-color-picker', { value: value || list[0], swatches: list.join(' '), picker: 'custom', size: 'sm', 'aria-label': label });
    cp.addEventListener('change', (e) => { const v = String(e.detail?.value ?? cp.value).toLowerCase(); if (!/^#[0-9a-f]{6}$/.test(v)) return; if (list.includes(v)) set(v); else { show(v); onpick(v); } });
    pop.append(h('div.cpop', cp, opt.none ? btn(opt.none, { size: 'sm', block: true, appearance: 'outline', onclick: () => set('') }) : null));
  });
  pop.show_ = show;
  return pop;
}
export const colorField = (label, value, onpick, opt = {}) => h('div.cf', h('span.flabel', label), colorPop(label, value, onpick, opt));

// ------------------------------------------------------------------ dialogs

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
export const ask = (title, label, value = '', okLabel = t('save')) => new Promise((res) => { let out = null; const i = h('sav-input', { label, value, maxlength: 160, autofocus: true }); dialog({ title, width: '26rem', body: i, actions: [{ label: t('cancel') }, { label: okLabel, primary: true, run: () => { const v = i.value.trim(); if (!v) return false; out = v; } }], onclose: () => res(out) }); });

export const hue = (n) => [...(n || '')].reduce((a, c) => (a * 31 + c.codePointAt(0)) % 360, 7);
export const face = (name, hh, size = 32) => h('sav-avatar', { label: name, title: name, style: `--size:${size}px;--sav-avatar-size:${size}px;background:hsl(${hh ?? hue(name)} 48% 38%);color:#fff;border-radius:50%` });
export const copyText = async (s, msg) => { try { await navigator.clipboard.writeText(s); toast(msg || t('copied'), 'success'); } catch { dialog({ title: t('copy'), body: h('sav-input', { value: s, readonly: true }) }); } };
export const empty = (ic, heading, text, ...kids) => h('sav-empty-state', { icon: ic, heading, text: text || '' }, ...kids);
