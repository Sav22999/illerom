/** The version of SavPresentations (in the footer) and what changed in each one (the page ?p=changelog). Newest first. */
export const VERSION = '1.2.1';

export const CHANGES = [
  {
    v: '1.2.1', date: '2026-11-28', items: [
      ['Keyboard shortcuts: a letter is never a shortcut by itself any more, only with ⌥⇧ (Alt+Shift) — also in the slideshow (⌥⇧B black screen, ⌥⇧L laser, ⌥⇧D pen) and for a new text box (⌥⇧T); the arrows, numbers and . work as before', 'Scorciatoie da tastiera: una lettera da sola non è più mai una scorciatoia, solo con ⌥⇧ (Alt+Shift) — anche nella presentazione (⌥⇧B schermo nero, ⌥⇧L laser, ⌥⇧D penna) e per una nuova casella di testo (⌥⇧T); frecce, numeri e . funzionano come prima'],
      ['Customise the bars: the preview scrolls when the bar is long and shows “Title” instead of the name of the file; on phones and tablets the list scrolls with a finger (the handle moves the rows)', 'Personalizza le barre: l’anteprima scorre quando la barra è lunga e mostra «Titolo» invece del nome del file; su telefoni e tablet l’elenco scorre con il dito (la maniglia sposta le righe)'],
    ],
  },
  {
    v: '1.2.0', date: '2026-11-28', items: [
      ['New templates: team retrospective, annual report, workshop and recipe', 'Nuovi modelli: retrospettiva del team, relazione annuale, laboratorio e ricetta'],
      ['A smarter search of actions (⌘J): besides the commands it finds every option of the page (the items of its menus, its switches, the choices of its lists, its tabs) and what the thing chosen can do, as its right click', 'Una ricerca delle azioni più intelligente (⌘J): oltre ai comandi trova ogni opzione della pagina (le voci dei suoi menu, gli interruttori, le scelte degli elenchi, le schede) e cosa si può fare con ciò che è selezionato, come col clic destro'],
      ['Right click: the app’s own menu everywhere instead of the browser’s, with the actions of what is under the pointer (the ⋮ of a card or a row), of links, of the text and of the fields; Shift + right click still opens the browser’s menu. On phones and tablets a long press opens it; it never takes the focus from the text you are writing', 'Clic destro: il menu dell’app ovunque al posto di quello del browser, con le azioni di ciò che è sotto il puntatore (il ⋮ di una scheda o di una riga), dei collegamenti, del testo e dei campi; Maiusc + clic destro apre ancora il menu del browser. Su telefoni e tablet si apre con una pressione prolungata; non toglie mai il cursore dal testo che stai scrivendo'],
      ['Bars of your own (⋮ → Customise the bars): the title bar, the Insert bar and the status bar, with the buttons you choose, in your order and with the spaces you want, seeing a preview; it follows your account', 'Barre tutte tue (⋮ → Personalizza le barre): barra del titolo, barra Inserisci e barra di stato con i pulsanti che scegli, nell’ordine e con gli spazi che vuoi, vedendone l’anteprima; segue il tuo account'],
    ],
  },
  {
    v: '1.1.0', date: '2026-11-26', items: [
      ['Links on elements: to a slide of the presentation or to a page outside, which opens in a new tab after asking', 'Link sugli elementi: a una slide della presentazione o a una pagina esterna, che si apre in una nuova scheda dopo una conferma'],
      ['Videos play in the SavComponents player, and their corners hold also when the video is zoomed', 'I video si riproducono nel player di SavComponents, e gli angoli arrotondati restano anche con il video ingrandito'],
      ['Versions in a side panel, as in SavDocuments', 'Le versioni in un pannello laterale, come in SavDocuments'],
      ['A download button in the top bar; the command palette is Ctrl/⌘+J and Ctrl/⌘+K adds a link, as in SavDocuments', 'Un pulsante Scarica nella barra in alto; la palette dei comandi è Ctrl/⌘+J e Ctrl/⌘+K aggiunge un link, come in SavDocuments'],
      ['Customising the toolbar and the Simple/Advanced mode are in the ⋮ menu', 'Personalizzare la barra e la modalità Semplice/Avanzata sono nel menu ⋮'],
      ['The footer of the home stays at the bottom; favourites, icons and page names as in the other Sav apps', 'Il footer della home resta in fondo; preferiti, icone e nomi delle pagine come nelle altre app Sav'],
      ['First page on phones: no animations on touch, a tidier top bar and list of features', 'Prima pagina sui telefoni: niente animazioni al tocco, barra in alto ed elenco delle funzioni più ordinati'],
    ],
  },
  {
    v: '1.0.0', date: '2026-11-25', items: [
      ['First version: themes and layouts that already look good, simple and advanced editing, charts, tables, shapes, icons, pictures and videos', 'Prima versione: temi e layout che stanno già bene, modifica semplice e avanzata, grafici, tabelle, forme, icone, immagini e video'],
      ['Live collaboration, comments, personal notes, versions, sharing by page, presenter view', 'Collaborazione dal vivo, commenti, note personali, versioni, condivisione per pagina, vista relatore'],
      ['PDF, PowerPoint, OpenDocument and .savpre files; presentations kept only on this device', 'File PDF, PowerPoint, OpenDocument e .savpre; presentazioni tenute solo su questo dispositivo'],
    ],
  },
];
