/** The version of SavDrive (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '1.1.2';

export const CHANGES = [
  {
    v: '1.1.2', date: '2026-11-28', items: [
      ['On phones and tablets the places are in the bar at the bottom, as in every app of SavOffice; when they do not all fit, “More” opens an action sheet with the others', 'Su telefoni e tablet le sezioni sono nella barra in basso, come in ogni app di SavOffice; quando non ci stanno tutte, «Altro» apre un foglio di azioni con le altre'],
    ],
  },
  {
    v: '1.1.1', date: '2026-11-28', items: [
      ['Fixed: on phones and tablets every place (Trash, Temporary, Recent, Starred…) starts at the top of the page again, not halfway down', 'Corretto: su telefoni e tablet ogni sezione (Cestino, Temporanei, Recenti, Speciali…) torna a cominciare in cima alla pagina, non a metà'],
    ],
  },
  {
    v: '1.1.0', date: '2026-11-28', items: [
      ['A smarter search of actions (⌘J): besides the commands it finds every option of the page (the items of its menus, its switches, the choices of its lists, its tabs) and what the thing chosen can do, as its right click', 'Una ricerca delle azioni più intelligente (⌘J): oltre ai comandi trova ogni opzione della pagina (le voci dei suoi menu, gli interruttori, le scelte degli elenchi, le schede) e cosa si può fare con ciò che è selezionato, come col clic destro'],
      ['Right click: the app’s own menu everywhere instead of the browser’s, with the actions of what is under the pointer (the ⋮ of a card or a row), of links, of the text and of the fields; Shift + right click still opens the browser’s menu. On phones and tablets a long press opens it; it never takes the focus from the text you are writing', 'Clic destro: il menu dell’app ovunque al posto di quello del browser, con le azioni di ciò che è sotto il puntatore (il ⋮ di una scheda o di una riga), dei collegamenti, del testo e dei campi; Maiusc + clic destro apre ancora il menu del browser. Su telefoni e tablet si apre con una pressione prolungata; non toglie mai il cursore dal testo che stai scrivendo'],
    ],
  },
  {
    v: '1.0.0', date: '2026-11-27', items: [
      ['Temporary files, as with WeTransfer: upload files only for a link, or make a link to files and folders of the drive; it expires (1 hour to 30 days, or a date), with an optional password, limit of downloads, email at each download and message. Who receives it downloads without an account (many files as a ZIP or one by one); the files uploaded for it are deleted when it ends. The place Temporary lists the links: time left, downloads, copy, extend, revoke', 'File temporanei, come con WeTransfer: carica file solo per un link, oppure crea un link a file e cartelle del drive; scade (da 1 ora a 30 giorni, o una data), con password, limite di download, email a ogni download e messaggio facoltativi. Chi lo riceve scarica senza account (più file in uno ZIP o uno per uno); i file caricati apposta vengono eliminati quando finisce. Il luogo Temporanei elenca i link: tempo rimasto, download, copia, prolunga, revoca'],
      ['First version: files and folders, uploads of any size (folders too, by dragging them in), previews of pictures, PDF, videos, music and text', 'Prima versione: file e cartelle, caricamenti di qualsiasi dimensione (anche intere cartelle, trascinandole), anteprime di immagini, PDF, video, musica e testo'],
      ['New documents, spreadsheets, presentations, books, whiteboards and notebooks of SavOffice, made in the drive and opened in their app', 'Nuovi documenti, fogli di calcolo, presentazioni, libri, lavagne e quaderni di SavOffice, creati nel drive e aperti nella loro app'],
      ['In each app the cloud next to the grid of the apps saves the file back into the drive, or a copy of any document', 'In ogni app la nuvola accanto alla griglia delle app salva il file nel drive, o una copia di qualsiasi documento'],
      ['500 MB for each person, one space for the whole of SavOffice (every app counts in it); the admins choose the space of everyone (also unlimited), and activate or deactivate accounts', '500 MB per ogni persona, un solo spazio per tutta SavOffice (ogni app conta); gli amministratori scelgono lo spazio di ciascuno (anche illimitato) e attivano o disattivano gli account'],
      ['Folders and files shared with people, with six levels (view, read, comment, write, move, delete), inherited by the folders inside and with exceptions lower down; comments; Shared with me', 'Cartelle e file condivisi con persone, con sei livelli (visione, lettura, commento, scrittura, spostare, eliminare), ereditati dalle cartelle interne e con eccezioni più in basso; commenti; Condivisi con me'],
      ['Previews in the cards (pictures, text and JSON, documents, spreadsheets and slides of SavOffice), off at first, turned on in Settings; every file opens its preview first, with Open in, Download and Delete', 'Anteprime nelle schede (immagini, testo e JSON, documenti, fogli e slide di SavOffice), spente all’inizio, si accendono nelle Impostazioni; ogni file apre prima la sua anteprima, con Apri in, Scarica ed Elimina'],
      ['A panel of details on the right (dates, place, author, size, the last change inside a folder, where and when a photo was taken); a file with the same name asks whether to replace it or keep both; files can be dropped anywhere on the page', 'Un pannello dei dettagli a destra (date, posizione, autore, dimensione, ultima modifica dentro una cartella, dove e quando è stata scattata una foto); un file con lo stesso nome chiede se sostituirlo o tenerli entrambi; i file si rilasciano ovunque nella pagina'],
      ['What is inside ZIP, TAR, TAR.GZ and RAR archives, shown as a tree in the preview and in the cards, without extracting anything', 'Il contenuto degli archivi ZIP, TAR, TAR.GZ e RAR, mostrato ad albero nell\'anteprima e nelle schede, senza estrarre nulla'],
      ['Starred, recent, trash for 30 days, links to share a file, coloured folders', 'Speciali, recenti, cestino per 30 giorni, link per condividere un file, cartelle colorate'],
      ['Vault: a place in the side menu where files and their names are encrypted in your browser (end to end), opened with a PIN of 6 or 8 digits asked every time (or remembered for 30 minutes); a recovery password, made by the system and shown once, sets a new PIN; without both, a reset deletes the content after 30 days unless stopped; it counts in the space, has no previews on the server, no search and no sharing', 'Vault: un luogo nel menu laterale dove file e nomi sono cifrati nel tuo browser (end-to-end), aperto con un PIN di 6 o 8 cifre chiesto ogni volta (o ricordato per 30 minuti); una password di ripristino, generata dal sistema e mostrata una volta, imposta un nuovo PIN; senza entrambi, un ripristino elimina il contenuto dopo 30 giorni se non lo annulli; conta nello spazio, niente anteprime sul server, niente ricerca né condivisione'],
    ],
  },
];
