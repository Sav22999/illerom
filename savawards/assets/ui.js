/** Helpers of the interface: every control is a SavComponent (Glass style); what is composed here is made of them. */
import { has, t, getLang } from './i18n.js';

/** h('div.row', {onclick}, children…) */
export function h(sel, ...kids) {
  const [tag, ...cls] = sel.split('.');
  const n = document.createElement(tag || 'div');
  if (cls.length) n.className = cls.join(' ');
  if (kids[0] && typeof kids[0] === 'object' && !(kids[0] instanceof Node) && !Array.isArray(kids[0])) {
    for (const [k, v] of Object.entries(kids.shift())) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'class') n.className += ' ' + v;
      else n.setAttribute(k, v === true ? '' : v);
    }
  }
  n.append(...kids.flat(5).filter((x) => x !== null && x !== undefined && x !== false));
  return n;
}
export const put = (box, ...kids) => { box.replaceChildren(...kids.flat(5).filter((x) => x !== null && x !== undefined && x !== false)); return box; };
export const icon = (name, attrs = {}) => h('sav-icon', { name, 'aria-hidden': 'true', ...attrs });

export const errText = (e) => { const k = 'err_' + (e?.code || e?.message || ''); return has(k) ? t(k) : t('err_server'); };
export const toast = (msg, variant = 'primary', opt = {}) => window.Sav?.toast(msg, { variant, placement: 'bottom-start', duration: 4000, ...opt });
export const fail = (e) => { if (e?.silent) return; toast(errText(e), 'danger'); if (!has('err_' + (e?.code || e?.message))) console.error(e); };

/** btn('label', {icon, variant, onclick…}): while an async onclick runs the button is busy. */
export function btn(label, o = {}) {
  const { onclick, variant = 'neutral', appearance = 'outline', size = 'md', ...rest } = o;
  const b = h('sav-button', { variant, appearance, size, ...rest }, label);
  if (onclick) b.addEventListener('click', async (e) => { if (b.loading) return; const r = onclick(e, b); if (r?.then) { b.loading = true; try { await r; } catch (x) { fail(x); } finally { b.loading = false; } } });
  return b;
}
export const primary = (label, o = {}) => btn(label, { variant: 'primary', appearance: 'solid', ...o });
export const link = (label, href, o = {}) => btn(label, { appearance: 'ghost', href, ...o });

/** dialog({title, body, actions: [{label, primary, danger, run}], width}); run returning false keeps it open. */
export function dialog({ title, body, actions = [], width = '32rem', onclose }) {
  const d = h('sav-dialog', { label: title, style: `--width:min(${width}, calc(100vw - 2rem))`, 'sheet-on-mobile': true });
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
    d.append(b);
  }
  document.body.append(d);
  d.addEventListener('sav-after-hide', (e) => { if (e.target !== d) return; d.remove(); onclose?.(); });
  customElements.whenDefined('sav-dialog').then(() => d.show());
  return d;
}
export const confirm = (title, text, label, danger = true) => new Promise((res) => { let yes = false; dialog({ title, width: '27rem', body: h('p', text), actions: [{ label: t('cancel') }, { label, danger, primary: !danger, run: () => { yes = true; } }], onclose: () => res(yes) }); });
export const ask = (title, label, value = '', okLabel = t('save'), o = {}) => new Promise((res) => {
  let out = null;
  const i = h(o.multi ? 'sav-textarea' : 'sav-input', { label, value, maxlength: o.max || 300, autofocus: true, rows: o.multi ? 3 : null });
  dialog({ title, width: '28rem', body: [o.text ? h('p.muted', o.text) : null, i], actions: [{ label: t('cancel') }, { label: okLabel, primary: true, run: () => { const v = String(i.value || '').trim(); if (!v && !o.optional) return false; out = v; } }], onclose: () => res(out) });
});

export const empty = (ic, heading, text, ...kids) => h('sav-empty-state', { icon: ic, heading, text: text || '' }, ...kids);
export const hue = (n) => [...(n || '')].reduce((a, c) => (a * 31 + c.codePointAt(0)) % 360, 7);
/** An avatar with a colour of its own: given to the component (its neutral colour), so the shape, tint and ring follow the style
    of the page; a background on the element itself would draw a square behind the shape. */
export const face = (name, size = 32) => h('sav-avatar', { label: name, title: name, style: `--size:${size}px;--sav-color-neutral:hsl(${hue(name)} 62% 52%)` });
export const copyText = async (s, msg) => { try { await navigator.clipboard.writeText(s); toast(msg || t('copied'), 'success'); } catch { dialog({ title: t('copy'), body: h('sav-input', { value: s, readonly: true }) }); } };

// ------------------------------------------------------------------ numbers, dates, scores

const loc = () => 'en-GB';
export const num1 = (v) => (v === null || v === undefined ? '–' : new Intl.NumberFormat(loc(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v));
export const day = (iso) => (iso ? new Intl.DateTimeFormat(loc(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso)) : '');
export const ago = (iso) => (iso ? h('sav-relative-time', { date: iso, lang: loc() }, day(iso)) : null);
export const country = (code) => { if (!code) return ''; try { return new Intl.DisplayNames([loc()], { type: 'region' }).of(code) || code; } catch { return code; } };
export const countries = () => { const out = []; const dn = new Intl.DisplayNames([loc()], { type: 'region' }); for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) { const c = String.fromCharCode(a, b); try { const n = dn.of(c); if (n && n !== c && !/^[A-Z]{2}$/.test(n)) out.push([c, n]); } catch { /* not a region */ } } return out.sort((x, y) => x[1].localeCompare(y[1], loc())); };

/** The colour of a score: red, amber, blue, green. */
export const tone = (v) => (v === null || v === undefined ? 'neutral' : v >= 8.5 ? 'success' : v >= 7 ? 'primary' : v >= 5 ? 'warning' : 'danger');
/** The score as a ring with the number inside. */
export const ring = (v, size = 64, label) => h('sav-progress-ring', { value: v === null || v === undefined ? 0 : Math.round(v * 10), variant: tone(v), label: label || t('score'), style: `--size:${size}px;--track-width:${size > 56 ? 7 : 5}px`, class: 'ring' }, v === null || v === undefined ? '–' : num1(v));
/** A bar 0–10 for one criterion. */
export const bar = (v) => h('div.sbar', { role: 'img', 'aria-label': v === null ? t('na') : `${num1(v)} / 10` }, h('i', { style: `width:${v === null ? 0 : v * 10}%`, 'data-tone': tone(v) }));

/** The logo of a product, or its initials on a colour of its own. */
export const logo = (p, size = 48) => (p.logo
  ? h('img.logo', { src: p.logo, width: size, height: size, alt: '', loading: 'lazy', style: `--s:${size}px` })
  : h('span.logo.mono', { style: `--s:${size}px;--h:${hue(p.name)}`, 'aria-hidden': 'true' }, (p.name || '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2)));

export const go = (x) => { if (location.hash === x) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = x; };
export const field = (label, value, o = {}) => h('sav-input', { label, value: value ?? '', ...o });
export const area = (label, value, o = {}) => h('sav-textarea', { label, value: value ?? '', rows: 4, resize: 'auto', ...o });
/** sav-select shows nothing for an option whose value is empty: "" travels as "~" and comes back as "" (also through .value). */
const NONE = '~';
export const select = (label, options, value, o = {}) => {
  const s = h('sav-select', { label, value: (value ?? '') === '' ? NONE : value, ...o }, options.map(([v, l]) => h('option', { value: v === '' ? NONE : v }, l)));
  let d = null;
  for (let p = customElements.get('sav-select')?.prototype; p && !d; p = Object.getPrototypeOf(p)) d = Object.getOwnPropertyDescriptor(p, 'value');
  if (d?.get) Object.defineProperty(s, 'value', { configurable: true, get() { const v = d.get.call(this); return v === NONE ? '' : v; }, set(v) { d.set.call(this, (v === '' || v == null) && this.querySelector(`option[value="${NONE}"]`) ? NONE : v ?? ''); } });
  return s;
};
export const sw = (label, checked, o = {}) => h('sav-switch', { checked: !!checked, ...o }, label);
export const val = (el) => (el.localName === 'sav-switch' || el.localName === 'sav-checkbox' ? !!el.checked : String(el.value ?? ''));
