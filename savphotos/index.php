<?php
/** SavPhotos — entry point: the app, all in assets/app.js. Its API is the one of SavDrive (../savdrive/api/?r=photos.*). */

declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Frame-Options: SAMEORIGIN');
// not in the list of the apps of SavOffice yet (being tried): search engines leave it out too. See README, "Opening it to everybody".
header('X-Robots-Tag: noindex, nofollow');
header("Content-Security-Policy: default-src 'self'; script-src 'self' https://www.savaccount.eu; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://www.savaccount.eu https://savcomponents.com https://www.savcomponents.com; media-src 'self' blob:; frame-src 'self'; font-src 'self' data:; connect-src 'self' https://www.savaccount.eu; object-src 'none'; base-uri 'self'; form-action 'self' https://www.savaccount.eu; frame-ancestors 'self'");
$v = static fn(string $f): string => $f . '?v=' . (@filemtime(__DIR__ . '/' . $f) ?: 1);
?><!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
    <title>SavPhotos</title>
    <meta name="description" content="The photos and videos of your SavDrive, day by day: the backup of your phone, albums and links to share them.">
    <meta name="robots" content="noindex, nofollow">
    <meta name="theme-color" content="#9a5f00">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <link rel="icon" href="icons/favicon.svg" type="image/svg+xml">
    <link rel="icon" href="icons/favicon-32.png" sizes="32x32" type="image/png">
    <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="stylesheet" href="<?= $v('../assets/sav/sav.css') ?>">
    <link rel="stylesheet" href="<?= $v('assets/app.css') ?>">
</head>
<body>
<div id="app">
    <noscript>SavPhotos needs JavaScript.</noscript>
</div>
<script defer src="<?= $v('../assets/sav/sav.js') ?>"></script>
<script defer src="<?= $v('../assets/savoffice/savoffice.js') ?>"></script>
<script type="module" src="<?= $v('assets/app.js') ?>"></script>
</body>
</html>
