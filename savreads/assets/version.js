/** The version of SavReads (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '1.1.1';

export const CHANGES = [
  {
    v: '1.1.1', date: '2026-11-28', items: [
      ['Customise the bars: the preview scrolls when the bar is long and shows “Title” instead of the name of the file; on phones and tablets the list scrolls with a finger (the handle moves the rows)', 'Personalizza le barre: l’anteprima scorre quando la barra è lunga e mostra «Titolo» invece del nome del file; su telefoni e tablet l’elenco scorre con il dito (la maniglia sposta le righe)'],
    ],
  },
  {
    v: '1.1.0', date: '2026-11-28', items: [
      ['A smarter search of actions (⌘J): besides the commands it finds every option of the page (the items of its menus, its switches, the choices of its lists, its tabs) and what the thing chosen can do, as its right click', 'Una ricerca delle azioni più intelligente (⌘J): oltre ai comandi trova ogni opzione della pagina (le voci dei suoi menu, gli interruttori, le scelte degli elenchi, le schede) e cosa si può fare con ciò che è selezionato, come col clic destro'],
      ['Right click: the app’s own menu everywhere instead of the browser’s, with the actions of what is under the pointer (the ⋮ of a card or a row), of links, of the text and of the fields; Shift + right click still opens the browser’s menu. On phones and tablets a long press opens it; it never takes the focus from the text you are writing', 'Clic destro: il menu dell’app ovunque al posto di quello del browser, con le azioni di ciò che è sotto il puntatore (il ⋮ di una scheda o di una riga), dei collegamenti, del testo e dei campi; Maiusc + clic destro apre ancora il menu del browser. Su telefoni e tablet si apre con una pressione prolungata; non toglie mai il cursore dal testo che stai scrivendo'],
      ['Bars of your own (⋮ → Customise the bars): the bar of the reader with the buttons you choose, for articles and for feed items, in your order and with the spaces you want, seeing a preview; it follows your account. The apps of SavOffice and your account are in the reader too', 'Barre tutte tue (⋮ → Personalizza le barre): la barra del lettore con i pulsanti che scegli, per gli articoli e per le notizie dei feed, nell’ordine e con gli spazi che vuoi, vedendone l’anteprima; segue il tuo account. Le app di SavOffice e il tuo account sono anche nel lettore'],
    ],
  },
  {
    v: '1.0.0', date: '2026-11-27', items: [
      ['First version: save any article from its address, a bookmarklet or the share menu of the phone, and read it clean, without ads, trackers or scripts', 'Prima versione: salva qualsiasi articolo dal suo indirizzo, da un bookmarklet o dal menu Condividi del telefono, e leggilo pulito, senza pubblicità, tracker né script'],
      ['A reader of your own: font, size, line spacing, width and a light, sepia or dark page; reading time and where you stopped, on every device', 'Un lettore tutto tuo: carattere, dimensione, interlinea, larghezza e pagina chiara, seppia o scura; tempo di lettura e punto in cui eri rimasto, su ogni dispositivo'],
      ['Highlights with notes, tags, favourites, archive and search in the whole text; articles to read also offline', 'Evidenziazioni con note, tag, preferiti, archivio e ricerca in tutto il testo; articoli da leggere anche offline'],
      ['RSS, Atom and JSON Feed in folders, with unread counts and OPML; the feed of a site found from its address', 'RSS, Atom e JSON Feed in cartelle, con i non letti e OPML; il feed di un sito trovato dal suo indirizzo'],
      ['Your list from Pocket (closed in 2025) and Instapaper comes in with its tags; everything goes out as a .savrea file', 'La tua lista di Pocket (chiuso nel 2025) e di Instapaper entra con i suoi tag; tutto esce in un file .savrea'],
    ],
  },
];
