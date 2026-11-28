/** The version of SavNewsletters (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '1.2.4';

export const CHANGES = [
  {
    v: '1.2.4', date: '2026-11-28', items: [
      ['Fixed: the sheets that rise from the bottom on phones (menus, action sheets) reach the edges of the screen, without a strip along the sides', 'Corretto: i fogli che salgono dal basso sui telefoni (menu, fogli di azioni) arrivano ai bordi dello schermo, senza una striscia ai lati'],
    ],
  },
  {
    v: '1.2.3', date: '2026-11-28', items: [
      ['Fixed: on phones the bar on top has the logo and the name on the left, the apps and the account on the right, and the search on a row of its own', 'Corretto: sui telefoni la barra in alto ha logo e nome a sinistra, le app e l’account a destra, e la ricerca su una riga a sé'],
    ],
  },
  {
    v: '1.2.2', date: '2026-11-28', items: [
      ['On phones and tablets the places are in the bar at the bottom, as in every app of SavOffice, and so are the tabs of a group; when they do not all fit, “More” opens an action sheet with the others', 'Su telefoni e tablet le sezioni sono nella barra in basso, come in ogni app di SavOffice, e così le schede di un gruppo; quando non ci stanno tutte, «Altro» apre un foglio di azioni con le altre'],
    ],
  },
  {
    v: '1.2.1', date: '2026-11-28', items: [
      ['Customise the bars: the preview scrolls when the bar is long and shows “Title” instead of the name of the file; on phones and tablets the list scrolls with a finger (the handle moves the rows)', 'Personalizza le barre: l’anteprima scorre quando la barra è lunga e mostra «Titolo» invece del nome del file; su telefoni e tablet l’elenco scorre con il dito (la maniglia sposta le righe)'],
    ],
  },
    {
        v: '1.2.0', date: '2026-11-28', items: [
      ['New templates: product launch, thank you, we are hiring and recipe of the month', 'Nuovi modelli: lancio di un prodotto, grazie, cerchiamo persone e ricetta del mese'],
            ['A smarter search of actions (⌘J): besides the commands it finds every option of the page (the items of its menus, its switches, the choices of its lists, its tabs) and what the thing chosen can do, as its right click', 'Una ricerca delle azioni più intelligente (⌘J): oltre ai comandi trova ogni opzione della pagina (le voci dei suoi menu, gli interruttori, le scelte degli elenchi, le schede) e cosa si può fare con ciò che è selezionato, come col clic destro'],
            ['Right click: the app’s own menu everywhere instead of the browser’s, with the actions of what is under the pointer (the ⋮ of a card or a row), of links, of the text and of the fields; Shift + right click still opens the browser’s menu. On phones and tablets a long press opens it; it never takes the focus from the text you are writing', 'Clic destro: il menu dell’app ovunque al posto di quello del browser, con le azioni di ciò che è sotto il puntatore (il ⋮ di una scheda o di una riga), dei collegamenti, del testo e dei campi; Maiusc + clic destro apre ancora il menu del browser. Su telefoni e tablet si apre con una pressione prolungata; non toglie mai il cursore dal testo che stai scrivendo'],
            ['The bar of a text is yours (⋮ → Customise the bars): the buttons you choose, in your order and with the spaces you want, seeing a preview, with more to pick from (strikethrough, undo, redo); it follows your account', 'La barra di un testo è tua (⋮ → Personalizza le barre): i pulsanti che scegli, nell’ordine e con gli spazi che vuoi, vedendone l’anteprima, con altri tra cui scegliere (barrato, annulla, ripeti); segue il tuo account'],
        ],
    },
    {
        v: '1.1.0', date: '2026-11-26', items: [
            ['What’s new and the version in the footer, the SavOffice button on the first page too, installable as an app and an Android app, as in the other apps of SavOffice',
                'Novità e versione nel piè di pagina, il pulsante SavOffice anche nella prima pagina, installabile come app e un’app per Android, come nelle altre app di SavOffice'],
            ['Signing in with SavAccount goes through the service shared by the apps of SavOffice', 'L’accesso con SavAccount passa dal servizio condiviso dalle app di SavOffice'],
        ],
    },
    {
        v: '1.0.0', date: '2026-11-26', items: [
            ['OpenNewsletter becomes SavNewsletters and joins SavOffice: the same look as the other apps, the old address leads here', 'OpenNewsletter diventa SavNewsletters ed entra in SavOffice: lo stesso aspetto delle altre app, il vecchio indirizzo porta qui'],
            ['Groups with roles, proposals approved before sending, sending at the chosen time', 'Gruppi con ruoli, proposte approvate prima dell’invio, invio all’ora scelta'],
            ['Drag-and-drop editor, templates, subscribers in several languages, subscription page and widget, .savnew files', 'Editor a trascinamento, modelli, iscritti in più lingue, pagina di iscrizione e widget, file .savnew'],
            ['What is scheduled shows up in SavCalendar', 'Ciò che è programmato compare in SavCalendar'],
        ],
    },
];
