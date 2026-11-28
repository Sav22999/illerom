/**
 * The grid of photos, by day (newest first): small square pictures, the length of videos, the star of favourites, and
 * choosing many (a click on the circle, Ctrl/⌘ and Shift, a long press on phones, all the photos of a day at once).
 */
import { clock, h, icon } from './ui.js';
import { bandSelect } from './band.js';
import { getLang, t } from './i18n.js';

/** "2026-11-24 18:03:00" -> "2026-11-24" */
export const dayKey = (taken) => String(taken || '').slice(0, 10);
const asDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1, 12); };
const todayKey = (off = 0) => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Today, Yesterday, "Monday 24 November", "Monday 24 November 2025". */
export function dayLabel(key) {
  if (key === todayKey()) return t('today');
  if (key === todayKey(-1)) return t('yesterday');
  const d = asDate(key);
  const s = d.toLocaleDateString(getLang(), { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/** "24 November 2026, 18:03" */
export function takenLabel(taken) {
  if (!taken) return '';
  const [d, tm = ''] = String(taken).split(' ');
  const s = asDate(d).toLocaleDateString(getLang(), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  return tm ? `${s}, ${tm.slice(0, 5)}` : s;
}
/** "November 2026" */
export const monthLabel = (ym) => { const s = asDate(ym + '-01').toLocaleDateString(getLang(), { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); };

/**
 * makeGrid({thumb, onOpen, sel, onSelect, pick}): thumb(x) is a promise of the address of the small picture; onOpen(i) opens the
 * viewer at item i; sel is a Set of ids, onSelect() is called when it changes; pick: choosing is the only thing a click does.
 * Returns {el, items, append(list), reset(), update(x), remove(ids), redraw()}.
 */
export function makeGrid({ thumb, onOpen, sel = null, onSelect = () => {}, pick = false, size = 'm' }) {
  const el = h('div.grid', { 'data-size': size });
  const items = [];
  let lastDay = null, lastBox = null, anchor = -1, choosing = false, bandState = null, byDay = true; // byDay: grouped under their days (sorted by date), or one block
  const tiles = new Map(); // id -> tile
  // the small pictures are asked when they come near the screen, 40 in a request and kept in the browser (thumb(x) gives
  // a promise of its address, store.js thumbFor): a page of hundreds of photos asks the hosting very little
  const fill = async (img) => {
    if (img.dataset.loading) return;
    img.dataset.loading = '1';
    seen?.unobserve(img);
    const x = img._x;
    // the shape of the photo (sav-skeleton) until its small picture is there
    const spin = h('sav-skeleton.tload', { shape: 'rect', 'aria-hidden': 'true' });
    img.after(spin);
    const done = () => spin.remove();
    try {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      img.src = await thumb(x);
    } catch { done(); x.noThumb = true; img.replaceWith(h('span.noimg', icon(x.video ? 'film' : 'image'))); }
  };
  const seen = typeof IntersectionObserver === 'function' ? new IntersectionObserver((list) => { for (const e of list) if (e.isIntersecting) fill(e.target); }, { rootMargin: '600px 0px' }) : null;
  const watch = (img) => { if (seen) seen.observe(img); else fill(img); };

  const toggle = (i, on) => {
    const x = items[i];
    if (!x || !sel) return;
    const want = on ?? !sel.has(x.id);
    if (want) sel.add(x.id); else sel.delete(x.id);
    tiles.get(x.id)?.classList.toggle('on', want);
  };
  const selecting = () => pick || choosing || (sel && sel.size > 0);
  const daySync = () => {
    for (const sec of el.querySelectorAll('.day')) {
      const ids = [...sec.querySelectorAll('.tile')].map((n) => n.dataset.id);
      const c = sec.querySelector('.dchk');
      if (c) c.checked = ids.length > 0 && ids.every((id) => sel?.has(id));
    }
    el.classList.toggle('selecting', !!selecting());
  };

  function tile(x, i) {
    const b = h('button.tile', { type: 'button', 'data-id': x.id, 'data-i': i, 'aria-label': (x.video ? t('video') : t('photo')) + ', ' + x.name },
      (() => { const im = h('img', { alt: '', decoding: 'async', draggable: 'false' }); im._x = x; watch(im); return im; })(),
      x.video ? h('span.vbadge', icon('play'), x.d ? clock(x.d) : null) : null,
      x.star ? h('span.fav', icon('star')) : null,
      sel ? h('span.chk', { role: 'checkbox', 'aria-label': t('select'), 'aria-checked': 'false' }, icon('check')) : null);
    if (sel?.has(x.id)) b.classList.add('on');
    let pressed = null, long = false;
    b.addEventListener('pointerdown', (e) => {
      long = false;
      if (e.pointerType !== 'touch' || !sel) return;
      pressed = setTimeout(() => { long = true; navigator.vibrate?.(15); toggle(+b.dataset.i); anchor = +b.dataset.i; daySync(); onSelect(); }, 450);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => clearTimeout(pressed));
    b.addEventListener('contextmenu', (e) => { if (long) e.preventDefault(); });
    b.addEventListener('click', (e) => {
      if (long) { long = false; e.preventDefault(); return; }
      if (bandState?.swallow) { bandState.swallow = false; e.preventDefault(); return; } // the end of a rectangle drawn from here, not a click
      const i = +b.dataset.i;
      const onCheck = e.target.closest?.('.chk');
      if (sel && (onCheck || e.metaKey || e.ctrlKey || e.shiftKey || selecting())) {
        if (e.shiftKey && anchor >= 0) { const [a, z] = anchor < i ? [anchor, i] : [i, anchor]; for (let k = a; k <= z; k++) toggle(k, true); } else toggle(i);
        anchor = i;
        daySync();
        onSelect();
        return;
      }
      onOpen(i);
    });
    tiles.set(x.id, b);
    return b;
  }

  function daySection(key) {
    const box = h('div.tiles');
    const c = sel ? h('sav-checkbox.dchk', { 'aria-label': t('select_day', { day: dayLabel(key) }) }) : null;
    c?.addEventListener('change', () => {
      for (const n of box.querySelectorAll('.tile')) toggle(+n.dataset.i, c.checked);
      daySync();
      onSelect();
    });
    const sec = h('section.day', { 'data-day': key }, key === '*' ? null : h('h3.dayh', h('span', dayLabel(key)), c), box);
    return [sec, box];
  }

  return {
    el, items,
    append(list) {
      for (const x of list) {
        const i = items.length;
        items.push(x);
        const key = byDay ? dayKey(x.t) : '*';
        if (key !== lastDay) { const [sec, box] = daySection(key); el.append(sec); lastDay = key; lastBox = box; }
        lastBox.append(tile(x, i));
      }
      daySync();
    },
    setByDay(v) { byDay = !!v; },
    reset() { items.length = 0; tiles.clear(); lastDay = null; lastBox = null; anchor = -1; seen?.disconnect(); el.replaceChildren(); },
    /** draws one photo again (its star changed) */
    update(x) { const old = tiles.get(x.id); if (old) old.replaceWith(tile(x, +old.dataset.i)); },
    /** takes photos out (trash, out of an album): the others keep their places */
    remove(ids) {
      const gone = new Set(ids);
      const keep = items.filter((x) => !gone.has(x.id));
      for (const id of ids) sel?.delete(id);
      this.reset();
      this.append(keep);
    },
    redraw() { if (!sel?.size) choosing = false; daySync(); for (const [id, b] of tiles) b.classList.toggle('on', !!sel?.has(id)); },
    setSize(s) { el.dataset.size = s; },
    /** while the first page is on its way: the shape of a few days with their photos (sav-skeleton), not a spinner */
    skeleton() {
      if (items.length) return;
      el.replaceChildren(...[5, 3, 7].map((n) => h('section.day.gskel', { 'aria-hidden': 'true' }, h('h3.dayh', h('sav-skeleton', { style: 'width:9rem;height:1rem' })),
        h('div.tiles', Array.from({ length: n }, () => h('sav-skeleton.tskel', { shape: 'rect' }))))));
    },
    /** choosing without a first long press (the Select button of phones); off when the choice is cleared */
    choose(on) { choosing = !!on; daySync(); },
    /** The rectangle of SavDrive (band.js): press and drag with the mouse, also starting on a photo, to choose many. */
    band(area) {
      if (!sel) return;
      bandState = bandSelect(area, { sel, items: () => [...tiles], item: '.tile', onChange: () => { daySync(); onSelect(); },
        onEmpty: () => { sel.clear(); choosing = false; for (const [, b] of tiles) b.classList.remove('on'); daySync(); onSelect(); } });
    },
  };
}
