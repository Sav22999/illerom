<?php
/** SavSchedules — entry point: the app, all in assets/app.js. API: api/. */

declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Frame-Options: SAMEORIGIN');
header("Content-Security-Policy: default-src 'self'; script-src 'self' https://www.savaccount.eu; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://www.savaccount.eu https://savcomponents.com https://www.savcomponents.com; font-src 'self'; connect-src 'self' https://www.savaccount.eu; object-src 'none'; base-uri 'self'; form-action 'self' https://www.savaccount.eu; frame-ancestors 'self'");
$v = static fn(string $f): string => $f . '?v=' . (@filemtime(__DIR__ . '/' . $f) ?: 1);
?><!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
    <title>SavSchedules</title>
    <meta name="description" content="Free, open date polls and slot booking: find the date of a meeting, or let people book a time nobody else can take. No account needed to answer.">
    <meta name="theme-color" content="#1f56d1">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <meta property="og:title" content="SavSchedules">
    <meta property="og:description" content="Find the date. Hand out the slots. No account needed to answer.">
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
    <noscript>SavSchedules needs JavaScript.</noscript>
</div>
<script defer src="<?= $v('../assets/sav/sav.js') ?>"></script>
<script defer src="<?= $v('../assets/savoffice/savoffice.js') ?>"></script>
<script defer src="../identity/identity.js?v=3"></script>
<script type="module" src="<?= $v('assets/app.js') ?>"></script>
</body>
</html>
