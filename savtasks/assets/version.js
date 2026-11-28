/** The version of SavTasks (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '1.4.0';

export const CHANGES = [
  {
    v: '1.4.0', date: '2026-11-28', items: [
      ['New ready-made starts: party, job search, bug tracker, thesis and focus at work', 'Nuovi punti di partenza: festa, ricerca di lavoro, segnalazioni di errori, tesi e concentrazione al lavoro'],
      ['A smarter search of actions (⌘J): besides the commands it finds every option of the page (the items of its menus, its switches, the choices of its lists, its tabs) and what the thing chosen can do, as its right click', 'Una ricerca delle azioni più intelligente (⌘J): oltre ai comandi trova ogni opzione della pagina (le voci dei suoi menu, gli interruttori, le scelte degli elenchi, le schede) e cosa si può fare con ciò che è selezionato, come col clic destro'],
      ['Right click: the app’s own menu everywhere instead of the browser’s, with the actions of what is under the pointer (the ⋮ of a card or a row), of links, of the text and of the fields; Shift + right click still opens the browser’s menu — on a task: open, done, star, due today, tomorrow or in a week, duplicate, delete; on phones and tablets a long press opens it, and it never takes the focus from the text you are writing', 'Clic destro: il menu dell’app ovunque al posto di quello del browser, con le azioni di ciò che è sotto il puntatore (il ⋮ di una scheda o di una riga), dei collegamenti, del testo e dei campi; Maiusc + clic destro apre ancora il menu del browser — su un’attività: apri, completa, stella, scadenza oggi, domani o tra una settimana, duplica, elimina; su telefoni e tablet si apre con una pressione prolungata, e non toglie mai il cursore dal testo che stai scrivendo'],
    ],
  },
  {
    v: '1.3.0', date: '2026-11-27', items: [
      ['Time tracking: a timer on every task, one at a time, always in the bar while it runs and kept on every device', 'Tracciamento del tempo: un timer su ogni attività, uno alla volta, sempre nella barra mentre corre e lo stesso su ogni dispositivo'],
      ['Time entries by hand (from–to or a length, a note, billable or not); the time of a task in its detail', 'Voci di tempo a mano (dalle–alle o una durata, una nota, fatturabili o no); il tempo di un’attività nel suo dettaglio'],
      ['Lists as projects or clients with an hourly rate; reports by week, month or days, by project and by task, with hours and amounts', 'Liste come progetti o clienti con una tariffa oraria; report per settimana, mese o intervallo, per progetto e per attività, con ore e importi'],
      ['Reports as CSV or opened in SavSpreadsheets (saved in SavDrive)', 'Report in CSV o aperti in SavSpreadsheets (salvati in SavDrive)'],
    ],
  },
  {
    v: '1.2.0', date: '2026-11-27', items: [
      ['Table: a type of list like a sheet, sorted by any column, with status, due day and priority changed from the cell', 'Tabella: un tipo di lista come un foglio, ordinata per qualsiasi colonna, con stato, scadenza e priorità da cambiare nella cella'],
      ['Habits: things to do on some days, ticked day by day, with the streak; the ones of the day also in Today', 'Abitudini: cose da fare in certi giorni, spuntate giorno per giorno, con la serie; quelle del giorno anche in Oggi'],
      ['The type of a list stays as it was made in “New” (list, table, kanban, Gantt, matrix, habits): it is not converted into another', 'Il tipo di una lista resta quello scelto in «Nuovo» (lista, tabella, kanban, Gantt, matrice, abitudini): non si converte in un altro'],
      ['The details of a task in a dialog in the middle; “Add” opens the dialog of the section (a habit, a bar, an item)', 'I dettagli di un’attività in un dialogo al centro; «Aggiungi» apre il dialogo della sezione (un’abitudine, una barra, un elemento)'],
    ],
  },
  {
    v: '1.1.0', date: '2026-11-27', items: [
      ['Gantt: any list becomes a chart of bars from start to due day, dragged and stretched with the mouse or a finger', 'Gantt: ogni lista diventa un diagramma con barre dall’inizio alla scadenza, da trascinare e allungare con il mouse o il dito'],
      ['Tasks have a start day too (optional); with a due day only they are milestones', 'Le attività hanno anche un giorno di inizio (facoltativo); con la sola scadenza sono tappe'],
      ['In SavCalendar a task with a start day spans all its days', 'In SavCalendar un’attività con inizio occupa tutti i suoi giorni'],
      ['“New” opens a dialog in the middle: a task, a list, a kanban board, a Gantt chart or an Eisenhower matrix, with ready-made starts', '«Nuovo» apre un dialogo al centro: un’attività, una lista, una bacheca kanban, un diagramma di Gantt o una matrice di Eisenhower, con modelli pronti'],
    ],
  },
  {
    v: '1.0.0', date: '2026-11-26', items: [
      ['First version: to-dos, lists and boards (kanban) in one app, part of SavOffice', 'Prima versione: attività, liste e bacheche (kanban) in un’unica app, parte di SavOffice'],
      ['Today, upcoming, starred and done; due days with a time, repetitions, priorities, labels and subtasks', 'Oggi, prossimi, speciali e fatti; scadenze con orario, ripetizioni, priorità, etichette e sottoattività'],
      ['Quick add that understands “tomorrow 15:00 !high #work”, in Italian and English', 'Aggiunta rapida che capisce «domani 15:00 !alta #lavoro», in italiano e in inglese'],
      ['Reminders by email and in the browser', 'Promemoria via email e nel browser'],
      ['The same account as SavSchedules and SavCalendar: tasks in the calendar, events and polls made from a task, what SavSchedules asks of you', 'Lo stesso account di SavSchedules e SavCalendar: attività nel calendario, eventi e sondaggi creati da un’attività, quello che SavSchedules ti chiede'],
      ['.savtas files (the format of SavTasks), CSV and Markdown', 'File .savtas (il formato di SavTasks), CSV e Markdown'],
    ],
  },
];
