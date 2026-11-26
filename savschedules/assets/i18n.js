/** Texts of the app, in English and Italian. */
const T = {
  // general
  cancel: ['Cancel', 'Annulla'], close: ['Close', 'Chiudi'], save: ['Save', 'Salva'], delete: ['Delete', 'Elimina'], create: ['Create', 'Crea'], add: ['Add', 'Aggiungi'], done: ['Done', 'Fatto'],
  copy: ['Copy', 'Copia'], copied: ['Copied', 'Copiato'], more: ['More', 'Altro'], retry: ['Try again', 'Riprova'], remove: ['Remove', 'Rimuovi'], name: ['Name', 'Nome'], search: ['Search', 'Cerca'],
  open: ['Open', 'Apri'], edit: ['Edit', 'Modifica'], home: ['Home', 'Home'], send: ['Send', 'Invia'], restore: ['Restore', 'Ripristina'], refresh: ['Refresh', 'Aggiorna'], print: ['Print', 'Stampa'],
  previous: ['Previous', 'Precedente'], next: ['Next', 'Successivo'], today: ['Today', 'Oggi'], or: ['or', 'oppure'], yes: ['Yes', 'Sì'], no: ['No', 'No'], maybe: ['If need be', 'Se serve'], total: ['Total', 'Totale'],
  status: ['Status', 'Stato'], view: ['View', 'Vista'], week: ['Week', 'Settimana'], month: ['Month', 'Mese'], date: ['Date', 'Data'], time: ['Time', 'Ora'], from: ['From', 'Dalle'], to: ['To', 'Alle'],
  free: ['Free', 'Libero'], taken: ['Taken', 'Occupato'], people: ['People', 'Persone'], dates: ['Dates', 'Date'], places: ['Places', 'Posti'], reason: ['Reason', 'Motivo'],

  // landing and accounts (shared with SavDocuments)
  land_kicker: ['Free and open, part of Illerom', 'Libero e aperto, parte di Illerom'],
  land_title: ['Find the date. Hand out the slots.', 'Trova la data. Distribuisci i posti.'],
  land_text: ['Ask a group which dates suit them, or let people book a time that nobody else can take. Whoever answers needs no account: a link is enough.', 'Chiedi a un gruppo quali date vanno bene, oppure lascia prenotare un orario che nessun altro potrà prendere. Chi risponde non ha bisogno di un account: basta un link.'],
  ft_poll: ['Polls on dates', 'Sondaggi sulle date'], ft_poll_t: ['Everyone says yes, if need be or no. The best date comes up by itself.', 'Ognuno dice sì, se serve o no. La data migliore viene fuori da sola.'],
  ft_slots: ['Unique slots', 'Posti unici'], ft_slots_t: ['Once a slot is taken it is locked: interviews, office hours, shifts.', 'Quando un posto è preso si blocca: colloqui, ricevimenti, turni.'],
  ft_guest: ['No account to answer', 'Nessun account per rispondere'], ft_guest_t: ['A name is enough. Or ask for a SavSchedules account, if you prefer.', 'Basta un nome. Oppure chiedi un account SavSchedules, se preferisci.'],
  ft_rules: ['Your rules', 'Le tue regole'], ft_rules_t: ['Deadline, hidden answers, places per person, emails at every answer.', 'Scadenza, risposte nascoste, posti a persona, email a ogni risposta.'],
  l_cta: ['Start for free', 'Inizia gratis'], l_small: ['Free, open source, no ads, no trackers.', 'Gratis, open source, senza pubblicità né tracciamenti.'],
  ft_zones: ['Every time zone', 'Ogni fuso orario'], ft_zones_t: ['You plan in yours; whoever answers sees the times in their own.', 'Tu organizzi nel tuo; chi risponde vede gli orari nel proprio.'],
  ft_files: ['Calendars and files', 'Calendari e file'], ft_files_t: ['Add to calendar (.ics), answers in CSV, whole schedules in .savsch.', 'Aggiungi al calendario (.ics), risposte in CSV, pianificazioni intere in .savsch.'],
  how_title: ['How it works', 'Come funziona'],
  how_1: ['Draw your times', 'Disegna gli orari'], how_1_t: ['Click or drag on the week, or create a whole series at once.', 'Clicca o trascina sulla settimana, oppure crea un’intera serie in un colpo.'],
  how_2: ['Share the link', 'Condividi il link'], how_2_t: ['By chat, email or a QR code on the door.', 'In chat, per email o con un codice QR sulla porta.'],
  how_3: ['Watch the answers', 'Guarda le risposte'], how_3_t: ['Choose the date, or see who took each slot.', 'Scegli la data, o guarda chi ha preso ogni posto.'],
  sign_in: ['Sign in', 'Accedi'], sign_up: ['Create account', 'Crea account'], sign_out: ['Sign out', 'Esci'], settings: ['Settings', 'Impostazioni'], admin: ['Administration', 'Amministrazione'],
  your_name: ['Your name', 'Il tuo nome'], email: ['Email', 'Email'], password: ['Password', 'Password'], email_fixed: ['It cannot be changed later.', 'Non potrà essere cambiata in seguito.'], pw_hint: ['At least 8 characters.', 'Almeno 8 caratteri.'],
  accept: ['I accept the', 'Accetto i'], terms: ['terms', 'termini'], and_privacy: ['and the', 'e l’'], privacy: ['privacy notice', 'informativa sulla privacy'], terms_c: ['Terms', 'Termini'],
  forgot: ['Forgot your password?', 'Password dimenticata?'], forgot_text: ['We will send you a link to choose a new one.', 'Ti mandiamo un link per sceglierne una nuova.'], send_link: ['Send the link', 'Invia il link'], link_sent: ['If the address has an account, the link is on its way.', 'Se l’indirizzo ha un account, il link è in arrivo.'],
  check_email: ['Check your email', 'Controlla la tua email'], check_email_text: ['We sent you a link to confirm the address. If you do not see it, look in the spam.', 'Ti abbiamo mandato un link per confermare l’indirizzo. Se non lo vedi, guarda nello spam.'],
  mail_off: ['Emails are switched off on this server.', 'Le email sono disattivate su questo server.'], google_terms: ['By continuing with Google or SavAccount you accept the terms and the privacy notice.', 'Continuando con Google o SavAccount accetti i termini e l’informativa sulla privacy.'],
  google_new: ['There is no account with this address yet: create one?', 'Non esiste ancora un account con questo indirizzo: vuoi crearlo?'], not_ready: ['Not ready yet', 'Non ancora pronto'],
  verify_title: ['Confirm your email', 'Conferma la tua email'], verify_text: ['Press the button to confirm the address and sign in.', 'Premi il pulsante per confermare l’indirizzo e accedere.'], verify_btn: ['Confirm and sign in', 'Conferma e accedi'],
  reset_title: ['Choose a new password', 'Scegli una nuova password'], new_password: ['New password', 'Nuova password'], current_pw: ['Current password', 'Password attuale'],
  unverified: ['Confirm your email to go on', 'Conferma la tua email per continuare'], resend: ['Send the link again', 'Invia di nuovo il link'], resent: ['Link sent', 'Link inviato'], language: ['Language', 'Lingua'],

  // home
  new_l: ['New', 'Nuovo'], new_schedule: ['New schedule', 'Nuova pianificazione'], search_sch: ['Search schedules', 'Cerca pianificazioni'], ready_made: ['Ready-made starts', 'Partenze pronte'],
  open_file: ['Open a file', 'Apri un file'], imported: ['Schedule opened from the file', 'Pianificazione aperta dal file'], start_new: ['Start a new one', 'Iniziane una nuova'],
  k_poll: ['Date poll', 'Sondaggio date'], k_slots: ['Slot booking', 'Prenotazione posti'],
  k_poll_t: ['Propose some dates and times: everyone says which ones suit them, and you pick the best.', 'Proponi alcune date e orari: ognuno dice quali gli vanno bene e tu scegli la migliore.'],
  k_slots_t: ['Offer times with a number of places: each person takes one, and a full slot is locked for the others.', 'Offri orari con un certo numero di posti: ognuno ne prende uno e un posto pieno si blocca per gli altri.'],
  k_poll_s: ['Find a date together', 'Trovate una data insieme'], k_slots_s: ['People book a place', 'Le persone prenotano un posto'],
  p_meeting: ['Team meeting', 'Riunione di gruppo'], p_dinner: ['Dinner with friends', 'Cena tra amici'], p_office: ['Office hours', 'Ricevimento'], p_interviews: ['Parent-teacher interviews', 'Colloqui con i genitori'], p_shifts: ['Volunteer shifts', 'Turni dei volontari'], p_visits: ['Guided visits', 'Visite guidate'],
  all_sch: ['All schedules', 'Tutte le pianificazioni'], polls: ['Polls', 'Sondaggi'], slot_sheets: ['Bookings', 'Prenotazioni'], starred: ['Starred', 'Speciali'], answered: ['Answered by me', 'Le mie risposte'], trash: ['Trash', 'Cestino'],
  open_now: ['open now', 'aperte ora'], new_answers: ['new answers', 'nuove risposte'], places_taken: ['places taken', 'posti presi'], answer_1: ['answer', 'risposta'], answers_n: ['answers', 'risposte'],
  see_answers: ['See the answers', 'Vedi le risposte'], open_as_guest: ['Open as a guest', 'Apri come ospite'], copy_link: ['Copy the link', 'Copia il link'], link_copied: ['Link copied', 'Link copiato'],
  star: ['Star', 'Aggiungi agli speciali'], unstar: ['Remove the star', 'Togli dagli speciali'], duplicate: ['Duplicate', 'Duplica'], copy_of: ['Copy of {t}', 'Copia di {t}'], title_l: ['Title', 'Titolo'],
  close_sch: ['Stop the answers', 'Chiudi le risposte'], reopen: ['Open the answers again', 'Riapri le risposte'], download_savsch: ['Download (.savsch)', 'Scarica (.savsch)'], download_savsch_all: ['Download with the answers (.savsch)', 'Scarica con le risposte (.savsch)'],
  to_trash: ['Move to the trash', 'Sposta nel cestino'], trashed: ['Moved to the trash', 'Spostata nel cestino'], delete_forever: ['Delete forever', 'Elimina per sempre'], delete_forever_t: ['The schedules and all their answers will be gone for good.', 'Le pianificazioni e tutte le loro risposte spariranno per sempre.'],
  n_new: ['{n} new', '{n} nuove'], date_set: ['Date chosen', 'Data scelta'], suspended: ['Suspended', 'Sospesa'], closed: ['Closed', 'Chiusa'], open_l: ['Open', 'Aperta'],
  until: ['until {d}', 'fino al {d}'], last_answer: ['last answer {w}', 'ultima risposta {w}'], created_w: ['created {w}', 'creata {w}'], by_owner: ['by {n}', 'di {n}'], you_answered: ['You answered', 'Hai risposto'], more_l: ['More', 'Altro'],
  sort_updated: ['Last changed', 'Ultima modifica'], sort_date: ['By date', 'Per data'], sort_title: ['By title', 'Per titolo'], as_list: ['Show as a list', 'Mostra come elenco'], as_grid: ['Show as a grid', 'Mostra come griglia'],
  results_for: ['Results for “{q}”', 'Risultati per «{q}»'], empty_trash: ['Empty the trash', 'Svuota il cestino'], trash_empty: ['The trash is empty', 'Il cestino è vuoto'], trash_t: ['Schedules stay here for 30 days, then they are deleted.', 'Le pianificazioni restano qui 30 giorni, poi vengono eliminate.'],
  answered_empty: ['Nothing here yet', 'Ancora niente'], answered_t: ['Schedules you answer while signed in show up here.', 'Qui compaiono le pianificazioni a cui rispondi dopo aver fatto l’accesso.'],
  nothing_found: ['Nothing found', 'Nessun risultato'], none_yet: ['No schedules yet', 'Ancora nessuna pianificazione'], none_yet_t: ['Start with a date poll or a sheet of slots.', 'Inizia con un sondaggio sulle date o un foglio di posti.'],

  // editor
  untitled_poll: ['Untitled poll', 'Sondaggio senza titolo'], untitled_slots: ['Untitled booking', 'Prenotazione senza titolo'],
  saved: ['Saved', 'Salvato'], saving: ['Saving…', 'Salvataggio…'], not_saved: ['Not saved yet', 'Non ancora salvato'], not_saved_err: ['Not saved: trying again', 'Non salvato: riprovo'],
  preview: ['Preview as a guest', 'Anteprima come ospite'], share: ['Share', 'Condividi'], add_first: ['Add at least one date or slot first.', 'Aggiungi prima almeno una data o un posto.'],
  length: ['Length', 'Durata'], new_length: ['New slots last', 'I nuovi posti durano'], series: ['Add a series', 'Aggiungi una serie'],
  month_hint: ['Click the days to propose them as whole days.', 'Clicca i giorni per proporli come giornate intere.'], month_hint_slots: ['Click a day to open its week.', 'Clicca un giorno per aprire la sua settimana.'],
  all_day: ['All day', 'Tutto il giorno'], all_day_s: ['day', 'giorno'], add_all_day: ['Add as a whole day', 'Aggiungi come giornata intera'], edit_option: ['Change', 'Modifica'], places_n: ['{n} places', '{n} posti'], times_n: ['{n} times', '{n} orari'],
  added_n: ['{n} added', '{n} aggiunti'], remove_option: ['Remove?', 'Rimuovere?'], remove_option_t: ['{n} answers chose it: they will lose this choice.', '{n} risposte l’hanno scelto: perderanno questa scelta.'],
  option_label: ['Note on this time (optional)', 'Nota su questo orario (facoltativa)'], label_help: ['A place, a room, a detail.', 'Un luogo, una stanza, un dettaglio.'], label_help_slots: ['A room, a teacher, a task…', 'Una stanza, un insegnante, un compito…'],
  label_ph: ['e.g. Online', 'es. Online'], label_ph_slots: ['e.g. Room 2', 'es. Aula 2'], option_has: ['{n} people already chose it.', '{n} persone l’hanno già scelto.'],
  from_day: ['From', 'Dal'], to_day: ['To', 'Al'], weekdays: ['Days of the week', 'Giorni della settimana'], gap: ['Break between', 'Pausa tra uno e l’altro'], no_gap: ['No break', 'Nessuna pausa'],
  series_days: ['Whole days instead of times', 'Giornate intere invece di orari'], will_add: ['{n} will be added.', 'Ne verranno aggiunti {n}.'], will_add_0: ['Nothing to add with these choices.', 'Niente da aggiungere con queste scelte.'],
  tab_dates: ['Dates', 'Date'], tab_slots: ['Slots', 'Posti'], tab_details: ['Details', 'Dettagli'], tab_rules: ['Rules', 'Regole'],
  no_dates: ['No dates yet', 'Ancora nessuna data'], no_dates_t: ['Click the calendar to propose a time, or switch to the month for whole days.', 'Clicca il calendario per proporre un orario, o passa al mese per le giornate intere.'],
  no_slots: ['No slots yet', 'Ancora nessun posto'], no_slots_t: ['Click the week to add a slot, drag to cut a longer time into slots, or add a series.', 'Clicca la settimana per aggiungere un posto, trascina per dividere un periodo in più posti, o aggiungi una serie.'],
  slots_total: ['{n} slots · {p} places', '{n} orari · {p} posti'], copy_next_day: ['Copy to the next day', 'Copia nel giorno dopo'], copy_next_week: ['Copy to the next week', 'Copia nella settimana dopo'], remove_day: ['Remove the day', 'Rimuovi il giorno'],
  description: ['Description', 'Descrizione'], descr_ph: ['What it is about, what to bring, who to ask…', 'Di cosa si tratta, cosa portare, a chi chiedere…'], place: ['Place', 'Luogo'], place_ph: ['An address, a room or a video call', 'Un indirizzo, una stanza o una videochiamata'],
  color: ['Colour', 'Colore'], color_t: ['The colour of its page and of its card.', 'Il colore della sua pagina e della sua scheda.'],
  c_blue: ['Blue', 'Blu'], c_violet: ['Violet', 'Viola'], c_green: ['Green', 'Verde'], c_coral: ['Coral', 'Corallo'], c_amber: ['Amber', 'Ambra'], c_pink: ['Pink', 'Rosa'], c_teal: ['Teal', 'Ottanio'], c_slate: ['Slate', 'Ardesia'],
  r_who: ['Who answers', 'Chi risponde'], r_poll: ['The poll', 'Il sondaggio'], r_slots: ['The places', 'I posti'], r_time: ['Time', 'Tempo'], r_mail: ['Emails', 'Email'],
  who_answers: ['Who can answer', 'Chi può rispondere'], acc_open: ['Anyone with the link', 'Chiunque abbia il link'], acc_open_t: ['A name is enough, no account.', 'Basta un nome, nessun account.'],
  acc_account: ['Only signed-in people', 'Solo chi ha fatto l’accesso'], acc_account_t: ['A SavSchedules account is needed: one answer each.', 'Serve un account SavSchedules: una risposta a testa.'],
  ask_email: ['Email of who answers', 'Email di chi risponde'], email_no: ['Do not ask', 'Non chiederla'], email_optional: ['Optional', 'Facoltativa'], email_required: ['Required', 'Obbligatoria'], allow_note: ['They can leave a short note', 'Possono lasciare una breve nota'],
  allow_maybe: ['“If need be” as an answer', '«Se serve» come risposta'], allow_maybe_t: ['Besides yes and no.', 'Oltre a sì e no.'], min_per: ['Dates each person must accept', 'Date che ognuno deve accettare'], min_per_t: ['0 = no minimum.', '0 = nessun minimo.'],
  max_per: ['Places each person can take', 'Posti che ognuno può prendere'], max_per_t: ['1 = one each. 0 = no limit.', '1 = uno a testa. 0 = nessun limite.'], cap_default: ['Places in a new slot', 'Posti in un nuovo orario'], cap_default_t: ['1 = a unique slot: once taken it is locked.', '1 = posto unico: una volta preso si blocca.'],
  hide_answers: ['Hide the answers of the others', 'Nascondi le risposte degli altri'], hide_answers_t: ['Only you see who said what.', 'Solo tu vedi chi ha detto cosa.'], hide_answers_slots: ['People see that a slot is taken, not by whom.', 'Le persone vedono che un posto è preso, non da chi.'],
  accepting: ['Accepting answers', 'Risposte aperte'], accepting_t: ['When it is off nobody can answer or change an answer.', 'Quando è spento nessuno può rispondere o cambiare la risposta.'], deadline: ['Deadline', 'Scadenza'],
  timezone: ['Time zone', 'Fuso orario'], timezone_t: ['The times you draw are in this zone; whoever answers sees them in their own.', 'Gli orari che disegni sono in questo fuso; chi risponde li vede nel proprio.'],
  notify: ['Email me at every answer', 'Mandami un’email a ogni risposta'], notify_t: ['Also when someone changes or withdraws an answer.', 'Anche quando qualcuno cambia o ritira una risposta.'],

  // sharing
  share_title: ['Share', 'Condividi'], share_open: ['Anyone with the link can answer, without an account.', 'Chiunque abbia il link può rispondere, senza account.'], share_account: ['Anyone with the link can see it; to answer they must sign in.', 'Chiunque abbia il link può vederla; per rispondere deve fare l’accesso.'],
  share_closed: ['The answers are closed now: people can only look.', 'Le risposte ora sono chiuse: le persone possono solo guardare.'], qr_title: ['QR code', 'Codice QR'], qr_text: ['Print it on a notice or show it on a screen.', 'Stampalo su un avviso o mostralo su uno schermo.'],
  qr_download: ['Download the QR code', 'Scarica il codice QR'], send_email: ['Send by email', 'Invia per email'],
  mail_poll: ['Which of these dates suit you for “{t}”? Answer here:', 'Quali di queste date ti vanno bene per «{t}»? Rispondi qui:'], mail_slots: ['Book your place for “{t}” here:', 'Prenota il tuo posto per «{t}» qui:'],

  // answering
  sch_missing: ['This schedule does not exist', 'Questa pianificazione non esiste'], sch_missing_t: ['The link may be wrong, or its owner deleted it.', 'Il link potrebbe essere sbagliato, oppure è stata eliminata.'],
  sch_suspended: ['Schedule suspended', 'Pianificazione sospesa'], sch_suspended_t: ['This schedule was suspended by the administrators of SavSchedules.', 'Questa pianificazione è stata sospesa dagli amministratori di SavSchedules.'], make_own: ['Make your own', 'Creane una tua'],
  invite_poll: ['{n} asks when you can', '{n} chiede quando puoi'], invite_slots: ['{n} invites you to book', '{n} ti invita a prenotare'],
  answers_until: ['Answers until {d}', 'Risposte fino a {d}'], pick_one: ['Pick one slot', 'Scegli un posto'], pick_up_to: ['Pick up to {n} slots', 'Scegli fino a {n} posti'], pick_any: ['Pick all the slots you want', 'Scegli tutti i posti che vuoi'],
  vote_hint: ['Yes or no for each date', 'Sì o no per ogni data'], vote_hint_maybe: ['Yes, if need be or no for each date', 'Sì, se serve o no per ogni data'], times_in: ['Times in {z}', 'Orari in {z}'], signed_in_only: ['Signed-in people only', 'Solo con accesso'],
  date_is_set: ['The date is set', 'La data è decisa'], add_calendar: ['Add to calendar', 'Aggiungi al calendario'],
  closed_t: ['This schedule no longer accepts answers.', 'Questa pianificazione non accetta più risposte.'], signin_to_answer: ['Sign in to answer', 'Accedi per rispondere'], signin_to_answer_t: ['The organiser asks for a SavSchedules account. It is free.', 'Chi organizza chiede un account SavSchedules. È gratuito.'],
  hidden_note: ['The answers of the others are hidden: only the organiser sees them.', 'Le risposte degli altri sono nascoste: le vede solo chi organizza.'], hidden_note_slots: ['You see which slots are taken, but not by whom.', 'Vedi quali posti sono presi, ma non da chi.'],
  owner_view: ['This is your schedule, as the others see it.', 'Questa è la tua pianificazione, come la vedono gli altri.'],
  your_answer: ['Your answer', 'La tua risposta'], saved_as: ['as {n}, {w}', 'come {n}, {w}'], nothing_yet: ['Nothing chosen', 'Niente di scelto'], change_answer: ['Change', 'Cambia'],
  private_link: ['Private link', 'Link privato'], private_link_t: ['With this link you can change or withdraw your answer from any device. It is also in the email of the answer, if you left one.', 'Con questo link puoi cambiare o ritirare la tua risposta da qualsiasi dispositivo. È anche nell’email della risposta, se l’hai lasciata.'],
  private_link_warn: ['Do not share it: whoever has it can change your answer.', 'Non condividerlo: chi lo ha può cambiare la tua risposta.'],
  withdraw: ['Withdraw', 'Ritira'], withdraw_t: ['Your answer will be removed.', 'La tua risposta verrà eliminata.'], withdraw_slots_t: ['Your places will be free again for the others.', 'I tuoi posti torneranno liberi per gli altri.'], withdrawn: ['Answer withdrawn', 'Risposta ritirata'],
  max_reached: ['You can take {n} places at most.', 'Puoi prendere al massimo {n} posti.'], yours: ['Yours', 'Tuo'], selected: ['Selected', 'Selezionato'], left_n: ['{n} of {c} left', '{n} su {c} liberi'],
  yes_n: ['{n} yes', '{n} sì'], maybe_n: ['{n} if need be', '{n} se serve'], no_options: ['Nothing to choose yet', 'Ancora niente da scegliere'], no_options_t: ['The organiser has not added any date.', 'Chi organizza non ha ancora aggiunto date.'],
  choose_slots: ['Choose your slot', 'Scegli il tuo posto'], choose_dates: ['When can you?', 'Quando puoi?'], answers_so_far: ['Answers so far ({n})', 'Risposte finora ({n})'],
  your_email: ['Email (optional)', 'Email (facoltativa)'], your_email_req: ['Email', 'Email'], email_why: ['For a copy of your answer and the link to change it. Only the organiser sees it.', 'Per una copia della risposta e il link per cambiarla. La vede solo chi organizza.'],
  note_l: ['Note', 'Nota'], note_ph: ['Anything to add? (optional)', 'Qualcosa da aggiungere? (facoltativo)'],
  n_selected: ['{n} selected', '{n} selezionati'], select_slot: ['Select a free slot', 'Seleziona un posto libero'], n_answered: ['{n} of {m} answered', '{n} su {m} con risposta'], answer_each: ['Answer the dates that suit you', 'Rispondi alle date che ti vanno bene'],
  save_changes: ['Save the changes', 'Salva le modifiche'], book: ['Book', 'Prenota'], send_answer: ['Send the answer', 'Invia la risposta'], answering_as: ['Answering as', 'Rispondi come'],
  booked: ['Booked!', 'Prenotato!'], answer_saved: ['Answer saved, thank you!', 'Risposta salvata, grazie!'],
  report: ['Report this schedule', 'Segnala questa pianificazione'], report_why: ['What is wrong?', 'Cosa non va?'], report_note: ['Details (optional)', 'Dettagli (facoltativi)'], report_sent: ['Thank you: the administrators will look at it.', 'Grazie: gli amministratori la esamineranno.'],
  rep_spam: ['Spam or advertising', 'Spam o pubblicità'], rep_scam: ['A scam or asks for personal data', 'Una truffa o chiede dati personali'], rep_offensive: ['Offensive content', 'Contenuti offensivi'], rep_other: ['Something else', 'Altro'],

  // answers (owner)
  places_taken_l: ['Places taken', 'Posti presi'], slots_full: ['Full slots', 'Orari pieni'], best_date: ['Best date', 'Data migliore'], ranking: ['Dates by preference', 'Date in ordine di preferenza'],
  choose: ['Choose', 'Scegli'], undo_choice: ['Undo', 'Annulla scelta'], choose_date: ['Choose this date', 'Scegli questa data'], choose_date_t: ['The answers close and the page of the schedule shows the date to everyone.', 'Le risposte si chiudono e la pagina della pianificazione mostra la data a tutti.'],
  final_mail: ['Tell the people who left an email', 'Avvisa chi ha lasciato un’email'], final_mail_t: ['They get an email with the date.', 'Ricevono un’email con la data.'],
  no_answers: ['No answers yet', 'Ancora nessuna risposta'], no_answers_t: ['Share the link: the answers show up here as they arrive.', 'Condividi il link: le risposte compaiono qui man mano che arrivano.'],
  who_said: ['Who said what', 'Chi ha detto cosa'], with_account: ['with an account', 'con account'], write_email: ['Write an email', 'Scrivi un’email'], remove_answer: ['Remove the answer', 'Rimuovi la risposta'],
  remove_answer_t: ['The answer of {n} will be deleted and their places freed.', 'La risposta di {n} verrà eliminata e i suoi posti liberati.'], free_place: ['Free the place', 'Libera il posto'], booked_of: ['{a} of {b} taken', '{a} di {b} presi'],
  answered_at: ['Answered', 'Risposta del'], download_csv: ['Download the answers (CSV)', 'Scarica le risposte (CSV)'], download_ics: ['Download for the calendar (.ics)', 'Scarica per il calendario (.ics)'], updated_w: ['changed {w}', 'modificata {w}'],

  // settings
  settings_t: ['They apply to this account on every device.', 'Valgono per questo account su ogni dispositivo.'], settings_saved: ['Settings saved', 'Impostazioni salvate'],
  g_defaults: ['New schedules', 'Nuove pianificazioni'], defaults_text: ['How a new schedule starts. Each one can still be changed.', 'Come parte una nuova pianificazione. Ognuna si può comunque cambiare.'],
  look_app: ['Look', 'Aspetto'], theme: ['Theme', 'Tema'], g_account: ['Account', 'Account'], change_pw: ['Change the password', 'Cambia la password'], set_pw: ['Set a password', 'Imposta una password'],
  your_data: ['Your data', 'I tuoi dati'], your_data_t: ['Download everything your account keeps, or delete it with all its schedules.', 'Scarica tutto quello che il tuo account conserva, oppure eliminalo con tutte le sue pianificazioni.'],
  export_data: ['Download my data', 'Scarica i miei dati'], delete_account: ['Delete the account', 'Elimina l’account'], delete_account_text: ['The account, its schedules and all their answers will be deleted for good.', 'L’account, le sue pianificazioni e tutte le loro risposte verranno eliminati per sempre.'],

  // administration
  a_overview: ['Overview', 'Panoramica'], a_users: ['Accounts', 'Account'], a_schedules: ['Schedules', 'Pianificazioni'], a_reports: ['Reports', 'Segnalazioni'], a_answers: ['Answers', 'Risposte'], a_guests: ['Answers without account', 'Risposte senza account'],
  a_active: ['Active in 30 days', 'Attivi in 30 giorni'], a_privacy: ['Administrators see titles, owners and numbers, never the answers.', 'Gli amministratori vedono titoli, proprietari e numeri, mai le risposte.'], a_find: ['Find…', 'Trova…'],
  a_last: ['Last sign-in', 'Ultimo accesso'], a_owner: ['Owner', 'Proprietario'], a_blocked: ['Blocked', 'Bloccato'], a_unverified: ['Not confirmed', 'Non confermato'], a_block: ['Block', 'Blocca'], a_unblock: ['Unblock', 'Sblocca'],
  a_suspend: ['Suspend', 'Sospendi'], a_unsuspend: ['Restore', 'Ripristina'], a_open: ['Open', 'Aperta'], a_done: ['Done', 'Gestita'], a_close: ['Mark as done', 'Segna come gestita'], a_noreports: ['No reports', 'Nessuna segnalazione'],

  // errors
  err_server: ['Something went wrong. Try again in a moment.', 'Qualcosa è andato storto. Riprova tra poco.'], err_network: ['No connection.', 'Nessuna connessione.'], err_not_installed: ['The database is not configured yet.', 'Il database non è ancora configurato.'],
  err_unauthenticated: ['Sign in again.', 'Accedi di nuovo.'], err_disabled: ['This account is blocked.', 'Questo account è bloccato.'], err_email_unverified: ['Confirm your email first.', 'Prima conferma la tua email.'], err_csrf: ['The session expired: reload the page.', 'La sessione è scaduta: ricarica la pagina.'],
  err_rate_limited: ['Too many attempts: wait a little.', 'Troppi tentativi: aspetta un po’.'], err_bad_credentials: ['Wrong email or password.', 'Email o password errate.'], err_name_required: ['Write your name.', 'Scrivi il tuo nome.'], err_email_invalid: ['That email does not look right.', 'Questa email non sembra corretta.'],
  err_password_short: ['The password needs at least 8 characters.', 'La password deve avere almeno 8 caratteri.'], err_password_long: ['The password is too long.', 'La password è troppo lunga.'], err_terms_required: ['Accept the terms to go on.', 'Accetta i termini per continuare.'],
  err_token_invalid: ['The link expired or was already used.', 'Il link è scaduto o è già stato usato.'], err_bad_password: ['Wrong password.', 'Password errata.'], err_not_found: ['Not found.', 'Non trovato.'], err_suspended: ['This schedule is suspended.', 'Questa pianificazione è sospesa.'],
  err_title_required: ['Give it a title.', 'Dagli un titolo.'], err_too_many_options: ['400 dates or slots at most.', 'Al massimo 400 date o posti.'], err_too_many_schedules: ['You reached the limit of schedules.', 'Hai raggiunto il limite di pianificazioni.'],
  err_closed: ['This schedule no longer accepts answers.', 'Questa pianificazione non accetta più risposte.'], err_signin_required: ['Sign in to answer.', 'Accedi per rispondere.'], err_forbidden: ['You cannot do this.', 'Non puoi farlo.'], err_email_required: ['Write your email.', 'Scrivi la tua email.'],
  err_nothing_chosen: ['Choose at least one.', 'Scegline almeno uno.'], err_need_yes: ['Say yes to at least one date.', 'Di’ sì ad almeno una data.'], err_too_many_places: ['You chose more places than allowed.', 'Hai scelto più posti di quelli consentiti.'],
  err_too_few_dates: ['Say yes to more dates: the organiser asks for a minimum.', 'Di’ sì a più date: chi organizza chiede un minimo.'], err_too_many_answers: ['This schedule is full of answers.', 'Questa pianificazione ha raggiunto il massimo di risposte.'],
  err_slot_taken: ['Someone took that slot a moment ago: choose another one.', 'Qualcuno ha appena preso quel posto: scegline un altro.'], err_file_big: ['The file is too big.', 'Il file è troppo grande.'], err_file_invalid: ['This is not a .savsch file.', 'Questo non è un file .savsch.'],
  err_bad_request: ['Something in the request is not right.', 'Qualcosa nella richiesta non va.'], err_google_token: ['Google did not confirm the sign-in.', 'Google non ha confermato l’accesso.'], err_google_disabled: ['Google sign-in is not available.', 'L’accesso con Google non è disponibile.'], err_google_email: ['The Google address is not confirmed.', 'L’indirizzo Google non è confermato.'],
  // settings, as in SavPresentations and SavDocuments
  name_t: ['Shown to the people who answer.', 'La vedono le persone che rispondono.'],
  password_t: ['To sign in with your email.', 'Per entrare con la tua email.'],
  password_none_t: ['You sign in with Google or SavAccount: you can add one.', 'Entri con Google o SavAccount: puoi aggiungerne una.'],
  sign_in_ways: ['Ways to sign in', 'Modi per entrare'], sign_in_ways_t: ['Google, SavAccount and password, joined to this account.', 'Google, SavAccount e password, collegati a questo account.'],
  sign_out_t: ['On this device.', 'Su questo dispositivo.'],
  export_data_t: ['Everything stored about you, in one file.', 'Tutto quello che è salvato su di te, in un file.'],
  delete_account_short: ['Your polls, slots and answers go for good.', 'I tuoi sondaggi, turni e risposte spariscono per sempre.'],
  recent: ['Recent', 'Recenti'],
};
T.places_taken_l = T.places_taken_l || T.places_taken;

let lang = (() => { try { return localStorage.getItem('savschedules-lang'); } catch { return null; } })() || (navigator.language.startsWith('it') ? 'it' : 'en');
export const getLang = () => lang;
export function setLang(l) {
  lang = l === 'it' ? 'it' : 'en';
  try { localStorage.setItem('savschedules-lang', lang); } catch { /* private mode */ }
  document.documentElement.lang = lang;
}
const DEV = /^(localhost|127\.)/.test(location.hostname);
export const t = (k, v = {}) => { if (!T[k] && DEV) console.warn('i18n missing:', k); return (T[k] ? T[k][lang === 'it' ? 1 : 0] : k).replace(/\{(\w+)\}/g, (m, x) => v[x] ?? m); };
export const has = (k) => !!T[k];
export function when(iso) {
  if (!iso) return '';
  const d = new Date(iso), s = (Date.now() - d) / 1000, rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (s < 60) return rtf.format(0, 'minute');
  if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour');
  if (s < 7 * 86400) return rtf.format(-Math.floor(s / 86400), 'day');
  return d.toLocaleDateString(lang, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
