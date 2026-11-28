/** The version of SavSpreadsheets (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '1.1.4';

export const CHANGES = [
  {
    v: '1.1.4', date: '2026-11-28', items: [
      ['Phones: undo, redo and the copy in SavDrive are in ⋮ (the title bar has no room for them); the bar of the panels at the bottom shares its width among its buttons', 'Telefoni: annulla, ripeti e la copia in SavDrive sono in ⋮ (la barra del titolo non ha spazio per loro); la barra dei pannelli in basso divide la sua larghezza tra i pulsanti'],
      ['Fixed: the sheets that rise from the bottom on phones (menus, action sheets) reach the edges of the screen, without a strip along the sides', 'Corretto: i fogli che salgono dal basso sui telefoni (menu, fogli di azioni) arrivano ai bordi dello schermo, senza una striscia ai lati'],
    ],
  },
  {
    v: '1.1.3', date: '2026-11-28', items: [
      ['On phones and tablets the bar of the panels at the bottom no longer scrolls: it shows four, and “More” opens an action sheet with the others', 'Su telefoni e tablet la barra dei pannelli in basso non scorre più: ne mostra quattro, e «Altro» apre un foglio di azioni con gli altri'],
    ],
  },
  {
    v: '1.1.2', date: '2026-11-28', items: [
      ['On phones and tablets the places are in the bar at the bottom, as in every app of SavOffice; when they do not all fit, “More” opens an action sheet with the others', 'Su telefoni e tablet le sezioni sono nella barra in basso, come in ogni app di SavOffice; quando non ci stanno tutte, «Altro» apre un foglio di azioni con le altre'],
    ],
  },
  {
    v: '1.1.1', date: '2026-11-28', items: [
      ['Customise the bars: the preview scrolls when the bar is long and shows “Title” instead of the name of the file; on phones and tablets the list scrolls with a finger (the handle moves the rows)', 'Personalizza le barre: l’anteprima scorre quando la barra è lunga e mostra «Titolo» invece del nome del file; su telefoni e tablet l’elenco scorre con il dito (la maniglia sposta le righe)'],
    ],
  },
  {
    v: '1.1.0', date: '2026-11-28', items: [
      ['A smarter search of actions (⌘J): besides the commands it finds every option of the page (the items of its menus, its switches, the choices of its lists, its tabs) and what the thing chosen can do, as its right click', 'Una ricerca delle azioni più intelligente (⌘J): oltre ai comandi trova ogni opzione della pagina (le voci dei suoi menu, gli interruttori, le scelte degli elenchi, le schede) e cosa si può fare con ciò che è selezionato, come col clic destro'],
      ['Right click: the app’s own menu everywhere instead of the browser’s, with the actions of what is under the pointer (the ⋮ of a card or a row), of links, of the text and of the fields; Shift + right click still opens the browser’s menu. On phones and tablets a long press opens it; it never takes the focus from the text you are writing', 'Clic destro: il menu dell’app ovunque al posto di quello del browser, con le azioni di ciò che è sotto il puntatore (il ⋮ di una scheda o di una riga), dei collegamenti, del testo e dei campi; Maiusc + clic destro apre ancora il menu del browser. Su telefoni e tablet si apre con una pressione prolungata; non toglie mai il cursore dal testo che stai scrivendo'],
      ['Guided formula: a panel on the right that explains each function step by step, with an example and the result while you write', 'Formula guidata: un pannello a destra che spiega ogni funzione passo per passo, con un esempio e il risultato mentre scrivi'],
      ['Dropdown lists and checkboxes one click away (toolbar, right click); the arrow of a dropdown can be always shown, shown on hover, only in the selected cell, or hidden, and its values are suggested while you type', 'Menu a tendina e caselle di controllo a un clic (barra, clic destro); la freccia di un menu a tendina può essere sempre visibile, al passaggio del mouse, solo nella cella selezionata o nascosta, e i suoi valori sono suggeriti mentre scrivi'],
      ['A workbook opens again on the cell where you left each sheet', 'Una cartella si riapre sulla cella in cui avevi lasciato ogni foglio'],
      ['Bars of your own (⋮ → Customise the bars): choose the buttons of the title bar, the toolbar and the status bar, their order and the spaces between them, seeing a preview, with more actions to pick from (insert or delete rows and columns, format cells, find, print…); it follows your account', 'Barre tutte tue (⋮ → Personalizza le barre): scegli i pulsanti della barra del titolo, della barra degli strumenti e della barra di stato, il loro ordine e gli spazi tra loro, con un’anteprima e altre azioni tra cui scegliere (inserire o eliminare righe e colonne, formato celle, trova, stampa…); segue il tuo account'],
      ['Checkboxes with three states: true, false and indeterminate (empty cell); checkboxes and dropdowns can be removed from the cells with the right click', 'Caselle di controllo a tre stati: vero, falso e indeterminato (cella vuota); caselle e menu a tendina si tolgono dalle celle con il clic destro'],
      ['Conditional formatting in one click: greater or less than, contains, repeated values, colour scales, data bars', 'Formattazione condizionale in un clic: maggiore o minore di, contiene, valori ripetuti, scale di colori, barre di dati'],
      ['Print and PDF on A4, A5, A3, Letter or Legal, with guides on the sheet where each page ends', 'Stampa e PDF su A4, A5, A3, Letter o Legal, con le guide sul foglio dove finisce ogni pagina'],
      ['Freezing rows and columns: two separate choices, and a custom number', 'Blocco di righe e colonne: due scelte separate, e un numero a piacere'],
      ['Formulas: the brackets left open are closed on Enter; the formula box can be made double or triple height', 'Formule: le parentesi lasciate aperte vengono chiuse con Invio; la casella della formula può diventare alta il doppio o il triplo'],
      ['Fixed: validation and conditional formatting use the selected cells; filters, sorting and charts no longer take the title above a table; the name box reaches any cell; menus with a tick show only the current choice; the arrow of a dropdown stays in its cell when the text is long, and its list no longer closes as soon as it opens', 'Corretto: convalida e formattazione condizionale usano le celle selezionate; filtri, ordinamento e grafici non prendono più il titolo sopra una tabella; la casella del nome raggiunge qualsiasi cella; i menu con la spunta mostrano solo la scelta attuale; la freccia di un menu a tendina resta nella sua cella quando il testo è lungo, e il suo elenco non si chiude più appena aperto'],
    ],
  },
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
