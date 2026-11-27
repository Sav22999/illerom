<?php
/**
 * SavOffice — the page of the suite: what it is, what each app can do, how they work together, privacy and open source.
 * Every app keeps its own folder (../savdocuments/ …) and is independent; they share the look, the SavOffice button
 * (../assets/savoffice/savoffice.js) and, for SavSchedules, SavCalendar, SavTasks, SavForms, SavWhiteboard and SavNotes,
 * the same account. The descriptions and the lists of features come from ../data/projects.php (the same words as the
 * pages of the projects on Illerom); the pictures are their screenshots (../assets/projects/<slug>/).
 * /savoffice/<slug>/ (savoffice/.htaccess, or ?app=<slug>) is the page of one app: everything about it, its screenshots on a
 * phone, a tablet and a computer, and the apps it works with. The pages of these apps on Illerom lead here.
 * Italian or English from ?lang= or the browser. No database, no cookies; the only script is SavComponents (sav-image
 * enlarges the screenshots). Addresses are absolute, so the same
 * file works at /savoffice/ and at /savoffice/<slug>/.
 */

declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");

$q = (string)($_GET['lang'] ?? '');
$it = $q === 'it' || ($q !== 'en' && stripos((string)($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? ''), 'it') === 0);
$lang = $it ? 'it' : 'en';
$h = fn(string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
$L = fn(string $i, string $e): string => $h($it ? $i : $e);
$projects = require dirname(__DIR__) . '/data/projects.php';
$contact = (require dirname(__DIR__) . '/data/site.php')['contact'];
/** Whether a screenshot is there: until it is, the place shows the icon of the app on its colour. */
$has = fn(string $slug, string $file): bool => is_file(dirname(__DIR__) . "/assets/projects/$slug/$file");
/** An app only for the accounts the administrators turn on: says so, with where to ask. */
$invite = fn(string $slug): string => empty($projects[$slug]['invite']) ? '' : '<p class="invite"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span>'
    . ($it ? 'Per il momento a uso limitato: per provarla <a href="' . htmlspecialchars($contact, ENT_QUOTES) . '">contatta l’amministratore</a>.' : 'For now limited: to try it, <a href="' . htmlspecialchars($contact, ENT_QUOTES) . '">contact the administrator</a>.') . '</span></p>';
$strings = (require dirname(__DIR__) . '/data/strings.php')[$lang];

/** A screenshot with its date as version, so a new picture is never served from an old cache. */
$shot = function (string $slug, string $file): string {
    $f = dirname(__DIR__) . "/assets/projects/$slug/$file";
    return "/assets/projects/$slug/$file" . (is_file($f) ? '?v=' . filemtime($f) : '');
};

// slug => [colour, screenshot of a computer, of a phone, what sets it apart (it, en)]
$apps = [
    'savdrive' => ['#0a6fb0', 'd1.jpg', '1.jpg', 'Ogni account ha 500 MB, e i documenti, i fogli di calcolo e le presentazioni di SavOffice nascono qui e si aprono nella loro app con un tocco. E per i file grandi, un link temporaneo che scade da solo, anche con password.', 'Every account has 500 MB, and the documents, spreadsheets and presentations of SavOffice are born here and open in their app with one press. And for big files, a temporary link that expires by itself, with a password too.'],
    'savdocuments' => ['#0f6e56', 'd2.jpg', '2.jpg', 'Si scrive anche senza connessione: le modifiche partono appena torna la rete. E apre e salva i file Word.', 'You can write with no connection: changes go out as soon as the network is back. And it opens and saves Word files.'],
    'savspreadsheets' => ['#4d7c0f', 'd2.jpg', '2.jpg', 'Le formule si scrivono come in ogni foglio di calcolo, e i file di Excel e LibreOffice si aprono con le loro formule e il loro aspetto. Chi lavora con te vede su quale cella sei.', 'Formulas are written as in every spreadsheet, and Excel and LibreOffice files open with their formulas and their look. Whoever works with you sees which cell you are on.'],
    'savbooks' => ['#8a2346', 'd1.jpg', '2.jpg', 'Parte da un documento di SavDocuments o da un file .savdoc e lo trasforma in libro; la copertina si disegna da sola, e l’EPUB è pronto per i negozi.', 'Starts from a SavDocuments document or a .savdoc file and turns it into a book; the cover draws itself, and the EPUB is ready for the shops.'],
    'savpresentations' => ['#6d3bef', 'd1.jpg', '2.jpg', 'Più persone sulla stessa slide nello stesso momento, link usa e getta per chi deve solo guardare, e funziona anche offline.', 'Several people on the same slide at once, single-use links for those who only need to look, and it works offline too.'],
    'savschedules' => ['#1f56d1', 'd2.jpg', '2.jpg', 'Chi risponde non deve registrarsi; i posti presi non li può prendere nessun altro, e la data scelta finisce nel tuo calendario.', 'Whoever answers needs no account; a slot once taken cannot be taken by anyone else, and the chosen date lands in your calendar.'],
    'savcalendar' => ['#c93a2f', 'd2.jpg', '1.jpg', 'Un link privato lo mostra in Google, Outlook e Apple; e ci trovi da soli sondaggi, posti prenotati, scadenze e newsletter.', 'A private link shows it in Google, Outlook and Apple; and polls, booked slots, due days and newsletters show up in it by themselves.'],
    'savtasks' => ['#0b7a87', 'd2.jpg', '2.jpg', 'Scrivi «domani 15:00 !alta #lavoro» e capisce da solo scadenza, priorità ed etichetta. Ogni lista diventa una bacheca.', 'Type “tomorrow 3pm !high #work” and it understands the due time, priority and label. Any list becomes a board.'],
    'savforms' => ['#86329e', 'd3.jpg', '2.jpg', 'Quattordici tipi di domande, un grafico per ognuna, e il modulo si chiude da solo alla scadenza, segnata in SavCalendar.', 'Fourteen kinds of questions, a chart for each, and the form closes by itself at its deadline, marked in SavCalendar.'],
    'savwhiteboard' => ['#c45a0c', 'd2.jpg', '2.jpg', 'La penna sente la pressione e, con il pennino, il palmo non disegna: come scrivere su una lavagna vera, ma senza bordi.', 'The pen feels the pressure and, with a stylus, the palm does not draw: like writing on a real board, but without edges.'],
    'savnotes' => ['#7b5434', 'd1.jpg', '2.jpg', 'Fogli veri, di formato fisso: sullo stesso foglio scrivi a mano e digiti, e il testo continua sul foglio successivo.', 'Real sheets of a fixed size: on the same sheet you write by hand and type, and the text carries on to the next sheet.'],
    'savmail' => ['#2563eb', 'd1.jpg', '1.jpg', 'Gmail, Outlook, Aruba o qualsiasi casella IMAP nella stessa posta in arrivo, e le password delle caselle restano cifrate sui tuoi dispositivi.', 'Gmail, Outlook, Aruba or any IMAP mailbox in the same inbox, and the passwords of the mailboxes stay encrypted on your devices.'],
    'savphotos' => ['#b7791f', 'd1.jpg', '1.jpg', 'Il backup salta le foto che hai già e tiene la data di scatto; una cartella intera diventa un album con il suo nome.', 'The backup skips the photos you already have and keeps the date they were taken; a whole folder becomes an album with its name.'],
    'savpodcasts' => ['#3b4b63', 'd1.jpg', '1.jpg', 'I podcast arrivano dai loro feed e dai cataloghi aperti, mai dalle grandi piattaforme; il punto di ascolto ti segue su ogni dispositivo.', 'Podcasts come from their own feeds and open catalogues, never from the big platforms; where you stopped follows you on every device.'],
    'savsplits' => ['#1a7f37', 'd1.jpg', '1.jpg', 'Chi ha il link entra senza account; i saldi si pareggiano con il minor numero di pagamenti, anche per i millesimi di un condominio.', 'Whoever has the link joins without an account; balances are settled with the fewest payments, even by the thousandths of a condominium.'],
    'savnewsletters' => ['#c2307a', 'd3.jpg', '3.jpg', 'Ogni gruppo ha i suoi ruoli: qualcuno scrive, qualcun altro approva, e niente parte per sbaglio a centinaia di persone.', 'Each group has its roles: someone writes, someone else approves, and nothing goes out by mistake to hundreds of people.'],
];
ksort($apps); // alphabetical: the same order as the SavOffice button in the apps
$n = count($apps);
$words = ['it' => [9 => 'nove', 'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici'], 'en' => [9 => 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen']];
$nw = fn(string $l): string => $words[$l][$n] ?? (string)$n; // the number of the apps in words
// what each app is, for the small screens where the whole names do not fit (the same words as the SavOffice button)
$short = ['savdrive' => ['File e cartelle', 'Files and folders'], 'savdocuments' => ['Documenti', 'Documents'], 'savspreadsheets' => ['Fogli di calcolo', 'Spreadsheets'], 'savbooks' => ['Libri', 'Books'], 'savpresentations' => ['Presentazioni', 'Presentations'], 'savschedules' => ['Sondaggi e posti', 'Polls and slots'],
    'savcalendar' => ['Calendario', 'Calendar'], 'savtasks' => ['Attività', 'Tasks'], 'savforms' => ['Moduli', 'Forms'], 'savwhiteboard' => ['Lavagna', 'Whiteboard'],
    'savnotes' => ['Quaderni', 'Notebooks'], 'savnewsletters' => ['Newsletter', 'Newsletters'], 'savmail' => ['Posta', 'Email'], 'savphotos' => ['Foto e video', 'Photos and videos'],
    'savpodcasts' => ['Podcast', 'Podcasts'], 'savsplits' => ['Spese condivise', 'Shared expenses']];
// what each app reads and writes
$files = ['savdrive' => ['Ogni file', '.savdoc', '.savspr', '.savpre', '.savwhi', '.savnot'], 'savdocuments' => ['.savdoc', '.docx', 'PDF', 'EPUB', 'Markdown', 'HTML'], 'savspreadsheets' => ['.savspr', '.xlsx', '.xls', '.ods', 'CSV', 'PDF'], 'savbooks' => ['.savboo', '.savdoc', 'EPUB', 'PDF', '.docx', 'FB2'], 'savpresentations' => ['.pptx', '.odp', 'PDF'], 'savschedules' => ['.savsch', '.ics', 'CSV'],
    'savcalendar' => ['.savcal', '.ics', 'CSV'], 'savtasks' => ['.savtas', 'CSV', 'Markdown'], 'savforms' => ['.savfor', 'CSV'], 'savwhiteboard' => ['.savwhi', 'PNG', 'SVG', 'PDF'],
    'savnotes' => ['.savnot', 'PDF', 'PNG'], 'savnewsletters' => ['.savnew'], 'savmail' => ['EML', 'Allegati'], 'savphotos' => ['JPEG', 'PNG', 'HEIC', 'MP4', 'ZIP'],
    'savpodcasts' => ['RSS', 'OPML'], 'savsplits' => ['.savspl', 'CSV']];
// what each app does with the others: [other app, it, en]
$works = [
    'savdrive' => [['savdocuments', 'Nuovi documenti creati nel drive, aperti in SavDocuments con un tocco.', 'New documents created in the drive, opened in SavDocuments with one press.'], ['savspreadsheets', 'Fogli di calcolo nuovi accanto ai file che contano.', 'New spreadsheets next to the files that matter.'], ['savpresentations', 'Le presentazioni nella stessa cartella delle immagini che usano.', 'Presentations in the same folder as the pictures they use.']],
    'savdocuments' => [['savbooks', 'Dal menu ⋮ il documento diventa un e-book, con le sue immagini.', 'From the ⋮ menu the document becomes an e-book, with its pictures.'], ['savpresentations', 'Lo stesso modo di lavorare in più persone, con commenti e versioni.', 'The same way of working together, with comments and versions.'], ['savnotes', 'Gli appunti a mano in SavNotes, il testo da consegnare qui.', 'Handwritten notes in SavNotes, the text to hand in here.']],
    'savspreadsheets' => [['savdocuments', 'I numeri qui, la relazione che li racconta in SavDocuments: lo stesso modo di condividere, commentare e tornare alle versioni.', 'The figures here, the report that tells them in SavDocuments: the same way of sharing, commenting and going back to versions.'], ['savpresentations', 'I grafici dei tuoi dati, poi le slide che li presentano.', 'The charts of your data, then the slides that present them.']],
    'savbooks' => [['savdocuments', 'Scrivi in SavDocuments, poi apri il documento qui: titoli, immagini e note diventano capitoli.', 'Write in SavDocuments, then open the document here: headings, pictures and notes become chapters.'], ['savnotes', 'Gli appunti e la scaletta a mano, prima di scrivere il libro.', 'Handwritten notes and the outline, before writing the book.']],
    'savpresentations' => [['savdocuments', 'Il documento da cui nasce la presentazione, con gli stessi grafici e tabelle.', 'The document the presentation comes from, with the same charts and tables.'], ['savwhiteboard', 'L’idea abbozzata alla lavagna, poi messa in ordine nelle slide.', 'The idea sketched on the board, then put in order on the slides.']],
    'savschedules' => [['savcalendar', 'La data scelta e i posti prenotati entrano nel calendario; dal calendario nasce un sondaggio.', 'The chosen date and booked slots go into the calendar; a poll can start from the calendar.'], ['savtasks', 'I sondaggi ancora da decidere compaiono tra le cose da fare.', 'Polls still to decide show among the things to do.']],
    'savcalendar' => [['savschedules', 'Date scelte e posti prenotati compaiono da soli.', 'Chosen dates and booked slots show up by themselves.'], ['savtasks', 'Le attività con scadenza sono nel giorno giusto.', 'Tasks with a due day sit on the right day.'], ['savforms', 'Le scadenze dei moduli, che si chiudono da soli.', 'The deadlines of forms, which close by themselves.'], ['savnewsletters', 'Le newsletter programmate, nel giorno in cui partiranno.', 'Planned newsletters, on the day they will go out.']],
    'savtasks' => [['savcalendar', 'Le attività con scadenza compaiono nel calendario.', 'Tasks with a due day show in the calendar.'], ['savschedules', 'Un’attività può diventare un sondaggio; i sondaggi da decidere arrivano qui.', 'A task can become a poll; polls to decide arrive here.']],
    'savforms' => [['savcalendar', 'La scadenza del modulo è nel calendario, e a quell’ora il modulo si chiude.', 'The deadline of the form is in the calendar, and at that time the form closes.'], ['savschedules', 'Per scegliere una data meglio un sondaggio di SavSchedules: stesso account.', 'To pick a date, a SavSchedules poll is better: same account.']],
    'savwhiteboard' => [['savnotes', 'Stessi strumenti di scrittura a mano, ma su fogli di quaderno.', 'The same handwriting tools, but on notebook sheets.'], ['savpresentations', 'Dallo schizzo alla slide.', 'From the sketch to the slide.']],
    'savnotes' => [['savwhiteboard', 'Quando un foglio non basta, una lavagna senza bordi.', 'When a sheet is not enough, a board without edges.'], ['savdocuments', 'Il testo che diventa un documento vero.', 'The text that becomes a real document.']],
    'savnewsletters' => [['savcalendar', 'Gli invii programmati compaiono nel calendario.', 'Planned sendings show in the calendar.'], ['savforms', 'Un modulo per raccogliere iscrizioni o opinioni dai lettori.', 'A form to gather sign-ups or opinions from readers.']],
    'savmail' => [['savcalendar', 'Lo stesso account di calendario, attività e sondaggi: un accesso per tutti.', 'The same account as the calendar, tasks and polls: one sign-in for all.'], ['savdrive', 'Gli allegati da conservare trovano posto nel drive.', 'The attachments worth keeping find a place in the drive.']],
    'savphotos' => [['savdrive', 'Le foto sono file del drive, nella cartella SavPhotos: stesso account, stesso spazio.', 'The photos are files of the drive, in the SavPhotos folder: same account, same space.'], ['savpresentations', 'Le foto migliori finiscono nelle slide.', 'The best photos end up in the slides.']],
    'savpodcasts' => [['savnotes', 'Gli appunti di un episodio, scritti a mano su un quaderno.', 'Notes on an episode, handwritten in a notebook.'], ['savtasks', 'Un episodio da ascoltare dopo diventa un’attività.', 'An episode to listen to later becomes a task.']],
    'savsplits' => [['savcalendar', 'Lo stesso account del calendario: il viaggio è lì, le sue spese qui.', 'The same account as the calendar: the trip is there, its expenses here.'], ['savforms', 'Un modulo per raccogliere le quote di un evento.', 'A form to collect the shares of an event.']],
];
$app = (string)($_GET['app'] ?? '');
if (!isset($apps[$app])) $app = '';
$pageUrl = 'https://www.illerom.eu/savoffice/' . ($app ? "$app/" : '');
$name = fn(string $slug): string => '<span class="sav">Sav</span>' . $h(substr($projects[$slug]['name'], 3));
$ico = fn(string $slug, int $size = 48): string => '<img src="/' . $slug . '/icons/favicon.svg" alt="" width="' . $size . '" height="' . $size . '">';
?><!doctype html>
<html lang="<?= $lang ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
<?php if ($app): $pa = $projects[$app][$lang]; ?>
    <title><?= $h($projects[$app]['name']) ?> — SavOffice</title>
    <meta name="description" content="<?= $h($pa[0] . ' ' . $pa[1]) ?>">
<?php else: ?>
    <title>SavOffice — <?= $L('Un ufficio libero, aperto, tuo', 'A free, open office of your own') ?></title>
    <meta name="description" content="<?= $L('SavOffice: ' . $n . ' app gratuite e open source per file, foto, documenti, fogli di calcolo, libri, presentazioni, calendario, sondaggi, attività, moduli, lavagna, quaderni, posta, podcast, spese condivise e newsletter. Lavorano insieme, senza pubblicità, con i dati nell’Unione europea.', 'SavOffice: ' . $n . ' free, open-source apps for files, photos, documents, spreadsheets, books, presentations, calendar, polls, tasks, forms, whiteboard, notebooks, email, podcasts, shared expenses and newsletters. They work together, with no ads and the data in the European Union.') ?>">
<?php endif; ?>
    <meta name="theme-color" content="#f6f5f3" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#121214" media="(prefers-color-scheme: dark)">
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
    <link rel="canonical" href="<?= $pageUrl ?>?lang=<?= $lang ?>">
    <link rel="alternate" hreflang="it" href="<?= $pageUrl ?>?lang=it">
    <link rel="alternate" hreflang="en" href="<?= $pageUrl ?>?lang=en">
    <link rel="alternate" hreflang="x-default" href="<?= $pageUrl ?>">
    <link rel="icon" href="<?= $app ? "/$app/icons/favicon.svg" : '/savoffice/icons/favicon.svg' ?>" type="image/svg+xml">
    <link rel="icon" href="/savoffice/icons/favicon-32.png" sizes="32x32" type="image/png">
    <link rel="apple-touch-icon" href="/savoffice/icons/apple-touch-icon.png">
    <!-- the picture of a shared link: 1200 × 630, one per language (tools/og.sh): the mark, the words of the hero and the icons of the apps -->
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Illerom">
    <meta property="og:title" content="<?= $app ? $h($projects[$app]['name']) . ' · SavOffice' : 'SavOffice' ?>">
    <meta property="og:description" content="<?= $L('Un ufficio libero, aperto, tuo: ' . $n . ' app gratuite e open source che lavorano insieme.', 'A free, open office of your own: ' . $n . ' free, open-source apps that work together.') ?>">
    <meta property="og:url" content="<?= $pageUrl ?>?lang=<?= $lang ?>">
    <meta property="og:image" content="https://www.illerom.eu/savoffice/og-<?= $lang ?>.png?v=<?= @filemtime(__DIR__ . "/og-$lang.png") ?>">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="SavOffice: <?= $L('un ufficio libero, aperto, tuo', 'a free, open office of your own') ?>">
    <meta name="twitter:card" content="summary_large_image">
<?php
// structured data for search engines and AI assistants: the suite and its apps, or one app with its breadcrumb
$site = 'https://www.illerom.eu';
$person = ['@type' => 'Person', '@id' => 'https://www.saveriomorelli.com/#person', 'name' => 'Saverio Morelli', 'url' => 'https://www.saveriomorelli.com/'];
$appLd = function (string $s) use ($projects, $lang, $site, $person, $files): array {
    $P = $projects[$s];
    $x = ['@type' => 'WebApplication', '@id' => "$site/savoffice/$s/#app", 'name' => $P['name'], 'url' => $site . $P['url'], 'headline' => $P[$lang][0],
        'description' => $P[$lang][1], 'featureList' => $P[$lang][2], 'applicationCategory' => 'BusinessApplication', 'applicationSuite' => 'SavOffice',
        'operatingSystem' => 'Web', 'inLanguage' => $P['langs'], 'isAccessibleForFree' => true, 'image' => is_file(dirname(__DIR__) . "/assets/projects/$s.png") ? "$site/assets/projects/$s.png" : "$site/$s/icons/favicon.svg",
        'offers' => ['@type' => 'Offer', 'price' => '0', 'priceCurrency' => 'EUR'], 'author' => $person, 'sameAs' => ['https://github.com/Sav22999/illerom/tree/main/' . $P['source']],
        'mainEntityOfPage' => "$site/savoffice/$s/?lang=$lang"];
    if (!empty($files[$s])) $x['fileFormat'] = $files[$s];
    if (($d = (int)($P['desk'] ?? 0)) > 0) $x['screenshot'] = array_map(fn($j) => "$site/assets/projects/$s/d$j.jpg", range(1, $d));
    return $x;
};
$graph = $app
    ? [$appLd($app), ['@type' => 'BreadcrumbList', 'itemListElement' => [
        ['@type' => 'ListItem', 'position' => 1, 'name' => 'Illerom', 'item' => "$site/$lang/"],
        ['@type' => 'ListItem', 'position' => 2, 'name' => 'SavOffice', 'item' => "$site/savoffice/?lang=$lang"],
        ['@type' => 'ListItem', 'position' => 3, 'name' => $projects[$app]['name'], 'item' => "$site/savoffice/$app/?lang=$lang"]]]]
    : [['@type' => 'CollectionPage', 'url' => "$site/savoffice/?lang=$lang", 'name' => 'SavOffice', 'inLanguage' => $lang, 'isPartOf' => ['@type' => 'WebSite', '@id' => "$site/#website", 'name' => 'Illerom', 'url' => "$site/"],
        'description' => $it ? "SavOffice: $n app gratuite e open source che lavorano insieme, con un solo account e i dati nell’Unione europea." : "SavOffice: $n free, open-source apps that work together, with one account and the data in the European Union.",
        'primaryImageOfPage' => "$site/savoffice/og-$lang.png", 'author' => $person,
        'mainEntity' => ['@type' => 'ItemList', 'name' => 'SavOffice', 'numberOfItems' => $n, 'itemListElement' => array_map(fn($i, $s) => ['@type' => 'ListItem', 'position' => $i + 1, 'item' => $appLd($s)], array_keys(array_keys($apps)), array_keys($apps))]]];
?>
    <script type="application/ld+json"><?= json_encode(['@context' => 'https://schema.org', '@graph' => $graph], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?></script>
    <!-- SavComponents (the same copy as Illerom): sav-image enlarges the screenshots -->
<?php $v = fn(string $f) => '/assets/sav/' . $f . '?v=' . @filemtime(dirname(__DIR__) . '/assets/sav/' . $f); ?>
    <link rel="stylesheet" href="<?= $v('sav.css') ?>">
    <script src="<?= $v('sav.js') ?>" defer></script>
    <style>
        @font-face { font-family: Inter; src: url('/assets/fonts/inter-latin-wght-normal.woff2') format('woff2'); font-weight: 100 900; font-display: swap; unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2190-2199, U+2212, U+2215; }
        @font-face { font-family: Inter; src: url('/assets/fonts/inter-latin-ext-wght-normal.woff2') format('woff2'); font-weight: 100 900; font-display: swap; unicode-range: U+0100-024F, U+1E00-1EFF, U+20A0-20AB, U+20AD-20CF, U+2C60-2C7F, U+A720-A7FF; }
        :root { color-scheme: light dark; --bg: light-dark(#f6f5f3, #121214); --bg2: light-dark(#efedea, #18181b); --card: light-dark(#fff, #1c1c20); --text: light-dark(#1d1d22, #ececf1); --muted: light-dark(#5e5e68, #a2a2ad); --line: light-dark(#e4e2de, #2c2c33); --sun: #ffd166; --violet: #7845f4; --green: #13a079; --pink: #d6378a; --r: 22px; }
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; scroll-padding-top: 5rem; }
        @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } * { transition: none !important; } }
        body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.6 Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; overflow-x: hidden; }
        a { color: inherit; }
        img { max-width: 100%; }
        .wrap { width: min(74rem, 100% - 2.5rem); margin: 0 auto; }
        .sav { font-weight: 400 !important; }
        .skip { position: absolute; left: -999px; } .skip:focus { left: 1rem; top: 1rem; z-index: 9; background: var(--card); padding: .5rem 1rem; border-radius: 10px; }
        :focus-visible { outline: 3px solid var(--violet); outline-offset: 3px; border-radius: 6px; }

        /* header */
        .top { position: sticky; top: 0; z-index: 5; background: color-mix(in oklab, var(--bg) 82%, transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-bottom: 1px solid color-mix(in oklab, var(--line) 60%, transparent); }
        .top .wrap { display: flex; align-items: center; gap: .9rem; height: 4rem; }
        .top .brand { display: flex; align-items: center; gap: .6rem; text-decoration: none; font-size: 1.18rem; letter-spacing: -.02em; }
        .top .brand img { width: 30px; height: 30px; }
        .top nav { margin-left: auto; display: flex; align-items: center; gap: 1.2rem; font-size: .92rem; }
        .top nav a { text-decoration: none; color: var(--muted); } .top nav a:hover { color: var(--text); }
        .top nav .lang a[aria-current] { color: var(--text); font-weight: 650; }
        .top nav .lang { display: flex; gap: .5rem; padding-left: 1.2rem; border-left: 1px solid var(--line); }
        @media (max-width: 760px) { .top nav .sec { display: none; } .top nav .lang { border: 0; padding: 0; } }

        /* buttons and pills */
        .btn { display: inline-flex; align-items: center; gap: .5rem; padding: .8rem 1.25rem; border-radius: 14px; font-weight: 650; text-decoration: none; transition: transform .15s, box-shadow .15s, background .15s; }
        .btn.main { background: var(--text); color: var(--bg); } .btn.main:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgb(20 10 30 / .22); }
        .btn.ghost { border: 1px solid var(--line); background: var(--card); } .btn.ghost:hover { border-color: var(--muted); }
        .btn svg { width: 18px; height: 18px; }
        .pills { display: flex; flex-wrap: wrap; gap: .5rem; padding: 0; margin: 0; list-style: none; }
        .pills li { display: inline-flex; align-items: center; gap: .4rem; padding: .35rem .8rem; border-radius: 99px; background: var(--card); border: 1px solid var(--line); font-size: .86rem; font-weight: 550; }
        .pills li::before { content: ""; width: .5rem; height: .5rem; border-radius: 2px; background: var(--sun); }

        /* hero */
        .hero { padding: clamp(2.5rem, 6vw, 5rem) 0 clamp(2rem, 4vw, 3.5rem); display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: 3rem; align-items: center; }
        .eyebrow { display: inline-flex; align-items: center; gap: .5rem; font-size: .85rem; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 0 0 1rem; }
        .eyebrow img { width: 22px; height: 22px; }
        h1 { font-size: clamp(2.5rem, 6vw, 4.4rem); line-height: 1; letter-spacing: -.05em; margin: 0 0 1.2rem; font-weight: 800; }
        h1 em { font-style: normal; background: linear-gradient(90deg, var(--violet), var(--green) 55%, var(--pink)); -webkit-background-clip: text; background-clip: text; color: transparent; }
        h1 em::selection { color: #fff; -webkit-text-fill-color: #fff; background: var(--violet); }
        .lead { font-size: clamp(1.08rem, 1.6vw, 1.25rem); color: var(--muted); margin: 0 0 1.8rem; max-width: 34rem; }
        .ctas { display: flex; flex-wrap: wrap; gap: .7rem; margin-bottom: 1.6rem; }
        .collage { position: relative; aspect-ratio: 1.25; }
        .collage figure { position: absolute; margin: 0; border-radius: 14px; overflow: hidden; background: var(--card); box-shadow: 0 30px 60px -20px rgb(20 10 30 / .35), 0 0 0 1px rgb(0 0 0 / .06); }
        .collage figure img { display: block; width: 100%; height: auto; }
        .collage .c1 { width: 78%; left: 0; top: 4%; transform: rotate(-3deg); }
        .collage .c2 { width: 70%; right: 0; top: 30%; transform: rotate(2.5deg); }
        .collage .c3 { width: 24%; left: 46%; bottom: -2%; transform: rotate(-4deg); border-radius: 18px; border: 5px solid #1d1d22; }
        .collage .dot { position: absolute; border-radius: 50%; z-index: -1; filter: blur(2px); }
        .collage .d1 { width: 38%; aspect-ratio: 1; background: color-mix(in oklab, var(--violet) 22%, transparent); right: 6%; top: -6%; }
        .collage .d2 { width: 30%; aspect-ratio: 1; background: color-mix(in oklab, var(--sun) 55%, transparent); left: 4%; bottom: 0; }
        @media (max-width: 900px) { .hero { grid-template-columns: 1fr; } .collage { max-width: 36rem; width: 100%; margin: 0 auto; } }

        /* strip of the apps */
        .strip { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: .6rem; padding: 1.2rem; background: var(--card); border: 1px solid var(--line); border-radius: var(--r); margin-bottom: clamp(3rem, 7vw, 5.5rem); }
        .strip a { display: grid; justify-items: center; gap: .35rem; padding: .6rem .2rem; border-radius: 14px; text-decoration: none; font-size: .8rem; font-weight: 600; text-align: center; transition: background .15s, transform .15s; min-width: 0; }
        .strip a:hover { background: var(--bg2); transform: translateY(-2px); }
        .strip img { width: 46px; height: 46px; }
        .strip span { overflow: hidden; text-overflow: ellipsis; max-width: 100%; white-space: nowrap; }
        .strip .short { display: none; }
        @media (max-width: 1000px) { .strip { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
        @media (max-width: 760px) { .strip { grid-template-columns: repeat(3, minmax(0, 1fr)); } .strip .full { display: none; } .strip .short { display: block; white-space: normal; line-height: 1.25; } }

        /* sections */
        section.block { padding: clamp(2.5rem, 6vw, 4.5rem) 0; }
        .head { max-width: 44rem; margin-bottom: 2.2rem; }
        .kicker { font-size: .82rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 0 0 .6rem; }
        h2 { font-size: clamp(1.8rem, 3.6vw, 2.7rem); line-height: 1.08; letter-spacing: -.04em; margin: 0 0 .8rem; font-weight: 800; }
        .head p { color: var(--muted); font-size: 1.08rem; margin: 0; }

        /* why */
        .why { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; }
        .why div { padding: 1.5rem; border-radius: var(--r); background: var(--card); border: 1px solid var(--line); }
        .why .i { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; margin-bottom: 1rem; color: #fff; }
        .why .i svg { width: 22px; height: 22px; }
        .why h3 { margin: 0 0 .4rem; font-size: 1.08rem; letter-spacing: -.02em; } .why p { margin: 0; color: var(--muted); font-size: .95rem; }
        @media (max-width: 1000px) { .why { grid-template-columns: repeat(2, minmax(0, 1fr)); } } @media (max-width: 560px) { .why { grid-template-columns: 1fr; } }

        /* apps */
        .list { margin-top: clamp(1.5rem, 3vw, 2.5rem); }
        .app { display: grid; grid-template-columns: minmax(0, .95fr) minmax(0, 1.05fr); gap: clamp(1.5rem, 4vw, 3.5rem); align-items: center; padding: clamp(1.4rem, 3vw, 2.4rem); border-radius: 28px; background: var(--card); border: 1px solid var(--line); margin-bottom: 1.2rem; position: relative; overflow: hidden; }
        .app::before { content: ""; position: absolute; inset: 0; background: radial-gradient(60rem 22rem at 100% 0%, color-mix(in oklab, var(--c) 10%, transparent), transparent 60%); pointer-events: none; }
        .app:nth-of-type(even) .text { order: 2; }
        .app .name { display: flex; align-items: center; gap: .8rem; margin-bottom: .9rem; }
        .app .name img { width: 52px; height: 52px; }
        .app .name h4 { margin: 0; font-size: 1.45rem; letter-spacing: -.03em; line-height: 1.1; }
        .app .name small { display: block; color: var(--c); font-weight: 700; font-size: .92rem; letter-spacing: -.01em; filter: brightness(1.1); }
        .app .desc { margin: 0 0 1rem; color: var(--muted); }
        .app ul.feat { list-style: none; padding: 0; margin: 0 0 1.1rem; display: grid; gap: .45rem; }
        .app ul.feat li { position: relative; padding-left: 1.6rem; font-size: .95rem; }
        .app ul.feat li::before { content: ""; position: absolute; left: 0; top: .42em; width: .95rem; height: .95rem; border-radius: 5px; background: color-mix(in oklab, var(--c) 18%, transparent); box-shadow: inset 0 0 0 2px var(--c); }
        .app .edge { display: flex; gap: .7rem; padding: .9rem 1rem; border-radius: 16px; background: color-mix(in oklab, var(--c) 9%, var(--card)); border: 1px solid color-mix(in oklab, var(--c) 22%, transparent); font-size: .95rem; margin-bottom: 1.2rem; }
        .app .edge b { color: var(--c); filter: brightness(1.05); white-space: nowrap; }
        .app .acts { display: flex; flex-wrap: wrap; gap: .6rem; }
        .app .acts .btn { padding: .65rem 1.05rem; border-radius: 12px; font-size: .95rem; }
        .app .acts .btn.main { background: var(--c); color: #fff; }
        .shots { position: relative; padding: 0 0 8% 0; }
        .shots .desk { border-radius: 14px; overflow: hidden; box-shadow: 0 24px 50px -22px rgb(20 10 30 / .4), 0 0 0 1px rgb(0 0 0 / .07); background: var(--bg2); }
        .shots .desk img, .shots .phone img { display: block; width: 100%; height: auto; }
        .shots .phone { position: absolute; right: -2%; bottom: 0; width: 25%; border-radius: 18px; overflow: hidden; border: 5px solid #1d1d22; box-shadow: 0 20px 40px -12px rgb(20 10 30 / .45); background: #1d1d22; }
        .app:nth-of-type(even) .shots .phone { right: auto; left: -2%; }
        @media (max-width: 900px) { .app { grid-template-columns: 1fr; } .app:nth-of-type(even) .text { order: 0; } }
        @media (max-width: 560px) { .app .edge { flex-direction: column; gap: .2rem; } }

        /* together */
        .together { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 2.5rem; align-items: center; }
        /* the hub: a ring of 4 × 4 around SavAccount (2 × 2 in the middle), 3 columns on a phone */
        .hub { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .6rem; padding: 1.2rem; border-radius: 28px; background: var(--card); border: 1px solid var(--line); }
        .hub .n { display: grid; justify-items: center; align-content: center; gap: .25rem; min-width: 0; text-align: center; padding: .55rem .2rem; }
        .hub .n img { width: 46px; height: 46px; border-radius: 11px; }
        /* an app for now only for some accounts; a place waiting for its screenshots */
        .invite { display: flex; gap: .5rem; align-items: flex-start; margin: .2rem 0 1rem; padding: .65rem .85rem; border-radius: 12px; font-size: .92rem; line-height: 1.45; background: color-mix(in oklab, var(--c, #0a6fb0) 9%, var(--card)); border: 1px solid color-mix(in oklab, var(--c, #0a6fb0) 26%, transparent); }
        .invite svg { flex: none; width: 18px; height: 18px; margin-top: .1rem; color: var(--c, #0a6fb0); } .invite a { color: inherit; font-weight: 650; }
        .shots .desk.noshot { display: grid; place-items: center; aspect-ratio: 1440 / 900; background: radial-gradient(120% 120% at 30% 20%, color-mix(in oklab, var(--c) 22%, var(--bg2)), color-mix(in oklab, var(--c) 8%, var(--bg2))); }
        .shots .desk.noshot img { width: 22%; height: auto; border-radius: 24%; filter: drop-shadow(0 14px 24px rgb(0 0 0 / .18)); }
        .hub .n b { color: var(--text); font-size: .8rem; letter-spacing: -.01em; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hub .n small { font-size: .74rem; color: var(--muted); line-height: 1.25; }
        .hub .short { display: none; }
        .hub .core { grid-column: 2 / 5; grid-row: 2 / 5; background: color-mix(in oklab, #66cbff 12%, var(--card)); border-radius: 22px; border: 1px dashed color-mix(in oklab, #3a9fd6 55%, transparent); }
        .hub .core img { width: 72px; height: 72px; } .hub .core b { font-size: 1rem; } .hub .core small { font-size: .85rem; }
        @media (max-width: 560px) { .hub { grid-template-columns: repeat(3, minmax(0, 1fr)); padding: .9rem; } .hub .core { grid-column: 1 / -1; grid-row: 2; padding: 1rem; } .hub .full { display: none; } .hub .short { display: inline; } .hub .n b { white-space: normal; line-height: 1.2; } }
        .flows { list-style: none; padding: 0; margin: 1.4rem 0 0; display: grid; gap: .7rem; }
        .flows li { display: grid; grid-template-columns: auto 1fr; gap: .8rem; align-items: start; padding: .9rem 1rem; border-radius: 16px; background: var(--card); border: 1px solid var(--line); font-size: .96rem; }
        .flows .ic { display: flex; align-items: center; gap: .25rem; } .flows .ic img { width: 26px; height: 26px; } .flows .ic span { color: var(--muted); font-size: .9rem; }
        @media (max-width: 900px) { .together { grid-template-columns: 1fr; } }

        /* privacy */
        .privacy { background: #17151d; color: #f2f0f7; border-radius: 36px; padding: clamp(2rem, 5vw, 4rem); position: relative; overflow: hidden; color-scheme: dark; }
        .privacy::after { content: ""; position: absolute; width: 34rem; height: 34rem; right: -10rem; top: -14rem; border-radius: 50%; background: radial-gradient(circle, rgb(120 69 244 / .35), transparent 65%); pointer-events: none; }
        .privacy .kicker, .privacy .head p { color: #b5b1c2; }
        .promises { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; position: relative; z-index: 1; }
        .promises div { padding: 1.3rem; border-radius: 20px; background: rgb(255 255 255 / .05); border: 1px solid rgb(255 255 255 / .09); }
        .promises h3 { margin: 0 0 .35rem; font-size: 1.04rem; display: flex; align-items: center; gap: .55rem; }
        .promises h3 svg { width: 20px; height: 20px; color: var(--sun); flex: none; }
        .promises p { margin: 0; color: #c9c5d6; font-size: .94rem; }
        @media (max-width: 900px) { .promises { grid-template-columns: repeat(2, minmax(0, 1fr)); } } @media (max-width: 560px) { .promises { grid-template-columns: 1fr; } }

        /* open */
        .open { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.2rem; }
        .open > div { padding: 1.8rem; border-radius: var(--r); background: var(--card); border: 1px solid var(--line); }
        .open h3 { margin: 0 0 .5rem; font-size: 1.25rem; letter-spacing: -.02em; }
        .open .built { order: 3; grid-column: 1 / -1; background: linear-gradient(120deg, color-mix(in oklab, #66cbff 14%, var(--card)), var(--card) 60%); }
        .open .built h3 { display: flex; align-items: center; gap: .7rem; } .open .built h3 img { width: 40px; height: 40px; }
        .open .built p { max-width: 52rem; } .open p { margin: 0 0 1.1rem; color: var(--muted); }
        .fmt { display: flex; flex-wrap: wrap; gap: .4rem; padding: 0; margin: 0; list-style: none; }
        .fmt li { font: 600 .8rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; padding: .45rem .6rem; border-radius: 8px; background: var(--bg2); border: 1px solid var(--line); }
        .fmt li.own { background: color-mix(in oklab, var(--sun) 30%, var(--card)); border-color: color-mix(in oklab, var(--sun) 60%, transparent); }
        @media (max-width: 800px) { .open { grid-template-columns: 1fr; } }

        /* end */
        .end { text-align: center; padding: clamp(3rem, 7vw, 5rem) 0; }
        .end h2 { margin-bottom: .6rem; } .end p { color: var(--muted); margin: 0 auto 1.6rem; max-width: 34rem; font-size: 1.08rem; }
        .end .ctas { justify-content: center; }
        /* the page of one app */
        .detail { padding-bottom: 3rem; }
        .crumbs { display: flex; gap: .55rem; align-items: center; padding: 1.4rem 0 0; font-size: .92rem; color: var(--muted); }
        .crumbs a { text-decoration: none; color: var(--text); }
        .dhero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: clamp(1.5rem, 4vw, 3.5rem); align-items: center; padding: clamp(1.6rem, 4vw, 3rem) 0 clamp(2rem, 4vw, 3rem); }
        .name.big { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.2rem; }
        .name.big img { width: 72px; height: 72px; }
        .name.big h1 { font-size: clamp(2.2rem, 5vw, 3.3rem); margin: 0; line-height: 1; }
        .name.big small { display: block; color: var(--c); font-weight: 700; font-size: 1.05rem; margin-top: .3rem; filter: brightness(1.1); }
        .detail .lead { max-width: none; font-size: 1.08rem; }
        .btn.app-c { background: var(--c); color: #fff; } .btn.app-c:hover { transform: translateY(-2px); box-shadow: 0 12px 28px color-mix(in oklab, var(--c) 35%, transparent); }
        .detail .shots .phone { right: -2%; left: auto; }
        @media (max-width: 900px) { .dhero { grid-template-columns: minmax(0, 1fr); } }
        .dbody { display: grid; grid-template-columns: minmax(0, 1fr) 20rem; gap: clamp(1.5rem, 4vw, 3rem); align-items: start; }
        .dbody h2 { font-size: clamp(1.4rem, 2.6vw, 1.8rem); margin: 0 0 1rem; }
        .dbody section + section { margin-top: clamp(2.2rem, 5vw, 3.2rem); }
        .detail ul.feat { list-style: none; padding: 0; margin: 0 0 1.2rem; display: grid; gap: .6rem; }
        .detail ul.feat li { position: relative; padding-left: 1.8rem; font-size: 1.02rem; }
        .detail ul.feat li::before { content: ""; position: absolute; left: 0; top: .38em; width: 1.05rem; height: 1.05rem; border-radius: 5px; background: color-mix(in oklab, var(--c) 18%, transparent); box-shadow: inset 0 0 0 2px var(--c); }
        .detail .edge { display: flex; gap: .7rem; padding: 1rem 1.1rem; border-radius: 16px; background: color-mix(in oklab, var(--c) 9%, var(--card)); border: 1px solid color-mix(in oklab, var(--c) 22%, transparent); margin: 0; }
        .detail .edge b { color: var(--c); white-space: nowrap; filter: brightness(1.05); }
        .gallery h3 { font-size: .85rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 1.4rem 0 .6rem; }
        .gallery ul { list-style: none; margin: 0 -.3rem; padding: .3rem .3rem .8rem; display: grid; grid-auto-flow: column; gap: .9rem; overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain; }
        .gallery li { scroll-snap-align: start; }
        .gallery sav-image { --sav-radius-lg: 12px; --sav-shadow-sm: 0 10px 26px -14px rgb(20 10 30 / .35), 0 0 0 1px var(--line); }
        .gallery img { display: block; width: 100%; height: auto; border-radius: 12px; }
        .shots sav-image { --sav-radius-lg: 0px; --sav-shadow-sm: none; }
        .strip-m { grid-auto-columns: minmax(10rem, 13rem); } .strip-t { grid-auto-columns: minmax(18rem, 30rem); } .strip-d { grid-auto-columns: minmax(18rem, 32rem); }
        .detail .flows { margin: 0; }
        .detail .flows a.ic { display: flex; } .detail .flows img { width: 30px; height: 30px; }
        .facts { position: sticky; top: 5rem; padding: 1.4rem; border-radius: var(--r); background: var(--card); border: 1px solid var(--line); }
        .facts h2 { font-size: 1.15rem !important; margin: 0 0 .8rem !important; }
        .facts dl { margin: 0; display: grid; gap: .85rem; }
        .facts dt { font-size: .78rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
        .facts dd { margin: .15rem 0 0; font-size: .95rem; } .facts dd small { display: block; color: var(--muted); font-size: .85rem; margin-top: .15rem; }
        .facts .fmt { margin-top: .3rem; }
        @media (max-width: 900px) { .dbody { grid-template-columns: minmax(0, 1fr); } .facts { position: static; } }
        .pager { display: grid; grid-template-columns: 1fr auto 1fr; gap: 1rem; align-items: center; margin-top: clamp(2.5rem, 6vw, 4rem); padding-top: 1.5rem; border-top: 1px solid var(--line); }
        .pager a { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; gap: 0 .6rem; align-items: center; text-decoration: none; padding: .7rem .9rem; border-radius: 16px; border: 1px solid var(--line); background: var(--card); }
        .pager a span { grid-column: 1 / -1; font-size: .8rem; color: var(--muted); }
        .pager a { justify-self: start; } .pager a.next { justify-self: end; text-align: right; } .pager a.all { display: inline-flex; padding: .7rem 1.1rem; font-weight: 650; }
        @media (max-width: 640px) { .pager { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .pager a.all { grid-column: 1 / -1; grid-row: 1; justify-self: center; } }
        footer { border-top: 1px solid var(--line); }
        /* supporting SavOffice: an invitation, not a request */
        .support { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1.2rem 2.5rem; align-items: center; padding: clamp(1.4rem, 3.5vw, 2.4rem); border-radius: var(--r); background: var(--card); border: 1px solid var(--line); }
        .support h2 { margin: 0 0 .6rem; } .support p { margin: 0; color: var(--muted); max-width: 46rem; } .support p + p { margin-top: .6rem; font-size: .95rem; }
        .support .btn svg { width: 18px; height: 18px; fill: var(--pink); stroke: none; }
        @media (max-width: 760px) { .support { grid-template-columns: minmax(0, 1fr); } .support .btn { justify-self: start; } }
        footer .wrap { display: flex; flex-wrap: wrap; gap: .5rem 1.4rem; padding: 1.4rem 0 2rem; color: var(--muted); font-size: .88rem; }
        footer .wrap span:last-child { margin-left: auto; }
    </style>
</head>
<body>
<a class="skip" href="#main"><?= $L('Vai alle app', 'Skip to the apps') ?></a>
<header class="top">
    <div class="wrap">
        <a class="brand" href="/savoffice/<?= $q !== '' ? '?lang=' . $lang : '' ?>"><img src="/savoffice/icons/favicon.svg" alt="" width="30" height="30"><span><span class="sav">Sav</span><b>Office</b></span></a>
        <nav aria-label="<?= $L('Pagina', 'Page') ?>">
            <a class="sec" href="<?= $app ? '/savoffice/' . ($q !== '' ? '?lang=' . $lang : '') : '' ?>#apps"><?= $L('Le app', 'The apps') ?></a>
            <a class="sec" href="<?= $app ? '/savoffice/' . ($q !== '' ? '?lang=' . $lang : '') : '' ?>#together"><?= $L('Insieme', 'Together') ?></a>
            <a class="sec" href="<?= $app ? '/savoffice/' . ($q !== '' ? '?lang=' . $lang : '') : '' ?>#privacy">Privacy</a>
            <span class="lang"><a href="?lang=it" hreflang="it" <?= $it ? 'aria-current="true"' : '' ?>>IT</a><a href="?lang=en" hreflang="en" <?= $it ? '' : 'aria-current="true"' ?>>EN</a></span>
        </nav>
    </div>
</header>

<main id="main">
<?php if ($app) { require __DIR__ . '/app.php'; } else { ?>
    <div class="wrap">
        <section class="hero">
            <div>
                <p class="eyebrow"><img src="/savoffice/icons/favicon.svg" alt=""><?= $L($n . ' app · un solo stile', $n . ' apps · one style') ?></p>
                <h1><?= $it ? 'Un ufficio <em>libero</em>, aperto, tuo.' : 'A <em>free</em>, open office of your own.' ?></h1>
                <p class="lead"><?= $L('File e cartelle, foto, documenti, fogli di calcolo, libri, presentazioni, calendario, sondaggi, attività, moduli, lavagna, quaderni, posta, podcast, spese condivise e newsletter. Non ' . $nw('it') . ' programmi separati: app pensate per lavorare insieme, gratuite, open source e rispettose dei tuoi dati.', 'Files and folders, photos, documents, spreadsheets, books, presentations, calendar, polls, tasks, forms, whiteboard, notebooks, email, podcasts, shared expenses and newsletters. Not ' . $nw('en') . ' separate programs: apps made to work together, free, open source and respectful of your data.') ?></p>
                <div class="ctas">
                    <a class="btn main" href="#apps"><?= $L('Scopri le app', 'Discover the apps') ?> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg></a>
                    <a class="btn ghost" href="https://github.com/Sav22999/illerom"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z"/></svg><?= $L('Codice sorgente', 'Source code') ?></a>
                </div>
                <ul class="pills">
                    <li><?= $L('Gratis', 'Free') ?></li><li>Open source</li><li><?= $L('Niente pubblicità', 'No ads') ?></li><li><?= $L('Dati nell’UE', 'Data in the EU') ?></li>
                </ul>
            </div>
            <div class="collage" aria-hidden="true">
                <span class="dot d1"></span><span class="dot d2"></span>
                <figure class="c1"><img src="<?= $shot('savcalendar', 'd1.jpg') ?>" alt="" width="1440" height="900"></figure>
                <figure class="c2"><img src="<?= $shot('savdocuments', 'd2.jpg') ?>" alt="" width="1440" height="900"></figure>
                <figure class="c3"><img src="<?= $shot('savtasks', '2.jpg') ?>" alt="" width="562" height="1000"></figure>
            </div>
        </section>

        <nav class="strip" aria-label="<?= $L('Le app di SavOffice', 'The apps of SavOffice') ?>">
            <?php foreach ($apps as $slug => $a): ?>
                <a href="#<?= $slug ?>"><?= $ico($slug, 46) ?><span class="full"><?= $h($projects[$slug]['name']) ?></span><span class="short"><?= $L(...$short[$slug]) ?></span></a>
            <?php endforeach; ?>
        </nav>

        <section class="block" aria-labelledby="why-h">
            <div class="head">
                <p class="kicker"><?= $L('Perché SavOffice', 'Why SavOffice') ?></p>
                <h2 id="why-h"><?= $L('Non “un’altra alternativa”: un ufficio che si tiene insieme.', 'Not “one more alternative”: an office that holds together.') ?></h2>
                <p><?= $L('Ogni app fa bene il suo lavoro, ma il bello arriva quando le usi insieme: le stesse abitudini ovunque, i dati che passano da un’app all’altra, nessuno che guadagna sulle tue informazioni.', 'Each app does its job well, but the best part comes when you use them together: the same habits everywhere, data that moves from one app to the next, and nobody making money on your information.') ?></p>
            </div>
            <div class="why">
                <div><span class="i" style="background:var(--violet)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg></span>
                    <h3><?= $L('Collegate tra loro', 'Connected') ?></h3><p><?= $L('La data scelta in un sondaggio, la scadenza di un modulo o di un’attività, una newsletter programmata: compaiono da sole nel calendario.', 'The date chosen in a poll, the deadline of a form or a task, a planned newsletter: they show up in the calendar by themselves.') ?></p></div>
                <div><span class="i" style="background:var(--green)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
                    <h3><?= $L('Privacy per davvero', 'Privacy for real') ?></h3><p><?= $L('Niente pubblicità, profilazione o statistiche di terzi. Server nell’Unione europea, e i tuoi dati li scarichi o li cancelli quando vuoi.', 'No ads, profiling or third-party analytics. Servers in the European Union, and you download or delete your data whenever you like.') ?></p></div>
                <div><span class="i" style="background:var(--pink)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/></svg></span>
                    <h3><?= $L('Aperte e tue', 'Open and yours') ?></h3><p><?= $L('Il codice è pubblico, e sono costruite con SavComponents, anch’esso open source ed europeo. Apri e salvi i formati di sempre, Word, PowerPoint, PDF, .ics, CSV: non resti mai bloccato.', 'The code is public, and they are built with SavComponents, open source and European too. You open and save the usual formats, Word, PowerPoint, PDF, .ics, CSV: you are never locked in.') ?></p></div>
                <div><span class="i" style="background:#1f56d1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="14" height="10" rx="2"/><rect x="16" y="9" width="6" height="11" rx="1.5"/><path d="M6 18h6"/></svg></span>
                    <h3><?= $L('Ovunque, subito', 'Anywhere, at once') ?></h3><p><?= $L('Si aprono nel browser di computer, tablet e telefono, senza installare nulla, e si installano come app. Documenti e presentazioni funzionano anche offline.', 'They open in the browser of a computer, tablet or phone, with nothing to install, and install as apps. Documents and presentations also work offline.') ?></p></div>
            </div>
        </section>

        <section class="block" id="apps" aria-labelledby="apps-h">
            <div class="head">
                <p class="kicker"><?= $L('Le app', 'The apps') ?></p>
                <h2 id="apps-h"><?= $L(ucfirst($nw('it')) . ' app, ognuna con un’idea in più.', ucfirst($nw('en')) . ' apps, each with an extra idea.') ?></h2>
                <p><?= $L('Fanno quello che ti aspetti da documenti, calendario o moduli, e poi qualcosa che altrove non trovi.', 'They do what you expect from documents, a calendar or forms, and then something you will not find elsewhere.') ?></p>
            </div>
            <div class="list">
                    <?php foreach ($apps as $slug => [$color, $desk, $phone, $eit, $een]): $p = $projects[$slug][$lang]; ?>
                        <article class="app" id="<?= $slug ?>" style="--c:<?= $color ?>">
                            <div class="text">
                                <div class="name"><?= $ico($slug, 52) ?><div><h4><?= $name($slug) ?></h4><small><?= $h($p[0]) ?></small></div></div>
                                <p class="desc"><?= $h(preg_replace(['/\s*(Fa parte di SavOffice|Part of SavOffice)[^.]*\.?\s*$/u', '/,? (e|and) (fa parte di|is part of) SavOffice/u', '/ (e|and) (fa parte di|is part of) SavOffice\./u'], ['', '', '.'], $p[1])) ?></p>
                                <ul class="feat"><?php foreach ($p[2] as $f): ?><li><?= $h($f) ?></li><?php endforeach; ?></ul>
                                <p class="edge"><b><?= $L('In più', 'The extra') ?></b><span><?= $L($eit, $een) ?></span></p>
                                <?= $invite($slug) ?>
                                <div class="acts">
                                    <a class="btn main" href="/<?= $slug ?>/"><?= $L('Apri', 'Open') ?> <?= $h($projects[$slug]['name']) ?></a>
                                    <a class="btn ghost" href="/savoffice/<?= $slug ?>/<?= $q !== '' ? '?lang=' . $lang : '' ?>"><?= $L('Scheda e schermate', 'Details and screenshots') ?></a>
                                </div>
                            </div>
                            <div class="shots">
                                <?php if ($has($slug, $desk)): ?><div class="desk"><sav-image zoom src="<?= $shot($slug, $desk) ?>" alt="<?= $h($projects[$slug]['name'] . ($it ? ' su un computer' : ' on a computer')) ?>" ratio="1440:900"></sav-image></div>
                                <?php else: ?><div class="desk noshot" aria-hidden="true"><?= $ico($slug, 112) ?></div><?php endif; ?>
                                <?php if ($has($slug, $phone)): ?><div class="phone"><sav-image zoom src="<?= $shot($slug, $phone) ?>" alt="<?= $h($projects[$slug]['name'] . ($it ? ' su un telefono' : ' on a phone')) ?>" ratio="562:1000"></sav-image></div><?php endif; ?>
                            </div>
                        </article>
                    <?php endforeach; ?>
            </div>
        </section>

        <section class="block" id="together" aria-labelledby="tog-h">
            <div class="together">
                <div>
                    <p class="kicker"><?= $L('Insieme', 'Together') ?></p>
                    <h2 id="tog-h"><?= $L('Un solo account, tutto al suo posto.', 'One account, everything in its place.') ?></h2>
                    <p style="color:var(--muted);font-size:1.06rem;margin:0"><?= $L('SavSchedules, SavCalendar, SavTasks, SavForms, SavWhiteboard, SavNotes, SavMail, SavPodcasts e SavSplits condividono lo stesso account, e SavPhotos quello di SavDrive; con SavAccount entri in tutte e ' . $nw('it') . ' con un solo accesso. E il pulsante a griglia, in ogni app, ti porta alle altre.', 'SavSchedules, SavCalendar, SavTasks, SavForms, SavWhiteboard, SavNotes, SavMail, SavPodcasts and SavSplits share the same account, and SavPhotos the one of SavDrive; with SavAccount you get into all ' . $nw('en') . ' with a single sign-in. And the grid button, in every app, takes you to the others.') ?></p>
                    <ul class="flows">
                        <li><span class="ic"><?= $ico('savschedules', 26) ?><span>→</span><?= $ico('savcalendar', 26) ?></span><span><?= $L('La data scelta e i posti prenotati entrano nel calendario; e dal calendario nasce un nuovo sondaggio.', 'The chosen date and booked slots go into the calendar; and a new poll can start from the calendar.') ?></span></li>
                        <li><span class="ic"><?= $ico('savtasks', 26) ?><span>→</span><?= $ico('savcalendar', 26) ?></span><span><?= $L('Le attività con scadenza compaiono nel calendario; un’attività può diventare un evento o un sondaggio.', 'Tasks with a due day show in the calendar; a task can become an event or a poll.') ?></span></li>
                        <li><span class="ic"><?= $ico('savforms', 26) ?><span>→</span><?= $ico('savcalendar', 26) ?></span><span><?= $L('La scadenza di un modulo è nel calendario, e a quell’ora il modulo si chiude da solo.', 'The deadline of a form is in the calendar, and at that time the form closes by itself.') ?></span></li>
                        <li><span class="ic"><?= $ico('savnewsletters', 26) ?><span>→</span><?= $ico('savcalendar', 26) ?></span><span><?= $L('Le newsletter programmate si vedono nel giorno in cui partiranno.', 'Planned newsletters show on the day they will go out.') ?></span></li>
                    </ul>
                </div>
                <?php // SavAccount in the middle, the one sign-in of all of them; all the apps around, in alphabetical order
                $hub = ['savbooks' => ['EPUB · PDF', 'EPUB · PDF'], 'savcalendar' => ['date e scadenze', 'dates and deadlines'], 'savdocuments' => ['.docx · PDF', '.docx · PDF'], 'savdrive' => ['i tuoi file', 'your files'], 'savforms' => ['chiusure', 'deadlines'],
                    'savnewsletters' => ['invii', 'sendings'], 'savnotes' => ['PDF · PNG', 'PDF · PNG'], 'savpresentations' => ['.pptx · .odp', '.pptx · .odp'], 'savschedules' => ['date e posti', 'dates and slots'],
                    'savspreadsheets' => ['.xlsx · .ods', '.xlsx · .ods'], 'savtasks' => ['scadenze', 'due days'], 'savwhiteboard' => ['PNG · SVG · PDF', 'PNG · SVG · PDF'],
                    'savmail' => ['IMAP · SMTP', 'IMAP · SMTP'], 'savphotos' => ['backup e album', 'backup and albums'], 'savpodcasts' => ['RSS · OPML', 'RSS · OPML'], 'savsplits' => ['saldi', 'balances']]; ?>
                <div class="hub" aria-hidden="true">
                    <div class="n core"><img src="/assets/projects/savaccount.png" alt="" width="72" height="72"><b>SavAccount</b><small><?= $L('un solo accesso per tutte', 'one sign-in for all of them') ?></small></div>
                    <?php foreach ($apps as $slug => $a): ?>
                        <div class="n"><?= $ico($slug, 46) ?><b><span class="full"><?= $h($projects[$slug]['name']) ?></span><span class="short"><?= $L(...$short[$slug]) ?></span></b><small><?= $L(...($hub[$slug] ?? ['', ''])) ?></small></div>
                    <?php endforeach; ?>
                </div>
            </div>
        </section>

        <section class="block" id="privacy" aria-labelledby="priv-h">
            <div class="privacy">
                <div class="head" style="position:relative;z-index:1">
                    <p class="kicker">Privacy</p>
                    <h2 id="priv-h"><?= $L('I tuoi dati restano tuoi. Punto.', 'Your data stays yours. Full stop.') ?></h2>
                    <p><?= $L('Non è uno slogan: sono regole scritte nel codice, che chiunque può controllare.', 'It is not a slogan: these are rules written in the code, which anyone can check.') ?></p>
                </div>
                <?php $chk = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'; ?>
                <div class="promises">
                    <div><h3><?= $chk . $L('Niente pubblicità', 'No ads') ?></h3><p><?= $L('Nessun banner, nessuna profilazione: non c’è niente da vendere, nemmeno te.', 'No banners, no profiling: there is nothing to sell, you included.') ?></p></div>
                    <div><h3><?= $chk . $L('Niente tracciamento', 'No tracking') ?></h3><p><?= $L('Nessuna statistica di terzi; solo un cookie tecnico per tenerti dentro.', 'No third-party analytics; only a technical cookie to keep you signed in.') ?></p></div>
                    <div><h3><?= $chk . $L('Server nell’UE', 'Servers in the EU') ?></h3><p><?= $L('Tutto è ospitato nell’Unione europea, sotto il GDPR.', 'Everything is hosted in the European Union, under the GDPR.') ?></p></div>
                    <div><h3><?= $chk . $L('Scarica o cancella', 'Download or delete') ?></h3><p><?= $L('Dalle impostazioni scarichi i tuoi dati o elimini l’account, quando vuoi.', 'From the settings you download your data or delete the account, whenever you like.') ?></p></div>
                    <div><h3><?= $chk . $L('Rispondi senza account', 'Answer with no account') ?></h3><p><?= $L('A chi risponde a un sondaggio o a un modulo non chiediamo di registrarsi.', 'Whoever answers a poll or a form is not asked to sign up.') ?></p></div>
                    <div><h3><?= $chk . $L('Password mai in chiaro', 'Passwords never in clear') ?></h3><p><?= $L('Salviamo solo una loro impronta; oppure accedi con Google o SavAccount.', 'We only keep a fingerprint of them; or sign in with Google or SavAccount.') ?></p></div>
                </div>
            </div>
        </section>

        <section class="block" aria-labelledby="open-h">
            <div class="head">
                <p class="kicker">Open source</p>
                <h2 id="open-h"><?= $L('Aperto dentro, aperto fuori.', 'Open inside, open outside.') ?></h2>
                <p><?= $L('Il codice è su GitHub, i mattoni con cui sono fatte sono aperti anche loro, e i file sono tuoi: puoi portarli dove vuoi, quando vuoi.', 'The code is on GitHub, the bricks they are made of are open too, and the files are yours: take them wherever you want, whenever you want.') ?></p>
            </div>
            <div class="open">
                <div>
                    <h3><?= $L('Codice pubblico', 'Public code') ?></h3>
                    <p><?= $L('Ogni app è open source: leggi come funziona, segnala un problema o proponi un miglioramento. Nessuna scatola nera.', 'Every app is open source: read how it works, report a problem or suggest an improvement. No black boxes.') ?></p>
                    <a class="btn ghost" href="https://github.com/Sav22999/illerom">github.com/Sav22999/illerom</a>
                </div>
                <div class="built">
                    <h3><img src="/assets/projects/savcomponents.png" alt="" width="40" height="40"><?= $L('Costruite con SavComponents', 'Built with SavComponents') ?></h3>
                    <p><?= $L('Pulsanti, campi, finestre, schede, calendari e selettori di tutte e ' . $nw('it') . ' le app vengono da SavComponents: componenti web liberi, sviluppati in Italia, senza framework né dipendenze. Per questo le app si somigliano, si usano allo stesso modo e funzionano bene con la tastiera e i lettori di schermo. Chiunque può usarli anche nel proprio sito.', 'The buttons, fields, dialogs, tabs, calendars and pickers of all ' . $nw('en') . ' apps come from SavComponents: free web components, made in Italy, with no framework and no dependencies. That is why the apps look alike, work the same way and behave well with the keyboard and screen readers. Anyone can use them on their own site too.') ?></p>
                    <ul class="fmt" style="margin-bottom:1.1rem"><li class="own">Open source · MIT</li><li><?= $L('Europeo', 'European') ?></li><li><?= $L('Nessuna dipendenza', 'No dependencies') ?></li><li><?= $L('Accessibile', 'Accessible') ?></li></ul>
                    <div class="ctas" style="margin:0"><a class="btn ghost" href="https://savcomponents.com/">savcomponents.com</a><a class="btn ghost" href="https://github.com/Sav22999/savcomponents"><?= $L('Codice', 'Code') ?></a></div>
                </div>
                <div>
                    <h3><?= $L('Formati aperti e di sempre', 'Open and familiar formats') ?></h3>
                    <p><?= $L('Ogni app ha un suo file che conserva tutto, e apre e salva quelli che usano tutti.', 'Each app has a file of its own that keeps everything, and it opens and saves the ones everybody uses.') ?></p>
                    <ul class="fmt">
                        <?php $own = array_unique(array_filter(array_merge(...array_values($files)), fn($f) => str_starts_with($f, '.sav'))); sort($own); foreach ($own as $f): ?><li class="own"><?= $f ?></li><?php endforeach; ?>
                        <?php foreach (['.docx', '.xlsx', '.ods', '.pptx', '.odp', 'PDF', 'EPUB', 'Markdown', '.ics', 'CSV', 'PNG', 'SVG'] as $f): ?><li><?= $f ?></li><?php endforeach; ?>
                    </ul>
                </div>
            </div>
        </section>

        <section class="block" id="support" aria-labelledby="sup-h">
            <div class="support">
                <div>
                    <p class="kicker"><?= $L('Sostieni SavOffice', 'Support SavOffice') ?></p>
                    <h2 id="sup-h"><?= $L('Gratis per tutti, grazie a chi può.', 'Free for everyone, thanks to those who can.') ?></h2>
                    <p><?= $L('SavOffice non ha pubblicità, abbonamenti né funzioni a pagamento, e non vende i tuoi dati. I server e il tempo per migliorarlo li coprono le donazioni di chi lo usa: se ti è utile e puoi, anche un piccolo contributo fa la differenza.', 'SavOffice has no ads, no subscriptions and no paid features, and it does not sell your data. The servers and the time to make it better are covered by the donations of those who use it: if it helps you and you can, even a small contribution makes a difference.') ?></p>
                    <p><?= $L('Se non puoi, va benissimo così: usalo, e consiglialo a chi potrebbe servire.', 'If you cannot, that is perfectly fine: use it, and tell whoever might need it.') ?></p>
                </div>
                <a class="btn main" href="https://www.saveriomorelli.com/donate/" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.2C19.5 16.4 12 21 12 21z"/></svg><?= $L('Fai una donazione', 'Make a donation') ?></a>
            </div>
        </section>

        <section class="end" aria-labelledby="end-h">
            <h2 id="end-h"><?= $L('Comincia da quella che ti serve oggi.', 'Start with the one you need today.') ?></h2>
            <p><?= $L('Sono gratuite e non serve installare nulla. Le altre saranno lì, quando ti serviranno.', 'They are free and there is nothing to install. The others will be there when you need them.') ?></p>
            <nav class="strip" style="margin:0" aria-label="<?= $L('Apri un’app', 'Open an app') ?>">
                <?php foreach ($apps as $slug => $a): ?>
                    <a href="/<?= $slug ?>/"><?= $ico($slug, 46) ?><span class="full"><?= $h($projects[$slug]['name']) ?></span><span class="short"><?= $L(...$short[$slug]) ?></span></a>
                <?php endforeach; ?>
            </nav>
        </section>
    </div>
<?php } ?>
</main>
<footer>
    <div class="wrap">
        <a href="https://www.illerom.eu/<?= $lang ?>/">Illerom</a>
        <a href="https://www.illerom.eu/<?= $lang ?>/status/"><?= $L('Stato dei servizi', 'Service status') ?></a>
        <a href="https://github.com/Sav22999/illerom"><?= $L('Codice', 'Code') ?></a>
        <a href="https://www.saveriomorelli.com/donate/" target="_blank" rel="noopener"><?= $L('Sostieni', 'Support') ?></a>
        <span><?= $L('Un progetto di', 'A project by') ?> <a href="https://www.saveriomorelli.com">Saverio Morelli</a></span>
    </div>
</footer>
</body>
</html>
