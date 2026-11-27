<?php
/**
 * SavOffice — what the first page of an app shows below its own opening, for whoever is not signed in: its screenshots,
 * the apps it works with, its files, privacy, frequent questions and the other apps of the suite. JSON, in Italian or
 * English: ?app=<slug>&lang=it|en. ../assets/savoffice/savoffice.js draws it the same way in every app, so each first page
 * is about its app and they all look like parts of SavOffice. Everything comes from data.php and ../data/projects.php.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: public, max-age=600');

$lang = ($_GET['lang'] ?? '') === 'it' ? 'it' : 'en';
$it = $lang === 'it';
$L = fn(string $i, string $e): string => $it ? $i : $e;
$projects = require dirname(__DIR__) . '/data/projects.php';
$site = require dirname(__DIR__) . '/data/site.php';
require __DIR__ . '/data.php';

$slug = (string)($_GET['app'] ?? '');
if (!isset($apps[$slug], $projects[$slug])) {
    http_response_code(404);
    echo '{}';
    return;
}
$P = $projects[$slug];
[$color, $desk, $phone, $eit, $een] = $apps[$slug];
$name = $P['name'];

/** The screenshots that are there, newest version in the address. */
$shots = [];
foreach (['d' => 'desk', 't' => 'tablet', '' => 'shots'] as $prefix => $count) {
    for ($j = 1; $j <= (int)($P[$count] ?? 0); $j++) {
        $f = dirname(__DIR__) . "/assets/projects/$slug/$prefix$j.jpg";
        if (is_file($f)) $shots[$prefix === 'd' ? 'desk' : ($prefix === 't' ? 'tablet' : 'phone')][] = "/assets/projects/$slug/$prefix$j.jpg?v=" . filemtime($f);
    }
}

$works = array_map(fn($w) => ['app' => $w[0], 'name' => $projects[$w[0]]['name'] ?? $w[0], 'text' => $L($w[1], $w[2])], array_values(array_filter($works[$slug] ?? [], fn($w) => isset($projects[$w[0]]))));
$fileList = $files[$slug] ?? [];
$own = array_values(array_filter($fileList, fn($f) => str_starts_with($f, '.sav')));
$others = array_values(array_filter($fileList, fn($f) => !str_starts_with($f, '.sav')));
$langNames = ['it' => $L('italiano', 'Italian'), 'en' => $L('inglese', 'English'), 'fr' => $L('francese', 'French'), 'de' => $L('tedesco', 'German'), 'es' => $L('spagnolo', 'Spanish')];
$langs = implode(', ', array_map(fn($l) => $langNames[$l] ?? $l, $P['langs'] ?? ['it', 'en']));
$src = $P['source'] === '' ? $site['repo'] : (preg_match('#^https?://#', $P['source']) ? $P['source'] : $site['source'] . $P['source']);

// the frequent questions: the same in every app, the answers are about this one
$faq = [];
$faq[] = [$L("$name è davvero gratis?", "Is $name really free?"), $L('Sì, per tutti: niente pubblicità, abbonamenti o funzioni a pagamento. I server li coprono le donazioni di chi può.', 'Yes, for everyone: no ads, no subscriptions, no paid features. The servers are covered by the donations of those who can.')];
$faq[] = [$L('Serve un account?', 'Do I need an account?'), match ($P['account']) {
    'none' => $L('No: si usa subito, senza registrarsi.', 'No: you use it right away, without signing up.'),
    'optional' => $L('No per cominciare; un account gratuito serve per ritrovare tutto su ogni dispositivo. Con SavAccount usi un solo accesso per le app di SavOffice.', 'Not to start; a free account lets you find everything on every device. With SavAccount you use one sign-in for the SavOffice apps.'),
    default => $L('Sì, un account gratuito: con email e password, oppure con SavAccount, un solo accesso per tutte le app di SavOffice.', 'Yes, a free account: with email and password, or with SavAccount, one sign-in for every SavOffice app.'),
}];
$faq[] = [$L('Dove finiscono i miei dati?', 'Where does my data go?'), $L('Su server nell’Unione europea (Aruba, in Italia). Nessuna pubblicità, nessuna profilazione, nessuna statistica di terzi; puoi eliminare l’account quando vuoi, e i tuoi dati con lui.', 'To servers in the European Union (Aruba, in Italy). No ads, no profiling, no third-party analytics; you can delete the account whenever you like, and your data with it.')];
if ($fileList) $faq[] = [$L('Posso usare i miei file di sempre?', 'Can I use my usual files?'), ($others ? $L("Sì: $name lavora con " . implode(', ', $others) . '.', "Yes: $name works with " . implode(', ', $others) . '.') : '') . ($own ? ' ' . $L('Il suo file, ' . implode(', ', $own) . ', conserva tutto ed è aperto: non resti mai bloccato.', 'Its own file, ' . implode(', ', $own) . ', keeps everything and is open: you are never locked in.') : '')];
$faq[] = [$L('Funziona senza connessione?', 'Does it work offline?'), $P['offline'] ? $L('Sì: puoi lavorare anche offline, e le modifiche partono appena torna la rete.', 'Yes: you can work offline too, and changes go out as soon as the network is back.') : $L('Serve la connessione: i dati stanno sul server, così li ritrovi uguali su ogni dispositivo.', 'It needs a connection: the data lives on the server, so you find it the same on every device.')];
$faq[] = [$L('Devo installare qualcosa?', 'Do I have to install anything?'), $L('No: si apre nel browser di computer, tablet e telefono, e si può aggiungere alla schermata iniziale come un’app.', 'No: it opens in the browser of a computer, tablet or phone, and you can add it to the home screen like an app.') . ($P['play'] ? ' ' . $L('C’è anche su Google Play.', 'It is on Google Play too.') : '') . ' ' . $L("Lingue: $langs.", "Languages: $langs.")];
$faq[] = [$L('Chi la fa, e come?', 'Who makes it, and how?'), $L("$name è open source e fa parte di SavOffice, di Saverio Morelli: il codice è pubblico, ed è realizzata con il supporto dell’intelligenza artificiale.", "$name is open source and part of SavOffice, by Saverio Morelli: the code is public, and it is made with the support of artificial intelligence.")];

echo json_encode([
    'app' => $slug, 'name' => $name, 'color' => $color, 'tagline' => $P[$lang][0], 'edge' => $L($eit, $een),
    'shots' => $shots, 'works' => $works, 'own' => $own, 'files' => $others, 'faq' => $faq,
    'source' => $src, 'page' => "/savoffice/$slug/?lang=$lang", 'suite' => "/savoffice/?lang=$lang", 'donate' => 'https://www.saveriomorelli.com/donate/',
    'apps' => array_map(fn($s) => ['app' => $s, 'name' => $projects[$s]['name'], 'what' => $projects[$s][$lang][0]], array_values(array_filter(array_keys($apps), fn($s) => $s !== $slug && isset($projects[$s])))),
    'count' => count($apps),
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
