<?php
/**
 * The projects of the portal: one entry each, shown in this order.
 *
 *   cat        games | work | home | learn
 *   level      1 = in preparation, 2 = in testing, 3 = stable   (the three bars of the mark)
 *   account    none | optional | required
 *   offline    works without a connection after the first visit
 *   play       id on Google Play (or '')
 *   url        where the app lives: /<slug>/ here, or a full address elsewhere; '' = it cannot be opened yet
 *   source     folder in the repository of $site['source'], or a full address; '' = not published yet
 *   privacy    address of its privacy notice, relative to the app ('' = none)
 *   shots      how many screenshots of a phone in assets/projects/<slug>/ (1.jpg, 2.jpg…)
 *   tablet     optional: how many from a tablet (t1.jpg, t2.jpg…, 1180 × 820)
 *   desk       optional: how many from a computer (d1.jpg, d2.jpg…, 1440 × 900)
 */
$five = ['en', 'it', 'fr', 'de', 'es'];
$two = ['en', 'it'];

return [
    'opennewsletter' => [
        'name' => 'OpenNewsletter', 'cat' => 'work', 'level' => 2, 'account' => 'required', 'offline' => false, 'play' => '',
        'url' => '/opennewsletter/', 'source' => 'opennewsletter', 'privacy' => 'terms.php', 'langs' => $two, 'shots' => 4, 'tablet' => 4, 'desk' => 4,
        'it' => ['Newsletter scritte, approvate e spedite in gruppo.',
            'Chi gestisce la newsletter di un’associazione raramente è una persona sola: qualcuno scrive, qualcun altro controlla, e nessuno vuole mandare per sbaglio un messaggio a centinaia di persone. OpenNewsletter dà a ogni gruppo i suoi ruoli e un passaggio di approvazione prima dell’invio.',
            ['Editor a trascinamento con modelli pronti o del gruppo', 'Proposta, approvazione e invio all’ora scelta', 'Iscritti in più lingue, pagina di iscrizione e widget per qualsiasi sito', 'Ogni gruppo spedisce dal proprio indirizzo email']],
        'en' => ['Newsletters written, approved and sent as a team.',
            'The newsletter of a club is rarely the work of one person: someone writes, someone else checks, and nobody wants a message to reach hundreds of people by mistake. OpenNewsletter gives each group its own roles and an approval step before anything is sent.',
            ['Drag-and-drop editor with ready templates or the group’s own', 'Proposal, approval and sending at the chosen time', 'Subscribers in several languages, a subscription page and a widget for any website', 'Each group sends from its own email address']],
    ],
    'savdocuments' => [
        'name' => 'SavDocuments', 'cat' => 'work', 'level' => 2, 'account' => 'optional', 'offline' => true, 'play' => '',
        'url' => '/savdocuments/', 'source' => 'savdocuments', 'privacy' => 'privacy.html', 'langs' => $two, 'shots' => 4,
        'it' => ['Documenti veri, senza ingombri.',
            'Un editor di documenti in cui prima viene la pagina e gli strumenti compaiono solo quando servono. Si può scrivere subito, anche senza account e senza connessione, oppure in più persone nello stesso momento. Apre e salva i file Word.',
            ['Pagine da A6 ad A3 con margini trascinabili, bordi, filigrana, intestazioni, note e sommario', 'Tabelle, immagini, grafici, schemi, forme, formule e codici QR', '43 modelli pronti, condivisione, commenti, versioni e scrittura in contemporanea', 'File .docx, .savdoc, PDF, EPUB, Markdown, pagina web e testo']],
        'en' => ['Real documents, without the clutter.',
            'A word processor where the page comes first and the tools appear only when you need them. You can write at once, even without an account or a connection, or together with other people at the same time. It opens and saves Word files.',
            ['Pages from A6 to A3 with draggable margins, borders, watermark, headers, notes and a table of contents', 'Tables, images, charts, diagrams, shapes, formulas and QR codes', '43 ready templates, sharing, comments, versions and writing together', '.docx, .savdoc, PDF, EPUB, Markdown, web page and plain text files']],
    ],
    'savpresentations' => [
        'name' => 'SavPresentations', 'cat' => 'work', 'level' => 2, 'account' => 'required', 'offline' => false, 'play' => '',
        'url' => '/savpresentations/', 'source' => 'savpresentations', 'privacy' => 'privacy.php', 'langs' => $two, 'shots' => 4, 'tablet' => 4, 'desk' => 4,
        'it' => ['Presentazioni, senza il peso.',
            'Un’alternativa aperta a Google Slides e PowerPoint Online: si apre subito, ha temi già belli e si lavora in più persone sulla stessa slide. Le presentazioni restano private, con link o con chi scegli tu, e si scaricano in PDF, PowerPoint e OpenDocument.',
            ['Temi e modelli, dai più puliti ai più colorati, in 16:9, A4, A3 e altri formati', 'Modifiche in contemporanea, commenti e note personali', 'Grafici, tabelle, icone e ricerca di immagini e video liberi', 'Permessi per ogni persona e link usa e getta']],
        'en' => ['Presentations, without the weight.',
            'An open alternative to Google Slides and PowerPoint Online: it opens at once, its themes already look good, and several people can work on the same slide. Presentations stay private, by link or with the people you choose, and download as PDF, PowerPoint and OpenDocument.',
            ['Themes and templates, from plain to bold, in 16:9, A4, A3 and other formats', 'Live editing together, comments and personal notes', 'Charts, tables, icons and a search for free pictures and videos', 'Permissions for each person and single-use links']],
    ],
    'chess' => [
        'name' => 'Chess', 'cat' => 'games', 'level' => 3, 'account' => 'none', 'offline' => true, 'play' => 'com.saverio.chess',
        'url' => '/chess/', 'source' => 'chess', 'privacy' => 'privacy.html', 'langs' => $five, 'shots' => 4,
        'it' => ['Scacchi con un amico, uno sconosciuto o il computer.',
            'Crea una stanza e manda il codice a un amico, cerca un avversario a caso, gioca in due sullo stesso dispositivo o sfida il computer. I suggerimenti spiegano perché una mossa è buona, non solo quale fare.',
            ['Stanze con codice e avversari a caso', 'Suggerimenti spiegati', 'Orologio, chat e storico delle mosse']],
        'en' => ['Chess with a friend, a stranger or the computer.',
            'Create a room and send the code to a friend, look for a random opponent, share one device or play the computer. The tips explain why a move is good, not only which one to play.',
            ['Rooms with a code and random opponents', 'Tips that explain the move', 'Clock, chat and move history']],
    ],
    'thinkhop' => [
        'name' => 'ThinkHop', 'cat' => 'games', 'level' => 3, 'account' => 'optional', 'offline' => true, 'play' => 'com.saverio.thinkhop',
        'url' => '/thinkhop/', 'source' => 'thinkhop', 'privacy' => 'privacy.html', 'langs' => $five, 'shots' => 4,
        'it' => ['Mille livelli di logica, uno più infido dell’altro.',
            'Bugiardi e sinceri, forzieri, mini sudoku, ragionamenti assurdi e trappole per chi risponde di fretta. I livelli sono divisi in mondi e diventano sempre più difficili.',
            ['1.000 livelli', 'Sfida del giorno con classifica', 'Amici e username solo se li vuoi']],
        'en' => ['A thousand logic levels, each sneakier than the last.',
            'Liars and truth-tellers, treasure chests, mini sudoku, absurd reasoning and traps for those who answer too fast. Levels are grouped into worlds and keep getting harder.',
            ['1,000 levels', 'A daily challenge with a ranking', 'Friends and a username only if you want them']],
    ],
    'foodtrack' => [
        'name' => 'FoodTrack', 'cat' => 'home', 'level' => 3, 'account' => 'required', 'offline' => false, 'play' => 'com.saverio.foodtrack',
        'url' => '/foodtrack/', 'source' => 'foodtrack', 'privacy' => 'privacy.html', 'langs' => $two, 'shots' => 4,
        'it' => ['Cosa c’è in frigo, e per quanto ancora.',
            'Segna quello che hai in frigo, freezer e dispensa: FoodTrack ti avvisa prima che scada. Puoi condividere gli spazi con chi vive con te, così la lista della spesa è una sola per tutti.',
            ['Avvisi prima della scadenza', 'Spazi e liste della spesa condivisi', 'Piano dei pasti e ricette con quello che hai già']],
        'en' => ['What is in the fridge, and for how long.',
            'Note what is in your fridge, freezer and pantry, and FoodTrack warns you before it expires. Share the spaces with the people you live with, so there is one shopping list for everybody.',
            ['Alerts before food expires', 'Shared spaces and shopping lists', 'Meal plan and recipes with what you already have']],
    ],
    'sudoku' => [
        'name' => 'Sudoku', 'cat' => 'games', 'level' => 3, 'account' => 'none', 'offline' => true, 'play' => 'com.saverio.sudoku',
        'url' => '/sudoku/', 'source' => 'sudoku', 'privacy' => 'privacy.html', 'langs' => $five, 'shots' => 4,
        'it' => ['Il classico, con suggerimenti che insegnano.',
            'Quattro difficoltà, note a matita che diventano penna con un tocco e suggerimenti che spiegano la logica della prossima mossa. Schemi e soluzioni si generano sul tuo dispositivo.',
            ['Quattro difficoltà', 'Note a matita e a penna', 'Controllo di una sola cella, senza rovinare il resto']],
        'en' => ['The classic, with tips that teach.',
            'Four difficulty levels, pencil notes that turn into ink with a tap, and tips that explain the logic of the next move. Grids and solutions are generated on your device.',
            ['Four difficulty levels', 'Pencil notes and ink', 'Check a single cell without spoiling the rest']],
    ],
    'mycurriculum' => [
        'name' => 'MyCurriculum', 'cat' => 'work', 'level' => 3, 'account' => 'required', 'offline' => false, 'play' => 'com.saverio.mycurriculum',
        'url' => '/mycurriculum/', 'source' => 'mycurriculum', 'privacy' => 'privacy.html', 'langs' => $two, 'shots' => 4, 'tablet' => 3, 'desk' => 3,
        'it' => ['Un solo CV, in tutte le lingue che ti servono.',
            'Scrivi il curriculum una volta e tieni una versione per ogni lingua. Ognuna si scarica in PDF con testo selezionabile, oppure si pubblica come pagina web che mostra solo quello che hai deciso tu.',
            ['Quattro modelli', 'Importa il CV che hai già dal suo PDF', 'Decidi campo per campo cosa è pubblico']],
        'en' => ['One CV, in every language you need.',
            'Write your CV once and keep a version for each language. Each one downloads as a PDF with selectable text, or goes online as a web page that shows only what you choose.',
            ['Four templates', 'Import the CV you already have from its PDF', 'Choose field by field what is public']],
    ],
    'forkville' => [
        'name' => 'Forkville', 'cat' => 'games', 'level' => 3, 'account' => 'required', 'offline' => false, 'play' => 'com.saverio.forkville',
        'url' => '/forkville/', 'source' => 'forkville', 'privacy' => 'privacy.html', 'langs' => $two, 'shots' => 4,
        'it' => ['Il tuo ristorante in 3D, dall’orto al conto.',
            'Parti da un lotto vuoto, costruisci e arreda il locale, assumi cuochi e camerieri, coltiva gli ingredienti e migliora i piatti. Poi vai a vedere come se la cavano i ristoranti degli amici.',
            ['Costruzione e arredamento in 3D', 'Personale, orto e ricette', 'Visite agli amici e classifica settimanale']],
        'en' => ['Your own restaurant in 3D, from garden to bill.',
            'Start with an empty plot, build and furnish the place, hire chefs and waiters, grow ingredients and improve your dishes. Then go and see how your friends’ restaurants are doing.',
            ['Building and furnishing in 3D', 'Staff, garden and recipes', 'Visits to friends and a weekly ranking']],
    ],
    'prism-mine' => [
        'name' => 'Prism Mine', 'cat' => 'games', 'level' => 3, 'account' => 'none', 'offline' => true, 'play' => 'com.saverio.prismmine',
        'url' => '/prism-mine/', 'source' => 'prism-mine', 'privacy' => 'privacy.html', 'langs' => $five, 'shots' => 4,
        'it' => ['Trova le gemme nascoste leggendo la luce.',
            'Spara raggi in una miniera buia, guarda da dove escono e di che colore, e deduci dove sono le gemme. Da solo, con la miniera del giorno o in duello online.',
            ['Miniere da solo a più livelli', 'Una miniera nuova ogni giorno', 'Duelli sulla stessa miniera']],
        'en' => ['Find hidden gems by reading the light.',
            'Send beams into a dark mine, see where they come out and in which colour, and work out where the gems are. Alone, with the daily mine, or in online duels.',
            ['Solo mines on several levels', 'A new mine every day', 'Duels on the same mine']],
    ],
    'fucina' => [
        'name' => 'Fucina', 'cat' => 'learn', 'level' => 3, 'account' => 'required', 'offline' => false, 'play' => 'com.saverio.fucina',
        'url' => '/fucina/', 'source' => 'fucina', 'privacy' => 'privacy.html', 'langs' => $two, 'shots' => 4, 'tablet' => 4, 'desk' => 4,
        'it' => ['Imparare a programmare un livello alla volta.',
            'Da HTML, CSS e JavaScript a Python, Java, SQL, Kotlin, Swift e Rust: livelli sempre più difficili, esercizi veloci e piccoli giochi. Le Scintille che guadagni sbloccano i certificati.',
            ['Corsi su web, linguaggi e database', 'Sfida del giorno con classifica', 'Il codice che scrivi resta nel browser']],
        'en' => ['Learn to code one level at a time.',
            'From HTML, CSS and JavaScript to Python, Java, SQL, Kotlin, Swift and Rust: levels that get harder, quick drills and small games. The Sparks you earn unlock certificates.',
            ['Courses on the web, languages and databases', 'A daily challenge with a ranking', 'The code you write stays in your browser']],
    ],
    'connect-four' => [
        'name' => 'Connect Four', 'cat' => 'games', 'level' => 3, 'account' => 'none', 'offline' => true, 'play' => 'com.saverio.connectfour',
        'url' => '/connect-four/', 'source' => 'connect-four', 'privacy' => 'privacy.html', 'langs' => $five, 'shots' => 4,
        'it' => ['Quattro in fila, con i colori che vuoi.',
            'Il classico Forza Quattro: con un amico tramite codice, con un avversario a caso, sullo stesso dispositivo o contro il computer.',
            ['Online, in due o contro il computer', 'Dischi personalizzabili', 'Orologio e chat facoltativi']],
        'en' => ['Four in a row, in the colours you like.',
            'The classic four-in-a-row: with a friend and a code, with a random opponent, on the same device or against the computer.',
            ['Online, side by side or against the computer', 'Custom discs', 'Optional clock and chat']],
    ],
    'letterhop' => [
        'name' => 'LetterHop', 'cat' => 'games', 'level' => 3, 'account' => 'none', 'offline' => true, 'play' => 'com.saverio.letterhop',
        'url' => '/letterhop/', 'source' => 'letterhop', 'privacy' => 'privacy.html', 'langs' => $five, 'shots' => 4,
        'it' => ['Da una parola all’altra, una lettera per volta.',
            'Hai una parola di partenza e una di arrivo: cambia una lettera alla volta, e ogni passaggio deve essere una parola vera. Meno parole usi, più punti fai.',
            ['Tre livelli', 'Dizionari in cinque lingue', 'Le parole si controllano sul dispositivo']],
        'en' => ['From word to word, one letter at a time.',
            'You get a start word and a target word: change one letter at a time, and every step must be a real word. The fewer words you use, the more points you get.',
            ['Three levels', 'Dictionaries in five languages', 'Words are checked on your device']],
    ],
    'giftwise' => [
        'name' => 'Giftwise', 'cat' => 'home', 'level' => 3, 'account' => 'required', 'offline' => false, 'play' => 'com.saverio.giftwise',
        'url' => '/giftwise/', 'source' => 'giftwise', 'privacy' => 'privacy.html', 'langs' => $two, 'shots' => 4,
        'it' => ['Liste dei desideri che non rovinano la sorpresa.',
            'Crea una lista per ogni occasione. Chi ti segue si mette d’accordo su chi regala cosa e ne parla in una chat che tu non vedi mai.',
            ['Una lista per ogni occasione', '«Lo prendo io», visibile solo agli altri', 'Chat nascosta a chi riceve il regalo']],
        'en' => ['Wish lists that keep the surprise.',
            'Create a list for every occasion. The people who follow you agree on who gives what and talk about it in a chat you never see.',
            ['A list for every occasion', '“I’m getting it”, seen only by the others', 'A chat hidden from the person receiving the gift']],
    ],
    'sea-battle' => [
        'name' => 'Sea Battle', 'cat' => 'games', 'level' => 3, 'account' => 'none', 'offline' => true, 'play' => 'com.saverio.seabattle',
        'url' => '/sea-battle/', 'source' => 'sea-battle', 'privacy' => 'privacy.html', 'langs' => $five, 'shots' => 4,
        'it' => ['Nascondi la flotta, affonda l’altra.',
            'La battaglia navale di sempre: online con un amico o uno sconosciuto, sullo stesso dispositivo o contro il computer.',
            ['Online, in due o contro il computer', 'La tua flotta resta nascosta fino alla fine', 'Chat durante le partite online']],
        'en' => ['Hide your fleet, sink the other one.',
            'The naval battle everybody knows: online with a friend or a stranger, on the same device or against the computer.',
            ['Online, side by side or against the computer', 'Your fleet stays hidden until the end', 'Chat during online matches']],
    ],
    'faceguess' => [
        'name' => 'FaceGuess', 'cat' => 'games', 'level' => 3, 'account' => 'none', 'offline' => false, 'play' => 'com.saverio.faceguess',
        'url' => '/faceguess/', 'source' => 'faceguess', 'privacy' => 'privacy.html', 'langs' => $five, 'shots' => 3,
        'it' => ['Chi è? Con facce nuove a ogni partita.',
            'Un gioco di deduzione per due: fai domande da sì o no finché non resta una faccia sola. I personaggi si generano da capo ogni volta.',
            ['Personaggi sempre diversi', 'Online con un codice o di persona', 'Chat per fare le domande']],
        'en' => ['Who is it? With new faces every match.',
            'A deduction game for two: ask yes-or-no questions until only one face is left. The characters are generated from scratch each time.',
            ['Always different characters', 'Online with a code or in person', 'A chat to ask the questions']],
    ],
];
