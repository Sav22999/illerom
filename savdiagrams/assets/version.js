/** The version of SavDiagrams (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '1.1.3';

export const CHANGES = [
  {
    v: '1.1.3', date: '2026-11-28', items: [
      ['“More” and the other action sheets are now the action sheet of SavComponents: drag its handle down to close it, the place shown marked with a tick', '«Altro» e gli altri fogli di azioni sono ora il foglio di azioni di SavComponents: trascina la maniglia in giù per chiuderlo, la sezione mostrata segnata con una spunta'],
    ],
  },
  {
    v: '1.1.2', date: '2026-11-28', items: [
      ['Fixed: the sheets that rise from the bottom on phones (menus, action sheets) reach the edges of the screen, without a strip along the sides', 'Corretto: i fogli che salgono dal basso sui telefoni (menu, fogli di azioni) arrivano ai bordi dello schermo, senza una striscia ai lati'],
    ],
  },
  {
    v: '1.1.1', date: '2026-11-28', items: [
      ['Keyboard shortcuts: a letter is never a shortcut by itself any more, only with ⌥⇧ (Alt+Shift), so typing or a key pressed by mistake does nothing; the arrows, / and ? work as before', 'Scorciatoie da tastiera: una lettera da sola non è più mai una scorciatoia, solo con ⌥⇧ (Alt+Shift), così scrivere o premere un tasto per sbaglio non fa nulla; frecce, / e ? funzionano come prima'],
      ['Customise the bars: the preview scrolls when the bar is long and shows “Title” instead of the name of the file; on phones and tablets the list scrolls with a finger (the handle moves the rows)', 'Personalizza le barre: l’anteprima scorre quando la barra è lunga e mostra «Titolo» invece del nome del file; su telefoni e tablet l’elenco scorre con il dito (la maniglia sposta le righe)'],
    ],
  },
  {
    v: '1.1.0', date: '2026-11-28', items: [
      ['New templates: SWOT analysis, timeline, database tables and decision tree', 'Nuovi modelli: analisi SWOT, linea del tempo, tabelle di un database e albero delle decisioni'],
      ['A smarter search of actions (⌘J): besides the commands it finds every option of the page (the items of its menus, its switches, the choices of its lists, its tabs) and what the thing chosen can do, as its right click', 'Una ricerca delle azioni più intelligente (⌘J): oltre ai comandi trova ogni opzione della pagina (le voci dei suoi menu, gli interruttori, le scelte degli elenchi, le schede) e cosa si può fare con ciò che è selezionato, come col clic destro'],
      ['Right click: the app’s own menu everywhere instead of the browser’s, with the actions of what is under the pointer (the ⋮ of a card or a row), of links, of the text and of the fields; Shift + right click still opens the browser’s menu. On phones and tablets a long press opens it; it never takes the focus from the text you are writing', 'Clic destro: il menu dell’app ovunque al posto di quello del browser, con le azioni di ciò che è sotto il puntatore (il ⋮ di una scheda o di una riga), dei collegamenti, del testo e dei campi; Maiusc + clic destro apre ancora il menu del browser. Su telefoni e tablet si apre con una pressione prolungata; non toglie mai il cursore dal testo che stai scrivendo'],
      ['Bars of your own (⋮ → Customise the bars): the title bar and the tools, with the buttons you choose, in your order and with the spaces you want, seeing a preview; every shape of the library can have its own button; it follows your account', 'Barre tutte tue (⋮ → Personalizza le barre): barra del titolo e strumenti con i pulsanti che scegli, nell’ordine e con gli spazi che vuoi, vedendone l’anteprima; ogni forma della libreria può avere il suo pulsante; segue il tuo account'],
    ],
  },
  {
    v: '1.0.0', date: '2026-11-27', items: [
      ['First version: flowcharts, org charts, mind maps and simple schemes on a page without edges, with grid, snap and alignment guides', 'Prima versione: diagrammi di flusso, organigrammi, mappe mentali e schemi semplici su una pagina senza bordi, con griglia, aggancio e guide di allineamento'],
      ['Eleven shapes with their text and styles; straight, elbow and curved connectors that stay attached, with heads and labels', 'Undici forme con il loro testo e i loro stili; connettori diritti, a gomito e curvi che restano attaccati, con punte ed etichette'],
      ['Groups, order, locking, align and distribute; automatic layout of trees (org chart, tree, mind map); a map of the whole diagram', 'Gruppi, ordine, blocco, allinea e distribuisci; disposizione automatica degli alberi (organigramma, albero, mappa mentale); una mappa di tutto il diagramma'],
      ['.savdia files (the format of SavDiagrams, also in SavDrive), PNG, SVG and PDF; diagrams.net (.drawio) files open too', 'File .savdia (il formato di SavDiagrams, anche in SavDrive), PNG, SVG e PDF; si aprono anche i file di diagrams.net (.drawio)'],
      ['From the sketch to the diagram: a board of SavWhiteboard becomes a diagram; diagrams go into SavDocuments and SavPresentations', 'Dallo schizzo al diagramma: una lavagna di SavWhiteboard diventa un diagramma; i diagrammi entrano in SavDocuments e SavPresentations'],
    ],
  },
];
