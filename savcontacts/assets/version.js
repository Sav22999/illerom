/** The version of SavContacts (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '1.2.0';

export const CHANGES = [
  {
    v: '1.2.0', date: '2026-11-28', items: [
      ['A smarter search of actions (⌘J): besides the commands it finds every option of the page (the items of its menus, its switches, the choices of its lists, its tabs) and what the thing chosen can do, as its right click', 'Una ricerca delle azioni più intelligente (⌘J): oltre ai comandi trova ogni opzione della pagina (le voci dei suoi menu, gli interruttori, le scelte degli elenchi, le schede) e cosa si può fare con ciò che è selezionato, come col clic destro'],
      ['Right click: the app’s own menu everywhere instead of the browser’s, with the actions of what is under the pointer (the ⋮ of a card or a row), of links, of the text and of the fields; Shift + right click still opens the browser’s menu — on a contact: open, edit, write an email, call, export, delete (on all the ones chosen); on phones and tablets a long press opens it, and it never takes the focus from the text you are writing', 'Clic destro: il menu dell’app ovunque al posto di quello del browser, con le azioni di ciò che è sotto il puntatore (il ⋮ di una scheda o di una riga), dei collegamenti, del testo e dei campi; Maiusc + clic destro apre ancora il menu del browser — su un contatto: apri, modifica, scrivi un’email, chiama, esporta, elimina (su tutti quelli scelti); su telefoni e tablet si apre con una pressione prolungata, e non toglie mai il cursore dal testo che stai scrivendo'],
    ],
  },
  {
    v: '1.1.0', date: '2026-11-27', items: [
      ['Your contacts in sync with the phone, the computer and Thunderbird (CardDAV): iPhone, Android with DAVx⁵, Mac', 'I contatti in sincronia con il telefono, il computer e Thunderbird (CardDAV): iPhone, Android con DAVx⁵, Mac'],
      ['A password for each device, never the one of the account, and a button to try the connection', 'Una password per ogni dispositivo, mai quella dell’account, e un pulsante per provare la connessione'],
      ['A contact opens in a window in the middle (a sheet from the bottom on phones); on phones a bar at the bottom with contacts, favourites, birthdays and groups', 'Un contatto si apre in una finestra al centro (un foglio dal basso sul telefono); sul telefono una barra in basso con contatti, preferiti, compleanni e gruppi'],
    ],
  },
  {
    v: '1.0.0', date: '2026-11-27', items: [
      ['First version: the address book of SavOffice, with the same account as SavCalendar, SavTasks and SavMail', 'Prima versione: la rubrica di SavOffice, con lo stesso account di SavCalendar, SavTasks e SavMail'],
      ['Contacts with as many emails, phones, addresses and websites as needed, each with its label; company, role, birthday, notes and photo', 'Contatti con tutte le email, i telefoni, gli indirizzi e i siti che servono, ognuno con la sua etichetta; azienda, ruolo, compleanno, note e foto'],
      ['Groups, favourites, quick search, sorting by first or last name, the duplicates found and merged', 'Gruppi, preferiti, ricerca veloce, ordine per nome o cognome, i duplicati trovati e uniti'],
      ['vCard files (3.0 and 4.0, also many contacts in one file), CSV of Google and Outlook, and .savcon, also from SavDrive', 'File vCard (3.0 e 4.0, anche più contatti in un file), CSV di Google e Outlook, e .savcon, anche da SavDrive'],
      ['The recipients of SavMail suggested from the contacts, and their birthdays in SavCalendar', 'I destinatari di SavMail suggeriti dai contatti, e i loro compleanni in SavCalendar'],
    ],
  },
];
