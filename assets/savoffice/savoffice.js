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
 * this browser: localStorage savoffice-drive-links, "<app>:<key>" -> {id, name}), or as a new file in My drive.
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
.so-foot span { color: var(--sav-color-text-muted, #777); display: inline-flex; align-items: center; gap: .45rem; } .so-foot img { width: 20px; height: 20px; flex: none; }`;
  const it = () => (document.documentElement.lang || navigator.language || 'en').startsWith('it');
  const root = () => new URL('../', location.href.split('#')[0]);

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
      pop.append(btn, grid, foot);
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
    fromDrive(consumer) { driveFile().then((f) => { if (!f) return; pending = { id: driveId, name: f.name, at: Date.now() }; consumer({ files: [{ kind: 'file', name: f.name, getFile: async () => f }] }); }); },
  });

  // ---------------------------------------------------------------- saving back into SavDrive
  const CLOUD = '<path d="M12 13v8"/><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="m8 17 4-4 4 4"/>';
  const LINKS = 'savoffice-drive-links';
  const appId = location.pathname.split('/').filter(Boolean).find((x) => APPS.some((a) => a[0] === x)) || '';
  const links = () => { try { return JSON.parse(localStorage.getItem(LINKS) || '{}') || {}; } catch { return {}; } };
  const setLink = (key, v) => { const l = links(); if (v) l[key] = v; else delete l[key]; try { localStorage.setItem(LINKS, JSON.stringify(l)); } catch { /* private mode */ } };
  const linkKey = () => (exp ? appId + ':' + exp.key : '');
  let exp = null, pending = null, me = null, busy = false;
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
    const st = await post('upload.start', { name, size: blob.size, mime: blob.type, folder: null, replace: replace || null }, csrf);
    if (st.done) return st;
    let off = 0;
    for (;;) {
      const d = await post('upload.chunk', blob.slice(off, off + (st.chunk || 4194304)), csrf, `&id=${st.upload}&offset=${off}`);
      if (d.done) return d;
      off = d.received;
    }
  }
  async function saveToDrive() {
    if (!exp || busy) return;
    const l = it(), d = await driveMe(true);
    if (!d) { say(l ? 'Accedi a SavDrive (in un’altra scheda) per salvare qui i tuoi file.' : 'Sign in to SavDrive (in another tab) to save your files there.', 'neutral'); window.open(new URL('savdrive/', root()).href, '_blank', 'noopener'); return; }
    busy = true; paintAll();
    try {
      const { blob, name } = await exp.make();
      const key = linkKey(), link = links()[key];
      let r;
      try { r = await send(blob, name, link?.id, d.csrf); } catch (e) {
        if (!link || !['not_found', 'in_trash'].includes(e.code)) throw e;
        r = await send(blob, name, null, d.csrf); // the file of the drive is gone (or in the trash): a new one
      }
      setLink(key, { id: r.item.id, name: r.item.name });
      say((l ? (r.replaced ? 'Salvato in SavDrive: ' : 'Salvato in SavDrive come ') : (r.replaced ? 'Saved in SavDrive: ' : 'Saved in SavDrive as ')) + r.item.name);
    } catch (e) {
      say(e.code === 'quota' ? (l ? 'Non c’è abbastanza spazio in SavDrive.' : 'There is not enough space in SavDrive.') : (l ? 'Non è stato possibile salvare in SavDrive.' : 'It could not be saved in SavDrive.'), 'danger');
    } finally { busy = false; paintAll(); }
  }
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
      b.addEventListener('click', saveToDrive);
      el.prepend(b);
    }
    const l = it(), text = link ? (l ? 'Salva in SavDrive' : 'Save in SavDrive') + ' · ' + link.name : (l ? 'Salva una copia in SavDrive' : 'Save a copy in SavDrive');
    b.setAttribute('label', text); b.setAttribute('title', text);
    b.loading = busy;
  }
  const paintAll = () => document.querySelectorAll('savoffice-apps').forEach((el) => paintDrive(el));
  window.SavOffice = Object.assign(window.SavOffice || {}, {
    paintDrive,
    exporter(x) {
      exp = x && x.key != null && typeof x.make === 'function' ? { key: String(x.key), make: x.make } : null;
      // the first document opened after a file of SavDrive was handed over is that file
      if (exp && pending && Date.now() - pending.at < 120000) {
        setLink(linkKey(), { id: pending.id, name: pending.name });
        pending = null;
        say(it() ? 'Aperto da SavDrive: con ☁ in alto salvi le modifiche nel file del drive.' : 'Opened from SavDrive: ☁ at the top saves your changes into the drive file.', 'neutral');
      }
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
