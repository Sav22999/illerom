/** The version of SavWhiteboard (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '1.2.2';

export const CHANGES = [
  {
    v: '1.2.2', date: '2026-11-28', items: [
      ['On phones and tablets the places are in the bar at the bottom, as in every app of SavOffice; when they do not all fit, “More” opens an action sheet with the others', 'Su telefoni e tablet le sezioni sono nella barra in basso, come in ogni app di SavOffice; quando non ci stanno tutte, «Altro» apre un foglio di azioni con le altre'],
    ],
  },
  {
    v: '1.2.1', date: '2026-11-28', items: [
      ['Faster on tablets: the stroke being drawn and the circle of the eraser are on a layer of their own, so the board is not painted again at every movement; the small preview waits until the pen is lifted, and the eraser does less work on touch screens', 'Più veloce sui tablet: il tratto che stai disegnando e il cerchio della gomma stanno su un livello a parte, così la lavagna non viene ridisegnata a ogni movimento; la piccola anteprima aspetta che il pennino si sollevi, e la gomma lavora meno sugli schermi touch'],
      ['Keyboard shortcuts: a letter is never a shortcut by itself any more, only with ⌥⇧ (Alt+Shift), so typing or a key pressed by mistake does nothing; the arrows, / and ? work as before', 'Scorciatoie da tastiera: una lettera da sola non è più mai una scorciatoia, solo con ⌥⇧ (Alt+Shift), così scrivere o premere un tasto per sbaglio non fa nulla; frecce, / e ? funzionano come prima'],
      ['Customise the bars: the preview scrolls when the bar is long and shows “Title” instead of the name of the file; on phones and tablets the list scrolls with a finger (the handle moves the rows)', 'Personalizza le barre: l’anteprima scorre quando la barra è lunga e mostra «Titolo» invece del nome del file; su telefoni e tablet l’elenco scorre con il dito (la maniglia sposta le righe)'],
    ],
  },
  {
    v: '1.2.0', date: '2026-11-28', items: [
      ['Faster writing and erasing, also with long strokes; the palm resting on the screen no longer stops the stylus or moves the board, and a stylus that lands after the palm writes at once', 'Scrittura e cancellazione più veloci, anche con tratti lunghi; il palmo appoggiato sullo schermo non ferma più il pennino né sposta la lavagna, e il pennino che si appoggia dopo il palmo scrive subito'],
      ['New boards to start from: corkboard, night grid, mint dots, cream lines and isometric slate', 'Nuove lavagne da cui partire: bacheca di sughero, quadretti notte, puntini menta, righe crema e ardesia isometrica'],
      ['Boards together: share a board with other people, who can draw and write on it at the same time as you (or only look at it); their changes appear by themselves, and you see who is there; the same goes for your own devices (write on a tablet, watch it on the computer)', 'Lavagne insieme: condividi una lavagna con altre persone, che possono disegnare e scrivere insieme a te nello stesso momento (o solo guardarla); le loro modifiche compaiono da sole, e vedi chi c’è; lo stesso vale per i tuoi dispositivi (scrivi dal tablet, guardi dal computer)'],
      ['A precise eraser: it cuts only the part of a stroke it passes over, even with thick lines and fast movements; its circle follows the pointer while erasing, and with a finger it also shows above it, so you see how big it is (and in the middle of the page when you choose a size)', 'Una gomma precisa: cancella solo la parte del tratto su cui passa, anche con linee spesse e movimenti veloci; il suo cerchio segue il puntatore mentre cancelli e, con il dito, compare anche sopra di esso, così ne vedi la grandezza (e al centro della pagina quando scegli una misura)'],
      ['Tablets and iPad: a long tap no longer selects the text of the page, the zoom no longer covers the tools, and the Pencil no longer writes into a text field left open', 'Tablet e iPad: un tocco lungo non seleziona più il testo della pagina, lo zoom non copre più gli strumenti e la Pencil non scrive più in un campo di testo rimasto aperto'],
      ['A smarter search of actions (⌘J): besides the commands it finds every option of the page (the items of its menus, its switches, the choices of its lists, its tabs) and what the thing chosen can do, as its right click', 'Una ricerca delle azioni più intelligente (⌘J): oltre ai comandi trova ogni opzione della pagina (le voci dei suoi menu, gli interruttori, le scelte degli elenchi, le schede) e cosa si può fare con ciò che è selezionato, come col clic destro'],
      ['Right click: the app’s own menu everywhere instead of the browser’s, with the actions of what is under the pointer (the ⋮ of a card or a row), of links, of the text and of the fields; Shift + right click still opens the browser’s menu. On phones and tablets a long press opens it; it never takes the focus from the text you are writing', 'Clic destro: il menu dell’app ovunque al posto di quello del browser, con le azioni di ciò che è sotto il puntatore (il ⋮ di una scheda o di una riga), dei collegamenti, del testo e dei campi; Maiusc + clic destro apre ancora il menu del browser. Su telefoni e tablet si apre con una pressione prolungata; non toglie mai il cursore dal testo che stai scrivendo'],
      ['Bars of your own (⋮ → Customise the bars): the title bar and the tools, with the buttons you choose, in your order and with the spaces you want, seeing a preview; it follows your account', 'Barre tutte tue (⋮ → Personalizza le barre): barra del titolo e strumenti con i pulsanti che scegli, nell’ordine e con gli spazi che vuoi, vedendone l’anteprima; segue il tuo account'],
    ],
  },
  {
    v: '1.1.0', date: '2026-11-26', items: [
      ['Pictures as in SavPresentations: up to 15 MB, your own pictures, and a search of free portals (Openverse, Wikimedia Commons…)', 'Immagini come in SavPresentations: fino a 15 MB, le tue immagini e la ricerca nei portali liberi (Openverse, Wikimedia Commons…)'],
      ['The source of a picture can be written under it, and it always is when the licence asks for it', 'La fonte di un’immagine si può scrivere sotto di essa, e c’è sempre quando la licenza lo chiede'],
    ],
  },
  {
    v: '1.0.0', date: '2026-11-26', items: [
      ['First version: a board without edges that grows in every direction, with pen, pencil, highlighter, eraser and laser pointer', 'Prima versione: una lavagna senza bordi che cresce in ogni direzione, con penna, matita, evidenziatore, gomma e puntatore laser'],
      ['Dots, squares, lines or isometric dots as a watermark, on any background colour (blackboard too)', 'Puntini, quadretti, righe o puntini isometrici come filigrana, su qualsiasi colore di sfondo (anche lavagna nera)'],
      ['Typed text, sticky notes, shapes, arrows and pictures, which can be selected, moved, resized and put in order', 'Testo digitato, foglietti, forme, frecce e immagini, che si selezionano, spostano, ridimensionano e mettono in ordine'],
      ['Pressure of the pen, two fingers to move and zoom; with a stylus, the finger only moves the board', 'Pressione della penna, due dita per spostare e ingrandire; con un pennino il dito sposta soltanto la lavagna'],
      ['.savwhi files (the format of SavWhiteboard), PNG, SVG and PDF; the same account as SavSchedules and SavCalendar', 'File .savwhi (il formato di SavWhiteboard), PNG, SVG e PDF; lo stesso account di SavSchedules e SavCalendar'],
    ],
  },
];
