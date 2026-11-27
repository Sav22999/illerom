/** Texts of the app, in English and Italian: the ones shared with the other apps of SavOffice (accounts, settings), then the tasks. */
const T = {
  // general
  cancel: ['Cancel', 'Annulla'], close: ['Close', 'Chiudi'], save: ['Save', 'Salva'], delete: ['Delete', 'Elimina'], create: ['Create', 'Crea'], add: ['Add', 'Aggiungi'], done: ['Done', 'Fatto'],
  copy: ['Copy', 'Copia'], copied: ['Copied', 'Copiato'], more: ['More', 'Altro'], retry: ['Try again', 'Riprova'], remove: ['Remove', 'Rimuovi'], name: ['Name', 'Nome'], search: ['Search', 'Cerca'],
  open: ['Open', 'Apri'], edit: ['Edit', 'Modifica'], home: ['Home', 'Home'], undo: ['Undo', 'Annulla'], rename: ['Rename', 'Rinomina'], duplicate: ['Duplicate', 'Duplica'], deleted: ['Deleted', 'Eliminata'],
  today: ['Today', 'Oggi'], tomorrow: ['Tomorrow', 'Domani'], yesterday: ['Yesterday', 'Ieri'], later: ['Later', 'Più avanti'], or: ['or', 'oppure'], day: ['Day', 'Giorno'], time: ['Time', 'Ora'], from: ['From', 'Dalle'],
  length: ['Length', 'Durata'], minutes_n: ['{n} minutes', '{n} minuti'], hours_n: ['{n} h', '{n} h'], all_day: ['All day', 'Tutto il giorno'], color: ['Colour', 'Colore'], icon: ['Icon', 'Icona'], no_icon: ['No icon', 'Nessuna icona'],
  place: ['Place', 'Luogo'], place_ph: ['An address, a room or a video call', 'Un indirizzo, una stanza o una videochiamata'], calendar: ['Calendar', 'Calendario'], files: ['Files', 'File'], stay_here: ['Stay here', 'Resta qui'],
  created: ['Created', 'Creato'], created_w: ['created {w}', 'creata {w}'], updated_w: ['changed {w}', 'modificata {w}'], results_for: ['Results for “{q}”', 'Risultati per «{q}»'], nothing_found: ['Nothing found', 'Nessun risultato'],

  // time tracked (track.js)
  v_time: ['Time', 'Tempo'], tt_time: ['Time tracked', 'Tempo tracciato'], tt_start: ['Start timer', 'Avvia timer'], tt_stop: ['Stop timer', 'Ferma timer'],
  tt_stopped: ['Timer stopped: {d}', 'Timer fermato: {d}'], tt_started_on: ['Timer started on “{t}”', 'Timer avviato su «{t}»'], tt_running: ['Running', 'In corso'], tt_running_on: ['Timer running on “{t}”: open', 'Timer in corso su «{t}»: apri'],
  tt_running_t: ['Timer running', 'Timer in corso'], tt_no_task: ['No task', 'Nessuna attività'], tt_no_project: ['No project', 'Nessun progetto'], tt_no_note: ['No note', 'Nessuna nota'],
  tt_add: ['Add time', 'Aggiungi tempo'], tt_new: ['New time entry', 'Nuova voce di tempo'], tt_edit: ['Time entry', 'Voce di tempo'], tt_project: ['Project or client', 'Progetto o cliente'],
  tt_how: ['How', 'Come'], tt_from_to: ['From – to', 'Dalle – alle'], tt_length: ['Length', 'Durata'], tt_to: ['To', 'Alle'], tt_hours: ['Hours', 'Ore'], tt_minutes: ['Minutes', 'Minuti'], tt_started_at: ['Started at', 'Avviato alle'],
  tt_note: ['Note', 'Nota'], tt_note_ph: ['What was done', 'Cosa è stato fatto'], tt_billable: ['Billable', 'Fatturabile'], tt_billable_h: ['Billable hours', 'Ore fatturabili'], tt_hours_total: ['Hours', 'Ore'],
  tt_total: ['Total', 'Totale'], tt_amount: ['Amount', 'Importo'], tt_rate: ['Rate', 'Tariffa'], tt_rate_l: ['Hourly rate', 'Tariffa oraria'],
  tt_rate_help: ['Optional: the billable time of this list (a project or a client) is billed at this rate.', 'Facoltativa: il tempo fatturabile di questa lista (un progetto o un cliente) si fattura a questa tariffa.'],
  tt_rates: ['Rates and currency', 'Tariffe e valuta'], tt_currency: ['Currency', 'Valuta'],
  tt_rates_t: ['Every list is a project or a client: give it an hourly rate to see the amounts of its billable time. Empty: no rate.', 'Ogni lista è un progetto o un cliente: dalle una tariffa oraria per vedere gli importi del suo tempo fatturabile. Vuota: nessuna tariffa.'],
  tt_no_rates: ['No list has an hourly rate yet: set one in “Rates and currency” to see the amounts.', 'Nessuna lista ha ancora una tariffa oraria: impostala in «Tariffe e valuta» per vedere gli importi.'],
  tt_min: ['{n} min', '{n} min'], tt_hm: ['{h} h {m}', '{h} h {m}'], tt_period: ['Period', 'Periodo'], tt_week: ['Week', 'Settimana'], tt_month: ['Month', 'Mese'], tt_range: ['Days', 'Intervallo'],
  tt_prev: ['Previous', 'Precedente'], tt_next: ['Next', 'Successivo'], tt_this_week: ['This week', 'Questa settimana'], tt_this_month: ['This month', 'Questo mese'],
  tt_all_projects: ['All projects', 'Tutti i progetti'], tt_all: ['All entries', 'Tutte le voci'], tt_only_bill: ['Billable only', 'Solo fatturabili'], tt_only_nonbill: ['Not billable', 'Non fatturabili'],
  tt_by_project: ['By project or client', 'Per progetto o cliente'], tt_by_task: ['By task', 'Per attività'], tt_entries: ['Entries', 'Voci'], tt_more: ['{n} more', 'Altre {n}'],
  tt_empty: ['No time in these days', 'Nessun tempo in questi giorni'], tt_empty_t: ['Start the timer on a task (the ▶ button of its row or its detail), or add the time by hand.', 'Avvia il timer su un’attività (il pulsante ▶ della sua riga o del dettaglio), oppure aggiungi il tempo a mano.'],
  tt_export: ['Export', 'Esporta'], tt_csv: ['Download CSV', 'Scarica CSV'], tt_sheets: ['Open in SavSpreadsheets', 'Apri in SavSpreadsheets'],
  tt_sheet_saved: ['Saved in SavDrive as {n}: it opens in SavSpreadsheets', 'Salvato in SavDrive come {n}: si apre in SavSpreadsheets'],
  tt_sheet_nodrive: ['Sign in to SavDrive to open it straight in SavSpreadsheets: meanwhile the .savspr file was downloaded.', 'Accedi a SavDrive per aprirlo direttamente in SavSpreadsheets: intanto è stato scaricato il file .savspr.'],
  tt_sheet_fail: ['It could not be saved in SavDrive: the file was downloaded instead.', 'Non è stato possibile salvarlo in SavDrive: il file è stato scaricato.'],
  tt_sheet_entries: ['Entries', 'Voci'], tt_sheet_summary: ['Summary', 'Riepilogo'], tt_report_title: ['Time tracked from {a} to {b}', 'Tempo tracciato dal {a} al {b}'],
  tt_saved: ['Saved', 'Salvata'], tt_deleted: ['Entry deleted', 'Voce eliminata'], tt_delete: ['Delete entry', 'Elimina voce'], tt_delete_t: ['This time entry will be deleted for good.', 'Questa voce di tempo verrà eliminata definitivamente.'],
  tt_yes: ['yes', 'sì'], tt_no: ['no', 'no'],
  err_bad_length: ['The time must be between 1 minute and 24 hours.', 'Il tempo deve essere tra 1 minuto e 24 ore.'], err_too_many_times: ['You reached the most time entries (50,000).', 'Hai raggiunto il massimo di voci di tempo (50.000).'],
  err_bad_rate: ['The rate is not a valid number.', 'La tariffa non è un numero valido.'],

  // landing and accounts (shared with the other apps of SavOffice)
  land_kicker: ['Part of SavOffice · free and open', 'Parte di SavOffice · libero e aperto'],
  land_title: ['Everything to do, in one place.', 'Tutto da fare, in un posto solo.'],
  land_text: ['To-dos, lists and boards, with due days, reminders and repetitions. Together with SavCalendar and SavSchedules: tasks show in your calendar, and a task can become an event or a poll.', 'Attività, liste e bacheche, con scadenze, promemoria e ripetizioni. Insieme a SavCalendar e SavSchedules: le attività compaiono nel calendario, e un’attività può diventare un evento o un sondaggio.'],
  l_cta: ['Start for free', 'Inizia gratis'], l_small: ['Free, open source, no ads, no trackers.', 'Gratis, open source, senza pubblicità né tracciamenti.'],
  ft_lists: ['Lists and to-dos', 'Liste e cose da fare'], ft_lists_t: ['Today, upcoming, starred: write “call Anna tomorrow 15:00 !high” and it is planned.', 'Oggi, prossimi, speciali: scrivi «chiamare Anna domani 15:00 !alta» ed è già pianificata.'],
  ft_board: ['Boards and Gantt', 'Bacheche e Gantt'], ft_board_t: ['Any list becomes a kanban board (columns of your own, cards to drag) or a Gantt chart (bars from start to due day, stretched with the mouse).', 'Ogni lista diventa una bacheca kanban (colonne tue, schede da trascinare) o un diagramma di Gantt (barre dall’inizio alla scadenza, da allungare col mouse).'],
  ft_remind: ['Reminders', 'Promemoria'], ft_remind_t: ['By email and in the browser, at the time you choose; repetitions plan the next one by themselves.', 'Via email e nel browser, all’ora che scegli; le ripetizioni pianificano da sole la volta dopo.'],
  ft_cal: ['In SavCalendar', 'In SavCalendar'], ft_cal_t: ['Tasks with a due day show in your calendar, and a task can take its own time there.', 'Le attività con una scadenza compaiono nel calendario, e un’attività può prendersi il suo spazio lì.'],
  ft_sch: ['With SavSchedules', 'Con SavSchedules'], ft_sch_t: ['A task that needs others becomes a date poll; polls to decide and places booked come here as to-dos.', 'Un’attività che coinvolge altri diventa un sondaggio; i sondaggi da decidere e i posti prenotati arrivano qui come cose da fare.'],
  ft_free: ['Yours', 'Tuo'], ft_free_t: ['No ads, no tracking, your data downloadable at any time. Part of SavOffice.', 'Niente pubblicità né tracciamenti, i tuoi dati scaricabili quando vuoi. Parte di SavOffice.'],
  how_title: ['How it works', 'Come funziona'],
  how_1: ['Sign in', 'Entra'], how_1_t: ['With your SavSchedules or SavCalendar account, or create one: it is the same.', 'Con il tuo account SavSchedules o SavCalendar, o creane uno: è lo stesso.'],
  how_2: ['Write it down', 'Scrivilo'], how_2_t: ['One line is enough: the day, the time and the labels are understood by themselves.', 'Basta una riga: giorno, ora ed etichette vengono capiti da soli.'],
  how_3: ['Get it done', 'Fallo'], how_3_t: ['Today shows what matters; tick it and move on.', 'Oggi mostra quello che conta; spuntalo e vai avanti.'],
  p_list: ['Groceries', 'Spesa'], p_board: ['Project', 'Progetto'], p_todo: ['To do', 'Da fare'], p_doing: ['Doing', 'In corso'], p_done: ['Done', 'Fatto'], p_today: ['Today', 'Oggi'], p_late: ['Late', 'In ritardo'], p_remind: ['Call the dentist', 'Chiamare il dentista'], p_task: ['Write the report', 'Scrivere il report'],
  sign_in: ['Sign in', 'Accedi'], sign_up: ['Create account', 'Crea account'], sign_out: ['Sign out', 'Esci'], settings: ['Settings', 'Impostazioni'],
  your_name: ['Your name', 'Il tuo nome'], email: ['Email', 'Email'], password: ['Password', 'Password'], email_fixed: ['It cannot be changed later.', 'Non potrà essere cambiata in seguito.'], pw_hint: ['At least 8 characters.', 'Almeno 8 caratteri.'],
  accept: ['I accept the', 'Accetto i'], terms: ['terms', 'termini'], and_privacy: ['and the', 'e l’'], privacy: ['privacy notice', 'informativa sulla privacy'], terms_c: ['Terms', 'Termini'],
  forgot: ['Forgot your password?', 'Password dimenticata?'], forgot_text: ['We will send you a link to choose a new one.', 'Ti mandiamo un link per sceglierne una nuova.'], send_link: ['Send the link', 'Invia il link'], link_sent: ['If the address has an account, the link is on its way.', 'Se l’indirizzo ha un account, il link è in arrivo.'],
  check_email: ['Check your email', 'Controlla la tua email'], check_email_text: ['We sent you a link to confirm the address. If you do not see it, look in the spam.', 'Ti abbiamo mandato un link per confermare l’indirizzo. Se non lo vedi, guarda nello spam.'],
  mail_off: ['Emails are switched off on this server.', 'Le email sono disattivate su questo server.'],
 google_terms: ['By continuing with SavAccount you accept the terms and the privacy notice.', 'Continuando con SavAccount accetti i termini e l’informativa sulla privacy.'],
not_ready: ['Not ready yet', 'Non ancora pronto'],
  verify_title: ['Confirm your email', 'Conferma la tua email'], verify_text: ['Press the button to confirm the address and sign in.', 'Premi il pulsante per confermare l’indirizzo e accedere.'], verify_btn: ['Confirm and sign in', 'Conferma e accedi'],
  reset_title: ['Choose a new password', 'Scegli una nuova password'], new_password: ['New password', 'Nuova password'], current_pw: ['Current password', 'Password attuale'],
  unverified: ['Confirm your email to go on', 'Conferma la tua email per continuare'], resend: ['Send the link again', 'Invia di nuovo il link'], resent: ['Link sent', 'Link inviato'], language: ['Language', 'Lingua'],
  changelog: ['What’s new', 'Novità'], changelog_t: ['The versions of SavTasks and what changed in each. This is version {v}.', 'Le versioni di SavTasks e cosa è cambiato in ognuna. Questa è la versione {v}.'], current_v: ['current version', 'versione attuale'],
  open_calendar: ['Open SavCalendar', 'Apri SavCalendar'], open_schedules: ['Open SavSchedules', 'Apri SavSchedules'], shortcuts: ['Keyboard shortcuts', 'Scorciatoie da tastiera'],

  // views and side
  v_today: ['Today', 'Oggi'], v_upcoming: ['Upcoming', 'Prossimi'], v_starred: ['Starred', 'Speciali'], v_done: ['Done', 'Fatte'], v_schedules: ['From SavSchedules', 'Da SavSchedules'], inbox: ['Inbox', 'In arrivo'],
  views: ['Views', 'Viste'], lists: ['Lists', 'Liste'], my_lists: ['My lists', 'Le mie liste'], no_lists: ['No lists yet: + makes one.', 'Ancora nessuna lista: + ne crea una.'], archived_n: ['Archived ({n})', 'Archiviate ({n})'], labels: ['Labels', 'Etichette'],
  new_task: ['New task', 'Nuova attività'], new_list: ['New list', 'Nuova lista'], new_board: ['New board', 'Nuova bacheca'], open_file: ['Open a file', 'Apri un file'], board: ['Board', 'Bacheca'], search_tasks: ['Search tasks', 'Cerca attività'],
  n_open: ['{n} to do', '{n} da fare'], n_tasks: ['{n} tasks', '{n} attività'], n_items: ['{n} things', '{n} elementi'], overdue: ['Overdue', 'In ritardo'], move_today: ['Move to today', 'Sposta a oggi'], moved_today: ['{n} moved to today', '{n} spostate a oggi'],
  nothing_planned: ['Nothing planned', 'Niente in programma'], nothing_here: ['Nothing here', 'Qui non c’è niente'],
  empty_today: ['All clear for today', 'Tutto fatto per oggi'], empty_today_t: ['Nothing due today or late. Enjoy it, or plan something above.', 'Niente in scadenza oggi o in ritardo. Goditela, o pianifica qualcosa qui sopra.'],
  empty_starred: ['No starred tasks', 'Nessuna attività speciale'], empty_starred_t: ['Press the star of a task to keep it here.', 'Premi la stella di un’attività per tenerla qui.'],
  empty_done: ['Nothing done yet', 'Ancora niente di fatto'], empty_done_t: ['What you tick stays here for 60 days.', 'Quello che spunti resta qui per 60 giorni.'],
  empty_inbox: ['The inbox is empty', 'Nessuna attività in arrivo'], empty_list: ['No tasks yet', 'Ancora nessuna attività'], empty_list_t: ['Write one in the box above and press Enter.', 'Scrivine una nel riquadro qui sopra e premi Invio.'],
  show_as: ['Show as', 'Mostra come'], as_list: ['List', 'Lista'], as_board: ['Board', 'Bacheca'], sort: ['Sort', 'Ordina'], sort_manual: ['My order', 'Il mio ordine'], sort_due: ['Due date', 'Scadenza'], sort_priority: ['Priority', 'Priorità'], sort_title: ['Title', 'Titolo'], sort_created: ['Newest first', 'Più recenti prima'],
  show_done: ['Show done tasks', 'Mostra le attività fatte'], show_done_t: ['At the end of each list, and in the column of done tasks of the boards.', 'In fondo a ogni lista, e nella colonna delle attività fatte delle bacheche.'],
  done_n: ['Done ({n})', 'Fatte ({n})'], clear_done: ['Delete the done ones', 'Elimina quelle fatte'], clear_done_t: ['The done tasks of this list will be deleted for good.', 'Le attività fatte di questa lista verranno eliminate per sempre.'],
  edit_list: ['Name, colour and icon', 'Nome, colore e icona'], list_ph: ['e.g. Home, Work, Holidays', 'es. Casa, Lavoro, Vacanze'], archive: ['Archive', 'Archivia'], unarchive: ['Bring back', 'Ripristina'], archived: ['List archived', 'Lista archiviata'], unarchived: ['List back', 'Lista ripristinata'],
  delete_list: ['Delete the list', 'Elimina la lista'], delete_list_t: ['“{name}” and its {n} tasks will be deleted for good.', '«{name}» e le sue {n} attività verranno eliminate per sempre.'],
  save_savtas: ['Download (.savtas)', 'Scarica (.savtas)'], save_csv: ['Download for spreadsheets (.csv)', 'Scarica per fogli di calcolo (.csv)'], save_md: ['Download as a checklist (.md)', 'Scarica come checklist (.md)'],
  paste_lines: ['Add from text', 'Aggiungi da testo'], paste_label: ['One task per line', 'Un’attività per riga'], paste_ph: ['Buy bread\n- [ ] Call Anna\n  - [ ] a subtask (indented)', 'Comprare il pane\n- [ ] Chiamare Anna\n  - [ ] una sottoattività (rientrata)'],
  paste_t: ['Every line becomes a task of “{l}”; indented lines become its subtasks. Markdown checklists work too.', 'Ogni riga diventa un’attività di «{l}»; le righe rientrate diventano sue sottoattività. Vanno bene anche le checklist Markdown.'],
  imported_n: ['{n} tasks added', '{n} attività aggiunte'], opened_list: ['“{l}” opened: {n} tasks', '«{l}» aperta: {n} attività'],
  qa_ph: ['Add a task… e.g. “Call Anna tomorrow 15:00 !high #work”', 'Aggiungi un’attività… es. «Chiamare Anna domani 15:00 !alta #lavoro»'], qa_ph_short: ['Add a task…', 'Aggiungi un’attività…'],
  qa_understood: ['Understood:', 'Ho capito:'], qa_hint: ['Enter adds it. Days, times, !priority, #labels and @lists are understood.', 'Invio la aggiunge. Giorni, orari, !priorità, #etichette e @liste vengono capiti.'], added_to: ['Added to {l}', 'Aggiunta a {l}'],
  mark_done: ['Mark as done', 'Segna come fatta'], mark_open: ['Mark as not done', 'Segna come da fare'], star: ['Star', 'Aggiungi agli speciali'], unstar: ['Remove the star', 'Togli dagli speciali'], no_title: ['(no title)', '(senza titolo)'],
  done_one: ['Done!', 'Fatto!'], done_next: ['Done! The next one is {d}', 'Fatto! La prossima è {d}'],
  k_new: ['New task (quick add)', 'Nuova attività (aggiunta rapida)'], k_search: ['Search', 'Cerca'], k_board: ['List or board', 'Lista o bacheca'], k_quick: ['In the quick add: “tomorrow”, “friday 3pm”, “every monday”, “!high”, “#label”, “@list”, “*” for the star.', 'Nell’aggiunta rapida: «domani», «venerdì 15:00», «ogni lunedì», «!alta», «#etichetta», «@lista», «*» per la stella.'],

  // a task
  task: ['Task', 'Attività'], title_l: ['Title', 'Titolo'], title_ph: ['What is there to do?', 'Cosa c’è da fare?'], list: ['List', 'Lista'], column: ['Column', 'Colonna'], when: ['When', 'Quando'], due: ['Due', 'Scadenza'],
  next_week: ['Next week', 'Settimana prossima'], no_date: ['No date', 'Senza data'], repeat: ['Repeat', 'Ripeti'], repeats: ['Repeats', 'Si ripete'], reminder: ['Reminder', 'Promemoria'], priority: ['Priority', 'Priorità'],
  p_none: ['None', 'Nessuna'], p_low: ['Low', 'Bassa'], p_medium: ['Medium', 'Media'], p_high: ['High', 'Alta'], labels_ph: ['Write and press Enter', 'Scrivi e premi Invio'],
  subtasks: ['Subtasks', 'Sottoattività'], subtask: ['Subtask', 'Sottoattività'], add_subtask: ['Add a subtask…', 'Aggiungi una sottoattività…'], notes: ['Notes', 'Note'], notes_ph: ['Details, links, anything useful', 'Dettagli, link, qualsiasi cosa utile'],
  moved_to: ['Moved to {l}', 'Spostata in {l}'], delete_task: ['Delete the task', 'Elimina l’attività'], delete_task_t: ['“{t}” will be deleted for good.', '«{t}» verrà eliminata per sempre.'],
  r_none: ['Does not repeat', 'Non si ripete'], r_every_day: ['Every day', 'Ogni giorno'], r_every_week: ['Every week', 'Ogni settimana'], r_every_month: ['Every month', 'Ogni mese'], r_every_year: ['Every year', 'Ogni anno'], r_weekdays: ['Every weekday (Mon–Fri)', 'Ogni giorno feriale (lun–ven)'],
  r_every_n_day: ['Every {n} days', 'Ogni {n} giorni'], r_every_n_week: ['Every {n} weeks', 'Ogni {n} settimane'], r_every_n_month: ['Every {n} months', 'Ogni {n} mesi'], r_every_n_year: ['Every {n} years', 'Ogni {n} anni'], r_on: ['on {d}', 'di {d}'],
  rm_none: ['No reminder', 'Nessun promemoria'], rm_at_time: ['At the time', 'All’ora'], rm_before: ['{n} minutes before', '{n} minuti prima'], rm_before_h: ['{n} hour before', '{n} ora prima'], rm_day_before: ['The day before', 'Il giorno prima'],
  rm_morning: ['That day at {t}', 'Quel giorno alle {t}'], rm_eve: ['The day before at {t}', 'Il giorno prima alle {t}'], rm_custom: ['Another time…', 'Un altro momento…'], rm_day: ['Day of the reminder', 'Giorno del promemoria'],
  rm_needs_due: ['A reminder needs a due day.', 'Per un promemoria serve una scadenza.'], rm_past: ['That moment has already passed.', 'Quel momento è già passato.'], rm_sent: ['Reminder sent {w}', 'Promemoria inviato {w}'], rm_by_mail: ['also by email', 'anche per email'],
  with_office: ['With SavOffice', 'Con SavOffice'], in_calendar: ['In SavCalendar', 'In SavCalendar'],
  cal_none: ['Give this task its own time in your calendar.', 'Dai a questa attività il suo spazio nel calendario.'], cal_linked: ['Event: {w}', 'Evento: {w}'], cal_add: ['Add to SavCalendar', 'Aggiungi a SavCalendar'], cal_again: ['Add again', 'Aggiungi di nuovo'],
  cal_add_t: ['An event of your own calendar, with a link back to this task.', 'Un evento del tuo calendario, con un link a questa attività.'], cal_done: ['In your calendar', 'Nel tuo calendario'], cal_done_t: ['The event is in “{c}”.', 'L’evento è in «{c}».'], open_in_cal: ['Open in SavCalendar', 'Apri in SavCalendar'],
  sch_none_task: ['Does it need other people? Find the date with a poll.', 'Coinvolge altre persone? Trova la data con un sondaggio.'], find_date: ['Find a date with others', 'Trova una data con altri'],
  find_date_t: ['Choose a few dates: a poll of SavSchedules is created and opens in its editor, where you share it. When the date is chosen, this task shows it.', 'Scegli qualche data: viene creato un sondaggio di SavSchedules che si apre nel suo editor, dove lo condividi. Quando la data è scelta, questa attività la mostra.'],
  time_opt: ['Time (optional)', 'Ora (facoltativa)'], next_5: ['Next 5 weekdays', 'I prossimi 5 giorni feriali'], pick_some: ['No dates yet: choose a day and press Add.', 'Ancora nessuna data: scegli un giorno e premi Aggiungi.'], create_open: ['Create and open', 'Crea e apri'],
  created_sch: ['The poll is ready', 'Il sondaggio è pronto'], created_sch_t: ['Open it in SavSchedules to set who can answer and to share the link.', 'Aprilo in SavSchedules per scegliere chi può rispondere e condividere il link.'], open_in_sch: ['Open in SavSchedules', 'Apri in SavSchedules'],
  sch_open: ['Poll open: {n} answers', 'Sondaggio aperto: {n} risposte'], sch_final: ['Date chosen: {w}', 'Data scelta: {w}'], use_date: ['Use as due day', 'Usala come scadenza'], date_taken: ['Due day set from the poll', 'Scadenza presa dal sondaggio'],
  sch_date_set: ['The poll has its date', 'Il sondaggio ha la sua data'], sch_waiting: ['Poll waiting for answers', 'Sondaggio in attesa di risposte'], date_set: ['date set', 'data scelta'],

  // New
  new_l: ['New', 'Nuovo'], new_list_dots: ['New list…', 'Nuova lista…'], what_new: ['What do you want to make?', 'Cosa vuoi creare?'], new_matrix: ['New Eisenhower matrix', 'Nuova matrice di Eisenhower'],
  nk_task: ['Task', 'Attività'], nk_task_t: ['One thing to do, in a list', 'Una cosa da fare, in una lista'], nk_list: ['List', 'Lista'], nk_list_t: ['To-dos one under the other', 'Cose da fare una sotto l’altra'],
  nk_board: ['Kanban board', 'Bacheca kanban'], nk_board_t: ['Columns and cards to drag', 'Colonne e schede da trascinare'], nk_gantt: ['Gantt', 'Gantt'], nk_gantt_t: ['Bars from start to due day', 'Barre dall’inizio alla scadenza'],
  nk_matrix: ['Eisenhower matrix', 'Matrice di Eisenhower'], nk_matrix_t: ['Urgent or important?', 'Urgente o importante?'],
  open_details: ['Open its details after', 'Apri i dettagli dopo'], start_with: ['Start with', 'Inizia con'], tpl_info: ['{n} tasks ready to change or delete; dates count from today.', '{n} attività pronte da cambiare o eliminare; le date partono da oggi.'],
  matrix: ['Matrix', 'Matrice'], as_matrix: ['Matrix', 'Matrice'], q1_t: ['Do it now', 'Fallo subito'], q2_t: ['Plan it', 'Pianificalo'], q3_t: ['Delegate it', 'Delegalo'], q4_t: ['Drop it', 'Lascialo perdere'],

  // table and habits
  as_table: ['Table', 'Tabella'], tc_title: ['Task', 'Attività'], tc_status: ['Status', 'Stato'], tc_start: ['Start', 'Inizio'], tc_due: ['Due', 'Scadenza'], tc_priority: ['Priority', 'Priorità'], tc_tags: ['Labels', 'Etichette'],
  tc_progress: ['Progress', 'Avanzamento'], tc_created: ['Created', 'Creata'], tc_cols: ['Columns shown', 'Colonne mostrate'], other_date: ['Another day…', 'Un altro giorno…'],
  habits: ['Habits', 'Abitudini'], nk_habits: ['Habits', 'Abitudini'], nk_habits_t: ['Every day, with the streak', 'Ogni giorno, con la serie'], new_habits: ['New list of habits', 'Nuova lista di abitudini'],
  h_this_week: ['This week', 'Questa settimana'], h_prev: ['Week before', 'Settimana prima'], h_next: ['Week after', 'Settimana dopo'], h_streak: ['Streak', 'Serie'], h_best: ['Best streak', 'Serie migliore'], h_rate30: ['Last 30 days', 'Ultimi 30 giorni'],
  h_rate: ['{n}% in 30 days', '{n}% in 30 giorni'], h_stats: ['Best streak: {best} · last 30 days: {rate}%', 'Serie migliore: {best} · ultimi 30 giorni: {rate}%'], h_done: ['done', 'fatto'], h_not_done: ['not done', 'non fatto'],
  h_empty: ['No habits yet', 'Ancora nessuna abitudine'], h_empty_t: ['Write one above: every day by default, or “every monday”, “weekdays”.', 'Scrivine una qui sopra: ogni giorno, oppure «ogni lunedì», «giorni feriali».'],
  h_today: ['Habits of today', 'Abitudini di oggi'], n_habits: ['{n} habits', '{n} abitudini'], habit: ['Habit', 'Abitudine'], new_habit: ['New habit', 'Nuova abitudine'],
  qa_habit: ['Add a habit… e.g. “Drink water”, “Gym every monday”, “Read weekdays”', 'Aggiungi un’abitudine… es. «Bere acqua», «Palestra ogni lunedì», «Leggere giorni feriali»'], qa_habit_short: ['Add a habit…', 'Aggiungi un’abitudine…'], h_when: ['Which days', 'Quali giorni'], h_weekdays: ['Weekdays', 'Feriali'], h_days: ['Days chosen', 'Giorni scelti'],

  // Gantt
  gantt: ['Gantt', 'Gantt'], as_gantt: ['Gantt', 'Gantt'], new_gantt: ['New Gantt chart', 'Nuovo diagramma di Gantt'], k_gantt: ['List or Gantt', 'Lista o Gantt'],
  start_day: ['Start (optional)', 'Inizio (facoltativo)'], start_day_t: ['From here to the due day: the bar of the Gantt.', 'Da qui alla scadenza: la barra del Gantt.'], start_after_due: ['The start comes after the due day.', 'L’inizio viene dopo la scadenza.'],
  g_task: ['Task', 'Attività'], g_scale: ['Scale', 'Scala'], g_days: ['Days', 'Giorni'], g_weeks: ['Weeks', 'Settimane'], g_days_n: ['{n} days', '{n} giorni'],
  g_hint: ['Drag a bar to move it, its edges to change start and due day.', 'Trascina una barra per spostarla, i suoi bordi per cambiare inizio e scadenza.'],
  g_undated: ['Without dates', 'Senza date'], g_undated_t: ['Press a day on the row of a task to plan it.', 'Premi un giorno sulla riga di un’attività per pianificarla.'], g_planned: ['Planned for {d}', 'Pianificata per {d}'],
  g_empty: ['No tasks yet', 'Ancora nessuna attività'], g_empty_t: ['Add one above: with a start and a due day it becomes a bar, with a due day only a milestone.', 'Aggiungine una qui sopra: con inizio e scadenza diventa una barra, con la sola scadenza una tappa.'],

  // board
  add_card: ['Add a card', 'Aggiungi una scheda'], card_ph: ['What is there to do?', 'Cosa c’è da fare?'], add_column: ['Add a column', 'Aggiungi una colonna'], column_ph: ['e.g. Waiting', 'es. In attesa'], new_column: ['New column', 'Nuova colonna'],
  col_done: ['Column of done tasks', 'Colonna delle attività fatte'], col_not_done: ['Not the column of done tasks', 'Non è la colonna delle attività fatte'], move_left: ['Move left', 'Sposta a sinistra'], move_right: ['Move right', 'Sposta a destra'], move_up: ['Move up', 'Sposta su'], move_down: ['Move down', 'Sposta giù'],
  delete_column: ['Delete the column', 'Elimina la colonna'], delete_column_t: ['The cards of “{name}” move to “{first}”.', 'Le schede di «{name}» passano in «{first}».'], move_to: ['Move to', 'Sposta in'], done_hidden: ['{n} done, hidden', '{n} fatte, nascoste'],
  edit_columns: ['Columns', 'Colonne'], edit_columns_t: ['Their names and order. The column of done tasks ticks the cards dropped in it.', 'Nomi e ordine. La colonna delle attività fatte spunta le schede che ci arrivano.'],

  // SavSchedules
  from_sch: ['From SavSchedules', 'Da SavSchedules'], sch_decide: ['{n} answers: choose the date', '{n} risposte: scegli la data'], sch_booked: ['Place booked · {owner}', 'Posto prenotato · {owner}'], sch_gfinal: ['Date chosen · {owner}', 'Data scelta · {owner}'], sch_closed: ['answers closed', 'risposte chiuse'],
  sch_none: ['Nothing from SavSchedules', 'Niente da SavSchedules'], sch_none_t: ['Polls waiting for your decision and places you booked show up here.', 'Qui compaiono i sondaggi che aspettano la tua decisione e i posti che hai prenotato.'],
  sch_note: ['These come from SavSchedules and are changed there: press one to open it.', 'Questi arrivano da SavSchedules e si cambiano lì: premine uno per aprirlo.'],
  sch_g_decide: ['Polls to decide', 'Sondaggi da decidere'], sch_g_booked: ['Places booked', 'Posti prenotati'], sch_g_gfinal: ['Dates chosen', 'Date scelte'],

  // settings
  back_tasks: ['Back to the tasks', 'Torna alle attività'], settings_saved: ['Settings saved', 'Impostazioni salvate'], settings_t: ['They apply to this account on every device.', 'Valgono per questo account su ogni dispositivo.'],
  g_account: ['Account', 'Account'], name_t: ['Shown in SavSchedules to the people who answer.', 'La vedono in SavSchedules le persone che rispondono.'], password_t: ['To sign in with your email.', 'Per entrare con la tua email.'], password_none_t: ['You sign in with SavAccount: you can add one.', 'Entri con SavAccount: puoi aggiungerne una.'],
  change_pw: ['Change the password', 'Cambia la password'], set_pw: ['Set a password', 'Imposta una password'], sign_in_ways: ['Ways to sign in', 'Modi per entrare'], sign_in_ways_t: ['SavAccount and password, joined to this account.', 'SavAccount e password, collegati a questo account.'], sign_out_t: ['On this device.', 'Su questo dispositivo.'],
  shared_account: ['This is your SavSchedules and SavCalendar account too: name, password and ways to sign in are the same in all three apps.', 'Questo è anche il tuo account SavSchedules e SavCalendar: nome, password e modi di accesso sono gli stessi nelle tre app.'],
  g_tasks: ['Tasks', 'Attività'], g_tasks_t: ['How SavTasks opens and where new tasks go.', 'Come si apre SavTasks e dove finiscono le nuove attività.'], timezone: ['Time zone', 'Fuso orario'], timezone_tasks_t: ['Times of tasks and reminders are on this clock.', 'Orari delle attività e promemoria seguono questo orologio.'],
  home_view: ['When it opens', 'All’apertura'], home_view_t: ['The view shown first.', 'La vista mostrata per prima.'], default_list: ['New tasks go to', 'Le nuove attività vanno in'], default_list_t: ['From the views that are not a list (today, upcoming…).', 'Dalle viste che non sono una lista (oggi, prossimi…).'], week_start: ['The week starts on', 'La settimana inizia di'],
  g_reminders: ['Reminders', 'Promemoria'], g_reminders_t: ['When a task with a due day reminds you, and how.', 'Quando un’attività con scadenza te lo ricorda, e come.'],
  auto_remind: ['A reminder for every due day', 'Un promemoria per ogni scadenza'], auto_remind_t: ['New tasks with a due day get one by themselves (you can change it in each task).', 'Le nuove attività con scadenza ne ricevono uno da sole (puoi cambiarlo in ogni attività).'],
  remind_at: ['For the whole day, at', 'Per tutto il giorno, alle'], remind_at_t: ['The reminder of a task with a day but no time.', 'Il promemoria di un’attività con giorno ma senza ora.'],
  remind_before: ['With a time', 'Con un orario'], remind_before_t: ['How long before the time of a task.', 'Quanto prima dell’ora di un’attività.'], minutes_before: ['{n} minutes before', '{n} minuti prima'],
  mail_reminders: ['Reminders by email', 'Promemoria via email'], mail_reminders_t: ['To {e}, whether the app is open or not.', 'A {e}, che l’app sia aperta o no.'],
  notify: ['Notifications in this browser', 'Notifiche in questo browser'], notify_t: ['While SavTasks is open (or installed as an app).', 'Mentre SavTasks è aperta (o installata come app).'], notify_allow: ['Allow', 'Consenti'], notify_on: ['On', 'Attive'],
  notify_denied: ['Blocked: allow them in the settings of the browser.', 'Bloccate: consentile nelle impostazioni del browser.'], notify_unsupported: ['This browser cannot show them.', 'Questo browser non può mostrarle.'],
  with_office_t: ['What SavTasks shares with the other apps of the same account.', 'Quello che SavTasks condivide con le altre app dello stesso account.'],
  sch_in_tasks_t: ['Polls waiting for your decision and places you booked, as read-only to-dos.', 'Sondaggi che aspettano la tua decisione e posti prenotati, come cose da fare in sola lettura.'],
  cal_layer_t: ['Tasks with a due day show in your calendar: switch them on or off in its settings.', 'Le attività con scadenza compaiono nel calendario: accendile o spegnile nelle sue impostazioni.'],
  look_app: ['Look', 'Aspetto'], theme: ['Theme', 'Tema'], your_data: ['Your data', 'I tuoi dati'], your_data_t: ['Download everything SavTasks keeps, or delete the account.', 'Scarica tutto quello che SavTasks conserva, oppure elimina l’account.'],
  export_data: ['Download my data', 'Scarica i miei dati'], export_data_t: ['Every list and task, in one file.', 'Ogni lista e attività, in un file.'], open_file_t: ['A .savtas file, or a text or Markdown list: it becomes a new list.', 'Un file .savtas, o un elenco di testo o Markdown: diventa una nuova lista.'],
  delete_account: ['Delete the account', 'Elimina l’account'], delete_account_text: ['The account will be deleted for good in SavTasks, SavCalendar and SavSchedules, with all its lists, calendars, polls and answers.', 'L’account verrà eliminato per sempre in SavTasks, SavCalendar e SavSchedules, con tutte le sue liste, calendari, sondaggi e risposte.'],
  delete_account_short: ['It goes in all three apps.', 'Sparisce in tutte e tre le app.'], delete_forever: ['Delete forever', 'Elimina per sempre'],

  // errors (codes of the server)
  err_server: ['Something went wrong. Try again in a moment.', 'Qualcosa è andato storto. Riprova tra poco.'], err_network: ['No connection.', 'Nessuna connessione.'], err_not_installed: ['The database is not configured yet.', 'Il database non è ancora configurato.'],
  err_quota: ['Your space of SavOffice is full (one for every app, the space of SavDrive): free some to save more.', 'Il tuo spazio di SavOffice è pieno (uno per tutte le app, quello di SavDrive): liberane un po’ per salvare altro.'],
  err_unauthenticated: ['Sign in again.', 'Accedi di nuovo.'], err_disabled: ['This account is blocked.', 'Questo account è bloccato.'], err_email_unverified: ['Confirm your email first.', 'Prima conferma la tua email.'], err_csrf: ['The session expired: reload the page.', 'La sessione è scaduta: ricarica la pagina.'],
  err_rate_limited: ['Too many attempts: wait a little.', 'Troppi tentativi: aspetta un po’.'], err_bad_credentials: ['Wrong email or password.', 'Email o password errate.'], err_name_required: ['Write a name.', 'Scrivi un nome.'], err_email_invalid: ['That email does not look right.', 'Questa email non sembra corretta.'],
  err_password_short: ['The password needs at least 8 characters.', 'La password deve avere almeno 8 caratteri.'], err_password_long: ['The password is too long.', 'La password è troppo lunga.'], err_terms_required: ['Accept the terms to go on.', 'Accetta i termini per continuare.'],
  err_token_invalid: ['The link expired or was already used.', 'Il link è scaduto o è già stato usato.'], err_bad_password: ['Wrong password.', 'Password errata.'], err_not_found: ['Not found.', 'Non trovato.'], err_forbidden: ['You cannot do this.', 'Non puoi farlo.'],
  err_bad_request: ['Something in the request is not right.', 'Qualcosa nella richiesta non va.'],  err_title_required: ['Write what there is to do.', 'Scrivi cosa c’è da fare.'], err_too_many_lists: ['You have reached the most lists (100).', 'Hai raggiunto il massimo di liste (100).'], err_too_many_tasks: ['This list is full (5000 tasks).', 'Questa lista è piena (5000 attività).'],
  err_too_many_columns: ['12 columns at most.', 'Al massimo 12 colonne.'], err_inbox_stays: ['The inbox cannot be deleted.', 'La lista In arrivo non si può eliminare.'], err_bad_time: ['Check the date and the time.', 'Controlla data e ora.'], err_nothing_chosen: ['Choose at least one.', 'Scegline almeno uno.'],
  err_too_many_schedules: ['You reached the limit of schedules in SavSchedules.', 'Hai raggiunto il limite di pianificazioni in SavSchedules.'], err_too_many_options: ['400 dates at most.', 'Al massimo 400 date.'],
  err_file_big: ['The file is too big (over 6 MB).', 'Il file è troppo grande (oltre 6 MB).'], err_file_invalid: ['The file is not a .savtas list or a list of text.', 'Il file non è una lista .savtas o un elenco di testo.'],
};

let lang = (() => { try { return localStorage.getItem('savtasks-lang'); } catch { return null; } })() || (navigator.language.startsWith('it') ? 'it' : 'en');
export const getLang = () => lang;
export function setLang(l) {
  lang = l === 'it' ? 'it' : 'en';
  try { localStorage.setItem('savtasks-lang', lang); } catch { /* private mode */ }
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
