// Theme, the name written again, search and filters, the typeface tester. Everything else works without scripts.
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const root = document.documentElement;

$('#theme').addEventListener('click', () => {
    const dark = root.classList.contains('sav-theme-dark') || (root.classList.contains('sav-theme-auto') && matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark',
        system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    root.classList.remove('sav-theme-light', 'sav-theme-dark', 'sav-theme-auto');
    // back to what the system uses: nothing to remember
    root.classList.add('sav-theme-' + (next === system ? 'auto' : next));
    try {
        next === system ? localStorage.removeItem('illerom-theme') : localStorage.setItem('illerom-theme', next);
    } catch (e) {
    }
});

const flip = $('#flip');
flip?.addEventListener('click', () => {
    const on = flip.closest('.plates').classList.toggle('flipped');
    flip.setAttribute('aria-pressed', on);
    flip.querySelector('span').textContent = on ? flip.dataset.on : flip.dataset.off;
});

// the name on the note: a click (or a tap) writes it again, upright first and then leaning
const still = matchMedia('(prefers-reduced-motion: reduce)');
for (const p of $$('.plate-y')) p.addEventListener('click', () => {
    if (!still.matches) p.getAnimations({subtree: true}).forEach((a) => {
        a.cancel();
        a.play();
    });
});

/** Writes a text letter by letter, upright, then leans it (Illerom Bars). */
const write = (el, text) => {
    el.classList.toggle('writing', false);
    if (still.matches) {
        el.textContent = text;
        return;
    }
    // letters in words, so the lines still break between words only
    let i = 0;
    el.replaceChildren(...text.split(/(\s+)/).filter(Boolean).map((w) => {
        if (/^\s/.test(w)) return document.createTextNode(w);
        const word = Object.assign(document.createElement('span'), {className: 'w'});
        word.append(...[...w].map((c) => Object.assign(document.createElement('span'), {textContent: c, style: `--i:${i++}`})));
        return word;
    }));
    el.style.setProperty('--done', Math.min(text.length, 40) * 45 + 300 + 'ms');
    void el.offsetWidth;
    el.classList.toggle('writing', true);
};

// the typeface: what you write, how much it leans; the letters of the alphabet straighten when touched
const preview = $('#preview');
if (preview) {
    const tt = $('#tt'), lean = $('#lean');
    const text = () => (tt.value || '').trim() || tt.getAttribute('value');
    tt.addEventListener('input', () => {
        preview.classList.toggle('writing', false);
        preview.textContent = text();
    });
    lean.addEventListener('input', () => preview.style.setProperty('--lean', lean.value));
    $('#mono').addEventListener('change', (e) => preview.classList.toggle('mono', e.target.checked));
    $('#replay').addEventListener('click', () => write(preview, text()));
    new IntersectionObserver((e, o) => {
        if (e[0].isIntersecting) {
            o.disconnect();
            write(preview, text());
        }
    }, {threshold: .6}).observe(preview);
    for (const b of $$('.ch')) b.addEventListener('click', () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
}

// home: the words of the typeface stand upright until they are seen, then lean
const tfhome = $('#tfhome');
if (tfhome && !still.matches) {
    tfhome.classList.toggle('upright', true);
    new IntersectionObserver((e, o) => {
        if (e[0].isIntersecting) {
            o.disconnect();
            setTimeout(() => tfhome.classList.toggle('upright', false), 350);
        }
    }, {threshold: .8}).observe(tfhome);
}

const form = $('#filters');
if (form) {
    form.hidden = false;
    const q = $('#q'), cat = $('#cat'), facts = $('#facts'), items = $$('#grid > .item'), count = $('#count'),
        none = $('#none');
    const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (const i of items) {
        i.name = plain(i.dataset.name);
        i.words = plain(i.dataset.words);
        i.facts = i.dataset.facts.split(' ');
    }

    const apply = () => {
        const words = plain(q.value || '').split(/\s+/).filter(Boolean), c = cat.value || 'all',
            f = [].concat(facts.value || []);
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
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        q.blur();
    });
    q.addEventListener('input', apply);
    cat.addEventListener('change', apply);
    facts.addEventListener('change', apply);
    $('#reset').addEventListener('click', () => {
        q.value = '';
        cat.value = 'all';
        facts.value = '';
        apply();
        q.focus();
    });
    addEventListener('keydown', (e) => {
        if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.composedPath().some((n) => n.matches?.('input, textarea, select, [contenteditable]'))) {
            e.preventDefault();
            q.focus();
        }
    });
}

// screenshots: the tab of the device in use, and the name of the enlarging button in the language of the page
const shots = $('#shots');
if (shots) customElements.whenDefined('sav-tabs').then(() => requestAnimationFrame(() => {
    const want = innerWidth < 700 ? 'mobile' : innerWidth < 1100 ? 'tablet' : 'desktop';
    if (shots.querySelector(`sav-tab[name="${want}"]`)) shots.show(want);
}));
customElements.whenDefined('sav-image').then(() => $$('sav-image[data-zoom-label]').forEach((i) => i.shadowRoot.querySelector('[part="frame"]')?.setAttribute('aria-label', i.dataset.zoomLabel)));
