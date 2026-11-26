<?php
/**
 * What the status page and /api/status/ check, by project.
 *   app      database of an app with its credentials.php: [table prefix, what it keeps it, en]; its emails are checked too
 *   game     database of the online games: [a table, it, en]
 *   web      more addresses of the project, besides its own page
 * Projects that are not here only have their page checked.
 */
return [
    'savnewsletters' => ['app' => ['on_', 'Account, gruppi e iscritti', 'Accounts, groups and subscribers'], 'web' => ['widget' => ['widget.js', 'Widget di iscrizione', 'Subscription widget']]],
    'savdocuments' => ['app' => ['sd_', 'Account e documenti', 'Accounts and documents']],
    'savpresentations' => ['app' => ['sp_', 'Account e presentazioni', 'Accounts and presentations']],
    'savschedules' => ['app' => ['sch_', 'Account e pianificazioni', 'Accounts and schedules']],
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
