<?php
/**
 * SavOffice for Mac — writes src/catalog.json from the data of the site, so the Toolbox lists the same apps, with the same
 * names, colours and words as /savoffice/ (../savoffice/data.php, ../data/projects.php). Run by tools/prepare.js.
 * offline: what an app can do without a connection (see ../assets/savoffice/offline-sw.js and each app's README):
 *   edit = everything, with its own copies · queue = changes wait for the network · read = what was already loaded · online = never
 */
declare(strict_types=1);
$root = dirname(__DIR__, 2);
$lang = 'it';
$projects = require $root . '/data/projects.php';
$_SERVER['SCRIPT_FILENAME'] = __FILE__;
require $root . '/savoffice/data.php';
$offline = ['savdocuments' => 'edit', 'savspreadsheets' => 'edit', 'savpresentations' => 'edit', 'savbooks' => 'edit',
    'savcalendar' => 'queue', 'savtasks' => 'queue', 'savnotes' => 'queue', 'savwhiteboard' => 'queue', 'savdiagrams' => 'queue', 'savsplits' => 'queue',
    'savmail' => 'online'];
$out = [];
foreach ($apps as $slug => $a) {
    $p = $projects[$slug] ?? null;
    if (!$p) continue;
    $out[] = ['slug' => $slug, 'name' => $p['name'], 'color' => $a[0], 'offline' => $offline[$slug] ?? 'read', 'invite' => !empty($p['invite']),
        'it' => ['short' => $short[$slug][0] ?? '', 'tag' => $p['it'][0], 'more' => $a[3]],
        'en' => ['short' => $short[$slug][1] ?? '', 'tag' => $p['en'][0], 'more' => $a[4]]];
}
file_put_contents(dirname(__DIR__) . '/src/catalog.json', json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
echo count($out) . " apps\n";
