// Theme, the backwards reading of the name, search and filters. Everything else works without scripts.
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const root = document.documentElement;

$('#theme').addEventListener('click', () => {
  const dark = root.classList.contains('sav-theme-dark') || (root.classList.contains('sav-theme-auto') && matchMedia('(prefers-color-scheme: dark)').matches);
  const next = dark ? 'light' : 'dark', system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.classList.remove('sav-theme-light', 'sav-theme-dark', 'sav-theme-auto');
  // back to what the system uses: nothing to remember
  root.classList.add('sav-theme-' + (next === system ? 'auto' : next));
  try { next === system ? localStorage.removeItem('illerom-theme') : localStorage.setItem('illerom-theme', next); } catch (e) {}
});

const flip = $('#flip');
flip?.addEventListener('click', () => {
  const on = flip.closest('.plates').classList.toggle('flipped');
  flip.setAttribute('aria-pressed', on);
  flip.querySelector('span').textContent = on ? flip.dataset.on : flip.dataset.off;
});

const form = $('#filters');
if (form) {
  form.hidden = false;
  const q = $('#q'), cat = $('#cat'), facts = $('#facts'), items = $$('#grid > .item'), count = $('#count'), none = $('#none');
  const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const i of items) { i.name = plain(i.dataset.name); i.words = plain(i.dataset.words); i.facts = i.dataset.facts.split(' '); }

  const apply = () => {
    const words = plain(q.value || '').split(/\s+/).filter(Boolean), c = cat.value || 'all', f = [].concat(facts.value || []);
    let n = 0;
    for (const i of items) {
      const ok = (c === 'all' || i.dataset.cat === c) && f.every((x) => i.facts.includes(x)) && words.every((w) => i.name.replace(/\s/g, '').includes(w) || i.words.includes(w));
      i.hidden = !ok;
      n += ok;
      // a match in the name comes first
      i.style.order = words.length && words.every((w) => i.name.replace(/\s/g, '').includes(w)) ? -1 : '';
    }
    count.textContent = n === 1 ? count.dataset.one : count.dataset.many.replace('%d', n);
    count.hidden = !n;
    none.hidden = n > 0;
    const p = new URLSearchParams();
    if (words.length) p.set('q', q.value.trim());
    if (c !== 'all') p.set('cat', c);
    if (f.length) p.set('with', f.join(','));
    history.replaceState(null, '', location.pathname + (p.size ? '?' + p : ''));
  };

  // the choices are in the address, so a filtered list can be shared and the back button finds it as it was
  const start = () => {
    const p = new URLSearchParams(location.search), c = p.get('cat');
    q.value = p.get('q') || '';
    cat.value = cat.querySelector(`[value="${CSS.escape(c || 'all')}"]`) ? c || 'all' : 'all';
    facts.value = p.get('with') || '';
    apply();
  };

  customElements.whenDefined('sav-chip-group').then(start);
  form.addEventListener('submit', (e) => { e.preventDefault(); q.blur(); });
  q.addEventListener('input', apply);
  cat.addEventListener('change', apply);
  facts.addEventListener('change', apply);
  $('#reset').addEventListener('click', () => { q.value = ''; cat.value = 'all'; facts.value = ''; apply(); q.focus(); });
  addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.composedPath().some((n) => n.matches?.('input, textarea, select, [contenteditable]'))) { e.preventDefault(); q.focus(); }
  });
}
