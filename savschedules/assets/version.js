/** The version of SavSchedules (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '1.4.1';

export const CHANGES = [
  {
    v: '1.4.1', date: '2026-11-28', items: [
      ['On phones and tablets the places are in the bar at the bottom, as in every app of SavOffice; when they do not all fit, “More” opens an action sheet with the others', 'Su telefoni e tablet le sezioni sono nella barra in basso, come in ogni app di SavOffice; quando non ci stanno tutte, «Altro» apre un foglio di azioni con le altre'],
    ],
  },
  {
    v: '1.4.0', date: '2026-11-28', items: [
      ['A smarter search of actions (⌘J): besides the commands it finds every option of the page (the items of its menus, its switches, the choices of its lists, its tabs) and what the thing chosen can do, as its right click', 'Una ricerca delle azioni più intelligente (⌘J): oltre ai comandi trova ogni opzione della pagina (le voci dei suoi menu, gli interruttori, le scelte degli elenchi, le schede) e cosa si può fare con ciò che è selezionato, come col clic destro'],
      ['Right click: the app’s own menu everywhere instead of the browser’s, with the actions of what is under the pointer (the ⋮ of a card or a row), of links, of the text and of the fields; Shift + right click still opens the browser’s menu. On phones and tablets a long press opens it; it never takes the focus from the text you are writing', 'Clic destro: il menu dell’app ovunque al posto di quello del browser, con le azioni di ciò che è sotto il puntatore (il ⋮ di una scheda o di una riga), dei collegamenti, del testo e dei campi; Maiusc + clic destro apre ancora il menu del browser. Su telefoni e tablet si apre con una pressione prolungata; non toglie mai il cursore dal testo che stai scrivendo'],
    ],
  },
  {
    v: '1.3.0', date: '2026-11-26', items: [
      ['The editor is arranged as SavDocuments and SavPresentations: the panels open from a rail of icons on the right (at the bottom on phones), and close with a second press', 'L’editor è disposto come SavDocuments e SavPresentations: i pannelli si aprono da una barra di icone a destra (in basso sui telefoni) e si chiudono con una seconda pressione'],
      ['Top bar of the editor as in the other apps: whether it is saved under the title, Share, Download and a menu with the other actions', 'Barra in alto dell’editor come nelle altre app: sotto il titolo se è salvato, Condividi, Scarica e un menu con le altre azioni'],
      ['New: a name and a choice, then Create; the ready-made starts are now called templates', 'Nuovo: un nome e una scelta, poi Crea; le partenze pronte ora si chiamano modelli'],
      ['Same words as the other apps: My schedules, Favourites, Start a schedule, All templates', 'Le stesse parole delle altre app: Le mie pianificazioni, Preferiti, Inizia una pianificazione, Tutti i modelli'],
    ],
  },
  {
    v: '1.2.0', date: '2026-11-26', items: [
      ['New kind: slot assignment. Everyone answers available, I can free myself or not available for every slot; then each person gets a slot of their own', 'Nuovo tipo: assegnazione slot. Ognuno risponde disponibile, posso liberarmi o non disponibile per ogni slot; poi ogni persona riceve uno slot tutto suo'],
      ['The recommended solution and the other possible ones; whoever answers first has priority', 'La soluzione consigliata e le altre possibili; chi risponde per primo ha la precedenza'],
      ['People who cannot be placed are pointed out and can be forced into a free slot, or moved by hand', 'Chi non si riesce a sistemare viene segnalato e può essere forzato in uno slot libero, o spostato a mano'],
      ['An email when all the people expected have answered, and to each one with their slot', 'Un’email quando hanno risposto tutte le persone attese, e a ognuno con il suo slot'],
    ],
  },
  {
    v: '1.1.0', date: '2026-11-26', items: [
      ['Settings in sections, as in SavDocuments and SavPresentations', 'Impostazioni a sezioni, come in SavDocuments e SavPresentations'],
      ['The star of favourites fills when it is on; the editor shows whether the changes are saved with an icon', 'La stella dei preferiti si riempie quando è attiva; l’editor mostra con un’icona se le modifiche sono salvate'],
      ['Home: the title first, then the box to start a new one and the recent ones; "Open a file" next to the title', 'Home: prima il titolo, poi il riquadro per iniziarne una nuova e le recenti; «Apri un file» accanto al titolo'],
      ['The same icons, menus and page names as the other Sav apps', 'Le stesse icone, gli stessi menu e nomi delle pagine delle altre app Sav'],
      ['First page on phones: no animations on touch, a tidier top bar and list of features', 'Prima pagina sui telefoni: niente animazioni al tocco, barra in alto ed elenco delle funzioni più ordinati'],
    ],
  },
  {
    v: '1.0.0', date: '2026-11-26', items: [
      ['First version: date polls and slot booking, with unique places and a limit per person', 'Prima versione: sondaggi sulle date e prenotazione di posti, con posti unici e un limite a persona'],
      ['No account needed to answer; results, choice of the date, an email at each answer, calendar files', 'Nessun account per rispondere; risultati, scelta della data, un’email a ogni risposta, file per il calendario'],
      ['.savsch files, CSV of the answers, QR codes and links to share', 'File .savsch, CSV delle risposte, codici QR e link da condividere'],
    ],
  },
];
