<?php
/** SavDrive — entry point: the app, all in assets/app.js. API: api/. */

declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Frame-Options: SAMEORIGIN');
header("Content-Security-Policy: default-src 'self'; script-src 'self' https://www.savaccount.eu; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://www.savaccount.eu https://savcomponents.com https://www.savcomponents.com; media-src 'self' blob:; frame-src 'self'; font-src 'self' data:; connect-src 'self' https://www.savaccount.eu; object-src 'none'; base-uri 'self'; form-action 'self' https://www.savaccount.eu; frame-ancestors 'self'");
$v = static fn(string $f): string => $f . '?v=' . (@filemtime(__DIR__ . '/' . $f) ?: 1);
require_once __DIR__ . '/lib/space.php';
$space = savspace_size(savspace_default()); // the space of a new account, as the admins chose it
?><!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
    <title>SavDrive</title>
    <meta name="description" content="A free, open drive for your files: <?= $space ?> for each account, folders, previews, links to share and the files of SavOffice.">
    <meta name="theme-color" content="#0a6fb0">
    <meta name="referrer" content="strict-origin-when-cross-origin">
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
    <noscript>SavDrive needs JavaScript.</noscript>
</div>
<script defer src="<?= $v('../assets/sav/sav.js') ?>"></script>
<script defer src="<?= $v('../assets/savoffice/savoffice.js') ?>"></script>
<script defer src="../identity/identity.js?v=3"></script>
<script type="module" src="<?= $v('assets/app.js') ?>"></script>
</body>
</html>
