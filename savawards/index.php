<?php
/** SavAwards — entry point: the app, all in assets/app.js. API: api/. Public certificates: certificate.php (c/<CODE>). */

declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Frame-Options: SAMEORIGIN');
// Nothing is loaded from other sites, except the SavAccount sign-in button and page, and the flags of SavComponents
header("Content-Security-Policy: default-src 'self'; script-src 'self' https://www.savaccount.eu; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://www.savaccount.eu https://savcomponents.com https://www.savcomponents.com; font-src 'self'; connect-src 'self' https://www.savaccount.eu; object-src 'none'; base-uri 'self'; form-action 'self' https://www.savaccount.eu; frame-ancestors 'self'");
$v = static fn(string $f): string => $f . '?v=' . (@filemtime(__DIR__ . '/' . $f) ?: 1);
$it = false; // English only
?><!doctype html>
<html lang="<?= $it ? 'it' : 'en' ?>" class="sav-style-glass">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>SavAwards</title>
    <meta name="description" content="<?= $it ? 'Recensioni indipendenti e awards annuali per software e servizi europei, liberi e open source: voti da 0 a 10 su criteri pubblici, dispositivi di test dichiarati, certificati verificabili.' : 'Independent reviews and yearly awards for European, free and open-source software and services: scores from 0 to 10 on public criteria, stated test devices, verifiable certificates.' ?>">
    <meta name="theme-color" content="#1b3aa8">
    <meta property="og:title" content="SavAwards">
    <meta property="og:description" content="<?= $it ? 'Il software europeo e libero, analizzato a fondo.' : 'European and free software, tested in depth.' ?>">
    <meta property="og:image" content="icons/icon-512.png">
    <link rel="icon" href="icons/favicon.svg" type="image/svg+xml">
    <link rel="icon" href="icons/favicon-32.png" sizes="32x32" type="image/png">
    <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="alternate" type="application/rss+xml" title="SavAwards" href="feed.php">
    <link rel="alternate" type="application/feed+json" title="SavAwards" href="feed.php?format=json">
    <link rel="stylesheet" href="<?= $v('../assets/sav/sav.css') ?>">
    <link rel="stylesheet" href="<?= $v('../identity/identity.css') ?>">
    <link rel="stylesheet" href="<?= $v('assets/app.css') ?>">
</head>
<body>
<a class="skip" href="#main"><?= $it ? 'Vai al contenuto' : 'Skip to content' ?></a>
<div id="app">
    <noscript>SavAwards needs JavaScript. <a href="certificate.php">Verify a certificate</a> · <a href="feed.php">RSS</a></noscript>
</div>
<script defer src="<?= $v('../assets/sav/sav.js') ?>"></script>
<script defer src="<?= $v('../identity/identity.js') ?>"></script>
<script type="module" src="<?= $v('assets/main.js') ?>"></script>
</body>
</html>
