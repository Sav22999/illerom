<?php
/** SavBooks — entry point: the app, all in assets/app.js. API: api/. Pictures of SavDocuments are read from ../savdocuments/api/ (same origin). */

declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Frame-Options: SAMEORIGIN');
header("Content-Security-Policy: default-src 'self'; script-src 'self' https://www.savaccount.eu; style-src 'self' 'unsafe-inline' https://fonts.bunny.net; img-src 'self' data: blob: https://api.openverse.org https://upload.wikimedia.org https://thumb.wikimedia.org https://www.savaccount.eu https://savcomponents.com https://www.savcomponents.com; font-src 'self' data: blob: https://fonts.bunny.net; connect-src 'self' https://www.savaccount.eu https://fonts.bunny.net; object-src 'none'; base-uri 'self'; form-action 'self' https://www.savaccount.eu; frame-ancestors 'self'");
$v = static fn(string $f): string => $f . '?v=' . (@filemtime(__DIR__ . '/' . $f) ?: 1);
?><!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
    <title>SavBooks</title>
    <meta name="description"
          content="Write books chapter by chapter, design the cover and publish them as EPUB. Free and open: start from SavDocuments, Word or an e-book.">
    <meta name="theme-color" content="#8a2346">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <link rel="icon" href="icons/favicon.svg" type="image/svg+xml">
    <link rel="icon" href="icons/favicon-32.png" sizes="32x32" type="image/png">
    <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="stylesheet" href="<?= $v('../assets/sav/sav.css') ?>">
    <link rel="stylesheet" href="../identity/identity.css?v=2">
    <link rel="stylesheet" href="<?= $v('assets/app.css') ?>">
    <link rel="stylesheet" href="<?= $v('assets/doc.css') ?>">
    <link rel="stylesheet" href="<?= $v('assets/fonts.css') ?>">
</head>
<body>
<div id="app">
    <noscript>SavBooks needs JavaScript.</noscript>
</div>
<script defer src="<?= $v('../assets/sav/sav.js') ?>"></script>
<script defer src="<?= $v('../assets/savoffice/savoffice.js') ?>"></script>
<script defer src="../identity/identity.js?v=3"></script>
<script type="module" src="assets/app.js"></script>
</body>
</html>
