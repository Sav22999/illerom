/*
 * SavOffice — the apps of the suite (SavDocuments, SavPresentations, SavSchedules, SavCalendar, SavTasks, SavWhiteboard, SavNotes, SavNewsletters) from inside each one:
 * <savoffice-apps current="savcalendar"></savoffice-apps> is a button with a grid that opens the list of the apps and the
 * page of SavOffice. Plain script, no build: it needs SavComponents (sav-button, sav-popover), which every app loads.
 * The apps live in folders next to each other (../savdocuments/ …): the links are relative, so it works anywhere.
 */
(() => {
  if (customElements.get('savoffice-apps')) return;
  const APPS = [
    ['savdocuments', 'SavDocuments', 'Documenti', 'Documents'],
    ['savpresentations', 'SavPresentations', 'Presentazioni', 'Presentations'],
    ['savschedules', 'SavSchedules', 'Sondaggi e posti', 'Polls and slots'],
    ['savcalendar', 'SavCalendar', 'Calendario', 'Calendar'],
    ['savtasks', 'SavTasks', 'Attività', 'Tasks'],
    ['savforms', 'SavForms', 'Moduli e sondaggi', 'Forms and surveys'],
    ['savwhiteboard', 'SavWhiteboard', 'Lavagna', 'Whiteboard'],
    ['savnotes', 'SavNotes', 'Quaderni', 'Notebooks'],
    ['savnewsletters', 'SavNewsletters', 'Newsletter', 'Newsletters'],
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
    }
  }
  customElements.define('savoffice-apps', SavOfficeApps);
})();
