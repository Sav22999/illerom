/**
 * SavDiagrams inside the other apps of SavOffice: "Insert a diagram" of SavDocuments and SavPresentations import this file
 * (../../savdiagrams/assets/embed.js). It lists the diagrams of the person (dg.init: same site, the cookie of the session
 * goes with every request to /savdiagrams/) and turns the one picked into a PNG drawn by the same renderer as the app
 * (shapes.js, with its fonts). Nothing of the app that imports it is used: plain DOM and SavComponents.
 *
 *   diagramsPanel(onpick, lang)  a grid of the diagrams; onpick({title, blob, width, height}) with the PNG
 *   pickDiagram(lang)            the same grid in a dialog; resolves {title, blob, width, height} or null
 */
import { pngOf } from './files.js';

const BASE = new URL('../', import.meta.url).href; // the folder of SavDiagrams, wherever the page is
const T = {
  title: ['Insert a diagram', 'Inserisci un diagramma'], none: ['No diagrams yet', 'Ancora nessun diagramma'], none_t: ['Draw one in SavDiagrams, then come back here.', 'Disegnane uno in SavDiagrams, poi torna qui.'],
  off: ['SavDiagrams does not answer: sign in there and try again.', 'SavDiagrams non risponde: accedi lì e riprova.'], open: ['Open SavDiagrams', 'Apri SavDiagrams'], cancel: ['Cancel', 'Annulla'],
  hint: ['The diagram goes in as a picture; to change it, change it in SavDiagrams and insert it again.', 'Il diagramma entra come immagine; per cambiarlo, modificalo in SavDiagrams e inseriscilo di nuovo.'],
};
const tx = (k, lang) => T[k][lang === 'it' ? 1 : 0];
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v); } n.append(...kids.filter(Boolean)); return n; };
const get = (r, q = '') => fetch(BASE + 'api/?r=' + r + q, { credentials: 'same-origin', cache: 'no-store' }).then((x) => x.json());

/** The PNG of one diagram of the account (twice its size, at most 3000 pixels on its longest side). */
export async function diagramPng(id) {
  const r = await get('dg.get', '&quiet=1&id=' + encodeURIComponent(id));
  if (!r.ok) throw Object.assign(new Error(r.error || 'server'), { code: r.error || 'server' });
  const d = { title: r.diagram.title, settings: r.diagram.settings, items: r.diagram.list };
  return { title: d.title, ...(await pngOf(d, { base: BASE, max: 3000, scale: 2 })) };
}

export function diagramsPanel(onpick, lang = document.documentElement.lang) {
  const grid = el('div', { class: 'dg-embed', style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(9rem,1fr));gap:.7rem;max-height:52vh;overflow:auto;padding:4px;min-height:6rem' }, el('sav-spinner'));
  const empty = (k, t2) => grid.replaceChildren(el('sav-empty-state', { icon: 'workflow', heading: tx(k, lang), text: t2 ? tx(t2, lang) : '', style: 'grid-column:1/-1' }, el('sav-button', { href: BASE, target: '_blank', appearance: 'outline', size: 'sm' }, tx('open', lang))));
  get('dg.init').then((r) => {
    const list = (r.diagrams || []).filter((d) => !d.trashed && d.items > 0);
    if (!r.ok) return empty('off');
    if (!list.length) return empty('none', 'none_t');
    grid.replaceChildren(...list.map((d) => {
      const card = el('sav-card', { interactive: true, role: 'button', tabindex: 0, title: d.title, style: '--sav-radius-lg:12px;cursor:pointer' },
        el('div', { style: `aspect-ratio:16/10;display:grid;place-items:center;background:${/^#[0-9a-f]{6}$/i.test(d.bg) ? d.bg : '#fff'};border-radius:8px;overflow:hidden` }, d.thumb && /^data:image\//.test(d.thumb) ? el('img', { src: d.thumb, alt: '', style: 'width:100%;height:100%;object-fit:contain' }) : null),
        el('div', { style: 'padding:.4rem .2rem 0;font-size:.85rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, d.title));
      const go = async () => {
        if (card.dataset.busy) return;
        card.dataset.busy = 1; card.style.opacity = '.55';
        try { onpick(await diagramPng(d.id)); } catch (e) { window.Sav?.toast?.(tx('off', lang), { variant: 'danger' }); console.warn(e); } finally { delete card.dataset.busy; card.style.opacity = ''; }
      };
      card.addEventListener('click', go);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      return card;
    }));
  }).catch(() => empty('off'));
  return grid;
}

export function pickDiagram(lang = document.documentElement.lang) {
  return new Promise((resolve) => {
    let out = null;
    const d = el('sav-dialog', { label: tx('title', lang), style: '--width:min(46rem, calc(100vw - 2rem))', 'sheet-on-mobile': true });
    d.append(diagramsPanel((x) => { out = x; d.hide(); }, lang), el('p', { style: 'color:var(--sav-color-text-muted);font-size:.85rem;margin:.6rem 0 0' }, tx('hint', lang)),
      el('sav-button', { slot: 'footer', appearance: 'outline', onclick: () => d.hide() }, tx('cancel', lang)));
    d.addEventListener('sav-after-hide', (e) => { if (e.target !== d) return; d.remove(); resolve(out); });
    document.body.append(d);
    customElements.whenDefined('sav-dialog').then(() => d.show());
  });
}
