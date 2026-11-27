<?php
/**
 * SavPodcasts — entry point: the app, all in assets/app.js. API: api/.
 * Not listed among the apps of SavOffice yet (it is being tested): it is not in the grid of the apps, in the page of
 * SavOffice, in data/projects.php or in the sitemap, and search engines are asked not to index it (see README, "Going public").
 */

declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Frame-Options: SAMEORIGIN');
header('X-Robots-Tag: noindex, nofollow');
// media-src: the audio plays from the publishers' own addresses (any); pictures only from here (the artwork passes through api/?r=img)
header("Content-Security-Policy: default-src 'self'; script-src 'self' https://www.savaccount.eu; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://www.savaccount.eu https://savcomponents.com https://www.savcomponents.com; media-src https: http:; font-src 'self' data:; connect-src 'self' https://www.savaccount.eu; object-src 'none'; base-uri 'self'; form-action 'self' https://www.savaccount.eu; frame-ancestors 'self'");
$v = static fn(string $f): string => $f . '?v=' . (@filemtime(__DIR__ . '/' . $f) ?: 1);
?><!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
    <title>SavPodcasts</title>
    <meta name="robots" content="noindex, nofollow">
    <meta name="description" content="Free, open podcast player: podcasts from their own public feeds, found in open catalogues, with your queue and the position synced on every device. Part of SavOffice.">
    <meta name="theme-color" content="#3b4b63">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <meta property="og:title" content="SavPodcasts">
    <meta property="og:description" content="Podcasts, from where they really live. Part of SavOffice.">
    <meta property="og:image" content="icons/icon-512.png">
    <link rel="icon" href="icons/favicon.svg" type="image/svg+xml">
    <link rel="icon" href="icons/favicon-32.png" sizes="32x32" type="image/png">
    <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="stylesheet" href="<?= $v('../assets/sav/sav.css') ?>">
    <link rel="stylesheet" href="../identity/identity.css?v=2">
    <link rel="stylesheet" href="<?= $v('assets/app.css') ?>">
</head>
<body>
<div id="app">
    <noscript>SavPodcasts needs JavaScript.</noscript>
</div>
<div id="dock" class="dock" hidden></div>
<script defer src="<?= $v('../assets/sav/sav.js') ?>"></script>
<script defer src="<?= $v('../assets/savoffice/savoffice.js') ?>"></script>
<script defer src="../identity/identity.js?v=3"></script>
<script type="module" src="<?= $v('assets/app.js') ?>"></script>
</body>
</html>
