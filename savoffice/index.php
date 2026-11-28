<?php
/**
 * SavOffice — the page of the suite: what it is, what each app can do, how they work together, privacy and open source.
 * Every app keeps its own folder (../savdocuments/ …) and is independent; they share the look, the SavOffice button
 * (../assets/savoffice/savoffice.js) and, for SavSchedules, SavCalendar, SavTasks, SavForms, SavWhiteboard, SavDiagrams and SavNotes,
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
$site = require dirname(__DIR__) . '/data/site.php';
$contact = $site['contact'];
$desk = (string)($site['savoffice_desktop'] ?? ''); // where the files of SavOffice for the computer are (desktop/)
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

require __DIR__ . '/data.php'; // the apps: colours, what sets each apart, files, how they work together
$app = (string)($_GET['app'] ?? '');
if (!isset($apps[$app])) $app = '';
$pageUrl = 'https://www.illerom.eu/savoffice/' . ($app ? "$app/" : '');
$name = fn(string $slug): string => '<span class="sav">Sav</span>' . $h(substr($projects[$slug]['name'], 3));
$ico = fn(string $slug, int $size = 48): string => '<img src="/' . $slug . '/icons/favicon.svg" alt="" width="' . $size . '" height="' . $size . '">';
?><!doctype html>
<html lang="<?= $lang ?>" class="sav-theme-auto">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
<?php if ($app): $pa = $projects[$app][$lang]; ?>
    <title><?= $h($projects[$app]['name']) ?> — SavOffice</title>
    <meta name="description" content="<?= $h($pa[0] . ' ' . $pa[1]) ?>">
<?php else: ?>
    <title>SavOffice — <?= $L('Un ufficio libero, aperto, tuo', 'A free, open office of your own') ?></title>
    <meta name="description" content="<?= $L('SavOffice: ' . $n . ' app gratuite e open source per file, foto, documenti, fogli di calcolo, libri, presentazioni, calendario, sondaggi, attività, moduli, lavagna, diagrammi, quaderni, posta, contatti, podcast, articoli da leggere, spese condivise e newsletter. Lavorano insieme, senza pubblicità, con i dati nell’Unione europea.', 'SavOffice: ' . $n . ' free, open-source apps for files, photos, documents, spreadsheets, books, presentations, calendar, polls, tasks, forms, whiteboard, diagrams, notebooks, email, contacts, podcasts, articles to read later, shared expenses and newsletters. They work together, with no ads and the data in the European Union.') ?>">
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
$ldOrder = array_values(array_unique(array_merge(['savdocuments', 'savspreadsheets', 'savpresentations'], array_keys($apps)))); // the three main apps first, as on the page
$graph = $app
    ? [$appLd($app), ['@type' => 'BreadcrumbList', 'itemListElement' => [
        ['@type' => 'ListItem', 'position' => 1, 'name' => 'Illerom', 'item' => "$site/$lang/"],
        ['@type' => 'ListItem', 'position' => 2, 'name' => 'SavOffice', 'item' => "$site/savoffice/?lang=$lang"],
        ['@type' => 'ListItem', 'position' => 3, 'name' => $projects[$app]['name'], 'item' => "$site/savoffice/$app/?lang=$lang"]]]]
    : [['@type' => 'CollectionPage', 'url' => "$site/savoffice/?lang=$lang", 'name' => 'SavOffice', 'inLanguage' => $lang, 'isPartOf' => ['@type' => 'WebSite', '@id' => "$site/#website", 'name' => 'Illerom', 'url' => "$site/"],
        'description' => $it ? "SavOffice: $n app gratuite e open source che lavorano insieme, con un solo account e i dati nell’Unione europea." : "SavOffice: $n free, open-source apps that work together, with one account and the data in the European Union.",
        'primaryImageOfPage' => "$site/savoffice/og-$lang.png", 'author' => $person,
        'mainEntity' => ['@type' => 'ItemList', 'name' => 'SavOffice', 'numberOfItems' => $n, 'itemListElement' => array_map(fn($i, $s) => ['@type' => 'ListItem', 'position' => $i + 1, 'item' => $appLd($s)], array_keys($ldOrder), $ldOrder)]]];
?>
    <script type="application/ld+json"><?= json_encode(['@context' => 'https://schema.org', '@graph' => $graph], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?></script>
    <!-- SavComponents (the same copy as Illerom): sav-image enlarges the screenshots -->
<?php $v = fn(string $f) => '/assets/sav/' . $f . '?v=' . @filemtime(dirname(__DIR__) . '/assets/sav/' . $f); ?>
    <link rel="stylesheet" href="<?= $v('sav.css') ?>">
    <script src="<?= $v('sav.js') ?>" defer></script>
    <script src="/savoffice/page.js?v=<?= @filemtime(__DIR__ . '/page.js') ?>" defer></script>
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
        .pills { display: flex; flex-wrap: wrap; gap: .5rem; }
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
        /* three devices, each with a plain dark frame: the computers are 16:10, the phone 18:9 (its 16:9 screenshot between a status
           bar and the home bar, as on a real phone); sizes in cqi, so the frames keep their proportions at every width */
        .collage { position: relative; aspect-ratio: 1.25; container-type: inline-size; }
        .collage figure { position: absolute; margin: 0; background: #1d1d22; box-shadow: 0 30px 60px -22px rgb(20 10 30 / .42), 0 0 0 1px light-dark(rgb(0 0 0 / .08), rgb(255 255 255 / .14)); }
        .collage .pc { aspect-ratio: 16 / 10; padding: .6cqi; border-radius: 1.3cqi; }
        .collage .pc img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; border-radius: .7cqi; background: var(--card); }
        .collage .ph { aspect-ratio: 9 / 18; padding: .6cqi; border-radius: 3.4cqi; }
        .collage .scr { display: flex; flex-direction: column; height: 100%; overflow: hidden; border-radius: 2.8cqi; background: #fff; color: #1d1d22; }
        .collage .scr img { display: block; flex: none; width: 100%; height: auto; }
        .collage .sb { flex: 1.25; display: flex; align-items: center; justify-content: space-between; padding: 0 2.1cqi 0 2.5cqi; font: 650 1.25cqi/1 Inter, system-ui, sans-serif; }
        .collage .sb svg { height: 1.2cqi; width: auto; }
        .collage .hb { flex: 1; display: grid; place-items: center; } .collage .hb::after { content: ""; width: 36%; height: .45cqi; border-radius: 1cqi; background: #1d1d22; }
        .collage .c1 { width: 74%; left: 0; top: 1%; transform: rotate(-2.5deg); }
        .collage .c2 { width: 66%; right: 0; top: 31%; transform: rotate(2deg); }
        .collage .c3 { width: 22%; left: 38%; bottom: 0; transform: rotate(-3deg); }
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
        .why > sav-card { display: block; height: 100%; --sav-card-padding: 1.5rem; }
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
        /* the hub: a ring of apps around SavAccount (5 × 5 up to 16 apps, 6 × 5 up to 18, 6 × 6 up to 20: --hc, --hr set by the page), 3 columns on a phone */
        .hub { display: grid; grid-template-columns: repeat(var(--hc, 5), minmax(0, 1fr)); gap: .6rem; padding: 1.2rem; border-radius: 28px; background: var(--card); border: 1px solid var(--line); }
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
        .hub .core { grid-column: 2 / var(--hc, 5); grid-row: 2 / var(--hr, 5); background: color-mix(in oklab, #66cbff 12%, var(--card)); border-radius: 22px; border: 1px dashed color-mix(in oklab, #3a9fd6 55%, transparent); }
        .hub .core img { width: 72px; height: 72px; } .hub .core b { font-size: 1rem; } .hub .core small { font-size: .85rem; }
        @media (max-width: 560px) { .hub { grid-template-columns: repeat(3, minmax(0, 1fr)); padding: .9rem; } .hub .core { grid-column: 1 / -1; grid-row: 2; padding: 1rem; } .hub .full { display: none; } .hub .short { display: inline; } .hub .n b { white-space: normal; line-height: 1.2; } }
        .flows { list-style: none; padding: 0; margin: 1.4rem 0 0; display: grid; gap: .7rem; }
        .flows li { display: grid; grid-template-columns: auto 1fr; gap: .8rem; align-items: start; padding: .9rem 1rem; border-radius: 16px; background: var(--card); border: 1px solid var(--line); font-size: .96rem; }
        .flows .ic { display: flex; align-items: center; gap: .25rem; } .flows .ic img { width: 26px; height: 26px; } .flows .ic span { color: var(--muted); font-size: .9rem; }
        @media (max-width: 900px) { .together { grid-template-columns: 1fr; } }
        .flows-grid { margin-top: clamp(1.8rem, 4vw, 2.6rem); }
        .flow { display: block; height: 100%; --sav-card-padding: .9rem 1rem; }
        .flow-in { display: grid; grid-template-columns: auto auto auto 1fr; gap: .45rem; align-items: start; }
        .flow-in .ic { display: flex; } .flow-in .ic img { width: 28px; height: 28px; }
        .flow-in .arr { color: var(--muted); font-size: .9rem; line-height: 28px; }
        .flow-in p { margin: 0 0 0 .4rem; font-size: .92rem; line-height: 1.45; color: var(--muted); }
        .flow-in p b { display: block; color: var(--text); font-size: .86rem; margin-bottom: .1rem; }
        @media (max-width: 560px) { .flows-grid { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: 84%; overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain; margin: 1.6rem -1.25rem 0; padding: 0 1.25rem .5rem; scrollbar-width: none; } .flow { scroll-snap-align: start; } } /* on a phone the links scroll sideways */

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
        .open { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.2rem; } @media (max-width: 1000px) { .open { grid-template-columns: minmax(0, 1fr); } }
        .open > sav-card { display: block; height: 100%; --sav-card-padding: 1.8rem; }
        .open h3 { margin: 0 0 .5rem; font-size: 1.25rem; letter-spacing: -.02em; }
        .open .built { order: 3; grid-column: 1 / -1; background: linear-gradient(120deg, color-mix(in oklab, #66cbff 14%, var(--card)), var(--card) 60%); }
        .open .built h3 { display: flex; align-items: center; gap: .7rem; } .open .built h3 img { width: 40px; height: 40px; }
        .open .built p { max-width: 52rem; } .open p { margin: 0 0 1.1rem; color: var(--muted); }
        .fmt { display: flex; flex-wrap: wrap; gap: .4rem; padding: 0; margin: 0; list-style: none; }
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

        /* the apps: the three main ones large (sav-card with its screenshots), then the others in groups (sav-card with rows) */
        :root { --sav-color-primary: #7845f4; --sav-color-on-primary: #fff; --sav-font: Inter, system-ui, sans-serif; }
        .trio { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.2rem; }
        .big { display: block; height: 100%; scroll-margin-top: 6rem; --sav-card-padding: 1.3rem; }
        .big::part(base) { border-top: 4px solid var(--c); }
        .big-shot { position: relative; display: block; padding: 1.4rem 1.4rem 0; overflow: hidden; aspect-ratio: 16 / 11; background: radial-gradient(130% 110% at 0% 0%, color-mix(in oklab, var(--c) 30%, var(--card)), color-mix(in oklab, var(--c) 10%, var(--card)) 70%); }
        .big-desk { display: block; width: 100%; height: auto; border-radius: 10px 10px 0 0; box-shadow: 0 18px 40px -16px rgb(20 10 30 / .45), 0 0 0 1px rgb(0 0 0 / .08); transition: transform .35s var(--sav-easing); }
        .big-phone { position: absolute; right: 1rem; bottom: -12%; width: 23%; height: auto; border-radius: 14px; border: 4px solid #1d1d22; background: #1d1d22; box-shadow: 0 16px 30px -10px rgb(20 10 30 / .5); transition: transform .35s var(--sav-easing); }
        .big:hover .big-desk { transform: translateY(-5px); } .big:hover .big-phone { transform: translateY(-9px) rotate(-2deg); }
        .big-name { display: flex; align-items: center; gap: .85rem; padding-top: .3rem; text-decoration: none; color: inherit; font-weight: inherit; }
        .big-name img { flex: none; width: 56px; height: 56px; }
        .big-name > span { display: grid; gap: .1rem; min-width: 0; }
        .big-name b { font-size: 1.45rem; letter-spacing: -.03em; line-height: 1.1; }
        .big-name small { color: light-dark(var(--c), color-mix(in oklab, var(--c) 45%, #fff)); font-weight: 650; font-size: .95rem; line-height: 1.3; }
        .big-edge { margin: 0 0 1rem; color: var(--muted); font-size: .96rem; line-height: 1.55; }
        .card-acts { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; }
        .more-h { margin: clamp(2.6rem, 6vw, 4rem) 0 1.4rem; }
        .more-h h3 { font-size: clamp(1.4rem, 2.6vw, 1.9rem); line-height: 1.12; letter-spacing: -.035em; margin: 0; font-weight: 800; }
        .groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.2rem; align-items: start; }
        .groups-col { display: grid; gap: 1.2rem; align-content: start; }
        .group { display: block; --sav-card-padding: .55rem; }
        .group-h { display: flex; flex-wrap: wrap; align-items: baseline; gap: .1rem .7rem; padding: .25rem .35rem 0; }
        .group-h h4 { margin: 0; font-size: 1.15rem; letter-spacing: -.02em; }
        .group-h p { margin: 0; color: var(--muted); font-size: .9rem; font-weight: 400; }
        .rows { list-style: none; margin: 0; padding: 0; display: grid; }
        .rows li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .6rem; padding-right: .5rem; border-radius: 14px; scroll-margin-top: 6rem; transition: background .15s; }
        .rows li + li { border-top: 1px solid color-mix(in oklab, var(--line) 70%, transparent); }
        .rows li:hover { background: color-mix(in oklab, var(--c) 7%, transparent); }
        .row { display: flex; align-items: center; gap: .8rem; padding: .65rem .5rem; text-decoration: none; color: inherit; min-width: 0; }
        .row img { flex: none; width: 40px; height: 40px; }
        .row span { min-width: 0; }
        .row b { font-size: 1rem; letter-spacing: -.015em; }
        .row small { display: block; color: var(--muted); font-size: .88rem; line-height: 1.35; }
        .row sav-badge { margin-left: .3rem; vertical-align: 1px; }
        @media (max-width: 1080px) {
            .trio { grid-template-columns: minmax(0, 1fr); }
            .big::part(base) { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); grid-template-rows: auto 1fr auto; }
            .big::part(media) { grid-row: 1 / -1; } .big-shot { height: 100%; aspect-ratio: auto; min-height: 16rem; display: flex; align-items: center; padding: 1.4rem; }
            .big-shot .big-desk { border-radius: 10px; } .big-phone { bottom: 8%; }
        }
        @media (max-width: 820px) { .groups { grid-template-columns: minmax(0, 1fr); } }
        @media (max-width: 640px) { .big-phone { bottom: -12%; } }
        @media (max-width: 640px) {
            .big::part(base) { display: flex; } .big-shot { aspect-ratio: 16 / 11; min-height: 0; display: block; padding: 1rem 1rem 0; }
            .big-name b { font-size: 1.25rem; } .big-name img { width: 48px; height: 48px; }
            .row small { font-size: .84rem; }
        }
        /* together: the apps on a circle around SavAccount; any number of apps fits */
        .orbit { position: relative; width: min(100%, 32rem); aspect-ratio: 1; margin: 0 auto; container-type: inline-size; }
        .orbit::before { content: ""; position: absolute; inset: 11%; border-radius: 50%; border: 1.5px dashed color-mix(in oklab, #3a9fd6 40%, var(--line)); }
        .orbit-core { position: absolute; inset: 27%; display: grid; place-content: center; justify-items: center; gap: .2rem; text-align: center; border-radius: 50%; background: color-mix(in oklab, #66cbff 13%, var(--card)); border: 1px solid color-mix(in oklab, #3a9fd6 30%, var(--line)); padding: 1rem; }
        .orbit-core img { width: 27cqi; height: auto; max-width: 84px; }
        .orbit-core b { font-size: clamp(.9rem, 4cqi, 1.15rem); } .orbit-core small { color: var(--muted); font-size: clamp(.72rem, 3cqi, .88rem); line-height: 1.3; }
        .orbit-app { position: absolute; left: 50%; top: 50%; width: 12cqi; height: 12cqi; margin: -6cqi 0 0 -6cqi; display: grid; place-items: center; border-radius: 28%; background: var(--card); box-shadow: 0 6px 18px -10px rgb(20 10 30 / .35), 0 0 0 1px var(--line);
            transform: rotate(calc(var(--i) * 360deg / var(--n))) translateY(-39cqi) rotate(calc(var(--i) * -360deg / var(--n))); transition: box-shadow .15s; }
        .orbit-app img { width: 72%; height: 72%; }
        .orbit-app:hover, .orbit-app:focus-visible { box-shadow: 0 10px 24px -10px rgb(20 10 30 / .45), 0 0 0 2px var(--violet); z-index: 1; }
        .h3ico { width: 28px; height: 28px; vertical-align: -6px; margin-right: .5rem; }
        footer .ai { flex-basis: 100%; order: 9; font-size: .82rem; }

        /* SavOffice for the computer (desktop/): Mac, Windows or Linux, the one of the visitor (page.js removes hidden) */
        .desk { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: clamp(1.2rem, 3vw, 2.4rem); align-items: center; margin: 0 0 clamp(2rem, 4vw, 3rem); padding: clamp(1.3rem, 3vw, 2.2rem);
            border-radius: var(--r); background: linear-gradient(135deg, color-mix(in oklab, var(--violet) 9%, var(--card)), var(--card) 55%, color-mix(in oklab, var(--pink) 7%, var(--card))); border: 1px solid var(--line); }
        .desk[hidden], .desk-os[hidden] { display: none; }
        .desk-icon { width: clamp(84px, 11vw, 128px); height: auto; filter: drop-shadow(0 14px 24px rgb(40 20 80 / .22)); }
        .desk h2 { margin: .1rem 0 .4rem; font-size: clamp(1.4rem, 2.6vw, 1.9rem); letter-spacing: -.03em; }
        .desk-os > p { margin: 0; color: var(--muted); max-width: 46rem; }
        .desk .ctas { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem 1.2rem; margin: 1.1rem 0 .7rem; }
        .desk-other { color: var(--muted); font-size: .92rem; } .desk-other:hover { color: var(--text); }
        .desk-os > .desk-note { font-size: .82rem; }
        .desk-os > .desk-more { margin-top: .5rem; font-size: .82rem; }
        .desk-more a { color: var(--muted); } .desk-more a:hover { color: var(--text); }
        @media (max-width: 640px) { .desk { grid-template-columns: minmax(0, 1fr); } .desk-icon { width: 76px; } }
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
                <p class="lead"><?= $L('File e cartelle, foto, documenti, fogli di calcolo, libri, presentazioni, calendario, sondaggi, attività, moduli, lavagna, diagrammi, quaderni, posta, contatti, podcast, articoli da leggere, spese condivise e newsletter. Non ' . $nw('it') . ' programmi separati: app pensate per lavorare insieme, gratuite, open source e rispettose dei tuoi dati.', 'Files and folders, photos, documents, spreadsheets, books, presentations, calendar, polls, tasks, forms, whiteboard, diagrams, notebooks, email, contacts, podcasts, articles to read later, shared expenses and newsletters. Not ' . $nw('en') . ' separate programs: apps made to work together, free, open source and respectful of your data.') ?></p>
                <div class="ctas">
                    <sav-button size="lg" href="#apps"><?= $L('Scopri le app', 'Discover the apps') ?></sav-button>
                    <sav-button size="lg" appearance="outline" variant="neutral" href="https://github.com/Sav22999/illerom" icon="code"><?= $L('Codice sorgente', 'Source code') ?></sav-button>
                </div>
                <div class="pills">
                    <sav-tag pill><?= $L('Gratis', 'Free') ?></sav-tag><sav-tag pill>Open source</sav-tag><sav-tag pill><?= $L('Niente pubblicità', 'No ads') ?></sav-tag><sav-tag pill><?= $L('Dati nell’UE', 'Data in the EU') ?></sav-tag>
                </div>
            </div>
            <div class="collage" aria-hidden="true">
                <span class="dot d1"></span><span class="dot d2"></span>
                <figure class="pc c1"><img src="<?= $shot('savpresentations', 'd1.jpg') ?>" alt="" width="1440" height="900"></figure>
                <figure class="pc c2"><img src="<?= $shot('savspreadsheets', 'd2.jpg') ?>" alt="" width="1440" height="900"></figure>
                <figure class="ph c3"><div class="scr"><span class="sb"><span>9:41</span><svg viewBox="0 0 46 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="4.5" y="5.5" width="3" height="6.5" rx="1"/><rect x="9" y="3" width="3" height="9" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/><path d="M27 3.2a9 9 0 0 1 6 2.3l-1.3 1.4a7 7 0 0 0-9.4 0L21 5.5a9 9 0 0 1 6-2.3zm0 3.6a5 5 0 0 1 3.4 1.3L27 11.6l-3.4-3.5A5 5 0 0 1 27 6.8z"/><rect x="36" y="2" width="8.5" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="37.6" y="3.6" width="5.3" height="4.8" rx=".8"/><rect x="45" y="4.5" width="1" height="3" rx=".5"/></svg></span><img src="<?= $shot('savdocuments', '2.jpg') ?>" alt="" width="563" height="1001"><span class="hb"></span></div></figure>
            </div>
        </section>

        <?php if ($desk !== '') {
            // SavOffice for the computer (desktop/): hidden; page.js shows the part of the visitor's system (Mac: Apple silicon or
            // Intel; Linux: .deb or .rpm) and nothing on phones and tablets. Every part also links the other systems.
            $f = [
                'mac' => $desk . 'SavOffice-arm64.dmg', 'intel' => $desk . 'SavOffice-x64.dmg', 'win' => $desk . 'SavOffice-Setup-x64.exe',
                'deb' => $desk . 'SavOffice-x64.deb', 'rpm' => $desk . 'SavOffice-x64.rpm',
            ];
            $about = $L('Un’app sola per tutte le app: installi quelle che usi, si aprono nella loro finestra anche senza connessione, si aggiornano da sole e quando torna la rete sincronizzano tutto. Accedi una volta e sei dentro ovunque.', 'One app for all the apps: install the ones you use, each opens in its own window even without a connection, updates by itself and syncs everything when the network is back. Sign in once and you are in everywhere.');
            $more = fn(array $names): string => '<p class="desk-more">' . $L('Anche per', 'Also for') . ': ' . implode(' · ', array_map(fn($n) => [
                'mac' => '<a href="' . $h($f['mac']) . '">Mac (Apple silicon)</a> · <a href="' . $h($f['intel']) . '">Mac (Intel)</a>',
                'win' => '<a href="' . $h($f['win']) . '">Windows</a>',
                'linux' => '<a href="' . $h($f['deb']) . '">Linux (.deb)</a> · <a href="' . $h($f['rpm']) . '">Linux (.rpm)</a>',
            ][$n], $names)) . '</p>';
        ?>
        <section class="desk" id="desk" aria-labelledby="desk-h" hidden data-arm="<?= $h($f['mac']) ?>" data-intel="<?= $h($f['intel']) ?>" data-deb="<?= $h($f['deb']) ?>" data-rpm="<?= $h($f['rpm']) ?>">
            <img class="desk-icon" src="/savoffice/icons/mac.png" alt="" width="128" height="128">
            <div class="desk-os" data-os="mac" hidden>
                <p class="eyebrow"><?= $L('Nuovo · per Mac', 'New · for Mac') ?></p>
                <h2 id="desk-h"><?= $L('SavOffice sul tuo Mac', 'SavOffice on your Mac') ?></h2>
                <p><?= $about ?></p>
                <div class="ctas">
                    <sav-button size="lg" class="desk-get" href="<?= $h($f['mac']) ?>" icon="download" data-l-a="<?= $L('Scarica per Mac', 'Download for Mac') ?>" data-l-b="<?= $L('Scarica per Mac (Intel)', 'Download for Mac (Intel)') ?>"><?= $L('Scarica per Mac', 'Download for Mac') ?></sav-button>
                    <a class="desk-other" href="<?= $h($f['intel']) ?>" data-l-a="<?= $L('Hai un Mac con Intel?', 'A Mac with Intel?') ?>" data-l-b="<?= $L('Hai un Mac con Apple silicon?', 'A Mac with Apple silicon?') ?>"><?= $L('Hai un Mac con Intel?', 'A Mac with Intel?') ?></a>
                </div>
                <p class="desk-note"><?= $L('Gratis · macOS 12 o successivo · la prima volta che lo apri: Impostazioni di Sistema › Privacy e sicurezza › «Apri comunque».', 'Free · macOS 12 or later · the first time you open it: System Settings › Privacy & Security › “Open Anyway”.') ?></p>
                <?= $more(['win', 'linux']) ?>
            </div>
            <div class="desk-os" data-os="win" hidden>
                <p class="eyebrow"><?= $L('Nuovo · per Windows', 'New · for Windows') ?></p>
                <h2><?= $L('SavOffice sul tuo PC', 'SavOffice on your PC') ?></h2>
                <p><?= $about ?></p>
                <div class="ctas">
                    <sav-button size="lg" href="<?= $h($f['win']) ?>" icon="download"><?= $L('Scarica per Windows', 'Download for Windows') ?></sav-button>
                </div>
                <p class="desk-note"><?= $L('Gratis · Windows 10 o 11, 64 bit · se Windows avvisa che l’app non è riconosciuta: «Ulteriori informazioni» › «Esegui comunque».', 'Free · Windows 10 or 11, 64-bit · if Windows warns that the app is not recognised: “More info” › “Run anyway”.') ?></p>
                <?= $more(['mac', 'linux']) ?>
            </div>
            <div class="desk-os" data-os="linux" hidden>
                <p class="eyebrow"><?= $L('Nuovo · per Linux', 'New · for Linux') ?></p>
                <h2><?= $L('SavOffice sul tuo computer', 'SavOffice on your computer') ?></h2>
                <p><?= $about ?></p>
                <div class="ctas">
                    <sav-button size="lg" class="desk-get" href="<?= $h($f['deb']) ?>" icon="download" data-l-a="<?= $L('Scarica per Linux (.deb)', 'Download for Linux (.deb)') ?>" data-l-b="<?= $L('Scarica per Linux (.rpm)', 'Download for Linux (.rpm)') ?>"><?= $L('Scarica per Linux (.deb)', 'Download for Linux (.deb)') ?></sav-button>
                    <a class="desk-other" href="<?= $h($f['rpm']) ?>" data-l-a="<?= $L('Fedora o openSUSE? Il pacchetto .rpm', 'Fedora or openSUSE? The .rpm package') ?>" data-l-b="<?= $L('Ubuntu, Debian o Mint? Il pacchetto .deb', 'Ubuntu, Debian or Mint? The .deb package') ?>"><?= $L('Fedora o openSUSE? Il pacchetto .rpm', 'Fedora or openSUSE? The .rpm package') ?></a>
                </div>
                <p class="desk-note"><?= $L('Gratis · 64 bit · .deb per Ubuntu, Debian e Mint, .rpm per Fedora e openSUSE · si installa aprendolo con il programma dei pacchetti.', 'Free · 64-bit · .deb for Ubuntu, Debian and Mint, .rpm for Fedora and openSUSE · install it by opening it with the package installer.') ?></p>
                <?= $more(['mac', 'win']) ?>
            </div>
        </section>
        <?php } ?>

        <?php
        // the three apps most people come for, large and first; then the others in groups of what they are for
        $main = ['savdocuments', 'savspreadsheets', 'savpresentations'];
        $groups = [
            'time' => ['Organizzare', 'Organise', 'Il tempo, le cose da fare, le persone e i conti in comune.', 'Time, things to do, people and shared bills.', ['savcalendar', 'savcontacts', 'savschedules', 'savsplits', 'savtasks']],
            'make' => ['Creare', 'Create', 'Libri, diagrammi, una lavagna senza bordi e quaderni a mano.', 'Books, diagrams, a board without edges and handwritten notebooks.', ['savbooks', 'savdiagrams', 'savnotes', 'savwhiteboard']],
            'files' => ['File e media', 'Files and media', 'Lo spazio per i tuoi file, le foto, i podcast e gli articoli da leggere.', 'The space for your files, photos, podcasts and articles to read.', ['savdrive', 'savphotos', 'savpodcasts', 'savreads']],
            'talk' => ['Comunicare', 'Communicate', 'La posta, le newsletter e i moduli per raccogliere risposte.', 'Email, newsletters and forms to collect answers.', ['savforms', 'savmail', 'savnewsletters']],
        ];
        // an app added to data.php and not to a group still shows, in "Create"
        $grouped = array_merge($main, ...array_map(fn($g) => $g[4], array_values($groups)));
        foreach (array_keys($apps) as $s) if (!in_array($s, $grouped, true)) $groups['make'][4][] = $s;
        $keep = $q !== '' ? '?lang=' . $lang : '';
        $fmt = fn(string $f): string => '<li><sav-tag size="sm"' . (str_starts_with($f, '.sav') ? ' variant="primary"' : '') . '>' . $h($f) . '</sav-tag></li>';
        ?>
        <section class="block" id="apps" aria-labelledby="apps-h">
            <div class="head">
                <p class="kicker"><?= $L('Il cuore di SavOffice', 'The heart of SavOffice') ?></p>
                <h2 id="apps-h"><?= $L('Documenti, fogli di calcolo, presentazioni.', 'Documents, spreadsheets, presentations.') ?></h2>
                <p><?= $L('Le tre app di ogni giorno. Aprono e salvano i file di Word, Excel, PowerPoint e LibreOffice, si lavora in più persone sullo stesso file e si continua anche senza connessione.', 'The three everyday apps. They open and save Word, Excel, PowerPoint and LibreOffice files, several people work on the same file, and you carry on without a connection too.') ?></p>
            </div>
            <div class="trio">
                <?php foreach ($main as $slug): [$color, $desk, $phone, $eit, $een] = $apps[$slug]; $P = $projects[$slug]; ?>
                <sav-card class="big" id="<?= $slug ?>" style="--c:<?= $color ?>; --sav-color-primary:<?= $color ?>; --sav-color-on-primary:#fff">
                    <a slot="media" class="big-shot" href="/savoffice/<?= $slug ?>/<?= $keep ?>" tabindex="-1" aria-hidden="true">
                        <img class="big-desk" src="<?= $shot($slug, $desk) ?>" alt="" width="1440" height="900" loading="lazy">
                        <?php if ($has($slug, $phone)): ?><img class="big-phone" src="<?= $shot($slug, $phone) ?>" alt="" width="563" height="1000" loading="lazy"><?php endif; ?>
                    </a>
                    <a slot="header" class="big-name" href="/savoffice/<?= $slug ?>/<?= $keep ?>">
                        <?= $ico($slug, 56) ?>
                        <span><b><?= $name($slug) ?></b><small><?= $h($P[$lang][0]) ?></small></span>
                    </a>
                    <p class="big-edge"><?= $L($eit, $een) ?></p>
                    <ul class="fmt" aria-label="<?= $L('File', 'Files') ?>"><?= implode('', array_map($fmt, $files[$slug] ?? [])) ?></ul>
                    <div slot="footer" class="card-acts">
                        <sav-button href="/<?= $slug ?>/" style="--sav-color-primary:<?= savoffice_solid($color) ?>" label="<?= $L('Apri', 'Open') ?> <?= $h($P['name']) ?>"><?= $L('Apri', 'Open') ?></sav-button>
                        <sav-button appearance="ghost" variant="neutral" href="/savoffice/<?= $slug ?>/<?= $keep ?>"><?= $L('Scheda e schermate', 'Details and screenshots') ?></sav-button>
                    </div>
                </sav-card>
                <?php endforeach; ?>
            </div>

            <div class="head more-h">
                <p class="kicker"><?= $L('E poi', 'And then') ?></p>
                <h3><?= $L('Altre ' . (count($apps) - count($main)) . ' app, per tutto il resto.', (count($apps) - count($main)) . ' more apps, for everything else.') ?></h3>
            </div>
            <?php
            // two columns with about as many apps each (a group never splits): the biggest groups go first, each to the shorter column
            $cols = [[], []]; $len = [0, 0];
            $bySize = $groups; uasort($bySize, fn($x, $y) => count($y[4]) <=> count($x[4]));
            foreach ($bySize as $g => $grp) { if (!$grp[4]) continue; $i = $len[0] <= $len[1] ? 0 : 1; $cols[$i][$g] = $grp; $len[$i] += count($grp[4]) + 1.5; }
            ?>
            <div class="groups">
                <?php foreach ($cols as $col): ?><div class="groups-col">
                <?php foreach ($col as $g => [$git, $gen, $dit, $den, $list]): ?>
                <sav-card class="group" id="g-<?= $g ?>">
                    <div slot="header" class="group-h"><h4><?= $L($git, $gen) ?></h4><p><?= $L($dit, $den) ?></p></div>
                    <ul class="rows">
                        <?php foreach ($list as $slug): $P = $projects[$slug]; ?>
                        <li id="<?= $slug ?>" style="--c:<?= $apps[$slug][0] ?>">
                            <a class="row" href="/savoffice/<?= $slug ?>/<?= $keep ?>">
                                <?= $ico($slug, 40) ?>
                                <span><b><?= $name($slug) ?></b><?php if (!empty($P['invite'])): ?> <sav-badge appearance="soft" pill><?= $L('Su invito', 'By invitation') ?></sav-badge><?php endif; ?><small><?= $h($P[$lang][0]) ?></small></span>
                            </a>
                            <sav-button class="go" size="sm" appearance="outline" variant="neutral" href="/<?= $slug ?>/" label="<?= $L('Apri', 'Open') ?> <?= $h($P['name']) ?>"><?= $L('Apri', 'Open') ?></sav-button>
                        </li>
                        <?php endforeach; ?>
                    </ul>
                </sav-card>
                <?php endforeach; ?>
                </div><?php endforeach; ?>
            </div>
        </section>

        <section class="block" aria-labelledby="why-h">
            <div class="head">
                <p class="kicker"><?= $L('Perché SavOffice', 'Why SavOffice') ?></p>
                <h2 id="why-h"><?= $L('Non “un’altra alternativa”: un ufficio che si tiene insieme.', 'Not “one more alternative”: an office that holds together.') ?></h2>
                <p><?= $L('Ogni app fa bene il suo lavoro, ma il bello arriva quando le usi insieme: le stesse abitudini ovunque, i dati che passano da un’app all’altra, nessuno che guadagna sulle tue informazioni.', 'Each app does its job well, but the best part comes when you use them together: the same habits everywhere, data that moves from one app to the next, and nobody making money on your information.') ?></p>
            </div>
            <div class="why">
                <sav-card><span class="i" style="background:var(--violet)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg></span>
                    <h3><?= $L('Collegate tra loro', 'Connected') ?></h3><p><?= $L('La data scelta in un sondaggio, la scadenza di un modulo o di un’attività, una newsletter programmata: compaiono da sole nel calendario.', 'The date chosen in a poll, the deadline of a form or a task, a planned newsletter: they show up in the calendar by themselves.') ?></p></sav-card>
                <sav-card><span class="i" style="background:var(--green)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
                    <h3><?= $L('Privacy per davvero', 'Privacy for real') ?></h3><p><?= $L('Niente pubblicità, profilazione o statistiche di terzi. Server nell’Unione europea, e i tuoi dati li scarichi o li cancelli quando vuoi.', 'No ads, profiling or third-party analytics. Servers in the European Union, and you download or delete your data whenever you like.') ?></p></sav-card>
                <sav-card><span class="i" style="background:var(--pink)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/></svg></span>
                    <h3><?= $L('Aperte e tue', 'Open and yours') ?></h3><p><?= $L('Il codice è pubblico, e sono costruite con SavComponents, anch’esso open source ed europeo. Apri e salvi i formati di sempre, Word, PowerPoint, PDF, .ics, CSV: non resti mai bloccato.', 'The code is public, and they are built with SavComponents, open source and European too. You open and save the usual formats, Word, PowerPoint, PDF, .ics, CSV: you are never locked in.') ?></p></sav-card>
                <sav-card><span class="i" style="background:#1f56d1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="14" height="10" rx="2"/><rect x="16" y="9" width="6" height="11" rx="1.5"/><path d="M6 18h6"/></svg></span>
                    <h3><?= $L('Ovunque, subito', 'Anywhere, at once') ?></h3><p><?= $L('Si aprono nel browser di computer, tablet e telefono, senza installare nulla, e si installano come app. Documenti e presentazioni funzionano anche offline.', 'They open in the browser of a computer, tablet or phone, with nothing to install, and install as apps. Documents and presentations also work offline.') ?></p></sav-card>
            </div>
        </section>

        <section class="block" id="together" aria-labelledby="tog-h">
            <div class="together">
                <div>
                    <p class="kicker"><?= $L('Insieme', 'Together') ?></p>
                    <h2 id="tog-h"><?= $L('Un solo account, tutto al suo posto.', 'One account, everything in its place.') ?></h2>
                    <p style="color:var(--muted);font-size:1.06rem;margin:0"><?= $L('SavSchedules, SavCalendar, SavTasks, SavForms, SavWhiteboard, SavDiagrams, SavNotes, SavMail, SavPodcasts, SavReads, SavSplits e SavContacts condividono lo stesso account, e SavPhotos quello di SavDrive; con SavAccount entri in tutte e ' . $nw('it') . ' con un solo accesso. E il pulsante a griglia, in ogni app, ti porta alle altre.', 'SavSchedules, SavCalendar, SavTasks, SavForms, SavWhiteboard, SavDiagrams, SavNotes, SavMail, SavPodcasts, SavReads, SavSplits and SavContacts share the same account, and SavPhotos the one of SavDrive; with SavAccount you get into all ' . $nw('en') . ' with a single sign-in. And the grid button, in every app, takes you to the others.') ?></p>
                </div>
                <?php // SavAccount in the middle, the one sign-in of all of them; the apps on a circle around it, in alphabetical order (any number fits) ?>
                <div class="orbit" style="--n:<?= $n ?>">
                    <div class="orbit-core"><img src="/assets/projects/savaccount.png" alt="" width="72" height="72"><b>SavAccount</b><small><?= $L('un solo accesso per tutte', 'one sign-in for all of them') ?></small></div>
                    <?php $i = 0; foreach ($apps as $slug => $a): ?>
                        <a class="orbit-app" style="--i:<?= $i++ ?>" href="/savoffice/<?= $slug ?>/<?= $keep ?>" title="<?= $h($projects[$slug]['name'] . ' · ' . $projects[$slug][$lang][0]) ?>" aria-label="<?= $h($projects[$slug]['name']) ?>"><?= $ico($slug, 44) ?></a>
                    <?php endforeach; ?>
                </div>
            </div>
            <?php
            // how the apps work together: one link for each app, from data.php ($works). The one chosen goes to the app
            // that has been chosen least so far, and never back along a pair already shown, so every app is there.
            $used = []; $pairs = []; $flows = [];
            foreach ($apps as $slug => $a) {
                $opts = array_values(array_filter($works[$slug] ?? [], fn($w) => isset($apps[$w[0]]) && !isset($pairs[$w[0] . '>' . $slug])));
                if (!$opts) continue;
                usort($opts, fn($x, $y) => ($used[$x[0]] ?? 0) <=> ($used[$y[0]] ?? 0));
                $w = $opts[0];
                $used[$w[0]] = ($used[$w[0]] ?? 0) + 1; $pairs[$slug . '>' . $w[0]] = true;
                $flows[] = [$slug, $w[0], $L($w[1], $w[2])];
            }
            ?>
            <sav-grid class="flows-grid" min="19rem" gap=".8rem">
                <?php foreach ($flows as [$from, $to, $text]): ?>
                    <sav-card class="flow">
                        <div class="flow-in">
                            <a class="ic" href="/savoffice/<?= $from ?>/<?= $keep ?>" title="<?= $h($projects[$from]['name']) ?>"><?= $ico($from, 28) ?></a><span class="arr" aria-hidden="true">→</span><a class="ic" href="/savoffice/<?= $to ?>/<?= $keep ?>" title="<?= $h($projects[$to]['name']) ?>"><?= $ico($to, 28) ?></a>
                            <p><b><?= $h($projects[$from]['name']) ?> · <?= $h($projects[$to]['name']) ?></b><?= $text ?></p>
                        </div>
                    </sav-card>
                <?php endforeach; ?>
            </sav-grid>
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
            </div>
            <div class="open">
                <sav-card>
                    <h3><?= $L('Codice pubblico', 'Public code') ?></h3>
                    <p><?= $L('Ogni app è open source: leggi come funziona, segnala un problema o proponi un miglioramento.', 'Every app is open source: read how it works, report a problem or suggest an improvement.') ?></p>
                    <sav-button appearance="outline" variant="neutral" href="https://github.com/Sav22999/illerom" icon="code">github.com/Sav22999/illerom</sav-button>
                </sav-card>
                <sav-card>
                    <h3><img src="/assets/projects/savcomponents.png" alt="" width="32" height="32" class="h3ico"><?= $L('Costruite con SavComponents', 'Built with SavComponents') ?></h3>
                    <p><?= $L('Pulsanti, campi, finestre e selettori di tutte le app vengono da SavComponents: componenti web liberi ed europei, senza dipendenze. Per questo si somigliano e funzionano bene con tastiera e lettori di schermo.', 'The buttons, fields, dialogs and pickers of every app come from SavComponents: free, European web components with no dependencies. That is why they look alike and work well with the keyboard and screen readers.') ?></p>
                    <sav-button appearance="outline" variant="neutral" href="https://www.savcomponents.com/" icon-end="external">savcomponents.com</sav-button>
                </sav-card>
                <sav-card>
                    <h3><?= $L('Formati aperti e di sempre', 'Open and familiar formats') ?></h3>
                    <p><?= $L('Ogni app ha un suo file che conserva tutto, e apre e salva quelli che usano tutti.', 'Each app has a file of its own that keeps everything, and it opens and saves the ones everybody uses.') ?></p>
                    <div class="fmt">
                        <?php $own = array_unique(array_filter(array_merge(...array_values($files)), fn($f) => str_starts_with($f, '.sav'))); sort($own); foreach ($own as $f): ?><sav-tag size="sm" variant="primary"><?= $f ?></sav-tag><?php endforeach; ?>
                        <?php foreach (['.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp', 'PDF', 'EPUB', '.ics', 'vCard', 'CSV', 'OPML'] as $f): ?><sav-tag size="sm"><?= $f ?></sav-tag><?php endforeach; ?>
                    </div>
                </sav-card>
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
                <sav-button size="lg" href="https://www.saveriomorelli.com/donate/" target="_blank" icon="heart"><?= $L('Fai una donazione', 'Make a donation') ?></sav-button>
            </div>
        </section>

        <section class="end" aria-labelledby="end-h">
            <h2 id="end-h"><?= $L('Comincia da quella che ti serve oggi.', 'Start with the one you need today.') ?></h2>
            <p><?= $L('Sono gratuite e non serve installare nulla. Le altre saranno lì, quando ti serviranno.', 'They are free and there is nothing to install. The others will be there when you need them.') ?></p>
            <div class="ctas"><sav-button size="lg" href="#apps"><?= $L('Scegli un’app', 'Pick an app') ?></sav-button></div>
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
        <?php if (!$app): // said once, on the page of the suite; not on the page of each app ?>
        <span class="ai" title="<?= $L('Claude, di Anthropic', 'Claude, by Anthropic') ?>"><?= $L('Applicazioni realizzate con il supporto dell’intelligenza artificiale', 'Apps made with the support of artificial intelligence') ?></span>
        <?php endif; ?>
        <span><?= $L('Un progetto di', 'A project by') ?> <a href="https://www.saveriomorelli.com">Saverio Morelli</a></span>
    </div>
</footer>
</body>
</html>
