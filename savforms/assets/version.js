/** The version of SavForms (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '1.1.1';

export const CHANGES = [
  {
    v: '1.1.1', date: '2026-11-28', items: [
      ['Customise the bars: the preview scrolls when the bar is long and shows “Title” instead of the name of the file; on phones and tablets the list scrolls with a finger (the handle moves the rows)', 'Personalizza le barre: l’anteprima scorre quando la barra è lunga e mostra «Titolo» invece del nome del file; su telefoni e tablet l’elenco scorre con il dito (la maniglia sposta le righe)'],
    ],
  },
  {
    v: '1.1.0', date: '2026-11-28', items: [
      ['New models: survey with branches (different questions by answer), appointment, volunteers and course evaluation', 'Nuovi modelli: sondaggio con percorsi (domande diverse secondo la risposta), appuntamento, volontari e valutazione del corso'],
      ['A smarter search of actions (⌘J): besides the commands it finds every option of the page (the items of its menus, its switches, the choices of its lists, its tabs) and what the thing chosen can do, as its right click', 'Una ricerca delle azioni più intelligente (⌘J): oltre ai comandi trova ogni opzione della pagina (le voci dei suoi menu, gli interruttori, le scelte degli elenchi, le schede) e cosa si può fare con ciò che è selezionato, come col clic destro'],
      ['Conditional answers: a question with one choice can send to a section by the answer, and a section can say where to go once done (on, to a section further down, or the end); the questions of the sections skipped are neither asked nor required', 'Risposte condizionate: una domanda a scelta singola può mandare a una sezione in base alla risposta, e una sezione può dire dove andare quando finisce (avanti, a una sezione più in basso o alla fine); le domande delle sezioni saltate non vengono chieste né sono obbligatorie'],
      ['The question being edited is made of the fields of SavComponents, as in the other apps, with a clearer card', 'La domanda che si modifica è fatta con i campi di SavComponents, come nelle altre app, con una scheda più chiara'],
      ['Right click: the app’s own menu everywhere instead of the browser’s, with the actions of what is under the pointer (the ⋮ of a card or a row), of links, of the text and of the fields; Shift + right click still opens the browser’s menu. On phones and tablets a long press opens it; it never takes the focus from the text you are writing', 'Clic destro: il menu dell’app ovunque al posto di quello del browser, con le azioni di ciò che è sotto il puntatore (il ⋮ di una scheda o di una riga), dei collegamenti, del testo e dei campi; Maiusc + clic destro apre ancora il menu del browser. Su telefoni e tablet si apre con una pressione prolungata; non toglie mai il cursore dal testo che stai scrivendo'],
      ['Bars of your own (⋮ → Customise the bars): the title bar of a form with the buttons you choose (preview, share, duplicate, download, print), in your order and with the spaces you want, seeing a preview; it follows your account', 'Barre tutte tue (⋮ → Personalizza le barre): la barra del titolo di un modulo con i pulsanti che scegli (anteprima, condividi, duplica, scarica, stampa), nell’ordine e con gli spazi che vuoi, vedendone l’anteprima; segue il tuo account'],
    ],
  },
  {
    v: '1.0.0', date: '2026-11-26', items: [
      ['First version: forms, surveys and quizzes, part of SavOffice', 'Prima versione: moduli, sondaggi e quiz, parte di SavOffice'],
      ['Fourteen kinds of questions: texts, choices, scales, stars, grids, rankings, numbers, dates; pages, texts and pictures between them', 'Quattordici tipi di domande: testi, scelte, scale, stelle, griglie, classifiche, numeri, date; pagine, testi e immagini tra una e l’altra'],
      ['A link to share, no account needed to answer; one answer per person, answers that can be changed, a limit of answers', 'Un link da condividere, senza account per rispondere; una risposta a persona, risposte modificabili, un limite di risposte'],
      ['A chart for every question, the answers one by one, CSV for spreadsheets', 'Un grafico per ogni domanda, le risposte una per una, CSV per i fogli di calcolo'],
      ['Opening and deadline: the deadline shows in SavCalendar, and the form closes by itself', 'Apertura e scadenza: la scadenza compare in SavCalendar e il modulo si chiude da solo'],
      ['Quizzes with points, an email at every answer, colours and fonts of your own, .savfor files', 'Quiz con punteggio, un’email a ogni risposta, colori e caratteri a scelta, file .savfor'],
    ],
  },
];
