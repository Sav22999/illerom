/** The version of SavTasks (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '1.2.0';

export const CHANGES = [
  {
    v: '1.2.0', date: '2026-11-27', items: [
      ['Table: any list as a sheet, sorted by any column, with status, due day and priority changed from the cell', 'Tabella: ogni lista come un foglio, ordinata per qualsiasi colonna, con stato, scadenza e priorità da cambiare nella cella'],
      ['Habits: things to do on some days, ticked day by day, with the streak; the ones of the day also in Today', 'Abitudini: cose da fare in certi giorni, spuntate giorno per giorno, con la serie; quelle del giorno anche in Oggi'],
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
