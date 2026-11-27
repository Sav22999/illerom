/** Texts of the app, in English and Italian: the ones shared with the other apps of SavOffice (accounts, settings), then the address book. */
const T = {
  // general
  cancel: ['Cancel', 'Annulla'], close: ['Close', 'Chiudi'], save: ['Save', 'Salva'], delete: ['Delete', 'Elimina'], create: ['Create', 'Crea'], add: ['Add', 'Aggiungi'], ok: ['OK', 'OK'],
  copy: ['Copy', 'Copia'], copied: ['Copied', 'Copiato'], more: ['More', 'Altro'], retry: ['Try again', 'Riprova'], remove: ['Remove', 'Rimuovi'], name: ['Name', 'Nome'], search: ['Search', 'Cerca'],
  open: ['Open', 'Apri'], edit: ['Edit', 'Modifica'], home: ['Home', 'Home'], undo: ['Undo', 'Annulla'], change: ['Change', 'Cambia'], all: ['All', 'Tutti'], none: ['None', 'Nessuno'],
  today: ['Today', 'Oggi'], yesterday: ['Yesterday', 'Ieri'], or: ['or', 'oppure'], day: ['Day', 'Giorno'], color: ['Colour', 'Colore'], icon: ['Icon', 'Icona'], notes: ['Notes', 'Note'],
  nothing_found: ['Nothing found', 'Nessun risultato'], someone: ['Someone', 'Qualcuno'], total: ['Total', 'Totale'], print: ['Print', 'Stampa'], you: ['you', 'tu'], person: ['Person', 'Persona'],

  // landing and accounts (shared with the other apps of SavOffice)
  l_cta: ['Start for free', 'Inizia gratis'], l_small: ['Free, open source, no ads, no limits, no trackers.', 'Gratis, open source, senza pubblicità, senza limiti, senza tracciamenti.'],
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
  changelog: ['What’s new', 'Novità'], changelog_t: ['The versions of SavContacts and what changed in each. This is version {v}.', 'Le versioni di SavContacts e cosa è cambiato in ognuna. Questa è la versione {v}.'], current_v: ['current version', 'versione attuale'],
  shortcuts: ['Keyboard shortcuts', 'Scorciatoie da tastiera'], actions_search: ['Search the actions', 'Cerca tra le azioni'],

  // settings
  g_account: ['Account', 'Account'], name_t: ['The others see it in the groups you join.', 'Lo vedono gli altri nei gruppi a cui partecipi.'], password_t: ['To sign in with your email.', 'Per entrare con la tua email.'], password_none_t: ['You sign in with SavAccount: you can add one.', 'Entri con SavAccount: puoi aggiungerne una.'],
  change_pw: ['Change the password', 'Cambia la password'], set_pw: ['Set a password', 'Imposta una password'], sign_in_ways: ['Ways to sign in', 'Modi per entrare'], sign_in_ways_t: ['SavAccount and password, joined to this account.', 'SavAccount e password, collegati a questo account.'], sign_out_t: ['On this device.', 'Su questo dispositivo.'],
  shared_account: ['This is your account of SavSchedules, SavCalendar, SavTasks and the other apps of SavOffice too: name, password and ways to sign in are the same.', 'Questo è anche il tuo account di SavSchedules, SavCalendar, SavTasks e delle altre app di SavOffice: nome, password e modi di accesso sono gli stessi.'],
  look_app: ['Look', 'Aspetto'], theme: ['Theme', 'Tema'], your_data: ['Your data', 'I tuoi dati'], your_data_t: ['Download everything SavContacts keeps, or delete the account.', 'Scarica tutto quello che SavContacts conserva, oppure elimina l’account.'],
  delete_account: ['Delete the account', 'Elimina l’account'], delete_account_text: ['The account will be deleted for good in every app of SavOffice that shares it (SavSchedules, SavCalendar, SavTasks, SavMail…), with all its contacts and groups.', 'L’account verrà eliminato per sempre in ogni app di SavOffice che lo condivide (SavSchedules, SavCalendar, SavTasks, SavMail…), con tutti i suoi contatti e gruppi.'],
  delete_account_short: ['It goes in all the apps that share it.', 'Sparisce in tutte le app che lo condividono.'], delete_forever: ['Delete forever', 'Elimina per sempre'],


  // first page
  land_kicker: ['Part of SavOffice · free and open', 'Parte di SavOffice · libero e aperto'],
  land_title: ['Your contacts, tidy and yours.', 'I tuoi contatti, in ordine e tuoi.'],
  land_text: ['Emails, phones, addresses and birthdays of the people you know, in groups, without copies. They come in and out as vCard and CSV, and the other apps of SavOffice find them: SavMail suggests them, SavCalendar remembers their birthdays.', 'Email, telefoni, indirizzi e compleanni delle persone che conosci, in gruppi, senza doppioni. Entrano ed escono come vCard e CSV, e le altre app di SavOffice li trovano: SavMail te li suggerisce, SavCalendar ricorda i loro compleanni.'],
  l_cta: ['Start for free', 'Inizia gratis'], l_small: ['Free, open source, no ads, no trackers.', 'Gratis, open source, senza pubblicità, senza tracciamenti.'],
  ft_fields: ['Everything about someone', 'Tutto di una persona'], ft_fields_t: ['As many emails, phones, addresses and websites as needed, each with its label; company, role, birthday, notes and a photo.', 'Tutte le email, i telefoni, gli indirizzi e i siti che servono, ognuno con la sua etichetta; azienda, ruolo, compleanno, note e una foto.'],
  ft_groups: ['Groups and favourites', 'Gruppi e preferiti'], ft_groups_t: ['Family, work, the club: a contact in as many groups as you like, the favourites always on top.', 'Famiglia, lavoro, la squadra: un contatto in quanti gruppi vuoi, i preferiti sempre in cima.'],
  ft_dups: ['No more copies', 'Basta doppioni'], ft_dups_t: ['The same person written twice is found by name, email or number, and merged with one press.', 'La stessa persona scritta due volte viene trovata per nome, email o numero, e unita con un tocco.'],
  ft_files: ['vCard and CSV', 'vCard e CSV'], ft_files_t: ['From your phone, Google or Outlook and back: vCard 3.0 and 4.0, CSV, and .savcon from SavDrive.', 'Dal telefono, da Google o da Outlook e ritorno: vCard 3.0 e 4.0, CSV, e .savcon da SavDrive.'],
  ft_suite: ['Inside SavOffice', 'Dentro SavOffice'], ft_suite_t: ['One account with SavMail, SavCalendar, SavTasks and the others: recipients suggested, birthdays in the calendar.', 'Un solo account con SavMail, SavCalendar, SavTasks e le altre: destinatari suggeriti, compleanni nel calendario.'],
  ft_free: ['Yours', 'Tuo'], ft_free_t: ['No ads, nobody reads your address book, everything downloadable at any time.', 'Niente pubblicità, nessuno legge la tua rubrica, tutto scaricabile quando vuoi.'],
  how_title: ['How it works', 'Come funziona'],
  how_1: ['Bring them in', 'Portali dentro'], how_1_t: ['Export the contacts of your phone, Google or Outlook as .vcf or .csv and open the file.', 'Esporta i contatti del telefono, di Google o di Outlook come .vcf o .csv e apri il file.'],
  how_2: ['Tidy them up', 'Mettili in ordine'], how_2_t: ['Merge the copies, make groups, star the people you call the most.', 'Unisci i doppioni, crea i gruppi, metti la stella a chi senti più spesso.'],
  how_3: ['Use them everywhere', 'Usali ovunque'], how_3_t: ['SavMail suggests them as you write, SavCalendar shows their birthdays.', 'SavMail te li suggerisce mentre scrivi, SavCalendar mostra i loro compleanni.'],
  p_contacts: ['Contacts', 'Contatti'], p_birthdays: ['Birthdays', 'Compleanni'], p_dups: ['Duplicates', 'Duplicati'], p_merge: ['Merge the two', 'Unisci i due'],

  // settings
  back_contacts: ['Back to the contacts', 'Torna ai contatti'], settings_saved: ['Settings saved', 'Impostazioni salvate'], settings_t: ['They apply to this account on every device.', 'Valgono per questo account su ogni dispositivo.'], name_t: ['As the others see it in SavOffice.', 'Come lo vedono gli altri in SavOffice.'],
  g_contacts: ['Contacts', 'Contatti'], g_contacts_t: ['How the address book shows them.', 'Come la rubrica li mostra.'],
  sort_by: ['Sort by', 'Ordina per'], sort_by_t: ['The order of the list and the letters on its side.', 'L’ordine dell’elenco e le lettere a lato.'], by_first: ['First name', 'Nome'], by_last: ['Last name', 'Cognome'],
  show_as: ['Names shown as', 'Nomi mostrati come'], show_as_t: ['“Mario Rossi” or “Rossi Mario”.', '«Mario Rossi» oppure «Rossi Mario».'], first_last: ['First Last', 'Nome Cognome'], last_first: ['Last First', 'Cognome Nome'],
  your_data_t: ['Download everything SavContacts keeps, or delete the account.', 'Scarica tutto quello che SavContacts conserva, oppure elimina l’account.'],
  export_data: ['Download my data', 'Scarica i miei dati'], export_data_t: ['Every contact and group, with the photos, in one JSON file.', 'Ogni contatto e gruppo, con le foto, in un file JSON.'],
  sync_phone: ['Your phone', 'Il telefono'], sync_phone_t: ['Automatic syncing (CardDAV) is not there yet: export a .vcf and open it on the phone, or import the one of the phone here.', 'La sincronizzazione automatica (CardDAV) non c’è ancora: esporta un .vcf e aprilo sul telefono, o importa qui quello del telefono.'],
  delete_account_short: ['It goes in all the apps that share it.', 'Sparisce in tutte le app che lo condividono.'], delete_forever: ['Delete forever', 'Elimina per sempre'],

  // the address book
  search_contacts: ['Search the contacts', 'Cerca nei contatti'], new: ['New', 'Nuovo'], new_contact: ['New contact', 'Nuovo contatto'], new_group: ['New group', 'Nuovo gruppo'],
  import_file: ['Import a file', 'Importa un file'], import_t: ['vCard (.vcf), CSV of Google or Outlook, .savcon', 'vCard (.vcf), CSV di Google o Outlook, .savcon'], export: ['Export', 'Esporta'],
  all_contacts: ['Contacts', 'Contatti'], favorites: ['Favourites', 'Preferiti'], birthdays: ['Birthdays', 'Compleanni'], duplicates: ['Duplicates', 'Duplicati'], trash: ['Trash', 'Cestino'], groups: ['Groups', 'Gruppi'],
  n_contacts: ['{n} contacts', '{n} contatti'], one_contact: ['1 contact', '1 contatto'], n_selected: ['{n} selected', '{n} selezionati'], results_for: ['Results for “{q}”', 'Risultati per «{q}»'],
  no_contacts: ['No contacts yet', 'Ancora nessun contatto'], no_contacts_t: ['Add the first one, or import the .vcf of your phone or the CSV of Google or Outlook.', 'Aggiungi il primo, o importa il .vcf del telefono o il CSV di Google o Outlook.'],
  no_favorites: ['No favourites', 'Nessun preferito'], no_favorites_t: ['Press the star of a contact to keep it here.', 'Premi la stella di un contatto per tenerlo qui.'],
  no_birthdays: ['No birthdays', 'Nessun compleanno'], no_birthdays_t: ['Write the birthday of a contact and it shows here, and in SavCalendar.', 'Scrivi il compleanno di un contatto e compare qui, e in SavCalendar.'],
  no_dups: ['No duplicates', 'Nessun doppione'], no_dups_t: ['No two contacts share a name, an email or a number.', 'Nessuna coppia di contatti ha lo stesso nome, email o numero.'],
  trash_empty: ['The trash is empty', 'Il cestino è vuoto'], trash_t: ['Deleted contacts stay here for 30 days.', 'I contatti eliminati restano qui per 30 giorni.'], empty_group: ['Nobody in this group', 'Nessuno in questo gruppo'], empty_group_t: ['Add contacts from their card, or select several and use “Add to a group”.', 'Aggiungi contatti dalla loro scheda, o selezionane più di uno e usa «Aggiungi a un gruppo».'],
  pick_contact: ['Choose a contact', 'Scegli un contatto'], pick_contact_t: ['Its card opens here.', 'La sua scheda si apre qui.'],
  sort_first: ['By first name', 'Per nome'], sort_last: ['By last name', 'Per cognome'], select: ['Select', 'Seleziona'], select_all: ['Select all', 'Seleziona tutti'], clear_sel: ['Clear the selection', 'Annulla la selezione'],
  star: ['Add to favourites', 'Aggiungi ai preferiti'], unstar: ['Remove from favourites', 'Togli dai preferiti'], add_to_group: ['Add to a group', 'Aggiungi a un gruppo'], remove_from_group: ['Remove from this group', 'Togli da questo gruppo'],
  send_email: ['Email', 'Email'], call: ['Call', 'Chiama'], write_savmail: ['Write with SavMail', 'Scrivi con SavMail'], open_map: ['Open the map', 'Apri la mappa'], copy_v: ['Copy', 'Copia'],
  delete_contact: ['Delete', 'Elimina'], deleted_n: ['{n} moved to the trash', '{n} spostati nel cestino'], deleted_one: ['Moved to the trash', 'Spostato nel cestino'], restore: ['Restore', 'Ripristina'], restored: ['Restored', 'Ripristinato'],
  delete_forever_q: ['Delete for good?', 'Eliminare per sempre?'], delete_forever_t: ['They cannot come back.', 'Non potranno tornare.'], empty_trash: ['Empty the trash', 'Svuota il cestino'], empty_trash_t: ['Every contact in the trash goes for good.', 'Ogni contatto nel cestino sparisce per sempre.'],
  emails: ['Email', 'Email'], phones: ['Phone', 'Telefono'], addresses: ['Address', 'Indirizzo'], urls: ['Website', 'Sito web'], birthday: ['Birthday', 'Compleanno'], notes: ['Notes', 'Note'], company: ['Company', 'Azienda'], department: ['Department', 'Reparto'], job: ['Role', 'Ruolo'],
  first: ['First name', 'Nome'], last: ['Last name', 'Cognome'], middle: ['Middle name', 'Secondo nome'], prefix: ['Title', 'Titolo'], suffix: ['Suffix', 'Suffisso'], nickname: ['Nickname', 'Soprannome'],
  street: ['Street', 'Via'], city: ['City', 'Città'], region: ['Region', 'Provincia'], code: ['Postcode', 'CAP'], country: ['Country', 'Paese'],
  l_home: ['home', 'casa'], l_work: ['work', 'lavoro'], l_mobile: ['mobile', 'cellulare'], l_main: ['main', 'principale'], l_fax: ['fax', 'fax'], l_pager: ['pager', 'cercapersone'], l_school: ['school', 'scuola'], l_other: ['other', 'altro'], l_custom: ['Other label…', 'Altra etichetta…'], label: ['Label', 'Etichetta'],
  add_email: ['Add an email', 'Aggiungi email'], add_phone: ['Add a phone', 'Aggiungi telefono'], add_address: ['Add an address', 'Aggiungi indirizzo'], add_url: ['Add a website', 'Aggiungi sito'],
  more_name: ['More name fields', 'Altri campi del nome'], photo: ['Photo', 'Foto'], change_photo: ['Change the photo', 'Cambia la foto'], remove_photo: ['Remove the photo', 'Togli la foto'],
  day_l: ['Day', 'Giorno'], month_l: ['Month', 'Mese'], year_opt: ['Year (optional)', 'Anno (facoltativo)'], favorite: ['Favourite', 'Preferito'],
  edit_contact: ['Edit the contact', 'Modifica il contatto'], saved: ['Saved', 'Salvato'], created: ['added {w}', 'aggiunto {w}'], changed: ['changed {w}', 'modificato {w}'],
  turns: ['turns {n}', 'compie {n} anni'], in_days: ['in {n} days', 'tra {n} giorni'], tomorrow: ['tomorrow', 'domani'], today_b: ['today', 'oggi'], age_n: ['{n} years old', '{n} anni'],
  extra_fields: ['Other fields of the vCard', 'Altri campi della vCard'], extra_fields_t: ['Kept as they came, and written back in the files.', 'Tenuti così come sono arrivati, e riscritti nei file.'],
  group_name: ['Name of the group', 'Nome del gruppo'], rename: ['Rename', 'Rinomina'], delete_group: ['Delete the group', 'Elimina il gruppo'], delete_group_t: ['The group goes away; its contacts stay.', 'Il gruppo sparisce; i suoi contatti restano.'], group_color: ['Colour', 'Colore'],
  merge: ['Merge', 'Unisci'], merge_t: ['They become one contact: the one chosen, with what it lacks taken from the others.', 'Diventano un solo contatto: quello scelto, con quello che gli manca preso dagli altri.'], merged: ['Merged', 'Uniti'], keep_this: ['Keep this one', 'Tieni questo'], merge_all: ['Merge all ({n})', 'Unisci tutti ({n})'], merge_all_q: ['Merge every set?', 'Unire ogni gruppo di doppioni?'], merge_all_t: ['In each set the most complete contact is kept.', 'In ogni gruppo si tiene il contatto più completo.'],
  export_t: ['Which contacts and in which format.', 'Quali contatti e in che formato.'], exp_all: ['All the contacts ({n})', 'Tutti i contatti ({n})'], exp_sel: ['The selected ones ({n})', 'Quelli selezionati ({n})'], exp_group: ['The group “{g}” ({n})', 'Il gruppo «{g}» ({n})'], exp_one: ['This contact', 'Questo contatto'],
  fmt_vcf3: ['vCard 3.0 (.vcf) — phones, Google, Outlook', 'vCard 3.0 (.vcf) — telefoni, Google, Outlook'], fmt_vcf4: ['vCard 4.0 (.vcf) — the newest', 'vCard 4.0 (.vcf) — la più recente'], fmt_csv: ['CSV for Google Contacts', 'CSV per Google Contatti'], fmt_outlook: ['CSV for Outlook', 'CSV per Outlook'], fmt_savcon: ['.savcon (SavContacts, with groups and photos)', '.savcon (SavContacts, con gruppi e foto)'],
  download: ['Download', 'Scarica'], imported: ['{a} added, {u} updated', '{a} aggiunti, {u} aggiornati'], imported_skip: ['{s} left out (no name)', '{s} lasciati fuori (senza nome)'], drop_here: ['Drop the file to import it', 'Lascia il file per importarlo'],
  keys_t: ['In the list of contacts', 'Nell’elenco dei contatti'], k_new: ['New contact', 'Nuovo contatto'], k_search: ['Search', 'Cerca'], k_move: ['Previous / next contact', 'Contatto precedente / successivo'], k_edit: ['Edit the contact', 'Modifica il contatto'], k_star: ['Favourite', 'Preferito'], k_del: ['Delete', 'Elimina'],
  err_too_many_contacts: ['You reached the most contacts (20,000).', 'Hai raggiunto il massimo di contatti (20.000).'], err_too_many_groups: ['200 groups at most.', 'Al massimo 200 gruppi.'], err_group_taken: ['There is already a group with this name.', 'C’è già un gruppo con questo nome.'],
  err_merge_two: ['Choose at least two contacts.', 'Scegli almeno due contatti.'], err_photo_type: ['That is not a photo (JPEG, PNG, WebP or GIF).', 'Non è una foto (JPEG, PNG, WebP o GIF).'],
  err_file_big: ['The file is too big (over 8 MB).', 'Il file è troppo grande (oltre 8 MB).'], err_file_invalid: ['No contacts in this file (a .vcf, a CSV of Google or Outlook, or a .savcon).', 'Nessun contatto in questo file (un .vcf, un CSV di Google o Outlook, o un .savcon).'],
  err_server: ['Something went wrong. Try again.', 'Qualcosa è andato storto. Riprova.'], err_network: ['No connection.', 'Nessuna connessione.'], err_not_installed: ['SavContacts is not installed on this server yet.', 'SavContacts non è ancora installato su questo server.'],
  err_quota: ['Your space of SavOffice is full (one for every app, the space of SavDrive): free some to save more.', 'Il tuo spazio di SavOffice è pieno (uno per tutte le app, quello di SavDrive): liberane un po’ per salvare altro.'],
  err_unauthenticated: ['Sign in again.', 'Accedi di nuovo.'], err_disabled: ['This account is blocked.', 'Questo account è bloccato.'], err_email_unverified: ['Confirm your email first.', 'Prima conferma la tua email.'], err_csrf: ['The session expired: reload the page.', 'La sessione è scaduta: ricarica la pagina.'],
  err_rate_limited: ['Too many attempts: wait a little.', 'Troppi tentativi: aspetta un po’.'], err_bad_credentials: ['Wrong email or password.', 'Email o password errate.'], err_name_required: ['Write a name.', 'Scrivi un nome.'], err_email_invalid: ['That email does not look right.', 'Questa email non sembra corretta.'],
  err_password_short: ['The password needs at least 8 characters.', 'La password deve avere almeno 8 caratteri.'], err_password_long: ['The password is too long.', 'La password è troppo lunga.'], err_terms_required: ['Accept the terms to go on.', 'Accetta i termini per continuare.'],
  err_token_invalid: ['The link expired or was already used.', 'Il link è scaduto o è già stato usato.'], err_bad_password: ['Wrong password.', 'Password errata.'], err_not_found: ['Not found.', 'Non trovato.'], err_forbidden: ['You cannot do this.', 'Non puoi farlo.'],
  err_bad_request: ['Something in the request is not right.', 'Qualcosa nella richiesta non va.'],
};

let lang = (() => { try { return localStorage.getItem('savcontacts-lang'); } catch { return null; } })() || (navigator.language.startsWith('it') ? 'it' : 'en');
export const getLang = () => lang;
export function setLang(l) {
  lang = l === 'it' ? 'it' : 'en';
  try { localStorage.setItem('savcontacts-lang', lang); } catch { /* private mode */ }
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
