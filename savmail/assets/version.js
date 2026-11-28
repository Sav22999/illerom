/** The version of SavMail (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '0.10.5';

export const CHANGES = [
  {
    v: '0.10.5', date: '2026-11-28', items: [
      ['“More” and the other action sheets are now the action sheet of SavComponents: drag its handle down to close it, the place shown marked with a tick', '«Altro» e gli altri fogli di azioni sono ora il foglio di azioni di SavComponents: trascina la maniglia in giù per chiuderlo, la sezione mostrata segnata con una spunta'],
    ],
  },
  {
    v: '0.10.4', date: '2026-11-28', items: [
      ['Fixed: the sheets that rise from the bottom on phones (menus, action sheets) reach the edges of the screen, without a strip along the sides', 'Corretto: i fogli che salgono dal basso sui telefoni (menu, fogli di azioni) arrivano ai bordi dello schermo, senza una striscia ai lati'],
    ],
  },
  {
    v: '0.10.3', date: '2026-11-28', items: [
      ['Fixed: on phones the button with all the apps of SavOffice is back; the bar on top has the logo and the name on the left, the apps and the account on the right, and the search on a row of its own; the button to write floats above the bar at the bottom', 'Corretto: sui telefoni torna il pulsante con tutte le app di SavOffice; la barra in alto ha logo e nome a sinistra, le app e l’account a destra, e la ricerca su una riga a sé; il pulsante per scrivere sta sopra la barra in basso'],
    ],
  },
  {
    v: '0.10.2', date: '2026-11-28', items: [
      ['On phones and tablets the main folders are in the bar at the bottom, as in every app of SavOffice; “More” opens an action sheet with spam, trash, all the folders and the addresses', 'Su telefoni e tablet le cartelle principali sono nella barra in basso, come in ogni app di SavOffice; «Altro» apre un foglio di azioni con spam, cestino, tutte le cartelle e gli indirizzi'],
    ],
  },
  {
    v: '0.10.1', date: '2026-11-28', items: [
      ['Keyboard shortcuts: a letter is never a shortcut by itself any more, only with ⌥⇧ (Alt+Shift), so typing or a key pressed by mistake does nothing; the arrows, / and ? work as before', 'Scorciatoie da tastiera: una lettera da sola non è più mai una scorciatoia, solo con ⌥⇧ (Alt+Shift), così scrivere o premere un tasto per sbaglio non fa nulla; frecce, / e ? funzionano come prima'],
      ['Customise the bars: the preview scrolls when the bar is long and shows “Title” instead of the name of the file; on phones and tablets the list scrolls with a finger (the handle moves the rows)', 'Personalizza le barre: l’anteprima scorre quando la barra è lunga e mostra «Titolo» invece del nome del file; su telefoni e tablet l’elenco scorre con il dito (la maniglia sposta le righe)'],
    ],
  },
  {
    v: '0.10.0', date: '2026-11-28', items: [
      ['A smarter search of actions (⌘J): besides the commands it finds every option of the page (the items of its menus, its switches, the choices of its lists, its tabs) and what the thing chosen can do, as its right click', 'Una ricerca delle azioni più intelligente (⌘J): oltre ai comandi trova ogni opzione della pagina (le voci dei suoi menu, gli interruttori, le scelte degli elenchi, le schede) e cosa si può fare con ciò che è selezionato, come col clic destro'],
      ['Right click: the app’s own menu everywhere instead of the browser’s, with the actions of what is under the pointer (the ⋮ of a card or a row), of links, of the text and of the fields; Shift + right click still opens the browser’s menu — on a message: open, reply, forward, read or unread, star, archive, spam, delete (on all the ones chosen); on phones and tablets a long press opens it, and it never takes the focus from the text you are writing', 'Clic destro: il menu dell’app ovunque al posto di quello del browser, con le azioni di ciò che è sotto il puntatore (il ⋮ di una scheda o di una riga), dei collegamenti, del testo e dei campi; Maiusc + clic destro apre ancora il menu del browser — su un messaggio: apri, rispondi, inoltra, letto o non letto, stella, archivia, spam, elimina (su tutti quelli scelti); su telefoni e tablet si apre con una pressione prolungata, e non toglie mai il cursore dal testo che stai scrivendo'],
      ['The bar of a new message is yours (⋮ → Customise the bars): choose its buttons, their order and the spaces between them, seeing a preview, with more to pick from (strikethrough, alignment, indent, line, undo); it follows your account', 'La barra di un nuovo messaggio è tua (⋮ → Personalizza le barre): scegli i pulsanti, il loro ordine e gli spazi tra loro, con un’anteprima e altri tra cui scegliere (barrato, allineamento, rientro, linea, annulla); segue il tuo account'],
    ],
  },
  {
    v: '0.9.1', date: '2026-11-27', items: [
      ['The recipients suggested from SavContacts while you type a name or an address', 'I destinatari suggeriti da SavContacts mentre scrivi un nome o un indirizzo'],
    ],
  },
  {
    v: '0.9.0', date: '2026-11-27', items: [
      ['First version, for testing: your mailboxes of Gmail, Outlook, Yahoo, iCloud, Aruba, Libero or any IMAP provider in one place', 'Prima versione, in prova: le tue caselle di Gmail, Outlook, Yahoo, iCloud, Aruba, Libero o di qualsiasi provider IMAP in un solo posto'],
      ['Up to ten addresses: the folders of all of them together (one inbox for all), or each with its own', 'Fino a dieci indirizzi: le cartelle di tutti insieme (un’unica posta in arrivo), o ciascuno con le sue'],
      ['Read, reply, forward, write with attachments; drafts, archive, spam, trash and folders, the same as in every other mail app', 'Leggi, rispondi, inoltra, scrivi con allegati; bozze, archivio, spam, cestino e cartelle, gli stessi di ogni altra app di posta'],
      ['Encrypted: servers, passwords and signatures are locked with a key that only your devices hold; messages are never kept by SavMail', 'Cifrata: server, password e firme sono chiusi con una chiave che hanno solo i tuoi dispositivi; SavMail non conserva mai i messaggi'],
      ['Pictures from the internet held back until you ask (they tell the sender you read the message); no scripts in messages, ever', 'Le immagini da internet restano bloccate finché non le chiedi (dicono al mittente che hai letto il messaggio); mai script nei messaggi'],
    ],
  },
];
