<?php
/** SavDocuments — entry point: the app, all in assets/app.js. API: api/. */

declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Frame-Options: SAMEORIGIN');
header("Content-Security-Policy: default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client https://www.savaccount.eu; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; img-src 'self' data: blob: https://api.openverse.org https://upload.wikimedia.org https://thumb.wikimedia.org https://www.savaccount.eu; font-src 'self'; connect-src 'self' https://accounts.google.com/gsi/ https://www.savaccount.eu; frame-src https://accounts.google.com/gsi/; object-src 'none'; base-uri 'self'; form-action 'self' https://www.savaccount.eu; frame-ancestors 'self'");
?><!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
    <title>SavDocuments</title>
    <meta name="description" content="A free, open word processor: real pages, tables, images, Word files and people writing together.">
    <meta name="theme-color" content="#0f6e56">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <link rel="icon" href="icons/favicon.svg" type="image/svg+xml">
    <link rel="icon" href="icons/favicon-32.png" sizes="32x32" type="image/png">
    <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="stylesheet" href="../assets/sav/sav.css">
    <link rel="stylesheet" href="../identity/identity.css?v=2">
    <link rel="stylesheet" href="assets/app.css">
    <link rel="stylesheet" href="assets/doc.css">
</head>
<body>
<div id="app"><noscript>SavDocuments needs JavaScript.</noscript></div>
<script defer src="../assets/sav/sav.js"></script>
<script defer src="../identity/identity.js?v=3"></script>
<script type="module" src="assets/app.js"></script>
</body>
</html>
