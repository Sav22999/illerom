<?php
/**
 * SavOffice — the page of the suite: what it is and its apps. Every app keeps its own folder (../savdocuments/ …) and is
 * independent; they share the look, the SavOffice button (../assets/savoffice/savoffice.js) and, for SavSchedules,
 * SavCalendar and SavTasks, the same account. Italian or English from ?lang= or the browser. No database, no cookies.
 */

declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");

$q = (string)($_GET['lang'] ?? '');
$it = $q === 'it' || ($q !== 'en' && stripos((string)($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? ''), 'it') === 0);
$L = fn(string $i, string $e): string => htmlspecialchars($it ? $i : $e, ENT_QUOTES, 'UTF-8');

$apps = [
    ['savdocuments', 'SavDocuments', '#0f6e56', 'Documenti veri, senza ingombri: pagine, tabelle, immagini, scrittura in più persone. Apre e salva i file Word.', 'Real documents, without the clutter: pages, tables, images, writing together. Opens and saves Word files.', '.savdoc · .docx · PDF'],
    ['savpresentations', 'SavPresentations', '#6d3bef', 'Presentazioni con temi già belli, modifiche in contemporanea, PDF e PowerPoint.', 'Presentations with good-looking themes, live editing together, PDF and PowerPoint.', '.pptx · .odp · PDF'],
    ['savschedules', 'SavSchedules', '#1f56d1', 'Trova la data con un sondaggio o distribuisci posti che nessun altro può prendere. A chi risponde non serve un account.', 'Find the date with a poll or hand out slots nobody else can take. No account needed to answer.', '.savsch · .ics · CSV'],
    ['savcalendar', 'SavCalendar', '#c93a2f', 'Il tuo calendario, insieme a SavSchedules: mostralo in Google, Outlook o Apple e porta qui i loro calendari.', 'Your calendar, together with SavSchedules: show it in Google, Outlook or Apple and bring their calendars here.', '.savcal · .ics · CSV'],
    ['savtasks', 'SavTasks', '#0b7a87', 'Cose da fare, liste e bacheche kanban, con scadenze e promemoria; insieme a SavCalendar e SavSchedules.', 'To-dos, lists and kanban boards, with due days and reminders; together with SavCalendar and SavSchedules.', '.savtas · CSV · Markdown'],
    ['savforms', 'SavForms', '#86329e', 'Moduli, sondaggi e quiz con un link da condividere; un grafico per ogni domanda e la scadenza in SavCalendar.', 'Forms, surveys and quizzes with a link to share; a chart for every question and the deadline in SavCalendar.', '.savfor · CSV'],
    ['savwhiteboard', 'SavWhiteboard', '#c45a0c', 'Una lavagna senza bordi: penna, matita, evidenziatore, testo, foglietti e immagini su puntini, quadretti o righe.', 'A board without edges: pen, pencil, highlighter, text, notes and pictures on dots, squares or lines.', '.savwhi · PNG · SVG · PDF'],
    ['savnotes', 'SavNotes', '#7b5434', 'Quaderni divisi in fogli a quadretti, righe o puntini: scrivi a mano con penna ed evidenziatore, o digita come in un documento.', 'Notebooks of sheets with squares, lines or dots: write by hand with pen and highlighter, or type as in a document.', '.savnot · PDF · PNG'],
    ['savnewsletters', 'SavNewsletters', '#c2307a', 'Newsletter scritte, approvate e spedite in gruppo; ciò che è programmato compare in SavCalendar.', 'Newsletters written, approved and sent as a team; what is scheduled shows up in SavCalendar.', '.savnew'],
];
?><!doctype html>
<html lang="<?= $it ? 'it' : 'en' ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SavOffice</title>
    <meta name="description" content="<?= $L('Le app libere e aperte di SavOffice: documenti, presentazioni, sondaggi e posti, calendario, attività, newsletter.', 'The free, open apps of SavOffice: documents, presentations, polls and slots, calendar, tasks, newsletters.') ?>">
    <meta name="theme-color" content="#2b2b33">
    <link rel="icon" href="icons/favicon.svg" type="image/svg+xml">
    <link rel="icon" href="icons/favicon-32.png" sizes="32x32" type="image/png">
    <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
    <meta property="og:image" content="icons/icon-512.png">
    <style>
        :root { color-scheme: light dark; --bg: light-dark(#f6f5f3, #121214); --card: light-dark(#fff, #1c1c20); --text: light-dark(#1d1d22, #ececf1); --muted: light-dark(#5e5e68, #a2a2ad); --line: light-dark(#e4e2de, #2c2c33); --sun: #ffd166; }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.55 Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
        a { color: inherit; }
        header, main, footer { width: min(70rem, 100% - 2.5rem); margin: 0 auto; }
        header { display: flex; align-items: center; gap: 1rem; padding: 1.3rem 0; }
        .mark { width: 34px; height: 34px; display: block; }
        header .brand { font-size: 1.2rem; letter-spacing: -.02em; } .sav { font-weight: 400 !important; } header nav { margin-left: auto; display: flex; gap: 1rem; font-size: .9rem; } header nav a { text-decoration: none; color: var(--muted); } header nav a[aria-current] { color: var(--text); font-weight: 600; }
        .hero { padding: 3rem 0 2.5rem; max-width: 46rem; }
        h1 { font-size: clamp(2.2rem, 5vw, 3.6rem); line-height: 1.04; letter-spacing: -.045em; margin: 0 0 1rem; }
        .hero p { font-size: 1.15rem; color: var(--muted); margin: 0; }
        .apps { display: grid; grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr)); gap: 1.1rem; padding-bottom: 2.5rem; }
        .app { display: grid; grid-template-columns: 3.4rem 1fr; gap: .2rem 1rem; padding: 1.3rem; border-radius: 20px; background: var(--card); border: 1px solid var(--line); text-decoration: none; transition: transform .15s, box-shadow .15s; }
        .app:hover, .app:focus-visible { transform: translateY(-2px); box-shadow: 0 12px 30px color-mix(in oklab, var(--c) 18%, transparent); border-color: color-mix(in oklab, var(--c) 45%, var(--line)); outline: none; }
        .app img { width: 3.4rem; height: 3.4rem; border-radius: 14px; grid-row: span 3; }
        .app h2 { margin: 0; font-size: 1.15rem; letter-spacing: -.02em; } .app p { margin: 0; color: var(--muted); font-size: .94rem; } .app small { color: var(--c); font-weight: 600; font-size: .8rem; letter-spacing: .01em; filter: brightness(1.1); }
        .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1.6rem 2.4rem; padding: 2rem 0 3rem; border-top: 1px solid var(--line); }
        .facts h3 { margin: 0 0 .3rem; font-size: 1.02rem; } .facts p { margin: 0; color: var(--muted); font-size: .95rem; }
        .facts h3::before { content: ""; display: inline-block; width: .6rem; height: .6rem; border-radius: 3px; background: var(--sun); margin-right: .5rem; }
        footer { display: flex; flex-wrap: wrap; gap: .5rem 1.2rem; padding: 1.2rem 0 2rem; color: var(--muted); font-size: .85rem; border-top: 1px solid var(--line); }
    </style>
</head>
<body>
<header>
    <img class="mark" src="icons/favicon.svg" alt="" width="34" height="34">
    <span class="brand"><span class="sav">Sav</span><b>Office</b></span>
    <nav><a href="?lang=it" <?= $it ? 'aria-current="true"' : '' ?>>Italiano</a><a href="?lang=en" <?= $it ? '' : 'aria-current="true"' ?>>English</a></nav>
</header>
<main>
    <section class="hero">
        <h1><?= $L('Un ufficio libero, aperto, tuo.', 'A free, open office of your own.') ?></h1>
        <p><?= $L('Documenti, presentazioni, sondaggi e posti, calendario, attività e newsletter: app che si somigliano e lavorano insieme. Gratis, open source, senza pubblicità né tracciamenti.', 'Documents, presentations, polls and slots, calendar, tasks and newsletters: apps that look alike and work together. Free, open source, no ads, no trackers.') ?></p>
    </section>
    <section class="apps">
        <?php foreach ($apps as [$slug, $name, $color, $itx, $en, $files]): ?>
            <a class="app" href="../<?= $slug ?>/" style="--c:<?= $color ?>">
                <img src="../<?= $slug ?>/icons/favicon.svg" alt="">
                <h2><span class="sav">Sav</span><?= substr($name, 3) ?></h2>
                <p><?= $L($itx, $en) ?></p>
                <small><?= htmlspecialchars($files, ENT_QUOTES, 'UTF-8') ?></small>
            </a>
        <?php endforeach; ?>
    </section>
    <section class="facts">
        <div><h3><?= $L('Insieme', 'Together') ?></h3><p><?= $L('SavSchedules, SavCalendar e SavWhiteboard hanno lo stesso account: le date scelte e i posti prenotati compaiono nel calendario, e dal calendario nasce un sondaggio. Anche SavTasks usa lo stesso account: le attività con scadenza compaiono nel calendario e un’attività può diventare un evento o un sondaggio. Le newsletter programmate di SavNewsletters si vedono nel calendario.', 'SavSchedules, SavCalendar and SavWhiteboard share the account: dates chosen and places booked show up in the calendar, and a poll can start from the calendar. SavTasks shares it too: tasks with a due day show in the calendar, and a task can become an event or a poll. The planned newsletters of SavNewsletters show in the calendar.') ?></p></div>
        <div><h3><?= $L('Un pulsante per tutte', 'One button for all') ?></h3><p><?= $L('In ogni app il pulsante a griglia porta alle altre.', 'In each app the grid button leads to the others.') ?></p></div>
        <div><h3><?= $L('I tuoi file', 'Your files') ?></h3><p><?= $L('Ogni app ha il suo formato (.savdoc, .savsch, .savcal, .savtas, .savnew) e apre e salva quelli standard: Word, PowerPoint, PDF, .ics, CSV.', 'Each app has its own format (.savdoc, .savsch, .savcal, .savtas, .savnew) and opens and saves the standard ones: Word, PowerPoint, PDF, .ics, CSV.') ?></p></div>
    </section>
</main>
<footer>
    <a href="https://www.illerom.eu/">Illerom</a>
    <span><?= $L('di', 'by') ?> <a href="https://www.saveriomorelli.com">Saverio Morelli</a></span>
</footer>
</body>
</html>
