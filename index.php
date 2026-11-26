<?php
/**
 * The only entry point: /it/, /en/, /<lang>/projects/<slug>/, /<lang>/about/, /<lang>/privacy/, /<lang>/typeface/, /sitemap.xml
 * Locally: php -S localhost:8100 index.php
 */
define('ROOT', __DIR__);
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if (PHP_SAPI === 'cli-server') {
    // the folders of the projects and of the API, as Apache serves them
    if (preg_match('#^/([a-z0-9-]+)/#', $path, $m) && !in_array($m[1], ['assets', 'data', 'include', 'pages', 'tools', 'it', 'en'], true) && is_dir(ROOT . '/' . $m[1])) return false;
    if (preg_match('#^/assets/|^/(robots|llms)\.txt$|^/(favicon\.svg|favicon\.ico|site\.webmanifest)$#', $path) && is_file(ROOT . $path)) return false;
}

require ROOT . '/include/lib.php';
require ROOT . '/include/services.php';
$site = require ROOT . '/data/site.php';
$projects = require ROOT . '/data/projects.php';
$strings = require ROOT . '/data/strings.php';

if ($path === '/sitemap.xml') {
    require ROOT . '/pages/sitemap.php';
    return;
}

/** Italian only for browsers that prefer it to English; English for everyone else. */
function preferred_lang(): string
{
    foreach (explode(',', strtolower($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '')) as $l) {
        $l = substr(trim($l), 0, 2);
        if ($l === 'it' || $l === 'en') return $l;
    }
    return 'en';
}

// without the language: the same page, in the language of the browser
if (preg_match('#^/((?:projects/[a-z0-9-]+|about|privacy|status|typeface)/?)?$#', $path, $m)) {
    $rest = isset($m[1]) ? rtrim($m[1], '/') . '/' : '';
    header('Vary: Accept-Language');
    header('Cache-Control: no-cache');
    header('Location: /' . preferred_lang() . '/' . ltrim($rest, '/'), true, 302);
    return;
}
// without the final slash, or the list of projects (which is the home page)
if (preg_match('#^/(it|en)((?:/projects/[a-z0-9-]+|/about|/privacy|/status|/typeface)?)$#', $path, $m)) {
    header('Location: /' . $m[1] . $m[2] . '/', true, 301);
    return;
}
if (preg_match('#^/(it|en)/projects/?$#', $path, $m)) {
    header('Location: /' . $m[1] . '/', true, 301);
    return;
}

$page = 'not-found';
$lang = preg_match('#^/(it|en)/#', $path, $m) ? $m[1] : preferred_lang();
$rest = '';
$slug = '';
if (preg_match('#^/(it|en)/(?:(about|privacy|status|typeface)/|projects/([a-z0-9-]+)/)?$#', $path, $m)) {
    $slug = $m[3] ?? '';
    if ($slug !== '') {
        if (isset($projects[$slug])) {
            $page = 'project';
            $rest = "projects/$slug/";
        }
    } elseif (($m[2] ?? '') !== '') {
        $page = $m[2];
        $rest = $m[2] . '/';
    } else $page = 'home';
}

$t = $strings[$lang];
$base = "/$lang/";
if ($page === 'not-found') http_response_code(404);

[$title, $description] = match ($page) {
    'home' => [$t['home_title'], $t['home_desc']],
    'about' => [$t['about_title'] . ' · Illerom', $t['about_desc']],
    'status' => [$t['st_title'] . ' · Illerom', $t['st_desc']],
    'privacy' => [$t['privacy_title'] . ' · Illerom', $t['privacy_desc']],
    'typeface' => [$t['tf_title'] . ' · Illerom', $t['tf_desc']],
    'project' => [$projects[$slug]['name'] . ' · Illerom', $projects[$slug][$lang][0] . ' ' . $projects[$slug][$lang][1]],
    default => [$t['nf_title'] . ' · Illerom', $t['nf_p']],
};

header('Content-Type: text/html; charset=utf-8');
require ROOT . '/include/head.php';
require ROOT . '/pages/' . $page . '.php';
require ROOT . '/include/foot.php';
