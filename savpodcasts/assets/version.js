/** The version of SavPodcasts (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '1.1.1';

export const CHANGES = [
  {
    v: '1.1.1', date: '2026-11-28', items: [
      ['On phones and tablets the places are in the bar at the bottom, as in every app of SavOffice; when they do not all fit, “More” opens an action sheet with the others', 'Su telefoni e tablet le sezioni sono nella barra in basso, come in ogni app di SavOffice; quando non ci stanno tutte, «Altro» apre un foglio di azioni con le altre'],
    ],
  },
  {
    v: '1.1.0', date: '2026-11-28', items: [
      ['A smarter search of actions (⌘J): besides the commands it finds every option of the page (the items of its menus, its switches, the choices of its lists, its tabs) and what the thing chosen can do, as its right click', 'Una ricerca delle azioni più intelligente (⌘J): oltre ai comandi trova ogni opzione della pagina (le voci dei suoi menu, gli interruttori, le scelte degli elenchi, le schede) e cosa si può fare con ciò che è selezionato, come col clic destro'],
      ['Right click: the app’s own menu everywhere instead of the browser’s, with the actions of what is under the pointer (the ⋮ of a card or a row), of links, of the text and of the fields; Shift + right click still opens the browser’s menu. On phones and tablets a long press opens it; it never takes the focus from the text you are writing', 'Clic destro: il menu dell’app ovunque al posto di quello del browser, con le azioni di ciò che è sotto il puntatore (il ⋮ di una scheda o di una riga), dei collegamenti, del testo e dei campi; Maiusc + clic destro apre ancora il menu del browser. Su telefoni e tablet si apre con una pressione prolungata; non toglie mai il cursore dal testo che stai scrivendo'],
    ],
  },
  {
    v: '1.0.0', date: '2026-11-27', items: [
      ['First version: podcasts from their own public feeds, found in open catalogues (fyyd, Podcast Index) or added with the address of the feed', 'Prima versione: i podcast dai loro feed pubblici, trovati in cataloghi aperti (fyyd, Podcast Index) o aggiunti con l’indirizzo del feed'],
      ['Follow podcasts, the new episodes in one list, the queue in your order, starred episodes and history', 'Segui i podcast, gli episodi nuovi in un solo elenco, la coda nell’ordine che vuoi, episodi preferiti e cronologia'],
      ['The player remembers where you stopped on every device; speed, skips and sleep timer, also for each podcast', 'Il lettore ricorda dove ti eri fermato su ogni dispositivo; velocità, salti e timer di spegnimento, anche per ogni podcast'],
      ['Private: the artwork passes through the server, so the publishers do not see you; OPML to bring your podcasts in and out', 'Riservato: le copertine passano dal server, così gli editori non ti vedono; OPML per portare i tuoi podcast dentro e fuori'],
    ],
  },
];
