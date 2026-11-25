<?php
/** Layout of the legal pages (privacy.php, terms.php): Italian or English, after the browser or ?lang=. */

declare(strict_types=1);

function doc_lang(): string
{
    $l = (string)($_GET['lang'] ?? '');
    if ($l !== 'it' && $l !== 'en') $l = preg_match('/^\s*it/i', (string)($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '')) ? 'it' : 'en';
    return $l;
}

/** $doc: ['title', 'updated', 'box' (important notice), 'sections' => [[title, html], …]] for each language. */
function doc_page(array $docs, string $self): void
{
    $l = doc_lang();
    $d = $docs[$l];
    $e = static fn(string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    header('Content-Type: text/html; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'none'; frame-ancestors 'self'");
    header('Vary: Accept-Language');
    echo '<!doctype html><html lang="' . $l . '" class="sav-theme-auto"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' . $e($d['title']) . ' · SavPresentations</title>'
        . '<link rel="icon" href="icons/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="../assets/sav/sav.css"><link rel="stylesheet" href="assets/app.css"></head><body class="sav-base">'
        . '<header class="ltop"><a class="brand" href="./"><img src="icons/favicon.svg" width="34" height="34" alt=""><span>Sav<b>Presentations</b></span></a><div class="spacer"></div><a href="' . $self . '?lang=' . ($l === 'it' ? 'en' : 'it') . '">' . ($l === 'it' ? 'English' : 'Italiano') . '</a></header>'
        . '<main class="doc"><h1>' . $e($d['title']) . '</h1><p class="muted">' . $e($d['updated']) . '</p>';
    if (!empty($d['box'])) echo '<p class="box">' . $d['box'] . '</p>';
    foreach ($d['sections'] as [$t, $html]) echo '<h2>' . $e($t) . '</h2>' . $html;
    echo '</main></body></html>';
}
