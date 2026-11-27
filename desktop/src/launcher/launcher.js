/*
 * SavOffice for Mac — the window of the Toolbox: the apps to install, open, update and remove, and the settings.
 * Everything it does is asked to main.js through window.savoffice (preload.js); the state comes back at every change.
 * Controls are SavComponents (sav/sav.js, a copy of ../../../assets/sav/ made by tools/prepare.js).
 */

const api = window.savoffice;

/* ------------------------------------------------------------------ words */

const WORDS = {
  it: {
    search: 'Cerca un’app', all: 'Tutte le app', installed: 'Installate', updates: 'Aggiornamenti', settings: 'Impostazioni', places: 'Luoghi',
    all_h: 'Le app di SavOffice', all_p: 'Installa quelle che usi: si aprono in una finestra loro, funzionano anche senza connessione e, quando torna la rete, sincronizzano tutto.',
    inst_h: 'Installate su questo Mac', inst_p: 'Si aprono anche offline. Quello che fai senza connessione resta sul Mac e parte appena torna la rete.',
    upd_h: 'Aggiornamenti', upd_auto: 'L’aggiornamento automatico è attivo: le app chiuse si aggiornano da sole, quelle aperte aspettano che le chiudi, così non perdi il lavoro.',
    upd_manual: 'L’aggiornamento automatico è spento: premi Aggiorna quando vuoi. Si può accendere nelle impostazioni.',
    none_inst: 'Nessuna app installata', none_inst_t: 'Scegli le app da installare tra tutte quelle di SavOffice.', see_all: 'Vedi tutte le app',
    uptodate: 'Tutto aggiornato', uptodate_t: 'Le app installate hanno la versione più recente.', none_found: 'Nessuna app trovata',
    install: 'Installa', open: 'Apri', update: 'Aggiorna', update_all: 'Aggiorna tutte', more: 'Altro', remove: 'Rimuovi', reinstall: 'Reinstalla', browser: 'Apri nel browser',
    installing: 'Installazione…', downloading: 'Download dell’aggiornamento…', removing: 'Rimozione…',
    is_open: 'Aperta', version: 'Versione {v}', build: 'build {n}', latest: 'aggiornata', new_v: 'Nuova versione: {v}', new_any: 'C’è una versione nuova',
    on_close: 'Pronta: si aggiorna quando chiudi l’app', ready: 'Aggiornamento scaricato', err: 'Non è riuscito: {e}',
    off_edit: 'Offline: modifichi tutto', off_queue: 'Offline: le modifiche aspettano la rete', off_read: 'Offline: in sola lettura', off_online: 'Solo online',
    off_edit_t: 'Senza connessione crei e modifichi come sempre; le modifiche partono appena torna la rete.',
    off_queue_t: 'Senza connessione vedi tutto e fai modifiche, che partono appena torna la rete.',
    off_read_t: 'Senza connessione vedi quello che avevi già aperto; per le modifiche serve la rete.',
    off_online_t: 'La posta non viene mai salvata sui dispositivi: serve la connessione.',
    invite: 'Su invito',
    offline: 'Offline', offline_note: 'Sei senza connessione: le app installate funzionano lo stesso. Gli aggiornamenti e le installazioni aspettano la rete.',
    need_net: 'Serve la connessione per installare',
    check: 'Controlla aggiornamenti', checking: 'Controllo…', last: 'Ultimo controllo: {t}', never: 'mai',
    space: 'Sul Mac', space_t: '{s} per {n} app', space_none: 'Ancora nessuna app installata', space_more: 'Le app installate funzionano anche senza connessione.',
    remove_q: 'Rimuovere {app}?', remove_t: 'Si toglie la copia di {app} installata su questo Mac ({s}). Quello che hai nel tuo account resta dov’è, come le copie per l’uso offline e le modifiche non ancora inviate: partono alla prossima apertura, anche dal browser.',
    open_q: '{app} è aperta', open_t: 'Per aggiornarla bisogna ricaricare la finestra, e quello che non è ancora salvato potrebbe andare perso. Puoi aggiornarla quando la chiudi.',
    when_close: 'Quando la chiudo', now: 'Aggiorna e ricarica', cancel: 'Annulla',
    done_install: '{app} è installata', done_update: '{app} è aggiornata', done_close: '{app} si aggiornerà quando la chiudi', done_remove: '{app} è stata rimossa',
    s_upd: 'Aggiornamenti', s_upd_p: 'Le app si aggiornano dal sito di SavOffice: niente da scaricare a mano.',
    auto: 'Aggiornamento automatico', auto_t: 'Le app chiuse si aggiornano da sole. Quelle aperte aspettano che tu le chiuda, così non perdi il lavoro.',
    every: 'Controlla ogni', every_t: 'E ogni volta che torna la connessione.', h1: 'ora', h6: '6 ore', h24: 'giorno', h168: 'settimana', check_now: 'Controlla ora',
    s_mac: 'Su questo Mac', icons: 'Icone in Applicazioni', icons_t: 'Ogni app installata ha la sua icona in Applicazioni › SavOffice: la trovi con Spotlight e in Launchpad, e puoi tenerla nel Dock.', show_finder: 'Mostra nel Finder',
    look: 'Stile', look_t: 'L’aspetto dei pulsanti, delle schede e dei menu, nel Toolbox e nelle app installate su questo Mac. Il sito non cambia.', st_soft: 'Soft', st_tilt: 'Tilt', st_glass: 'Glass',
    separate: 'Ogni app è un’app a sé', separate_t: 'Ognuna con la sua icona nel Dock, in ⌘Tab e nella barra dei menu; le trovi anche in Applicazioni › SavOffice, con Spotlight e in Launchpad. Spento: le app si aprono come finestre di SavOffice.',
    lang: 'Lingua', lang_t: 'Del Toolbox. Le app usano la lingua scelta nel loro account, o quella del Mac.', lang_auto: 'Come il Mac',
    s_off: 'Offline e sincronizzazione', s_off_p: 'Cosa fa ogni app senza connessione. Quando la rete torna, tutto quello che hai fatto parte da solo.',
    off_l_edit: 'Si crea e si modifica tutto', off_l_queue: 'Le modifiche aspettano la rete', off_l_read: 'Si legge quello già aperto', off_l_online: 'Solo online',
    signin: 'Accedi', signup: 'Crea un account', signout: 'Esci', account: 'Account',
    acc_h: 'Un account per tutte le app', acc_p: 'Accedi una volta sola, con email e password o con SavAccount: sei dentro in tutte le app di SavOffice, anche in quelle che installerai dopo.',
    acc_in: 'Hai fatto l’accesso come {name}', acc_in_t: '{email} · lo stesso account in tutte le app di SavOffice.',
    acc_out: 'Non hai fatto l’accesso', acc_out_t: 'Un solo account per tutte le app: accedi qui, o in una qualsiasi app, e vale per tutte.',
    out_q: 'Uscire da SavOffice?', out_t: 'Esci da tutte le app di SavOffice su questo Mac. Le copie per l’uso senza connessione e le modifiche non ancora inviate vengono cancellate, come quando esci dal sito.',
    done_out: 'Sei uscito da tutte le app',
    s_about: 'Informazioni', about_v: 'SavOffice per Mac {v}', about_t: 'Le app sono quelle di illerom.eu: lo stesso account, gli stessi documenti, sempre sincronizzati.', site: 'SavOffice sul web', source: 'Codice sorgente',
  },
  en: {
    search: 'Search an app', all: 'All apps', installed: 'Installed', updates: 'Updates', settings: 'Settings', places: 'Places',
    all_h: 'The apps of SavOffice', all_p: 'Install the ones you use: each opens in its own window, works without a connection too and syncs everything when the network is back.',
    inst_h: 'Installed on this Mac', inst_p: 'They open offline too. What you do without a connection stays on the Mac and goes out as soon as the network is back.',
    upd_h: 'Updates', upd_auto: 'Automatic updates are on: closed apps update by themselves, open ones wait until you close them, so you never lose work.',
    upd_manual: 'Automatic updates are off: press Update whenever you like. You can turn them on in the settings.',
    none_inst: 'No app installed', none_inst_t: 'Choose the apps to install among all the apps of SavOffice.', see_all: 'See all apps',
    uptodate: 'All up to date', uptodate_t: 'The installed apps have the latest version.', none_found: 'No app found',
    install: 'Install', open: 'Open', update: 'Update', update_all: 'Update all', more: 'More', remove: 'Remove', reinstall: 'Reinstall', browser: 'Open in the browser',
    installing: 'Installing…', downloading: 'Downloading the update…', removing: 'Removing…',
    is_open: 'Open', version: 'Version {v}', build: 'build {n}', latest: 'up to date', new_v: 'New version: {v}', new_any: 'A new version is out',
    on_close: 'Ready: it updates when you close the app', ready: 'Update downloaded', err: 'It did not work: {e}',
    off_edit: 'Offline: full editing', off_queue: 'Offline: changes wait for the network', off_read: 'Offline: read only', off_online: 'Online only',
    off_edit_t: 'Without a connection you create and edit as always; the changes go out as soon as the network is back.',
    off_queue_t: 'Without a connection you see everything and make changes, which go out as soon as the network is back.',
    off_read_t: 'Without a connection you see what you had already opened; changes need the network.',
    off_online_t: 'Mail is never written on devices: it needs the connection.',
    invite: 'By invitation',
    offline: 'Offline', offline_note: 'You are offline: the installed apps work all the same. Updates and installs wait for the network.',
    need_net: 'Installing needs the connection',
    check: 'Check for updates', checking: 'Checking…', last: 'Last check: {t}', never: 'never',
    space: 'On the Mac', space_t: '{s} for {n} apps', space_none: 'No app installed yet', space_more: 'Installed apps work without a connection too.',
    remove_q: 'Remove {app}?', remove_t: 'The copy of {app} installed on this Mac goes ({s}). What is in your account stays where it is, and so do the offline copies and the changes not sent yet: they go out the next time it opens, from the browser too.',
    open_q: '{app} is open', open_t: 'To update it the window has to reload, and what is not saved yet could be lost. You can update it when you close it.',
    when_close: 'When I close it', now: 'Update and reload', cancel: 'Cancel',
    done_install: '{app} is installed', done_update: '{app} is up to date', done_close: '{app} will update when you close it', done_remove: '{app} was removed',
    s_upd: 'Updates', s_upd_p: 'The apps update from the SavOffice site: nothing to download by hand.',
    auto: 'Automatic updates', auto_t: 'Closed apps update by themselves. Open ones wait until you close them, so you never lose work.',
    every: 'Check every', every_t: 'And every time the connection comes back.', h1: 'hour', h6: '6 hours', h24: 'day', h168: 'week', check_now: 'Check now',
    s_mac: 'On this Mac', icons: 'Icons in Applications', icons_t: 'Every installed app has its own icon in Applications › SavOffice: Spotlight and Launchpad find it, and you can keep it in the Dock.', show_finder: 'Show in Finder',
    look: 'Style', look_t: 'The look of the buttons, cards and menus, in the Toolbox and in the apps installed on this Mac. The site stays as it is.', st_soft: 'Soft', st_tilt: 'Tilt', st_glass: 'Glass',
    separate: 'Every app is an app of its own', separate_t: 'Each with its own icon in the Dock, in ⌘Tab and in the menu bar; you also find them in Applications › SavOffice, with Spotlight and in Launchpad. Off: the apps open as windows of SavOffice.',
    lang: 'Language', lang_t: 'Of the Toolbox. The apps use the language chosen in their account, or the one of the Mac.', lang_auto: 'As the Mac',
    s_off: 'Offline and sync', s_off_p: 'What each app does without a connection. When the network is back, everything you did goes out by itself.',
    off_l_edit: 'Create and edit everything', off_l_queue: 'Changes wait for the network', off_l_read: 'Read what was already open', off_l_online: 'Online only',
    signin: 'Sign in', signup: 'Create an account', signout: 'Sign out', account: 'Account',
    acc_h: 'One account for all the apps', acc_p: 'Sign in once, with email and password or with SavAccount: you are in every app of SavOffice, also the ones you install later.',
    acc_in: 'Signed in as {name}', acc_in_t: '{email} · the same account in every app of SavOffice.',
    acc_out: 'You are not signed in', acc_out_t: 'One account for all the apps: sign in here, or in any app, and it works for all of them.',
    out_q: 'Sign out of SavOffice?', out_t: 'You sign out of every app of SavOffice on this Mac. The copies for working without a connection and the changes not sent yet are deleted, as when you sign out on the site.',
    done_out: 'You signed out of every app',
    s_about: 'About', about_v: 'SavOffice for Mac {v}', about_t: 'The apps are the ones of illerom.eu: the same account, the same documents, always in sync.', site: 'SavOffice on the web', source: 'Source code',
  },
};
let S = null; // the last state from main.js
const L = () => (S?.lang === 'it' ? 'it' : 'en');
const t = (k, vars = {}) => (WORDS[L()][k] ?? k).replace(/\{(\w+)\}/g, (m, v) => vars[v] ?? m);

/* ------------------------------------------------------------------ helpers (as ../../../savdrive/assets/ui.js) */

function h(sel, ...kids) {
  const [tag, ...cls] = sel.split('.');
  const n = document.createElement(tag || 'div');
  if (cls.length) n.className = cls.join(' ');
  if (kids[0] && typeof kids[0] === 'object' && !(kids[0] instanceof Node) && !Array.isArray(kids[0])) {
    for (const [k, v] of Object.entries(kids.shift())) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'class') n.className += ' ' + v;
      else n.setAttribute(k, v === true ? '' : v);
    }
  }
  n.append(...kids.flat(5).filter((x) => x !== null && x !== undefined && x !== false));
  return n;
}
const put = (box, ...kids) => { box.replaceChildren(...kids.flat(5).filter((x) => x !== null && x !== undefined && x !== false)); return box; };
const icon = (name, attrs = {}) => h('sav-icon', { name, ...attrs });
const toast = (msg, variant = 'primary') => window.Sav?.toast?.(msg, { variant, placement: 'bottom-end', duration: 3500 });
const fail = (e) => toast(t('err', { e: String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }), 'danger');

function btn(label, o = {}) {
  const { onclick, variant = 'neutral', appearance = 'outline', size = 'sm', ...rest } = o;
  const b = h('sav-button', { variant, appearance, size, ...rest }, label);
  if (onclick) b.addEventListener('click', async (e) => { if (b.loading) return; const r = onclick(e, b); if (r?.then) { b.loading = true; try { await r; } catch (x) { fail(x); } finally { b.loading = false; } } });
  return b;
}
function iconBtn(name, label, onclick, o = {}) {
  const b = h('sav-button', { icon: name, label, appearance: 'ghost', variant: 'neutral', square: true, size: 'sm', ...o });
  if (onclick) b.addEventListener('click', () => { const r = onclick(b); if (r?.catch) r.catch(fail); });
  return h('sav-tooltip', { content: label, placement: 'bottom', delay: 350 }, b);
}
/** A menu of a button: items [icon, label, run, {danger}] | '-' */
function drop(trigger, items, label) {
  trigger.slot = 'trigger';
  const list = items.filter(Boolean);
  const d = h('sav-dropdown', { placement: 'bottom-end', label }, trigger);
  list.forEach((i, n) => d.append(i === '-' ? h('sav-divider') : h('sav-menu-item', { value: String(n), variant: i[3]?.danger ? 'danger' : null }, icon(i[0], { slot: 'prefix' }), i[1])));
  d.addEventListener('sav-select', (e) => { const i = list[+e.detail.value]; if (i?.[2]) setTimeout(() => { const r = i[2](); if (r?.catch) r.catch(fail); }, 20); });
  return d;
}
/** dialog({title, body, actions: [{label, primary, danger, run}]}) */
function dialog({ title, body, actions = [], onclose }) {
  const d = h('sav-dialog', { label: title, style: '--width:min(30rem, calc(100vw - 2rem))', 'sheet-on-mobile': true });
  d.append(...[body].flat().filter(Boolean));
  for (const a of actions) {
    const b = h('sav-button', { slot: 'footer', variant: a.danger ? 'danger' : a.primary ? 'primary' : 'neutral', appearance: a.primary || a.danger ? 'solid' : 'outline' }, a.label);
    b.addEventListener('click', async () => { if (b.loading) return; b.loading = true; try { if ((await a.run?.()) !== false) d.hide(); } catch (e) { fail(e); } finally { b.loading = false; } });
    d.append(b);
  }
  document.body.append(d);
  d.addEventListener('sav-after-hide', (e) => { if (e.target !== d) return; d.remove(); onclose?.(); });
  customElements.whenDefined('sav-dialog').then(() => d.show());
  return d;
}
function select(label, options, value, onchange) {
  const s = h('sav-select', { 'aria-label': label, value: String(value), size: 'sm' }, options.map(([v, l]) => h('option', { value: String(v) }, l)));
  s.addEventListener('change', () => onchange(s.value));
  return s;
}
function toggle(label, checked, onchange) {
  const s = h('sav-switch', { checked: !!checked, 'aria-label': label });
  s.addEventListener('change', () => onchange(s.checked));
  return s;
}
function bytes(n) {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = +n || 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toLocaleString(L(), { maximumFractionDigits: v < 10 && i ? 1 : 0 })} ${u[i]}`;
}
function ago(ms) {
  if (!ms) return t('never');
  const rtf = new Intl.RelativeTimeFormat(L(), { numeric: 'auto' });
  const s = Math.round((ms - Date.now()) / 1000);
  for (const [u, n] of [['day', 86400], ['hour', 3600], ['minute', 60]]) if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), u);
  return rtf.format(0, 'second');
}
const info = (slug) => S.catalog.find((a) => a.slug === slug);
const words = (a) => a[L()];
const ver = (v) => (v ? (v.version ? t('version', { v: v.version }) + (v.cache ? ` (${String(v.cache).split('-').pop()})` : '') : t('build', { n: String(v.cache || '').split('-').pop() || '?' })) : '');
const OFF_ICON = { edit: 'edit', queue: 'clock', read: 'eye', online: 'globe' };

/* ------------------------------------------------------------------ actions */

const act = {
  async install(slug) {
    await api.install(slug);
    toast(t('done_install', { app: info(slug).name }), 'success');
  },
  open: (slug) => api.open(slug),
  async update(slug) {
    const r = await api.update(slug);
    if (r?.open) {
      const name = info(slug).name;
      dialog({ title: t('open_q', { app: name }), body: h('p', t('open_t')),
        actions: [{ label: t('cancel') }, { label: t('now'), run: async () => { await api.update(slug, 'now'); toast(t('done_update', { app: name }), 'success'); } },
          { label: t('when_close'), primary: true, run: async () => { await api.update(slug, 'close'); toast(t('done_close', { app: name })); } }] });
      return;
    }
    toast(t('done_update', { app: info(slug).name }), 'success');
  },
  remove(slug) {
    const a = S.apps.find((x) => x.slug === slug);
    const name = info(slug).name;
    dialog({ title: t('remove_q', { app: name }), body: h('p', t('remove_t', { app: name, s: bytes(a.size) })),
      actions: [{ label: t('cancel') }, { label: t('remove'), danger: true, run: async () => { await api.remove(slug); toast(t('done_remove', { app: name })); } }] });
  },
  reinstall: (slug) => api.reinstall(slug),
  signin: () => api.signin('signin'),
  signup: () => api.signin('signup'),
  signout() {
    dialog({ title: t('out_q'), body: h('p', t('out_t')),
      actions: [{ label: t('cancel') }, { label: t('signout'), danger: true, run: async () => { await api.signout(); toast(t('done_out')); } }] });
  },
  browser: (slug) => api.browser(slug),
};

/* ------------------------------------------------------------------ the screen */

const root = document.getElementById('root');
let view = 'all';
let query = '';
const cards = new Map(); // slug → { el, sig }
let ui = null; // the parts drawn once: { nav, bnav, main, quota, offb, checkBtn, newb }

function card(a) {
  const c = info(a.slug), w = words(c);
  const off = h('sav-tooltip', { content: t('off_' + c.offline + '_t'), placement: 'top', delay: 300 },
    h('sav-badge', { appearance: 'soft', variant: c.offline === 'edit' ? 'success' : c.offline === 'online' ? 'neutral' : 'primary', pill: true }, icon(OFF_ICON[c.offline]), ' ', t('off_' + c.offline)));
  const state = [];
  if (a.busy) {
    state.push(h('sav-progress-bar', { value: Math.round((a.progress || 0) * 100), max: 100, size: 'sm', 'aria-label': t(a.busy) }), h('small.muted', `${t(a.busy)} ${Math.round((a.progress || 0) * 100)}%`));
  } else if (a.error) {
    state.push(h('small.err', t('err', { e: a.error })));
  } else if (a.installed && a.update) {
    const waiting = a.staged && a.open && (S.settings.autoUpdate || a.applyOnClose);
    const v = a.staged || a.remote;
    state.push(h('div.upd' + (waiting ? '.wait' : ''), icon(waiting ? 'clock' : 'arrow-up'), waiting ? t('on_close') : v?.version ? t('new_v', { v: v.version }) : t('new_any')));
  }
  const actions = [];
  if (!a.installed) {
    actions.push(btn(t('install'), { variant: 'primary', appearance: 'solid', icon: 'download', disabled: !S.online || !!a.busy, title: S.online ? null : t('need_net'), onclick: () => act.install(a.slug) }));
  } else {
    actions.push(btn(t('open'), { variant: 'primary', appearance: 'solid', disabled: !!a.busy, onclick: () => act.open(a.slug) }));
    if (a.update && !(a.staged && a.open && (S.settings.autoUpdate || a.applyOnClose))) actions.push(btn(t('update'), { icon: 'refresh', disabled: !!a.busy || (!S.online && !a.staged), onclick: () => act.update(a.slug) }));
  }
  actions.push(h('div.grow'));
  actions.push(drop(h('sav-button', { icon: 'more-vertical', label: t('more'), appearance: 'ghost', variant: 'neutral', square: true, size: 'sm' }), [
    a.installed && ['external', t('browser'), () => act.browser(a.slug)],
    !a.installed && ['external', t('browser'), () => act.browser(a.slug)],
    a.installed && S.online && ['refresh', t('reinstall'), () => act.reinstall(a.slug)],
    a.installed && '-',
    a.installed && ['trash', t('remove'), () => act.remove(a.slug), { danger: true }],
  ], t('more')));

  return h('sav-card.acard', { appearance: 'outlined', style: `--c:${c.color}` }, h('div.ain',
    h('div.ahead', h('img.aicon', { src: `icons/${c.slug}.svg`, alt: '' }), h('div.aname', h('b', c.name), h('small', w.short))),
    h('p.atag', w.tag),
    h('div.ameta', off, c.invite ? h('sav-badge', { appearance: 'soft', variant: 'warning', pill: true }, t('invite')) : null,
      a.installed ? h('span.ver', ver(a.installed) + (a.update ? '' : ' · ' + t('latest'))) : null,
      a.open ? h('span', h('i.dot'), ' ', t('is_open')) : null),
    state.length ? h('div.astate', state) : null,
    h('div.aact', actions)));
}

function visible() {
  const q = query.trim().toLowerCase();
  return S.apps.filter((a) => {
    if (view === 'installed' && !a.installed) return false;
    if (view === 'updates' && !(a.installed && a.update)) return false;
    if (!q) return true;
    const c = info(a.slug), w = words(c);
    return [c.name, w.short, w.tag, c.slug].join(' ').toLowerCase().includes(q);
  });
}

function drawMain() {
  if (!ui) return;
  if (view === 'settings') { put(ui.main, settingsView()); return; }
  const head = { all: [t('all_h'), t('all_p')], installed: [t('inst_h'), t('inst_p')], updates: [t('upd_h'), S.settings.autoUpdate ? t('upd_auto') : t('upd_manual')] }[view];
  const list = visible();
  let body;
  if (!list.length) {
    body = query ? h('sav-empty-state', { icon: 'search', heading: t('none_found') })
      : view === 'installed' ? h('sav-empty-state', { icon: 'download', heading: t('none_inst'), text: t('none_inst_t') }, btn(t('see_all'), { onclick: () => go('all') }))
        : h('sav-empty-state', { icon: 'check-circle', heading: t('uptodate'), text: t('uptodate_t') });
  } else {
    body = h('div.grid', list.map((a) => {
      const sig = JSON.stringify([a, S.online, S.lang, S.settings.autoUpdate]);
      let k = cards.get(a.slug);
      if (!k || k.sig !== sig) { k = { el: card(a), sig }; cards.set(a.slug, k); }
      return k.el;
    }));
  }
  const grid = ui.main.querySelector('.grid');
  // only the cards change while something downloads: the open menus of the others stay open
  const key = view + '|' + query + '|' + S.online + '|' + !!S.account + '|' + S.accountKnown;
  if (grid && body.classList?.contains('grid') && ui.main.dataset.view === key) put(grid, [...body.children]);
  else put(ui.main, h('div.dhead', h('h1', head[0]), h('p', head[1])), S.online ? null : h('sav-alert.offnote', { variant: 'warning', icon: 'cloud' }, t('offline_note')),
    !S.account && S.accountKnown && S.online && view !== 'updates' ? h('sav-alert.offnote.accnote', { variant: 'primary', icon: 'user' }, h('b', t('acc_h')), h('p', t('acc_p')),
      h('div.accbtns', btn(t('signin'), { variant: 'primary', appearance: 'solid', icon: 'log-in', onclick: () => act.signin() }), btn(t('signup'), { icon: 'user-plus', onclick: () => act.signup() }))) : null,
    body);
  ui.main.dataset.view = key;
}

function settingsView() {
  const st = S.settings;
  const row = (label, help, ...control) => h('div.orow', h('div.orow-t', h('b', label), help ? h('small', help) : null), control.length ? h('div.orow-c', control) : null);
  const section = (title, text, ...rows) => h('div.osec', h('h2', title), text ? h('p', text) : null, h('sav-card.ocard', { appearance: 'outlined' }, h('div.orows', rows.filter(Boolean))));
  const set = (patch) => api.settings(patch).catch(fail);
  const byLevel = (lv) => S.catalog.filter((c) => c.offline === lv).map((c) => c.name).join(', ');
  return [
    h('div.dhead', h('h1', t('settings'))),
    section(t('account'), null, S.account
      ? row(t('acc_in', { name: S.account.name }), t('acc_in_t', { email: S.account.email }), btn(t('signout'), { icon: 'log-out', onclick: () => act.signout() }))
      : row(t('acc_out'), t('acc_out_t'), btn(t('signin'), { variant: 'primary', appearance: 'solid', disabled: !S.online, onclick: () => act.signin() }), btn(t('signup'), { disabled: !S.online, onclick: () => act.signup() }))),
    section(t('s_upd'), t('s_upd_p'),
      row(t('auto'), t('auto_t'), toggle(t('auto'), st.autoUpdate, (v) => set({ autoUpdate: v }))),
      row(t('every'), t('every_t'), select(t('every'), [[1, t('h1')], [6, t('h6')], [24, t('h24')], [168, t('h168')]], st.checkHours, (v) => set({ checkHours: +v }))),
      row(S.checking ? t('checking') : t('last', { t: ago(S.lastCheck) }), null, btn(t('check_now'), { icon: 'refresh', disabled: !S.online || S.checking, onclick: () => api.check() }))),
    section(t('s_mac'), null,
      row(t('look'), t('look_t'), select(t('look'), [['soft', t('st_soft')], ['tilt', t('st_tilt')], ['glass', t('st_glass')]], st.style || 'soft', (v) => set({ style: v }))),
      S.separateSupported
        ? row(t('separate'), t('separate_t'), toggle(t('separate'), st.separate !== false, (v) => set({ separate: v })), S.apps.some((a) => a.installed) ? btn(t('show_finder'), { onclick: () => api.reveal() }) : null)
        : row(t('icons'), t('icons_t'), toggle(t('icons'), st.shortcuts, (v) => set({ shortcuts: v })), st.shortcuts && S.apps.some((a) => a.installed) ? btn(t('show_finder'), { onclick: () => api.reveal() }) : null),
      row(t('lang'), t('lang_t'), select(t('lang'), [['auto', t('lang_auto')], ['it', 'Italiano'], ['en', 'English']], st.lang, (v) => set({ lang: v })))),
    section(t('s_off'), t('s_off_p'),
      h('div.orow', h('div.orow-t', h('ul.olist', ['edit', 'queue', 'read', 'online'].map((lv) => h('li', h('b', t('off_l_' + lv)), ': ', byLevel(lv))))))),
    section(t('s_about'), null,
      row(t('about_v', { v: S.version }), t('about_t'), btn(t('site'), { onclick: () => api.external('https://www.illerom.eu/savoffice/') }), btn(t('source'), { onclick: () => api.external('https://github.com/Sav22999/illerom/tree/main/desktop') }))),
  ];
}

/** The parts that change with the state but are drawn once: counts, space, offline, the check button. */
function drawChrome() {
  const inst = S.apps.filter((a) => a.installed), upd = inst.filter((a) => a.update);
  const count = (v) => ({ all: S.apps.length, installed: inst.length, updates: upd.length }[v]);
  for (const v of ['all', 'installed', 'updates']) {
    const el = ui.nav.querySelector(`sav-menu-item[value="${v}"] .cnt`);
    if (el) { el.textContent = count(v) || ''; el.classList.toggle('hot', v === 'updates' && upd.length > 0); }
  }
  const ready = upd.filter((a) => !a.open && !a.busy);
  ui.newb.hidden = ready.length < 2;
  ui.newb.textContent = `${t('update_all')} (${ready.length})`;
  const size = inst.reduce((s, a) => s + a.size, 0);
  put(ui.quota, h('div.qhead', icon('database'), h('b', t('space'))), h('span', inst.length ? t('space_t', { s: bytes(size), n: inst.length }) : t('space_none')), h('small', t('space_more')));
  ui.offb.hidden = S.online;
  // who is signed in: the avatar with its menu, or Sign in
  const sig = JSON.stringify([S.account, S.online, S.lang]);
  if (ui.acct.dataset.sig !== sig) {
    ui.acct.dataset.sig = sig;
    put(ui.acct, S.account
      ? drop(h('sav-button.accb', { appearance: 'ghost', variant: 'neutral', size: 'sm', label: S.account.name },
        h('sav-avatar', { label: S.account.name, image: S.account.picture || null, style: '--sav-avatar-size:28px' })), [
        ['user', S.account.email, null], '-', ['settings', t('settings'), () => go('settings')], ['log-out', t('signout'), () => act.signout(), { danger: true }]], t('account'))
      : btn(t('signin'), { variant: 'primary', appearance: 'solid', icon: 'log-in', disabled: !S.online, onclick: () => act.signin() }));
  }
  ui.check.button.loading = !!S.checking;
  ui.check.button.disabled = !S.online;
  ui.check.setAttribute('content', S.checking ? t('checking') : `${t('check')} · ${t('last', { t: ago(S.lastCheck) })}`);
}

function go(v) {
  view = v;
  location.hash = v;
  ui.nav.querySelectorAll('sav-menu-item').forEach((i) => i.toggleAttribute('current', i.getAttribute('value') === v));
  ui.bnav.querySelectorAll('sav-bottom-nav-item').forEach((i) => i.toggleAttribute('current', i.getAttribute('value') === v));
  drawMain();
  window.scrollTo(0, 0);
}

function drawAll() {
  document.documentElement.lang = L();
  cards.clear();
  const places = [['all', 'grid', t('all')], ['installed', 'check-circle', t('installed')], ['updates', 'refresh', t('updates')], ['settings', 'settings', t('settings')]];
  const nav = h('sav-menu', { label: t('places'), selectable: true }, places.map(([v, ic, l]) => h('sav-menu-item', { value: v, current: v === view }, icon(ic, { slot: 'prefix' }), l, v === 'settings' ? null : h('span.cnt', { slot: 'suffix' }))));
  nav.addEventListener('sav-select', (e) => go(e.detail.value));
  const bnav = h('sav-bottom-nav.bnav', { label: t('places'), fixed: true }, places.map(([v, ic, l]) => h('sav-bottom-nav-item', { icon: ic, label: l, value: v, current: v === view })));
  bnav.addEventListener('sav-select', (e) => go(e.detail.value));
  const search = h('sav-input.hsearch', { type: 'search', placeholder: t('search'), 'aria-label': t('search'), pill: true, clearable: true, size: 'sm', value: query }, icon('search', { slot: 'prefix' }));
  search.addEventListener('input', () => { query = search.value || ''; if (view === 'settings') go('all'); else drawMain(); });
  const newb = btn(t('update_all'), { variant: 'primary', appearance: 'solid', size: 'md', class: 'newb', icon: 'refresh', onclick: () => api.updateAll() });
  const check = iconBtn('refresh', t('check'), () => api.check());
  const offb = h('sav-badge.offb', { variant: 'warning', appearance: 'soft', pill: true }, icon('cloud'), ' ', t('offline'));
  const acct = h('div.acct');
  ui = { nav, bnav, newb, check, offb, acct, quota: h('div.quota'), main: h('main.hmain') };
  check.button = check.querySelector('sav-button');
  put(root, h('div.home',
    h('header.htop', h('div.brand', h('img', { src: 'icons/savoffice.svg', alt: '' }), h('b', 'SavOffice')), search, h('div.spacer'), offb, check, iconBtn('settings', t('settings'), () => go('settings')), acct),
    h('div.hbody', h('aside.hside', newb, nav, ui.quota), ui.main),
    bnav));
  drawChrome();
  drawMain();
}

let lastLang = null;
/** The style of SavComponents chosen (Soft, Tilt, Glass), on this window too. */
function applyStyle() {
  const want = 'sav-style-' + (['soft', 'tilt', 'glass'].includes(S?.settings?.style) ? S.settings.style : 'soft');
  const html = document.documentElement;
  if (html.classList.contains(want)) return;
  for (const c of [...html.classList]) if (c.startsWith('sav-style-')) html.classList.remove(c);
  html.classList.add(want);
}

function onState(s) {
  S = s;
  applyStyle();
  if (S.lang !== lastLang) { lastLang = S.lang; drawAll(); return; }
  drawChrome();
  // the settings stay as they are while someone is using them (a select open); they are drawn again on the next visit
  if (view !== 'settings') drawMain();
  else if (!ui.main.querySelector('sav-select[open]')) drawMain();
}

const fromHash = () => { const v = location.hash.slice(1); return ['all', 'installed', 'updates', 'settings'].includes(v) ? v : null; };
view = fromHash() || 'all';
api.onView((v) => { if (ui) go(v); else view = v; });
api.onState(onState);
// the time of the last check is relative ("5 minutes ago"): drawn again every minute
setInterval(() => { if (S && ui) drawChrome(); }, 60e3);
// SavComponents: the language of its own words (Close, Search…) follows the page
customElements.whenDefined('sav-button').then(() => api.state().then(onState));
