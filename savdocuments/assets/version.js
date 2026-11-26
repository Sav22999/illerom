/** The version of SavDocuments (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '1.1.0';

export const CHANGES = [
  {
    v: '1.1.0', date: '2026-11-26', items: [
      ['Real footnotes: each note at the bottom of the page of its reference, on screen, in print and in PDF', 'Vere note a piè di pagina: ogni nota in fondo alla pagina del suo richiamo, a schermo, in stampa e in PDF'],
      ['Save as PDF writes the file at once, without the print window: same pages, selectable text, links and bookmarks', 'Salva come PDF crea subito il file, senza la finestra di stampa: stesse pagine, testo selezionabile, link e segnalibri'],
      ['Header and footer: a double click on the top or bottom margin of a page writes them; they are also among the things to insert', 'Intestazione e piè di pagina: un doppio clic sul margine alto o basso della pagina li scrive; sono anche tra gli inserimenti'],
      ['Page break: the caret goes to the new page at once, and the empty space after it is no longer a place to write', 'Interruzione di pagina: il cursore va subito alla pagina nuova, e lo spazio vuoto che lascia non è più un posto dove scrivere'],
      ['The picture button opens a window to search free pictures, use your pictures again or choose one from the device', 'Il pulsante Immagine apre una finestra per cercare immagini libere, riusare le tue immagini o sceglierne una dal dispositivo'],
      ['The Format panel opens by itself when a picture, chart or table is chosen', 'Il pannello Formato si apre da solo quando scegli un’immagine, un grafico o una tabella'],
      ['Downloads in one window of cards, as in SavPresentations', 'Download in un’unica finestra a schede, come in SavPresentations'],
      ['Settings in sections, the name of the page in the browser tab, the same icons as the other Sav apps', 'Impostazioni a sezioni, il nome della pagina nella scheda del browser, le stesse icone delle altre app Sav'],
      ['First page on phones: no animations on touch, a tidier top bar and list of features', 'Prima pagina sui telefoni: niente animazioni al tocco, barra in alto ed elenco delle funzioni più ordinati'],
    ],
  },
  {
    v: '1.0.0', date: '2026-11-25', items: [
      ['First version: real pages, rulers and margins, 43 templates, tables, charts, diagrams, shapes, formulas and QR codes', 'Prima versione: pagine vere, righelli e margini, 43 modelli, tabelle, grafici, schemi, forme, formule e codici QR'],
      ['Writing together, comments, personal notes, versions and sharing with roles and single-use links', 'Scrittura insieme, commenti, note personali, versioni e condivisione con ruoli e link usa e getta'],
      ['Word, .savdoc, HTML, EPUB, Markdown and text files; recent documents also offline', 'File Word, .savdoc, HTML, EPUB, Markdown e testo; i documenti recenti anche offline'],
    ],
  },
];
