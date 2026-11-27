<?php
/** SavMail — entry point: the app, all in assets/app.js. API: api/. Not listed yet among the apps of SavOffice: noindex until it is. */

declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Frame-Options: SAMEORIGIN');
header('X-Robots-Tag: noindex, nofollow');
// img-src https: only for the pictures of a message the person asked to see (each message is shown in a sandboxed iframe
// without scripts, which inherits this policy); blob: for the preview of an attachment (a PDF in a frame, video, audio,
// read as data by the app); everything else stays on this site
header("Content-Security-Policy: default-src 'self'; script-src 'self' https://www.savaccount.eu; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://www.savaccount.eu; frame-src 'self' about: blob:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self' https://www.savaccount.eu; frame-ancestors 'self'");
$v = static fn(string $f): string => $f . '?v=' . (@filemtime(__DIR__ . '/' . $f) ?: 1);
?><!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
    <title>SavMail</title>
    <meta name="robots" content="noindex, nofollow">
    <meta name="description" content="Your mail, from any provider, in one place: Gmail, Outlook, Yahoo, iCloud, Aruba or any IMAP mailbox. Encrypted settings, no trackers. Part of SavOffice.">
    <meta name="theme-color" content="#8f6500">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <meta property="og:title" content="SavMail">
    <meta property="og:description" content="Your mailboxes, in one place. Part of SavOffice.">
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
    <noscript>SavMail needs JavaScript.</noscript>
</div>
<script defer src="<?= $v('../assets/sav/sav.js') ?>"></script>
<script defer src="<?= $v('../assets/savoffice/savoffice.js') ?>"></script>
<script defer src="../identity/identity.js?v=3"></script>
<script type="module" src="<?= $v('assets/app.js') ?>"></script>
</body>
</html>
