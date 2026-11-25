<!doctype html>
<html lang="<?= $lang ?>" class="sav-theme-auto sav-style-tilt">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title><?= e($title) ?></title>
    <meta name="description" content="<?= e($description) ?>">
    <meta name="author" content="Saverio Morelli">
<?php if ($page === 'not-found'): ?>
    <meta name="robots" content="noindex">
<?php else: ?>
    <link rel="canonical" href="<?= e($site['url'] . $base . $rest) ?>">
    <link rel="alternate" hreflang="it" href="<?= e($site['url'] . '/it/' . $rest) ?>">
    <link rel="alternate" hreflang="en" href="<?= e($site['url'] . '/en/' . $rest) ?>">
    <link rel="alternate" hreflang="x-default" href="<?= e($site['url'] . '/' . $rest) ?>">
    <meta property="og:url" content="<?= e($site['url'] . $base . $rest) ?>">
<?php endif; ?>
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Illerom">
    <meta property="og:title" content="<?= e($title) ?>">
    <meta property="og:description" content="<?= e($description) ?>">
    <meta property="og:image" content="<?= e($site['url']) ?>/assets/brand/og.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:locale" content="<?= $t['locale'] ?>">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="theme-color" content="#f4f1f7" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#170f1c" media="(prefers-color-scheme: dark)">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="icon" href="<?= asset('brand/icon-192.png') ?>" sizes="192x192" type="image/png">
    <link rel="apple-touch-icon" href="<?= asset('brand/apple-touch-icon.png') ?>">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="preload" href="/assets/fonts/stack-sans-notch.ttf" as="font" type="font/ttf" crossorigin>
    <script src="<?= asset('theme.js') ?>"></script>
    <link rel="stylesheet" href="<?= asset('sav/sav.css') ?>">
    <link rel="stylesheet" href="<?= asset('style.css') ?>">
    <script src="<?= asset('sav/sav.js') ?>" defer></script>
    <script src="<?= asset('app.js') ?>" defer></script>
<?php if ($page === 'status'): ?>
    <script src="<?= asset('status.js') ?>" defer></script>
<?php endif; ?>
<?php if ($page === 'project' && ($p = $projects[$slug])['url'] !== ''): ?>
    <script type="application/ld+json"><?= json_encode([
        '@context' => 'https://schema.org', '@type' => $p['cat'] === 'games' ? 'VideoGame' : 'WebApplication',
        'name' => $p['name'], 'description' => $p[$lang][0], 'inLanguage' => $p['langs'],
        'url' => is_external(app_url($slug, $p)) ? app_url($slug, $p) : $site['url'] . app_url($slug, $p),
        'author' => ['@type' => 'Person', 'name' => 'Saverio Morelli', 'url' => $site['personal']],
        'offers' => ['@type' => 'Offer', 'price' => '0', 'priceCurrency' => 'EUR'],
        'operatingSystem' => $p['play'] ? 'Web, Android' : 'Web', 'applicationCategory' => $p['cat'] === 'games' ? 'GameApplication' : 'UtilitiesApplication',
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?></script>
<?php endif; ?>
</head>
<body class="sav-base page-<?= $page ?>">
<a class="skip" href="#main"><?= e($t['skip']) ?></a>
<header class="top">
    <div class="wrap top-in">
        <a class="brand" href="<?= $base ?>" aria-label="<?= e($t['home_label']) ?>"><?= mark() ?><span>illerom</span></a>
        <nav class="nav" aria-label="<?= e($t['nav_label']) ?>">
            <a href="<?= $base ?>"<?= $page === 'home' ? ' aria-current="page"' : ($page === 'project' ? ' aria-current="true"' : '') ?>><span><?= e($t['nav_projects']) ?></span></a>
            <a href="<?= $base ?>about/"<?= $page === 'about' ? ' aria-current="page"' : '' ?>><span><?= e($t['nav_about']) ?></span></a>
        </nav>
        <div class="tools">
            <a class="lang" href="/<?= $t['other'] . '/' . $rest ?>" hreflang="<?= $t['other'] ?>" lang="<?= $t['other'] ?>" aria-label="<?= e($t['other_name']) ?>" title="<?= e($t['other_name']) ?>"><?= strtoupper($t['other']) ?></a>
            <button class="theme" id="theme" type="button" aria-label="<?= e($t['theme']) ?>" title="<?= e($t['theme']) ?>"><?= icon('sun') . icon('moon') ?></button>
        </div>
    </div>
</header>
<main id="main" tabindex="-1">
