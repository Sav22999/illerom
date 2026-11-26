/**
 * The fan of pages of the first page (the same spring as in SavPresentations and SavSchedules, with small newsletters). They arrive as one pack and open up; the one under the pointer comes out of the pack
 * to the left, passes over the others while it covers nothing, and lands on top of them. Everything is a spring drawn with
 * transforms only, so it can change its mind half way without jumps.
 */
const SPREAD = { k: 62, c: 11.5 }, LIFT = { k: 58, c: 14.6 };

export function heroDeck(stage, cards) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches, n = cards.length;
  const st = cards.map((el, i) => ({ el, i, open: still ? 1 : 0, vo: 0, up: 0, vu: 0, wait: i * .055 + .12, z: -1 }));
  let active = -1, raf = 0, last = 0, intent, geo = [];
  const measure = () => { geo = cards.map((c) => ({ x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight })); };

  function paint() {
    const W = stage.clientWidth, H = stage.clientHeight;
    for (const s of st) {
      const g = geo[s.i], p = s.up, o = s.open;
      // how far the others make room: those lying on the raised slide step down a little
      let give = 0;
      for (const q of st) if (q.i < s.i) give += Math.max(0, Math.sin(Math.min(1, q.up) * Math.PI)) * 10;
      const cx = W / 2 - (g.x + g.w / 2), cy = H / 2 - (g.y + g.h / 2), shut = 1 - o;
      // out of the pack: to the left by what is covered, then back again on top, a bit towards the middle
      const top = s.i === n - 1, arc = Math.sin(Math.max(0, Math.min(1, p)) * Math.PI) * (top ? .12 : .78) * g.w;
      const x = cx * shut + cx * .16 * p - arc, y = cy * shut + 70 * shut * (1 - Math.min(1, o * 1.6)) + (g.h * -.02 + cy * .1) * p + give;
      const rot = (s.i - (n - 1) / 2) * 1.9 * o * (1 - p) + (s.i - n / 2) * .6 * shut - arc / g.w * 3, scale = .84 + .16 * Math.min(1.05, o) + .1 * p;
      s.el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${rot.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
      s.el.style.opacity = Math.min(1, Math.max(0, o * 3)).toFixed(3);
      s.el.style.setProperty('--lift', Math.max(0, Math.min(1, p)).toFixed(3));
      const z = (p > .5 ? 100 : 0) + s.i; // it changes place in the pack only while it covers nothing
      if (z !== s.z) { s.z = z; s.el.style.zIndex = z; }
    }
  }
  function tick(now) {
    let dt = Math.min(.034, (now - last) / 1000 || .016), busy = false;
    last = now;
    for (const s of st) {
      if (s.wait > 0) { s.wait -= dt; busy = true; continue; }
      const t = s.i === active ? 1 : 0;
      for (let k = 0; k < 2; k++) { const d = dt / 2; s.vo += ((1 - s.open) * SPREAD.k - s.vo * SPREAD.c) * d; s.open += s.vo * d; s.vu += ((t - s.up) * LIFT.k - s.vu * LIFT.c) * d; s.up += s.vu * d; }
      if (Math.abs(1 - s.open) + Math.abs(s.vo) < .002) { s.open = 1; s.vo = 0; } else busy = true;
      if (Math.abs(t - s.up) + Math.abs(s.vu) < .002) { s.up = t; s.vu = 0; } else busy = true;
    }
    paint();
    raf = busy ? requestAnimationFrame(tick) : 0;
  }
  const wake = () => { if (still) { st.forEach((s) => { s.up = s.i === active ? 1 : 0; }); return paint(); } if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
  const pick = (i) => { if (i === active) return; active = i; wake(); };
  // the places at rest decide, not the moving slides: nothing flickers when a slide moves away from the pointer
  const at = (e) => { const r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; for (let i = n - 1; i >= 0; i--) { const g = geo[i]; if (x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h) return i; } return -1; };
  // only a real pointer that hovers moves the pages: on phones and tablets a touch (or a scroll that starts on them) leaves them still
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const move = (e) => { if (e.pointerType !== 'mouse' || !fine.matches) return; const i = at(e); clearTimeout(intent); intent = setTimeout(() => pick(i), active < 0 ? 40 : 90); };
  const out = () => { clearTimeout(intent); intent = setTimeout(() => pick(-1), 120); };
  stage.addEventListener('pointermove', move); stage.addEventListener('pointerleave', out);
  const ro = new ResizeObserver(() => { measure(); paint(); });
  measure(); paint(); ro.observe(stage); wake();
  return () => { cancelAnimationFrame(raf); clearTimeout(intent); ro.disconnect(); };
}
