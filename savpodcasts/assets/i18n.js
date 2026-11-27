/** Texts of the app, in English and Italian: the ones shared with SavSchedules and SavCalendar (accounts, settings), then the podcasts. */
const T = {
  cancel: ["Cancel","Annulla"],
  close: ["Close","Chiudi"],
  save: ["Save","Salva"],
  delete: ["Delete","Elimina"],
  create: ["Create","Crea"],
  add: ["Add","Aggiungi"],
  done: ["Done","Fatto"],
  copy: ["Copy","Copia"],
  copied: ["Copied","Copiato"],
  more: ["More","Altro"],
  retry: ["Try again","Riprova"],
  remove: ["Remove","Rimuovi"],
  name: ["Name","Nome"],
  search: ["Search","Cerca"],
  open: ["Open","Apri"],
  edit: ["Edit","Modifica"],
  home: ["Home","Home"],
  or: ["or","oppure"],
  yes: ["Yes","Sì"],
  no: ["No","No"],
  restore: ["Restore","Ripristina"],
  sign_in: ["Sign in","Accedi"],
  sign_up: ["Create account","Crea account"],
  sign_out: ["Sign out","Esci"],
  settings: ["Settings","Impostazioni"],
  your_name: ["Your name","Il tuo nome"],
  email: ["Email","Email"],
  password: ["Password","Password"],
  email_fixed: ["It cannot be changed later.","Non potrà essere cambiata in seguito."],
  pw_hint: ["At least 8 characters.","Almeno 8 caratteri."],
  accept: ["I accept the","Accetto i"],
  terms: ["terms","termini"],
  and_privacy: ["and the","e l’"],
  privacy: ["privacy notice","informativa sulla privacy"],
  terms_c: ["Terms","Termini"],
  forgot: ["Forgot your password?","Password dimenticata?"],
  forgot_text: ["We will send you a link to choose a new one.","Ti mandiamo un link per sceglierne una nuova."],
  send_link: ["Send the link","Invia il link"],
  link_sent: ["If the address has an account, the link is on its way.","Se l’indirizzo ha un account, il link è in arrivo."],
  check_email: ["Check your email","Controlla la tua email"],
  check_email_text: ["We sent you a link to confirm the address. If you do not see it, look in the spam.","Ti abbiamo mandato un link per confermare l’indirizzo. Se non lo vedi, guarda nello spam."],
  mail_off: ["Emails are switched off on this server.","Le email sono disattivate su questo server."],
  google_terms: ["By continuing with SavAccount you accept the terms and the privacy notice.","Continuando con SavAccount accetti i termini e l’informativa sulla privacy."],
  not_ready: ["Not ready yet","Non ancora pronto"],
  verify_title: ["Confirm your email","Conferma la tua email"],
  verify_text: ["Press the button to confirm the address and sign in.","Premi il pulsante per confermare l’indirizzo e accedere."],
  verify_btn: ["Confirm and sign in","Conferma e accedi"],
  reset_title: ["Choose a new password","Scegli una nuova password"],
  new_password: ["New password","Nuova password"],
  current_pw: ["Current password","Password attuale"],
  unverified: ["Confirm your email to go on","Conferma la tua email per continuare"],
  resend: ["Send the link again","Invia di nuovo il link"],
  resent: ["Link sent","Link inviato"],
  language: ["Language","Lingua"],
  how_title: ["How it works","Come funziona"],
  look_app: ["Look","Aspetto"],
  theme: ["Theme","Tema"],
  g_account: ["Account","Account"],
  change_pw: ["Change the password","Cambia la password"],
  set_pw: ["Set a password","Imposta una password"],
  password_t: ["To sign in with your email.","Per entrare con la tua email."],
  password_none_t: ["You sign in with SavAccount: you can add one.","Entri con SavAccount: puoi aggiungerne una."],
  sign_in_ways: ["Ways to sign in","Modi per entrare"],
  sign_in_ways_t: ["SavAccount and password, joined to this account.","SavAccount e password, collegati a questo account."],
  sign_out_t: ["On this device.","Su questo dispositivo."],
  settings_saved: ["Settings saved","Impostazioni salvate"],
  your_data: ["Your data","I tuoi dati"],
  export_data: ["Download my data","Scarica i miei dati"],
  delete_account: ["Delete the account","Elimina l’account"],
  delete_forever: ["Delete forever","Elimina per sempre"],
  changelog: ["What’s new","Novità"],
  current_v: ["current version","versione attuale"],
  err_server: ["Something went wrong. Try again in a moment.","Qualcosa è andato storto. Riprova tra poco."],
  err_network: ["No connection.","Nessuna connessione."],
  err_quota: ["Your space of SavOffice is full (one for every app, the space of SavDrive): free some to save more.","Il tuo spazio di SavOffice è pieno (uno per tutte le app, quello di SavDrive): liberane un po’ per salvare altro."],
  err_not_installed: ["The database is not configured yet.","Il database non è ancora configurato."],
  err_unauthenticated: ["Sign in again.","Accedi di nuovo."],
  err_disabled: ["This account is blocked.","Questo account è bloccato."],
  err_email_unverified: ["Confirm your email first.","Prima conferma la tua email."],
  err_csrf: ["The session expired: reload the page.","La sessione è scaduta: ricarica la pagina."],
  err_rate_limited: ["Too many attempts: wait a little.","Troppi tentativi: aspetta un po’."],
  err_bad_credentials: ["Wrong email or password.","Email o password errate."],
  err_name_required: ["Write your name.","Scrivi il tuo nome."],
  err_email_invalid: ["That email does not look right.","Questa email non sembra corretta."],
  err_password_short: ["The password needs at least 8 characters.","La password deve avere almeno 8 caratteri."],
  err_password_long: ["The password is too long.","La password è troppo lunga."],
  err_terms_required: ["Accept the terms to go on.","Accetta i termini per continuare."],
  err_token_invalid: ["The link expired or was already used.","Il link è scaduto o è già stato usato."],
  err_bad_password: ["Wrong password.","Password errata."],
  err_forbidden: ["You cannot do this.","Non puoi farlo."],
  err_bad_request: ["Something in the request is not right.","Qualcosa nella richiesta non va."],
  download: ["Download","Scarica"]
  ,

  // accounts and settings of SavPodcasts
  name_t: ['Shown on your account, in every app of SavOffice that uses it.', 'Compare sul tuo account, in ogni app di SavOffice che lo usa.'],
  settings_t: ['Your account (the same of SavSchedules, SavCalendar and SavNotes), how episodes play and the look.', 'Il tuo account (lo stesso di SavSchedules, SavCalendar e SavNotes), come vengono riprodotti gli episodi e l’aspetto.'],
  your_data_t: ['Download or delete what SavPodcasts keeps.', 'Scarica o elimina quello che SavPodcasts conserva.'],
  export_data_t: ['The podcasts you follow, where you stopped in each episode, starred episodes and queue, in one file.', 'I podcast che segui, dove ti sei fermato in ogni episodio, preferiti e coda, in un file.'],
  delete_account_short: ['It goes in every app of SavOffice, with everything in it.', 'Sparisce in tutte le app di SavOffice, con tutto quello che contiene.'],
  delete_account_text: ['The account is the same in every app of SavOffice: deleting it deletes it in all of them, for good, with everything it has there (documents, files, calendars, polls…), also for the people you shared them with.', 'L’account è lo stesso in tutte le app di SavOffice: eliminarlo lo elimina in tutte, per sempre, con tutto quello che contiene (documenti, file, calendari, sondaggi…), anche per le persone con cui li hai condivisi.'],
  shared_account: ['This is your SavSchedules, SavCalendar and SavNotes account too: name, password and ways to sign in are the same in all the apps.', 'Questo è anche il tuo account SavSchedules, SavCalendar e SavNotes: nome, password e modi di accesso sono gli stessi in tutte le app.'],
  changelog_t: ['The versions of SavPodcasts and what changed in each. This is version {v}.', 'Le versioni di SavPodcasts e cosa è cambiato in ognuna. Questa è la versione {v}.'],
  err_not_found: ['This podcast or episode is not here.', 'Questo podcast o episodio non c’è.'],
  err_too_many: ['You follow the most podcasts there can be (1000).', 'Segui già il massimo di podcast (1000).'],
  err_queue_full: ['The queue is full (500 episodes).', 'La coda è piena (500 episodi).'],
  err_feed_bad_url: ['That does not look like the address of a feed.', 'Questo non sembra l’indirizzo di un feed.'],
  err_feed_unreadable: ['The feed does not answer right now. Try again later.', 'Il feed non risponde in questo momento. Riprova più tardi.'],
  err_feed_not_podcast: ['This address is not the feed of a podcast.', 'Questo indirizzo non è il feed di un podcast.'],
  err_opml_invalid: ['This file has no podcasts in it (an OPML file is needed).', 'Questo file non contiene podcast (serve un file OPML).'],
  err_audio: ['This episode cannot be played: the file of the publisher does not answer.', 'Questo episodio non si riesce a riprodurre: il file dell’editore non risponde.'],
  g_playback: ['Listening', 'Ascolto'], g_playback_t: ['How episodes play, on every device where you sign in.', 'Come vengono riprodotti gli episodi, su ogni dispositivo dove accedi.'],
  def_speed: ['Speed', 'Velocità'], def_speed_t: ['For every podcast, unless one has its own.', 'Per tutti i podcast, salvo quelli che hanno la propria.'],
  autoplay: ['Play the queue', 'Riproduci la coda'], autoplay_t: ['When an episode ends, the next one in the queue starts.', 'Quando un episodio finisce, parte il successivo della coda.'],
  g_home: ['Home', 'Home'], g_home_t: ['What the home shows, from top to bottom.', 'Cosa mostra la home, dall’alto in basso.'],
  show_continue: ['Show “Continue listening”', 'Mostra «Continua ad ascoltare»'], show_continue_t: ['The episodes you started and left half way.', 'Le puntate iniziate e lasciate a metà.'],
  show_new: ['Show “New episodes”', 'Mostra «Episodi nuovi»'], show_new_t: ['The latest episodes of the podcasts you follow.', 'Le ultime puntate dei podcast che segui.'],
  hide_played_t: ['In “New episodes”, leave out what you already listened to.', 'In «Episodi nuovi», lascia fuori quello che hai già ascoltato.'],
  show_again: ['Show “Listen again”', 'Mostra «Ascolta di nuovo»'], show_again_t: ['The episodes you listened to the end lately, at the bottom.', 'Le puntate ascoltate fino alla fine di recente, in fondo.'],
  home_all_hidden: ['Every section of the home is hidden', 'Tutte le sezioni della home sono nascoste'], home_all_hidden_t: ['Choose what to show in the settings.', 'Scegli cosa mostrare nelle impostazioni.'], open_settings: ['Open the settings', 'Apri le impostazioni'],
  g_podcasts_s: ['Your podcasts', 'I tuoi podcast'], g_podcasts_s_t: ['Bring your podcasts from another app, or take them with you: every podcast app reads OPML files.', 'Porta i tuoi podcast da un’altra app, o portali via: ogni app di podcast legge i file OPML.'],
  import_opml: ['Import OPML', 'Importa OPML'], import_opml_t: ['The list of podcasts exported by another app.', 'L’elenco di podcast esportato da un’altra app.'],
  export_opml: ['Export OPML', 'Esporta OPML'], export_opml_t: ['The podcasts you follow, for any other app.', 'I podcast che segui, per qualsiasi altra app.'],
  imported: ['{n} podcasts added: their episodes are arriving.', '{n} podcast aggiunti: i loro episodi stanno arrivando.'], imported_none: ['You already follow every podcast of the file.', 'Segui già tutti i podcast del file.'],
  sec_n: ['{n} s', '{n} s'],

  // first page
  l_cta: ['Start listening', 'Inizia ad ascoltare'], l_small: ['Free, open source, no ads, no trackers. The same account as SavSchedules, SavCalendar and SavNotes.', 'Gratis, open source, senza pubblicità né tracciamenti. Lo stesso account di SavSchedules, SavCalendar e SavNotes.'],
  land_kicker: ['Free and open, part of SavOffice', 'Libero e aperto, parte di SavOffice'],
  land_title: ['Podcasts, from where they really live.', 'I podcast, da dove vivono davvero.'],
  land_text: ['Almost every podcast is published as an open feed, free for anyone to read. SavPodcasts reads them directly, finds new ones in open catalogues and remembers where you stopped, without platforms in between.', 'Quasi ogni podcast è pubblicato come feed aperto, che chiunque può leggere. SavPodcasts li legge direttamente, ne trova di nuovi in cataloghi aperti e ricorda dove ti eri fermato, senza piattaforme in mezzo.'],
  ft_open: ['From the open feeds', 'Dai feed aperti'], ft_open_t: ['Every episode comes from the feed of its publisher: no exclusive deals, no walled gardens.', 'Ogni episodio arriva dal feed del suo editore: niente esclusive, niente recinti.'],
  ft_find: ['Open catalogues', 'Cataloghi aperti'], ft_find_t: ['Search millions of podcasts in fyyd and Podcast Index, or add any feed by its address.', 'Cerca tra milioni di podcast in fyyd e Podcast Index, o aggiungi qualsiasi feed con il suo indirizzo.'],
  ft_resume: ['Where you stopped', 'Dove ti eri fermato'], ft_resume_t: ['Start on the phone, go on at the computer: the position follows you, second by second.', 'Inizia sul telefono, continua al computer: la posizione ti segue, secondo per secondo.'],
  ft_queue: ['Your queue', 'La tua coda'], ft_queue_t: ['New episodes in one list, a queue in your order, starred episodes and history.', 'Gli episodi nuovi in un solo elenco, una coda nel tuo ordine, preferiti e cronologia.'],
  ft_player: ['A player for listening', 'Un lettore per ascoltare'], ft_player_t: ['Speed and skips for each podcast, sleep timer, the controls of the lock screen.', 'Velocità e salti per ogni podcast, timer di spegnimento, i comandi della schermata di blocco.'],
  ft_private: ['Nobody watching', 'Nessuno che guarda'], ft_private_t: ['No ads, no profiles. The artwork passes through our server, so the publishers do not see who looks at it.', 'Niente pubblicità, niente profili. Le copertine passano dal nostro server, così gli editori non vedono chi le guarda.'],
  how_1: ['Find a podcast', 'Trova un podcast'], how_1_t: ['Search the open catalogues, look at what is popular, or paste the address of a feed.', 'Cerca nei cataloghi aperti, guarda i più ascoltati, o incolla l’indirizzo di un feed.'],
  how_2: ['Follow it', 'Seguilo'], how_2_t: ['Its new episodes arrive in your home by themselves.', 'I suoi nuovi episodi arrivano da soli nella tua home.'],
  how_3: ['Listen anywhere', 'Ascolta ovunque'], how_3_t: ['On the phone or at the computer, it goes on from where you stopped.', 'Sul telefono o al computer, riprende da dove ti eri fermato.'],

  // places
  nav_home: ['Home', 'Home'], nav_discover: ['Discover', 'Scopri'], nav_library: ['Library', 'Libreria'], nav_queue: ['Queue', 'Coda'],
  following: ['Following', 'Seguiti'], add_podcast: ['Add podcast', 'Aggiungi podcast'], search_ph: ['Search podcasts, or paste a feed address', 'Cerca podcast, o incolla l’indirizzo di un feed'],

  // home
  continue: ['Continue listening', 'Continua ad ascoltare'], forget_ep: ['Remove from Continue listening', 'Togli da Continua ad ascoltare'], undo: ['Undo', 'Annulla'], forgotten: ['Removed: “{t}”', 'Tolto: «{t}»'], resume_from: ['Resume from {t}', 'Riprendi da {t}'], listen_again: ['Listen again', 'Ascolta di nuovo'], new_eps: ['New episodes', 'Episodi nuovi'], load_more: ['Load more', 'Carica altri'],
  updating: ['Looking for new episodes…', 'Cerco nuovi episodi…'], arriving: ['{n} podcasts still arriving…', 'Ancora {n} podcast in arrivo…'],
  welcome_t: ['Follow a podcast to see its new episodes here.', 'Segui un podcast per vedere qui i suoi nuovi episodi.'], welcome_h: ['Nothing to listen to yet', 'Ancora niente da ascoltare'], follow_h: ['Follow a podcast for its new episodes', 'Segui un podcast per i suoi episodi nuovi'], follow_t: ['Its new episodes will arrive here by themselves, every time one comes out.', 'I suoi nuovi episodi arriveranno qui da soli, ogni volta che ne esce uno.'],
  find_podcasts: ['Find podcasts', 'Trova podcast'], hide_played: ['Hide played', 'Nascondi ascoltati'],

  // discover
  popular: ['Popular now', 'I più ascoltati ora'], popular_in: ['Popular in', 'I più ascoltati in'], lang_it: ['Italian', 'Italiano'], lang_en: ['English', 'Inglese'], lang_all: ['Every language', 'Tutte le lingue'],
  results: ['Results', 'Risultati'], nothing_found: ['Nothing found', 'Nessun risultato'], nothing_found_t: ['Try other words, or paste the address of the feed.', 'Prova altre parole, o incolla l’indirizzo del feed.'],
  add_feed: ['Add by address', 'Aggiungi con l’indirizzo'], add_feed_t: ['The address of the RSS feed of the podcast: you find it on its website, often as “RSS”.', 'L’indirizzo del feed RSS del podcast: lo trovi sul suo sito, spesso come «RSS».'], feed_url: ['Address of the feed', 'Indirizzo del feed'],
  catalog_fyyd: ['From the open catalogue of fyyd.de', 'Dal catalogo aperto di fyyd.de'], catalog_podcastindex: ['From the open catalogue of Podcast Index', 'Dal catalogo aperto di Podcast Index'],
  episodes_n: ['{n} episodes', '{n} episodi'], episodes_1: ['1 episode', '1 episodio'], updated_w: ['new {w}', 'nuovo {w}'], cant_reach: ['The catalogue does not answer right now.', 'Il catalogo non risponde in questo momento.'],
  opening: ['Opening the podcast…', 'Apro il podcast…'],

  // by author, by category
  by_author: ['Podcasts by {a}', 'Podcast di {a}'], by_author_t: ['Every podcast whose author is {a}.', 'Tutti i podcast il cui autore è {a}.'],
  in_category_t: ['Podcasts in this category, the most listened first.', 'I podcast di questa categoria, i più ascoltati prima.'], categories: ['Categories', 'Categorie'],
  author_l: ['Author', 'Autore'], category_l: ['Category', 'Categoria'],
  browse_none: ['No podcast found', 'Nessun podcast trovato'], browse_none_t: ['The open catalogue has nothing more for this.', 'Il catalogo aperto non ha altro per questa ricerca.'],
  browse_fyyd: ['The catalogue of fyyd cannot search by author: here are the podcasts already known and the ones its search finds. With the keys of Podcast Index (in the settings of the server) the list is complete.', 'Il catalogo di fyyd non sa cercare per autore: qui ci sono i podcast già conosciuti e quelli che trova la sua ricerca. Con le chiavi di Podcast Index (nelle impostazioni del server) l’elenco è completo.'],
  podcasts_n: ['{n} podcasts', '{n} podcast'], podcasts_1: ['1 podcast', '1 podcast'],
  // podcast
  follow: ['Follow', 'Segui'], unfollow: ['Unfollow', 'Non seguire più'], followed: ['Following', 'Segui già'], now_following: ['You follow {t}', 'Ora segui {t}'], unfollowed: ['You no longer follow {t}', 'Non segui più {t}'],
  website: ['Website', 'Sito web'], copy_feed: ['Copy the address of the feed', 'Copia l’indirizzo del feed'], support: ['Support the podcast', 'Sostieni il podcast'],
  mark_all: ['Mark all as played', 'Segna tutti come ascoltati'], unmark_all: ['Mark all as not played', 'Segna tutti come non ascoltati'], mark_all_t: ['Every episode of this podcast will be marked as played.', 'Tutti gli episodi di questo podcast verranno segnati come ascoltati.'],
  pod_settings: ['Settings of this podcast', 'Impostazioni di questo podcast'], pod_settings_t: ['Only for this podcast; the others follow your settings.', 'Solo per questo podcast; gli altri seguono le tue impostazioni.'],
  speed_default: ['As in your settings ({v}×)', 'Come nelle impostazioni ({v}×)'], skip_intro: ['Skip the start', 'Salta l’inizio'], skip_intro_t: ['New episodes start this far in (for intros and ads at the start).', 'Gli episodi nuovi partono da qui (per sigle e pubblicità iniziali).'],
  skip_end: ['Skip the end', 'Salta la fine'], skip_end_t: ['The episode counts as ended this long before its end.', 'L’episodio conta come finito questo tempo prima della fine.'], none: ['None', 'Nessuno'],
  sort_new: ['Newest first', 'Più recenti'], sort_old: ['Oldest first', 'Meno recenti'], only_unplayed: ['Not played', 'Non ascoltati'], all_eps: ['All episodes', 'Tutti gli episodi'], search_eps: ['Search episodes', 'Cerca negli episodi'],
  about: ['About', 'Informazioni'], no_eps: ['No episodes', 'Nessun episodio'], feed_problem: ['The feed did not answer the last time it was read: these are the episodes known so far.', 'Il feed non ha risposto l’ultima volta che è stato letto: questi sono gli episodi conosciuti finora.'],
  explicit: ['Explicit', 'Esplicito'], complete: ['Complete: no new episodes will come', 'Concluso: non arriveranno nuovi episodi'], trailer: ['Trailer', 'Trailer'], bonus: ['Bonus', 'Bonus'], season_ep: ['S{s} · E{e}', 'S{s} · E{e}'], ep_n: ['Episode {e}', 'Episodio {e}'],

  // episodes
  play: ['Play', 'Riproduci'], pause: ['Pause', 'Pausa'], resume: ['Resume', 'Riprendi'], play_from: ['Play from {t}', 'Riproduci da {t}'],
  play_next: ['Play next', 'Riproduci dopo'], add_queue: ['Add to the queue', 'Aggiungi alla coda'], remove_queue: ['Remove from the queue', 'Togli dalla coda'], added_next: ['It plays next', 'Partirà subito dopo'], added_queue: ['Added to the queue', 'Aggiunto alla coda'],
  mark_played: ['Mark as played', 'Segna come ascoltato'], mark_unplayed: ['Mark as not played', 'Segna come non ascoltato'], star: ['Star', 'Aggiungi ai preferiti'], unstar: ['Remove the star', 'Togli dai preferiti'],
  go_podcast: ['Go to the podcast', 'Vai al podcast'], ep_page: ['Episode details', 'Dettagli dell’episodio'], download_audio: ['Download the audio', 'Scarica l’audio'], copy_link: ['Copy the link of the audio', 'Copia il link dell’audio'], ep_web: ['Page of the episode', 'Pagina dell’episodio'],
  left_t: ['{t} left', 'mancano {t}'], played: ['Played', 'Ascoltato'], notes: ['Notes of the episode', 'Note dell’episodio'], no_notes: ['This episode has no notes.', 'Questo episodio non ha note.'],
  h_m: ['{h} h {m} min', '{h} h {m} min'], m_only: ['{m} min', '{m} min'], s_only: ['{s} s', '{s} s'],

  // library and queue
  lib_podcasts: ['Podcasts', 'Podcast'], lib_progress: ['In progress', 'In corso'], lib_starred: ['Starred', 'Preferiti'], lib_history: ['History', 'Cronologia'],
  none_following: ['You follow no podcast yet', 'Non segui ancora nessun podcast'], none_progress: ['Nothing half listened', 'Niente a metà'], none_starred: ['No starred episodes', 'Nessun episodio preferito'], none_starred_t: ['Star an episode to keep it here.', 'Aggiungi un episodio ai preferiti per tenerlo qui.'], none_history: ['Nothing listened yet', 'Ancora niente di ascoltato'],
  sort_latest: ['Latest episode', 'Ultimo episodio'], sort_title: ['By title', 'Per titolo'], sort_added: ['Followed lately', 'Seguiti di recente'], new_n: ['{n} new', '{n} nuovi'],
  queue_t: ['What plays next, in order: drag to change it.', 'Cosa viene riprodotto dopo, in ordine: trascina per cambiarlo.'], queue_empty: ['The queue is empty', 'La coda è vuota'], queue_empty_t: ['Add episodes with “Play next” or “Add to the queue”.', 'Aggiungi episodi con «Riproduci dopo» o «Aggiungi alla coda».'],
  clear_queue: ['Empty the queue', 'Svuota la coda'], clear_queue_t: ['Every episode will leave the queue.', 'Tutti gli episodi lasceranno la coda.'], now_playing: ['Now playing', 'In riproduzione'], up_next: ['Up next', 'A seguire'],

  // player
  player: ['Player', 'Lettore'], open_player: ['Open the player', 'Apri il lettore'], hide_player: ['Hide the player', 'Nascondi il lettore'], show_player: ['Show the player', 'Mostra il lettore'],
  sleep: ['Sleep timer', 'Timer di spegnimento'], sleep_off: ['Off', 'Spento'], sleep_end: ['At the end of the episode', 'Alla fine dell’episodio'], sleep_min: ['{n} minutes', '{n} minuti'], sleep_set: ['It stops in {n} minutes', 'Si ferma tra {n} minuti'], sleep_set_end: ['It stops at the end of the episode', 'Si ferma alla fine dell’episodio'], sleep_left: ['Stops in {t}', 'Si ferma tra {t}'],
  next_ep: ['Next in the queue', 'Successivo nella coda'], close_player: ['Close the player', 'Chiudi il lettore'],
};

let lang = (() => { try { return localStorage.getItem('savpodcasts-lang'); } catch { return null; } })() || (navigator.language.startsWith('it') ? 'it' : 'en');
export const getLang = () => lang;
export function setLang(l) {
  lang = l === 'it' ? 'it' : 'en';
  try { localStorage.setItem('savpodcasts-lang', lang); } catch { /* private mode */ }
  document.documentElement.lang = lang;
}
const DEV = /^(localhost|127\.)/.test(location.hostname);
export const t = (k, v = {}) => { if (!T[k] && DEV) console.warn('i18n missing:', k); return (T[k] ? T[k][lang === 'it' ? 1 : 0] : k).replace(/\{(\w+)\}/g, (m, x) => v[x] ?? m); };
export const has = (k) => !!T[k];
/** The categories of the feeds (the names of Apple's list, in English in every feed), as people read them. */
const CATS = { 'Arts': 'Arte', 'Business': 'Economia', 'Comedy': 'Comicità', 'Education': 'Istruzione', 'Fiction': 'Narrativa', 'Government': 'Governo', 'History': 'Storia',
  'Health & Fitness': 'Salute e benessere', 'Kids & Family': 'Bambini e famiglia', 'Leisure': 'Tempo libero', 'Music': 'Musica', 'News': 'Notizie', 'Religion & Spirituality': 'Religione e spiritualità',
  'Science': 'Scienza', 'Society & Culture': 'Società e cultura', 'Sports': 'Sport', 'Technology': 'Tecnologia', 'True Crime': 'Cronaca nera', 'TV & Film': 'TV e cinema',
  'Daily News': 'Notizie del giorno', 'Politics': 'Politica', 'News Commentary': 'Commento all’attualità', 'Business News': 'Notizie di economia', 'Tech News': 'Notizie di tecnologia', 'Sports News': 'Notizie sportive', 'Entertainment News': 'Notizie di spettacolo',
  'Documentary': 'Documentari', 'Philosophy': 'Filosofia', 'Personal Journals': 'Diari personali', 'Places & Travel': 'Luoghi e viaggi', 'Relationships': 'Relazioni',
  'Self-Improvement': 'Crescita personale', 'Self Improvement': 'Crescita personale', 'Courses': 'Corsi', 'How To': 'Guide pratiche', 'Language Learning': 'Lingue',
  'Entrepreneurship': 'Imprenditoria', 'Investing': 'Investimenti', 'Management': 'Gestione', 'Marketing': 'Marketing', 'Careers': 'Carriera', 'Non-Profit': 'Non profit',
  'Books': 'Libri', 'Design': 'Design', 'Food': 'Cucina', 'Performing Arts': 'Arti dello spettacolo', 'Visual Arts': 'Arti visive', 'Fashion & Beauty': 'Moda e bellezza',
  'Mental Health': 'Salute mentale', 'Medicine': 'Medicina', 'Nutrition': 'Alimentazione', 'Fitness': 'Fitness', 'Alternative Health': 'Medicina alternativa',
  'Natural Sciences': 'Scienze naturali', 'Social Sciences': 'Scienze sociali', 'Astronomy': 'Astronomia', 'Physics': 'Fisica', 'Mathematics': 'Matematica', 'Nature': 'Natura', 'Life Sciences': 'Scienze della vita', 'Earth Sciences': 'Scienze della Terra', 'Chemistry': 'Chimica',
  'Soccer': 'Calcio', 'Football': 'Football americano', 'Basketball': 'Basket', 'Tennis': 'Tennis', 'Running': 'Corsa', 'Music Commentary': 'Commento musicale', 'Music History': 'Storia della musica', 'Music Interviews': 'Interviste musicali',
  'Religion': 'Religione', 'Spirituality': 'Spiritualità', 'Christianity': 'Cristianesimo', 'Buddhism': 'Buddhismo', 'Stories for Kids': 'Storie per bambini', 'Parenting': 'Genitori', 'Education for Kids': 'Istruzione per bambini',
  'Film Reviews': 'Recensioni di film', 'Film History': 'Storia del cinema', 'TV Reviews': 'Recensioni TV', 'After Shows': 'Dopo la puntata', 'Video Games': 'Videogiochi', 'Games': 'Giochi', 'Hobbies': 'Hobby', 'Home & Garden': 'Casa e giardino', 'Automotive': 'Motori' };
export const catName = (c) => (lang === 'it' && CATS[c] ? CATS[c] : c);
/** The main categories, for browsing. */
export const MAIN_CATS = ['News', 'Society & Culture', 'History', 'Business', 'Education', 'Science', 'Technology', 'Comedy', 'True Crime', 'Health & Fitness', 'Sports', 'Arts', 'Music', 'TV & Film', 'Kids & Family', 'Religion & Spirituality', 'Fiction', 'Leisure', 'Government'];
export function when(iso) {
  if (!iso) return '';
  const d = new Date(iso), s = (Date.now() - d) / 1000, rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (s < 60) return rtf.format(0, 'minute');
  if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour');
  if (s < 7 * 86400) return rtf.format(-Math.floor(s / 86400), 'day');
  return d.toLocaleDateString(lang, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

