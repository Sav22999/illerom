<?php
/** SavPresentations — entry point: the app, all in assets/main.js. Pages: privacy.php, terms.php. API: api/. */

declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Frame-Options: SAMEORIGIN');
header("Content-Security-Policy: default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client https://www.savaccount.eu; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style https://fonts.bunny.net; img-src 'self' data: blob: https://*.googleusercontent.com https://www.savaccount.eu https://savcomponents.com https://www.savcomponents.com; media-src 'self' https: blob:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://accounts.google.com/gsi/; connect-src 'self' blob: https://accounts.google.com/gsi/ https://www.savaccount.eu https://fonts.bunny.net; font-src 'self' data: blob: https://fonts.bunny.net; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; manifest-src 'self'; worker-src 'self'");
header('Cross-Origin-Opener-Policy: same-origin-allow-popups');
$v = static fn(string $f): string => $f . '?v=' . (@filemtime(__DIR__ . '/' . $f) ?: 1);
?><!doctype html>
<html lang="en" class="sav-theme-auto">
<head>
    <meta charset="utf-8">
    <meta name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
    <title>SavPresentations</title>
    <meta name="description"
          content="A free, open source presentation editor: themes that already look good, live collaboration, precise sharing, PDF, PowerPoint and OpenDocument files.">
    <meta name="theme-color" content="#f7f5fc" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#110d1c" media="(prefers-color-scheme: dark)">
    <meta property="og:title" content="SavPresentations">
    <meta property="og:description" content="Presentations, without the weight.">
    <meta property="og:image" content="https://www.illerom.eu/savpresentations/icons/icon-512.png">
    <link rel="icon" href="icons/favicon.svg" type="image/svg+xml">
    <link rel="icon" href="icons/favicon-32.png" sizes="32x32" type="image/png">
    <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="stylesheet" href="<?= $v('../assets/sav/sav.css') ?>">
    <link rel="stylesheet" href="../identity/identity.css?v=2">
    <link rel="stylesheet" href="<?= $v('assets/app.css') ?>">
    <script src="<?= $v('../assets/sav/sav.js') ?>" defer></script>
    <script src="<?= $v('../assets/savoffice/savoffice.js') ?>" defer></script>
    <script src="<?= $v('assets/icons.js') ?>" defer></script>
    <script src="../identity/identity.js?v=3" defer></script>
    <?php foreach (['core', 'i18n', 'themes', 'render', 'shapes', 'richtext'] as $m): ?>
        <link rel="modulepreload" href="assets/<?= $m ?>.js">
    <?php endforeach; ?>
    <script type="module" src="assets/main.js"></script>
</head>
<body class="sav-base">
<div id="app">
    <noscript>SavPresentations needs JavaScript.</noscript>
</div>
</body>
</html>
