/** The version of SavPresentations (in the footer) and what changed in each one (the page ?p=changelog). Newest first. */
export const VERSION = '1.1.0';

export const CHANGES = [
  {
    v: '1.1.0', date: '2026-11-26', items: [
      ['Links on elements: to a slide of the presentation or to a page outside, which opens in a new tab after asking', 'Link sugli elementi: a una slide della presentazione o a una pagina esterna, che si apre in una nuova scheda dopo una conferma'],
      ['Videos play in the SavComponents player, and their corners hold also when the video is zoomed', 'I video si riproducono nel player di SavComponents, e gli angoli arrotondati restano anche con il video ingrandito'],
      ['Versions in a side panel, as in SavDocuments', 'Le versioni in un pannello laterale, come in SavDocuments'],
      ['A download button in the top bar; the command palette is Ctrl/⌘+J and Ctrl/⌘+K adds a link, as in SavDocuments', 'Un pulsante Scarica nella barra in alto; la palette dei comandi è Ctrl/⌘+J e Ctrl/⌘+K aggiunge un link, come in SavDocuments'],
      ['Customising the toolbar and the Simple/Advanced mode are in the ⋮ menu', 'Personalizzare la barra e la modalità Semplice/Avanzata sono nel menu ⋮'],
      ['The footer of the home stays at the bottom; favourites, icons and page names as in the other Sav apps', 'Il footer della home resta in fondo; preferiti, icone e nomi delle pagine come nelle altre app Sav'],
      ['First page on phones: no animations on touch, a tidier top bar and list of features', 'Prima pagina sui telefoni: niente animazioni al tocco, barra in alto ed elenco delle funzioni più ordinati'],
    ],
  },
  {
    v: '1.0.0', date: '2026-11-25', items: [
      ['First version: themes and layouts that already look good, simple and advanced editing, charts, tables, shapes, icons, pictures and videos', 'Prima versione: temi e layout che stanno già bene, modifica semplice e avanzata, grafici, tabelle, forme, icone, immagini e video'],
      ['Live collaboration, comments, personal notes, versions, sharing by page, presenter view', 'Collaborazione dal vivo, commenti, note personali, versioni, condivisione per pagina, vista relatore'],
      ['PDF, PowerPoint, OpenDocument and .savpre files; presentations kept only on this device', 'File PDF, PowerPoint, OpenDocument e .savpre; presentazioni tenute solo su questo dispositivo'],
    ],
  },
];
