// The status page: one request to /api/status/, again every minute while the page is open.
(() => {
  const box = document.querySelector('#status'), d = box.dataset, texts = JSON.parse(d.texts), btn = document.querySelector('#st-refresh');
  const order = ['down', 'degraded', 'up', 'unknown'];
  const worst = (l) => order.find((s) => l.includes(s)) || 'unknown';
  // the server answers in English: known texts are shown in the language of the page
  const tell = (s) => { for (const [k, v] of Object.entries(texts)) if (s.startsWith(k)) return s.replace(k, v); return s; };

  const set = (li, status, detail, ms) => {
    li.dataset.status = status;
    li.querySelector('.stl').textContent = d[status];
    li.querySelector('.std').textContent = [status === 'up' ? '' : tell(detail || ''), ms ? ms + ' ms' : ''].filter(Boolean).join(' · ');
  };

  // a page the server could not check by itself
  const look = async (li) => {
    const t = performance.now(), c = new AbortController(), timer = setTimeout(() => c.abort(), 10000);
    try {
      const u = new URL(li.dataset.url);
      const r = await fetch(u.origin === location.origin ? u.href : location.origin + u.pathname, { cache: 'no-store', signal: c.signal });
      set(li, r.ok ? 'up' : 'down', r.ok ? '' : 'HTTP ' + r.status, Math.round(performance.now() - t));
    } catch (e) { set(li, 'down', 'Not reachable'); }
    clearTimeout(timer);
  };

  const summary = (time) => {
    const all = [...box.querySelectorAll('.stcard li')].map((l) => l.dataset.status), w = worst(all.filter((s) => s !== 'unknown')), bad = all.filter((s) => s === 'down' || s === 'degraded').length;
    const sum = box.querySelector('.stsum');
    sum.dataset.status = w;
    document.querySelector('#st-title').textContent = w === 'unknown' ? d.checking : bad ? d.some.replace('%d', bad) : d.all;
    if (time) document.querySelector('#st-time').textContent = d.at.replace('%s', new Date(time).toLocaleTimeString(document.documentElement.lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  };

  const run = async (refresh) => {
    btn.loading = true;
    try {
      const r = await (await fetch(d.api + (refresh ? '?refresh=1' : ''), { cache: 'no-store' })).json();
      const later = [];
      for (const p of Object.values(r.projects)) for (const s of p.services) {
        const li = box.querySelector(`[data-id="${CSS.escape(s.id)}"]`);
        if (!li) continue;
        if (s.status === 'unknown' && li.dataset.url) later.push(look(li)); else set(li, s.status, s.detail, s.ms);
      }
      await Promise.all(later);
      summary(r.checkedAt);
    } catch (e) {
      box.querySelector('.stsum').dataset.status = 'down';
      document.querySelector('#st-title').textContent = d.fail;
    }
    btn.loading = false;
  };

  btn.addEventListener('click', () => run(true));
  customElements.whenDefined('sav-button').then(() => run());
  setInterval(() => document.hidden || run(), 60000);
})();
