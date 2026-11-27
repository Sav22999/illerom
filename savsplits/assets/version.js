/** The version of SavSplits (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '1.2.0';

export const CHANGES = [
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
