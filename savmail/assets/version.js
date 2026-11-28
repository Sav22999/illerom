/** The version of SavMail (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '0.10.0';

export const CHANGES = [
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
