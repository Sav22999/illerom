<?php
/**
 * SavNewsletters — entry point: the app (sign-in, groups, editor), all in assets/app.js. Part of SavOffice.
 * Public pages: subscribe.php, unsubscribe.php, terms.php, widget.js. API: api/. Cron: cron/savnewsletters-*.php.
 */

declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Frame-Options: SAMEORIGIN');
header("Content-Security-Policy: frame-ancestors 'self'");
$v = static fn(string $f): string => $f . '?v=' . (@filemtime(__DIR__ . '/' . $f) ?: 1);
// the switcher of SavOffice (the other apps of the suite): only when it is on the site
$office = is_file(__DIR__ . '/../assets/savoffice/savoffice.js');
?><!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>SavNewsletters</title>
    <meta name="description"
          content="Write, approve and send newsletters as a team: drag-and-drop editor, approval workflow, subscribers in every language, a subscription page and a widget for your site. Part of SavOffice.">
    <meta name="theme-color" content="#c2307a">
    <meta property="og:title" content="SavNewsletters">
    <meta property="og:description" content="Newsletters your team writes, approves and sends together.">
    <meta property="og:image" content="icons/icon-512.png">
    <link rel="icon" href="icons/favicon.svg" type="image/svg+xml">
    <link rel="icon" href="icons/favicon-32.png" sizes="32x32" type="image/png">
    <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="stylesheet" href="<?= $v('../assets/sav/sav.css') ?>">
    <link rel="stylesheet" href="../identity/identity.css?v=2">
    <link rel="stylesheet" href="assets/app.css?v=23">
</head>
<body>
<div id="app">
    <noscript>SavNewsletters needs JavaScript.</noscript>
</div>
<script defer src="<?= $v('../assets/sav/sav.js') ?>"></script>
<?php if ($office): ?>
<script defer src="<?= $v('../assets/savoffice/savoffice.js') ?>"></script>
<?php endif ?>
<script defer src="../identity/identity.js?v=3"></script>
<script type="module" src="assets/app.js?v=23"></script>
</body>
</html>
