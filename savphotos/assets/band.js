/**
 * The rectangle of SavDrive, for the photos and for the albums: in an area of the page, a press of the mouse and a drag
 * (also starting on an item) chooses every item it touches; with Ctrl/⌘ or Shift it adds to what is already chosen; near
 * the top or the bottom of the window the page scrolls by itself. A press on the empty space without moving lets the
 * choice go (onEmpty). The items are [id, element] pairs: the element gets the class "on" (and its sav-checkbox.pick is
 * ticked) while it is chosen.
 *
 * bandSelect(area, {items, sel, onChange, onEmpty, skip, item}) -> {swallow}: swallow is true for a moment after a
 * rectangle, so the click that ends it on an item does not open it.
 */
import { h } from './ui.js';

const SKIP = 'sav-button, sav-checkbox, sav-dropdown, sav-breadcrumb, sav-tooltip, a, sav-input, sav-radio-group, sav-alert, .chk, .selbar, .dhead';

export function bandSelect(area, { items, sel, onChange, onEmpty, skip = SKIP, item = '[data-id]' }) {
  const st = { swallow: false };
  area.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.pointerType !== 'mouse' || e.target.closest(skip)) return;
    const onItem = e.target.closest(item);
    e.preventDefault();
    getSelection()?.removeAllRanges();
    const keep = e.ctrlKey || e.metaKey || e.shiftKey, base = new Set(keep ? sel : []);
    const x0 = e.clientX + scrollX, y0 = e.clientY + scrollY;
    // where every item is in the page (not in the window: the page may scroll while drawing)
    const boxes = items().map(([id, n]) => { const r = n.getBoundingClientRect(); return [id, n, r.left + scrollX, r.top + scrollY, r.right + scrollX, r.bottom + scrollY]; });
    const box = h('div.band');
    let moved = false, last = e, raf = 0;
    const paint = () => {
      const cx = last.clientX + scrollX, cy = last.clientY + scrollY;
      const l = Math.min(x0, cx), r = Math.max(x0, cx), tp = Math.min(y0, cy), bt = Math.max(y0, cy);
      if (!moved && r - l < 6 && bt - tp < 6) return;
      if (!moved) { moved = true; document.body.append(box); document.body.classList.add('banding'); }
      Object.assign(box.style, { left: l + 'px', top: tp + 'px', width: r - l + 'px', height: bt - tp + 'px' });
      sel.clear();
      base.forEach((id) => sel.add(id));
      for (const [id, n, a, b, c, d] of boxes) {
        if (a < r && c > l && b < bt && d > tp) sel.add(id);
        const on = sel.has(id);
        n.classList.toggle('on', on);
        const pick = n.querySelector('sav-checkbox.pick');
        if (pick) pick.checked = on;
      }
      onChange();
    };
    const roll = () => {
      raf = 0;
      if (!moved) return;
      const edge = 70, y = last.clientY;
      const speed = y < edge ? -Math.ceil((edge - y) / 4) : y > innerHeight - edge ? Math.ceil((y - innerHeight + edge) / 4) : 0;
      if (speed) { scrollBy(0, speed); paint(); }
      raf = requestAnimationFrame(roll);
    };
    const move = (ev) => { last = ev; paint(); if (moved && !raf) raf = requestAnimationFrame(roll); };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      cancelAnimationFrame(raf);
      box.remove();
      document.body.classList.remove('banding');
      if (moved) { st.swallow = true; setTimeout(() => { st.swallow = false; }, 80); return; }
      if (!onItem && !keep && sel.size) onEmpty?.();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });
  return st;
}
