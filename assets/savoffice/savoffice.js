/*
 * SavOffice — the apps of the suite (SavBooks, SavCalendar, SavContacts, SavDiagrams, SavDocuments, SavDrive, SavForms, SavMail, SavNewsletters, SavNotes, SavPhotos, SavPodcasts, SavPresentations, SavReads, SavSchedules, SavSplits, SavSpreadsheets, SavTasks, SavWhiteboard) from inside each one:
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
    ['savcontacts', 'SavContacts', 'Contatti', 'Contacts'],
    ['savdiagrams', 'SavDiagrams', 'Diagrammi', 'Diagrams'],
    ['savdocuments', 'SavDocuments', 'Documenti', 'Documents'],
    ['savdrive', 'SavDrive', 'File e cartelle', 'Files and folders'],
    ['savforms', 'SavForms', 'Moduli e sondaggi', 'Forms and surveys'],
    ['savmail', 'SavMail', 'Posta', 'Email'],
    ['savnewsletters', 'SavNewsletters', 'Newsletter', 'Newsletters'],
    ['savnotes', 'SavNotes', 'Quaderni', 'Notebooks'],
    ['savphotos', 'SavPhotos', 'Foto e video', 'Photos and videos'],
    ['savpodcasts', 'SavPodcasts', 'Podcast', 'Podcasts'],
    ['savpresentations', 'SavPresentations', 'Presentazioni', 'Presentations'],
    ['savreads', 'SavReads', 'Da leggere e feed', 'Read later and feeds'],
    ['savschedules', 'SavSchedules', 'Sondaggi e posti', 'Polls and slots'],
    ['savsplits', 'SavSplits', 'Spese condivise', 'Shared expenses'],
    ['savspreadsheets', 'SavSpreadsheets', 'Fogli di calcolo', 'Spreadsheets'],
    ['savtasks', 'SavTasks', 'Attività', 'Tasks'],
    ['savwhiteboard', 'SavWhiteboard', 'Lavagna', 'Whiteboard'],
  ];
  const GRIP = '<circle cx="12" cy="5" r="1"/><circle cx="19" cy="5" r="1"/><circle cx="5" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="12" cy="19" r="1"/><circle cx="19" cy="19" r="1"/><circle cx="5" cy="19" r="1"/>';
  const CSS = `
savoffice-apps { display: inline-flex; }
.so-pop { --width: min(25rem, calc(100vw - 1.5rem)); }
/* many apps: a field to find one, then a compact grid of four (the name without "Sav", what it does in the tooltip) that scrolls */
.so-find { display: block; margin: 0 0 .55rem; }
.so-grid { max-height: min(25rem, 58vh); overflow-y: auto; overscroll-behavior: contain; margin: 0 -.2rem; padding: .1rem .2rem; }
.so-app { display: grid; justify-items: center; align-content: start; gap: .3rem; padding: .6rem .15rem .5rem; min-width: 0; border-radius: 12px; color: inherit; text-decoration: none; text-align: center; line-height: 1.2; }
.so-app:hover, .so-app:focus-visible { background: var(--sav-color-surface-2, rgba(127,127,127,.12)); outline: none; }
.so-app img { width: 38px; height: 38px; border-radius: 10px; }
.so-app b { font-size: .76rem; font-weight: 650; letter-spacing: -.01em; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.so-app[aria-current] { background: color-mix(in oklab, var(--sav-color-primary, #36c) 12%, transparent); }
.so-app[hidden] { display: none; }
.so-grid { min-width: min(22.5rem, calc(100vw - 3.5rem)); } /* the same width while filtering */
@media (max-width: 26rem) { .so-app b { font-size: .68rem; letter-spacing: -.02em; } }
.so-none { grid-column: 1 / -1; padding: 1rem .5rem; text-align: center; font-size: .85rem; color: var(--sav-color-text-muted, #777); }
.so-foot { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin-top: .6rem; padding-top: .6rem; border-top: 1px solid var(--sav-color-border, rgba(127,127,127,.25)); font-size: .8rem; }
.so-foot a { color: inherit; font-weight: 600; text-decoration: none; } .so-foot a:hover { text-decoration: underline; }
.so-foot span { color: var(--sav-color-text-muted, #777); display: inline-flex; align-items: center; gap: .45rem; } .so-foot img { width: 20px; height: 20px; flex: none; }
.so-give { display: flex; align-items: center; gap: .4rem; margin-top: .5rem; font-size: .76rem; color: var(--sav-color-text-muted, #777); }
.so-give svg, .so-ask svg { width: 14px; height: 14px; flex: none; fill: #d6378a; } .so-give a { color: inherit; font-weight: 600; margin-left: auto; text-decoration: none; } .so-give a:hover { text-decoration: underline; }
.so-ask { position: fixed; left: max(1rem, env(safe-area-inset-left)); bottom: max(1rem, env(safe-area-inset-bottom)); z-index: 55; width: min(22rem, calc(100vw - 2rem)); padding: .9rem 1rem .8rem; border-radius: 16px;
  background: var(--sav-color-surface, #fff); color: var(--sav-color-text, #222); border: 1px solid var(--sav-color-border, rgba(127,127,127,.25)); box-shadow: 0 12px 34px rgb(0 0 0 / .16); font-size: .88rem; line-height: 1.45; }
.so-ask b { display: flex; align-items: center; gap: .4rem; font-size: .92rem; margin-bottom: .25rem; } .so-ask p { margin: 0 0 .7rem; color: var(--sav-color-text-muted, #666); }
.so-ask .so-row { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; } .so-ask .so-x { position: absolute; top: .35rem; right: .35rem; }
@media (prefers-reduced-motion: no-preference) { .so-ask { animation: so-in .35s ease-out; } @keyframes so-in { from { opacity: 0; transform: translateY(10px); } } }
.so-off { position: fixed; left: 50%; bottom: max(.9rem, env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 60; display: flex; align-items: center; gap: .6rem; max-width: calc(100vw - 1.5rem); padding: .5rem .55rem .5rem .85rem; border-radius: 999px; font: 500 .84rem/1.3 var(--sav-font, system-ui, sans-serif); color: var(--sav-color-text, #222); background: var(--sav-color-surface, #fff); border: 1px solid var(--sav-color-border, rgba(127,127,127,.25)); box-shadow: 0 8px 24px -10px rgb(0 0 0 / .3); }
.so-off svg { flex: none; width: 17px; height: 17px; color: var(--sav-color-warning, #b45309); } .so-off.on svg { color: var(--sav-color-success, #15803d); }
.so-off button { border: 0; border-radius: 999px; padding: .3rem .7rem; font: inherit; font-weight: 650; cursor: pointer; color: var(--sav-color-on-primary, #fff); background: var(--sav-color-primary, #36c); }`;
  const it = () => (document.documentElement.lang || navigator.language || 'en').startsWith('it');
  const root = () => new URL('../', location.href.split('#')[0]);
  const DONATE = 'https://www.saveriomorelli.com/donate/';
  // Installed apps. In SavOffice for Mac (../../desktop/: window.SavOfficeDesktop) the grid lists only the apps installed
  // on the Mac and opens each in its own window, "All the apps" opens the Toolbox. In an app installed from the browser
  // (standalone) there is no grid: another app could only open inside this window, or in the browser.
  const DESK = window.SavOfficeDesktop || null;
  const STANDALONE = !DESK && (['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].some((m) => matchMedia(`(display-mode: ${m})`).matches) || navigator.standalone === true);
  const reachable = (id) => (DESK ? DESK.installed.includes(id) : !STANDALONE);

  class SavOfficeApps extends HTMLElement {
    connectedCallback() {
      if (this.built) return;
      this.built = true;
      if (!document.getElementById('savoffice-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'savoffice-css', textContent: CSS }));
      window.Sav?.registerIcon?.('grip', GRIP);
      const cur = this.getAttribute('current') || '', lang = it(), base = root();
      if (STANDALONE) { window.SavOffice?.paintDrive?.(this); return; } // the cloud button of SavDrive stays, the grid does not
      const label = 'SavOffice';
      const pop = document.createElement('sav-popover');
      pop.className = 'so-pop';
      pop.setAttribute('placement', this.getAttribute('placement') || 'bottom-end');
      pop.setAttribute('heading', label);
      pop.setAttribute('sheet-on-mobile', '');
      const btn = document.createElement('sav-button');
      Object.entries({ slot: 'trigger', icon: 'grip', label: lang ? 'App di SavOffice' : 'SavOffice apps', title: lang ? 'App di SavOffice' : 'SavOffice apps', appearance: 'ghost', variant: 'neutral', square: '', size: this.getAttribute('size') || 'sm' }).forEach(([k, v]) => btn.setAttribute(k, v));
      // a field to find an app by its name or by what it does ("calendario", "expenses"…); Enter opens the first one
      const fold = (x) => String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      // the field of SavComponents: <sav-input type="search"> with its clear button and the search icon
      const q = document.createElement('sav-input');
      Object.entries({ type: 'search', size: 'sm', clearable: '', placeholder: lang ? 'Cerca un’app…' : 'Find an app…', autocomplete: 'off', enterkeyhint: 'go', 'aria-label': lang ? 'Cerca un’app di SavOffice' : 'Find a SavOffice app', class: 'so-find' }).forEach(([k, v]) => q.setAttribute(k, v));
      q.append(Object.assign(document.createElement('sav-icon'), { slot: 'prefix' }));
      q.lastChild.setAttribute('name', 'search');
      const find = q;
      // the apps in a <sav-grid> of four columns, also on phones (keep)
      const grid = document.createElement('sav-grid');
      grid.className = 'so-grid';
      Object.entries({ columns: '4', gap: '.15rem', keep: '' }).forEach(([k, v]) => grid.setAttribute(k, v));
      const items = [];
      for (const [id, name, itx, en] of APPS.filter(([id]) => !DESK || id === cur || reachable(id))) {
        const a = document.createElement('a');
        a.className = 'so-app';
        a.href = new URL(id + '/', base).href;
        if (DESK) a.addEventListener('click', (e) => { e.preventDefault(); pop.hide?.(); if (id !== cur) DESK.open(id); });
        a.title = name + ' · ' + (lang ? itx : en);
        a.setAttribute('aria-label', name + ': ' + (lang ? itx : en));
        if (id === cur) a.setAttribute('aria-current', 'page');
        const img = document.createElement('img');
        img.src = new URL(id + '/icons/favicon.svg', base).href;
        img.alt = '';
        img.loading = 'lazy';
        a.append(img, Object.assign(document.createElement('b'), { textContent: name.replace(/^Sav(?=[A-Z])/, '') }));
        grid.append(a);
        items.push([a, fold([name, itx, en].join(' '))]);
      }
      const none = Object.assign(document.createElement('p'), { className: 'so-none', hidden: true, textContent: lang ? 'Nessuna app con questo nome' : 'No app with this name' });
      grid.append(none);
      const filter = () => {
        const w = fold(String(q.value || '').trim()).split(/\s+/).filter(Boolean);
        let n = 0;
        for (const [a, text] of items) { a.hidden = !w.every((x) => text.includes(x)); n += !a.hidden; }
        none.hidden = n > 0;
      };
      q.addEventListener('input', filter);
      q.addEventListener('sav-clear', () => setTimeout(filter));
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const first = items.find(([a]) => !a.hidden); if (first) { e.preventDefault(); if (DESK) first[0].click(); else location.href = first[0].href; } } });
      // every time it opens: the field empty, and focused only where a keyboard is likely (not to open the keyboard of a phone)
      pop.addEventListener('sav-show', () => { q.value = ''; filter(); if (matchMedia('(hover: hover) and (pointer: fine)').matches) setTimeout(() => q.focus(), 60); });
      const foot = document.createElement('div');
      foot.className = 'so-foot';
      const hub = Object.assign(document.createElement('a'), { href: new URL('savoffice/', base).href, textContent: lang ? 'Cos’è SavOffice →' : 'About SavOffice →' });
      if (DESK) {
        hub.textContent = lang ? 'Tutte le app →' : 'All the apps →';
        hub.addEventListener('click', (e) => { e.preventDefault(); pop.hide?.(); DESK.toolbox(); });
      }
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
      pop.append(btn, find, grid, foot, give);
      this.append(pop);
      window.SavOffice?.paintDrive?.(this);
    }
  }
  customElements.define('savoffice-apps', SavOfficeApps);

  // at most once a frame, however busy the page is (an editor changes it at every key)
  let queued = false;
  const soon = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; decorate(); }); };
  // The first page of every app, for whoever is not signed in: below the opening of the app (its own title, picture and
  // features) come the same SavOffice sections, filled with what is true of that app (../savoffice/landing.php): its
  // screenshots, the apps it works with, its files, privacy, frequent questions, and the other apps of the suite.
  const LAND_CSS = `
.sol { --sol-c: var(--sav-color-primary, #36c); padding-bottom: 1rem; }
.sol-sec { padding: clamp(2.2rem, 5vw, 3.6rem) 0; border-top: 1px solid var(--sav-color-border, rgba(127,127,127,.22)); }
.sol-sec > sav-heading { display: block; margin-bottom: 1.5rem; max-width: 46rem; }
.sol-stage { position: relative; padding: 0 0 6% 0; max-width: 64rem; }
.sol-desk { border-radius: var(--sav-radius-lg, 14px); overflow: hidden; box-shadow: 0 30px 60px -32px rgb(0 0 0 / .45), 0 0 0 1px var(--sav-color-border, rgba(127,127,127,.25)); }
.sol-phone { position: absolute; right: 2%; bottom: 0; width: 21%; border-radius: 20px; overflow: hidden; border: 5px solid #1d1d22; background: #1d1d22; box-shadow: 0 24px 40px -18px rgb(0 0 0 / .5); }
.sol-desk sav-image, .sol-phone sav-image { --sav-radius-lg: 0px; --sav-shadow-sm: none; display: block; }
.sol-thumbs { margin-top: 1.4rem; max-width: 64rem; --mobile-columns: 2; }
.sol-thumbs sav-image { display: block; }
.sol-works { display: block; max-width: 52rem; }
.sol-works img { width: 36px; height: 36px; }
.sol-two { max-width: 64rem; } .sol-box { display: block; height: 100%; }
.sol-box p { margin: 0 0 1rem; color: var(--sav-color-text-muted, #666); line-height: 1.5; }
.sol-tags { display: flex; flex-wrap: wrap; gap: .4rem; }
.sol-box sav-icon { color: var(--sol-c); }
.sol-faq { display: block; max-width: 52rem; }
.sol-end { display: block; margin: clamp(1.5rem, 4vw, 2.5rem) 0 1rem; text-align: center; --sav-card-padding: clamp(1.6rem, 4vw, 2.8rem); }
.sol-center { display: flex; justify-content: center; margin-bottom: .4rem; } .sol-center sav-heading { display: inline-block; } .sol-end p { margin: 0 auto 1.3rem; max-width: 36rem; color: var(--sav-color-text-muted, #666); line-height: 1.55; }
.sol-row { display: flex; flex-wrap: wrap; justify-content: center; gap: .6rem; }
.sol-suite { margin-top: 1.8rem; padding-top: 1.4rem; border-top: 1px dashed var(--sav-color-border, rgba(127,127,127,.3)); }
.sol-suite p { display: inline-flex; align-items: center; gap: .5rem; margin: 0 0 .9rem; font-size: .9rem; font-weight: 650; color: var(--sav-color-text, #222); }
.sol-suite p img { width: 20px; height: 20px; }
.sol-icons { display: flex; flex-wrap: wrap; justify-content: center; gap: .45rem; margin-bottom: .6rem; }
@media (max-width: 760px) { .sol-phone { width: 26%; border-width: 3px; border-radius: 12px; } }`;
  const LAND_WORDS = {
    look: ['Com’è fatta', 'What it looks like'], look_h: ['{n} su computer, tablet e telefono', '{n} on a computer, tablet and phone'], look_p: ['Tocca una schermata per ingrandirla.', 'Tap a screenshot to enlarge it.'],
    together: ['Insieme', 'Together'], works_h: ['Lavora con le altre app di SavOffice', 'Works with the other SavOffice apps'], works_p: ['Lo stesso stile, e i dati che passano da un’app all’altra quando serve.', 'The same style, and data that moves from one app to another when it helps.'],
    files_h: ['I tuoi file, i formati di sempre', 'Your files, the usual formats'], files_p: ['Apri e salvi quello che usano tutti; il file di {n} conserva tutto ed è aperto.', 'Open and save what everybody uses; the file of {n} keeps everything and is open.'],
    privacy_h: ['I tuoi dati restano tuoi', 'Your data stays yours'],
    p1: ['Niente pubblicità', 'No ads'], p1t: ['Nessun banner, nessuna profilazione.', 'No banners, no profiling.'],
    p2: ['Server nell’Unione europea', 'Servers in the European Union'], p2t: ['Sotto il GDPR, senza statistiche di terzi.', 'Under the GDPR, with no third-party analytics.'],
    p3: ['Open source', 'Open source'], p3t: ['Il codice è pubblico: chiunque può controllarlo.', 'The code is public: anyone can check it.'],
    p4: ['Tuoi, sempre', 'Yours, always'], p4t: ['Elimini l’account quando vuoi, e i dati con lui.', 'Delete the account whenever you like, and the data with it.'],
    faq: ['Domande frequenti', 'Frequent questions'],
    end_h: ['Comincia con {n}', 'Start with {n}'], end_p: ['Gratis, senza pubblicità e senza installare nulla.', 'Free, with no ads and nothing to install.'],
    start: ['Inizia gratis', 'Start for free'], signin: ['Accedi', 'Sign in'],
    suite: ['{n} fa parte di SavOffice: {c} app che lavorano insieme', '{n} is part of SavOffice: {c} apps that work together'], all: ['Scopri tutte le app di SavOffice →', 'Discover all the SavOffice apps →'], code: ['Codice sorgente', 'Source code'],
  };
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  const landData = {};
  const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } e.append(...kids.filter((x) => x != null && x !== false)); return e; };
  const thisApp = () => location.pathname.split('/').filter(Boolean).find((p) => APPS.some((a) => a[0] === p)) || '';
  async function landing(main) {
    const app = thisApp(); if (!app) return;
    main.dataset.soLand = '';
    const l = it(), lang = l ? 'it' : 'en', W = (k, n = '', c = '') => LAND_WORDS[k][l ? 0 : 1].replace('{n}', n).replace('{c}', c);
    let d = landData[app + lang];
    if (!d) { try { const r = await fetch(new URL(`savoffice/landing.php?app=${app}&lang=${lang}`, root()), { credentials: 'omit' }); if (!r.ok) return; d = landData[app + lang] = await r.json(); } catch { return; } }
    if (!main.isConnected) return;
    if (!document.getElementById('savoffice-land-css')) document.head.append(el('style', { id: 'savoffice-land-css' }, LAND_CSS));
    const base = root(), icon = (a, size = 40) => el('img', { src: new URL(a + '/icons/favicon.svg', base).href, alt: '', width: size, height: size, loading: 'lazy' });
    const sec = (eyebrow, title, subtitle, ...kids) => el('section', { class: 'sol-sec' }, el('sav-heading', { level: '2', size: '2', ...(eyebrow ? { eyebrow } : {}), ...(subtitle ? { subtitle } : {}) }, title), ...kids);
    // the buttons of the opening of the app: the same actions at the end of the page (each app starts its own way)
    const heroBtns = [...main.querySelectorAll('.hero sav-button, .hero a.btn, .hero button')];
    const again = (i, label, appearance) => heroBtns[i] ? el('sav-button', { size: 'lg', ...(appearance ? { appearance, variant: 'neutral' } : {}), onclick: () => heroBtns[i].click() }, label) : null;
    const box = el('div', { class: 'sol', style: `--sol-c:${d.color}` });
    const sh = d.shots || {}, desk = sh.desk || [], phone = sh.phone || [];
    const zoom = (src, ratio, alt) => el('sav-image', { zoom: '', src, alt, ratio });
    if (desk.length || phone.length) {
      const stage = el('div', { class: 'sol-stage' }, desk[0] ? el('div', { class: 'sol-desk' }, zoom(desk[0], '1440:900', d.name + (l ? ' su un computer' : ' on a computer'))) : null,
        phone[0] ? el('div', { class: 'sol-phone' }, zoom(phone[0], '562:1000', d.name + (l ? ' su un telefono' : ' on a phone'))) : null);
      const more = [...desk.slice(1, 3).map((s) => [s, '1440:900']), ...(sh.tablet || []).slice(0, 1).map((s) => [s, '1180:820'])].slice(0, 3); // landscape only: one even row
      box.append(sec(W('look'), W('look_h', d.name), W('look_p'), stage, more.length ? el('sav-grid', { columns: '3', gap: '.9rem', class: 'sol-thumbs' }, ...more.map(([s, r]) => zoom(s, r, d.name))) : null));
    }
    // the apps it works with: a list of SavComponents, each row a link to the app
    if (d.works?.length) box.append(sec(W('together'), W('works_h'), W('works_p'),
      el('sav-list', { appearance: 'card', class: 'sol-works' }, ...d.works.map((w) => el('sav-list-item', { href: new URL(w.app + '/', base).href, description: w.text }, el('img', { slot: 'prefix', src: new URL(w.app + '/icons/favicon.svg', base).href, alt: '', width: 36, height: 36 }), w.name)))));
    const files = (d.own?.length || d.files?.length) ? el('sav-card', { class: 'sol-box' }, el('strong', { slot: 'header' }, W('files_h')), el('p', {}, W('files_p', d.name)),
      el('div', { class: 'sol-tags' }, ...(d.own || []).map((f) => el('sav-tag', { variant: 'primary' }, f)), ...(d.files || []).map((f) => el('sav-tag', {}, f)))) : null;
    const privacy = el('sav-card', { class: 'sol-box' }, el('strong', { slot: 'header' }, W('privacy_h')),
      el('sav-list', { appearance: 'plain' }, ...['p1', 'p2', 'p3', 'p4'].map((k) => el('sav-list-item', { description: W(k + 't') }, el('sav-icon', { slot: 'prefix', name: 'check' }), W(k)))));
    box.append(el('section', { class: 'sol-sec' }, el('sav-grid', { columns: files ? '2' : '1', gap: '1.2rem', class: 'sol-two' }, files, privacy)));
    // frequent questions: the accordion of SavComponents, one open at a time
    if (d.faq?.length) box.append(sec('', W('faq'), '', el('sav-accordion', { exclusive: '', class: 'sol-faq' }, ...d.faq.map(([q, a]) => el('sav-details', { summary: q }, a)))));
    box.append(el('sav-card', { appearance: 'flat', class: 'sol-end' },
      el('div', { class: 'sol-center' }, el('sav-heading', { level: '2', size: '2' }, W('end_h', d.name))), el('p', {}, W('end_p')),
      el('div', { class: 'sol-row' }, again(0, heroBtns[0]?.textContent?.trim() || W('start')), again(1, heroBtns[1]?.textContent?.trim() || W('signin'), 'outline')),
      el('div', { class: 'sol-suite' }, el('p', {}, el('img', { src: new URL('savoffice/icons/favicon.svg', base).href, alt: '' }), W('suite', d.name, d.count)),
        el('div', { class: 'sol-icons' }, ...(d.apps || []).map((a) => el('sav-avatar', { image: new URL(a.app + '/icons/favicon.svg', base).href, label: a.name, title: a.name + ' · ' + a.what, href: new URL(a.app + '/', base).href, shape: 'rounded', size: 'md' }))),
        el('sav-button', { appearance: 'link', href: new URL(d.suite.replace(/^\//, ''), base).href }, W('all')))));
    main.append(box);
  }
  // The opening picture of the apps that do not make pages (a calendar, a list, a poll, balances, mail, contacts): instead of
  // the fan of pages, a small window of the app at work, where one thing happens after the other and then starts again.
  // SavOffice.scene(kind) gives it to the app; whoever asked for less motion sees it finished and still.
  const SCENE_CSS = `
.sos { position: absolute; inset: 0; display: grid; place-items: center; }
.sos::before { content: ""; position: absolute; width: 78%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle, color-mix(in oklab, var(--sav-color-primary, #36c) 16%, transparent), transparent 68%); }
.sos::after { content: ""; position: absolute; width: min(86%, 27rem); height: 62%; border-radius: 22px; background: color-mix(in oklab, var(--sav-color-primary, #36c) 12%, var(--sav-color-surface, #fff)); rotate: 4deg; translate: 4% 3%; }
.sos-win { position: relative; z-index: 1; rotate: -1.2deg; width: min(100%, 31rem); border-radius: 18px; background: var(--sav-color-surface, #fff); color: var(--sav-color-text, #222); box-shadow: 0 34px 70px -34px rgb(0 0 0 / .42), 0 0 0 1px var(--sav-color-border, rgba(127,127,127,.2)); overflow: hidden; font-size: 13px; line-height: 1.35; }
.sos-bar { display: flex; align-items: center; gap: 6px; padding: 11px 14px; border-bottom: 1px solid var(--sav-color-border, rgba(127,127,127,.18)); font-weight: 650; }
.sos-bar i { width: 9px; height: 9px; border-radius: 50%; background: var(--sav-color-border, #ddd); } .sos-bar span { margin-left: 6px; } .sos-bar em { margin-left: auto; font-style: normal; font-weight: 600; font-size: 11px; color: var(--sav-color-text-muted, #777); }
.sos-body { padding: 14px; display: grid; gap: 8px; }
.sos .st { transition: opacity .45s ease, transform .45s cubic-bezier(.3,1.4,.5,1), background-color .3s, color .3s; }
.sos .st:not(.on) { opacity: 0; transform: translateY(8px) scale(.96); }
.sos .pop:not(.on) { transform: scale(.4); }
.sos-c { --k: var(--sav-color-primary, #36c); }
/* calendar */
.sos-month { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.sos-month b { font-size: 10px; text-align: center; color: var(--sav-color-text-muted, #888); font-weight: 650; }
.sos-day { position: relative; min-height: 46px; padding: 4px; border-radius: 8px; background: var(--sav-color-surface-2, rgba(127,127,127,.07)); font-size: 10px; color: var(--sav-color-text-muted, #888); display: flex; flex-direction: column; gap: 3px; }
.sos-day.today > span { align-self: flex-start; padding: 1px 5px; border-radius: 99px; background: var(--k); color: #fff; font-weight: 700; }
.sos-ev { height: 7px; border-radius: 4px; background: var(--e, var(--k)); }
.sos-toast { justify-self: end; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 12px; background: var(--sav-color-text, #222); color: var(--sav-color-surface, #fff); font-size: 12px; font-weight: 600; }
.sos-toast img { width: 18px; height: 18px; }
/* tasks */
.sos-task { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 10px; background: var(--sav-color-surface-2, rgba(127,127,127,.06)); }
.sos-ck { width: 18px; height: 18px; flex: none; border-radius: 50%; border: 2px solid var(--sav-color-border-strong, #aaa); display: grid; place-items: center; transition: background .3s, border-color .3s; }
.sos-ck svg { width: 11px; height: 11px; opacity: 0; transition: opacity .2s; color: #fff; }
.sos-task.done .sos-ck { background: var(--k); border-color: var(--k); } .sos-task.done .sos-ck svg { opacity: 1; }
.sos-task > span:not(.sos-ck) { flex: 1; transition: color .3s; } .sos-task.done > span:not(.sos-ck) { color: var(--sav-color-text-muted, #999); text-decoration: line-through; }
.sos-task small { font-size: 11px; color: var(--sav-color-text-muted, #888); } .sos-task small.late { color: #c2410c; font-weight: 650; }
/* poll */
.sos-poll { display: grid; grid-template-columns: 74px repeat(4, 1fr); gap: 5px; align-items: center; text-align: center; }
.sos-poll .hd { font-size: 11px; font-weight: 700; padding: 6px 0; border-radius: 8px; transition: background .3s, color .3s; } .sos-poll .hd small { display: block; font-weight: 500; color: var(--sav-color-text-muted, #888); }
.sos-poll .who { display: flex; align-items: center; gap: 6px; --size: 24px; text-align: left; font-size: 12px; font-weight: 600; }
.sos-vote { height: 26px; border-radius: 7px; display: grid; place-items: center; background: var(--sav-color-surface-2, rgba(127,127,127,.07)); font-weight: 800; }
.sos-vote.y { background: color-mix(in oklab, #16a34a 18%, transparent); color: #15803d; } .sos-vote.n { color: var(--sav-color-text-muted, #aaa); }
.sos-poll .best { background: var(--k); color: #fff; } .sos-poll .best small { color: rgb(255 255 255 / .8); }
/* balances */
.sos-exp { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: var(--sav-color-surface-2, rgba(127,127,127,.06)); }
.sos-exp span { flex: 1; } .sos-exp b { font-variant-numeric: tabular-nums; }
.sos-bal { display: grid; grid-template-columns: 54px 1fr 54px; gap: 8px; align-items: center; font-size: 12px; }
.sos-bal .bar { height: 8px; border-radius: 99px; background: var(--sav-color-surface-2, rgba(127,127,127,.1)); position: relative; }
.sos-bal .bar i { position: absolute; top: 0; bottom: 0; left: 50%; width: calc(var(--w) * 1%); border-radius: 99px; background: #16a34a; transition: width .6s ease, left .6s ease; }
.sos-bal .bar i.neg { left: auto; right: 50%; background: #dc2626; }
.sos-win.settled .sos-bal .bar i { width: 0; }
.sos-bal em { font-style: normal; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
.sos-pay { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 12px; border: 1.5px dashed var(--k); font-weight: 650; }
.sos-pay svg { width: 16px; height: 16px; color: var(--k); } .sos-pay span { margin-left: auto; color: #15803d; }
/* mail */
.sos-mail { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 10px; }
.sos-mail.unread { background: color-mix(in oklab, var(--k) 8%, transparent); } .sos-mail.unread b::after { content: ""; display: inline-block; width: 7px; height: 7px; margin-left: 6px; border-radius: 50%; background: var(--k); vertical-align: 1px; }
.sos-mail div { flex: 1; min-width: 0; } .sos-mail b { display: block; font-size: 12.5px; } .sos-mail small { display: block; color: var(--sav-color-text-muted, #888); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* contacts */
.sos-cards { position: relative; height: 150px; }
.sos-card { position: absolute; top: 0; width: 62%; padding: 12px; border-radius: 14px; background: var(--sav-color-surface, #fff); box-shadow: 0 10px 24px -14px rgb(0 0 0 / .35), 0 0 0 1px var(--sav-color-border, rgba(127,127,127,.2)); display: grid; gap: 4px; transition: left .7s cubic-bezier(.6,0,.3,1), opacity .5s, transform .7s; }
.sos-card .nm { display: flex; align-items: center; gap: 8px; font-weight: 700; } .sos-card small { color: var(--sav-color-text-muted, #777); }
.sos-card.a { left: 0; } .sos-card.b { left: 38%; }
.sos-win.merged .sos-card.a, .sos-win.merged .sos-card.b { left: 19%; opacity: 0; transform: scale(.9); }
.sos-card.m { left: 19%; opacity: 0; transform: scale(.9); } .sos-win.merged .sos-card.m { opacity: 1; transform: none; }
.sos-card.m .ok { justify-self: start; margin-top: 4px; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px; background: color-mix(in oklab, #16a34a 16%, transparent); color: #15803d; }
@media (prefers-reduced-motion: reduce) { .sos .st, .sos-card, .sos-bal .bar i { transition: none !important; } }`;
  const CK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  /** Runs the steps one after the other (each turns a class on), keeps the last state for a while, then starts again. */
  function play(win, steps, gap = 850, hold = 2600) {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) { steps.forEach((f) => f(true)); return; }
    let i = 0;
    const tick = () => {
      if (!win.isConnected) return; // the page changed: nothing more to do
      if (i < steps.length) { steps[i++](true); setTimeout(tick, gap); }
      else setTimeout(() => { if (!win.isConnected) return; steps.slice().reverse().forEach((f) => f(false)); i = 0; setTimeout(tick, 700); }, hold);
    };
    setTimeout(tick, 600);
  }
  const on = (node, cls = 'on') => (v) => node.classList.toggle(cls, v);
  function scene(kind) {
    if (!document.getElementById('savoffice-scene-css')) document.head.append(el('style', { id: 'savoffice-scene-css' }, SCENE_CSS));
    const l = it(), T = (i, e) => (l ? i : e), base = root();
    const app = APPS.find((a) => a[0] === 'sav' + kind) || ['', 'Sav' + kind];
    const body = el('div', { class: 'sos-body' });
    const win = el('div', { class: 'sos-win sos-c' }, el('div', { class: 'sos-bar' }, el('i'), el('i'), el('i'), el('span', {}, app[1])), body);
    const bar = win.firstChild, steps = [];
    if (kind === 'calendar') {
      bar.append(el('em', {}, T('Novembre 2026', 'November 2026')));
      const grid = el('div', { class: 'sos-month' }, ...(l ? ['L', 'M', 'M', 'G', 'V', 'S', 'D'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']).map((x) => el('b', {}, x)));
      const days = [];
      for (let d = 1; d <= 28; d++) { const c = el('div', { class: 'sos-day' + (d === 12 ? ' today' : '') }, el('span', {}, String(d))); days.push(c); grid.append(c); }
      // where the events land: [day, colour] — the event of SavSchedules is the last, with its note
      for (const [d, c] of [[3, ''], [6, '#2563eb'], [10, '#16a34a'], [12, ''], [12, '#9333ea'], [17, '#d97706'], [20, '#2563eb'], [24, '#16a34a']]) { const e = el('i', { class: 'sos-ev st', style: c ? `--e:${c}` : '' }); days[d - 1].append(e); steps.push(on(e)); }
      const toast = el('div', { class: 'sos-toast st' }, el('img', { src: new URL('savschedules/icons/favicon.svg', base).href, alt: '' }), T('Data scelta: venerdì 27', 'Date chosen: Friday 27'));
      const ev = el('i', { class: 'sos-ev st', style: '--e:#1f56d1' }); days[26 > days.length ? days.length - 1 : 26].append(ev);
      body.append(grid, toast); steps.push(on(toast), on(ev));
    } else if (kind === 'tasks') {
      bar.append(el('em', {}, T('Oggi', 'Today')));
      const items = [[T('Rispondere a Giulia', 'Reply to Giulia'), T('ieri', 'yesterday'), true], [T('Prenotare il dentista', 'Book the dentist'), '10:00'], [T('Bozza della relazione', 'Report draft'), '#' + T('lavoro', 'work')], [T('Spesa per la cena', 'Shopping for dinner'), '18:30'], [T('Chiamare la banca', 'Call the bank'), T('domani', 'tomorrow')]];
      const prog = el('sav-progress-bar', { value: '0', max: '100', label: T('Fatte oggi', 'Done today'), style: '--height: 6px' });
      const rows = items.map(([txt, when, late]) => el('div', { class: 'sos-task' }, el('span', { class: 'sos-ck', html: CK }), el('span', {}, txt), el('small', { class: late ? 'late' : '' }, when)));
      const fresh = el('div', { class: 'sos-task st' }, el('span', { class: 'sos-ck', html: CK }), el('span', {}, T('Regalo per Marco', 'Gift for Marco')), el('small', {}, '!' + T('alta', 'high')));
      body.append(...rows, fresh, prog);
      [0, 2, 1, 3].forEach((n, k) => steps.push((v) => { rows[n].classList.toggle('done', v); prog.setAttribute('value', String(v ? (k + 1) * 20 : k * 20)); }));
      steps.push(on(fresh));
    } else if (kind === 'schedules') {
      bar.append(el('em', {}, T('Cena di classe', 'Class dinner')));
      const dates = l ? [['Gio', '12'], ['Ven', '13'], ['Sab', '14'], ['Dom', '15']] : [['Thu', '12'], ['Fri', '13'], ['Sat', '14'], ['Sun', '15']];
      const people = [['Anna', '#e11d48'], ['Bruno', '#2563eb'], ['Carla', '#16a34a'], ['Dario', '#d97706']];
      const votes = [['y', 'n', 'y', 'y'], ['n', 'y', 'y', 'n'], ['y', 'y', 'y', 'n'], ['n', 'y', 'y', 'y']];
      const poll = el('div', { class: 'sos-poll' }, el('span'));
      const heads = dates.map(([d, n]) => el('div', { class: 'hd' }, d, el('small', {}, n)));
      poll.append(...heads);
      people.forEach(([nm, c], r) => { poll.append(el('div', { class: 'who' }, el('sav-avatar', { label: nm, size: 'sm' }), nm)); votes[r].forEach((v) => { const x = el('div', { class: 'sos-vote st pop ' + v }, v === 'y' ? '✓' : '–'); poll.append(x); steps.push(on(x)); }); });
      const done = el('div', { class: 'sos-toast st' }, CKspan(), T('Sabato 14: ci sono tutti', 'Saturday 14: everyone can'));
      body.append(poll, done);
      steps.push(on(heads[2], 'best'), on(done));
    } else if (kind === 'splits') {
      bar.append(el('em', {}, T('Viaggio a Lisbona', 'Lisbon trip')));
      const exp = [[T('Cena', 'Dinner'), 'Anna', '60 €'], ['Taxi', 'Bruno', '24 €'], [T('Museo', 'Museum'), 'Carla', '36 €']].map(([w, who, eur]) => el('div', { class: 'sos-exp st' }, el('span', {}, w, el('small', {}, '  · ' + who)), el('b', {}, eur)));
      const bal = el('div', { class: 'sos-bal st' }, ...[['Anna', 28, '+20 €'], ['Bruno', -22, '−16 €'], ['Carla', -6, '−4 €']].flatMap(([n, w, eur]) => [el('span', {}, n), el('div', { class: 'bar' }, el('i', { class: w < 0 ? 'neg' : '', style: `--w:${Math.abs(w)}` })), el('em', {}, eur)]));
      const pays = [['Bruno', 'Anna', '16 €'], ['Carla', 'Anna', '4 €']].map(([a, b, eur]) => el('div', { class: 'sos-pay st', html: '' }, a, el('span', { html: ARROW, style: 'margin:0;color:inherit' }), b + ' · ' + eur, el('span', {}, T('saldato', 'settled'))));
      body.append(...exp, bal, ...pays);
      exp.forEach((e) => steps.push(on(e)));
      steps.push(on(bal), on(pays[0]), on(pays[1]), on(win, 'settled'));
    } else if (kind === 'mail') {
      bar.append(el('em', {}, T('Posta in arrivo', 'Inbox')));
      const mails = [['Giulia', T('Le foto di sabato', 'Saturday’s photos'), 'Gmail', '#e11d48'], ['Aruba', T('Fattura di novembre', 'November invoice'), 'Aruba', '#d97706'], [T('Club di lettura', 'Book club'), T('Il libro del mese', 'Book of the month'), 'Outlook', '#16a34a'], ['Marco', T('Ci vediamo domani?', 'See you tomorrow?'), 'iCloud', '#2563eb']];
      const old = el('div', { class: 'sos-mail' }, el('sav-avatar', { label: 'SavCalendar', size: 'sm' }), el('div', {}, el('b', {}, 'SavCalendar'), el('small', {}, T('Promemoria: riunione alle 15', 'Reminder: meeting at 3 pm'))), el('sav-badge', { variant: 'neutral', appearance: 'soft', pill: '' }, 'Aruba'));
      const rows = mails.map(([who, subj, src, c]) => el('div', { class: 'sos-mail unread st' }, el('sav-avatar', { label: who, size: 'sm' }), el('div', {}, el('b', {}, who), el('small', {}, subj)), el('sav-badge', { variant: 'neutral', appearance: 'soft', pill: '' }, src)));
      body.append(...rows.slice().reverse(), old); // the newest on top
      rows.forEach((r) => steps.push(on(r)));
      steps.push((v) => rows[0].classList.toggle('unread', !v));
    } else if (kind === 'contacts') {
      bar.append(el('em', {}, T('Contatti doppi', 'Duplicates')));
      const card = (cls, lines, extra) => el('div', { class: 'sos-card ' + cls }, el('div', { class: 'nm' }, el('sav-avatar', { label: 'Anna Verdi', size: 'sm', variant: 'primary' }), 'Anna Verdi'), ...lines.map((x) => el('small', {}, x)), extra || null);
      const cards = el('div', { class: 'sos-cards' }, card('a', ['+39 347 000 1234', T('Compleanno: 3 maggio', 'Birthday: 3 May')]), card('b', ['anna@verdi.eu', 'Verdi Studio']),
        card('m', ['+39 347 000 1234', 'anna@verdi.eu', 'Verdi Studio · ' + T('3 maggio', '3 May')], el('span', { class: 'ok' }, T('Uniti, senza perdere nulla', 'Merged, nothing lost'))));
      const list = ['Bruno Neri', 'Carla Rossi', 'Dario Bianchi'].map((n, i) => el('div', { class: 'sos-mail st' }, el('sav-avatar', { label: n, size: 'sm' }), el('div', {}, el('b', {}, n), el('small', {}, ['vCard', 'CSV · Google', 'CSV · Outlook'][i]))));
      body.append(cards, ...list);
      steps.push(on(win, 'merged'), ...list.map((x) => on(x)));
    } else return null;
    function CKspan() { return el('span', { html: CK, style: 'display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#16a34a;color:#fff' }); }
    play(win, steps);
    return el('div', { class: 'sos', 'aria-hidden': 'true' }, win);
  }
  window.SavOffice = Object.assign(window.SavOffice || {}, { scene });
  const decorate = () => { for (const m of document.querySelectorAll('.landing main.lmain:not([data-so-land]), main.lmain:not([data-so-land])')) if (m.querySelector('.hero')) landing(m); };
  const watchPage = () => { decorate(); new MutationObserver(soon).observe(document.body, { childList: true, subtree: true }); };
  if (document.body) watchPage(); else addEventListener('DOMContentLoaded', watchPage);
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
    /**
     * SavDrive moved files to its trash (gone) or back: the documents of the apps linked to them in this browser go to
     * the trash of their app too, or come back from it. uids: the files of SavDrive (node.trash / node.restore say which).
     */
    async driveFiles(uids, gone) {
      const want = new Set(uids || []), csrf = {};
      const TRASH = {
        savdocuments: (k) => ['doc.' + (gone ? 'trash' : 'restore'), { doc: k }],
        savspreadsheets: (k) => ['doc.' + (gone ? 'trash' : 'restore'), { doc: k }],
        savbooks: (k) => ['doc.' + (gone ? 'trash' : 'restore'), { doc: k }],
        savpresentations: (k) => (k.startsWith('l') ? null : ['deck.' + (gone ? 'trash' : 'restore'), { d: k }]), // "l…": only in that browser
        savwhiteboard: (k) => ['wb.' + (gone ? 'trash' : 'restore'), { ids: [k] }],
        savnotes: (k) => ['nb.' + (gone ? 'trash' : 'restore'), { ids: [k] }],
        savdiagrams: (k) => ['dg.' + (gone ? 'trash' : 'restore'), { ids: [k] }],
      };
      for (const [key, v] of Object.entries(links())) {
        if (!want.has(v.id)) continue;
        const i = key.indexOf(':'), app = key.slice(0, i), call = TRASH[app]?.(key.slice(i + 1));
        if (!call) continue;
        try {
          const url = (r) => new URL(app + '/api/?r=' + r, root()).href;
          csrf[app] ??= await fetch(url('auth.me'), { credentials: 'same-origin', cache: 'no-store' }).then((r) => r.json()).then((d) => d.csrf || '').catch(() => '');
          if (!csrf[app]) continue; // not signed in to that app here
          await fetch(url(call[0]), { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf[app] }, body: JSON.stringify(call[1]) });
        } catch { /* the document stays: never in the way of SavDrive */ }
      }
    },
    /** for the search of actions */
    driveCommands() {
      if (!exp) return [];
      const l = it(), link = links()[linkKey()];
      return [{ label: 'SavDrive', items: [{ icon: 'so-cloud-up', label: link ? (l ? 'Salva in SavDrive' : 'Save in SavDrive') : (l ? 'Salva una copia in SavDrive' : 'Save a copy in SavDrive'), description: link?.name || '', keywords: 'drive cloud save salva', run: saveToDrive }] }];
    },
  });
  paintAll();

  // ---------------------------------------------------------------- without a connection
  // The service worker gives back the last answers of the API (../assets/savoffice/offline-sw.js) and says so: a note at the
  // bottom tells what is shown and, for the apps that edit offline, that the changes will leave later; when the network is
  // back, one press reloads what changed meanwhile. The four editors have their own notes. An app that queues its changes
  // offline says so with SavOffice.offlineEdit = true.
  const OWN = ['savdocuments', 'savspreadsheets', 'savbooks', 'savpresentations'];
  let off = null, wasOff = false;
  const WIFI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h.01"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.8"/><path d="M19 12.9a10 10 0 0 0-2-1.5"/><path d="M2 8.8a15 15 0 0 1 4.2-2.7"/><path d="M22 8.8a15 15 0 0 0-11.3-3.8"/><path d="m2 2 20 20"/></svg>';
  function offNote(state) {
    if (OWN.includes(appId)) return;
    const l = it();
    if (state === 'off') {
      wasOff = true;
      off ||= Object.assign(document.createElement('div'), { className: 'so-off', role: 'status' });
      off.className = 'so-off';
      off.innerHTML = WIFI + '<span></span>';
      off.querySelector('span').textContent = window.SavOffice?.offlineEdit
        ? (l ? 'Sei offline: vedi i dati dell’ultima visita, e le modifiche partiranno al ritorno della rete.' : 'You are offline: you see the data of your last visit, and changes will go out when the network is back.')
        : (l ? 'Sei offline: vedi i dati dell’ultima visita, in sola lettura.' : 'You are offline: you see the data of your last visit, read only.');
      if (!off.isConnected) document.body.append(off);
    } else if (state === 'on' && off?.isConnected && wasOff) {
      off.className = 'so-off on';
      off.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span></span><button type="button"></button>';
      off.querySelector('span').textContent = l ? 'Di nuovo online.' : 'Back online.';
      const b = off.querySelector('button');
      b.textContent = l ? 'Aggiorna' : 'Refresh';
      b.addEventListener('click', () => location.reload());
      setTimeout(() => { if (off?.classList.contains('on')) off.remove(); }, 12000);
    }
  }
  navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.savoffice === 'offline') offNote('off'); });
  addEventListener('offline', () => offNote('off'));
  addEventListener('online', () => offNote('on'));
  if (navigator.onLine === false) addEventListener('DOMContentLoaded', () => offNote('off'));

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
  // the other apps: as in the grid above (only the installed ones in SavOffice for Mac, none in an installed web app)
  const DESK = window.SavOfficeDesktop || null;
  const STANDALONE = !DESK && (['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].some((m) => matchMedia(`(display-mode: ${m})`).matches) || navigator.standalone === true);
  const reachable = (id) => (DESK ? DESK.installed.includes(id) : !STANDALONE);
  const it = () => (document.documentElement.lang || navigator.language || 'en').startsWith('it');
  const APPS = [['savbooks', 'SavBooks', 'Libri ed e-book', 'Books and e-books'], ['savcalendar', 'SavCalendar', 'Calendario', 'Calendar'], ['savcontacts', 'SavContacts', 'Contatti', 'Contacts'], ['savdiagrams', 'SavDiagrams', 'Diagrammi', 'Diagrams'], ['savdocuments', 'SavDocuments', 'Documenti', 'Documents'], ['savdrive', 'SavDrive', 'File e cartelle', 'Files and folders'],
    ['savforms', 'SavForms', 'Moduli e sondaggi', 'Forms and surveys'], ['savmail', 'SavMail', 'Posta', 'Email'], ['savnewsletters', 'SavNewsletters', 'Newsletter', 'Newsletters'], ['savnotes', 'SavNotes', 'Quaderni', 'Notebooks'],
    ['savphotos', 'SavPhotos', 'Foto e video', 'Photos and videos'], ['savpodcasts', 'SavPodcasts', 'Podcast', 'Podcasts'], ['savpresentations', 'SavPresentations', 'Presentazioni', 'Presentations'],
    ['savreads', 'SavReads', 'Da leggere e feed', 'Read later and feeds'], ['savschedules', 'SavSchedules', 'Sondaggi e posti', 'Polls and slots'], ['savsplits', 'SavSplits', 'Spese condivise', 'Shared expenses'], ['savspreadsheets', 'SavSpreadsheets', 'Fogli di calcolo', 'Spreadsheets'], ['savtasks', 'SavTasks', 'Attività', 'Tasks'], ['savwhiteboard', 'SavWhiteboard', 'Lavagna', 'Whiteboard']];
  const GRIP = '<circle cx="12" cy="5" r="1"/><circle cx="19" cy="5" r="1"/><circle cx="5" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="12" cy="19" r="1"/><circle cx="19" cy="19" r="1"/><circle cx="5" cy="19" r="1"/>';
  let groups = [], pal = null;
  const fns = new Map();
  /*
   * Words that mean the same thing, in Italian and English: an action is found by any of them ("link" finds "Condividi",
   * "scarica" finds "Download", "settings" finds "Impostazioni"). Each line is a group; an action whose name, description
   * or keywords hold a word of a group gets all the words of that group as keywords. The palettes of the editors too.
   */
  const SYN = [
    'condividi condivisione share sharing link collegamento url invita invite persone people accesso access pubblica publish',
    'link collegamento collegamenti url hyperlink indirizzo',
    'scarica download esporta export pdf docx pptx xlsx odt epub',
    'stampa print stampante printer pdf',
    'elimina delete cancella rimuovi remove cestino trash butta',
    'impostazioni settings opzioni options preferenze preferences configura',
    'impostazioni settings tema theme', // the theme and the language are in the settings of every app
    'impostazioni settings lingua language',
    'tema theme stile style aspetto appearance',
    'nuovo nuova new crea create aggiungi add',
    'inserisci insert aggiungi add',
    'cerca search trova find sostituisci replace',
    'tema theme aspetto appearance colori colors scuro dark chiaro light',
    'copia copy duplica duplicate clona clone',
    'rinomina rename',
    'immagine immagini image images foto photo photos picture',
    'tabella table tabelle tables',
    'grafico chart grafici charts diagramma diagram',
    'commenti commento comment comments',
    'note nota notes appunti',
    'versioni versione versions version cronologia history ripristina restore',
    'esci logout disconnetti signout',
    'accedi login signin',
    'aiuto help scorciatoie shortcuts tasti keys tastiera keyboard guida',
    'annulla undo',
    'ripeti redo',
    'presenta present presentazione slideshow proietta avvia',
    'importa import apri open carica upload',
    'cartella cartelle folder folders',
    'preferiti favorites favourite speciali starred stella star',
    'account profilo profile',
    'lingua language',
    'amministrazione admin amministratore',
    'video filmato movie',
    'elenco lista list puntato bullet',
    'pagina pagine page pages',
    'diapositiva diapositive slide slides',
    'carattere caratteri font fonts typeface',
    'archivio archivia archive',
    'spazio space quota memoria storage',
    'email mail posta messaggio messages',
    'calendario calendar evento event',
    'attivita task tasks todo',
    'home inizio principale',
    'novita changelog aggiornamenti updates',
    'esci chiudi close',
  ].map((g) => g.split(' '));
  const fold = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  /** The keywords an action gets from the groups above (plus its own). */
  function synonyms(text, own = '') {
    const words = new Set(fold(text + ' ' + own).split(/[^a-z0-9]+/).filter(Boolean)), add = new Set();
    for (const g of SYN) if (g.some((w) => words.has(w))) g.forEach((w) => add.add(w));
    return [own, ...add].filter(Boolean).join(' ');
  }
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
  /** A command that opens another app: its address, or its own window in SavOffice for Mac. */
  const appCommand = (l) => ([id, name, itx, en]) => ({ icon: 'grip', label: name, description: l ? itx : en, keywords: 'app savoffice', ...(DESK ? { run: () => DESK.open(id) } : { href: new URL(id + '/', base()).href }) });
  function fill() {
    fns.clear();
    const l = it(), cur = current(), list = [];
    const apps = { label: 'SavOffice', items: (window.SavOffice?.apps || APPS).filter((a) => a[0] !== cur && reachable(a[0])).map(appCommand(l)) };
    let n = 0;
    for (const g of [...(window.SavOffice?.driveCommands?.() || []), ...groups, ...pageCommands(), apps]) for (const c of (g?.items || []).filter(Boolean)) {
      const id = 'c' + n++;
      fns.set(id, c.run || (() => { if (c.href) location.href = c.href; }));
      list.push({ label: c.label, value: id, icon: c.icon || '', shortcut: c.shortcut || '', description: c.description || '', keywords: synonyms(c.label + ' ' + (c.description || ''), c.keywords || ''), group: g.label || '', disabled: !!c.disabled });
    }
    pal.commands = list;
  }
  /** What every page offers: the home of the app, and its search field when there is one. */
  function pageCommands() {
    const l = it(), cur = current(), app = (window.SavOffice?.apps || APPS).find((a) => a[0] === cur), items = [];
    if (app) items.push({ icon: 'home', label: l ? 'Home di ' + app[1] : app[1] + ' home', keywords: 'home inizio principale', href: new URL(cur + '/', base()).href });
    const field = [...document.querySelectorAll('sav-search, input[type="search"], sav-input[type="search"]')].find((x) => x.offsetParent !== null && !x.closest('sav-command, sav-dialog'));
    if (field) items.push({ icon: 'search', label: l ? 'Cerca in questa pagina' : 'Search this page', keywords: 'cerca search trova find', run: () => { field.focus(); field.shadowRoot?.querySelector('input')?.focus(); } });
    return items.length ? [{ label: l ? 'Questa pagina' : 'This page', items }] : [];
  }
  /** the palette of an editor (SavDocuments, SavPresentations), when there is one on the page */
  const own = () => [...document.querySelectorAll('sav-command')].find((x) => !('savoffice' in x.dataset));
  /**
   * The palette of an editor gets what the palette of SavOffice has: the synonyms on its actions, saving into SavDrive
   * and the other apps of the suite (each time it opens: the editor may change its actions).
   */
  function dress(o) {
    if (!o || o._soDressed) return;
    o._soDressed = true;
    const show = o.show.bind(o);
    o.show = (...a) => { extend(o); return show(...a); };
    o.addEventListener('sav-select', (e) => { const fn = fns.get(e.detail?.value); if (fn) setTimeout(() => { try { const r = fn(); if (r?.catch) r.catch((x) => console.error(x)); } catch (x) { console.error(x); } }, 60); });
  }
  function extend(o) {
    o.querySelectorAll('optgroup[data-savoffice]').forEach((g) => g.remove());
    for (const op of o.querySelectorAll('option')) {
      op.dataset.ownKeywords ??= op.dataset.keywords || '';
      op.dataset.keywords = synonyms(op.textContent + ' ' + (op.dataset.description || ''), op.dataset.ownKeywords);
    }
    const l = it(), cur = current();
    const add = (label, items) => {
      if (!items.length) return;
      const g = document.createElement('optgroup');
      g.label = label; g.dataset.savoffice = '';
      for (const c of items) {
        const op = document.createElement('option'), id = 'so' + fns.size + '-' + Math.random().toString(36).slice(2, 6);
        op.value = id; op.textContent = c.label;
        if (c.icon) op.dataset.icon = c.icon;
        if (c.description) op.dataset.description = c.description;
        if (c.href) op.dataset.href = c.href; else fns.set(id, c.run);
        op.dataset.keywords = synonyms(c.label + ' ' + (c.description || ''), c.keywords || '');
        g.append(op);
      }
      o.append(g);
    };
    for (const g of [...(window.SavOffice?.driveCommands?.() || []), ...pageCommands()]) add(g.label, g.items || []);
    add('SavOffice', (window.SavOffice?.apps || APPS).filter((a) => a[0] !== cur && reachable(a[0])).map(appCommand(l)));
  }
  // the palettes of the editors, as soon as they are on the page
  const seen = () => document.querySelectorAll('sav-command:not([data-savoffice])').forEach(dress);
  new MutationObserver(seen).observe(document.body || document.documentElement, { childList: true }); // they are added to <body>
  seen();
  function open() {
    if (!customElements.get('sav-command')) return;
    const o = own();
    if (o) { dress(o); return o.show(); }
    pal ||= build();
    fill();
    pal.show();
  }
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.repeat || e.altKey || e.shiftKey || !(IS_MAC ? e.metaKey : e.ctrlKey) || e.key.toLowerCase() !== 'j') return;
    e.preventDefault();
    if (pal?.open) return pal.hide();
    const o = own();
    if (o) { dress(o); if (!o.open) o.show(); return; }
    open();
  });
  // an editor whose palette opens with its own shortcut: dressed just before (this listener runs first)
  addEventListener('keydown', (e) => { if ((IS_MAC ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'j') { const o = own(); if (o) { dress(o); if (!o.open) extend(o); } } }, true);
  window.SavOffice = Object.assign(window.SavOffice || {}, {
    commands(list) { groups = (list || []).filter(Boolean); if (pal?.open) fill(); },
    palette: open,
    paletteKey: IS_MAC ? '⌘J' : 'Ctrl+J',
  });
})();
