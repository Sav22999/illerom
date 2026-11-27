/*
 * SavOffice — the apps of the suite (SavBooks, SavCalendar, SavDocuments, SavDrive, SavForms, SavNewsletters, SavNotes, SavPresentations, SavSchedules, SavSpreadsheets, SavTasks, SavWhiteboard) from inside each one:
 * <savoffice-apps current="savcalendar"></savoffice-apps> is a button with a grid that opens the list of the apps and the
 * page of SavOffice. Plain script, no build: it needs SavComponents (sav-button, sav-popover), which every app loads.
 * The apps live in folders next to each other (../savdocuments/ …): the links are relative, so it works anywhere.
 *
 * SavOffice.fromDrive(consumer): a file of SavDrive opened in an app (SavDrive opens ../<app>/?savdrive=<id>). The file is
 * read from ../savdrive/api/?r=file.get (same site: the cookie of SavDrive goes with it) and given to `consumer` as the
 * system gives a file opened from the device (launchQueue: {files: [{getFile}]}), so each app opens it its own way.
 *
 * SavOffice.exporter({key, make}) | exporter(null): an editor says which document is open (key: its id in the app) and
 * how to make its file (make: async () => ({blob, name}), the same file as its own "Download"). A cloud button appears next
 * to the grid of the apps (and in ⌘J): it saves the file into SavDrive, over the file it was opened from (remembered in
 * this browser: localStorage savoffice-drive-links, "<app>:<key>" -> {id, name, href, h}), or as a new file in My drive.
 * A document linked to a file of SavDrive saves into it on its own (every 30 s, when the tab or window is left, when it closes:
 * only when it changed), and that file opened again from SavDrive opens the same document (href), not a new copy,
 * as long as the file has not changed in SavDrive meanwhile (h: its hash, the times inside the ZIP left out).
 */
(() => {
  if (customElements.get('savoffice-apps')) return;
  const APPS = [
    ['savbooks', 'SavBooks', 'Libri ed e-book', 'Books and e-books'],
    ['savcalendar', 'SavCalendar', 'Calendario', 'Calendar'],
    ['savdocuments', 'SavDocuments', 'Documenti', 'Documents'],
    ['savdrive', 'SavDrive', 'File e cartelle', 'Files and folders'],
    ['savforms', 'SavForms', 'Moduli e sondaggi', 'Forms and surveys'],
    ['savnewsletters', 'SavNewsletters', 'Newsletter', 'Newsletters'],
    ['savnotes', 'SavNotes', 'Quaderni', 'Notebooks'],
    ['savpresentations', 'SavPresentations', 'Presentazioni', 'Presentations'],
    ['savschedules', 'SavSchedules', 'Sondaggi e posti', 'Polls and slots'],
    ['savspreadsheets', 'SavSpreadsheets', 'Fogli di calcolo', 'Spreadsheets'],
    ['savtasks', 'SavTasks', 'Attività', 'Tasks'],
    ['savwhiteboard', 'SavWhiteboard', 'Lavagna', 'Whiteboard'],
  ];
  const GRIP = '<circle cx="12" cy="5" r="1"/><circle cx="19" cy="5" r="1"/><circle cx="5" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="12" cy="19" r="1"/><circle cx="19" cy="19" r="1"/><circle cx="5" cy="19" r="1"/>';
  const CSS = `
savoffice-apps { display: inline-flex; }
.so-pop { --width: min(27rem, calc(100vw - 1.5rem)); }
.so-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .3rem; }
.so-app { display: grid; justify-items: center; align-content: start; gap: .35rem; padding: .8rem .25rem .7rem; min-width: 0; border-radius: 14px; color: inherit; text-decoration: none; text-align: center; line-height: 1.2; }
.so-app:hover, .so-app:focus-visible { background: var(--sav-color-surface-2, rgba(127,127,127,.12)); outline: none; }
.so-app img { width: 44px; height: 44px; border-radius: 11px; }
.so-app b { font-size: .86rem; font-weight: 650; letter-spacing: -.01em; }
.so-app b { font-size: .8rem; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .so-app small { font-size: .72rem; color: var(--sav-color-text-muted, #777); }
.so-app[aria-current] { background: color-mix(in oklab, var(--sav-color-primary, #36c) 12%, transparent); }
.so-foot { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin-top: .6rem; padding-top: .6rem; border-top: 1px solid var(--sav-color-border, rgba(127,127,127,.25)); font-size: .8rem; }
.so-foot a { color: inherit; font-weight: 600; text-decoration: none; } .so-foot a:hover { text-decoration: underline; }
.so-foot span { color: var(--sav-color-text-muted, #777); display: inline-flex; align-items: center; gap: .45rem; } .so-foot img { width: 20px; height: 20px; flex: none; }
.so-give { display: flex; align-items: center; gap: .4rem; margin-top: .5rem; font-size: .76rem; color: var(--sav-color-text-muted, #777); }
.so-give svg, .so-ask svg { width: 14px; height: 14px; flex: none; fill: #d6378a; } .so-give a { color: inherit; font-weight: 600; margin-left: auto; text-decoration: none; } .so-give a:hover { text-decoration: underline; }
.so-ask { position: fixed; left: max(1rem, env(safe-area-inset-left)); bottom: max(1rem, env(safe-area-inset-bottom)); z-index: 55; width: min(22rem, calc(100vw - 2rem)); padding: .9rem 1rem .8rem; border-radius: 16px;
  background: var(--sav-color-surface, #fff); color: var(--sav-color-text, #222); border: 1px solid var(--sav-color-border, rgba(127,127,127,.25)); box-shadow: 0 12px 34px rgb(0 0 0 / .16); font-size: .88rem; line-height: 1.45; }
.so-ask b { display: flex; align-items: center; gap: .4rem; font-size: .92rem; margin-bottom: .25rem; } .so-ask p { margin: 0 0 .7rem; color: var(--sav-color-text-muted, #666); }
.so-ask .so-row { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; } .so-ask .so-x { position: absolute; top: .35rem; right: .35rem; }
@media (prefers-reduced-motion: no-preference) { .so-ask { animation: so-in .35s ease-out; } @keyframes so-in { from { opacity: 0; transform: translateY(10px); } } }`;
  const it = () => (document.documentElement.lang || navigator.language || 'en').startsWith('it');
  const root = () => new URL('../', location.href.split('#')[0]);
  const DONATE = 'https://www.saveriomorelli.com/donate/';

  class SavOfficeApps extends HTMLElement {
    connectedCallback() {
      if (this.built) return;
      this.built = true;
      if (!document.getElementById('savoffice-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'savoffice-css', textContent: CSS }));
      window.Sav?.registerIcon?.('grip', GRIP);
      const cur = this.getAttribute('current') || '', lang = it(), base = root();
      const label = 'SavOffice';
      const pop = document.createElement('sav-popover');
      pop.className = 'so-pop';
      pop.setAttribute('placement', this.getAttribute('placement') || 'bottom-end');
      pop.setAttribute('heading', label);
      pop.setAttribute('sheet-on-mobile', '');
      const btn = document.createElement('sav-button');
      Object.entries({ slot: 'trigger', icon: 'grip', label: lang ? 'App di SavOffice' : 'SavOffice apps', title: lang ? 'App di SavOffice' : 'SavOffice apps', appearance: 'ghost', variant: 'neutral', square: '', size: this.getAttribute('size') || 'sm' }).forEach(([k, v]) => btn.setAttribute(k, v));
      const grid = document.createElement('div');
      grid.className = 'so-grid';
      for (const [id, name, itx, en] of APPS) {
        const a = document.createElement('a');
        a.className = 'so-app';
        a.href = new URL(id + '/', base).href;
        if (id === cur) a.setAttribute('aria-current', 'page');
        const img = document.createElement('img');
        img.src = new URL(id + '/icons/favicon.svg', base).href;
        img.alt = '';
        a.append(img, Object.assign(document.createElement('b'), { textContent: name }), Object.assign(document.createElement('small'), { textContent: lang ? itx : en }));
        grid.append(a);
      }
      const foot = document.createElement('div');
      foot.className = 'so-foot';
      const hub = Object.assign(document.createElement('a'), { href: new URL('savoffice/', base).href, textContent: lang ? 'Cos’è SavOffice →' : 'About SavOffice →' });
      // the mark of SavOffice (savoffice/icons/favicon.svg): three bars of Illerom in the colours of the apps
      const mark = Object.assign(document.createElement('img'), { src: new URL('savoffice/icons/favicon.svg', base).href, alt: '' });
      const note = document.createElement('span');
      note.append(mark, lang ? 'Libere, aperte, senza pubblicità' : 'Free, open, no ads');
      foot.append(note, hub);
      // the invitation to support SavOffice: one quiet line, only in this panel
      const give = document.createElement('div');
      give.className = 'so-give';
      give.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.2C19.5 16.4 12 21 12 21z"/></svg>';
      give.append(lang ? 'Gratis per tutti, grazie a chi dona.' : 'Free for everyone, thanks to those who donate.', Object.assign(document.createElement('a'), { href: DONATE, target: '_blank', rel: 'noopener', textContent: lang ? 'Sostieni →' : 'Support →' }));
      pop.append(btn, grid, foot, give);
      this.append(pop);
      window.SavOffice?.paintDrive?.(this);
    }
  }
  customElements.define('savoffice-apps', SavOfficeApps);
  // the same list for the search of actions below
  window.SavOffice = Object.assign(window.SavOffice || {}, { apps: APPS });

  // ---------------------------------------------------------------- files of SavDrive opened in an app
  const params = new URLSearchParams(location.search);
  const driveId = params.get('savdrive');
  if (driveId) { // the address goes back to the app's own at once: a reload does not open the file a second time
    params.delete('savdrive');
    history.replaceState(history.state, '', location.pathname + (params.size ? '?' + params : '') + location.hash);
  }
  let drive = null;
  const driveFile = () => (drive ||= !/^[A-Za-z0-9]{16}$/.test(driveId || '') ? Promise.resolve(null) : fetch(new URL('savdrive/api/?r=file.get&open=1&id=' + driveId, root()), { credentials: 'same-origin', cache: 'no-store' })
    .then(async (r) => {
      if (!r.ok) throw new Error('not found');
      const name = decodeURIComponent((/filename\*=UTF-8''([^;]+)/.exec(r.headers.get('Content-Disposition') || '') || [])[1] || 'file');
      return new File([await r.blob()], name, { type: r.headers.get('Content-Type') || '' });
    })
    .catch(() => { window.Sav?.toast?.(it() ? 'Il file di SavDrive non si è aperto: accedi a SavDrive e riprova.' : 'The SavDrive file did not open: sign in to SavDrive and try again.', { variant: 'danger', placement: 'bottom-start' }); return null; }));
  window.SavOffice = Object.assign(window.SavOffice || {}, {
    // a file opened again: the document it became the first time, if the file has not changed since (otherwise a new copy)
    fromDrive(consumer) {
      driveFile().then(async (f) => {
        if (!f) return;
        const h = await fileHash(f);
        const [key, link] = Object.entries(links()).find(([k, v]) => k.startsWith(appId + ':') && v.id === driveId) || [];
        if (link?.href && h && link.h === h) {
          say(it() ? 'Aperto il documento collegato al file di SavDrive.' : 'Opened the document linked to the SavDrive file.', 'neutral');
          if (link.href !== location.pathname + location.search + location.hash) location.assign(link.href);
          return;
        }
        if (key) setLink(key, null); // the file changed in SavDrive: the old copy is no longer its document
        pending = { id: driveId, name: f.name, at: Date.now(), h };
        consumer({ files: [{ kind: 'file', name: f.name, getFile: async () => f }] });
      });
    },
  });

  // ---------------------------------------------------------------- saving back into SavDrive
  const CLOUD = '<path d="M12 13v8"/><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="m8 17 4-4 4 4"/>';
  const LINKS = 'savoffice-drive-links';
  const appId = location.pathname.split('/').filter(Boolean).find((x) => APPS.some((a) => a[0] === x)) || '';
  const links = () => { try { return JSON.parse(localStorage.getItem(LINKS) || '{}') || {}; } catch { return {}; } };
  const setLink = (key, v) => { const l = links(); if (v) l[key] = v; else delete l[key]; try { localStorage.setItem(LINKS, JSON.stringify(l)); } catch { /* private mode */ } };
  const linkKey = () => (exp ? appId + ':' + exp.key : '');
  let exp = null, pending = null, me = null, busy = false;
  /**
   * What a file holds, as a hash: the files of SavOffice are ZIPs whose entries carry the time they were made, so those
   * times are left out (the same document makes the same hash). '' when the browser cannot hash.
   */
  async function fileHash(blob) {
    try {
      const b = new Uint8Array(await blob.arrayBuffer()), v = new DataView(b.buffer);
      let e = b.length - 22;
      while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
      if (e >= 0) {
        const n = v.getUint16(e + 10, true);
        for (let i = 0, p = v.getUint32(e + 16, true); i < n && p + 46 <= b.length && v.getUint32(p, true) === 0x02014b50; i++) {
          const off = v.getUint32(p + 42, true);
          v.setUint32(p + 12, 0, true); // time and date in the central directory
          if (off + 30 <= b.length && v.getUint32(off, true) === 0x04034b50) v.setUint32(off + 10, 0, true); // and in the local header
          p += 46 + v.getUint16(p + 28, true) + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
        }
      }
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('');
    } catch { return ''; }
  }
  const say = (msg, variant = 'success') => window.Sav?.toast?.(msg, { variant, placement: 'bottom-start' });
  const api = (r) => new URL('savdrive/api/?r=' + r, root()).href;
  /** The account of SavDrive in this browser (its cookie), when it can use the drive: {csrf} */
  const driveMe = (fresh) => ((fresh || !me) ? (me = fetch(api('auth.me'), { credentials: 'same-origin', cache: 'no-store' }).then((r) => r.json()).then((d) => (d.user?.activated ? d : null)).catch(() => null)) : me);
  async function post(r, body, csrf, query = '') {
    const raw = body instanceof Blob;
    const res = await fetch(api(r) + query, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': raw ? 'application/octet-stream' : 'application/json', 'X-CSRF-Token': csrf }, body: raw ? body : JSON.stringify(body) });
    const d = await res.json().catch(() => ({ ok: false, error: 'server' }));
    if (!res.ok && d.error !== 'offset') throw Object.assign(new Error(d.error || 'server'), { code: d.error || 'server', data: d });
    return d;
  }
  /** One file into SavDrive, in pieces; replace: the id of the file it becomes the new content of. */
  async function send(blob, name, replace, csrf) {
    const st = await post('upload.start', { name, size: blob.size, mime: blob.type, folder: null, replace: replace || null, conflict: 'rename' }, csrf); // a copy never stops on a name already there
    if (st.done) return st;
    let off = 0;
    for (;;) {
      const d = await post('upload.chunk', blob.slice(off, off + (st.chunk || 4194304)), csrf, `&id=${st.upload}&offset=${off}`);
      if (d.done) return d;
      off = d.received;
    }
  }
  /**
   * Saves the open document into SavDrive: over the file it is linked to, or as a new file. auto: the saving done on its
   * own for a linked document (every little while, when the tab is left, when the editor closes): silent, and only when
   * something changed.
   */
  async function saveToDrive(auto) {
    auto = auto === true;
    const cur = exp;
    if (!cur || busy) return;
    const key = appId + ':' + cur.key, link = links()[key];
    if (auto && !link) return;
    const l = it(), d = await driveMe(!auto);
    if (!d) { if (!auto) { say(l ? 'Accedi a SavDrive (in un’altra scheda) per salvare qui i tuoi file.' : 'Sign in to SavDrive (in another tab) to save your files there.', 'neutral'); window.open(new URL('savdrive/', root()).href, '_blank', 'noopener'); } return; }
    busy = true; if (!auto) paintAll();
    try {
      const { blob, name } = await cur.make();
      const h = await fileHash(blob);
      if (auto && h && link.h === h) return; // nothing changed since the last time
      let r;
      try { r = await send(blob, name, link?.id, d.csrf); } catch (e) {
        if (!link || !['not_found', 'in_trash'].includes(e.code)) throw e;
        if (auto) { setLink(key, null); return; } // the file of the drive is gone: no new one without asking
        r = await send(blob, name, null, d.csrf); // the file of the drive is gone (or in the trash): a new one
      }
      setLink(key, { id: r.item.id, name: r.item.name, href: link?.href || here(), h });
      if (!auto) say((l ? (r.replaced ? 'Salvato in SavDrive: ' : 'Salvato in SavDrive come ') : (r.replaced ? 'Saved in SavDrive: ' : 'Saved in SavDrive as ')) + r.item.name);
    } catch (e) {
      if (!auto || e.code === 'quota') say(e.code === 'quota' ? (l ? 'Non c’è abbastanza spazio in SavDrive.' : 'There is not enough space in SavDrive.') : (l ? 'Non è stato possibile salvare in SavDrive.' : 'It could not be saved in SavDrive.'), 'danger');
    } finally { busy = false; paintAll(); }
  }
  const here = () => location.pathname + location.search + location.hash;
  // a document linked to a file of SavDrive goes back there on its own: every 30 seconds while it is open, when the tab
  // or the window is left and when the editor closes (only what changed is sent)
  setInterval(() => { if (exp && document.visibilityState === 'visible') saveToDrive(true); }, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && exp) saveToDrive(true); });
  addEventListener('blur', () => { if (exp) saveToDrive(true); }); // another tab or window (SavDrive, to look at the file)
  addEventListener('pagehide', () => { if (exp) saveToDrive(true); });

  /** The cloud button next to the grid: only in an editor, and when its document comes from SavDrive or SavDrive is signed in. */
  async function paintDrive(el) {
    let b = el.querySelector(':scope > .so-save');
    const link = exp && links()[linkKey()];
    const show = !!exp && (!!link || !!(await driveMe()));
    if (!show) { b?.remove(); return; }
    if (!b) {
      window.Sav?.registerIcon?.('so-cloud-up', CLOUD);
      b = document.createElement('sav-button');
      b.className = 'so-save';
      Object.entries({ icon: 'so-cloud-up', appearance: 'ghost', variant: 'neutral', square: '', size: el.getAttribute('size') || 'sm' }).forEach(([k, v]) => b.setAttribute(k, v));
      b.addEventListener('click', () => saveToDrive());
      el.prepend(b);
    }
    const l = it(), text = link ? (l ? 'Collegato a SavDrive (si salva da solo) · ' : 'Linked to SavDrive (saves on its own) · ') + link.name : (l ? 'Salva una copia in SavDrive' : 'Save a copy in SavDrive');
    b.setAttribute('label', text); b.setAttribute('title', text);
    b.loading = busy;
  }
  const paintAll = () => document.querySelectorAll('savoffice-apps').forEach((el) => paintDrive(el));
  window.SavOffice = Object.assign(window.SavOffice || {}, {
    paintDrive,
    exporter(x) {
      // the editor that closes saves its last changes into its file of SavDrive (it can still make its file now)
      if (exp && (!x || String(x.key) !== exp.key)) saveToDrive(true);
      exp = x && x.key != null && typeof x.make === 'function' ? { key: String(x.key), make: x.make } : null;
      // the first document opened after a file of SavDrive was handed over is that file
      if (exp && pending && Date.now() - pending.at < 120000) {
        setLink(linkKey(), { id: pending.id, name: pending.name, href: here(), h: pending.h });
        pending = null;
        say(it() ? 'Aperto da SavDrive: le modifiche tornano da sole nel file del drive.' : 'Opened from SavDrive: your changes go back into the drive file on their own.', 'neutral');
      } else if (exp) { const k = linkKey(), l = links()[k]; if (l && l.href !== here()) setLink(k, { ...l, href: here() }); } // where it is opened now
      paintAll();
    },
    saveToDrive,
    /** for the search of actions */
    driveCommands() {
      if (!exp) return [];
      const l = it(), link = links()[linkKey()];
      return [{ label: 'SavDrive', items: [{ icon: 'so-cloud-up', label: link ? (l ? 'Salva in SavDrive' : 'Save in SavDrive') : (l ? 'Salva una copia in SavDrive' : 'Save a copy in SavDrive'), description: link?.name || '', keywords: 'drive cloud save salva', run: saveToDrive }] }];
    },
  });
  paintAll();

  // ---------------------------------------------------------------- a rare invitation to support SavOffice
  // Shown at most once every 4 months (one year after "I already donated" or a press on "Support"), only to whoever has
  // used the apps of SavOffice on at least 10 different days (in this browser, all the apps together), never while a
  // document is open, a dialog is open or something is being typed, never on the first pages. A small note in a corner,
  // nothing to close before going on.
  const DAY = 86400000, store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return null; };
  (() => {
    const today = new Date().toISOString().slice(0, 10);
    let days = [];
    try { days = JSON.parse(store('savoffice-days') || '[]'); } catch { days = []; }
    if (!days.includes(today)) { days = [...days, today].slice(-30); store('savoffice-days', JSON.stringify(days)); }
    const next = +store('savoffice-give-next') || 0;
    if (days.length < 10 || Date.now() < next) return;
    const later = (ms) => store('savoffice-give-next', String(Date.now() + ms));
    setTimeout(function ask() {
      const busy = exp || document.querySelector('sav-dialog[open], .landing, .authp, .so-ask') || document.visibilityState !== 'visible'
        || (document.activeElement && (/^(input|textarea|select)$/i.test(document.activeElement.localName) || document.activeElement.isContentEditable || /^sav-(input|textarea|select)$/.test(document.activeElement.localName)));
      if (busy) return;
      later(120 * DAY); // seen: not again for 4 months, whatever is pressed
      const l = it(), box = document.createElement('aside');
      box.className = 'so-ask';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-label', l ? 'Sostieni SavOffice' : 'Support SavOffice');
      box.innerHTML = '<b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.2C19.5 16.4 12 21 12 21z"/></svg></b><p></p><div class="so-row"></div>';
      box.querySelector('b').append(l ? 'Ti è utile SavOffice?' : 'Is SavOffice useful to you?');
      box.querySelector('p').textContent = l ? 'È gratis e senza pubblicità per tutti grazie a chi dona. Se puoi, anche un piccolo contributo aiuta; se no, va benissimo così.' : 'It is free and without ads for everyone thanks to those who donate. If you can, even a small contribution helps; if not, that is perfectly fine.';
      const mk = (label, attrs, run) => { const b = document.createElement('sav-button'); Object.entries({ size: 'sm', ...attrs }).forEach(([k, v]) => b.setAttribute(k, v)); b.textContent = label; b.addEventListener('click', () => { run?.(); box.remove(); }); return b; };
      const x = mk('', { icon: 'x', appearance: 'ghost', variant: 'neutral', square: '', label: l ? 'Chiudi' : 'Close', class: 'so-x' });
      box.querySelector('.so-row').append(
        mk(l ? 'Sostieni' : 'Support', { variant: 'primary', appearance: 'solid' }, () => { window.open(DONATE, '_blank', 'noopener'); later(365 * DAY); }),
        mk(l ? 'Non ora' : 'Not now', { appearance: 'ghost', variant: 'neutral' }),
        mk(l ? 'Ho già donato' : 'I already donated', { appearance: 'ghost', variant: 'neutral' }, () => later(365 * DAY)));
      box.append(x);
      document.body.append(box);
    }, 25000);
  })();
})();

/*
 * SavOffice — the search of actions, the same in every app of the suite: ⌘J on a Mac, Ctrl+J elsewhere (the "mod+j" of
 * SavDocuments and SavPresentations). It is the <sav-command> of SavComponents; each screen tells what it can do with
 * SavOffice.commands([{label, items: [{icon, label, run | href, shortcut, description, keywords}]}]) and the other apps of
 * SavOffice are always there. An editor with a palette of its own (SavDocuments, SavPresentations) opens that one.
 * SavOffice.palette() opens it from a button; SavOffice.paletteKey is how the shortcut is written ("⌘J" / "Ctrl+J").
 */
(() => {
  if (window.SavOffice?.commands) return;
  const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const it = () => (document.documentElement.lang || navigator.language || 'en').startsWith('it');
  const APPS = [['savbooks', 'SavBooks', 'Libri ed e-book', 'Books and e-books'], ['savcalendar', 'SavCalendar', 'Calendario', 'Calendar'], ['savdocuments', 'SavDocuments', 'Documenti', 'Documents'], ['savdrive', 'SavDrive', 'File e cartelle', 'Files and folders'],
    ['savforms', 'SavForms', 'Moduli e sondaggi', 'Forms and surveys'], ['savnewsletters', 'SavNewsletters', 'Newsletter', 'Newsletters'], ['savnotes', 'SavNotes', 'Quaderni', 'Notebooks'], ['savpresentations', 'SavPresentations', 'Presentazioni', 'Presentations'],
    ['savschedules', 'SavSchedules', 'Sondaggi e posti', 'Polls and slots'], ['savspreadsheets', 'SavSpreadsheets', 'Fogli di calcolo', 'Spreadsheets'], ['savtasks', 'SavTasks', 'Attività', 'Tasks'], ['savwhiteboard', 'SavWhiteboard', 'Lavagna', 'Whiteboard']];
  const GRIP = '<circle cx="12" cy="5" r="1"/><circle cx="19" cy="5" r="1"/><circle cx="5" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="12" cy="19" r="1"/><circle cx="19" cy="19" r="1"/><circle cx="5" cy="19" r="1"/>';
  let groups = [], pal = null;
  const fns = new Map();
  const base = () => new URL('../', location.href.split('#')[0].split('?')[0]);
  const current = () => location.pathname.split('/').filter(Boolean).find((p) => APPS.some((a) => a[0] === p)) || '';
  function build() {
    window.Sav?.registerIcon?.('grip', GRIP);
    const p = document.createElement('sav-command'), l = it();
    p.setAttribute('placeholder', l ? 'Cerca un’azione o una pagina…' : 'Search an action or a page…');
    p.setAttribute('empty-label', l ? 'Nessuna azione trovata' : 'No action found');
    p.setAttribute('label', l ? 'Cerca azioni' : 'Search actions');
    p.dataset.savoffice = '';
    p.addEventListener('sav-select', (e) => { const fn = fns.get(e.detail.value); if (fn) setTimeout(() => { try { const r = fn(); if (r?.catch) r.catch((x) => console.error(x)); } catch (x) { console.error(x); } }, 60); });
    document.body.append(p);
    return p;
  }
  function fill() {
    fns.clear();
    const l = it(), cur = current(), list = [];
    const apps = { label: 'SavOffice', items: (window.SavOffice?.apps || APPS).filter((a) => a[0] !== cur).map(([id, name, itx, en]) => ({ icon: 'grip', label: name, description: l ? itx : en, keywords: 'app savoffice', href: new URL(id + '/', base()).href })) };
    let n = 0;
    for (const g of [...(window.SavOffice?.driveCommands?.() || []), ...groups, apps]) for (const c of (g?.items || []).filter(Boolean)) {
      const id = 'c' + n++;
      fns.set(id, c.run || (() => { if (c.href) location.href = c.href; }));
      list.push({ label: c.label, value: id, icon: c.icon || '', shortcut: c.shortcut || '', description: c.description || '', keywords: c.keywords || '', group: g.label || '', disabled: !!c.disabled });
    }
    pal.commands = list;
  }
  /** the palette of an editor (SavDocuments, SavPresentations), when there is one on the page */
  const own = () => [...document.querySelectorAll('sav-command')].find((x) => !('savoffice' in x.dataset));
  function open() {
    if (!customElements.get('sav-command')) return;
    const o = own();
    if (o) return o.show();
    pal ||= build();
    fill();
    pal.show();
  }
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.repeat || e.altKey || e.shiftKey || !(IS_MAC ? e.metaKey : e.ctrlKey) || e.key.toLowerCase() !== 'j') return;
    e.preventDefault();
    if (pal?.open) return pal.hide();
    const o = own();
    if (o) { if (!o.open) o.show(); return; }
    open();
  });
  window.SavOffice = Object.assign(window.SavOffice || {}, {
    commands(list) { groups = (list || []).filter(Boolean); if (pal?.open) fill(); },
    palette: open,
    paletteKey: IS_MAC ? '⌘J' : 'Ctrl+J',
  });
})();
