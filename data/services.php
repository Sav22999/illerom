<?php
/**
 * What the status page and /api/status/ check, by project.
 *   app      database of an app with its credentials.php: [table prefix, what it keeps it, en]; its emails are checked too.
 *            An app that uses the database of another one adds [credentials of that folder, key of its version in meta,
 *            name of the constant of that version in its lib/bootstrap.php]
 *   game     database of the online games: [a table, it, en]
 *   web      more addresses of the project, besides its own page
 * Projects that are not here only have their page checked.
 */
return [
    'savnewsletters' => ['app' => ['on_', 'Account, gruppi e iscritti', 'Accounts, groups and subscribers'], 'web' => ['widget' => ['widget.js', 'Widget di iscrizione', 'Subscription widget']]],
    'savdrive' => ['app' => ['dr_', 'Account e file', 'Accounts and files']],
    'savdocuments' => ['app' => ['sd_', 'Account e documenti', 'Accounts and documents']],
    'savspreadsheets' => ['app' => ['ss_', 'Account e fogli di calcolo', 'Accounts and spreadsheets']],
    'savbooks' => ['app' => ['sb_', 'Account e libri', 'Accounts and books']],
    'savpresentations' => ['app' => ['sp_', 'Account e presentazioni', 'Accounts and presentations']],
    'savschedules' => ['app' => ['sch_', 'Account e pianificazioni', 'Accounts and schedules']],
    // the apps of SavOffice that keep their tables (and accounts) in the database of SavSchedules
    'savcalendar' => ['app' => ['sch_', 'Calendari ed eventi', 'Calendars and events', ['savschedules', 'cal_schema_version', 'CAL_SCHEMA_VERSION']]],
    'savtasks' => ['app' => ['sch_', 'Liste e attività', 'Lists and tasks', ['savschedules', 'task_schema_version', 'TASK_SCHEMA_VERSION']]],
    'savforms' => ['app' => ['sch_', 'Moduli e risposte', 'Forms and answers', ['savschedules', 'form_schema_version', 'FORM_SCHEMA_VERSION']]],
    'savwhiteboard' => ['app' => ['sch_', 'Lavagne e immagini', 'Boards and pictures', ['savschedules', 'wb_schema_version', 'WB_SCHEMA_VERSION']]],
    'savnotes' => ['app' => ['sch_', 'Quaderni', 'Notebooks', ['savschedules', 'nb_schema_version', 'NB_SCHEMA_VERSION']]],
    'savmail' => ['app' => ['sch_', 'Indirizzi e posta', 'Addresses and mail', ['savschedules', 'ml_schema_version', 'ML_SCHEMA_VERSION']]],
    'savpodcasts' => ['app' => ['sch_', 'Podcast seguiti', 'Podcasts followed', ['savschedules', 'pod_schema_version', 'POD_SCHEMA_VERSION']]],
    'savsplits' => ['app' => ['sch_', 'Gruppi e spese', 'Groups and expenses', ['savschedules', 'split_schema_version', 'SPLIT_SCHEMA_VERSION']]],
    'savcontacts' => ['app' => ['sch_', 'Contatti e gruppi', 'Contacts and groups', ['savschedules', 'con_schema_version', 'CON_SCHEMA_VERSION']]],
    // SavPhotos keeps its tables in the database of SavDrive (savdrive/lib/photos.php)
    'savphotos' => ['app' => ['dr_', 'Foto e album', 'Photos and albums', ['savdrive', 'photos_schema', 'PHOTOS_SCHEMA']]],
    'thinkhop' => ['app' => ['th_', 'Account e classifiche', 'Accounts and rankings']],
    'foodtrack' => ['app' => ['ft_', 'Account e dispensa', 'Accounts and pantry']],
    'mycurriculum' => ['app' => ['mc_', 'Account e CV', 'Accounts and CVs']],
    'forkville' => ['app' => ['fv_', 'Account e ristoranti', 'Accounts and restaurants']],
    'fucina' => ['app' => ['fc_', 'Account e progressi', 'Accounts and progress']],
    'giftwise' => ['app' => ['gw_', 'Account e liste', 'Accounts and lists']],
    'chess' => ['game' => ['chess_rooms', 'Partite online', 'Online matches']],
    'connect-four' => ['game' => ['c4_rooms', 'Partite online', 'Online matches']],
    'faceguess' => ['game' => ['fg_rooms', 'Partite online', 'Online matches']],
    'sea-battle' => ['game' => ['sb_rooms', 'Partite online', 'Online matches']],
    'prism-mine' => ['game' => ['pm_rooms', 'Duelli online', 'Online duels']],
];
