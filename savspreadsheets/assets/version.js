/** The version of SavSpreadsheets (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '1.0.0';

export const CHANGES = [
  {
    v: '1.0.0', date: '2026-11-26', items: [
      ['First version: workbooks with many sheets, frozen rows and columns, merged cells, filters and sorting', 'Prima versione: cartelle di lavoro con più fogli, righe e colonne bloccate, celle unite, filtri e ordinamento'],
      ['More than 250 functions, always in standard English (SUM, VLOOKUP, XLOOKUP, IFS, FILTER, UNIQUE…), with results that spill over the cells around', 'Più di 250 funzioni, sempre nell’inglese standard (SUM, VLOOKUP, XLOOKUP, IFS, FILTER, UNIQUE…), con risultati che si espandono nelle celle vicine'],
      ['Number, currency, percentage and date formats; values shown in the language of each workbook', 'Formati di numeri, valute, percentuali e date; i valori mostrati nella lingua di ogni cartella'],
      ['Conditional formats, data validation with lists and checkboxes, charts drawn from the cells', 'Formattazione condizionale, convalida con elenchi e caselle di controllo, grafici disegnati dalle celle'],
      ['Opens and saves Excel (.xlsx and .xls), OpenDocument (.ods), CSV and its own .savspr files; print and PDF', 'Apre e salva Excel (.xlsx e .xls), OpenDocument (.ods), CSV e i propri file .savspr; stampa e PDF'],
      ['Working together live, sharing, comments, personal notes, versions; it works offline too', 'Lavoro insieme in tempo reale, condivisione, commenti, note personali, versioni; funziona anche offline'],
      ['Rules for each sheet (who edits, comments, only reads, or does not see it at all) and protected cells: a range or the whole sheet but a range, for everybody but the people you choose or only for some people', 'Regole per ogni foglio (chi modifica, commenta, legge soltanto o non lo vede affatto) e celle protette: un intervallo o tutto il foglio tranne un intervallo, per tutti tranne le persone scelte o solo per alcune persone'],
    ],
  },
];
