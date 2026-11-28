/** The version of SavCalendar (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '1.3.4';

export const CHANGES = [
  {
    v: '1.3.4', date: '2026-11-28', items: [
      ['“More” and the other action sheets are now the action sheet of SavComponents: drag its handle down to close it, the place shown marked with a tick', '«Altro» e gli altri fogli di azioni sono ora il foglio di azioni di SavComponents: trascina la maniglia in giù per chiuderlo, la sezione mostrata segnata con una spunta'],
    ],
  },
  {
    v: '1.3.3', date: '2026-11-28', items: [
      ['Fixed: the sheets that rise from the bottom on phones (menus, action sheets) reach the edges of the screen, without a strip along the sides', 'Corretto: i fogli che salgono dal basso sui telefoni (menu, fogli di azioni) arrivano ai bordi dello schermo, senza una striscia ai lati'],
    ],
  },
  {
    v: '1.3.2', date: '2026-11-28', items: [
      ['On phones and tablets the views (day, week, month, agenda) are in the bar at the bottom, as in every app of SavOffice', 'Su telefoni e tablet le viste (giorno, settimana, mese, agenda) sono nella barra in basso, come in ogni app di SavOffice'],
    ],
  },
  {
    v: '1.3.1', date: '2026-11-28', items: [
      ['Keyboard shortcuts: a letter is never a shortcut by itself any more, only with ⌥⇧ (Alt+Shift), so typing or a key pressed by mistake does nothing; the arrows, / and ? work as before', 'Scorciatoie da tastiera: una lettera da sola non è più mai una scorciatoia, solo con ⌥⇧ (Alt+Shift), così scrivere o premere un tasto per sbaglio non fa nulla; frecce, / e ? funzionano come prima'],
      ['Customise the bars: the preview scrolls when the bar is long and shows “Title” instead of the name of the file; on phones and tablets the list scrolls with a finger (the handle moves the rows)', 'Personalizza le barre: l’anteprima scorre quando la barra è lunga e mostra «Titolo» invece del nome del file; su telefoni e tablet l’elenco scorre con il dito (la maniglia sposta le righe)'],
    ],
  },
  {
    v: '1.3.0', date: '2026-11-28', items: [
      ['A smarter search of actions (⌘J): besides the commands it finds every option of the page (the items of its menus, its switches, the choices of its lists, its tabs) and what the thing chosen can do, as its right click', 'Una ricerca delle azioni più intelligente (⌘J): oltre ai comandi trova ogni opzione della pagina (le voci dei suoi menu, gli interruttori, le scelte degli elenchi, le schede) e cosa si può fare con ciò che è selezionato, come col clic destro'],
      ['Right click: the app’s own menu everywhere instead of the browser’s, with the actions of what is under the pointer (the ⋮ of a card or a row), of links, of the text and of the fields; Shift + right click still opens the browser’s menu — on an event: open, edit, duplicate, move to the next day, delete; on phones and tablets a long press opens it, and it never takes the focus from the text you are writing', 'Clic destro: il menu dell’app ovunque al posto di quello del browser, con le azioni di ciò che è sotto il puntatore (il ⋮ di una scheda o di una riga), dei collegamenti, del testo e dei campi; Maiusc + clic destro apre ancora il menu del browser — su un evento: apri, modifica, duplica, sposta al giorno dopo, elimina; su telefoni e tablet si apre con una pressione prolungata, e non toglie mai il cursore dal testo che stai scrivendo'],
      ['Bars of your own (⋮ → Customise the bars): the title bar with the buttons you choose (today, back and forth, search, view, week days, new event), in your order and with the spaces you want, seeing a preview; it follows your account. The title bar now has its ⋮ menu', 'Barre tutte tue (⋮ → Personalizza le barre): la barra del titolo con i pulsanti che scegli (oggi, avanti e indietro, ricerca, vista, giorni della settimana, nuovo evento), nell’ordine e con gli spazi che vuoi, vedendone l’anteprima; segue il tuo account. La barra del titolo ora ha il suo menu ⋮'],
    ],
  },
  {
    v: '1.2.0', date: '2026-11-27', items: [
      ['The birthdays of your contacts of SavContacts in the calendar, with the age they turn (they can be hidden, as the other apps of SavOffice)', 'I compleanni dei tuoi contatti di SavContacts nel calendario, con gli anni che compiono (si possono nascondere, come le altre app di SavOffice)'],
    ],
  },
  {
    v: '1.1.0', date: '2026-11-26', items: [
      ['Your week: any first day, and the days shown by the week and month views, in one panel that stays open', 'La tua settimana: qualsiasi primo giorno e i giorni mostrati dalle viste settimana e mese, in un pannello che resta aperto'],
      ['.savcal files (the format of SavCalendar), .ics and .csv downloads', 'File .savcal (il formato di SavCalendar), download in .ics e .csv'],
      ['The planned newsletters of SavNewsletters in the calendar; the SavOffice button in every app', 'Le newsletter programmate di SavNewsletters nel calendario; il pulsante SavOffice in ogni app'],
      ['What’s new and the version in the footer, as in the other Sav apps; an Android app', 'Novità e versione nel piè di pagina, come nelle altre app Sav; un’app per Android'],
    ],
  },
  {
    v: '1.0.0', date: '2026-11-26', items: [
      ['First version: day, week, month and agenda, several calendars, repetitions and time zones', 'Prima versione: giorno, settimana, mese e agenda, più calendari, ripetizioni e fusi orari'],
      ['The same account and session as SavSchedules: dates chosen and places booked in the calendar, polls made from the calendar', 'Lo stesso account e la stessa sessione di SavSchedules: date scelte e posti prenotati nel calendario, sondaggi creati dal calendario'],
      ['A private link for Google, Outlook and Apple; subscriptions to .ics calendars and import of files', 'Un link privato per Google, Outlook e Apple; iscrizioni a calendari .ics e importazione di file'],
      ['Read-only events say why, and where they can be changed', 'Gli eventi in sola lettura dicono perché, e dove si possono modificare'],
    ],
  },
];
