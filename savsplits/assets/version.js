/** The version of SavSplits (in the footer) and what changed in each one (the page #/changelog). Newest first. */
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
      ['On phones and tablets the places are in the bar at the bottom, as in every app of SavOffice, and so are the tabs of a group; when they do not all fit, “More” opens an action sheet with the others', 'Su telefoni e tablet le sezioni sono nella barra in basso, come in ogni app di SavOffice, e così le schede di un gruppo; quando non ci stanno tutte, «Altro» apre un foglio di azioni con le altre'],
    ],
  },
  {
    v: '1.3.1', date: '2026-11-28', items: [
      ['Keyboard shortcuts: a letter is never a shortcut by itself any more, only with ⌥⇧ (Alt+Shift), so typing or a key pressed by mistake does nothing; the arrows, / and ? work as before', 'Scorciatoie da tastiera: una lettera da sola non è più mai una scorciatoia, solo con ⌥⇧ (Alt+Shift), così scrivere o premere un tasto per sbaglio non fa nulla; frecce, / e ? funzionano come prima'],
    ],
  },
  {
    v: '1.3.0', date: '2026-11-28', items: [
      ['A smarter search of actions (⌘J): besides the commands it finds every option of the page (the items of its menus, its switches, the choices of its lists, its tabs) and what the thing chosen can do, as its right click', 'Una ricerca delle azioni più intelligente (⌘J): oltre ai comandi trova ogni opzione della pagina (le voci dei suoi menu, gli interruttori, le scelte degli elenchi, le schede) e cosa si può fare con ciò che è selezionato, come col clic destro'],
      ['Right click: the app’s own menu everywhere instead of the browser’s, with the actions of what is under the pointer (the ⋮ of a card or a row), of links, of the text and of the fields; Shift + right click still opens the browser’s menu. On phones and tablets a long press opens it; it never takes the focus from the text you are writing', 'Clic destro: il menu dell’app ovunque al posto di quello del browser, con le azioni di ciò che è sotto il puntatore (il ⋮ di una scheda o di una riga), dei collegamenti, del testo e dei campi; Maiusc + clic destro apre ancora il menu del browser. Su telefoni e tablet si apre con una pressione prolungata; non toglie mai il cursore dal testo che stai scrivendo'],
    ],
  },
  {
    v: '1.2.0', date: '2026-11-27', items: [
      ['My spending: your share of the expenses of every group, by month and by category, for a period and a group, with its CSV', 'Le mie spese: la tua quota delle spese di tutti i gruppi, per mese e per categoria, per periodo e gruppo, con il suo CSV'],
      ['Personal group: only you, for private expenses, no link and no balances', 'Gruppo personale: solo tu, per le spese private, senza link né saldi'],
      ['Monthly caps per category, with a bar and a warning when one is passed', 'Tetti mensili per categoria, con una barra e un avviso quando uno viene superato'],
      ['Bank statement (CSV) into a group: read in your browser, columns and formats to choose, preview, duplicates left out, categories from remembered keywords', 'Estratto conto (CSV) in un gruppo: letto nel tuo browser, colonne e formati da scegliere, anteprima, doppioni esclusi, categorie dalle parole chiave ricordate'],
    ],
  },
  {
    v: '1.1.0', date: '2026-11-27', items: [
      ['Photos of the expenses: receipts and bills attached to an expense (up to 6, 5 MB each), also from the camera of the phone', 'Foto delle spese: scontrini e ricevute allegati a una spesa (fino a 6, da 5 MB), anche dalla fotocamera del telefono'],
      ['The photos lose the place and the device where they were taken, and only the group sees them', 'Le foto perdono il luogo e il dispositivo dello scatto, e le vede solo il gruppo'],
      ['.savspl files open from SavDrive', 'I file .savspl si aprono da SavDrive'],
    ],
  },
  {
    v: '1.0.0', date: '2026-11-27', items: [
      ['First version: expenses shared in groups, part of SavOffice', 'Prima versione: spese condivise in gruppo, parte di SavOffice'],
      ['Split equally, by shares, by percentages, by exact amounts or by the thousandths of a table (condominiums)', 'Divisione in parti uguali, per quote, per percentuali, per importi esatti o per i millesimi di una tabella (condomini)'],
      ['Balances and the fewest payments to settle up, marked as paid with one press', 'Saldi e il minor numero di pagamenti per pareggiare, segnati come fatti con un tocco'],
      ['A link for the others, without an account: to look or to add expenses too', 'Un link per gli altri, senza account: per guardare o anche per aggiungere spese'],
      ['Expenses in any currency, with the rates of the European Central Bank', 'Spese in qualsiasi valuta, con i cambi della Banca Centrale Europea'],
      ['Repeated expenses (rent, bills, instalments), the history of every change, charts, .savspl and CSV files', 'Spese che si ripetono (affitto, bollette, rate), la cronologia di ogni modifica, grafici, file .savspl e CSV'],
    ],
  },
];
