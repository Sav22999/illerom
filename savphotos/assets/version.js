/** The version of SavPhotos (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '1.1.4';
export const CHANGES = [
  {
    v: '1.1.4', date: '2026-11-28', items: [
      ['“More” and the other action sheets are now the action sheet of SavComponents: drag its handle down to close it, the place shown marked with a tick', '«Altro» e gli altri fogli di azioni sono ora il foglio di azioni di SavComponents: trascina la maniglia in giù per chiuderlo, la sezione mostrata segnata con una spunta'],
    ],
  },
  {
    v: '1.1.3', date: '2026-11-28', items: [
      ['Fixed: the sheets that rise from the bottom on phones (menus, action sheets) reach the edges of the screen, without a strip along the sides', 'Corretto: i fogli che salgono dal basso sui telefoni (menu, fogli di azioni) arrivano ai bordi dello schermo, senza una striscia ai lati'],
    ],
  },
  {
    v: '1.1.2', date: '2026-11-28', items: [
      ['On phones and tablets the places are in the bar at the bottom, as in every app of SavOffice; when they do not all fit, “More” opens an action sheet with the others', 'Su telefoni e tablet le sezioni sono nella barra in basso, come in ogni app di SavOffice; quando non ci stanno tutte, «Altro» apre un foglio di azioni con le altre'],
    ],
  },
  {
    v: '1.1.1', date: '2026-11-28', items: [
      ['Keyboard shortcuts: a letter is never a shortcut by itself any more, only with ⌥⇧ (Alt+Shift), so typing or a key pressed by mistake does nothing; the arrows, / and ? work as before', 'Scorciatoie da tastiera: una lettera da sola non è più mai una scorciatoia, solo con ⌥⇧ (Alt+Shift), così scrivere o premere un tasto per sbaglio non fa nulla; frecce, / e ? funzionano come prima'],
    ],
  },
  {
    v: '1.1.0', date: '2026-11-28', items: [
      ['A smarter search of actions (⌘J): besides the commands it finds every option of the page (the items of its menus, its switches, the choices of its lists, its tabs) and what the thing chosen can do, as its right click', 'Una ricerca delle azioni più intelligente (⌘J): oltre ai comandi trova ogni opzione della pagina (le voci dei suoi menu, gli interruttori, le scelte degli elenchi, le schede) e cosa si può fare con ciò che è selezionato, come col clic destro'],
      ['Right click: the app’s own menu everywhere instead of the browser’s, with the actions of what is under the pointer (the ⋮ of a card or a row), of links, of the text and of the fields; Shift + right click still opens the browser’s menu. On phones and tablets a long press opens it; it never takes the focus from the text you are writing', 'Clic destro: il menu dell’app ovunque al posto di quello del browser, con le azioni di ciò che è sotto il puntatore (il ⋮ di una scheda o di una riga), dei collegamenti, del testo e dei campi; Maiusc + clic destro apre ancora il menu del browser. Su telefoni e tablet si apre con una pressione prolungata; non toglie mai il cursore dal testo che stai scrivendo'],
      ['Sort the photos (newest or oldest first, by name, the largest first) and filter them (photos only, videos only, favourites only): the choice stays', 'Ordina le foto (dalla più recente o meno recente, per nome, dalla più grande) e filtrale (solo foto, solo video, solo preferiti): la scelta resta'],
    ],
  },
  {
    v: '1.0.0', date: '2026-11-27',
    items: [
      ['The photos and videos of SavDrive, day by day, with the jump to a month, the search by name and three sizes of the grid, in the same layout of SavDrive', 'Le foto e i video di SavDrive, giorno per giorno, con il salto a un mese, la ricerca per nome e tre dimensioni della griglia, con la stessa disposizione di SavDrive'],
      ['Backup from the phone or the computer into SavDrive (SavPhotos › year): what is already there is not sent again; the date taken comes from the photo itself', 'Backup dal telefono o dal computer in SavDrive (SavPhotos › anno): quello che c’è già non viene rimandato; la data di scatto viene dalla foto stessa'],
      ['The preview of SavDrive made for photos: swipes, zoom, details (date, camera, place, the folder in SavDrive), favourites, download, trash', 'L’anteprima di SavDrive pensata per le foto: swipe, zoom, dettagli (data, fotocamera, luogo, la cartella in SavDrive), preferiti, download, cestino'],
      ['Albums, with a link to share one with anyone; a folder uploaded (or dropped) becomes an album with its name, and the files that are not photos or videos are skipped and listed', 'Album, con un link per condividerne uno con chiunque; una cartella caricata (o trascinata) diventa un album con il suo nome, e i file che non sono foto o video vengono saltati ed elencati'],
      ['Choosing many as in SavDrive (press and drag draws a rectangle); albums managed from the menu and the right click of their cards (rename, share, delete), and chosen many at a time like the photos', 'Selezione multipla come in SavDrive (premi e trascina per disegnare un rettangolo); album gestiti dal menu e dal clic destro delle schede (rinomina, condividi, elimina), e selezionabili a più alla volta come le foto'],
      ['Never too many requests to the server: a steady pace, one request for each photo of a backup, the small pictures 40 at a time and kept in the browser; the shape of each photo (a skeleton) while it arrives; the preview always shows the whole photo', 'Mai troppe richieste al server: un ritmo costante, una richiesta per ogni foto del backup, le miniature 40 alla volta e conservate nel browser; la sagoma di ogni foto (skeleton) mentre arriva; l’anteprima mostra sempre la foto intera'],
      ['The admins choose who can use SavPhotos', 'Gli amministratori scelgono chi può usare SavPhotos'],
    ],
  },
];
